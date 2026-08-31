import { cacheGet, cacheSet } from "./cache";
import { StreamAnError } from "./errors";
import { config } from "./config";
import { contentProviders, isMetadataProvider, providers } from "./providers";
import type { ProviderAdapter } from "./providers/types";
import type {
  Anime,
  AnimeRef,
  Attempt,
  Episode,
  StreamAnErrorCode,
  ListResult,
  Operation,
  ProviderId,
  RequestMeta,
  Result,
  StreamSource,
} from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTERNAL SERVICE LAYER — StreamAN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pipeline: UI → service (di sini) → Provider Adapter → API/Gateway.
 * Frontend TIDAK pernah bicara ke provider eksternal langsung.
 *
 * INVARIAN KRITIS YANG DIJAGA DI SINI:
 *
 *  1. IDENTITY ISOLATION: nativeId provider A tidak pernah dikirim ke
 *     provider B. `getEpisodes` HANYA memakai provider yang cocok dengan
 *     `anime.provider`. Cross-provider hanya diperkenankan lewat identity
 *     resolution (`detailByTitle` yang mengembalikan CanonicalAnime baru
 *     dengan native id target).
 *
 *  2. DIRECT PROVIDER PRIORITY: bila caller memberikan id `foo:X`, provider
 *     `foo` dicoba PERTAMA. Chain lainnya hanya fallback saat provider utama
 *     benar-benar gagal (bukan NOT_FOUND identifier invalid).
 *
 *  3. METADATA vs CONTENT TIER: Jikan/AniList (metadata) tidak pernah menjadi
 *     sumber episode-stream. Playback source resolution HANYA memanggil
 *     `contentProviders`.
 *
 *  4. FALLBACK POLICY DETERMINISTIK:
 *       NETWORK / TIMEOUT / RATE_LIMITED / PROVIDER_UNAVAILABLE / INVALID_RESPONSE
 *         → coba provider berikutnya
 *       NOT_FOUND (identifier invalid, tanpa hint judul)
 *         → stop chain (identifier hanya valid untuk satu provider)
 *       EMPTY_RESULT di list ops (trending/latest/search)
 *         → JAWABAN SAH → JANGAN fallback (mencegah menutupi hasil kosong yang benar)
 *       EMPTY_RESULT di detail/episodes
 *         → fallback (mungkin provider berikutnya punya data)
 *
 *  5. CACHE: key selalu unik per operasi + argumen. Cached meta menyimpan
 *     resolvedBy + note (mis. "metadata fallback") supaya UI tetap jujur
 *     setelah cache-hit.
 *
 *  6. NO SYNTHETIC EPISODES: `episodesTotal` (metadata) BUKAN bukti bahwa
 *     ada 24 objek episode; kalau list kosong, kita kembalikan list kosong.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export class FallbackExhaustedError extends StreamAnError {
  constructor(message: string, attempts: Attempt[], code?: StreamAnErrorCode) {
    super(code ?? ((attempts.find((a) => a.status === "fail")?.code as StreamAnErrorCode) ?? "PROVIDER_UNAVAILABLE"), message);
    this.name = "FallbackExhaustedError";
    this.attempts = attempts;
  }
}

interface RunOpts {
  cacheKey?: string;
  ttl?: number;
  /** urutan provider yang dipakai untuk operasi ini (default: seluruh chain). */
  chain?: ProviderAdapter[];
  /** kembalikan `true` untuk menghentikan chain setelah suatu code (mis. NOT_FOUND identifier invalid). */
  stopOn?: (code: StreamAnErrorCode, provider: ProviderId) => boolean;
  /** operasi yang menganggap hasil kosong sebagai jawaban SAH (bukan sinyal fallback). */
  emptyIsFinal?: boolean;
}

interface CacheEntry<T> {
  data: T;
  attempts: Attempt[];
  resolvedBy: ProviderId;
  note?: string;
}

function isListResult(x: unknown): x is ListResult {
  return typeof x === "object" && x !== null && Array.isArray((x as ListResult).items);
}

async function run<T>(op: Operation, invoke: (p: ProviderAdapter) => Promise<T>, opts: RunOpts = {}, signal?: AbortSignal): Promise<Result<T>> {
  const started = performance.now();

  if (opts.cacheKey) {
    const hit = cacheGet<CacheEntry<T>>(opts.cacheKey);
    if (hit) {
      const meta: RequestMeta = {
        attempts: hit.value.attempts,
        resolvedBy: hit.value.resolvedBy,
        fallbackUsed: hit.value.attempts.filter((a) => a.status === "ok").length > 1,
        cached: true,
        ms: Math.round(performance.now() - started),
      };
      if (hit.value.note) meta.note = hit.value.note;
      return { data: hit.value.data, meta };
    }
  }

  const attempts: Attempt[] = [];
  const chain = opts.chain ?? providers;

  for (const p of chain) {
    if (!p.operations.includes(op)) {
      attempts.push({ provider: p.id, operation: op, status: "skipped", ms: 0, message: "operasi tidak didukung provider ini" });
      continue;
    }
    const availability = p.availability();
    if (!availability.online) {
      attempts.push({ provider: p.id, operation: op, status: "skipped", ms: 0, code: "CONFIG_MISSING", message: availability.reason });
      continue;
    }
    const t0 = performance.now();
    try {
      const data = await invoke(p);

      // Untuk operasi list (trending/latest/search), hasil kosong dianggap jawaban SAH
      // dan tidak memicu fallback. Caller mengatur `emptyIsFinal: true` untuk kasus ini.
      if (opts.emptyIsFinal && isListResult(data) && data.items.length === 0) {
        throw new StreamAnError("EMPTY_RESULT", "Provider mengembalikan daftar kosong.", { provider: p.id });
      }

      attempts.push({ provider: p.id, operation: op, status: "ok", ms: Math.round(performance.now() - t0) });

      const note = isMetadataProvider(p.id)
        ? "Provider konten utama (OtakuDesu/KuramaAnime/Oploverz) tidak tersedia — data ini berasal dari metadata fallback (Jikan/AniList) dan BUKAN sumber episode/video."
        : undefined;

      if (opts.cacheKey) {
        const entry: CacheEntry<T> = { data, attempts, resolvedBy: p.id, note };
        cacheSet(opts.cacheKey, entry, opts.ttl ?? config.cacheTtl.list);
      }

      const meta: RequestMeta = {
        attempts,
        resolvedBy: p.id,
        fallbackUsed: attempts.filter((a) => a.status === "ok").length > 1,
        cached: false,
        ms: Math.round(performance.now() - started),
      };
      if (note) meta.note = note;
      return { data, meta };
    } catch (err) {
      const e = err instanceof StreamAnError ? err : new StreamAnError("PROVIDER_UNAVAILABLE", "Provider gagal merespons.", { provider: p.id });
      attempts.push({
        provider: p.id,
        operation: op,
        status: "fail",
        ms: Math.round(performance.now() - t0),
        code: e.code,
        message: e.message,
      });
      if (signal?.aborted) break;
      if (opts.stopOn?.(e.code, p.id)) break;
    }
  }

  const firstFail = attempts.find((a) => a.status === "fail");
  throw new FallbackExhaustedError(
    firstFail?.message ?? "Semua provider gagal menjawab permintaan.",
    attempts,
    (firstFail?.code as StreamAnErrorCode) ?? "PROVIDER_UNAVAILABLE",
  );
}

/* ══════════════════════════════ HELPERS ══════════════════════════════════ */

/** bangun ref dari canonical anime — nativeId dan provider dipertahankan APA ADANYA. */
function refOfAnime(anime: Anime): AnimeRef {
  return {
    id: anime.id,
    provider: anime.provider,
    nativeId: nativeIdOf(anime.id),
    title: anime.title,
    altTitles: anime.altTitles,
    year: anime.year,
  };
}

function nativeIdOf(id: string): string {
  const i = id.indexOf(":");
  return i === -1 ? id : id.slice(i + 1);
}

function providerOf(id: string): ProviderId | undefined {
  const i = id.indexOf(":");
  if (i === -1) return undefined;
  const prefix = id.slice(0, i);
  if (!providers.some((p) => p.id === prefix)) return undefined;
  return prefix as ProviderId;
}

/**
 * Urutkan chain agar provider "cocok" (jika ada) dicoba pertama.
 * Menegakkan DIRECT PROVIDER PRIORITY: provider yang cocok dicoba pertama.
 */
function chainPrioritizing(target: ProviderId | undefined): ProviderAdapter[] {
  if (!target) return providers;
  const primary = providers.find((p) => p.id === target);
  const rest = providers.filter((p) => p.id !== target);
  return primary ? [primary, ...rest] : providers;
}

/* ══════════════════════════════ HOME ═══════════════════════════════════════ */

export function getTrending(limit = 12, signal?: AbortSignal): Promise<Result<ListResult>> {
  return run<ListResult>("trending", (p) => p.trending!(limit, signal), { cacheKey: `trend:v2:${limit}`, emptyIsFinal: true }, signal);
}

export function getLatest(limit = 12, signal?: AbortSignal): Promise<Result<ListResult>> {
  return run<ListResult>("latest", (p) => p.latest!(limit, signal), { cacheKey: `latest:v2:${limit}`, emptyIsFinal: true }, signal);
}

/* ══════════════════════════════ SEARCH ═════════════════════════════════════ */

/**
 * Search policy:
 *  - `EMPTY_RESULT` dianggap FINAL — bukan sinyal fallback.
 *    (Mencegah kondisi "provider A benar-benar mencari X, tidak ada",
 *     lalu B menemukan Y yang tidak relevan.)
 *  - Provider FAILURE (network/timeout/invalid) → fallback ke provider berikutnya.
 */
export function searchAnime(query: string, page = 1, signal?: AbortSignal): Promise<Result<ListResult>> {
  const q = query.trim();
  if (q.length < 2) {
    return Promise.reject(new StreamAnError("EMPTY_RESULT", "Ketik minimal 2 huruf untuk mencari."));
  }
  return run<ListResult>(
    "search",
    async (p) => {
      const res = await p.search!(q, page, signal);
      // ID dari adapter sudah berbentuk `${provider}:${nativeId}`; kami hanya
      // memverifikasi konsistensi, TIDAK meng-override nativeId lintas provider.
      return {
        ...res,
        items: res.items.map((a) => (a.id?.startsWith(`${p.id}:`) ? a : { ...a, id: `${p.id}:${nativeIdOf(a.id)}`, provider: p.id })),
      };
    },
    { cacheKey: `search:v2:${q.toLowerCase()}:${page}`, ttl: 30 * 60 * 1000, emptyIsFinal: true },
    signal,
  );
}

/* ══════════════════════════════ DETAIL ═════════════════════════════════════ */

export interface DetailHint {
  title?: string;
  year?: number;
}

/**
 * Detail resolution.
 *
 * IDENTITY RULES:
 *  - Kalau `id = foo:X` -> provider `foo` DIcoba pertama (direct provider priority).
 *  - Fallback ke provider LAIN hanya dilakukan bila:
 *      (a) provider utama gagal karena NETWORK/TIMEOUT/INVALID_RESPONSE/dst,
 *      (b) ada `hint.title` sebagai basis identity resolution (title+year),
 *      (c) provider fallback adalah TIER YANG SAMA (content ↔ content, atau
 *          metadata ↔ metadata) — mencegah lintas tier menghasilkan Anime
 *          dengan id tier berbeda tetapi disimpan di cache key id lama.
 *  - Tanpa hint judul, chain berhenti setelah provider utama menghasilkan
 *    NOT_FOUND (identifier ID native provider LAIN tidak akan menemukan apa-apa).
 */
export function getAnimeDetail(id: string, hint?: DetailHint, signal?: AbortSignal): Promise<Result<Anime>> {
  const provider = providerOf(id);
  if (!provider) {
    return Promise.reject(new StreamAnError("NOT_FOUND", `Format id "${id}" tidak dikenal (harus \`provider:nativeId\`).`));
  }
  const ref: AnimeRef = {
    id,
    provider,
    nativeId: nativeIdOf(id),
    title: hint?.title,
    year: hint?.year,
  };
  const primary = providers.find((p) => p.id === provider);
  const primaryTier = primary?.tier;
  // Chain: provider tepat DULU.
  // Tanpa hint judul, batasi ke tier yang sama (nativeId hanya valid untuk provider asal).
  // Dengan hint judul, izinkan cross-tier fallback — metadata provider bisa jadi sumber detail/sinopsis.
  const chain = chainPrioritizing(provider);
  const effectiveChain = hint?.title
    ? chain
    : chain.filter((p) => p.id === provider || p.tier === primaryTier);

  return run<Anime>(
    "detail",
    async (p) => {
      if (p.id === provider) return p.detail!(ref, signal);
      if (!p.detailByTitle) {
        throw new StreamAnError("NOT_FOUND", `${p.id}: identity resolution tidak didukung tanpa API cari-judul.`, { provider: p.id });
      }
      return p.detailByTitle(ref, signal);
    },
    {
      cacheKey: `detail:v2:${id}`,
      ttl: config.cacheTtl.detail,
      chain: effectiveChain,
      // Tanpa hint judul, NOT_FOUND di provider utama = identifier memang tidak ada
      // (native id-nya bukan milik provider lain) → hentikan chain.
      stopOn: (code) => code === "NOT_FOUND" && !hint?.title,
    },
    signal,
  );
}

/* ═════════════════════════════ EPISODES ═══════════════════════════════════ */

/**
 * Episode resolution.
 *
 * INVARIAN IDENTITY (paling kritis):
 *  - Native id anime hanya valid untuk provider yang menerbitkannya.
 *    `getEpisodes(anime)` HANYA memanggil `p.episodes` bila `p.id === anime.provider`.
 *    Tidak ada `{ ...ref, provider: p.id }` lintas provider — itu SALAH karena
 *    akan mengirim mis. `jikan:5114` (MAL id) ke Kurama yang tidak mengenalinya.
 *
 *  - Cross-provider episode lookup HANYA sah lewat identity resolution
 *    (mendapatkan Anime baru pada provider target lewat title+year),
 *    yang dilakukan di `getAnimeDetail`, BUKAN di sini.
 *
 * NO SYNTHETIC EPISODES:
 *  - Kalau provider mengembalikan daftar kosong → itu jawaban sah (film,
 *    metadata belum lengkap, dst). Kembalikan list kosong, biarkan UI
 *    menampilkan empty state. Tidak ada episode-dibuat-dari-episodesTotal.
 */
export async function getEpisodes(anime: Anime, signal?: AbortSignal): Promise<Result<Episode[]>> {
  const started = performance.now();
  const p = providers.find((pp) => pp.id === anime.provider);
  if (!p || !p.operations.includes("episodes") || !p.episodes) {
    // Provider ini memang tidak menyediakan daftar episode (mis. AniList).
    // JANGAN mencoba provider lain dengan nativeId Anime → itu identity contamination.
    return {
      data: [],
      meta: {
        attempts: [
          {
            provider: anime.provider,
            operation: "episodes",
            status: "skipped",
            ms: 0,
            code: "CONFIG_MISSING",
            message: `${anime.provider} tidak menyediakan daftar episode.`,
          },
        ],
        fallbackUsed: false,
        cached: false,
        ms: Math.round(performance.now() - started),
        note: `${anime.provider} tidak menyediakan daftar episode. Untuk mendapatkan episode, buka anime yang berasal dari provider konten (OtakuDesu/KuramaAnime/Oploverz).`,
      },
    };
  }

  const availability = p.availability();
  if (!availability.online) {
    return {
      data: [],
      meta: {
        attempts: [{ provider: p.id, operation: "episodes", status: "skipped", ms: 0, code: "CONFIG_MISSING", message: availability.reason }],
        fallbackUsed: false,
        cached: false,
        ms: Math.round(performance.now() - started),
        note: availability.reason,
      },
    };
  }

  const cacheKey = `eps:v2:${anime.id}`;
  const hit = cacheGet<CacheEntry<Episode[]>>(cacheKey);
  if (hit) {
    const meta: RequestMeta = {
      attempts: hit.value.attempts,
      resolvedBy: hit.value.resolvedBy,
      fallbackUsed: false,
      cached: true,
      ms: Math.round(performance.now() - started),
    };
    if (hit.value.note) meta.note = hit.value.note;
    return { data: hit.value.data, meta };
  }

  const ref = refOfAnime(anime);
  const t0 = performance.now();
  try {
    const list = await p.episodes(ref, signal);
    // Validasi setiap episode di service layer (defense-in-depth) —
    // adapter yang mengirim identity aneh tidak akan lolos.
    const clean: Episode[] = [];
    for (const e of list) {
      if (typeof e?.number !== "number" || !e.id || e.animeId !== anime.id || e.providerId !== anime.provider) continue;
      clean.push(e);
    }
    const attempts: Attempt[] = [{ provider: p.id, operation: "episodes", status: "ok", ms: Math.round(performance.now() - t0) }];
    const note = clean.length !== list.length
      ? `Adapter mengembalikan ${list.length} episode, ${list.length - clean.length} dibuang karena identity tidak konsisten dengan anime.id.`
      : undefined;
    const entry: CacheEntry<Episode[]> = { data: clean, attempts, resolvedBy: p.id, note };
    cacheSet(cacheKey, entry, config.cacheTtl.episodes);
    const meta: RequestMeta = {
      attempts,
      resolvedBy: p.id,
      fallbackUsed: false,
      cached: false,
      ms: Math.round(performance.now() - started),
    };
    if (note) meta.note = note;
    return { data: clean, meta };
  } catch (err) {
    const e = err instanceof StreamAnError ? err : new StreamAnError("PROVIDER_UNAVAILABLE", "Gagal memuat daftar episode.", { provider: p.id });
    // Empty result → kembalikan list kosong (bukan error). Semua error lain → propagate.
    if (e.code === "EMPTY_RESULT") {
      return {
        data: [],
        meta: {
          attempts: [{ provider: p.id, operation: "episodes", status: "ok", ms: Math.round(performance.now() - t0), code: "EMPTY_RESULT", message: e.message }],
          resolvedBy: p.id,
          fallbackUsed: false,
          cached: false,
          ms: Math.round(performance.now() - started),
          note: "Provider tidak memiliki daftar episode untuk anime ini (mis. film / metadata belum lengkap). Tidak ada episode sintetis yang dibuat.",
        },
      };
    }
    e.attempts = [{ provider: p.id, operation: "episodes", status: "fail", ms: Math.round(performance.now() - t0), code: e.code, message: e.message }];
    throw e;
  }
}

/* ═══════════════════════════ WATCH / PLAYBACK ═════════════════════════════ */

export interface Playback {
  episode: Episode;
  /** hanya sumber episode-stream authorized dari CONTENT provider. */
  sources: StreamSource[];
}

/**
 * Source resolution.
 *
 * INVARIAN:
 *  - HANYA `contentProviders` (OtakuDesu/KuramaAnime/Oploverz) yang boleh
 *    menyuplai episode-stream. Metadata provider (Jikan/AniList) TIDAK pernah.
 *  - Suatu sumber hanya "usable" bila:
 *      kind === 'episode-stream' && authorized && (embedUrl || fileUrl)
 *    (Frontend flag `authorized` adalah defense-in-depth; keputusan sah
 *     tetap di backend/gateway.)
 *  - Cross-provider source: HANYA dipanggil pada provider di mana episode ini
 *    memang berasal (`episode.providerId`). Provider content lain hanya dicoba
 *    bila memiliki identity anime yang sama — untuk MVP kita hanya coba
 *    `episode.providerId`; multi-provider source membutuhkan identity map.
 */
export async function resolvePlayback(anime: Anime, episode: Episode, signal?: AbortSignal): Promise<Result<Playback>> {
  const started = performance.now();
  const attempts: Attempt[] = [];

  // Sanity: episode HARUS milik anime ini dan berasal dari provider CONTENT.
  if (episode.animeId !== anime.id) {
    throw new StreamAnError("EPISODE_NOT_FOUND", "Episode ini bukan milik anime aktif (identity mismatch).", { provider: episode.providerId });
  }
  const p = contentProviders.find((c) => c.id === episode.providerId);
  if (!p) {
    // Episode berasal dari metadata provider (mis. Jikan) → tidak pernah ada
    // sumber episode-stream authorized untuk itu. Ini bukan error jaringan;
    // ini gap arsitektur (butuh gateway berlisensi).
    attempts.push({
      provider: episode.providerId,
      operation: "sources",
      status: "skipped",
      ms: 0,
      code: "CONFIG_MISSING",
      message: `${episode.providerId} adalah metadata provider — tidak menyuplai episode-stream authorized.`,
    });
    for (const c of contentProviders) {
      attempts.push({
        provider: c.id,
        operation: "sources",
        status: "skipped",
        ms: 0,
        code: "CONFIG_MISSING",
        message: c.availability().online
          ? "identity resolution ke provider konten belum diimplementasikan (butuh mapping title→native id)."
          : c.availability().reason,
      });
    }
    throw new FallbackExhaustedError(
      "Episode ini berasal dari metadata provider (bukan content provider). Sumber episode-stream authorized hanya tersedia dari OtakuDesu/KuramaAnime/Oploverz via gateway berlisensi.",
      attempts,
      "SOURCE_UNAVAILABLE",
    );
  }

  if (!p.sources) {
    throw new FallbackExhaustedError(
      `${p.id} tidak mengimplementasikan sources().`,
      [{ provider: p.id, operation: "sources", status: "skipped", ms: 0, message: "sources() belum diimplementasikan" }],
      "SOURCE_UNAVAILABLE",
    );
  }

  const availability = p.availability();
  if (!availability.online) {
    attempts.push({ provider: p.id, operation: "sources", status: "skipped", ms: 0, code: "CONFIG_MISSING", message: availability.reason });
    throw new FallbackExhaustedError(
      "Gateway content provider belum dikonfigurasi (VITE_STREAMAN_GATEWAY_URL). Episode source tidak tersedia.",
      attempts,
      "SOURCE_UNAVAILABLE",
    );
  }

  const ref = refOfAnime(anime);
  const t0 = performance.now();
  try {
    const sources = await p.sources(ref, episode, signal);
    const usable = sources.filter(
      (s) => s.kind === "episode-stream" && s.authorized === true && (Boolean(s.embedUrl) || Boolean(s.fileUrl)),
    );
    attempts.push({ provider: p.id, operation: "sources", status: "ok", ms: Math.round(performance.now() - t0) });
    if (!usable.length) {
      throw new FallbackExhaustedError(
        "Provider menjawab tanpa sumber episode-stream yang authorized.",
        attempts,
        "SOURCE_UNAVAILABLE",
      );
    }
    return {
      data: { episode, sources: usable },
      meta: {
        attempts,
        resolvedBy: p.id,
        fallbackUsed: false,
        cached: false,
        ms: Math.round(performance.now() - started),
      },
    };
  } catch (err) {
    const e = err instanceof StreamAnError ? err : new StreamAnError("SOURCE_UNAVAILABLE", "Sumber video gagal dimuat.", { provider: p.id });
    attempts.push({ provider: p.id, operation: "sources", status: "fail", ms: Math.round(performance.now() - t0), code: e.code, message: e.message });
    throw new FallbackExhaustedError(e.message, attempts, e.code === "NOT_FOUND" ? "SOURCE_UNAVAILABLE" : e.code);
  }
}

/* ══════════════════════════════ DIAGNOSTICS ═══════════════════════════════ */

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  kind: string;
  tier: string;
  homepage: string;
  online: boolean;
  reason: string;
  operations: Operation[];
}

export function providerStatus(): ProviderStatus[] {
  return providers.map((p) => ({
    id: p.id,
    label: p.label,
    kind: p.kind,
    tier: p.tier,
    homepage: p.homepage,
    operations: p.operations,
    ...p.availability(),
  }));
}

export type { RequestMeta };



