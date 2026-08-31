import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("StreamAN ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="streaman-bg grid min-h-screen place-items-center px-4">
          <div className="max-w-md space-y-4 rounded-2xl border border-signal-500/25 bg-signal-500/[0.06] p-6 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-signal-500/15 text-signal-400">
              <AlertTriangle className="size-6" />
            </span>
            <h1 className="font-display text-xl font-extrabold text-bone-50">Aplikasi mengalami gangguan</h1>
            <p className="text-sm text-bone-300">
              Terjadi kesalahan tak terduga di dalam komponen. Coba muat ulang halaman.
            </p>
            {this.state.error && (
              <pre className="rounded-lg border border-white/10 bg-ink-950 p-3 text-left font-mono text-[11px] text-bone-400">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl bg-signal-500 px-4 py-2.5 font-mono text-[11px] font-bold tracking-wider text-white uppercase transition hover:bg-signal-600"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}





