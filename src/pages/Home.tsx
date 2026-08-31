import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";
import { AnimeGrid } from "../components/AnimeCard";
import { EmptyState, ErrorState, Skeleton } from "../components/ui";
import { TracePanel } from "../components/TracePanel";
import { getLatest, getTrending } from "../lib/service";
import { useAsync } from "../hooks/useAsync";
import type { ListResult, Result } from "../lib/types";

/**
 * HOME — STREAMAN.
 *
 * Hero ringkas + dua rail: Trending dan Rilis Terbaru. Setiap rail memakai
 * service layer (getTrending/getLatest) lewat useAsync — fetch bisa di-abort
 * saat komponen unmount, dan jejak rantai fallback ditampilkan apa adanya
 * via TracePanel (dari mana data ini datang? metadata fallback? cache?).
 */

function ListRail({
  icon,
  title,
  run,
  emptyHint,
}: {
  icon: ReactNode;
  title: string;
  run: (signal: AbortSignal) => Promise<Result<ListResult>>;
  emptyHint: string;
}) {
  const { state, reload } = useAsync<ListResult>(run, []);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-display text-lg font-extrabold tracking-tight text-bone-50">{title}</h2>
        {state.status === "loading" && <Skeleton className="h-4 w-28" />}
      </div>

      {state.status === "loading" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3]" />
          ))}
        </div>
      )}

      {state.status === "error" && state.error && (
        <ErrorState
          code={state.error.code}
          message={state.error.message}
          attempts={state.error.attempts}
          onRetry={reload}
        />
      )}

      {state.status === "success" && state.data && (
        state.data.items.length === 0 ? (
          <EmptyState title="Belum ada data" hint={emptyHint} />
        ) : (
          <>
            <AnimeGrid items={state.data.items} />
            {state.meta && <TracePanel meta={state.meta} title={`${title.toLowerCase()} — rantai fallback`} />}
          </>
        )
      )}
    </section>
  );
}

export function Home() {
  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-ink-900/60 px-6 py-12 sm:px-10">
        <div className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-signal-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-16 size-72 rounded-full bg-sky-signal/10 blur-3xl" />
        <div className="relative max-w-2xl space-y-5">
          <p className="font-mono text-[11px] tracking-[0.28em] text-signal-400 uppercase">anime streaming — mvp core flow</p>
          <h1 className="font-display text-4xl leading-tight font-extrabold tracking-tight text-bone-50 sm:text-5xl">
            Stream<span className="text-signal-500">AN</span>
            <span className="mt-2 block text-lg font-bold text-bone-300 sm:text-xl">
              Home → Search → Detail → Episode → Watch
            </span>
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-bone-400">
            Katalog anime diambil lewat rantai fallback provider (OtakuDesu → KuramaAnime → Oploverz untuk
            konten; Jikan → AniList untuk metadata). Setiap respons menampilkan jejak provider asalnya —
            tidak ada data yang disamarkan.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/search"
              className="inline-flex items-center gap-2 rounded-xl bg-signal-500 px-5 py-2.5 font-mono text-[11px] font-bold tracking-wider text-white uppercase transition hover:bg-signal-600"
            >
              Cari anime <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/search"
              className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-5 py-2.5 font-mono text-[11px] tracking-wider text-bone-100 uppercase transition hover:border-mint/40 hover:text-mint"
            >
              Jelajahi katalog
            </Link>
          </div>
        </div>
      </section>

      <ListRail
        icon={<TrendingUp className="size-4 shrink-0 text-signal-400" />}
        title="Trending"
        run={(signal) => getTrending(12, signal)}
        emptyHint="Provider belum mengembalikan data trending. Coba muat ulang sebentar lagi."
      />

      <ListRail
        icon={<Sparkles className="size-4 shrink-0 text-mint" />}
        title="Rilis Terbaru"
        run={(signal) => getLatest(12, signal)}
        emptyHint="Provider belum mengembalikan rilisan terbaru. Coba muat ulang sebentar lagi."
      />
    </div>
  );
}
