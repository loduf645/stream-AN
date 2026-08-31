import type { ProviderAdapter } from "./types";
import type { ProviderId } from "../types";
import { otakudesuProvider } from "./otakudesu";
import { kuramaProvider } from "./kurama";
import { oploverzProvider } from "./oploverz";
import { jikanProvider } from "./jikan";
import { anilistProvider } from "./anilist";

/**
 * REGISTRY PROVIDER — STREAMAN.
 *
 * Urutan array = urutan rantai fallback global yang dipakai `run()` di
 * service.ts, dan urutan yang ditampilkan panel "Provider & fallback":
 *
 *   KONTEN    : OTAKUDESU → KURAMA → OPLOVERZ   (satu-satunya sumber episode-stream)
 *   METADATA  : JIKAN     → ANILIST              (katalog/detail/sinopsis SAJA)
 *
 * Identity isolation: tiap adapter menandai datanya dengan
 * prefix id-nya sendiri, dan service.ts hanya memanggil `episodes`/`sources`
 * pada provider yang cocok dengan `anime.provider` / `episode.providerId`.
 * Menambah provider = tambah satu adapter + daftarkan di sini; tidak ada
 * perubahan pada UI.
 */

/** Tier konten: boleh disentuh playback. Urut sesuai prioritas. */
export const contentProviders: ProviderAdapter[] = [otakudesuProvider, kuramaProvider, oploverzProvider];

/** Tier metadata: tidak pernah jadi sumber episode/video. */
export const metadataProviders: ProviderAdapter[] = [jikanProvider, anilistProvider];

/** Rantai penuh (content dulu, metadata kemudian). */
export const providers: ProviderAdapter[] = [...contentProviders, ...metadataProviders];

const METADATA_IDS: ProviderId[] = ["jikan", "anilist"];

export function isMetadataProvider(id: ProviderId): boolean {
  return METADATA_IDS.includes(id);
}



