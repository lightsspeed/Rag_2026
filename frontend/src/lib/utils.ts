import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const IST_OPTS = { timeZone: "Asia/Kolkata" } as const;

/** Format an ISO string or Date as full date+time in IST */
export function fmtIST(d: string | Date): string {
  return new Date(d).toLocaleString("en-IN", IST_OPTS);
}

/** Format an ISO string or Date as date only in IST */
export function fmtISTDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-IN", IST_OPTS);
}

/** Format a Date object as time only in IST (used for live indicators) */
export function fmtISTTime(d: Date): string {
  return d.toLocaleTimeString("en-IN", IST_OPTS);
}
