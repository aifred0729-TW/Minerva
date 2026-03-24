import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
 * Determine if a callback is alive based on last_checkin vs its sleep interval.
 * Uses sleep_info.interval × 3 (with jitter buffer) as the dead threshold.
 * Falls back to 5 minutes if no sleep_info is available.
 */
export function isCallbackAlive(callback: { active?: boolean; last_checkin?: string; sleep_info?: string }): boolean {
    if (callback.active === false) return false;
    if (!callback.last_checkin) return false;
    let thresholdMs = 5 * 60 * 1000; // 5-minute default
    try {
        if (callback.sleep_info) {
            const sleep = JSON.parse(callback.sleep_info);
            if (sleep.interval && sleep.interval > 0) {
                const jitterMult = sleep.jitter ? (1 + sleep.jitter / 100) : 1;
                // 3× interval accounts for missed checkins / network latency
                thresholdMs = Math.max(thresholdMs, sleep.interval * 1000 * 3 * jitterMult);
            }
        }
    } catch { }
    const timeStr = callback.last_checkin.endsWith('Z') ? callback.last_checkin : `${callback.last_checkin}Z`;
    return (Date.now() - new Date(timeStr).getTime()) < thresholdMs;
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
