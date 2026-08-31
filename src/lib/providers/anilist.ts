import { config } from "../config";
import { StreamAnError } from "../errors";
import { requestJson } from "../http";
import { buildId, normTitle, splitId, type ProviderAdapter } from "./types";
import type { AiringStatus, Anime, AnimeType, ListResult } from "../types";

/**
 * PROVIDER 5 (metadata) — AniList GraphQL.
 * Dokumentasi: https://docs.anilist.co — endpoint publik `https://graphql.anilist.co`,
 * TANPA API key, CORS terbuka, ±90 req/menit (dibatasi per-provider di http.ts).
 *
 * TIER: metadata. TIDAK menyuplai episode-stream (service layer menjamin ini):
 * karena itu `operations` TIDAK memuat "sources", dan TIDAK ada `episodes` —
 * AniList tidak punya daftar episode, hanya `streamingEpisodes` (tautan eksternal),
 * yang tidak sah dijadikan sumber playback.
 */

/* ══════════════════════════════ GraphQL ═══════════════════════════════════ */

const MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native }
  coverImage { extraLarge large }
  bannerImage
  description(asHtml: false)
  format
  status
  episodes
  duration
  season
  seasonYear
  averageScore
  popularity
  favourites
  source
  genres
  studios { edges { isMain node { name } } }
  startDate { year month day }
  endDate { year month day }
  trailer { id site thumbnail }
`;

const PAGE_QUERY = `
  query ($page: Int, $perPage: Int, $search: String, $sort: [MediaSort], $season: MediaSeason, $seasonYear: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage lastPage hasNextPage }
      media(type: ANIME, isAdult: false, search: $search, sort: $sort, season: $season, seasonYear: $seasonYear) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

const MEDIA_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      ${MEDIA_FIELDS}
    }
  }
`;

/* ════════════════════════ Response types + guards ═════════════════════════ */

interface AniListDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

interface AniListMedia {
  id: number;
  idMal?: number | null;
  title?: { romaji?: string | null; english?: string | null; native?: string | null } | null;
  coverImage?: { extraLarge?: string | null; large?: string | null } | null;
  bannerImage?: string | null;
  description?: string | null;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  duration?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  favourites?: number | null;
  source?: string | null;
  genres?: (string | null)[] | null;
  studios?: { edges?: { isMain?: boolean | null; node?: { name?: string | null } | null }[] | null } | null;
  startDate?: AniListDate | null;
  endDate?: AniListDate | null;
  /** AniList hanya menyimpan id + site video (mis. youtube); TIDAK ada embed url. */
  trailer?: { id?: string | null; site?: string | null; thumbnail?: string | null } | null;
}

interface AniListPage {
  pageInfo?: { total?: number | null; currentPage?: number | null; lastPage?: number | null; hasNextPage?: boolean | null } | null;
  media?: unknown[] | null;
}

/** Runtime guard — jangan mempercayai bentuk hasil JSON.parse. */
function isAniListMedia(x: unknown): x is AniListMedia {
  return typeof x === "object" && x !== null && typeof (x as AniListMedia).id === "number";
}

/* ══════════════════════════════ Normalizers ══════════════════════════════ */

const normStatus = (raw?: string | null): AiringStatus => {
  const s = (raw ?? "").toUpperCase();
  if (s === "RELEASING") return "airing";
  if (s === "FINISHED") return "finished";
  if (s === "NOT_YET_RELEASED") return "upcoming";
  return "unknown"; // HIATUS / CANCELLED
};

const STATUS_LABEL: Record<string, string> = {
  RELEASING: "Currently Airing",
  FINISHED: "Finished Airing",
  NOT_YET_RELEASED: "Not Yet Aired",
  HIATUS: "Hiatus",
  CANCELLED: "Cancelled",
};

// Sama seperti Jikan: singkatan (TV/OVA/ONA) tetap uppercase, sisanya Title Case.
const normType = (raw?: string | null): AnimeType => {
  const t = (raw ?? "").toUpperCase();
  if (t === "TV" || t === "TV_SHORT") return "TV";
  if (t === "OVA") return "OVA";
  if (t === "ONA") return "ONA";
  if (t === "MOVIE") return "Movie";
  if (t === "SPECIAL") return "Special";
  if (t === "MUSIC") return "Music";
  return "Unknown";
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(d?: AniListDate | null): string | undefined {
  if (!d?.year) return undefined;
  const hasMonth = typeof d.month === "number" && d.month >= 1 && d.month <= 12;
  const hasDay = hasMonth && typeof d.day === "number" && d.day > 0;
  if (hasDay) return `${MONTHS[(d.month as number) - 1]} ${d.day}, ${d.year}`;
  if (hasMonth) return `${MONTHS[(d.month as number) - 1]} ${d.year}`;
  return String(d.year);
}

const stripHtml = (s?: string | null): string => (s ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/**
 * AniList `MediaTrailer` hanya berisi { id, site, thumbnail }; untuk site=youtube,
 * `id` adalah video id. Embed URL dibangun ke host nocookie yang ADA di allowlist
 * (src/lib/security.ts) — bukan host asing dari respons provider.
 */
function normalizeTrailer(t?: AniListMedia["trailer"]): Anime["trailer"] {
  const site = (t?.site ?? "").toLowerCase();
  const id = t?.id?.trim();
  if (!id) return undefined;
  if (site.includes("youtube")) {
    return { youtubeId: id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, url: `https://www.youtube.com/watch?v=${id}` };
  }
  // situs lain (mis. dailymotion) tidak punya embed yang bisa diturunkan dari id
  // secara aman → biarkan UI tidak menampilkan trailer sama sekali.
  return undefined;
}

function normalize(m: AniListMedia): Anime {
  const main = m.title?.romaji ?? m.title?.english ?? `AniList #${m.id}`;
  const alt = [m.title?.romaji, m.title?.english, m.title?.native].filter((s): s is string => Boolean(s));
  const start = formatDate(m.startDate);
  const end = formatDate(m.endDate);
  const studios = (m.studios?.edges ?? []).filter((e) => e?.node?.name);
  return {
    id: buildId("anilist", m.id),
    provider: "anilist",
    url: `https://anilist.co/anime/${m.id}`,
    title: main,
    titleEnglish: m.title?.english ?? undefined,
    titleNative: m.title?.native ?? undefined,
    altTitles: alt.filter((t) => t && t !== main).slice(0, 4),
    poster: m.coverImage?.extraLarge ?? m.coverImage?.large ?? undefined,
    cover: m.bannerImage ?? undefined,
    synopsis: stripHtml(m.description) || undefined,
    genres: (m.genres ?? []).filter((g): g is string => Boolean(g)).slice(0, 8),
    status: normStatus(m.status),
    statusLabel: m.status ? (STATUS_LABEL[m.status] ?? m.status) : undefined,
    type: normType(m.format),
    // AniList memakai skala 0–100; kontrak internal kita 0–10 (sama seperti MAL).
    rating: typeof m.averageScore === "number" && m.averageScore > 0 ? Math.round(m.averageScore) / 10 : undefined,
    episodesTotal: m.episodes ?? undefined,
    episodeDurationMin: m.duration ?? undefined,
    year: m.seasonYear ?? m.startDate?.year ?? undefined,
    season: m.season ? m.season.toLowerCase() : undefined,
    studio: studios.find((s) => s.isMain)?.node?.name ?? studios[0]?.node?.name ?? undefined,
    airedLabel: start ? `${start}${end ? ` – ${end}` : " – "}` : undefined,
    popularity: m.popularity ?? undefined,
    members: m.favourites ?? undefined,
    source: m.source ?? undefined,
    trailer: normalizeTrailer(m.trailer),
  };
}

/* ══════════════════════════════ HTTP helpers ══════════════════════════════ */

interface AniListVariables {
  page?: number;
  perPage?: number;
  search?: string;
  sort?: string | string[];
  season?: string;
  seasonYear?: number;
  id?: number;
}

async function gql<T>(query: string, variables: AniListVariables, op: "trending" | "latest" | "search" | "detail", signal?: AbortSignal): Promise<T> {
  // POST GraphQL — tidak ada key; rate limit dipegang limiter di http.ts.
  return requestJson<T>(config.anilistBaseUrl, {
    op,
    provider: "anilist",
    method: "POST",
    body: { query, variables },
    headers: { "Content-Type": "application/json" },
    signal,
  });
}

function readPage(raw: { data?: { Page?: AniListPage | null } } | null | undefined): { items: Anime[]; page: number; hasNext: boolean; total?: number } {
  const page = raw?.data?.Page;
  if (!page) throw new StreamAnError("INVALID_RESPONSE", "Respons AniList tidak memuat blok Page.", { provider: "anilist" });
  const items = (page.media ?? []).filter(isAniListMedia).map(normalize);
  return {
    items,
    page: page.pageInfo?.currentPage ?? 1,
    hasNext: page.pageInfo?.hasNextPage === true,
    total: page.pageInfo?.total ?? undefined,
  };
}

async function fetchPage(variables: AniListVariables, op: "trending" | "latest" | "search", signal?: AbortSignal): Promise<ListResult> {
  const raw = await gql<{ data?: { Page?: AniListPage | null } }>(PAGE_QUERY, variables, op, signal);
  return readPage(raw);
}

async function fetchMedia(nativeId: string, signal?: AbortSignal): Promise<Anime> {
  const id = Number(nativeId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new StreamAnError("NOT_FOUND", `id AniList "${nativeId}" bukan angka valid.`, { provider: "anilist" });
  }
  const raw = await gql<{ data?: { Media?: unknown } }>(MEDIA_QUERY, { id }, "detail", signal);
  const media = raw?.data?.Media;
  if (!isAniListMedia(media)) throw new StreamAnError("NOT_FOUND", "Media tidak ditemukan di AniList.", { provider: "anilist" });
  return normalize(media);
}

/** Confidence identity resolution (judul + tahun) — ambang sama dengan Jikan. */
function scoreCandidate(m: AniListMedia, target: string, year?: number): number {
  const hay = [m.title?.romaji, m.title?.english, m.title?.native].filter((s): s is string => Boolean(s)).map(normTitle);
  const hasExact = hay.some((h) => h === target);
  const hasPartial = hay.some((h) => h.length >= 3 && (h.includes(target) || target.includes(h)));
  let score = 0;
  if (hasExact) score += 4;
  else if (hasPartial) score += 2;
  const y = m.seasonYear ?? m.startDate?.year ?? undefined;
  if (typeof year === "number" && y === year) score += 2;
  else if (typeof year === "number" && y && Math.abs(year - y) <= 1) score += 1;
  return score;
}

/* ══════════════════════════════ Adapter ══════════════════════════════════ */

export const anilistProvider: ProviderAdapter = {
  id: "anilist",
  label: "AniList · GraphQL (metadata)",
  homepage: "https://docs.anilist.co",
  kind: "official-public",
  tier: "metadata",
  // Tanpa "episodes" & "sources": AniList tidak punya keduanya (lihat catatan di atas).
  operations: ["trending", "latest", "search", "detail"],
  availability: () => ({ online: true, reason: "Endpoint GraphQL publik, tanpa key, CORS terbuka." }),

  async trending(limit, signal) {
    return fetchPage({ page: 1, perPage: Math.min(50, limit), sort: ["TRENDING_DESC"] }, "trending", signal);
  },

  async latest(limit, signal) {
    // AniList tidak punya "season now"; ID_DESC = entri paling baru dibubuhkan.
    // Ini deviasi sadar dari makna "latest" di Jikan (urut tanggal tayang) —
    // tetap chronological-ish dan tidak pernah dipakai untuk playback.
    return fetchPage({ page: 1, perPage: Math.min(50, limit), sort: ["ID_DESC"] }, "latest", signal);
  },

  async search(query, page, signal) {
    return fetchPage({ page, perPage: 24, search: query.slice(0, 80), sort: ["POPULARITY_DESC"] }, "search", signal);
  },

  async detail(ref, signal) {
    const { prefix, nativeId } = splitId(ref.id);
    if (prefix && prefix !== "anilist") throw new StreamAnError("NOT_FOUND", "ID bukan milik AniList.", { provider: "anilist" });
    return fetchMedia(nativeId, signal);
  },

  async detailByTitle(ref, signal) {
    // Identity resolution: cari judul, skoring di objek mentah (judul + tahun),
    // tolak kalau confidence < 3 — ambang yang sama dengan adapter Jikan.
    if (!ref.title || ref.title.trim().length < 2) {
      throw new StreamAnError("NOT_FOUND", "Judul terlalu pendek untuk identity resolution.", { provider: "anilist" });
    }
    const raw = await gql<{ data?: { Page?: AniListPage | null } }>(
      PAGE_QUERY,
      { page: 1, perPage: 6, search: ref.title.slice(0, 80), sort: ["SEARCH_MATCH"] },
      "search",
      signal,
    );
    const media = (raw?.data?.Page?.media ?? []).filter(isAniListMedia);
    if (!media.length) throw new StreamAnError("NOT_FOUND", "Anime tidak ditemukan di AniList.", { provider: "anilist" });
    const target = normTitle(ref.title);
    const best = media.map((m) => ({ m, score: scoreCandidate(m, target, ref.year) })).sort((x, y) => y.score - x.score)[0];
    if (!best || best.score < 3) {
      throw new StreamAnError("NOT_FOUND", "Tidak ada kandidat dengan confidence cukup di AniList (judul/tahun tidak match).", { provider: "anilist" });
    }
    return normalize(best.m);
  },
};



