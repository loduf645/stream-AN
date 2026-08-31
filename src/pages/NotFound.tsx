import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/**
 * NOT FOUND — STREAMAN.
 *
 * Route catch-all (`*`). Karena routing memakai HashRouter, halaman ini juga
 * menangani deep-link yang tidak dikenal tanpa konfigurasi rewrite server.
 */
export function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-5 py-16 text-center">
      <p className="font-mono text-[11px] tracking-[0.3em] text-signal-400 uppercase">error 404</p>
      <h1 className="font-display text-5xl font-extrabold tracking-tight text-bone-50">
        404<span className="text-signal-500">.</span>
      </h1>
      <p className="text-sm leading-relaxed text-bone-400">
        Halaman atau anime yang kamu cari tidak ditemukan. Periksa kembali tautannya, atau kembali ke beranda
        untuk menjelajahi katalog.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-xl bg-signal-500 px-5 py-2.5 font-mono text-[11px] font-bold tracking-wider text-white uppercase transition hover:bg-signal-600"
        >
          Ke beranda <ArrowRight className="size-4" />
        </Link>
        <Link
          to="/search"
          className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-5 py-2.5 font-mono text-[11px] tracking-wider text-bone-100 uppercase transition hover:border-mint/40 hover:text-mint"
        >
          Cari anime
        </Link>
      </div>
    </div>
  );
}
