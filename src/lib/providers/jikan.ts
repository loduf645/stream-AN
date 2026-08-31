import { config } from "../config";
import { StreamAnError } from "../errors";
import { requestJson } from "../http";
import type { Anime, AiringStatus, AnimeType, Episode } from "../types";
import { buildId, splitId, type ProviderAdapter } from "./types";

/**
 * PROVIDER 1 (metadata) — Jikan (unofficial-but-public MyAnimeList API).
 * Dokumentasi: https://docs.api.jikan.moe — tanpa API key, CORS terbuka,
 * rate limit 3 req/dtk & 60 req/menit (dibatasi di http.ts).
 *
 * TIER: metadata. TIDAK menyuplai episode-stream/video.
 */

/* ══════════════════════════ Response types + guards ═══════════════════════ */

interface JikanImage {
  image_url?: string;
  small_image_url?: string;
  large_image_url?: string;
}

interface JikanAnime {
  mal_id: number;
  url?: string;
  title?: string;
  title_english?: string | null;
  title_japanese?: string | null;
  titles?: { type?: string; title?: string }[];
  images?: { jpg?: JikanImage; webp?: JikanImage };
  trailer?: { youtube_id?: string | null; url?: string | null; embed_url?: string | null };
  synopsis?: string | null;
  type?: string | null;
  status?: string | null;
  rating?: string | null;
  score?: number | null;
  scored_by?: number | null;
  popularity?: number | null;
  members?: number | null;
  source?: string | null;
  episodes?: number | null;
  duration_min?: number | null;
  year?: number | null;
  season?: string | null;
  airing?: boolean | null;
  aired?: { string?: string; from?: string | null; to?: string | null };
  duration?: string | null;
  /** BUG SEBELUMNYA: sempat pakai `genre` (singular). Yang benar adalah `genres`. */
  genres?: { mal_id?: number; name?: string }[];
  studios?: { name?: string }[];
}

interface JikanPagination {
  last_visible_page?: number;
  has_next_page?: boolean;
  current_page?: number;
  items?: { count?: number; total?: number; per_page?: number };
}

interface JikanEpisode {
  mal_id?: number;
  title?: string | null;
  title_japanese?: string | null;
  aired?: string | null;
  filler?: boolean | null;
  recap?: boolean | null;
  url?: string | null;
}

/** Runtime guard — jangan mempercayai `T[]` dari `JSON.parse`. */
function isJikanAnime(x: unknown): x is JikanAnime {
  return typeof x === "object" && x !== null && typeof (x as JikanAnime).mal_id === "number";
}
function isJikanEpisode(x: unknown): x is JikanEpisode {
  if (typeof x !== "object" || x === null) return false;
  const e = x as JikanEpisode;
  return (
    (e.mal_id === undefined || typeof e.mal_id === "number") &&
    (e.title === undefined || e.title === null || typeof e.title === "string")
  );
}

/* ══════════════════════════════ Normalizers ══════════════════════════════ */

const normStatus = (raw?: string | null, airing?: boolean | null): AiringStatus => {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("currently airing") || airing === true) return "airing";
  if (s.includes("finished airing")) return "finished";
  if (s.includes("not yet aired") || s.includes("upcoming")) return "upcoming";
  return "unknown";
};

// FIX: "TV", "OVA", "ONA" adalah singkatan yang harus tetap uppercase.
// Sebelumnya: t.charAt(0) + t.slice(1).toLowerCase() menghasilkan "Tv"/"Ova"/"Ona"
// yang tidak cocok dengan union type AnimeType.
const normType = (raw?: string | null): AnimeType => {
  const t = (raw ?? "").toUpperCase();
  if (t === "TV") return "TV";
  if (t === "OVA") return "OVA";
  if (t === "ONA") return "ONA";
  if (t === "MOVIE") return "Movie";
  if (t === "SPECIAL") return "Special";
  if (t === "MUSIC") return "Music";
  return "Unknown";
};

const stripHtml = (s?: string | null) =>
  (s ?? "").replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();

const normTitle = (s?: string | null) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, " ").trim();

/** Confidence untuk identity resolution lintas provider (judul + tahun). */
function scoreCandidate(a: JikanAnime, target: string, year?: number): number {
  const hay = [a.title, a.title_english, a.title_japanese, ...(a.titles ?? []).map((t) => t.title)]
    .filter((s): s is string => Boolean(s))
    .map(normTitle);
  const hasExact = hay.some((h) => h === target);
  const hasPartial = hay.some((h) => (h.length >= 3 && (h.includes(target) || target.includes(h))));
  let score = 0;
  if (hasExact) score += 4;
  else if (hasPartial) score += 2;
  if (typeof year === "number" && a.year === year) score += 2;
  else if (typeof year === "number" && a.year && Math.abs(a.year - year) <= 1) score += 1;
  return score;
}

function normalize(a: JikanAnime): Anime {
  const alt = (a.titles ?? []).map((t) => t.title).filter(Boolean) as string[];
  return {
    id: buildId("jikan", a.mal_id),
    provider: "jikan",
    url: a.url,
    title: a.title ?? a.title_english ?? `MAL #${a.mal_id}`,
    titleEnglish: a.title_english ?? undefined,
    titleNative: a.title_japanese ?? undefined,
    altTitles: alt.filter((t) => t && t !== a.title && t !== a.title_english).slice(0, 4),
    poster: a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? a.images?.webp?.large_image_url,
    cover: a.images?.jpg?.large_image_url ?? undefined,
    synopsis: stripHtml(a.synopsis) || undefined,
    /* FIX bug: gunakan `genres` (plural). Sebelumnya `a.genre` selalu undefined. */
    genres: (a.genres ?? []).map((g) => g.name ?? "").filter(Boolean).slice(0, 8),
    status: normStatus(a.status, a.airing),
    statusLabel: a.status ?? undefined,
    type: normType(a.type),
    rating: typeof a.score === "number" && a.score > 0 ? a.score : undefined,
    scoreCount: a.scored_by ?? undefined,
    ageRating: a.rating ?? undefined,
    episodesTotal: a.episodes ?? undefined,
    episodeDurationMin: a.duration_min ?? (typeof a.duration === "string" ? Number(a.duration.match(/(\d+)/)?.[1] ?? NaN) || undefined : undefined),
    year: a.year ?? undefined,
    season: a.season ?? undefined,
    studio: a.studios?.[0]?.name ?? undefined,
    airedLabel: a.aired?.string ?? undefined,
    popularity: a.popularity ?? undefined,
    members: a.members ?? undefined,
    source: a.source ?? undefined,
    trailer:
      a.trailer?.youtube_id || a.trailer?.embed_url
        ? { youtubeId: a.trailer.youtube_id ?? undefined, embedUrl: a.trailer.embed_url ?? undefined, url: a.trailer.url ?? undefined }
        : undefined,
  };
}

/* ══════════════════════════════ HTTP helpers ══════════════════════════════ */

async function fetchAnimeList(path: string, signal?: AbortSignal): Promise<{ items: Anime[]; pagination?: JikanPagination }> {
  const raw = await requestJson<{ data?: unknown; pagination?: JikanPagination }>(`${config.jikanBaseUrl}${path}`, {
    op: "search",
    provider: "jikan",
    signal,
  });
  if (raw?.data === undefined) {
    throw new StreamAnError("INVALID_RESPONSE", "Format daftar anime Jikan tidak dikenali.", { provider: "jikan" });
  }
  const arr = Array.isArray(raw.data) ? raw.data : [raw.data];
  const valid = arr.filter(isJikanAnime);
  return { items: valid.map(normalize), pagination: raw.pagination };
}

async function fetchSingleAnime(nativeId: string, signal?: AbortSignal): Promise<Anime> {
  const raw = await requestJson<{ data?: unknown }>(`${config.jikanBaseUrl}/anime/${encodeURIComponent(nativeId)}/full`, {
    op: "detail",
    provider: "jikan",
    signal,
  });
  const data = Array.isArray(raw?.data) ? raw.data[0] : raw?.data;
  if (!isJikanAnime(data)) throw new StreamAnError("INVALID_RESPONSE", "Data detail anime tidak lengkap.", { provider: "jikan" });
  return normalize(data);
}

/** Ambil SEMUA halaman episode (paginated di sisi Jikan; max 100 per page). */
async function fetchAllEpisodes(nativeId: string, animeId: string, signal?: AbortSignal): Promise<Episode[]> {
  const MAX_PAGES = 20; // 20 × 100 = 2000 episode; cukup untuk One Piece/Detective Conan.
  const out: Episode[] = [];
  let page = 1;
  let seen = 0;
  while (page <= MAX_PAGES) {
    const raw = await requestJson<{ data?: unknown; pagination?: JikanPagination }>(
      `${config.jikanBaseUrl}/anime/${encodeURIComponent(nativeId)}/episodes?page=${page}`,
      { op: "episodes", provider: "jikan", signal },
    );
    if (raw?.data === undefined) throw new StreamAnError("INVALID_RESPONSE", "Respons episode Jikan tidak dikenali.", { provider: "jikan" });
    const arr: unknown[] = Array.isArray(raw.data) ? raw.data : [];
    const valid = arr.filter(isJikanEpisode);
    // Sanity: Jikan mengembalikan urutan episode kronologis; nomor = offset global.
    for (const e of valid) {
      seen += 1;
      // Nomor episode: nyata dari MAL bila tersedia, fallback ke urutan global.
      // (Note: `mal_id` di endpoint /episodes adalah episode number itu sendiri.)
      const num = typeof e.mal_id === "number" && e.mal_id > 0 ? e.mal_id : seen;
      out.push({
        // Internal id deterministic — TIDAK diklaim sebagai native id provider.
        id: `${animeId}:ep${num}`,
        animeId,
        providerId: "jikan",
        number: num,
        title: e.title ?? undefined,
        titleNative: e.title_japanese ?? undefined,
        aired: e.aired ?? undefined,
        filler: Boolean(e.filler),
        recap: Boolean(e.recap),
        source: {
          provider: "jikan",
          nativeEpisodeId: typeof e.mal_id === "number" ? String(e.mal_id) : undefined,
          url: e.url ?? undefined,
        },
      });
    }
    const hasNext = Boolean(raw.pagination?.has_next_page);
    if (!hasNext || valid.length === 0) break;
    page += 1;
  }
  return out;
}

/* ══════════════════════════════ Adapter ═══════════════════════════════════ */

export const jikanProvider: ProviderAdapter = {
  id: "jikan",
  label: "Jikan · MyAnimeList (metadata)",
  homepage: "https://docs.api.jikan.moe",
  kind: "official-public",
  tier: "metadata",
  // NB: `sources` operation dihapus. Jikan TIDAK menyuplai episode-stream.
  // Trailer resmi ada di `Anime.trailer` dan ditampilkan terpisah di UI —
  // BUKAN sebagai StreamSource playback.
  operations: ["trending", "latest", "search", "detail", "episodes"],
  availability: () => ({ online: true, reason: "API publik tanpa key, CORS terbuka." }),

  async trending(limit, signal) {
    // `/top/anime?filter=bypopularity` = paling populer sekarang (ranking, bukan chronological).
    const r = await fetchAnimeList(`/top/anime?filter=bypopularity&limit=${limit}&sfw=true`, signal);
    return { items: r.items, page: 1, hasNext: Boolean(r.pagination?.has_next_page), total: r.pagination?.items?.total };
  },

  async latest(limit, signal) {
    // "Baru rilis musim ini" — chronological. `/seasons/now` mengembalikan
    // anime musim berjalan; sortir DESC berdasarkan tanggal tayang perdana
    // (aired.from). Kalau tanggal tidak tersedia, item ditaruh belakang.
    const r = await fetchAnimeList(`/seasons/now?limit=${limit}&sfw=true`, signal);
    const items = [...r.items].sort((a, b) => {
      const at = a.airedLabel ? Date.parse(a.airedLabel) : NaN;
      const bt = b.airedLabel ? Date.parse(b.airedLabel) : NaN;
      const aok = Number.isFinite(at);
      const bok = Number.isFinite(bt);
      if (aok && bok) return bt - at;
      if (aok) return -1;
      if (bok) return 1;
      return 0;
    });
    return { items, page: 1, hasNext: Boolean(r.pagination?.has_next_page), total: r.pagination?.items?.total };
  },

  async search(query, page, signal) {
    const q = encodeURIComponent(query.slice(0, 80));
    const r = await fetchAnimeList(`/anime?q=${q}&limit=24&page=${page}&sfw=true&order_by=members&sort=desc`, signal);
    return { items: r.items, page, hasNext: Boolean(r.pagination?.has_next_page), total: r.pagination?.items?.total };
  },

  async detail(ref, signal) {
    const { prefix, nativeId } = splitId(ref.id);
    if (prefix && prefix !== "jikan") throw new StreamAnError("NOT_FOUND", "ID bukan milik Jikan/MAL.", { provider: "jikan" });
    return fetchSingleAnime(nativeId, signal);
  },

  async detailByTitle(ref, signal) {
    // Identity resolution aman: ambil beberapa kandidat, scoring dengan
    // title + year, tolak bila confidence tidak cukup.
    if (!ref.title || ref.title.trim().length < 2) {
      throw new StreamAnError("NOT_FOUND", "Judul terlalu pendek untuk identity resolution.", { provider: "jikan" });
    }
    const q = encodeURIComponent(ref.title.slice(0, 200));
    const raw = await requestJson<{ data?: unknown }>(`${config.jikanBaseUrl}/anime?q=${q}&limit=6&sfw=true`, {
      op: "search",
      provider: "jikan",
      signal,
    });
    const arr = (Array.isArray(raw?.data) ? raw.data : []).filter(isJikanAnime);
    if (!arr.length) throw new StreamAnError("NOT_FOUND", "Anime tidak ditemukan di Jikan.", { provider: "jikan" });
    const target = normTitle(ref.title);
    const best = arr.map((a) => ({ a, score: scoreCandidate(a, target, ref.year) })).sort((x, y) => y.score - x.score)[0];
    // Threshold: >=3 = judul match kuat, atau exact match tanpa tahun.
    if (!best || best.score < 3) {
      throw new StreamAnError("NOT_FOUND", "Tidak ada kandidat dengan confidence cukup di Jikan (judul/tahun tidak match).", { provider: "jikan" });
    }
    return normalize(best.a);
  },

  async episodes(ref, signal) {
    const { prefix, nativeId } = splitId(ref.id);
    if (prefix && prefix !== "jikan") throw new StreamAnError("NOT_FOUND", "Episode hanya tersedia untuk id Jikan.", { provider: "jikan" });
    return fetchAllEpisodes(nativeId, ref.id, signal);
  },
};



