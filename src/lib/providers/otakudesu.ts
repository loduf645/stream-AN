import { createGatewayProvider } from "./gateway";

/**
 * PROVIDER 2 (konten) — Otakudesu.
 *
 * Tidak ada scraping di sisi klien: katalog/detail/episode/sumber diambil dari
 * backend internal berlisensi (lihat `gateway.ts`). Tanpa gateway terpasang,
 * provider ini berstatus offline dan service layer pindah ke metadata provider.
 * `homepage` hanya tautan rujukan di panel diagnostik — bukan endpoint yang
 * dipanggil aplikasi.
 */
export const otakudesuProvider = createGatewayProvider({
  id: "otakudesu",
  label: "Otakudesu · gateway",
  homepage: "https://otakudesu.cam",
});





