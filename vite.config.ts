import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * BUILD STREAMAN.
 *
 * - `@tailwindcss/vite`  : Tailwind v4 murni dari token di src/index.css (@theme),
 *                          jadi tidak ada tailwind.config.js / postcss config.
 * - `viteSingleFile()`   : hasil build = SATU index.html (JS + CSS inline),
 *                          siap diserve dari host statis mana pun atau dibuka lokal.
 * - `base: "./"`         : tidak ada asumsi berada di root domain.
 * - Config TIDAK membaca API key apa pun; semua nilai runtime lewat
 *   `import.meta.env` (VITE_STREAMAN_*) yang diringkas di src/lib/config.ts.
 */
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    target: "es2022",
    // Semua aset (hanya favicon SVG inline di index.html) ikut ke dalam satu file.
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4096,
    reportCompressedSize: false,
  },
  // `allowedHosts: true` — dev server boleh menerima host preview apa pun
  // (sandbox/preview host); tidak berpengaruh pada build produksi.
  server: { host: "0.0.0.0", port: 5173, allowedHosts: true },
  preview: { host: "0.0.0.0", port: 4173 },
});



