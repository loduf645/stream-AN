import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { cn } from "../utils/cn";
import type { Attempt, StreamAnErrorCode } from "../lib/types";

/**
 * Primitif UI bersama — STREAMAN.
 * Sengaja kecil: hanya blok yang benar-benar dipakai ulang oleh Layout, pages,
 * Watch, dan TracePanel. Tidak ada design system di luar ini.
 */

/* ══════════════════════════════════ Chip ══════════════════════════════════ */

export type ChipTone = "neutral" | "signal" | "mint" | "sky" | "amber";

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: "border-white/[0.09] bg-white/[0.04] text-bone-300",
  signal: "border-signal-500/30 bg-signal-500/12 text-signal-400",
  mint: "border-mint/25 bg-mint/[0.10] text-mint",
  sky: "border-sky-signal/25 bg-sky-signal/[0.10] text-sky-signal",
  amber: "border-amber-signal/25 bg-amber-signal/[0.10] text-amber-signal",
};

export function Chip({ children, tone = "neutral", className }: { children: ReactNode; tone?: ChipTone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-none tracking-wide uppercase",
        CHIP_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ══════════════════════════════ Skeleton ══════════════════════════════════ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} aria-hidden />;
}

/* ═════════════════════════════ EmptyState ═════════════════════════════════ */

export function EmptyState({ title, hint, action, className }: { title: string; hint?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-white/[0.10] bg-ink-850/40 px-5 py-8 text-center", className)}>
      <span className="mx-auto grid size-10 place-items-center rounded-xl bg-white/[0.05] text-bone-400">
        <Inbox className="size-5" />
      </span>
      <h3 className="mt-3 font-display text-base font-extrabold text-bone-50">{title}</h3>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-bone-400">{hint}</p>}
      {action && <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

/* ═════════════════════════════ ErrorState ═════════════════════════════════ */

/** Pesan penutup per kode — jujur soal penyebab, tanpa menjanjikan retry yang percuma. */
const CODE_HINT: Partial<Record<StreamAnErrorCode, string>> = {
  RATE_LIMITED: "Provider membatasi laju permintaan. Tunggu beberapa saat, lalu coba lagi.",
  TIMEOUT: "Provider terlalu lama menjawab. Koneksi atau load provider sedang lambat.",
  NETWORK: "Permintaan tidak sampai ke provider (offline, DNS, atau CORS).",
  NOT_FOUND: "Data tidak ada di provider yang menjawab. Coba cari dengan judul lengkap.",
  EMPTY_RESULT: "Provider menjawab, tapi hasilnya memang kosong.",
  INVALID_RESPONSE: "Provider mengirim data di luar bentuk yang diharapkan.",
  CONFIG_MISSING: "Ada konfigurasi yang belum diisi (lihat panel providers di kanan atas).",
  SOURCE_UNAVAILABLE: "Sumber episode-stream butuh backend internal berlisensi — tidak ada bypass di sisi klien.",
  EPISODE_NOT_FOUND: "Episode tidak cocok dengan anime aktif (identity mismatch).",
  PROVIDER_UNAVAILABLE: "Semua provider pada rantai fallback gagal menjawab.",
};

export function ErrorState({
  code,
  message,
  attempts,
  onRetry,
  compact,
  className,
}: {
  code?: StreamAnErrorCode;
  message?: string;
  attempts?: Attempt[];
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const failed = attempts?.filter((a) => a.status === "fail").length ?? 0;
  const skipped = attempts?.filter((a) => a.status === "skipped").length ?? 0;
  return (
    <div
      role="alert"
      className={cn(
        "rounded-2xl border border-signal-500/25 bg-signal-500/[0.06]",
        compact ? "p-3" : "p-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-signal-500/15 text-signal-400">
          <AlertTriangle className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-sm font-extrabold text-bone-50">Gagal memuat data</h3>
            {code && <Chip tone="signal">{code}</Chip>}
            {attempts && attempts.length > 0 && (
              <span className="font-mono text-[10px] text-bone-500">
                {failed} gagal · {skipped} di-skip
              </span>
            )}
          </div>
          {message && <p className="mt-1 text-sm leading-relaxed break-words text-bone-300">{message}</p>}
          {code && CODE_HINT[code] && <p className="mt-1 text-xs leading-relaxed text-bone-500">{CODE_HINT[code]}</p>}
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 font-mono text-[10.5px] tracking-wider text-bone-100 uppercase transition hover:border-signal-500/60 hover:text-signal-400"
          >
            <RefreshCw className="size-3.5" /> coba lagi
          </button>
        )}
      </div>
    </div>
  );
}





