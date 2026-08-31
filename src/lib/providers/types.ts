import type { Anime, AnimeRef, Episode, ListResult, Operation, ProviderId, ProviderTier, StreamSource } from "../types";

/**
 * Kontrak antara service layer dan adapter provider — STREAMAN.
 *
 * ATURAN ADAPTER (dijaga bersama dengan invarian di service.ts):
 *  1. Adapter WAJIB menandai setiap Anime yang dikembalikannya dengan
 *     `id = buildId(this.id, nativeId)` dan `provider = this.id`. Mengirim id
 *     provider lain = identity contamination → langsung dibuang service layer.
 *  2. Adapter TIDAK pernah memilih provider fallback; itu urusan `run()` di
 *     service.ts.
 *  3. Tier "metadata" tidak boleh mengimplementasikan `sources`.
 *  4. `availability()` harus sinkron & murahan (cek konfigurasi, bukan fetch).
 *     Provider yang tidak terpasang harus mengembalikan online=false + alasan,
 *     sehingga service bisa skip tanpa mengeluarkan request.
 *  5. Semua error dilempar sebagai StreamAnError dengan kode kanonik.
 */

export type ProviderKind = "official-public" | "licensed-gateway";

export interface ProviderAvailability {
  online: boolean;
  reason: string;
}

export interface ProviderAdapter {
  id: ProviderId;
  /** Label manusiawi untuk panel provider/diagnostik. */
  label: string;
  homepage: string;
  kind: ProviderKind;
  tier: ProviderTier;
  /** Subset operasi yang didukung; selain ini di-skip service dengan status "skipped". */
  operations: Operation[];
  availability(): ProviderAvailability;

  trending?(limit: number, signal?: AbortSignal): Promise<ListResult>;
  latest?(limit: number, signal?: AbortSignal): Promise<ListResult>;
  search?(query: string, page: number, signal?: AbortSignal): Promise<ListResult>;
  /** Detail berdasarkan id native provider (prefix id harus cocok). */
  detail?(ref: AnimeRef, signal?: AbortSignal): Promise<Anime>;
  /** Identity resolution: judul (+tahun) → Anime pada provider INI. */
  detailByTitle?(ref: AnimeRef, signal?: AbortSignal): Promise<Anime>;
  episodes?(ref: AnimeRef, signal?: AbortSignal): Promise<Episode[]>;
  /** Hanya boleh di-klaim oleh content provider. */
  sources?(ref: AnimeRef, episode: Episode, signal?: AbortSignal): Promise<StreamSource[]>;
}

/** Bentuk id kanonik internal. */
export function buildId(provider: ProviderId, nativeId: string | number): string {
  return `${provider}:${nativeId}`;
}

/**
 * Pecah id internal. Tanpa prefix yang dikenal → `prefix` undefined dan seluruh
 * string dianggap nativeId (dipakai untuk memvalidasi kepemilikan id di adapter).
 */
export function splitId(id: string): { prefix?: ProviderId; nativeId: string } {
  const i = id.indexOf(":");
  if (i <= 0) return { nativeId: id };
  const prefix = id.slice(0, i);
  const known: ProviderId[] = ["otakudesu", "kurama", "oploverz", "jikan", "anilist"];
  return known.includes(prefix as ProviderId)
    ? { prefix: prefix as ProviderId, nativeId: id.slice(i + 1) }
    : { nativeId: id };
}

/** Normalisasi judul untuk perbandingan lintas provider (kecil, alfanumerik saja). */
export function normTitle(value?: string | null): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, " ").trim();
}





