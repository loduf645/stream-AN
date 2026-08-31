import { useCallback, useEffect, useRef, useState } from "react";
import { StreamAnError, toStreamAnError } from "../lib/errors";
import type { RequestMeta, Result } from "../lib/types";

/**
 * useAsync — pembungkus promise service layer untuk komponen — STREAMAN.
 *
 * Ditulis sekali, dipakai semua page: aturan mainnya
 *  1. SETIAP run punya AbortController sendiri. Ketika deps berubah (pindah
 *     anime/episode/halaman) atau komponen unmount, request lama dibatalkan →
 *     tidak ada race "respons telat menimpa data baru".
 *  2. `enabled=false` menghasilkan status "idle" tanpa memanggil service
 *     (dipakai Watch agar tidak memanggil resolvePlayback sebelum episode ada).
 *  3. `data`/`meta` di-unwrap dari `Result<T>`: komponen membaca
 *     `state.data` (payload) dan `state.meta` (resolvedBy / fallbackUsed / note).
 *  4. `reload()` tidak menghapus data lama lebih dulu — hanya menaikkan nonce;
 *     kalau request ulang gagal, data lama tetap ada untuk dibaca UI.
 */

export type AsyncStatus = "idle" | "loading" | "success" | "error";

export interface AsyncState<T> {
  status: AsyncStatus;
  data?: T;
  meta?: RequestMeta;
  /** StreamAnError (termasuk FallbackExhaustedError) — punya code + attempts. */
  error?: StreamAnError;
}

export interface AsyncResource<T> {
  state: AsyncState<T>;
  reload: () => void;
}

type Runner<T> = (signal: AbortSignal) => Promise<Result<T>>;

export function useAsync<T>(run: Runner<T>, deps: readonly unknown[] = [], enabled = true): AsyncResource<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: "idle" });
  const [nonce, setNonce] = useState(0);
  // Closure terbaru disimpan di ref agar effect tidak perlu bergantung pada identity `run`
  // (caller biasanya inline arrow → berubah tiap render → fetch tanpa henti).
  const runRef = useRef(run);
  runRef.current = run;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState(() => ({ status: "idle" }));
      return;
    }
    const ctrl = new AbortController();
    let alive = true;
    setState((prev) => ({ status: "loading", data: prev.data }));

    runRef
      .current(ctrl.signal)
      .then((res) => {
        if (!alive) return;
        setState({ status: "success", data: res.data, meta: res.meta });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        // data lama sengaja DIPERTAHANKAN supaya reload yang gagal tidak
        // menghapus halaman yang sudah tampil.
        setState((prev) => ({ status: "error", data: prev.data, error: toStreamAnError(err) }));
      });

    return () => {
      alive = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nonce, ...deps]);

  return { state, reload };
}





