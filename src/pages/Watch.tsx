import { useCallback, useEffect, useMemo } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, ListVideo, Play, SquarePlay, Volume2 } from "lucide-react";
import { useAnimeFix } from "../hooks/useAnime";
import { useAsync } from "../hooks/useAsync";
import { resolvePlayback, type Playback } from "../lib/service";
import { StreamAnError } from "../lib/errors";
import { isTrustedMediaUrl } from "../lib/security";
import { detailHref, watchHref } from "../components/AnimeCard";
import { Chip, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { TracePanel } from "../components/TracePanel";
import { trailerSrc } from "../utils/media";
import { cn } from "../utils/cn";
import type { DetailHint } from "../lib/service";
import type { Anime, Episode, StreamSource } from "../lib/types";

/**
 * WATCH — STREAMAN.
 *
 * Route: /anime/:animeId/watch[/:episodeId]
 *   - episodeId opsional → bila anime punya tepat satu episode, langsung diputar.
 *   - Shortcut keyboard: ← / → untuk episode sebelumnya/berikutnya.
 *
 * Jujur soal sumber: episode-stream HANYA dari content provider via gateway
 * berlisensi, dan setiap embed/file URL dilewatkan allowlist host
 * (src/lib/security.ts). Trailer resmi ditampilkan terpisah sebagai konten
 * informasi bila episode-stream tidak tersedia — bukan pengganti episode.
 */

function playbackPreferredSource(sources: StreamSource[]): { source: StreamSource; mode: "embed" | "file" } | undefined {
  const embed = sources.find((s) => s.embedUrl && isTrustedMediaUrl(s.embedUrl));
  if (embed) return { source: embed, mode: "embed" };
  const file = sources.find((s) => s.fileUrl && isTrustedMediaUrl(s.fileUrl));
  if (file) return { source: file, mode: "file" };
  return undefined;
}

function TrailerBlock({ anime }: { anime: Anime }) {
  const src = trailerSrc(anime.trailer);
  if (!src) return null;
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Volume2 className="size-4 text-bone-400" />
        <h2 className="font-display text-sm font-extrabold tracking-tight text-bone-50">Trailer resmi</h2>
        <Chip>pratinjau — bukan episode</Chip>
      </div>
      <div className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900">
        <iframe
          src={src}
          title={`Trailer ${anime.title}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 size-full"
        />
      </div>
      <p className="max-w-3xl text-xs leading-relaxed text-bone-500">
        Trailer resmi dari metadata provider adalah konten informasi, bukan pengganti episode. Episode-stream hanya
        tersedia dari provider konten (OtakuDesu/KuramaAnime/Oploverz) via gateway berlisensi.
      </p>
    </section>
  );
}

export function Watch() {
  const { animeId, episodeId } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();

  const hint = useMemo<DetailHint>(() => {
    const t = sp.get("t")?.trim();
    const y = Number(sp.get("y"));
    return {
      title: t || undefined,
      year: Number.isInteger(y) && y >= 1000 ? y : undefined,
    };
  }, [sp]);

  const fix = useAnimeFix(animeId, hint);
  const anime = fix.anime;
  const episodeData = fix.episodes.state.data ?? [];

  const selected = useMemo<Episode | undefined>(() => {
    if (episodeData.length === 0) return undefined;
    if (episodeId) return episodeData.find((e) => e.id === episodeId);
    return episodeData.length === 1 ? episodeData[0] : undefined;
  }, [episodeData, episodeId]);

  const playback = useAsync<Playback>(
    (signal) => {
      if (!anime || !selected) {
        return Promise.reject(new StreamAnError("EPISODE_NOT_FOUND", "Episode belum dipilih."));
      }
      return resolvePlayback(anime, selected, signal);
    },
    [anime?.id, selected?.id],
    Boolean(anime && selected),
  );

  const selectedIndex = selected ? episodeData.findIndex((e) => e.id === selected.id) : -1;
  const prevEpisode = selectedIndex > 0 ? episodeData[selectedIndex - 1] : undefined;
  const nextEpisode = selectedIndex >= 0 && selectedIndex < episodeData.length - 1 ? episodeData[selectedIndex + 1] : undefined;

  const goEpisode = useCallback(
    (delta: number) => {
      if (!anime) return;
      const target = delta < 0 ? prevEpisode : nextEpisode;
      if (target) nav(watchHref(anime, target.id));
    },
    [anime, prevEpisode, nextEpisode, nav],
  );

  /* Shortcut keyboard ← → */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goEpisode(-1);
      else if (e.key === "ArrowRight") goEpisode(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goEpisode]);

  /* ── detail loading ── */
  if (fix.detail.state.status === "loading" || fix.detail.state.status === "idle") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="aspect-video w-full" />
        <div className="no-scrollbar flex gap-2 overflow-x-auto py-1">
          {Array.from({ length: 16 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-14 shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  /* ── detail error ── */
  if (fix.detail.state.status === "error" && !anime) {
    return (
      <ErrorState
        code={fix.detail.state.error?.code}
        message={fix.detail.state.error?.message}
        attempts={fix.detail.state.error?.attempts}
        onRetry={fix.reload}
        className="mx-auto max-w-2xl"
      />
    );
  }

  if (!anime) return null;

  const episodesSettled = fix.episodes.state.status === "success" || fix.episodes.state.status === "error";
  const requestedMissing = Boolean(episodeId) && !selected && fix.episodes.state.status === "success" && episodeData.length > 0;
  const playbackError = playback.state.status === "error" ? playback.state.error : undefined;
  const playbackSources = playback.state.status === "success" ? playback.state.data?.sources : undefined;
  const preferred = playbackSources ? playbackPreferredSource(playbackSources) : undefined;
  const untrusted = playbackSources && !preferred ? playbackSources : undefined;

  return (
    <div className="space-y-6">
      {/* ── breadcrumb ── */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          to={detailHref(anime)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] tracking-wider text-bone-100 uppercase transition hover:border-signal-500/60 hover:text-signal-400"
        >
          <ChevronLeft className="size-4" /> Detail
        </Link>
        <span className="font-mono text-xs text-bone-500">{anime.provider}</span>
        <h1 className="min-w-0 truncate font-display text-base font-extrabold tracking-tight text-bone-50">{anime.title}</h1>
      </div>

      {/* ── player ── */}
      <section className="space-y-3">
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900">
          {/* loading */}
          {playback.state.status !== "success" &&
            playback.state.status !== "error" &&
            (selected || fix.episodes.state.status === "loading") && (
              <div className="absolute inset-0 grid place-items-center">
                <div className="flex items-center gap-3 text-bone-400">
                  <span className="size-4 animate-spin-slow rounded-full border-2 border-bone-500 border-t-transparent" />
                  <span className="font-mono text-[11px] tracking-wider uppercase">
                    {selected ? "menyiapkan pemutar…" : "memuat daftar episode…"}
                  </span>
                </div>
              </div>
            )}

          {/* embed / file (hanya sumber trusted) */}
          {preferred && preferred.mode === "embed" && preferred.source.embedUrl && (
            <iframe
              src={preferred.source.embedUrl}
              title={`Episode ${selected?.number} — ${anime.title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="no-referrer"
              className="absolute inset-0 size-full"
            />
          )}
          {preferred && preferred.mode === "file" && preferred.source.fileUrl && (
            <video
              src={preferred.source.fileUrl}
              controls
              autoPlay
              playsInline
              className="absolute inset-0 size-full"
            />
          )}

          {/* belum ada episode dipilih (setelah daftar episode selesai dimuat) */}
          {!selected && fix.episodes.state.status !== "loading" && (
            <div className="absolute inset-0 grid place-items-center px-6 text-center">
              <div className="space-y-2">
                <SquarePlay className="mx-auto size-8 text-bone-500" />
                <p className="font-display text-sm font-bold text-bone-200">
                  {episodeData.length > 1 ? "Pilih episode untuk mulai menonton" : "Episode belum tersedia"}
                </p>
                <p className="mx-auto max-w-md text-xs leading-relaxed text-bone-500">
                  Episode-stream hanya tersedia dari provider konten via gateway berlisensi. Tanpa gateway, Watch
                  menampilkan trailer resmi sebagai konten informasi.
                </p>
              </div>
            </div>
          )}

          {/* sumber ditolak allowlist */}
          {untrusted && untrusted.length > 0 && (
            <div className="absolute inset-0 overflow-y-auto bg-ink-950/95 p-4">
              <div className="mx-auto max-w-lg space-y-3 py-4">
                <h3 className="font-display text-sm font-extrabold text-signal-400">Sumber video ditolak</h3>
                <p className="text-xs leading-relaxed text-bone-400">
                  Host media berikut tidak ada di allowlist (atau tidak https) — ditolak demi keamanan. Tambahkan
                  host tepercaya lewat <code className="font-mono text-bone-300">VITE_STREAMAN_TRUSTED_MEDIA_HOSTS</code>.
                </p>
                <div className="space-y-2">
                  {untrusted.map((s, i) => {
                    const url = s.embedUrl ?? s.fileUrl;
                    let host = "—";
                    try {
                      host = url ? new URL(url).host : "—";
                    } catch {
                      /* biarkan host default */
                    }
                    return (
                      <div key={i} className="rounded-lg border border-white/[0.07] bg-ink-850 px-3 py-2">
                        <p className="truncate font-mono text-[11px] text-bone-200">{url}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-bone-500">
                          host: {host} · {s.quality ? `${s.quality} · ` : ""}
                          {s.authorized ? "authorized" : "tidak authorized"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* info episode aktif */}
        {selected && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-extrabold tracking-tight text-bone-50">
              Episode {String(selected.number).padStart(2, "0")}
            </span>
            {selected.title && <span className="text-sm text-bone-400">{selected.title}</span>}
            {selected.aired && (
              <span className="font-mono text-[10px] text-bone-500">{selected.aired}</span>
            )}
            {selected.filler && <Chip tone="amber">filler</Chip>}
            {selected.recap && <Chip>recap</Chip>}
            <Chip tone="sky">{selected.providerId}</Chip>
            {playback.state.status === "success" && playbackSources && (
              <span className="font-mono text-[10px] text-bone-500">
                {playbackSources.length} sumber authorized
              </span>
            )}
          </div>
        )}

        {/* error playback → jujur soal penyebab */}
        {playbackError && (
          <ErrorState
            code={playbackError.code}
            message={playbackError.message}
            attempts={playbackError.attempts}
            onRetry={playback.reload}
          />
        )}

        {/* trailer resmi hanya saat episode-stream tidak tersedia (setelah daftar episode selesai dimuat) */}
        {episodesSettled && (!selected || playbackError || (untrusted && untrusted.length > 0)) && <TrailerBlock anime={anime} />}
      </section>

      {/* ── daftar episode ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ListVideo className="size-4 text-signal-400" />
          <h2 className="font-display text-sm font-extrabold tracking-tight text-bone-50">
            Daftar episode{episodeData.length > 0 ? ` (${episodeData.length})` : ""}
          </h2>
        </div>

        {fix.episodes.state.status === "loading" && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto py-1">
            {Array.from({ length: 16 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-14 shrink-0" />
            ))}
          </div>
        )}

        {fix.episodes.state.status === "error" && fix.episodes.state.error && (
          <ErrorState
            code={fix.episodes.state.error.code}
            message={fix.episodes.state.error.message}
            attempts={fix.episodes.state.error.attempts}
            onRetry={fix.episodes.reload}
          />
        )}

        {requestedMissing && (
          <p className="rounded-xl border border-amber-signal/25 bg-amber-signal/[0.06] px-3 py-2 text-xs leading-relaxed text-amber-signal">
            Episode yang diminta tidak ditemukan di daftar — pilih episode dari daftar di bawah.
          </p>
        )}

        {fix.episodes.state.status === "success" && episodeData.length === 0 && (
          <EmptyState
            title="Belum ada daftar episode"
            hint="Provider ini belum menyediakan daftar episode (mis. film atau metadata belum lengkap). Episode-stream hanya tersedia dari provider konten via gateway berlisensi."
          />
        )}

        {episodeData.length > 0 && (
          <>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {episodeData.map((ep) => (
                <Link
                  key={ep.id}
                  to={watchHref(anime, ep.id)}
                  title={ep.title ?? `Episode ${ep.number}`}
                  className={cn(
                    "flex h-11 w-14 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-bold transition",
                    ep.id === selected?.id
                      ? "border-signal-500 bg-signal-500 text-white"
                      : "border-white/[0.08] bg-ink-850/70 text-bone-300 hover:border-signal-500/45 hover:text-signal-400",
                  )}
                >
                  {ep.number}
                </Link>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => goEpisode(-1)}
                disabled={!prevEpisode}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 font-mono text-[11px] tracking-wider text-bone-100 uppercase transition hover:border-signal-500/60 hover:text-signal-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="size-4" /> Sebelumnya
              </button>
              <button
                onClick={() => goEpisode(1)}
                disabled={!nextEpisode}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 font-mono text-[11px] tracking-wider text-bone-100 uppercase transition hover:border-signal-500/60 hover:text-signal-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Berikutnya <ChevronRight className="size-4" />
              </button>
              <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] text-bone-500">
                <Play className="size-3" /> shortcut ← → untuk pindah episode
              </span>
            </div>
          </>
        )}

        {fix.episodes.state.meta && <TracePanel meta={fix.episodes.state.meta} title="rantai fallback episode" />}
        {playback.state.meta && <TracePanel meta={playback.state.meta} title="rantai sumber episode" />}
      </section>
    </div>
  );
}
