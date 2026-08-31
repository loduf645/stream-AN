import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "../utils/cn";
import { Chip } from "./ui";
import type { Attempt, RequestMeta } from "../lib/types";

/**
 * TracePanel — jejak rantai fallback provider, apa adanya — STREAMAN.
 *
 * Dipasang di setiap blok data (Home/Search/Detail/Watch). Filosofinya: UI tidak
 * boleh menyamarkan dari mana data datang. Kalau hasil akhirnya berasal dari
 * metadata fallback atau dari cache, panel ini menunjukkannya; kalau ada provider
 * yang di-skip karena konfigurasi, alasannya terbaca di sini.
 */

const STATUS_TONE = {
  ok: "mint",
  fail: "signal",
  skipped: "neutral",
} as const;

function Row({ attempt }: { attempt: Attempt }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-white/[0.06] py-1.5 first:border-t-0">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Chip tone={STATUS_TONE[attempt.status]}>{attempt.status}</Chip>
        <span className="truncate font-mono text-[10.5px] text-bone-200">{attempt.provider}</span>
        <span className="font-mono text-[10px] text-bone-500">{attempt.operation}</span>
        {attempt.code && <span className="font-mono text-[10px] text-signal-400">{attempt.code}</span>}
      </div>
      <span className="font-mono text-[10px] text-bone-500">{attempt.ms} ms</span>
      {attempt.message && <p className="col-span-2 text-[11px] leading-relaxed break-words text-bone-500">{attempt.message}</p>}
    </div>
  );
}

export function TracePanel({ meta, title = "rantai fallback", className }: { meta: RequestMeta; title?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const fails = meta.attempts.filter((a) => a.status === "fail").length;
  const skips = meta.attempts.filter((a) => a.status === "skipped").length;

  return (
    <div className={cn("rounded-xl border border-white/[0.07] bg-ink-850/60", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-white/[0.03]"
      >
        <span className="font-mono text-[10px] tracking-[0.18em] text-bone-500 uppercase">{title}</span>
        <Chip tone="sky" className="ml-0.5">via {meta.resolvedBy ?? "tidak ada"}</Chip>
        {meta.fallbackUsed && <Chip tone="amber">fallback</Chip>}
        {meta.cached && <Chip>cache</Chip>}
        {fails > 0 && <Chip tone="signal">{fails} gagal</Chip>}
        {skips > 0 && <Chip>{skips} skip</Chip>}
        <span className="ml-auto font-mono text-[10px] text-bone-500">{meta.ms} ms</span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-bone-500 transition-transform", open && "rotate-180")} />
      </button>

      {meta.note && (
        <p className="flex items-start gap-2 border-t border-white/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-signal">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>{meta.note}</span>
        </p>
      )}

      {open && (
        <div className="border-t border-white/[0.06] px-3 py-1.5">
          {meta.attempts.length === 0 ? (
            <p className="py-1 text-[11px] text-bone-500">Tidak ada percobaan provider yang tercatat.</p>
          ) : (
            meta.attempts.map((a, i) => <Row key={`${a.provider}:${a.operation}:${i}`} attempt={a} />)
          )}
        </div>
      )}
    </div>
  );
}





