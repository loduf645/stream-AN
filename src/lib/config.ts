/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KONFIGURASI RUNTIME — STREAMAN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Satu-satunya tempat nilai eksternal dibaca. Tidak ada API key yang di-hardcode
 * di kode sumber: semuanya lewat `import.meta.env` (file `.env*` saat build/dev).
 * Variabel yang dikenali (lihat juga `.env.example`):
 *
 *   VITE_STREAMAN_GATEWAY_URL          → backend internal berlisensi (sumber episode)
 *   VITE_STREAMAN_JIKAN_URL            → override basis URL Jikan (default publik)
 *   VITE_STREAMAN_ANILIST_URL          → override endpoint GraphQL AniList
 *   VITE_STREAMAN_TRUSTED_MEDIA_HOSTS  → tambahan host allowlist media (CSV)
 *
 * Catatan penting: kedua provider metadata (Jikan & AniList) adalah API publik
 * TANPA key, jadi project ini tetap bisa jalan walau `.env` kosong sama sekali.
 * Tanpa gateway, content provider berstatus offline dan Watch memakai trailer
 * resmi sebagai konten informasi (bukan pengganti episode).
 */

export interface CacheTtl {
  /** daftar (trending/latest/search) — cepat berubah, TTL pendek. */
  list: number;
  /** detail anime — relatif stabil. */
  detail: number;
  /** daftar episode — berubah saat episode baru terbit. */
  episodes: number;
}

export interface AppConfig {
  /** Basis URL gateway internal (kosong = belum dipasangkan). */
  gatewayBaseUrl: string;
  jikanBaseUrl: string;
  anilistBaseUrl: string;
  /** Host tambahan yang boleh jadi sumber media (di luar bawaan security.ts). */
  extraTrustedMediaHosts: string[];
  cacheTtl: CacheTtl;
}

const raw = (v: string | undefined): string => (v ?? "").trim();
const withoutTrailingSlash = (v: string): string => v.replace(/\/+$/, "");

/** baca CSV env → list host yang sudah dinormalisasi (lowercase, tanpa spasi). */
function csv(v: string | undefined): string[] {
  return raw(v)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const config: AppConfig = {
  gatewayBaseUrl: withoutTrailingSlash(raw(import.meta.env.VITE_STREAMAN_GATEWAY_URL)),
  jikanBaseUrl: withoutTrailingSlash(raw(import.meta.env.VITE_STREAMAN_JIKAN_URL)) || "https://api.jikan.moe/v4",
  anilistBaseUrl: withoutTrailingSlash(raw(import.meta.env.VITE_STREAMAN_ANILIST_URL)) || "https://graphql.anilist.co",
  extraTrustedMediaHosts: csv(import.meta.env.VITE_STREAMAN_TRUSTED_MEDIA_HOSTS),
  cacheTtl: {
    list: 10 * 60_000,
    detail: 60 * 60_000,
    episodes: 30 * 60_000,
  },
};

/**
 * Gateway = prasyarat sumber episode yang authorized.
 * Dipakai Layout (banner provider) dan adapter content (availability).
 */
export function hasGateway(): boolean {
  return config.gatewayBaseUrl.length > 0;
}

/** Host gateway (kalau terpasang) ikut dipercaya sebagai sumber media. */
export function gatewayHost(): string | undefined {
  if (!hasGateway()) return undefined;
  try {
    return new URL(config.gatewayBaseUrl).host.toLowerCase();
  } catch {
    return undefined;
  }
}





