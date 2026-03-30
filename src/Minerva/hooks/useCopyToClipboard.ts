import { useCallback } from 'react';
import { snackActions } from '../lib/snackbar';

interface CopyOptions {
    /** Toast message on success (default: "Copied to clipboard") */
    successMessage?: string;
    /** Suppress toast entirely */
    silent?: boolean;
}

/**
 * Returns a copy function that writes text to the clipboard
 * and optionally shows a snackbar notification.
 */
export function useCopyToClipboard() {
    const copy = useCallback(async (text: string, opts: CopyOptions = {}) => {
        const { successMessage = 'Copied to clipboard', silent = false } = opts;
        try {
            await navigator.clipboard.writeText(text);
            if (!silent) snackActions.success(successMessage);
            return true;
        } catch {
            if (!silent) snackActions.error('Failed to copy');
            return false;
        }
    }, []);

    return copy;
}
