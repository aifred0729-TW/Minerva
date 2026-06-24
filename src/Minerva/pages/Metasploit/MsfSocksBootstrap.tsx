/**
 * MsfSocksBootstrap
 *
 * Mounted once at the app shell. Runs the lifecycle that the operator
 * used to have to do manually:
 *
 *   1. On startup (and whenever the current operation changes), ensure
 *      the per-operation SOCKS proxy is running. Idempotent.
 *   2. Subscribe to the synthetic MSF callbacks; for every alive
 *      meterpreter session inside the current operation, auto-add
 *      `/24` routes derived from its known IPs.
 *   3. When a meterpreter session dies or leaves the operation, drop
 *      its routes from the tunnel.
 *
 * Errors (MSF RPC offline, range exhausted, etc.) are caught and
 * retried on a backoff; nothing in the rest of the UI should crash
 * because this component is doing its job in the background.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useReactiveVar } from '@apollo/client/react';
import { meState } from '../../lib/state';
import { useMsfSyntheticCallbacks, msfSessionIdOf } from '../Callbacks/msfSyntheticCallbacks';
import {
    ensureOperationSocks,
    addSessionRoutes,
    removeSessionRoutes,
    suggestSubnetsFromIps,
    runAutorouteForSession,
} from './msfSocks';
import { ensureMsfWorkspace, workspaceForOperation } from './msfrpc';
import { extractAllIPs } from '../../lib/quickhacks';

const RETRY_BACKOFF_MS = 15_000;

export function MsfSocksBootstrap() {
    const me = useReactiveVar(meState);
    const opId = me.user?.current_operation_id ?? 0;
    const callbacks = useMsfSyntheticCallbacks();
    const lastBootErrorAt = useRef<number>(0);

    // 1. Ensure the per-operation MSF workspace exists + is current,
    //    then bring up the per-operation SOCKS server. Workspace runs
    //    first so any sessions opened next (via Minerva's Launch
    //    Attack flow) inherit the right workspace tag — that's the tag
    //    `useMsfSyntheticCallbacks` filters on to isolate Op A from
    //    Op B.
    useEffect(() => {
        if (!opId) return;
        let cancelled = false;
        const run = async () => {
            try {
                await ensureMsfWorkspace(workspaceForOperation(opId));
                if (cancelled) return;
                await ensureOperationSocks(opId);
                lastBootErrorAt.current = 0;
            } catch (e) {
                // MSF RPC probably down — retry quietly on the backoff.
                const now = Date.now();
                if (now - lastBootErrorAt.current > 60_000) {
                    // Log once per minute at most.
                    // eslint-disable-next-line no-console
                    console.warn('[MsfSocksBootstrap] workspace/SOCKS ensure failed; will retry:', (e as Error).message);
                    lastBootErrorAt.current = now;
                }
                if (!cancelled) setTimeout(run, RETRY_BACKOFF_MS);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [opId]);

    // 2. Reconcile session routes whenever the meaningful slice of the
    //    callback list changes (session id set + their IP lists). The
    //    underlying `useMsfSyntheticCallbacks` ledger fires a fresh
    //    array reference on every 8s poll because `lastSeen` is bumped
    //    on each successful tick — without the fingerprint guard below
    //    we would re-issue a wave of msf-rpc calls every poll.
    const attachedRef = useRef<Set<string>>(new Set());
    // Track which sessions have had `post/multi/manage/autoroute` run
    // against them in this browser session. Autoroute is expensive
    // (creates a console, runs a post module against the target), so
    // we do it once per session-id then let the cheap IP-derived
    // reconcile take over for steady state.
    const autoroutedRef = useRef<Set<string>>(new Set());
    const lastFingerprintRef = useRef<string>('');
    const fingerprint = useMemo(() => {
        // Only the bits that actually drive route decisions: session id
        // and the host's IP list. Everything else (lastSeen timestamps,
        // descriptions, etc.) changes every poll and we don't care.
        const parts: string[] = [];
        for (const c of callbacks) {
            if (!(c as any)._isMsfSession) continue;
            if (c.dead) continue;
            const t = (c as any)._msfSessionType?.toLowerCase?.();
            if (t !== 'meterpreter') continue;
            const sid = msfSessionIdOf(c as any);
            if (!sid) continue;
            const ips = extractAllIPs((c as any).ip).slice().sort().join(',');
            parts.push(`${sid}:${ips}`);
        }
        parts.sort();
        return parts.join('|');
    }, [callbacks]);

    useEffect(() => {
        if (!opId) return;
        if (fingerprint === lastFingerprintRef.current) return;
        lastFingerprintRef.current = fingerprint;

        let cancelled = false;
        const reconcile = async () => {
            const alivePerType = callbacks.filter(c => {
                if (!(c as any)._isMsfSession) return false;
                if (c.dead) return false;
                const t = (c as any)._msfSessionType?.toLowerCase?.();
                return t === 'meterpreter';
            });

            const aliveIds = new Set<string>();
            for (const cb of alivePerType) {
                const sid = msfSessionIdOf(cb as any);
                if (!sid) continue;
                aliveIds.add(sid);

                // Cheap path: derive /24s from the IPs MSF already
                // reported on this callback. Always runs.
                const ips = extractAllIPs((cb as any).ip);
                const ipDerived = suggestSubnetsFromIps(ips);

                // Thorough path (once per session): run autoroute to
                // discover every subnet the *target's* routing table
                // can reach — including non-/24s and networks behind
                // NICs that weren't part of the callback record.
                let discovered: string[] = [];
                if (!autoroutedRef.current.has(sid)) {
                    try {
                        discovered = await runAutorouteForSession(sid);
                        autoroutedRef.current.add(sid);
                    } catch (e) {
                        // Leave sid out of the set so the next reconcile retries.
                        // eslint-disable-next-line no-console
                        console.warn(`[MsfSocksBootstrap] autoroute(${sid}) failed:`, (e as Error).message);
                    }
                    if (cancelled) return;
                }

                const merged = [...new Set([...ipDerived, ...discovered])];
                if (merged.length === 0) continue;

                try {
                    await addSessionRoutes(opId, sid, merged);
                    attachedRef.current.add(sid);
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.warn(`[MsfSocksBootstrap] addSessionRoutes(${sid}) failed:`, (e as Error).message);
                }
                if (cancelled) return;
            }

            // Detach sessions that vanished.
            for (const sid of [...attachedRef.current]) {
                if (aliveIds.has(sid)) continue;
                try { await removeSessionRoutes(opId, sid); } catch { /* ignore */ }
                attachedRef.current.delete(sid);
                // If this sid ever resurrects, run autoroute fresh.
                autoroutedRef.current.delete(sid);
                if (cancelled) return;
            }
        };
        reconcile();
        return () => { cancelled = true; };
    }, [opId, fingerprint, callbacks]);

    return null;
}
