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
 * Determine if a callback is alive based on last_checkin vs its sleep interval.
 * Uses sleep_info.interval × 3 (with jitter buffer) as the dead threshold.
 * Falls back to 5 minutes if no sleep_info is available.
 */
export function isCallbackAlive(callback: { active?: boolean; last_checkin?: string; sleep_info?: string }): boolean {
    if (callback.active === false) return false;
    if (!callback.last_checkin) return false;
    const DEFAULT_DEAD_THRESHOLD_MS = 5 * 60 * 1_000;
    const MISSED_CHECKIN_MULTIPLIER = 3;
    const JITTER_PERCENT_DIVISOR = 100;
    let thresholdMs = DEFAULT_DEAD_THRESHOLD_MS;
    try {
        if (callback.sleep_info) {
            const sleep = JSON.parse(callback.sleep_info);
            if (sleep.interval && sleep.interval > 0) {
                const jitterMult = sleep.jitter ? (1 + sleep.jitter / JITTER_PERCENT_DIVISOR) : 1;
                thresholdMs = Math.max(thresholdMs, sleep.interval * 1_000 * MISSED_CHECKIN_MULTIPLIER * jitterMult);
            }
        }
    } catch { }
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
