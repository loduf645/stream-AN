import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Gabung className Tailwind + resolusi konflik (kelas belakangan menang).
 * Dipakai semua komponen UI agar varian className dari caller selalu menang
 * atas kelas default komponen.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}




