import { config, hasGateway } from "../config";
import { StreamAnError } from "../errors";
import { requestJson } from "../http";
import { normTitle, type ProviderAdapter, type ProviderAvailability } from "./types";
import type { Anime, AnimeRef, Episode, ListResult, ProviderId, StreamSource } from "../types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FACTORY CONTENT PROVIDER (Otakudesu / KuramaAnime / Oploverz) — STREAMAN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Provider konten TIDAK mengikis HTML situs pihak ketiga. Frontend bicara ke
 * backend internal berlisensi (variabel `VITE_STREAMAN_GATEWAY_URL`); adapter di
 * bawah ini HANYA memetakan bentuk JSON gateway ke kontrak internal.
 *
 * Kontrak yang diharapkan dari gateway (didokumentasikan juga di README):
 *
 *   GET {gateway}/v1/{provider}/trending?limit={n}
 *   GET {gateway}/v1/{provider}/latest?limit={n}
 *   GET {gateway}/v1/{provider}/search?q={query}&page={n}
 *   GET {gateway}/v1/{provider}/anime/{nativeId}
 *   GET {gateway}/v1/{provider}/anime/{nativeId}/episodes
 *   GET {gateway}/v1/{provider}/anime/{nativeId}/episode/{nativeEpisodeId}/sources
 *
 * Amplop respons diterima dalam dua bentuk: `{ items: [...] }` / `{ anime: {...} }`
 * / `{ episodes: [...] }` / `{ sources: [...] }`, atau array/objek telanjang.
 *
 * SAAT GATEWAY KOSONG (default build publik): `availability()` → offline, sehingga
 * service layer me-skip provider ini tanpa satu request pun keluar (lihat
 * `run()` di service.ts). Inilah alasan aplikasi tetap jalan: katalog & detail
 * dilayani Jikan/AniList, sementara Watch menampilkan trailer resmi saja.
 */

/** Isi respons mentah dari gateway — semuanya opsional sampai terbukti valid. */
interface GatewayAnime {
  id?: string | number;
  title?: string;
  titleEnglish?: string;
  titleNative?: string;
  altTitles?: unknown;
  poster?: string;
  cover?: string;
  synopsis?: string;
  type?: string;
  status?: string;
  year?: number;
  episodes?: number;
  durationMin?: number;
  rating?: number;
  genres?: unknown;
  studio?: string;
  url?: string;
  trailer?: { youtubeId?: string; embedUrl?: string; url?: string };
}

interface GatewayEpisode {
  id?: string | number;
  number?: number;
  title?: string;
  titleNative?: string;
  aired?: string;
  filler?: boolean;
  recap?: boolean;
  url?: string;
}

interface GatewaySource {
  id?: string;
  kind?: string;
  quality?: string;
  embedUrl?: string;
  fileUrl?: string;
  authorized?: boolean;
  note?: string;
}

/* ═══════════════════════════════ guards ═══════════════════════════════════ */

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === "string" && Boolean(x.trim()));

function isGatewayAnime(x: unknown): x is GatewayAnime {
  if (typeof x !== "object" || x === null) return false;
  const a = x as GatewayAnime;
  return (typeof a.id === "string" || typeof a.id === "number") && typeof a.title === "string" && a.title.length > 0;
}

function isGatewayEpisode(x: unknown): x is GatewayEpisode {
  if (typeof x !== "object" || x === null) return false;
  const e = x as GatewayEpisode;
  return typeof e.number === "number" && Number.isFinite(e.number);
}

function isGatewaySource(x: unknown): x is GatewaySource {
  if (typeof x !== "object" || x === null) return false;
  const s = x as GatewaySource;
  return Boolean(str(s.embedUrl) || str(s.fileUrl));
}

/* ═══════════════════════════ normalizer (mentah → kanonik) ═════════════════ */

function normalizeAnime(provider: ProviderId, a: GatewayAnime): Anime {
  const nativeId = String(a.id);
  const type = (a.type ?? "").toUpperCase();
  return {
    id: `${provider}:${nativeId}`,
    provider,
    url: str(a.url),
    title: a.title ?? `Anime ${nativeId}`,
    titleEnglish: str(a.titleEnglish),
    titleNative: str(a.titleNative),
    altTitles: strings(a.altTitles).slice(0, 4),
    poster: str(a.poster),
    cover: str(a.cover),
    synopsis: str(a.synopsis),
    genres: strings(a.genres).slice(0, 8),
    status: /airing|rilis|ongoing/i.test(a.status ?? "") ? "airing" : /finished|selesai|completed/i.test(a.status ?? "") ? "finished" : "unknown",
    statusLabel: str(a.status),
    type: type === "TV" || type === "OVA" || type === "ONA" ? type : type === "MOVIE" ? "Movie" : type === "SPECIAL" ? "Special" : type === "MUSIC" ? "Music" : "Unknown",
    rating: num(a.rating),
    episodesTotal: num(a.episodes),
    episodeDurationMin: num(a.durationMin),
    year: num(a.year),
    studio: str(a.studio),
    trailer:
      str(a.trailer?.embedUrl) || str(a.trailer?.youtubeId)
        ? { youtubeId: str(a.trailer?.youtubeId), embedUrl: str(a.trailer?.embedUrl), url: str(a.trailer?.url) }
        : undefined,
  };
}

/** Nomor episode = kunci; `source.nativeEpisodeId` = id asli gateway (untuk memanggil /sources). */
function normalizeEpisode(provider: ProviderId, animeId: string, e: GatewayEpisode, index: number): Episode {
  const number = typeof e.number === "number" && e.number > 0 ? Math.round(e.number) : index + 1;
  return {
    id: e.id !== undefined && e.id !== null ? `${animeId}:ep${String(e.id)}` : `${animeId}:ep${number}`,
    animeId,
    providerId: provider,
    number,
    title: str(e.title),
    titleNative: str(e.titleNative),
    aired: str(e.aired),
    filler: Boolean(e.filler),
    recap: Boolean(e.recap),
    source: { provider, nativeEpisodeId: e.id !== undefined && e.id !== null ? String(e.id) : String(number), url: str(e.url) },
  };
}

function normalizeSource(provider: ProviderId, episodeId: string, s: GatewaySource): StreamSource {
  return {
    episodeId,
    // Gateway boleh mengirim "trailer"; service akan menyaringnya di luar playback.
    kind: s.kind === "trailer" ? "trailer" : "episode-stream",
    quality: str(s.quality),
    embedUrl: str(s.embedUrl),
    fileUrl: str(s.fileUrl),
    provider,
    // Authorization dipegang backend; adapter tidak pernah menaikkannya sendiri.
    authorized: s.authorized === true,
    note: str(s.note),
  };
}

/** Confidence identity resolution lintas provider pada hasil search gateway. */
function scoreCandidate(a: Anime, target: string, year?: number): number {
  const hay = [a.title, a.titleEnglish, a.titleNative, ...a.altTitles].map(normTitle);
  const hasExact = hay.some((h) => h === target);
  const hasPartial = hay.some((h) => h.length >= 3 && (h.includes(target) || target.includes(h)));
  let score = hasExact ? 4 : hasPartial ? 2 : 0;
  if (typeof year === "number" && a.year === year) score += 2;
  else if (typeof year === "number" && a.year && Math.abs(a.year - year) <= 1) score += 1;
  return score;
}

/* ═══════════════════════════════ factory ══════════════════════════════════ */

export interface GatewayProviderSpec {
  /** Sekaligus segmen path gateway: `/v1/{id}/…`. */
  id: ProviderId;
  label: string;
  homepage: string;
}

/**
 * Ambil array isi amplop respons. `undefined` = bentuk tidak dikenali
 * (bukan "kosong"): dipetakan pemanggilnya ke INVALID_RESPONSE, sementara
 * array kosong dibiarkan sebagai jawaban sah — sama seperti adapter Jikan.
 */
function envelope(raw: unknown, key: string): { items: unknown[]; meta: Record<string, unknown> } | undefined {
  if (Array.isArray(raw)) return { items: raw, meta: {} };
  if (raw && typeof raw === "object") {
    const holder = raw as Record<string, unknown>;
    const value = holder[key] ?? holder.items ?? holder.data;
    if (value === undefined) return undefined;
    return { items: Array.isArray(value) ? value : [value], meta: holder };
  }
  return undefined;
}

export function createGatewayProvider(spec: GatewayProviderSpec): ProviderAdapter {

  const availability = (): ProviderAvailability =>
    hasGateway()
      ? { online: true, reason: `Gateway internal terpasang (${config.gatewayBaseUrl.replace(/^https?:\/\//, "")}).` }
      : { online: false, reason: "VITE_STREAMAN_GATEWAY_URL belum diisi — provider konten sengaja offline (tanpa scraping/bypass)." };

  /** Satu-satunya tempat URL gateway dirakit, supaya path provider konsisten. */
  const call = async <T>(path: string, op: "trending" | "latest" | "search" | "detail" | "episodes" | "gateway", signal?: AbortSignal): Promise<T> =>
    requestJson<T>(`${config.gatewayBaseUrl}/v1/${spec.id}${path}`, { op, provider: spec.id, signal });

  const fetchList = async (path: string, op: "trending" | "latest" | "search", page: number, signal?: AbortSignal): Promise<ListResult> => {
    const raw = await call<unknown>(path, op, signal);
    const env = envelope(raw, "items");
    if (!env) throw new StreamAnError("INVALID_RESPONSE", "Format daftar anime gateway tidak dikenali.", { provider: spec.id });
    const items = env.items.filter(isGatewayAnime).map((a) => normalizeAnime(spec.id, a));
    return {
      items,
      page: num(env.meta.page) ?? page,
      hasNext: env.meta.hasNext === true,
      total: num(env.meta.total),
    };
  };

  const fetchDetail = async (nativeId: string, signal?: AbortSignal): Promise<Anime> => {
    const raw = await call<unknown>(`/anime/${encodeURIComponent(nativeId)}`, "detail", signal);
    const env = envelope(raw, "anime");
    if (!env) throw new StreamAnError("INVALID_RESPONSE", "Amplop detail gateway tidak dikenali.", { provider: spec.id });
    const data = env.items.find(isGatewayAnime);
    if (!data) throw new StreamAnError("INVALID_RESPONSE", "Detail anime dari gateway tidak lengkap.", { provider: spec.id });
    return normalizeAnime(spec.id, data);
  };

  const ownIdOrThrow = (ref: AnimeRef): string => {
    // Guard identity: id provider lain tidak boleh masuk ke gateway ini.
    if (ref.provider !== spec.id) {
      throw new StreamAnError("NOT_FOUND", `id ${ref.id} bukan milik ${spec.id} — native id tidak berlaku lintas provider.`, { provider: spec.id });
    }
    return ref.nativeId;
  };

  return {
    id: spec.id,
    label: spec.label,
    homepage: spec.homepage,
    kind: "licensed-gateway",
    tier: "content",
    operations: ["trending", "latest", "search", "detail", "episodes", "sources"],
    availability,

    async trending(limit, signal) {
      return fetchList(`/trending?limit=${limit}`, "trending", 1, signal);
    },

    async latest(limit, signal) {
      return fetchList(`/latest?limit=${limit}`, "latest", 1, signal);
    },

    async search(query, page, signal) {
      const q = encodeURIComponent(query.slice(0, 80));
      return fetchList(`/search?q=${q}&page=${page}`, "search", page, signal);
    },

    async detail(ref, signal) {
      return fetchDetail(ownIdOrThrow(ref), signal);
    },

    async detailByTitle(ref, signal) {
      const target = normTitle(ref.title);
      if (target.length < 2) throw new StreamAnError("NOT_FOUND", "Judul terlalu pendek untuk identity resolution.", { provider: spec.id });
      const raw = await call<unknown>(`/search?q=${encodeURIComponent((ref.title ?? "").slice(0, 80))}&page=1`, "search", signal);
      const env = envelope(raw, "items");
      if (!env) throw new StreamAnError("INVALID_RESPONSE", "Format hasil cari gateway tidak dikenali.", { provider: spec.id });
      const candidates = env.items.filter(isGatewayAnime).map((a) => normalizeAnime(spec.id, a));
      if (!candidates.length) throw new StreamAnError("NOT_FOUND", "Anime tidak ditemukan di gateway.", { provider: spec.id });
      const best = candidates
        .map((a) => ({ a, score: scoreCandidate(a, target, ref.year) }))
        .sort((x, y) => y.score - x.score)[0];
      if (!best || best.score < 3) {
        throw new StreamAnError("NOT_FOUND", "Tidak ada kandidat dengan confidence cukup di gateway (judul/tahun tidak match).", { provider: spec.id });
      }
      return best.a;
    },

    async episodes(ref, signal) {
      const nativeId = ownIdOrThrow(ref);
      const raw = await call<unknown>(`/anime/${encodeURIComponent(nativeId)}/episodes`, "episodes", signal);
      const env = envelope(raw, "episodes");
      if (!env) throw new StreamAnError("INVALID_RESPONSE", "Format daftar episode gateway tidak dikenali.", { provider: spec.id });
      // Daftar kosong = jawaban SAH (film / katalog belum lengkap). Tidak ada
      // episode sintetis yang dibuat di adapter (dijaga juga di service.ts).
      return env.items.filter(isGatewayEpisode).map((e, i) => normalizeEpisode(spec.id, ref.id, e, i));
    },

    async sources(ref, episode, signal) {
      const nativeId = ownIdOrThrow(ref);
      const nativeEpisode = episode.source?.nativeEpisodeId ?? String(episode.number);
      const raw = await call<unknown>(
        `/anime/${encodeURIComponent(nativeId)}/episode/${encodeURIComponent(nativeEpisode)}/sources`,
        "gateway",
        signal,
      );
      const env = envelope(raw, "sources");
      if (!env) throw new StreamAnError("INVALID_RESPONSE", "Format daftar sumber gateway tidak dikenali.", { provider: spec.id });
      const arr = env.items.filter(isGatewaySource);
      // Sumber dari gateway HARUS di-flag authorized oleh backend; kalau tidak,
      // service akan menolaknya (source tidak authorized).
      return arr.map((s) => normalizeSource(spec.id, episode.id, s));
    },
  };
}





