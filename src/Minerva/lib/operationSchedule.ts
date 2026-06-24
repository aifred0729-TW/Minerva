// ═════════════════════════════════════════════════════════════════════
//  Operation scheduling — admin-set start time persisted via banner_text
//
//  Storage strategy: embed `<<MS:ISO8601>>` marker at the end of the
//  Operation's `banner_text` column. This piggy-backs on existing Mythic
//  schema (no DB migration), syncs to every operator the moment the
//  Operation row is fetched, and is invisible in normal banner display
//  thanks to `stripScheduleMarker()`.
// ═════════════════════════════════════════════════════════════════════

const MARKER_RE = /<<MS:([^>]+)>>$/;

export interface Schedule {
    startMs: number | null;
    displayText: string;
}

export function parseSchedule(bannerText: string | null | undefined): Schedule {
    if (!bannerText) return { startMs: null, displayText: '' };
    const m = bannerText.match(MARKER_RE);
    if (!m) return { startMs: null, displayText: bannerText };
    const ms = Date.parse(m[1]);
    const cleanText = bannerText.replace(MARKER_RE, '').trimEnd();
    return { startMs: Number.isFinite(ms) ? ms : null, displayText: cleanText };
}

export function stripScheduleMarker(bannerText: string | null | undefined): string {
    if (!bannerText) return '';
    return bannerText.replace(MARKER_RE, '').trimEnd();
}

export function withSchedule(bannerText: string, startMs: number | null): string {
    const cleaned = stripScheduleMarker(bannerText);
    if (startMs === null) return cleaned;
    const iso = new Date(startMs).toISOString();
    return cleaned ? `${cleaned} <<MS:${iso}>>` : `<<MS:${iso}>>`;
}

// ── Countdown formatting ────────────────────────────────────────────

import { getSkewedNow } from './time';

function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}`; }

/**
 * Returns a tuple of [prefix, hh, mm, ss] for a given start time.
 * Uses the server-skewed clock so all operators see a consistent countdown
 * regardless of their local machine's clock offset.
 * prefix is "T-" before start, "T+" after. Returns null when no schedule.
 */
export function tDelta(startMs: number | null, nowMs: number = getSkewedNow().getTime()): {
    prefix: 'T-' | 'T+';
    sign: -1 | 1;
    totalSeconds: number;
    hh: string;
    mm: string;
    ss: string;
    days: number;
    formatted: string;
} | null {
    if (startMs === null) return null;
    const diff = nowMs - startMs;
    const sign: -1 | 1 = diff < 0 ? -1 : 1;
    const prefix: 'T-' | 'T+' = sign < 0 ? 'T-' : 'T+';
    const abs = Math.abs(diff);
    const totalSeconds = Math.floor(abs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hh = pad2(hours + days * 24);
    const mm = pad2(minutes);
    const ss = pad2(seconds);
    const formatted = days > 0
        ? `${prefix}${days}d ${pad2(hours)}:${mm}:${ss}`
        : `${prefix}${hh}:${mm}:${ss}`;
    return { prefix, sign, totalSeconds, hh, mm, ss, days, formatted };
}

/**
 * Convert millis to a value suitable for an <input type="datetime-local"> field
 * (i.e. local time without timezone suffix).
 */
export function msToLocalInputValue(ms: number | null): string {
    if (ms === null) return '';
    const d = new Date(ms);
    const off = d.getTimezoneOffset() * 60_000;
    return new Date(ms - off).toISOString().slice(0, 16);
}

/**
 * Convert a datetime-local input value (assumed local TZ) into UTC ms.
 */
export function localInputValueToMs(v: string): number | null {
    if (!v) return null;
    const ms = new Date(v).getTime();
    return Number.isFinite(ms) ? ms : null;
}
