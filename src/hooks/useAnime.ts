import { getAnimeDetail, getEpisodes, type DetailHint } from "../lib/service";
import { StreamAnError } from "../lib/errors";
import { useAsync, type AsyncResource } from "./useAsync";
import type { Anime, Episode } from "../lib/types";

/**
 * useAnimeFix — komposisi "detail → episodes" untuk route — STREAMAN.
 *
 * Kenapa hook ini ada (bukan cuma memanggil getAnimeDetail di tiap halaman):
 *
 *  - URL kita hanya membawa `provider:nativeId`. Untuk id dari provider konten,
 *    native id TIDAK berlaku di provider lain, jadi fallback lintas provider
 *    butuh basis identity resolution. Route ikut membawa `?t=<judul>&y=<tahun>`
 *    dan hook ini meneruskannya sebagai `hint` → `getAnimeDetail` boleh
 *    memakai `detailByTitle` (dan tetap dilarang mengirim nativeId lintas
 *    provider; lihat komentar invarian di service.ts).
 *  - Episode hanya sah diambil SETELAH detail selesai, dan hanya pada provider
 *    pemilik id (`getEpisodes` menjaganya). Urutan itu diekspresikan lewat
 *    `enabled` — jadi tidak pernah ada request episode dengan id basi.
 *  - Saat animeId berganti, kedua resource di-abort & di-fetch ulang secara
 *    otomatis; UI tidak perlu mengurus pembatalan.
 */

export interface AnimeFix {
  detail: AsyncResource<Anime>;
  /** undefined selama detail loading / gagal. */
  anime?: Anime;
  episodes: AsyncResource<Episode[]>;
  /** muat ulang berantai (detail, lalu episodes mengikuti deps). */
  reload: () => void;
}

export function useAnimeFix(animeId: string | undefined, hint?: DetailHint): AnimeFix {
  const detail = useAsync<Anime>(
    (signal) => getAnimeDetail(animeId as string, hint, signal),
    [animeId, hint?.title, hint?.year],
    Boolean(animeId),
  );

  const anime = detail.state.data;

  const episodes = useAsync<Episode[]>(
    (signal) =>
      anime
        ? getEpisodes(anime, signal)
        : Promise.reject(new StreamAnError("NOT_FOUND", "Anime belum terselesaikan — daftar episode tidak bisa diminta.")),
    [anime?.id],
    Boolean(anime),
  );

  return {
    detail,
    anime,
    episodes,
    reload: () => {
      detail.reload();
      episodes.reload();
    },
  };
}





