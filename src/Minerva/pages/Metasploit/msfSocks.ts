/**
 * MSF SOCKS orchestration — one tunnel per Mythic operation.
 *
 * Concept:
 *   Every operation gets at most one `auxiliary/server/socks_proxy`
 *   running on its own host port (allocated from 7100-7131). Operators
 *   `route add <subnet> <session>` for every reachable subnet on every
 *   live meterpreter session inside that operation. The SOCKS proxy
 *   consults the global route table on each TCP request, so a single
 *   port pivots through every attached session automatically.
 *
 * Traffic path:
 *   proxychains4 → <mythic-host>:<port>  (host port published by compose)
 *     → auxiliary/server/socks_proxy (SRVHOST=0.0.0.0, VERSION=5)
 *       → MSF global route table
 *         → meterpreter session N (whichever owns the target subnet)
 *           → target host
 *
 * Public surface:
 *   ensureOperationSocks(opId)       — start (idempotent)
 *   addSessionRoutes(opId, sid, subnets[])     — `route add` + cache
 *   removeSessionRoutes(opId, sid)   — `route remove` + drop cache entry
 *   stopOperationSocks(opId)         — `jobs -K` + `route flush` + drop tunnel
 *   suggestSubnetsFromIps(ips[])     — derive /24s from a session's interfaces
 */
import {
    consoleCreate,
    consoleDestroy,
    consoleWrite,
    consoleRead,
    stopJob,
    getJobs,
} from './msfrpc';
import {
    allocatePortForOperation,
    releasePortForOperation,
} from '../../lib/msfSocksAllocator';
import {
    upsertTunnel,
    removeTunnel,
    setJobId,
    setSessionRoutes,
    removeSession,
    getTunnelForOperation,
    type MsfOperationTunnel,
} from './msfTunnelStore';

// Canonicalise to CIDR. "192.168.1.0" → "192.168.1.0/24"; passthrough for
// inputs that already have a /mask suffix.
export function normaliseCidr(s: string): string {
    const trimmed = (s || '').trim();
    if (!trimmed) return '';
    if (/\/\d+$/.test(trimmed)) return trimmed;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) return `${trimmed}/24`;
    return trimmed;
}

/**
 * Auto-suggest CIDRs from a list of IPs reported by a session
 * (every NIC's address from `ipconfig`, plus session.tunnel_peer).
 * Skips loopback/link-local. Used by the bootstrap auto-router and the
 * dialog's pre-fill.
 */
export function suggestSubnetsFromIps(ips: string[]): string[] {
    const set = new Set<string>();
    for (const ip of ips) {
        if (!ip) continue;
        if (ip.startsWith('127.') || ip.startsWith('169.254.') || ip === '0.0.0.0') continue;
        const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.\d+$/);
        if (!m) continue;
        set.add(`${m[1]}.${m[2]}.${m[3]}.0/24`);
    }
    return [...set].sort();
}

/**
 * Convert a dotted-decimal IPv4 netmask (e.g. "255.255.255.0") to its
 * CIDR prefix length (e.g. 24). Returns null for malformed input.
 */
function netmaskToPrefix(mask: string): number | null {
    const m = mask.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return null;
    let bits = 0;
    for (let i = 1; i <= 4; i++) {
        const byte = parseInt(m[i], 10);
        if (byte < 0 || byte > 255) return null;
        bits += byte.toString(2).split('').filter(c => c === '1').length;
    }
    return bits;
}

/**
 * Parse `post/multi/manage/autoroute` console output for the subnets it
 * advertised as added. MSF emits one line per discovered route:
 *   "[+] Route added to subnet 192.168.50.0/255.255.255.0 from host's routing table."
 * (Some builds use a CIDR prefix instead of a dotted mask.)
 */
export function parseAutorouteOutput(output: string): string[] {
    const re = /Route added to subnet (\d+\.\d+\.\d+\.\d+)\/(\d+\.\d+\.\d+\.\d+|\d+)/g;
    const out = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(output)) !== null) {
        const subnet = m[1];
        const maskOrPrefix = m[2];
        const prefix = maskOrPrefix.includes('.')
            ? netmaskToPrefix(maskOrPrefix)
            : parseInt(maskOrPrefix, 10);
        if (prefix == null || isNaN(prefix) || prefix < 1 || prefix > 32) continue;
        // Skip loopback / link-local / default — MSF will sometimes echo
        // these from the target's full routing table; they're never
        // useful as pivot routes.
        if (subnet.startsWith('127.')) continue;
        if (subnet.startsWith('169.254.')) continue;
        if (subnet === '0.0.0.0') continue;
        out.add(`${subnet}/${prefix}`);
    }
    return [...out].sort();
}

// ─── Console plumbing ─────────────────────────────────────────────────────

async function drainConsole(consoleId: string, timeoutMs = 5000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let output = '';
    let quietReads = 0;
    while (Date.now() < deadline) {
        const r = await consoleRead(consoleId);
        if (r.data) {
            output += r.data;
            quietReads = 0;
        } else {
            quietReads++;
        }
        if (!r.busy && quietReads >= 2) break;
        await new Promise(res => setTimeout(res, 120));
    }
    return output;
}

async function execScript(consoleId: string, lines: string[]): Promise<string> {
    let output = '';
    for (const line of lines) {
        await consoleWrite(consoleId, line);
        output += await drainConsole(consoleId);
    }
    return output;
}

function parseJobId(output: string): string | null {
    const m = output.match(/Auxiliary module running as background job (\d+)/i);
    return m ? m[1] : null;
}

/** Fallback: locate the socks_proxy job whose SRVPORT matches `port`. */
async function findSocksJobByPort(port: number): Promise<string | null> {
    try {
        const jobs = await getJobs();
        for (const [id, name] of Object.entries(jobs)) {
            if (typeof name !== 'string') continue;
            if (/socks_proxy/i.test(name) && (name.includes(`:${port}`) || name.includes(`${port}`))) return id;
        }
        // NO second pass. There used to be one here that returned *any*
        // socks_proxy job when the name did not carry the port — which meant an
        // operator whose own bind had failed silently adopted a teammate's
        // proxy, and then pushed `route add` for their subnets into the one MSF
        // route table the teammate's proxychains was consuming. A wrong job id
        // is worse than none: the caller can start a fresh proxy, but it cannot
        // detect that it has been handed someone else's.
    } catch { /* ignore */ }
    return null;
}

/**
 * Run `post/multi/manage/autoroute` against a meterpreter session and
 * parse the subnets it discovered + added to MSF's global route table.
 *
 * Why this is better than deriving subnets from the callback's reported
 * IP list: autoroute reads the *target's* routing table from the
 * meterpreter session, so it picks up every subnet the box can reach —
 * including non-/24s and networks attached to a NIC whose IP wasn't in
 * the callback record. Result: one call, every pivot route the host
 * can offer is added.
 *
 * Returns the parsed CIDR list (already canonicalised, sorted, deduped,
 * with loopback/link-local filtered out). The function does *not*
 * persist anything on its own — callers feed the result to
 * `addSessionRoutes(opId, sid, [...existing, ...discovered])` so route
 * additions go through the same dedup-and-cache path everything else
 * uses.
 */
export async function runAutorouteForSession(sessionId: string): Promise<string[]> {
    if (!sessionId) return [];
    const consoleId = (await consoleCreate()).id;
    try {
        await drainConsole(consoleId, 1500);
        // autoadd is the default CMD, but we set it explicitly so the
        // behaviour doesn't drift if a future MSF version changes
        // module defaults.
        const output = await execScript(consoleId, [
            'use post/multi/manage/autoroute',
            `set SESSION ${sessionId}`,
            'set CMD autoadd',
            'run',
        ]);
        return parseAutorouteOutput(output);
    } finally {
        try { await consoleDestroy(consoleId); } catch { /* ignore */ }
    }
}

// ─── Public API ───────────────────────────────────────────────────────────

// Throttle re-verification of operation tunnel state. Without this the
// boot bootstrap (which fires every time the synthetic callbacks ledger
// updates — roughly every 8s) burns one `getJobs()` RPC per call, plus
// extra console RPCs from the chained `addSessionRoutes` per session.
// 30s is short enough to recover from an externally-killed job quickly
// without saturating the RPC channel during steady state.
const ENSURE_TTL_MS = 30_000;
const ensuredAt = new Map<string, number>();

/**
 * Start the SOCKS server for this operation if it isn't already running.
 * Idempotent — multiple callers (boot bootstrap, dialog, quickhack) can
 * all call this without colliding.
 *
 * Returns the operation's port or null if the range is exhausted.
 */
export async function ensureOperationSocks(operationId: number | string): Promise<number | null> {
    if (!operationId || operationId === 0 || operationId === '0') return null;
    const opKey = String(operationId);

    // Fast path — if we verified this op recently AND we have a cached
    // tunnel record with a jobId, trust it.
    const existing = getTunnelForOperation(opKey);
    const last = ensuredAt.get(opKey) ?? 0;
    if (existing?.jobId && Date.now() - last < ENSURE_TTL_MS) {
        return existing.port;
    }

    // Slower path — confirm with `getJobs` before paying for a full restart.
    if (existing?.jobId) {
        try {
            const jobs = await getJobs();
            if (jobs[existing.jobId]) {
                ensuredAt.set(opKey, Date.now());
                return existing.port;
            }
        } catch { /* fall through and (re)start */ }
    }

    // Shared, atomically-claimed ledger — see lib/msfSocksAllocator.ts. The
    // synchronous cache read alone is not enough to allocate: another operator
    // may hold the port we think is free.
    const port = await allocatePortForOperation(opKey);
    if (port == null) {
        throw new Error('MSF SOCKS port range (7100-7131) is exhausted — too many operations.');
    }

    // Spin up socks_proxy on this port.
    const consoleId = (await consoleCreate()).id;
    let jobId: string | null = null;
    try {
        await drainConsole(consoleId, 1500);
        const output = await execScript(consoleId, [
            'use auxiliary/server/socks_proxy',
            `set SRVPORT ${port}`,
            'set SRVHOST 0.0.0.0',
            'set VERSION 5',
            'run -j',
        ]);
        jobId = parseJobId(output) || (await findSocksJobByPort(port));
    } finally {
        try { await consoleDestroy(consoleId); } catch { /* ignore */ }
    }

    if (!jobId) {
        // We started a proxy but cannot say which job it is. Recording the
        // tunnel anyway used to leave a record that stopOperationSocks could
        // never kill, and that the UI reported as healthy. Release the port so
        // the next attempt starts clean rather than leaking it from the range.
        await releasePortForOperation(opKey);
        throw new Error(
            `MSF SOCKS started on port ${port} but its job id could not be resolved — not recording an untrackable tunnel. Check 'jobs -l' in msfconsole.`,
        );
    }

    const startedAt = existing?.startedAt ?? new Date().toISOString();
    upsertTunnel({
        operationId: opKey,
        port,
        jobId,
        sessions: existing?.sessions ?? {},
        startedAt,
    });
    ensuredAt.set(opKey, Date.now());

    // If routes were previously cached (operator reloaded the page or
    // we just restarted the server), replay them so the route table
    // matches our stored state.
    if (existing?.sessions && Object.keys(existing.sessions).length > 0) {
        const cId2 = (await consoleCreate()).id;
        try {
            await drainConsole(cId2, 1000);
            const lines: string[] = [];
            for (const [sid, info] of Object.entries(existing.sessions)) {
                for (const cidr of info.subnets) lines.push(`route add ${cidr} ${sid}`);
            }
            if (lines.length > 0) await execScript(cId2, lines);
        } finally {
            try { await consoleDestroy(cId2); } catch { /* ignore */ }
        }
    }

    return port;
}

/**
 * Add `route add <subnet> <sessionId>` for every CIDR in the list and
 * cache the result. If the subnet list is empty the session is removed
 * from the tunnel (see removeSessionRoutes).
 */
export async function addSessionRoutes(
    operationId: number | string,
    sessionId: string,
    subnets: string[],
): Promise<void> {
    if (!sessionId) return;
    const opKey = String(operationId);
    const canon = [...new Set(subnets.map(normaliseCidr).filter(Boolean))].sort();

    // Fast path: if the cached subnets match exactly AND the tunnel
    // exists, there's nothing to do — skip both the ensure RPC and the
    // console scripting. This is the common case once the bootstrap has
    // run once on a steady-state session list, and stops the boot
    // bootstrap from issuing dozens of msf-rpc calls every 8 seconds.
    const cached = getTunnelForOperation(opKey);
    if (cached?.jobId) {
        const cur = cached.sessions[sessionId]?.subnets ?? [];
        if (cur.length === canon.length && cur.slice().sort().join(',') === canon.join(',')) {
            return;
        }
    }

    // Ensure SOCKS is up first (cheap when ensureCache is warm).
    await ensureOperationSocks(opKey);

    if (canon.length === 0) {
        await removeSessionRoutes(opKey, sessionId);
        return;
    }

    // Figure out the delta — only run console for added/removed subnets.
    const existing = getTunnelForOperation(opKey);
    const old = new Set(existing?.sessions[sessionId]?.subnets ?? []);
    const toAdd = canon.filter(c => !old.has(c));
    const toRm = [...old].filter(c => !canon.includes(c));

    if (toAdd.length > 0 || toRm.length > 0) {
        const cId = (await consoleCreate()).id;
        try {
            await drainConsole(cId, 1000);
            const lines: string[] = [];
            for (const cidr of toRm) lines.push(`route remove ${cidr} ${sessionId}`);
            for (const cidr of toAdd) lines.push(`route add ${cidr} ${sessionId}`);
            await execScript(cId, lines);
        } finally {
            try { await consoleDestroy(cId); } catch { /* ignore */ }
        }
    }

    setSessionRoutes(opKey, sessionId, canon);
}

/**
 * Remove every route this session has attached to the operation tunnel,
 * then drop it from the cached session map. Safe to call when the
 * session has no routes (no-op).
 */
export async function removeSessionRoutes(
    operationId: number | string,
    sessionId: string,
): Promise<void> {
    if (!sessionId) return;
    const opKey = String(operationId);
    const existing = getTunnelForOperation(opKey);
    const subnets = existing?.sessions[sessionId]?.subnets ?? [];
    if (subnets.length === 0) {
        removeSession(opKey, sessionId);
        return;
    }
    const cId = (await consoleCreate()).id;
    try {
        await drainConsole(cId, 1000);
        await execScript(cId, subnets.map(c => `route remove ${c} ${sessionId}`));
    } finally {
        try { await consoleDestroy(cId); } catch { /* ignore */ }
    }
    removeSession(opKey, sessionId);
}

/**
 * Stop the SOCKS server for an operation entirely — kills the job,
 * flushes its routes from MSF's table, and drops the tunnel record +
 * port allocation. The operator can re-ensure later.
 */
export async function stopOperationSocks(operationId: number | string): Promise<void> {
    const opKey = String(operationId);
    const t = getTunnelForOperation(opKey);
    if (!t) {
        await releasePortForOperation(opKey);
        return;
    }

    // 1. Kill SOCKS aux job.
    let jobId = t.jobId;
    if (!jobId) jobId = await findSocksJobByPort(t.port);
    if (jobId) {
        try { await stopJob(jobId); } catch { /* fall back below */ }
    }

    // 2. Flush every cached route on a one-shot console.
    const allLines: string[] = [];
    for (const [sid, info] of Object.entries(t.sessions)) {
        for (const cidr of info.subnets) allLines.push(`route remove ${cidr} ${sid}`);
    }
    if (allLines.length > 0 || jobId) {
        const cId = (await consoleCreate()).id;
        try {
            await drainConsole(cId, 1000);
            if (jobId) allLines.unshift(`jobs -K ${jobId}`);
            await execScript(cId, allLines);
        } finally {
            try { await consoleDestroy(cId); } catch { /* ignore */ }
        }
    }

    removeTunnel(opKey);
    await releasePortForOperation(opKey);
    ensuredAt.delete(opKey);
}

// ─── Compat exports — old per-session API, mapped onto the new model so
//     the rest of the UI keeps working while we migrate callers.

/** @deprecated use ensureOperationSocks + addSessionRoutes. */
export async function startMsfSocksTunnel(p: { sessionId: string; subnets: string[]; operationId: number | string }): Promise<{ port: number; jobId: string | null }> {
    const port = await ensureOperationSocks(p.operationId);
    if (port == null) throw new Error('No SOCKS port available for this operation.');
    await addSessionRoutes(p.operationId, p.sessionId, p.subnets);
    const t = getTunnelForOperation(p.operationId);
    return { port, jobId: t?.jobId ?? null };
}

/** @deprecated use removeSessionRoutes. */
export async function stopMsfSocksTunnel(sessionId: string, operationId: number | string): Promise<void> {
    if (!operationId) return;
    await removeSessionRoutes(operationId, sessionId);
}

export type { MsfOperationTunnel };
