import { createGatewayProvider } from "./gateway";

/**
 * PROVIDER 3 (konten) — KuramaAnime.
 * Adapter tipis di atas gateway internal yang sama; hanya `id` (dan karena itu
 * segmen path + cache key + prefix identitas) yang berbeda. Tanpa scraping sisi
 * klien — `homepage` cuma tautan rujukan di panel diagnostik.
 */
export const kuramaProvider = createGatewayProvider({
  id: "kurama",
  label: "KuramaAnime · gateway",
  homepage: "https://kuramanime.com",
});





