// ═══════════════════════════════════════════════════════════════════
//  useDebounce hook (Minerva-native)
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
    const [debounceValue, setDebounceValue] = useState<T>(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebounceValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debounceValue;
}
