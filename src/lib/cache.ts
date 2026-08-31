/**
 * Cache in-memory (Map + TTL + LRU) untuk service layer — STREAMAN.
 *
 * Kenapa tidak localStorage:
 *  - hasil provider berisi URL bertanda-waktu & data yang cepat basi;
 *  - cache sesi menghindari basi lintas-reload dan tidak menyentuh disk.
 *
 * Aturan yang dijaga service.ts: key selalu memuat versi + operasi + argumen
 * (`trend:v2:12`, `detail:v2:jikan:5114`, ...), dan entry menyimpan `resolvedBy`
 * + `note` supaya UI tetap jujur soal fallback setelah cache-hit.
 */

interface Entry {
  value: unknown;
  expiresAt: number;
}

/** Cukup untuk sesi browsing (±120 list/detail/episode). */
const MAX_ENTRIES = 120;

const store = new Map<string, Entry>();

function read<T>(key: string, opts: { touch?: boolean }): { value: T; expiresAt: number } | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  if (opts.touch) {
    // refresh posisi LRU: Map menjaga urutan penyisipan.
    store.delete(key);
    store.set(key, hit);
  }
  return { value: hit.value as T, expiresAt: hit.expiresAt };
}

export interface CacheHit<T> {
  value: T;
  /** sisa umur cache dalam ms — dipakai untuk memutuskan perlu revalidasi atau tidak. */
  expiresIn: number;
}

export function cacheGet<T>(key: string): CacheHit<T> | undefined {
  const hit = read<T>(key, { touch: true });
  if (!hit) return undefined;
  return { value: hit.value, expiresIn: Math.max(0, hit.expiresAt - Date.now()) };
}

/** `ttlMs <= 0` = jangan simpan (berguna saat caller mematikan cache per-operasi). */
export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  if (!(ttlMs > 0)) return;
  store.delete(key);
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}





