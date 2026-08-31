import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Calendar, Clock, ExternalLink, Film, ListVideo, Play, Star } from "lucide-react";
import { useAnimeFix } from "../hooks/useAnime";
import { formatRating, watchHref } from "../components/AnimeCard";
import { Chip, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { TracePanel } from "../components/TracePanel";
import { trailerSrc } from "../utils/media";
import type { DetailHint } from "../lib/service";
import type { Anime } from "../lib/types";

/**
 * ANIME DETAIL — STREAMAN.
 *
 * Route: /anime/:animeId (?t= judul & y= tahun — hint untuk identity resolution).
 *
 *  - `useAnimeFix` merangkai detail → episodes dengan urutan dan abort yang benar
 *    (episode hanya diminta setelah anime terselesaikan, dan hanya pada provider
 *    pemilik id — invarian identity isolation di service.ts).
 *  - Trailer resmi ditampilkan TERPISAH sebagai konten informasi (allowlist host),
 *    bukan sebagai pengganti episode.
 *  - Daftar episode kosong = empty state jujur (tanpa episode sintetis).
 */

function Facts({ anime }: { anime: Anime }) {
  const rows: Array<[string, string]> = [];
  if (anime.type !== "Unknown") rows.push(["Tipe", anime.type]);
  if (anime.statusLabel || anime.status !== "unknown") rows.push(["Status", anime.statusLabel ?? anime.status]);
  if (anime.year) rows.push(["Tahun", String(anime.year)]);
  if (anime.season) rows.push(["Musim", anime.season]);
  if (anime.studio) rows.push(["Studio", anime.studio]);
  if (anime.episodesTotal) rows.push(["Episode", `${anime.episodesTotal} eps`]);
  if (anime.episodeDurationMin) rows.push(["Durasi", `${anime.episodeDurationMin} menit`]);
  if (anime.airedLabel) rows.push(["Tayang", anime.airedLabel]);
  if (anime.ageRating) rows.push(["Rating usia", anime.ageRating]);
  if (anime.source) rows.push(["Sumber", anime.source]);
  const rating = formatRating(anime.rating);
  if (rating) rows.push(["Skor", `${rating}${anime.scoreCount ? ` · ${anime.scoreCount} suara` : ""}`]);
  if (anime.members) rows.push(["Anggota", anime.members.toLocaleString("id-ID")]);

  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k} className="border-t border-white/[0.06] pt-2">
          <dt className="font-mono text-[10px] tracking-[0.16em] text-bone-500 uppercase">{k}</dt>
          <dd className="mt-0.5 text-sm text-bone-100">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 sm:flex-row">
        <Skeleton className="aspect-[2/3] w-40 shrink-0 sm:w-48" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}

export function AnimeDetail() {
  const { animeId } = useParams();
  const [sp] = useSearchParams();

  const hint = useMemo<DetailHint>(() => {
    const t = sp.get("t")?.trim();
    const y = Number(sp.get("y"));
    return {
      title: t || undefined,
      year: Number.isInteger(y) && y >= 1000 ? y : undefined,
    };
  }, [sp]);

  const fix = useAnimeFix(animeId, hint);
  const { detail, episodes } = fix;
  const anime = fix.anime;

  /* ── loading ── */
  if (detail.state.status === "loading" || detail.state.status === "idle") {
    return <DetailSkeleton />;
  }

  /* ── error detail ── */
  if (detail.state.status === "error" && !anime) {
    return (
      <ErrorState
        code={detail.state.error?.code}
        message={detail.state.error?.message}
        attempts={detail.state.error?.attempts}
        onRetry={fix.reload}
        className="mx-auto max-w-2xl"
      />
    );
  }

  if (!anime) return null;

  const trailer = trailerSrc(anime.trailer);
  const rating = formatRating(anime.rating);
  const episodeData = episodes.state.data ?? [];

  return (
    <div className="space-y-10">
      {/* ── header ── */}
      <header className="flex flex-col gap-6 sm:flex-row">
        <div className="w-40 shrink-0 self-start overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900 sm:w-48">
          {anime.poster ? (
            <img
              src={anime.poster}
              alt={anime.title}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="aspect-[2/3] w-full object-cover"
            />
          ) : (
            <div className="grid aspect-[2/3] w-full place-items-center px-4 text-center">
              <span className="font-display text-sm leading-tight font-extrabold text-bone-400">{anime.title}</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl leading-tight font-extrabold tracking-tight text-bone-50 sm:text-3xl">
              {anime.title}
            </h1>
            {(anime.titleEnglish || anime.titleNative) && (
              <p className="text-sm text-bone-400">
                {[anime.titleEnglish, anime.titleNative].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone="sky">{anime.provider}</Chip>
            {anime.status === "airing" && <Chip tone="mint">airing</Chip>}
            {anime.type !== "Unknown" && <Chip>{anime.type}</Chip>}
            {rating && (
              <Chip tone="amber">
                <Star className="size-3" /> {rating}
              </Chip>
            )}
            {anime.episodesTotal && (
              <Chip>
                <Film className="size-3" /> {anime.episodesTotal} eps
              </Chip>
            )}
            {anime.episodeDurationMin && (
              <Chip>
                <Clock className="size-3" /> {anime.episodeDurationMin} min
              </Chip>
            )}
            {anime.year && (
              <Chip>
                <Calendar className="size-3" /> {anime.year}
              </Chip>
            )}
            {anime.url && (
              <a
                href={anime.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[10px] text-bone-500 underline decoration-dotted hover:text-signal-400"
              >
                halaman provider <ExternalLink className="size-3" />
              </a>
            )}
          </div>

          {anime.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {anime.genres.map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-bone-300"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {anime.synopsis && <p className="max-w-3xl text-sm leading-relaxed text-bone-300">{anime.synopsis}</p>}
        </div>
      </header>

      {/* ── trailer resmi (konten informasi, bukan pengganti episode) ── */}
      {trailer && (
        <section className="space-y-2.5">
          <h2 className="font-display text-base font-extrabold tracking-tight text-bone-50">Trailer resmi</h2>
          <div className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900">
            <iframe
              src={trailer}
              title={`Trailer ${anime.title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 size-full"
            />
          </div>
          <p className="text-xs text-bone-500">
            Trailer adalah pratinjau resmi dari metadata provider — bukan pengganti episode. Episode-stream hanya
            datang dari provider konten via gateway berlisensi.
          </p>
        </section>
      )}

      {/* ── fakta ── */}
      <section className="space-y-3">
        <h2 className="font-display text-base font-extrabold tracking-tight text-bone-50">Fakta</h2>
        <Facts anime={anime} />
        {detail.state.meta && <TracePanel meta={detail.state.meta} title="rantai fallback detail" />}
      </section>

      {/* ── episode ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ListVideo className="size-4 text-signal-400" />
          <h2 className="font-display text-base font-extrabold tracking-tight text-bone-50">
            Episode{episodeData.length > 0 ? ` (${episodeData.length})` : ""}
          </h2>
        </div>

        {episodes.state.status === "loading" && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        )}

        {episodes.state.status === "error" && episodes.state.error && (
          <ErrorState
            code={episodes.state.error.code}
            message={episodes.state.error.message}
            attempts={episodes.state.error.attempts}
            onRetry={episodes.reload}
          />
        )}

        {episodes.state.status === "success" && episodeData.length === 0 && (
          <EmptyState
            title="Belum ada daftar episode"
            hint="Provider ini belum menyediakan daftar episode untuk judul ini (mis. film atau metadata belum lengkap). Tidak ada episode yang dibuat-buat — episode-stream hanya tersedia dari provider konten via gateway berlisensi."
          />
        )}

        {episodeData.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {episodeData.map((ep) => (
              <Link
                key={ep.id}
                to={watchHref(anime, ep.id)}
                title={ep.title ?? `Episode ${ep.number}`}
                className="group rounded-xl border border-white/[0.08] bg-ink-850/70 px-3 py-2.5 transition hover:border-signal-500/45 hover:bg-ink-850"
              >
                <span className="flex items-center gap-1 font-mono text-[10px] tracking-wider text-bone-500 uppercase">
                  <Play className="size-3 text-bone-500 transition group-hover:text-signal-400" /> Episode
                </span>
                <span className="mt-0.5 block font-display text-sm font-bold text-bone-50">
                  {String(ep.number).padStart(2, "0")}
                </span>
                {ep.title && <span className="mt-0.5 block truncate text-[11px] text-bone-400">{ep.title}</span>}
                {(ep.filler || ep.recap) && (
                  <span className="mt-1 flex gap-1">
                    {ep.filler && <Chip tone="amber">filler</Chip>}
                    {ep.recap && <Chip>recap</Chip>}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}

        {episodes.state.meta && <TracePanel meta={episodes.state.meta} title="rantai fallback episode" />}
      </section>
    </div>
  );
}
