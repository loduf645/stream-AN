/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KONTRAK DATA INTERNAL — STREAMAN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * UI (pages/components) HANYA boleh bergantung pada tipe di file ini.
 * Bentuk respons mentah provider (Jikan/AniList/gateway) tidak pernah keluar
 * dari adapter-nya — semuanya dinormalisasi lebih dulu di `src/lib/providers/*`.
 *
 * Konvensi identitas (dijaga di service.ts):
 *   `Anime.id` = `${provider}:${nativeId}` — native id TIDAK pernah dipakai
 *   lintas provider. Karena prefixnya selalu ada, id ini aman dijadikan
 *   route param dan cache key sekaligus.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type ProviderId = "otakudesu" | "kurama" | "oploverz" | "jikan" | "anilist";

/**
 * Tier provider:
 *  - "content"  → boleh menyuplai episode-stream (via gateway berlisensi).
 *  - "metadata" → katalog/detail/sinopsis SAJA, tidak pernah jadi sumber video.
 */
export type ProviderTier = "content" | "metadata";

/** Operasi yang bisa di-capakan sebuah adapter ke service layer. */
export type Operation = "trending" | "latest" | "search" | "detail" | "episodes" | "sources";

/** Kode error kanonik — dipakai UI untuk memilih pesan & aksi retry. */
export type StreamAnErrorCode =
  | "NETWORK"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "NOT_FOUND"
  | "EMPTY_RESULT"
  | "CONFIG_MISSING"
  | "EPISODE_NOT_FOUND"
  | "SOURCE_UNAVAILABLE";

export type AttemptStatus = "ok" | "fail" | "skipped";

export type AiringStatus = "airing" | "finished" | "upcoming" | "unknown";

/** Enum untuk UI; adapter yang memetakan string provider (MOVIE→"Movie", TV→"TV", ...). */
export type AnimeType = "TV" | "OVA" | "ONA" | "Movie" | "Special" | "Music" | "Unknown";

/**
 * "episode-stream" = playback episode (hanya dari content provider, hanya bila authorized).
 * "trailer"        = pratinjau resmi; BUKAN pengganti episode, dirender terpisah di UI.
 */
export type StreamKind = "episode-stream" | "trailer";

/** Trailer resmi dari metadata provider — disimpan di `Anime.trailer`, bukan di playback chain. */
export interface TrailerRef {
  youtubeId?: string;
  embedUrl?: string;
  url?: string;
}

/** Entitas kanonik satu anime (hasil normalisasi adapter mana pun). */
export interface Anime {
  /** `${provider}:${nativeId}` */
  id: string;
  provider: ProviderId;
  /** URL halaman asli di provider (opsional, untuk tautan eksternal). */
  url?: string;
  title: string;
  titleEnglish?: string;
  titleNative?: string;
  /** Judul alternatif — modal utama identity resolution lintas provider. */
  altTitles: string[];
  poster?: string;
  cover?: string;
  synopsis?: string;
  genres: string[];
  status: AiringStatus;
  /** Status apa adanya dari provider, untuk ditampilkan tanpa menerjemahkan. */
  statusLabel?: string;
  type: AnimeType;
  /** Rating 0–10 (AniList 0–100 dibagi 10 di adapternya). */
  rating?: number;
  scoreCount?: number;
  ageRating?: string;
  episodesTotal?: number;
  episodeDurationMin?: number;
  year?: number;
  season?: string;
  studio?: string;
  airedLabel?: string;
  popularity?: number;
  members?: number;
  /** Sumber materi (manga/light novel/dst) — string mentah provider. */
  source?: string;
  trailer?: TrailerRef;
}

/** Referensi ringan yang dikirim ke adapter. Semua field selain id/optional dipakai untuk fallback resolution. */
export interface AnimeRef {
  id: string;
  provider: ProviderId;
  nativeId: string;
  title?: string;
  altTitles?: string[];
  year?: number;
}

/** Rujukan sumber episode di provider asalnya (bukan URL video). */
export interface EpisodeSourceRef {
  provider: ProviderId;
  nativeEpisodeId?: string;
  url?: string;
}

export interface Episode {
  /** Deterministik: `${animeId}:ep${number}` — BUKAN klaim native id provider. */
  id: string;
  /** id anime induk, WAJIB sama dengan `Anime.id` agar tidak tercampur. */
  animeId: string;
  providerId: ProviderId;
  number: number;
  title?: string;
  titleNative?: string;
  aired?: string;
  filler: boolean;
  recap: boolean;
  source?: EpisodeSourceRef;
}

/** Satu kandidat sumber playback yang dikembalikan provider/gateway. */
export interface StreamSource {
  episodeId: string;
  kind: StreamKind;
  embedUrl?: string;
  fileUrl?: string;
  quality?: string;
  provider?: ProviderId;
  /** Flag defensif UI; keputusan sah tetap di backend/gateway. */
  authorized?: boolean;
  note?: string;
}

/** Jejak satu percobaan provider dalam chain — ditampilkan apa adanya di TracePanel. */
export interface Attempt {
  provider: ProviderId;
  operation: Operation;
  status: AttemptStatus;
  ms: number;
  code?: StreamAnErrorCode;
  message?: string;
}

/** Meta respons service: dari mana data ini datang, dan dengan pengorbanan apa. */
export interface RequestMeta {
  attempts: Attempt[];
  /** Provider yang menjawab. Kosong bila tidak ada yang menjawab (jalur skip). */
  resolvedBy?: ProviderId;
  fallbackUsed: boolean;
  cached: boolean;
  ms: number;
  note?: string;
}

export interface Result<T> {
  data: T;
  meta: RequestMeta;
}

export interface ListResult {
  items: Anime[];
  page: number;
  hasNext: boolean;
  total?: number;
}



