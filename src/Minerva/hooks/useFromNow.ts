import { useRef } from 'react';
import { getSkewedNow } from '../lib/time';

/**
 * Captures a stable ISO timestamp at first render, suitable for
 * subscription cursors and time-bounded queries.
 */
export function useFromNow(): string {
    const ref = useRef(getSkewedNow().toISOString());
    return ref.current;
}
