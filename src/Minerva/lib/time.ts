// ═══════════════════════════════════════════════════════════════════
//  Time utilities (TypeScript port of components/utilities/Time.js)
//
//  Imports `meState` from ./state so there is NO circular dependency.
// ═══════════════════════════════════════════════════════════════════
import React, { useEffect, useRef } from 'react';
import { meState } from './state';

/**
 * Convert a UTC date string to the operator's local time representation.
 */
export function toLocalTime(date: string | null, view_utc?: boolean): string {
    try {
        if (date === null) return "N/A";
        const init_date = new Date(date);
        if (view_utc) {
            return init_date.toDateString() + " " + init_date.toTimeString().substring(0, 8) + " UTC";
        }
        const timezoneDate = new Date(date + "Z");
        return (
            timezoneDate.toDateString() +
            " " +
            timezoneDate.toLocaleString(['en-us'], { hour12: true, hour: "2-digit", minute: "2-digit" })
        );
    } catch (_error) {
        return date + " UTC";
    }
}

function formatDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day}-${month}-${year} ` + date.toLocaleString(['en-us'], { hour12: false, hour: "2-digit", minute: "2-digit" });
}

export function toLocalTimeShort(date: string | null, view_utc?: boolean): string {
    try {
        if (date === null) return "N/A";
        if (view_utc) {
            return formatDate(new Date(date));
        }
        const timezoneDate = new Date(date + "Z");
        return formatDate(timezoneDate);
    } catch (_error) {
        return date + " UTC";
    }
}

export function getTimeDifference(checkin_time: string, current_time?: string): string {
    let date = new Date();
    if (current_time !== undefined) {
        date = new Date(current_time);
    }
    const now = date.getTime() + date.getTimezoneOffset() * 60000;
    const millisec = Math.abs(now - new Date(checkin_time).getTime());
    const seconds = Math.trunc((millisec / 1000) % 60);
    const minutes = Math.trunc((millisec / (1000 * 60)) % 60);
    const hours = Math.trunc((millisec / (1000 * 60 * 60)) % 24);
    const days = Math.trunc((millisec / (1000 * 60 * 60 * 24)) % 365);
    let output = "";
    if (days !== 0) output += days + "d";
    if (hours !== 0) output += hours + "h";
    if (minutes !== 0) output += minutes + "m";
    output += seconds + "s";
    return output;
}

export function milisecondsToString(millisec: number): string {
    const seconds = Math.trunc((millisec / 1000) % 60);
    const minutes = Math.trunc((millisec / (1000 * 60)) % 60);
    const hours = Math.trunc((millisec / (1000 * 60 * 60)) % 24);
    const days = Math.trunc((millisec / (1000 * 60 * 60 * 24)) % 365);
    let output = "";
    if (days !== 0) output += days + "d";
    if (hours !== 0) output += hours + "h";
    if (minutes !== 0) output += minutes + "m";
    output += seconds + "s";
    return output;
}

/**
 * Declarative setInterval hook.
 * See: https://overreacted.io/making-setinterval-declarative-with-react-hooks/
 */
export function useInterval(
    callback: () => void,
    delay: number,
    mountedRef?: React.RefObject<boolean>,
    parentMountedRef?: React.RefObject<boolean>,
): void {
    const savedCallback = useRef<() => void>(callback);

    useEffect(() => {
        savedCallback.current = callback;
    });

    useEffect(() => {
        function tick() {
            if ((mountedRef && !mountedRef.current) || (parentMountedRef && !parentMountedRef.current)) {
                return;
            }
            savedCallback.current();
        }
        if ((mountedRef && !mountedRef.current) || (parentMountedRef && !parentMountedRef.current)) {
            return;
        }
        const id = setInterval(tick, delay);
        return () => clearInterval(id);
    }, [delay, mountedRef, parentMountedRef]);
}

/**
 * Get the current time adjusted for server clock skew.
 */
export function getSkewedNow(): Date {
    const now = new Date();
    return new Date(now.getTime() + ((meState()?.user?.server_skew as number) || 0));
}

// ── Relative time constants ───────────────────────────────────────
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/**
 * Convert a timestamp string to a compact relative time string.
 *
 * Accepts ISO 8601 strings with or without trailing "Z".
 * Returns e.g. "3s ago", "12m ago", "5h ago", "2d ago", or "just now".
 * Returns "Never" for falsy input.
 */
export function timeAgo(isoStr: string | null | undefined): string {
    if (!isoStr) return 'Never';
    try {
        const normalized = isoStr.endsWith('Z') ? isoStr : `${isoStr}Z`;
        const diffMs = Date.now() - new Date(normalized).getTime();
        if (diffMs < 0) return 'just now';
        if (diffMs < MS_PER_MINUTE) return `${Math.floor(diffMs / MS_PER_SECOND)}s ago`;
        if (diffMs < MS_PER_HOUR)   return `${Math.floor(diffMs / MS_PER_MINUTE)}m ago`;
        if (diffMs < MS_PER_DAY)    return `${Math.floor(diffMs / MS_PER_HOUR)}h ago`;
        return `${Math.floor(diffMs / MS_PER_DAY)}d ago`;
    } catch {
        return 'N/A';
    }
}

/**
 * Convert a diff in seconds to a compact relative time string.
 * Used by components that already compute the difference themselves.
 */
export function secondsToRelative(diffSecs: number): string {
    if (diffSecs < 0) return '0s ago';
    if (diffSecs < SECONDS_PER_MINUTE) return `${diffSecs}s ago`;
    if (diffSecs < SECONDS_PER_HOUR)   return `${Math.floor(diffSecs / SECONDS_PER_MINUTE)}m ago`;
    if (diffSecs < SECONDS_PER_DAY)    return `${Math.floor(diffSecs / SECONDS_PER_HOUR)}h ago`;
    return `${Math.floor(diffSecs / SECONDS_PER_DAY)}d ago`;
}
