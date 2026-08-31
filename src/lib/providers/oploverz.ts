import { createGatewayProvider } from "./gateway";

/**
 * PROVIDER 4 (konten) — Oploverz.
 * Adapter gateway seperti OtakuDesu/KuramaAnime. Diurutkan terakhir pada rantai
 * fallback konten (OTAKUDESU → KURAMA → OPLOVERZ) sesuai kebijakan service layer.
 */
export const oploverzProvider = createGatewayProvider({
  id: "oploverz",
  label: "Oploverz · gateway",
  homepage: "https://oploverz.io",
});





