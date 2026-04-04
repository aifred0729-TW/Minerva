import { useState, useEffect } from 'react';

/**
 * Returns `true` when the document/tab is visible, `false` when hidden.
 * Use this to conditionally enable polling when the page is in the foreground.
 *
 * Usage:
 *   const visible = usePageVisible();
 *   useQuery<any>(MY_QUERY, { pollInterval: visible ? 10000 : 0 });
 */
export function usePageVisible(): boolean {
    const [visible, setVisible] = useState(() => typeof document !== 'undefined' ? !document.hidden : true);

    useEffect(() => {
        const handler = () => setVisible(!document.hidden);
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    }, []);

    return visible;
}
