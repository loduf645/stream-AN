/// <reference types="vite/client" />

/**
 * Variabel lingkungan StreamAN (dibaca di src/lib/config.ts).
 * Semua opsional: build publik tanpa `.env` tetap valid — katalog & detail
 * dilayani Jikan/AniList, Watch memakai trailer resmi.
 * Tidak ada API key: jangan pernah menambah variabel berisi secret di sini.
 */
interface ImportMetaEnv {
  /** Backend internal berlisensi (sumber episode). Kosong = provider konten offline. */
  readonly VITE_STREAMAN_GATEWAY_URL?: string;
  /** Basis URL Jikan (default https://api.jikan.moe/v4). */
  readonly VITE_STREAMAN_JIKAN_URL?: string;
  /** Endpoint GraphQL AniList (default https://graphql.anilist.co). */
  readonly VITE_STREAMAN_ANILIST_URL?: string;
  /** Tambahan host media tepercaya, CSV (mis. "cdn.gateway.example,embed.partner.example"). */
  readonly VITE_STREAMAN_TRUSTED_MEDIA_HOSTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}





