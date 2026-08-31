import { isTrustedMediaUrl } from "../lib/security";
import type { TrailerRef } from "../lib/types";

/**
 * Bangun iframe-src trailer resmi yang AMAN — STREAMAN.
 *
 * Trailer adalah konten informasi (bukan pengganti episode) dan WAJIB lewat
 * allowlist host media (src/lib/security.ts). `embedUrl` dari provider dipakai
 * bila trusted; kalau tidak, fallback ke youtubeId dengan embed youtube-nocookie
 * (juga di-validasi). `undefined` berarti tidak ada trailer yang boleh dirender.
 */
export function trailerSrc(trailer?: TrailerRef): string | undefined {
  if (!trailer) return undefined;
  if (trailer.embedUrl && isTrustedMediaUrl(trailer.embedUrl)) return trailer.embedUrl;
  if (trailer.youtubeId) {
    const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.youtubeId)}`;
    if (isTrustedMediaUrl(src)) return src;
  }
  return undefined;
}
