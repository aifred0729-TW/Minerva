import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely extract a human-readable message from an unknown caught value.
 * Use in catch blocks: `catch (e) { snackActions.error(getErrorMessage(e)); }`
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as Record<string, unknown>).message === 'string') {
    return (error as Record<string, unknown>).message as string;
  }
  return 'Unknown error';
}

/* ── Debug logger ──────────────────────────────────────────────────
 * Only emits output when localStorage "minerva_debug" === "1".
 * Usage:  import { dbg } from '../../lib/utils';
 *         dbg('auth', 'token refreshed');
 */
const isDebug = () => {
    try { return localStorage.getItem('minerva_debug') === '1'; } catch { return false; }
};
export const dbg = (tag: string, ...args: unknown[]) => {
    if (isDebug()) console.log(`[Minerva:${tag}]`, ...args);
};

// ── Mojibake recovery ─────────────────────────────────────────────────────
// Apollo's `ExecutePE.Standalone` (and a few other agents) capture child-
// process stdout through `Console.OutputEncoding.GetString(...)` — i.e. the
// operator's OS code page (CP1252 on Western Windows, CP936 / Big5 on
// Chinese / Taiwanese Windows). When the inner tool emits UTF-8 (the modern
// default for Go / Rust / Python / fscan / chisel / etc.), the redirector
// silently decodes the UTF-8 bytes with the wrong code page, producing
// mojibake Unicode that is then re-encoded as UTF-8 for transit and shows
// up in the Mythic task `response` field as gibberish like
// `存活 → æ®î¦·æ` or `?ï·??Â?Â?…`.
//
// Fixing this on the agent side requires rebuilding `ExecutePE.Standalone`
// to force `Encoding.UTF8` on the redirector; we instead reverse the damage
// at the rendering boundary by:
//   1) Encoding the mojibake string back through the suspected wrong code
//      page (CP1252 first — pure 1:1 Latin-1 mapping with a handful of
//      0x80-0x9F extensions),
//   2) Decoding the resulting bytes as UTF-8,
//   3) Sanity-checking that the result has fewer replacement chars and a
//      higher proportion of "real" code points (CJK / printable ASCII)
//      than the input, so we don't accidentally damage already-correct
//      output that just happens to contain a stray `é`.
// GBK reverse is attempted as a fallback for Chinese-Windows operators
// where CP1252 reverse can't recover everything.

const CP1252_TO_BYTE: Record<number, number> = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
    0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
    0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
    0x017E: 0x9E, 0x0178: 0x9F,
};

let gbkEncodeMap: Map<number, number> | null = null;
function getGbkEncodeMap(): Map<number, number> | null {
    if (gbkEncodeMap) return gbkEncodeMap;
    try {
        // GBK is supported as a decoder by every modern browser. We build
        // the reverse table once by sweeping every 2-byte GBK code point
        // and recording which Unicode char each pair maps to. ~24k entries,
        // built lazily so the first non-mojibake output doesn't pay for it.
        const decoder = new TextDecoder('gbk', { fatal: false });
        const m = new Map<number, number>();
        const buf = new Uint8Array(2);
        for (let h = 0x81; h <= 0xFE; h++) {
            for (let l = 0x40; l <= 0xFE; l++) {
                if (l === 0x7F) continue;
                buf[0] = h; buf[1] = l;
                const s = decoder.decode(buf);
                if (s.length === 1 && s !== '�') {
                    const cp = s.charCodeAt(0);
                    if (!m.has(cp)) m.set(cp, (h << 8) | l);
                }
            }
        }
        gbkEncodeMap = m;
        return m;
    } catch {
        return null;
    }
}

/** Score a string for "real text"-ness: more CJK + ASCII letters and fewer
 *  replacement / private-use chars is better. Used to pick the best of the
 *  original-vs-recovered candidates. */
function textScore(s: string): number {
    if (!s) return 0;
    let cjk = 0, ascii = 0, replacement = 0, latinSupp = 0, pua = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c === 0xFFFD) replacement++;
        else if (c >= 0x4E00 && c <= 0x9FFF) cjk++;
        else if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || (c >= 0x30 && c <= 0x39)) ascii++;
        else if (c >= 0xA0 && c <= 0xFF) latinSupp++;
        else if (c >= 0xE000 && c <= 0xF8FF) pua++;
    }
    // CJK is the most informative signal; Latin supplement is a strong mojibake
    // indicator (each char usually corresponds to one mis-decoded UTF-8 byte).
    return cjk * 3 + ascii - replacement * 4 - latinSupp * 2 - pua * 2;
}

function reverseViaCp1252(s: string): string | null {
    const bytes: number[] = [];
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 0x80) bytes.push(c);
        else if (c <= 0xFF) bytes.push(c);
        else if (CP1252_TO_BYTE[c] !== undefined) bytes.push(CP1252_TO_BYTE[c]);
        else return null; // char outside CP1252 — can't reverse
    }
    try {
        return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
    } catch {
        return null;
    }
}

function reverseViaGbk(s: string): string | null {
    const map = getGbkEncodeMap();
    if (!map) return null;
    const bytes: number[] = [];
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 0x80) {
            bytes.push(c);
            continue;
        }
        const gbk = map.get(c);
        if (gbk === undefined) return null; // not in GBK
        bytes.push((gbk >> 8) & 0xFF, gbk & 0xFF);
    }
    try {
        return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
    } catch {
        return null;
    }
}

/**
 * Heuristic recovery for the "tool emitted UTF-8 / agent decoded as OS code
 * page" mojibake described above. Returns the input untouched if no recovery
 * improves the text. Safe to call on every response — outputs that don't
 * match the mojibake signature short-circuit immediately.
 */
export function fixMojibake(s: string): string {
    if (!s || s.length < 4) return s;
    // Cheap signature check — bail unless the string has either:
    //   • a meaningful run of Latin-1 supplement chars (`æ`, `î`, `Â`, etc.)
    //   • or scattered U+FFFD chars (`?` rendered from the GBK fallback)
    let latin1 = 0;
    let replacements = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0xA0 && c <= 0xFF) latin1++;
        else if (c === 0xFFFD) replacements++;
    }
    if (latin1 < 3 && replacements < 3) return s;
    if (latin1 + replacements < s.length * 0.02) return s;

    const baseScore = textScore(s);
    let best = s;
    let bestScore = baseScore;

    const cp1252 = reverseViaCp1252(s);
    if (cp1252 && cp1252 !== s) {
        const score = textScore(cp1252);
        if (score > bestScore) { best = cp1252; bestScore = score; }
    }
    const gbk = reverseViaGbk(s);
    if (gbk && gbk !== s) {
        const score = textScore(gbk);
        if (score > bestScore) { best = gbk; bestScore = score; }
    }
    return best;
}

export function b64DecodeUnicode(str: string): string {
  if (!str || str.length === 0) { return "" }
  try {
    // Convert URL-safe base64 to standard base64
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if necessary
    const pad = base64.length % 4;
    if (pad) {
      base64 += '='.repeat(4 - pad);
    }
    
    const text = window.atob(base64);
    const length = text.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        bytes[i] = text.charCodeAt(i);
    }
    const decoder = new TextDecoder(); // default is utf-8
    return decoder.decode(bytes);
  } catch (error) {
    try {
      // Fallback: try URL-safe conversion again
      let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64.length % 4;
      if (pad) {
        base64 += '='.repeat(4 - pad);
      }
      return decodeURIComponent(window.atob(base64));
    } catch (error2) {
      try {
        return window.atob(str);
      } catch (error3) {
        // console.log("Failed to base64 decode response", error, error2)
        return str;
      }
    }
  }
}

/**
 * Compute the "dead" threshold (seconds) for a callback from its sleep_info.
 * Strategy: allow up to 3 consecutive missed beacons at max jitter, plus a 30s
 * grace window for network/scheduling slack. Falls back to 5 min when sleep_info
 * is missing/unparseable — matches legacy behaviour for agents without metadata.
 * Floor of 60s prevents twitchy short-interval agents from flapping.
 */
export function getCallbackDeadThresholdSecs(sleepInfo?: string): number {
    const FALLBACK_SECS = 5 * 60;
    if (!sleepInfo) return FALLBACK_SECS;
    try {
        const s = JSON.parse(sleepInfo);
        const interval = Number(s?.interval);
        if (!Number.isFinite(interval) || interval <= 0) return FALLBACK_SECS;
        const jitterPct = Math.max(0, Number(s?.jitter) || 0);
        const maxIntervalSec = interval * (1 + jitterPct / 100);
        return Math.max(60, maxIntervalSec * 3 + 30);
    } catch {
        return FALLBACK_SECS;
    }
}

type OrphanEdge = {
    source?: { id?: number } | null;
    destination?: { id?: number } | null;
    end_timestamp?: string | null;
    c2profile?: { name?: string; is_p2p?: boolean } | null;
};

type OrphanCallback = {
    id?: number;
    callbackc2profiles?: Array<{ c2profile?: { name?: string; is_p2p?: boolean } | null } | null> | null;
};

/**
 * A TCP P2P callback has no self-driven beacon: traffic only flows while a
 * parent agent is actively linked to it. If no active P2P edge involves this
 * callback, it is unreachable regardless of when its last beacon arrived, so
 * the UI should treat it as dead immediately — no grace period.
 *
 * Returns true when the callback's profiles are all P2P, at least one is
 * named "tcp", and the edge list contains no active P2P edge touching this
 * callback (end_timestamp null = still active).
 */
export function isOrphanedTcpP2P(
    callback: OrphanCallback,
    edges: OrphanEdge[] | null | undefined,
): boolean {
    const profiles = callback.callbackc2profiles ?? [];
    if (profiles.length === 0) return false;
    if (!profiles.every(p => p?.c2profile?.is_p2p)) return false;
    const usesTcp = profiles.some(p =>
        p?.c2profile?.is_p2p && (p?.c2profile?.name || '').toLowerCase() === 'tcp');
    if (!usesTcp) return false;
    const id = callback.id;
    if (id == null) return true; // P2P + no id to match → assume unreachable
    if (!edges || edges.length === 0) return true;
    return !edges.some(e =>
        e?.c2profile?.is_p2p &&
        e?.end_timestamp == null &&
        (e?.source?.id === id || e?.destination?.id === id));
}

/**
 * Determine if a callback is alive from its last_checkin and sleep_info.
 * Uses a dynamic threshold so long-sleep beacons aren't flagged dead mid-interval.
 * Note: active:false means hidden by operator, NOT dead — not treated as dead here.
 *
 * When `edges` is supplied, an orphan TCP P2P callback (P2P-only routing with
 * no active peer link) is reported dead immediately, ignoring last_checkin.
 */
export function isCallbackAlive(
    callback: { last_checkin?: string; sleep_info?: string; active?: boolean } & OrphanCallback,
    edges?: OrphanEdge[] | null,
): boolean {
    if (edges !== undefined && isOrphanedTcpP2P(callback, edges)) return false;
    if (!callback.last_checkin) return false;
    const thresholdMs = getCallbackDeadThresholdSecs(callback.sleep_info) * 1_000;
    const timeStr = callback.last_checkin.endsWith('Z') ? callback.last_checkin : `${callback.last_checkin}Z`;
    return (Date.now() - new Date(timeStr).getTime()) < thresholdMs;
}

/**
 * Human-readable file-size string (e.g. "4.2 KB").
 * Duplicated in Console, FileBrowser, Files — centralised here.
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Parse a JSON-encoded IP string into an array.
 * Handles single strings, JSON arrays, and malformed input gracefully.
 */
export function parseIPString(ip: string): string[] {
    if (!ip) return [];
    try {
        const r = JSON.parse(ip);
        return Array.isArray(r) ? r : [r];
    } catch {
        return [ip];
    }
}

/**
 * Extract the first IP from a JSON-encoded IP string.
 * Convenience wrapper around parseIPString for display use.
 */
export function parseFirstIP(ip: string): string {
    return parseIPString(ip)[0] || ip || '';
}

/**
 * Safely parse a JSON string, returning fallback on failure.
 */
export function safeJsonParse<T>(str: string, fallback: T): T {
    try { return JSON.parse(str); } catch { return fallback; }
}

/**
 * Parameter names whose values should be masked in UI display.
 * Used by Tunnels, Payloads, and any C2 profile parameter listing.
 */
export const SENSITIVE_PARAM_NAMES = new Set(['AESPSK', 'aespsk', 'proxyPass']);

/**
 * Trigger a browser download from a Blob.
 * Creates a temporary anchor element, clicks it, then cleans up.
 */
/**
 * Build an RFC-4180-compliant CSV string from row objects.
 *
 *  - `columns` is the explicit header list — also the field-extraction order
 *  - any cell containing `,`, `"`, `\n`, `\r`, or leading/trailing whitespace
 *    gets wrapped in double quotes; embedded `"` are doubled
 *  - `null` / `undefined` cells become empty strings
 *  - prepends a UTF-8 BOM so Excel opens the file in the right encoding
 *
 * Designed for ad-hoc exports (credentials, tasks, payload lists). Keep the
 * column set small and explicit; the helper does no transformation beyond
 * stringifying — pre-format dates, join arrays, etc. at the call site.
 */
export function buildCsv<T extends Record<string, unknown>>(
    columns: Array<{ key: keyof T; header: string }>,
    rows: T[],
): string {
    const escape = (raw: unknown): string => {
        if (raw == null) return '';
        const s = String(raw);
        if (s === '') return '';
        if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    };
    const header = columns.map(c => escape(c.header)).join(',');
    const body   = rows.map(r => columns.map(c => escape(r[c.key])).join(',')).join('\r\n');
    return '﻿' + header + '\r\n' + body + (rows.length > 0 ? '\r\n' : '');
}

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Trigger a browser download from a data URL (e.g. canvas.toDataURL).
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
}

export function b64EncodeUnicode(str: string): string {
  if (!str || str.length === 0) { return "" }
  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  } catch (error) {
    try {
      return window.btoa(encodeURIComponent(str));
    } catch (error2) {
      return window.btoa(str);
    }
  }
}
