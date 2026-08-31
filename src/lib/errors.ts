import type { Attempt, ProviderId, StreamAnErrorCode } from "./types";

/**
 * Error kanonik service layer — STREAMAN.
 *
 * Semantik yang dipakai service.ts untuk memutuskan fallback:
 *   NETWORK / TIMEOUT / RATE_LIMITED / PROVIDER_UNAVAILABLE / INVALID_RESPONSE
 *     → boleh lanjut ke provider berikutnya (retriable).
 *   NOT_FOUND (tanpa hint judul) → chain dihentikan: native id tidak berlaku
 *     di provider lain.
 *   EMPTY_RESULT di operasi list → jawaban SAH, bukan sinyal fallback.
 *   CONFIG_MISSING → provider di-skip sebelum ada request keluar.
 *
 * `attempts` diisi oleh service/FallbackExhaustedError supaya UI bisa
 * menampilkan jejak rantai fallback apa adanya (TracePanel / ErrorState).
 */

export interface StreamAnErrorOptions {
  provider?: ProviderId;
  /** true untuk error yang secara teori bisa succeed pada percobaan berikutnya. */
  retriable?: boolean;
  /** pesan teknis mentah (mis. message dari fetch) — untuk panel diagnostik saja. */
  detail?: string;
}

export class StreamAnError extends Error {
  readonly code: StreamAnErrorCode;
  readonly provider?: ProviderId;
  readonly retriable: boolean;
  readonly detail?: string;
  /** Rantai percobaan provider; diisi oleh service layer, dibaca UI. */
  attempts?: Attempt[];

  constructor(code: StreamAnErrorCode, message: string, options: StreamAnErrorOptions = {}) {
    super(message);
    this.name = "StreamAnError";
    this.code = code;
    this.provider = options.provider;
    this.retriable = options.retriable ?? false;
    this.detail = options.detail;
    // Menjaga prototipe saat target build down-level / class extends Error.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Konversi error apa pun (termasuk yang dilempar provider non-kanonik) ke StreamAnError. */
export function toStreamAnError(value: unknown, fallbackMessage = "Terjadi kesalahan tak terduga."): StreamAnError {
  if (value instanceof StreamAnError) return value;
  const reason = value instanceof Error ? value.message : undefined;
  return new StreamAnError("PROVIDER_UNAVAILABLE", reason ? `${fallbackMessage} (${reason})` : fallbackMessage, { detail: reason });
}



