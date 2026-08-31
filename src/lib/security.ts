import { config, gatewayHost } from "./config";

/**
 * Host allowlist untuk semua URL media yang dirender <iframe>/<video> — STREAMAN.
 *
 * Ini defense-in-depth: respons provider/gateway TIDAK pernah
 * dipercaya begitu saja. Kalau sebuah `StreamSource` menunjuk ke host yang tidak
 * ada di daftar ini, UI menolak memuatnya dan menampilkan penjelasan, bukan
 * diam-diam menyuntik skrip pihak ketiga ke halaman.
 *
 * Menambah host baru TIDAK dilakukan lewat edit kode: daftarkan lewat
 * `VITE_STREAMAN_TRUSTED_MEDIA_HOSTS` (CSV) — digabung dengan daftar bawaan di bawah.
 */

/** Bawaan: penanam video resmi/umum untuk trailer dari provider metadata. */
const DEFAULT_TRUSTED_HOSTS = [
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "www.youtube.com",
  "youtube.com",
  "m.youtube.com",
  "player.vimeo.com",
  "www.dailymotion.com",
  "www.crunchyroll.com",
];

function normalizeHost(value: string): string {
  let host = value.trim().toLowerCase();
  if (!host) return "";
  // terima juga penulisan "https://host/path" di dalam config
  try {
    host = new URL(host.includes("://") ? host : `https://${host}`).host;
  } catch {
    /* biarkan apa adanya; perbandingan tetap exact-match */
  }
  return host.replace(/^www\./, "").replace(/\.$/, "");
}

let cached: string[] | null = null;

/** Daftar host yang dipercaya: bawaan + config + host gateway (bila terpasang). */
export function trustedMediaHosts(): string[] {
  if (cached) return cached;
  const gateway = gatewayHost();
  cached = [
    ...new Set(
      [...DEFAULT_TRUSTED_HOSTS, ...config.extraTrustedMediaHosts, ...(gateway ? [gateway] : [])]
        .map(normalizeHost)
        .filter(Boolean),
    ),
  ];
  return cached;
}

export function urlHost(raw: string): string | undefined {
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return undefined;
  }
}

/** hanya https: — http: rawan sniffing dan umumnya ditolak browser modern (mixed content). */
function isHttps(raw: string): boolean {
  try {
    return new URL(raw).protocol === "https:";
  } catch {
    return false;
  }
}

export function isTrustedMediaHost(host?: string): boolean {
  if (!host) return false;
  // Samakan kedua sisi: "www.youtube.com" ≡ entri "youtube.com".
  const h = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  // Exact match atau subdomain dari entri allowlist (mis. cdn.gateway → gateway).
  return trustedMediaHosts().some((entry) => h === entry || h.endsWith(`.${entry}`));
}

/**
 * Guard yang dipakai Watch.tsx. `undefined`/string kosong → false (bukan error:
 * artinya memang tidak ada sumber untuk sumber daya tersebut).
 */
export function isTrustedMediaUrl(raw?: string): boolean {
  if (!raw) return false;
  if (!isHttps(raw)) return false;
  return isTrustedMediaHost(urlHost(raw));
}



