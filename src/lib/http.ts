import { StreamAnError } from "./errors";
import type { ProviderId } from "./types";

/**
 * HTTP client untuk service layer.
 *
 * PROPERTI YANG DIJAGA:
 *  - Per (host+provider) sliding-window rate limiter. Menghormati batas
 *    publik Jikan (3 req/dtk, 60 req/menit) dan AniList (~90 req/menit).
 *  - RETRY LEWAT SCHEDULER: setiap attempt melewati limiter lagi supaya
 *    retry akibat 429/5xx/TIMEOUT tidak membanjiri provider dan tidak
 *    memblokir request lain di antrian.
 *  - Timeout via AbortController + hormati external AbortSignal.
 *  - Exponential backoff + jitter untuk 429/5xx/TIMEOUT/NETWORK.
 *  - Retry cap: kMaxAttempts (1 + 2 retry).
 *  - HTTP 4xx (selain 429) → NOT_FOUND/PROVIDER_UNAVAILABLE tanpa retry.
 */

interface LimiterState {
  stamps: number[];
  tail: Promise<unknown>;
  minGapMs: number;
  windowMax: number;
}

const limiters = new Map<string, LimiterState>();

function limiterFor(host: string, minGapMs: number, windowMax: number): LimiterState {
  let st = limiters.get(host);
  if (!st) {
    st = { stamps: [], tail: Promise.resolve(), minGapMs, windowMax };
    limiters.set(host, st);
  }
  return st;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** serialkan tasks per limiter + patuhi min-gap & sliding window 60 detik. */
function schedule<T>(st: LimiterState, task: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    // min-gap
    const lastAt = st.stamps.length ? st.stamps[st.stamps.length - 1] : 0;
    const wait = Math.max(0, lastAt + st.minGapMs - Date.now());
    if (wait > 0) await sleep(wait);
    // sliding window
    let now = Date.now();
    while (st.stamps.length && st.stamps[0] < now - 60_000) st.stamps.shift();
    if (st.stamps.length >= st.windowMax) {
      const waitFull = Math.max(250, 60_000 - (now - st.stamps[0]));
      await sleep(waitFull);
      now = Date.now();
      while (st.stamps.length && st.stamps[0] < now - 60_000) st.stamps.shift();
    }
    st.stamps.push(Date.now());
    return task();
  };
  const next = st.tail.then(run, run);
  st.tail = next.catch(() => undefined);
  return next;
}

export interface RequestOpts {
  op: "trending" | "latest" | "search" | "detail" | "episodes" | "sources" | "gateway";
  /** Kunci rate-limiter & jejak diagnostik — wajib id provider kanonik. */
  provider: ProviderId;
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

const TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 3;

function backoffMs(attemptIdx: number, retryAfterHeader?: string | null): number {
  // FIX: Retry-After bisa berupa HTTP-date string (contoh: "Wed, 21 Oct 2025 07:28:00 GMT").
  // Number(string-date) menghasilkan NaN. Math.max(700, NaN) = NaN, yang menyebabkan
  // delay retry menjadi 0 ms (browser coerce NaN → 0), memperparah rate-limit.
  const parsed = Number(retryAfterHeader ?? 0);
  const retryAfterSec = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const base = Math.max(700, retryAfterSec * 1000);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(9_000, base * (attemptIdx + 1) + jitter);
}

async function performOnce(url: string, opts: RequestOpts, attemptIdx: number): Promise<{ ok: true; text: string } | { ok: false; retryable: boolean; err: StreamAnError; retryAfter?: string | null }> {
  if (opts.signal?.aborted) {
    return {
      ok: false,
      retryable: false,
      err: new StreamAnError("NETWORK", "Permintaan dibatalkan.", { provider: opts.provider }),
    };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException("timeout", "AbortError")), TIMEOUT_MS);
  const onExternalAbort = () => ctrl.abort(new DOMException("aborted-by-caller", "AbortError"));
  opts.signal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: { Accept: "application/json", ...(opts.headers ?? {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
      // no `cache: "no-store"` — biar service-worker/browser cache berlaku.
    });

    if (res.status === 429 || res.status >= 500) {
      return {
        ok: false,
        retryable: attemptIdx < MAX_ATTEMPTS - 1,
        retryAfter: res.headers.get("retry-after"),
        err: new StreamAnError(
          res.status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
          res.status === 429 ? "Provider membatasi laju permintaan." : `Provider sedang tidak tersedia (HTTP ${res.status}).`,
          { provider: opts.provider, retriable: true },
        ),
      };
    }

    if (res.status === 404) {
      return { ok: false, retryable: false, err: new StreamAnError("NOT_FOUND", "Data tidak ditemukan di provider.", { provider: opts.provider }) };
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, retryable: false, err: new StreamAnError("PROVIDER_UNAVAILABLE", `Provider menolak permintaan (HTTP ${res.status}).`, { provider: opts.provider }) };
    }

    if (!res.ok) {
      return { ok: false, retryable: false, err: new StreamAnError("PROVIDER_UNAVAILABLE", `Provider mengembalikan HTTP ${res.status}.`, { provider: opts.provider }) };
    }

    const text = await res.text();
    if (!text.trim()) {
      return { ok: false, retryable: false, err: new StreamAnError("INVALID_RESPONSE", "Provider mengirim respons kosong.", { provider: opts.provider }) };
    }
    return { ok: true, text };
  } catch (err) {
    // External abort → jangan bungkus sebagai TIMEOUT.
    if (opts.signal?.aborted) {
      return { ok: false, retryable: false, err: new StreamAnError("NETWORK", "Permintaan dibatalkan.", { provider: opts.provider }) };
    }
    const isAbort = (err as Error)?.name === "AbortError";
    if (isAbort) {
      return {
        ok: false,
        retryable: attemptIdx < MAX_ATTEMPTS - 1,
        err: new StreamAnError("TIMEOUT", "Permintaan ke provider melebihi batas waktu.", { provider: opts.provider, retriable: true }),
      };
    }
    return {
      ok: false,
      retryable: attemptIdx < MAX_ATTEMPTS - 1,
      err: new StreamAnError("NETWORK", "Gagal menghubungi provider (jaringan/CORS).", {
        provider: opts.provider,
        retriable: true,
        detail: (err as Error)?.message,
      }),
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onExternalAbort);
  }
}

export async function requestJson<T>(url: string, opts: RequestOpts): Promise<T> {
  let host = "unknown";
  try {
    host = new URL(url).host;
  } catch {
    throw new StreamAnError("NETWORK", "URL tidak valid.", { provider: opts.provider });
  }
  const st = limiterFor(
    `${host}:${opts.provider}`,
    opts.provider === "anilist" ? 700 : 400,
    opts.provider === "anilist" ? 80 : 55,
  );

  let lastErr: StreamAnError | null = null;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (opts.signal?.aborted) throw new StreamAnError("NETWORK", "Permintaan dibatalkan.", { provider: opts.provider });
    // SETIAP attempt di-schedule lewat limiter — retry tidak boleh bypass limiter.
    const result = await schedule(st, () => performOnce(url, opts, i));
    if (result.ok) {
      try {
        return JSON.parse(result.text) as T;
      } catch {
        throw new StreamAnError("INVALID_RESPONSE", "Respons provider bukan JSON yang valid.", { provider: opts.provider });
      }
    }
    lastErr = result.err;
    if (!result.retryable) throw result.err;
    // Backoff DI LUAR schedule — biar limiter tidak diikat selama tidur.
    await sleep(backoffMs(i, "retryAfter" in result ? result.retryAfter : undefined));
  }
  throw lastErr ?? new StreamAnError("NETWORK", "Permintaan gagal setelah beberapa percobaan.", { provider: opts.provider });
}



