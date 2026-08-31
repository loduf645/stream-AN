import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Search as SearchIcon } from "lucide-react";
import { AnimeGrid } from "../components/AnimeCard";
import { EmptyState, ErrorState, Skeleton } from "../components/ui";
import { TracePanel } from "../components/TracePanel";
import { searchAnime } from "../lib/service";
import { useAsync } from "../hooks/useAsync";
import type { ListResult } from "../lib/types";

/**
 * SEARCH — STREAMAN.
 *
 * Route: /search?q=&page=
 *
 *  - `q` dibaca dari URL (bisa di-set dari form header Layout maupun form di sini).
 *  - Pencarian minimal 2 huruf; hasil kosong dianggap jawaban SAH (empty state),
 *    bukan sinyal fallback (lihat kebijakan search di service.ts).
 *  - Paginasi via tombol Sebelumnya/Berikutnya yang menulis ulang ?page=.
 */

const PAGE_SIZE_LABEL = 20;

export function Search() {
  const [sp, setSp] = useSearchParams();
  const q = (sp.get("q") ?? "").trim();
  const rawPage = Number(sp.get("page") ?? "1");
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const [input, setInput] = useState(q);

  const { state, reload } = useAsync<ListResult>(
    (signal) => searchAnime(q, page, signal),
    [q, page],
    q.length >= 2,
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (v.length < 2) return;
    setSp({ q: v });
  };

  const goToPage = (nextPage: number) => {
    const next = new URLSearchParams(sp);
    next.set("q", q);
    next.set("page", String(nextPage));
    setSp(next);
  };

  const hasQuery = q.length > 0;
  const tooShort = hasQuery && q.length < 2;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="flex max-w-xl items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/[0.09] bg-ink-850 px-3.5 py-2.5 transition focus-within:border-signal-500/60">
          <SearchIcon className="size-4 shrink-0 text-bone-500" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="cari anime…"
            aria-label="Cari anime"
            className="w-full bg-transparent text-sm text-bone-50 placeholder:text-bone-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={input.trim().length < 2}
          className="inline-flex items-center gap-2 rounded-xl bg-signal-500 px-4 py-2.5 font-mono text-[11px] font-bold tracking-wider text-white uppercase transition hover:bg-signal-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cari <ArrowRight className="size-4" />
        </button>
      </form>

      {!hasQuery && (
        <EmptyState title="Cari anime" hint="Ketik minimal 2 huruf untuk mulai mencari di seluruh provider." />
      )}

      {tooShort && (
        <EmptyState title="Kata kunci terlalu pendek" hint="Ketik minimal 2 huruf untuk mulai mencari." />
      )}

      {state.status === "loading" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: PAGE_SIZE_LABEL }).map((_, i) => (
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
          <EmptyState
            title="Tidak ditemukan"
            hint={`Tidak ada hasil untuk "${q}". Coba judul yang lebih pendek atau kata kunci lain.`}
          />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-display text-lg font-extrabold tracking-tight text-bone-50">
                Hasil untuk <span className="text-signal-400">“{q}”</span>
              </h2>
              <span className="font-mono text-xs text-bone-500">
                {state.data.total ?? state.data.items.length} hasil · halaman {page}
              </span>
            </div>

            <AnimeGrid items={state.data.items} />

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 font-mono text-[11px] tracking-wider text-bone-100 uppercase transition hover:border-signal-500/60 hover:text-signal-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="size-4" /> Sebelumnya
              </button>
              <span className="px-2 font-mono text-xs text-bone-500">halaman {page}</span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={!state.data.hasNext}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 font-mono text-[11px] tracking-wider text-bone-100 uppercase transition hover:border-signal-500/60 hover:text-signal-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Berikutnya <ChevronRight className="size-4" />
              </button>
            </div>

            {state.meta && <TracePanel meta={state.meta} title="rantai fallback pencarian" className="max-w-2xl" />}
          </div>
        )
      )}
    </div>
  );
}
