import { useEffect, useState, type FormEvent } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Radio, Search, X } from "lucide-react";
import { cn } from "../utils/cn";
import { providerStatus } from "../lib/service";
import { hasGateway } from "../lib/config";
import { Chip } from "./ui";

function Mark() {
  return (
    <span className="relative grid size-9 shrink-0 place-items-center rounded-[10px] bg-signal-500 shadow-[0_0_0_1px_rgba(255,255,255,.14)_inset,0_10px_28px_-12px_rgba(255,81,56,.9)]">
      <svg viewBox="0 0 24 24" className="size-5 text-white" aria-hidden>
        <path d="M4 5.5h11.2a5.3 5.3 0 0 1 0 10.6H8.4L4 20.2V5.5Z" fill="currentColor" opacity=".92" />
        <circle cx="18.5" cy="6.5" r="2.1" fill="currentColor" />
      </svg>
    </span>
  );
}

function ProviderPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows = providerStatus();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={cn("fixed inset-0 z-50 transition", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
      <div className={cn("absolute inset-0 bg-ink-950/70 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={onClose} />
      <aside
        className={cn(
          "absolute top-0 right-0 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-ink-900 transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4">
          <Radio className="size-4 text-mint" />
          <h2 className="font-display text-lg font-extrabold">Provider & fallback</h2>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-bone-400 transition hover:bg-white/[0.06] hover:text-bone-50" aria-label="Tutup">
            <X className="size-4" />
          </button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <p className="text-sm text-bone-400">
            Frontend hanya bicara ke service layer internal. Urutan fallback:
            <span className="mt-1 block font-mono text-[11px] text-bone-200">
              OTAKUDESU → KURAMA → OPLOVERZ <span className="text-bone-500">(konten)</span> · JIKAN → ANILIST <span className="text-bone-500">(metadata saja)</span>
            </span>
            <span className="mt-1 block text-xs text-bone-500">
              Metadata fallback TIDAK pernah menjadi sumber episode/video — hanya katalog, detail, dan sinopsis.
            </span>
          </p>
          {rows.map((p, i) => (
            <div key={p.id} className="rounded-xl border border-white/[0.07] bg-ink-850/70 p-3.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-bone-500">#{i + 1}</span>
                <h3 className="font-display text-sm font-bold">{p.label}</h3>
                <Chip tone={p.tier === "content" ? "sky" : "neutral"} className="ml-1">
                  {p.tier === "content" ? "konten" : "metadata"}
                </Chip>
                <Chip tone={p.online ? "mint" : "signal"} className="ml-auto">
                  <span className={cn("size-1.5 rounded-full", p.online ? "animate-pulse-dot bg-mint" : "bg-signal-500")} />
                  {p.online ? "online" : "offline"}
                </Chip>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-bone-400">{p.reason}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {p.operations.map((op) => (
                  <Chip key={op}>{op}</Chip>
                ))}
                <a href={p.homepage} target="_blank" rel="noreferrer" className="ml-auto font-mono text-[10px] text-bone-500 underline decoration-dotted hover:text-signal-400">
                  {p.kind}
                </a>
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-amber-signal/25 bg-amber-signal/[0.06] p-3.5">
            <h3 className="font-display text-sm font-bold text-amber-signal">Dependency yang belum tersedia</h3>
            <p className="mt-1 text-xs leading-relaxed text-bone-300">
              Stream episode membutuhkan backend internal <span className="font-mono">VITE_STREAMAN_GATEWAY_URL</span> di atas sumber
              yang berlisensi/berwenang. {hasGateway() ? "Gateway terdeteksi." : "Gateway belum dipasang — Watch berjalan pada sumber sah yang tersedia (trailer resmi)."}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function Layout() {
  const [q, setQ] = useState("");
  const [panel, setPanel] = useState(false);
  const nav = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    nav(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const links: [string, string][] = [
    ["/", "Home"],
    ["/search", "Search"],
  ];

  return (
    <div className="streaman-bg min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-ink-900/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
          <Link to="/" className="group flex items-center gap-2.5">
            <Mark />
            <span className="leading-none">
              <span className="block font-display text-[19px] font-extrabold tracking-tight text-bone-50 transition group-hover:text-signal-400">
                Stream<span className="text-signal-500">AN</span>
              </span>
              <span className="hidden font-mono text-[9.5px] tracking-[0.26em] text-bone-500 uppercase sm:block">
                home · search · detail · watch
              </span>
            </span>
          </Link>

          <nav className="ml-1 flex items-center gap-1">
            {links.map(([href, label]) => (
              <Link
                key={href}
                to={href}
                className={cn(
                  "rounded-lg px-3 py-1.5 font-mono text-[11px] tracking-wider uppercase transition",
                  pathname === href ? "bg-white/[0.07] text-bone-50" : "text-bone-400 hover:bg-white/[0.04] hover:text-bone-100",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          <form onSubmit={submit} className="ml-auto hidden max-w-sm flex-1 items-center gap-2 rounded-lg border border-white/[0.09] bg-ink-850 px-3 py-1.5 transition focus-within:border-signal-500/60 lg:flex">
            <Search className="size-4 shrink-0 text-bone-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="cari anime…"
              className="w-full bg-transparent text-sm text-bone-50 placeholder:text-bone-500 focus:outline-none"
              aria-label="Cari anime"
            />
            <ArrowRight className="size-4 shrink-0 text-bone-500" />
          </form>

          <button
            onClick={() => setPanel(true)}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-850 px-2.5 py-1.5 font-mono text-[10.5px] tracking-wide text-bone-300 uppercase transition hover:border-mint/40 hover:text-mint lg:ml-0"
          >
            <span className="size-1.5 animate-pulse-dot rounded-full bg-mint" />
            providers
          </button>
        </div>
      </header>

      <ProviderPanel open={panel} onClose={() => setPanel(false)} />

      <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-16 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-white/[0.07] bg-ink-950/50">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-5 text-xs text-bone-500 sm:px-6">
          <span className="font-display text-sm font-bold text-bone-200">StreamAN</span>
          <span>MVP core flow: Home → Search → Detail → Episode → Watch</span>
          <span className="ml-auto font-mono text-[10.5px]">
            konten: OtakuDesu · KuramaAnime · Oploverz — metadata: Jikan · AniList — stream: gateway berlisensi
          </span>
        </div>
      </footer>
    </div>
  );
}





