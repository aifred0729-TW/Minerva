import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSubscription, useMutation } from "@apollo/client/react";
import { useQueryCompat as useQuery, useLazyQueryCompat as useLazyQuery} from "../../lib/useQueryCompat";
import { AnimatePresence } from 'framer-motion';
import { Plus, Upload, Package, Eye, EyeOff, List, Box } from 'lucide-react';
import { cn, b64DecodeUnicode, downloadBlob } from '../../lib/utils';
import { getSkewedNow } from '../../lib/time';
import { snackActions } from '../../lib/snackbar';
import { useBattleMode } from '../../context/BattleModeContext';
import { SUB_Payloads, GET_BUILDING_PAYLOADS } from '../../lib/api/payloads';
import type { Payload, TabType } from '../../types/payloads';
import { PayloadRow } from './PayloadRow';
import { MsfPayloadRow } from './MsfPayloadRow';
import { ImportPayloadConfigDialog } from './dialogs';
import { LABEL, NoData, StatusWord } from '../../components/Instrument';
import { useNavigate } from 'react-router-dom';
import { PayloadsQuery, exportPayloadConfigQuery, payloadsCallbackAlert, payloadsCallbackAllowed, payloadsDelete, rebuildPayloadMutation, restorePayloadMutation } from '../../lib/api';
import {
    type MsfPayloadRecord, listLocalPayloads, saveLocalPayload, decodeRecordFromAgentStorage,
} from '../../lib/msfPayloads';
import { GET_MSF_PAYLOADS, UPSERT_MSF_PAYLOAD, DELETE_MSF_PAYLOAD, MSF_PAYLOAD_LEGACY_PREFIX, msfPayloadPrefixForOp, msfPayloadUniqueIdFor } from '../../lib/api/msfPayloads';
import { useReactiveVar } from '@apollo/client/react';
import { meState } from '../../lib/state';

const BUILD_POLL_INTERVAL_MS = 4_000;

/** What the page rail needs to state the inventory's posture out loud. */
export type PayloadsStats = {
    /** Rows currently rendered, after the deleted/auto filters. */
    visible: number;
    /** Mythic payloads matching the current filters, across all pages. */
    total: number;
    /** Locally generated msfvenom payloads. */
    msf: number;
    building: number;
    failed: number;
    ready: number;
};

/**
 * The three tabs of the payloads surface.
 *
 * A tablist, not a segmented control: each one really does swap the panel
 * underneath, so the roles are the honest ones and arrow keys are what a
 * screen reader user will expect. The active tab is stated by weight and a
 * solid underline rather than by dimming the other two — twenty-five nav
 * targets rendered at `text-gray-400` was the anti-pattern this replaces
 * (DESIGN_LANGUAGE.md §1, §10).
 */
export const TabNavigation: React.FC<{
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
    totalPayloads: number;
}> = ({ activeTab, onTabChange, totalPayloads }) => {
    const tabs = [
        { id: 'list' as TabType, label: 'PAYLOADS', icon: List, count: totalPayloads },
        { id: 'create' as TabType, label: 'CREATE PAYLOAD', icon: Plus },
        { id: 'wrapper' as TabType, label: 'CREATE WRAPPER', icon: Package },
    ];

    return (
        <div role="tablist" aria-label="Payload views" className="flex items-center gap-1 border-b border-signal/20">
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onTabChange(tab.id)}
                        className={cn(
                            "relative inline-flex min-h-[38px] items-center gap-2 px-4 text-[12px] uppercase tracking-[0.1em] text-signal transition-colors",
                            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal",
                            isActive ? "font-bold" : "font-medium hover:bg-signal/[0.06]",
                        )}
                    >
                        <Icon size={13} strokeWidth={2} aria-hidden="true" />
                        {tab.label}
                        {tab.count !== undefined && (
                            <span className={cn(
                                "rounded-sm border px-1.5 text-[11px] font-bold tabular-nums",
                                isActive ? "border-signal/40 bg-signal/10" : "border-signal/20",
                            )}>
                                {tab.count}
                            </span>
                        )}
                        {isActive && (
                            <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 bg-signal" />
                        )}
                    </button>
                );
            })}
        </div>
    );
};

/**
 * Toolbar toggle. ON inverts rather than tinting: "am I looking at deleted
 * payloads right now" has to be certain before anything in the table below is
 * trusted, and inversion survives greyscale where a wash does not.
 */
const FilterToggle: React.FC<{
    on: boolean;
    onClick: () => void;
    labelOn: string;
    labelOff: string;
}> = ({ on, onClick, labelOn, labelOff }) => (
    <button
        onClick={onClick}
        aria-pressed={on}
        className={cn(
            "inline-flex min-h-[34px] items-center gap-2 rounded-sm border px-3 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal",
            on
                ? "border-signal bg-signal text-void"
                : "border-signal/20 text-signal hover:border-signal/45 hover:bg-signal/10",
        )}
    >
        {on ? <Eye size={13} strokeWidth={2} aria-hidden="true" /> : <EyeOff size={13} strokeWidth={2} aria-hidden="true" />}
        {on ? labelOn : labelOff}
    </button>
);

/** Column header cell. One treatment, one place to change it. */
const Th: React.FC<{ children?: React.ReactNode; className?: string; srOnly?: string }> = ({ children, className, srOnly }) => (
    <th
        scope="col"
        className={cn(
            "sticky top-0 z-10 border-b border-signal/15 bg-void/95 px-3 py-2.5 text-left text-signal backdrop-blur-sm",
            LABEL, className,
        )}
    >
        {srOnly ? <span className="sr-only">{srOnly}</span> : children}
    </th>
);

/**
 * Loading state.
 *
 * A centred spinner tells an operator nothing about what is arriving; a
 * skeleton of the actual table tells them how much and in what shape, and it
 * does not move the layout when the real rows land.
 */
const PayloadsSkeleton = () => (
    <div className="divide-y divide-signal/10" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-4">
                <div className="h-2.5 w-14 shrink-0 animate-pulse rounded-sm bg-signal/10" />
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-sm bg-signal/10" />
                <div className="h-2.5 w-32 animate-pulse rounded-sm bg-signal/10" />
                <div className="h-2.5 w-24 animate-pulse rounded-sm bg-signal/10" />
                <div className="h-2.5 flex-1 animate-pulse rounded-sm bg-signal/[0.06]" />
                <div className="h-2.5 w-28 shrink-0 animate-pulse rounded-sm bg-signal/10" />
            </div>
        ))}
    </div>
);

// ============================================
// Payloads List Component (extracted from main)
// ============================================
export const PayloadsListView: React.FC<{
    onSwitchToCreate: () => void;
    onSwitchToWrapper: () => void;
    /** Reports the inventory's posture up to the page rail. */
    onStats?: (stats: PayloadsStats) => void;
}> = ({ onSwitchToCreate, onSwitchToWrapper, onStats }) => {
    const navigate = useNavigate();
    const handleRebuildFromConfig = useCallback((payload: Payload) => {
        navigate('/create-payload/new', {
            state: {
                fromPayloadId: payload.id,
                fromPayloadOS: payload.os,
                fromPayloadType: payload.payloadtype.name,
            },
        });
    }, [navigate]);
    const { active: isCombat } = useBattleMode();
    const [fromNow] = useState((getSkewedNow()).toISOString());
    const [payloads, setPayloads] = useState<Payload[]>([]);
    const [showDeleted, setShowDeleted] = useState(false);
    const [showAutogenerated, setShowAutogenerated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showImportDialog, setShowImportDialog] = useState(false);

    /* ── MSF payloads (localStorage cache + agentstorage cross-operator) ─
     *
     * Scoped per Mythic operation. `current_operation_id` is read from
     * meState and embedded into both stores' keys so Op A and Op B see
     * disjoint lists. The query pulls only this op's rows; on first
     * sight we also migrate legacy un-op-tagged rows forward into the
     * current operation (one-time per row).
     */
    const me = useReactiveVar(meState);
    const opId = me.user?.current_operation_id ?? 0;
    const [msfPayloads, setMsfPayloads] = useState<MsfPayloadRecord[]>(() => opId ? listLocalPayloads(opId) : []);

    // Reset to the new op's local cache whenever the operator switches
    // operations in the same browser session.
    useEffect(() => { setMsfPayloads(opId ? listLocalPayloads(opId) : []); }, [opId]);

    // Two-step pull:
    //   1) current op's prefix (`minerva_msf_payload:<opId>:%`) — primary scope
    //   2) legacy rows whose `unique_id` doesn't carry an op tag at all
    //      (`minerva_msf_payload:<id>` where <id> is not numeric:) — migrate
    //      them into the current op so the operator still sees them.
    const [upsertMsfPayload] = useMutation<any>(UPSERT_MSF_PAYLOAD);
    const [deleteMsfPayload] = useMutation<any>(DELETE_MSF_PAYLOAD);

    useQuery<any>(GET_MSF_PAYLOADS, {
        variables: { prefix: opId ? `${msfPayloadPrefixForOp(opId)}%` : 'never-matches:%' },
        skip: !opId,
        fetchPolicy: 'network-only',
        onCompleted: (data: any) => {
            const remote: MsfPayloadRecord[] = (data?.agentstorage || [])
                .map((row: any) => decodeRecordFromAgentStorage(row?.data))
                .filter((r: MsfPayloadRecord | null): r is MsfPayloadRecord => r != null);
            const local = listLocalPayloads(opId);
            const localIds = new Set(local.map(r => r.id));
            for (const r of remote) {
                if (!localIds.has(r.id)) saveLocalPayload(opId, r);
            }
            const byId = new Map<string, MsfPayloadRecord>();
            for (const r of local) byId.set(r.id, r);
            for (const r of remote) byId.set(r.id, r);
            setMsfPayloads(Array.from(byId.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
        },
        onError: () => {
            if (opId) setMsfPayloads(listLocalPayloads(opId));
        },
    });

    // Sweep legacy un-op-tagged rows once per session and re-key them under
    // the current operation. The legacy pattern is `minerva_msf_payload:<id>`
    // where <id> doesn't match the new `<opId>:` numeric prefix.
    const legacyMigrated = useRef(false);
    useQuery<any>(GET_MSF_PAYLOADS, {
        variables: { prefix: `${MSF_PAYLOAD_LEGACY_PREFIX}%` },
        skip: !opId || legacyMigrated.current,
        fetchPolicy: 'network-only',
        onCompleted: async (data: any) => {
            if (!opId || legacyMigrated.current) return;
            legacyMigrated.current = true;
            const rows: { unique_id: string; data: any }[] = data?.agentstorage || [];
            for (const row of rows) {
                const suffix = row.unique_id.slice(MSF_PAYLOAD_LEGACY_PREFIX.length);
                // Skip rows already in the new per-op shape (`<digits>:<id>`).
                if (/^\d+:/.test(suffix)) continue;
                const rec = decodeRecordFromAgentStorage(row.data);
                if (!rec) continue;
                // Re-key under current op, then delete the legacy row.
                const newUid = msfPayloadUniqueIdFor(opId, rec.id);
                try {
                    await upsertMsfPayload({ variables: { unique_id: newUid, data: btoa(unescape(encodeURIComponent(JSON.stringify(rec)))) } });
                    await deleteMsfPayload({ variables: { unique_id: row.unique_id } });
                    saveLocalPayload(opId, rec);
                } catch {
                    // Best-effort — operator can manually clean up if migration partially fails.
                }
            }
            setMsfPayloads(listLocalPayloads(opId));
        },
    });

    const visibleMsf = msfPayloads;
    const showMythicRows = true;
    const handleMsfDeleted = useCallback(
        (id: string) => setMsfPayloads(prev => prev.filter(r => r.id !== id)),
        [],
    );
    const handleMsfUpdated = useCallback(
        (updated: MsfPayloadRecord) =>
            setMsfPayloads(prev => prev.map(r => (r.id === updated.id ? updated : r))),
        [],
    );
    const [pageData, setPageData] = useState({
        totalCount: 0,
        fetchLimit: 20,
        currentPage: 1
    });
    const mountedRef = useRef(true);
    // Item 2: track prior build phases to detect build-complete state changes
    const prevBuildPhases = useRef<Record<number, string>>({});

    // Item 6: lazy query to poll currently-building payloads that existed before mount
    const [fetchBuilding] = useLazyQuery<any>(GET_BUILDING_PAYLOADS, {
        fetchPolicy: 'network-only',
        onCompleted: (data: any) => {
            if (!mountedRef.current) return;
            if (!data.payload.length) return;
            setPayloads(prev => {
                const updated = [...prev];
                for (const bp of data.payload) {
                    const idx = updated.findIndex(p => p.id === bp.id);
                    if (idx > -1) updated[idx] = { ...bp };
                }
                return updated;
            });
        }
    });

    // Subscription for real-time updates
    useSubscription<any>(SUB_Payloads, {
        variables: { now: fromNow },
        fetchPolicy: "no-cache",
        onData: ({ data }: { data: any } ) => {
            if (!mountedRef.current) return;
            setPayloads(prev => {
                const updated = data.data.payload_stream.reduce((acc: Payload[], cur: Payload) => {
                    const index = acc.findIndex((p) => p.id === cur.id);
                    if (index > -1) {
                        acc[index] = { ...cur };
                        return [...acc];
                    }
                    return [cur, ...acc];
                }, [...prev]);
                updated.sort((a: Payload, b: Payload) => (a.id > b.id ? -1 : 1));
                return updated;
            });
        },
        onError: (err) => { console.error('[SUB_Payloads] subscription error:', err); },
    });

    // Initial query
    useQuery<any>(PayloadsQuery, {
        variables: { offset: 0, limit: pageData.fetchLimit, showDeleted: false, showAutogenerated: false },
        fetchPolicy: "no-cache",
        onCompleted: (data: any) => {
            setPageData(prev => ({ ...prev, totalCount: data.payload_aggregate.aggregate.count }));
            setPayloads(data.payload);
            setLoading(false);
        }
    });

    // Lazy query for pagination
    const [fetchNewPage] = useLazyQuery<any>(PayloadsQuery, {
        onCompleted: (data: any) => {
            snackActions.dismiss();
            setPageData(prev => ({ ...prev, totalCount: data.payload_aggregate.aggregate.count }));
            setPayloads(data.payload);
            setLoading(false);
        }
    });

    // Mutations
    const [deletePayload] = useMutation<any>(payloadsDelete, {
        onCompleted: (data: any) => {
            if (data.updatePayload.status === "success") {
                const updated = payloads.map(p => p.id === data.updatePayload.id ? { ...p, deleted: true } : p);
                setPayloads(updated);
                snackActions.success("Payload deleted");
            } else {
                snackActions.error(data.updatePayload.error);
            }
        },
        onError: () => snackActions.warning("Failed to delete payload")
    });

    const [restorePayload] = useMutation<any>(restorePayloadMutation, {
        onCompleted: (data: any) => {
            const updated = payloads.map(p => p.id === data.updatePayload.id ? { ...p, deleted: false } : p);
            setPayloads(updated);
            snackActions.success("Payload restored");
        },
        onError: () => snackActions.warning("Failed to restore payload")
    });

    const [toggleCallbackAlert] = useMutation<any>(payloadsCallbackAlert, {
        onCompleted: (data: any) => {
            const updated = payloads.map(p => p.id === data.updatePayload.id ? { ...p, callback_alert: data.updatePayload.callback_alert } : p);
            setPayloads(updated);
            snackActions.success(data.updatePayload.callback_alert ? "Callback alerts enabled" : "Callback alerts disabled");
        },
        onError: () => snackActions.warning("Failed to update callback alert")
    });

    const [toggleCallbackAllowed] = useMutation<any>(payloadsCallbackAllowed, {
        onCompleted: (data: any) => {
            const updated = payloads.map(p => p.id === data.updatePayload.id ? { ...p, callback_allowed: data.updatePayload.callback_allowed } : p);
            setPayloads(updated);
            snackActions.success(data.updatePayload.callback_allowed ? "Callbacks allowed" : "Callbacks blocked");
        },
        onError: () => snackActions.warning("Failed to update callback allowed")
    });

    const [rebuildPayload] = useMutation<any>(rebuildPayloadMutation, {
        onCompleted: (data: any) => {
            if (data.rebuild_payload.status === "success") {
                snackActions.success("Rebuild triggered");
            } else {
                snackActions.error("Failed to rebuild: " + data.rebuild_payload.error);
            }
        },
        onError: (error) => snackActions.error("Failed to trigger rebuild: " + error.message)
    });

    const [exportConfig] = useLazyQuery<any>(exportPayloadConfigQuery, {
        fetchPolicy: "no-cache",
        onCompleted: (data: any) => {
            if (data.exportPayloadConfig.status === "success") {
                const dataBlob = new Blob([data.exportPayloadConfig.config], { type: 'text/plain' });
                downloadBlob(dataBlob, 'payload_config.json');
            } else {
                snackActions.error("Failed to export: " + data.exportPayloadConfig.error);
            }
        },
        onError: (error) => snackActions.error("Failed to export: " + error.message)
    });

    // Handlers
    const handleChangePage = (page: number) => {
        setLoading(true);
        setPageData(prev => ({ ...prev, currentPage: page }));
        fetchNewPage({ 
            variables: { 
                offset: (page - 1) * pageData.fetchLimit, 
                limit: pageData.fetchLimit, 
                showDeleted, 
                showAutogenerated 
            }
        });
    };

    const handleToggleDeleted = () => {
        setShowDeleted(!showDeleted);
        setLoading(true);
        fetchNewPage({ 
            variables: { 
                offset: 0, 
                limit: pageData.fetchLimit, 
                showDeleted: !showDeleted, 
                showAutogenerated 
            }
        });
    };

    const handleToggleAutogenerated = () => {
        setShowAutogenerated(!showAutogenerated);
        setLoading(true);
        fetchNewPage({ 
            variables: { 
                offset: 0, 
                limit: pageData.fetchLimit, 
                showDeleted, 
                showAutogenerated: !showAutogenerated 
            }
        });
    };

    useEffect(() => {
        return () => { mountedRef.current = false; };
    }, []);

    // Item 2: toast notification when a build transitions from building → done
    useEffect(() => {
        for (const p of payloads) {
            const prev = prevBuildPhases.current[p.id];
            if (prev === 'building' && p.build_phase === 'success') {
                const fname = p.filemetum ? b64DecodeUnicode(p.filemetum.filename_text) : p.uuid.slice(0, 8);
                snackActions.success(`Build complete: ${fname}`);
            } else if (prev === 'building' && p.build_phase === 'error') {
                const fname = p.filemetum ? b64DecodeUnicode(p.filemetum.filename_text) : p.uuid.slice(0, 8);
                snackActions.error(`Build failed: ${fname}`);
            }
            prevBuildPhases.current[p.id] = p.build_phase;
        }
    }, [payloads]); // eslint-disable-line react-hooks/exhaustive-deps

    // Item 6: poll for pre-existing building payloads (subscription cursor starts at mount, misses prior builds)
    const hasBuildingPayloads = payloads.some(p => p.build_phase === 'building');
    useEffect(() => {
        if (!hasBuildingPayloads) return;
        fetchBuilding();
        const id = setInterval(() => { if (mountedRef.current) fetchBuilding(); }, BUILD_POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [hasBuildingPayloads]); // eslint-disable-line react-hooks/exhaustive-deps

    const totalPages = Math.ceil(pageData.totalCount / pageData.fetchLimit);

    // ── Posture ─────────────────────────────────────────────────────────────
    //
    // Counted here, where the subscription already lives, and handed up to the
    // rail. The alternative — a second copy of the query in the page shell —
    // would let the header and the table disagree about how many builds are
    // running, which is the one thing a status line must never do.
    const visibleMythic = showDeleted ? payloads : payloads.filter(p => !p.deleted);
    const building = visibleMythic.filter(p => p.build_phase === 'building').length;
    const failed = visibleMythic.filter(p => p.build_phase === 'error').length;
    const ready = visibleMythic.filter(p => p.build_phase === 'success').length + visibleMsf.length;
    const visibleCount = visibleMythic.length + visibleMsf.length;

    useEffect(() => {
        onStats?.({
            visible: visibleCount,
            total: pageData.totalCount,
            msf: visibleMsf.length,
            building,
            failed,
            ready,
        });
    }, [onStats, visibleCount, pageData.totalCount, visibleMsf.length, building, failed, ready]);


    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* ── Controls ─────────────────────────────────────────────────
                Same two groups the toolbar has always had — what the table is
                allowed to show on the left, what you can add to it on the
                right — rebuilt out of the console's controls so they match the
                filter bar on C2 PROFILES exactly. */}
            <div
                className="mv-panel-enter flex shrink-0 flex-wrap items-center justify-between gap-3"
                style={{ '--mv-panel-index': 1 } as React.CSSProperties}
            >
                <div className="flex flex-wrap items-center gap-2">
                    <FilterToggle
                        on={showDeleted}
                        onClick={handleToggleDeleted}
                        labelOn="Showing deleted"
                        labelOff="Hide deleted"
                    />
                    <FilterToggle
                        on={showAutogenerated}
                        onClick={handleToggleAutogenerated}
                        labelOn="Showing auto"
                        labelOff="Hide auto"
                    />

                    {/* Source filter removed — MSF rows now render identically
                        to Mythic rows, so a separate Mythic/MSF toggle felt
                        out of place. */}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => setShowImportDialog(true)}
                        className={cn(
                            "inline-flex min-h-[34px] items-center gap-2 rounded-sm border border-signal/20 px-3",
                            "text-[12px] font-bold uppercase tracking-[0.1em] text-signal transition-colors",
                            "hover:border-signal/45 hover:bg-signal/10",
                            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal",
                        )}
                    >
                        <Upload size={13} strokeWidth={2} aria-hidden="true" />
                        Import config
                    </button>

                    {/* The one primary on the page. Accent fill, and nothing
                        else on this surface is allowed to look like it. */}
                    <button
                        onClick={onSwitchToCreate}
                        className={cn(
                            "inline-flex min-h-[34px] items-center gap-2 rounded-sm border border-accent bg-accent px-3.5",
                            "text-[12px] font-bold uppercase tracking-[0.1em] text-void transition-colors",
                            "hover:bg-accent/85",
                            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:ring-offset-void focus-visible:ring-accent",
                        )}
                    >
                        <Plus size={13} strokeWidth={2} aria-hidden="true" />
                        New payload
                    </button>

                    <button
                        onClick={onSwitchToWrapper}
                        className={cn(
                            "inline-flex min-h-[34px] items-center gap-2 rounded-sm border border-accent bg-signal/[0.06] px-3",
                            "text-[12px] font-bold uppercase tracking-[0.1em] text-accent transition-colors",
                            "hover:bg-signal/10",
                            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent",
                        )}
                    >
                        <Package size={13} strokeWidth={2} aria-hidden="true" />
                        Wrapper
                    </button>
                </div>
            </div>

            {/* ── Inventory ────────────────────────────────────────────────
                Deliberately NOT boxed. A frame around the only thing on the
                page says "this is one of several things here", and it is not —
                it is the page. The rails above and below already bound it, the
                column header rule already separates it from the controls, and
                the border it used to carry only ate two rows of height and
                indented every filename by a further 16px.

                What the panel's strips used to say has moved to where it is
                still needed: how many rows survived the filters, and whether
                anything is building, are both on the rails. */}
            <div
                className="cyber-scrollbar mv-panel-enter relative mt-4 min-h-0 flex-1 overflow-auto"
                style={{ '--mv-panel-index': 2 } as React.CSSProperties}
            >
                {loading ? (
                    <PayloadsSkeleton />
                ) : (payloads.length === 0 && visibleMsf.length === 0) ? (
                    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-16">
                        <NoData>
                            {showDeleted || showAutogenerated
                                ? 'Nothing matches the current filters'
                                : 'No payload has been built in this operation yet'}
                        </NoData>
                        <button
                            onClick={onSwitchToCreate}
                            className={cn(
                                "inline-flex min-h-[34px] items-center gap-2 rounded-sm border border-accent bg-accent px-3.5",
                                "text-[12px] font-bold uppercase tracking-[0.1em] text-void transition-colors hover:bg-accent/85",
                                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:ring-offset-void focus-visible:ring-accent",
                            )}
                        >
                            <Plus size={13} strokeWidth={2} aria-hidden="true" />
                            Create the first payload
                        </button>
                    </div>
                ) : (
                    <table className="w-full border-collapse">
                        <thead>
                            <tr>
                                <Th className="w-[7.5rem]" srOnly="Row actions" />
                                <Th>Agent / Module</Th>
                                <Th>File</Th>
                                <Th>Progress</Th>
                                <Th>Description</Th>
                                <Th>C2 Status</Th>
                                <Th>Tags</Th>
                            </tr>
                        </thead>
                        <tbody>
                            <AnimatePresence>
                                {/* MSF rows first — locally generated payloads feel most "fresh". */}
                                {visibleMsf.map((rec) => (
                                    <MsfPayloadRow
                                        key={`msf-${rec.id}`}
                                        record={rec}
                                        onDeleted={handleMsfDeleted}
                                        onUpdated={handleMsfUpdated}
                                        isCombat={isCombat}
                                    />
                                ))}
                                {showMythicRows && payloads.map((payload) => (
                                    <PayloadRow
                                        key={payload.id}
                                        payload={payload}
                                        onDelete={(uuid) => deletePayload({ variables: { payload_uuid: uuid } })}
                                        onRestore={(uuid) => restorePayload({ variables: { payload_uuid: uuid } })}
                                        onToggleAlert={(uuid, alert) => toggleCallbackAlert({ variables: { payload_uuid: uuid, callback_alert: alert } })}
                                        onToggleAllowed={(uuid, allowed) => toggleCallbackAllowed({ variables: { payload_uuid: uuid, callback_allowed: allowed } })}
                                        onRebuild={(uuid) => rebuildPayload({ variables: { uuid } })}
                                        onRebuildFromConfig={handleRebuildFromConfig}
                                        onExportConfig={(uuid) => exportConfig({ variables: { uuid } })}
                                        showDeleted={showDeleted}
                                        isCombat={isCombat}
                                        onTagsUpdated={() => fetchNewPage({ variables: { offset: (pageData.currentPage - 1) * pageData.fetchLimit, limit: pageData.fetchLimit, showDeleted, showAutogenerated } })}
                                    />
                                ))}
                            </AnimatePresence>
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Bottom instrument rail ───────────────────────────────────
                Totals on the left, paging on the right. It is always present,
                so the foot of the page does not jump the moment a filter takes
                the row count over one page. */}
            <div className="-mx-6 mt-4 flex shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-signal/20 bg-void/90 px-6 py-2 backdrop-blur-sm lg:-mx-10 lg:px-10">
                <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
                    <span className="flex shrink-0 items-center gap-2">
                        <Box size={13} strokeWidth={2} className="text-signal" aria-hidden="true" />
                        <span className="text-signal opacity-60">Shown</span>
                        <span className="font-bold tabular-nums text-signal">{visibleCount}/{pageData.totalCount + visibleMsf.length}</span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-2 sm:flex">
                        <span className="text-signal opacity-60">Building</span>
                        <StatusWord tone={building > 0 ? 'warn' : 'signal'}>{building > 0 ? building : 'None'}</StatusWord>
                    </span>
                    <span className="hidden shrink-0 items-center gap-2 md:flex">
                        <span className="text-signal opacity-60">Failed</span>
                        <StatusWord tone={failed > 0 ? 'fail' : 'signal'}>{failed > 0 ? failed : 'None'}</StatusWord>
                    </span>
                    <span className="hidden shrink-0 items-center gap-2 lg:flex">
                        <span className="text-signal opacity-60">Msfvenom</span>
                        <span className="font-bold tabular-nums text-signal">{visibleMsf.length}</span>
                    </span>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
                    {/* Per-page selector */}
                    <div className="flex items-center gap-2">
                        <span className={cn("hidden text-signal opacity-70 sm:inline", LABEL)}>Per page</span>
                        <div role="radiogroup" aria-label="Rows per page" className="inline-flex overflow-hidden rounded-sm border border-signal/20">
                            {[20, 50, 100].map(n => (
                                <button
                                    key={n}
                                    role="radio"
                                    aria-checked={pageData.fetchLimit === n}
                                    onClick={() => {
                                        setPageData(prev => ({ ...prev, fetchLimit: n, currentPage: 1 }));
                                        setLoading(true);
                                        fetchNewPage({ variables: { offset: 0, limit: n, showDeleted, showAutogenerated } });
                                    }}
                                    className={cn(
                                        "inline-flex min-h-[30px] items-center px-2.5 text-[12px] font-bold tabular-nums transition-colors",
                                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal",
                                        pageData.fetchLimit === n ? "bg-signal text-void" : "text-signal hover:bg-signal/10",
                                    )}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Page nav */}
                    {totalPages > 1 && (
                        <nav aria-label="Payload pages" className="flex items-center gap-2">
                            <PageButton onClick={() => handleChangePage(1)} disabled={pageData.currentPage === 1} label="First" />
                            <PageButton onClick={() => handleChangePage(pageData.currentPage - 1)} disabled={pageData.currentPage === 1} label="Prev" />
                            <span className="px-1 text-[13px] text-signal" role="status" aria-atomic="true">
                                <span className="opacity-60">Page</span>{' '}
                                <span className="font-bold tabular-nums">{pageData.currentPage}</span>
                                <span className="opacity-60"> of </span>
                                <span className="font-bold tabular-nums">{totalPages}</span>
                            </span>
                            <PageButton onClick={() => handleChangePage(pageData.currentPage + 1)} disabled={pageData.currentPage === totalPages} label="Next" />
                            <PageButton onClick={() => handleChangePage(totalPages)} disabled={pageData.currentPage === totalPages} label="Last" />
                        </nav>
                    )}
                </div>
            </div>

            {/* Import Payload Config Dialog */}
            <ImportPayloadConfigDialog
                open={showImportDialog}
                onClose={() => setShowImportDialog(false)}
            />
        </div>
    );
};

/** Pagination control. Disabled stays legible — it is dimmed, not erased. */
const PageButton: React.FC<{ onClick: () => void; disabled: boolean; label: string }> = ({ onClick, disabled, label }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
            "inline-flex min-h-[30px] items-center rounded-sm border border-signal/20 px-2.5",
            "text-[12px] font-bold uppercase tracking-[0.1em] text-signal transition-colors",
            "hover:border-signal/45 hover:bg-signal/10",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-signal/20 disabled:hover:bg-transparent",
        )}
    >
        {label}
    </button>
);
// ============================================
// OS Info Helper
// ============================================
