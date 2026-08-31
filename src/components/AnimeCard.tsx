import { useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { Chip } from "./ui";
import type { Anime } from "../lib/types";

/**
 * Kartu anime + pembangun URL — STREAMAN.
 *
 * Semua tautan internal HARUS lewat detailHref/watchHref supaya query hint
 * (`?t=` judul, `?y=` tahun) selalu ikut. Hint itulah yang mengizinkan
 * `getAnimeDetail` melakukan identity resolution ke provider lain secara sah
 * TANPA pernah mengirim nativeId lintas provider (lihat service.ts).
 */

function hintParams(anime: Anime): string {
  const q = new URLSearchParams();
  q.set("t", anime.title);
  if (anime.year) q.set("y", String(anime.year));
  return q.toString();
}

export function detailHref(anime: Anime): string {
  return `/anime/${encodeURIComponent(anime.id)}?${hintParams(anime)}`;
}

/**
 * Tanpa `episodeId`, Watch hanya memutar sesuatu bila anime punya tepat satu
 * entri episode (film). Karena kartu di Home/Search belum tahu daftar episode,
 * CTA mereka mengarah ke detail — bukan ke Watch kosong.
 */
export function watchHref(anime: Anime, episodeId?: string): string {
  const watch = episodeId ? `/watch/${encodeURIComponent(episodeId)}` : "/watch";
  return `/anime/${encodeURIComponent(anime.id)}${watch}?${hintParams(anime)}`;
}

export function formatRating(rating?: number): string | undefined {
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating <= 0) return undefined;
  return String(Math.round(rating * 100) / 100);
}

function Poster({ anime }: { anime: Anime }) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(anime.poster) && !broken;
  return (
    <div className="relative aspect-[2/3] w-full overflow-hidden bg-ink-900">
      {showImage ? (
        <img
          src={anime.poster}
          alt={anime.title}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="grid size-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(255,81,56,.18),transparent_60%)] px-3 text-center">
          <span className="line-clamp-3 font-display text-sm leading-tight font-extrabold text-bone-400">{anime.title}</span>
        </div>
      )}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-transparent opacity-80" />
    </div>
  );
}

export function AnimeCard({ anime, rank }: { anime: Anime; rank?: number }) {
  const rating = formatRating(anime.rating);
  return (
    <article className="group relative overflow-hidden rounded-xl border border-white/[0.07] bg-ink-850/70 transition hover:border-signal-500/45 hover:bg-ink-850">
      <Link to={detailHref(anime)} className="block" title={anime.title}>
        <Poster anime={anime} />
        {typeof rank === "number" && (
          <span className="absolute top-1.5 left-1.5 rounded-md bg-ink-950/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-signal-400">
            #{rank}
          </span>
        )}
        <div className="space-y-1.5 p-2.5">
          <h3 className="line-clamp-2 text-[13px] leading-snug font-semibold text-bone-100 transition group-hover:text-bone-50">
            {anime.title}
          </h3>
          <p className="font-mono text-[10px] text-bone-500">
            {anime.type !== "Unknown" ? anime.type : "TV"} · {anime.year ?? "—"}
            {anime.episodesTotal ? ` · ${anime.episodesTotal} eps` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <Chip>{anime.provider}</Chip>
            {anime.status === "airing" && <Chip tone="mint">airing</Chip>}
            {rating && (
              <span className="ml-auto flex items-center gap-0.5 font-mono text-[10px] text-amber-signal">
                <Star className="size-3" /> {rating}
              </span>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}

/** Grid responsif standar untuk rail Home dan hasil Search. */
export function AnimeGrid({ items, ranked = false }: { items: Anime[]; ranked?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((a, i) => (
        <AnimeCard key={a.id} anime={a} rank={ranked ? i + 1 : undefined} />
      ))}
    </div>
  );
}



