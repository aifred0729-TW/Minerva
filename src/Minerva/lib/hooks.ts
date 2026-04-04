import { useState, useEffect, useCallback, useRef } from 'react';

// ── useLocalStorageState ────────────────────────────────────────────
type Serialiser<T> = {
    read: (raw: string) => T;
    write: (value: T) => string;
};

const defaultSerialiser = <T,>(): Serialiser<T> => ({
    read: (raw) => JSON.parse(raw) as T,
    write: (value) => JSON.stringify(value),
});

/**
 * Like `useState`, but persists to `localStorage` under the given key.
 * Falls back to `defaultValue` when the stored value is absent or corrupt.
 */
export function useLocalStorageState<T>(
    key: string,
    defaultValue: T,
    serialiser?: Serialiser<T>,
): [T, (v: T | ((prev: T) => T)) => void] {
    const { read, write } = serialiser ?? defaultSerialiser<T>();

    const [value, setValue] = useState<T>(() => {
        try {
            const stored = localStorage.getItem(key);
            return stored !== null ? read(stored) : defaultValue;
        } catch {
            return defaultValue;
        }
    });

    useEffect(() => {
        try { localStorage.setItem(key, write(value)); } catch { /* quota / private mode */ }
    }, [key, value, write]);

    return [value, setValue];
}

// Shorthand serialisers for common primitive types
export const stringSerializer: Serialiser<string> = { read: (s) => s, write: (s) => s };
export function typedStringSerializer<T extends string>(): Serialiser<T> {
    return { read: (s) => s as T, write: (s) => s };
}
export const boolSerializer: Serialiser<boolean> = {
    read: (s) => s === 'true',
    write: (b) => String(b),
};
export const boolInverseSerializer: Serialiser<boolean> = {
    read: (s) => s !== 'false',
    write: (b) => String(b),
};

// ── useClickOutside ────────────────────────────────────────────────

/**
 * Call `onClose` when the user clicks outside all provided refs.
 * Only active when `active` is true.
 */
export function useClickOutside(
    refs: React.RefObject<HTMLElement | null>[],
    onClose: () => void,
    active = true,
) {
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!active) return;
        const handler = (e: MouseEvent) => {
            const inside = refs.some((r) => r.current?.contains(e.target as Node));
            if (!inside) onCloseRef.current();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [active, refs]);
}

// ── copyToClipboard (with toast) ───────────────────────────────────

/** Copy text to clipboard and show a snackbar success/error toast. */
export async function copyWithToast(
    text: string,
    snackActions: { success: (msg: string) => void; error: (msg: string) => void },
    label = 'Copied to clipboard',
) {
    try {
        await navigator.clipboard.writeText(text);
        snackActions.success(label);
    } catch {
        snackActions.error('Copy failed');
    }
}
