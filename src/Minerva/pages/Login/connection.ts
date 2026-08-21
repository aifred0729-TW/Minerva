// ═══════════════════════════════════════════════════════════════════
//  Where this page is talking to, plus the two maths helpers the
//  login screens share.
// ═══════════════════════════════════════════════════════════════════

/**
 * The address this page was dialled on. Frozen at module load rather than
 * recomputed per render: `window.location` cannot change without a navigation,
 * and returning a fresh object each render defeated `React.memo` on every
 * component this is passed to.
 */
export const CONN = (() => {
    const loc = window.location;
    return {
        hostname: loc.hostname || '127.0.0.1',
        port: loc.port || (loc.protocol === 'https:' ? '443' : '80'),
        protocol: loc.protocol === 'https:' ? 'HTTPS' : 'HTTP',
        secure: loc.protocol === 'https:',
    } as const;
})();

export type ConnInfo = typeof CONN;

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Reveals a string character by character as `p` runs 0 -> 1. */
export const typeOut = (text: string, p: number) =>
    text.slice(0, Math.round(text.length * clamp01(p)));
