import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useLazyQuery, useMutation } from '@apollo/client/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertTriangle, Check, Cpu, FileJson, Power, Radio, RefreshCw, Save,
    ScrollText, Server, Share2, Terminal, Waypoints, X,
} from 'lucide-react';

import {
    GET_PROFILE_CONFIG, GET_PROFILE_OUTPUT, SET_PROFILE_CONFIG, START_STOP_PROFILE_MUTATION,
} from '../lib/api';
import { cn, getErrorMessage } from '../lib/utils';
import { snackActions } from '../lib/snackbar';
import { DataRow, LABEL, StatusWord, type Tone } from './Instrument';
import type { C2ProfileRecord, WorkbenchTab } from '../types/c2profiles';

/**
 * Channel workbench — the one surface that edits a C2 profile.
 *
 * WHY IT IS STILL AN OVERLAY. The design language prefers an anchored inline
 * panel to a centred modal (§10.6), and the C2 Profiles page follows that for
 * everything an operator *reads*: the inspector lives beside the list. This
 * covers the two things you cannot do in a 380px column — edit a config file
 * and read a container's log — so it takes the screen, and while it does, it
 * is the same instrument as everything else: header strip, body, footer strip.
 *
 * WHAT WAS REMOVED, AND WHY. The previous version was the page's loudest
 * DESIGN_LANGUAGE violation: L-shaped corner ticks on the frame and 2px
 * borders (§10.2, §10.11), a 50px accent glow and a spring pop-in (§10.10),
 * `text-gray-400/500/600/700` throughout (§10.1, §10.12), `SYSTEM_ID: 0004`
 * badges (§10.2), and `TERMINATE_SERVICE` / `DECRYPTING_CONFIG` copy that
 * described a machine nobody was operating. All of it is gone. What replaces
 * it is quieter and says more: the two subsystem booleans as words, the real
 * file being edited, and JSON that is checked before it can be committed —
 * because the old Commit button would happily write a broken config into a
 * running container and report nothing.
 */

/**
 * The GraphQL shapes this component touches.
 *
 * They were all `useMutation<any>` / `useLazyQuery<any>`, which types the call
 * site for free and the *response* not at all: `containerDownloadFile.data`
 * type-checks however it is spelled, so a field rename upstream arrives as
 * `undefined` at runtime inside a `try` that swallows it.
 */
interface ContainerFile { status: string; error: string | null; filename: string | null; data: string | null }
interface ProfileConfigData { containerDownloadFile: ContainerFile | null }
interface ProfileConfigVars { container_name: string; filename: string }
interface ProfileOutputData { getProfileOutput: { status: string; error: string | null; output: string | null } | null }
interface ProfileOutputVars { id: number }
interface WriteFileData { containerWriteFile: { status: string; error: string | null; filename: string | null } | null }
interface WriteFileVars { container_name: string; file_path: string; data: string }
interface StartStopData { startStopProfile: { status: string; error: string | null; output: string | null } | null }
interface StartStopVars { id: number; action: 'start' | 'stop' }

/** Commit is a small state machine, so it is spelled as one. */
type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

/** `null` when the text is valid JSON (or empty), the parser's complaint
 *  otherwise. Shared by the live badge and the Commit guard so the two can
 *  never disagree about what "valid" means. */
function parseError(text: string): string | null {
    if (!text.trim()) return null;
    try {
        JSON.parse(text);
        return null;
    } catch (e) {
        return (e as Error).message;
    }
}

const TABS: { key: WorkbenchTab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <Server size={12} strokeWidth={2} aria-hidden="true" /> },
    { key: 'config', label: 'Config', icon: <FileJson size={12} strokeWidth={2} aria-hidden="true" /> },
    { key: 'console', label: 'Container log', icon: <ScrollText size={12} strokeWidth={2} aria-hidden="true" /> },
];

const CONFIG_FILE = 'config.json';

/**
 * Base64 ↔ text, UTF-8 clean.
 *
 * `atob` yields one char per byte, so a config carrying anything outside
 * Latin-1 — a hostname with an accent, a comment in Chinese — came back
 * mojibake and was saved back that way, corrupting the file on the first
 * commit. Round-tripping through TextDecoder/TextEncoder is what makes the
 * editor safe to press Commit in.
 */
function decodeUtf8Base64(b64: string): string {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

function encodeUtf8Base64(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    // Chunked: spreading a large array into String.fromCharCode overflows the
    // argument stack, and a config file can be tens of kilobytes.
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
}

interface C2DetailsModalProps {
    profile: C2ProfileRecord | null;
    onClose: () => void;
    isOpen: boolean;
    /** Which tab to land on. The page opens straight into Config or Log. */
    initialTab?: WorkbenchTab;
}

export function C2DetailsModal({ profile: incoming, onClose, isOpen, initialTab = 'overview' }: C2DetailsModalProps) {
    // The page drops the profile in the same commit that flips `isOpen`, and a
    // component that returns null cannot run an exit animation — the overlay
    // would vanish in one frame, which is §7's hard cut. So the last profile is
    // held until the exit finishes.
    //
    // Derived during render, not synced in an effect. As an effect it was a
    // render late: on the commit that opened the dialog this component still
    // had the previous (or null) profile, returned null, and the focus effect
    // below then ran against a `dialogRef` pointing at nothing — the panel
    // opened without focus. As state it would cost a second render on every
    // subscription push, which this component pays for in a live textarea.
    //
    // Writing the ref during render is safe *here* specifically because the
    // write is idempotent and derived only from props: a render React throws
    // away can only have stored the same latest profile it would store again.
    const lastProfile = useRef<C2ProfileRecord | null>(null);
    if (incoming) lastProfile.current = incoming;
    const profile = incoming ?? lastProfile.current;

    const [activeTab, setActiveTab] = useState<WorkbenchTab>(initialTab);
    const [configContent, setConfigContent] = useState('');
    const [configDirty, setConfigDirty] = useState(false);
    const [saveState, setSaveState] = useState<SaveState>('idle');
    const [saveError, setSaveError] = useState<string | null>(null);
    const [consoleOutput, setConsoleOutput] = useState('');
    /**
     * WHICH CONTAINER THE TEXT ON SCREEN CAME FROM.
     *
     * Not a nicety — without it this panel would happily write one channel's
     * config into another. `data` from the previous channel survives a failed
     * fetch, so opening B after B's container refuses the read left A's 613
     * bytes in the editor under B's name, with Commit live. Committing that
     * writes A's config to B *and* trips Mythic's RestartC2ServerAfterUpdate,
     * i.e. restarts a live egress channel on a foreign config.
     *
     * So the editor owns a provenance stamp, it is cleared the moment the
     * channel changes, and Commit is gated on it rather than on the header.
     */
    const [configOwner, setConfigOwner] = useState<string | null>(null);
    const [consoleOwner, setConsoleOwner] = useState<number | null>(null);
    /** Bumped by the reload button so an explicit reload re-runs the loader
     *  even when nothing else it depends on has changed. */
    const [reloadNonce, setReloadNonce] = useState(0);

    /**
     * Mirrors of the two guard values, read by the loader effect.
     *
     * They exist because taking `configOwner` as a dependency made the loader
     * feed itself: load → stamp the owner → dependency changed → clear and
     * load again, for ever, with the editor empty in between. The guard needs
     * the LATEST value, not a reactive one, and that is exactly what a ref is.
     */
    const configOwnerRef = useRef<string | null>(null);
    const configDirtyRef = useRef(false);

    const markConfigOwner = useCallback((owner: string | null) => {
        configOwnerRef.current = owner;
        setConfigOwner(owner);
    }, []);
    const markConfigDirty = useCallback((dirty: boolean) => {
        configDirtyRef.current = dirty;
        setConfigDirty(dirty);
    }, []);

    const toggleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dialogRef = useRef<HTMLElement>(null);
    const logRef = useRef<HTMLPreElement>(null);

    useEffect(() => () => {
        if (toggleTimerRef.current) clearTimeout(toggleTimerRef.current);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    }, []);

    const [startStopProfile, { loading: toggling }] = useMutation<StartStopData, StartStopVars>(START_STOP_PROFILE_MUTATION);
    const [fetchConfig, { loading: configLoading }] =
        useLazyQuery<ProfileConfigData, ProfileConfigVars>(GET_PROFILE_CONFIG, { fetchPolicy: 'network-only' });
    const [fetchOutput, { loading: outputLoading }] =
        useLazyQuery<ProfileOutputData, ProfileOutputVars>(GET_PROFILE_OUTPUT, { fetchPolicy: 'network-only' });
    const [saveConfig] = useMutation<WriteFileData, WriteFileVars>(SET_PROFILE_CONFIG);

    // The identity of `profile` now changes on every subscription push — the
    // page hands the workbench live data rather than an open-time snapshot. So
    // every effect below keys on the two primitives it actually depends on;
    // keying on the object would refetch the config file each time any field
    // of any channel changed, wiping whatever the operator had typed.
    const profileId = profile?.id ?? null;
    const profileName = profile?.name ?? null;

    // Everything on screen belongs to the channel being shown, so switching
    // channel empties it first. Content that outlives its channel is how one
    // container's config ends up committed into another.
    useEffect(() => {
        if (!isOpen) return;
        setActiveTab(initialTab);
        setSaveState('idle');
        setSaveError(null);
        markConfigDirty(false);
        setConfigContent('');
        markConfigOwner(null);
        setConsoleOutput('');
        setConsoleOwner(null);
    }, [isOpen, initialTab, profileId, markConfigDirty, markConfigOwner]);

    /**
     * Loading is done by AWAITING the query, not by watching its `data`.
     *
     * Watching `data` cannot tell you who a response belongs to: Apollo hands
     * back the previous channel's result unchanged when the new fetch fails,
     * and a deep-equal response does not even change identity. Awaiting binds
     * the container name lexically to the response that answered for it, which
     * is the only version of this that can stamp provenance honestly.
     *
     * `alive` covers unmount and, more importantly, a superseded request: tab
     * away and back quickly and the first response must not land on top of the
     * second.
     */
    useEffect(() => {
        if (!isOpen || profileId == null || profileName == null) return;
        let alive = true;

        if (activeTab === 'config') {
            // Never refetch over unsaved work for the same channel. The reload
            // button exists for when the operator wants that on purpose.
            if (configDirtyRef.current && configOwnerRef.current === profileName) return;
            setConfigContent('');
            markConfigOwner(null);
            setSaveError(null);
            fetchConfig({ variables: { container_name: profileName, filename: CONFIG_FILE } })
                .then(res => {
                    if (!alive) return;
                    if (res.error) { setSaveError(res.error.message); return; }
                    const file = res.data?.containerDownloadFile;
                    if (!file || file.status === 'error') {
                        setSaveError(file?.error || 'The container refused to hand over the file.');
                        return;
                    }
                    if (typeof file.data !== 'string') {
                        setSaveError('The container returned no file content.');
                        return;
                    }
                    try {
                        setConfigContent(decodeUtf8Base64(file.data));
                        markConfigOwner(profileName);
                        markConfigDirty(false);
                    } catch {
                        setSaveError('The file came back in an encoding this editor cannot read.');
                    }
                })
                .catch(err => { if (alive) setSaveError(getErrorMessage(err)); });
        } else if (activeTab === 'console') {
            setConsoleOutput('');
            setConsoleOwner(null);
            fetchOutput({ variables: { id: profileId } })
                .then(res => {
                    if (!alive) return;
                    if (res.error) { setConsoleOutput(`Could not read the container log — ${res.error.message}`); return; }
                    const out = res.data?.getProfileOutput;
                    setConsoleOutput(out?.output || out?.error || 'The container has written nothing yet.');
                    setConsoleOwner(profileId);
                })
                .catch(err => { if (alive) setConsoleOutput(`Could not read the container log — ${getErrorMessage(err)}`); });
        }

        return () => { alive = false; };
    }, [activeTab, isOpen, profileId, profileName, reloadNonce, markConfigOwner, markConfigDirty, fetchConfig, fetchOutput]);

    // A log you have to scroll to the bottom of is a log you read late.
    useEffect(() => {
        if (activeTab === 'console' && logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [consoleOutput, activeTab]);

    // Escape closes. A full-screen overlay with no keyboard exit is a trap.
    // On `window` rather than the dialog element: focus can legitimately be
    // outside the panel (the operator clicked the dimmed page), and Escape has
    // to work from there too.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    /**
     * Focus goes in, stays in, and comes back out where it started.
     *
     * `aria-modal="true"` is a promise to assistive tech that the rest of the
     * page is unavailable while this is open. Without a trap that promise is a
     * lie: measured, the ninth Tab left the panel and landed on the page
     * behind the overlay, and closing dumped focus on `<body>` instead of
     * returning it to the button that opened the panel.
     *
     * The app root cannot be marked `inert` here — this dialog is rendered
     * inside it, so inerting the root would inert the dialog too. Containing
     * Tab is the correct fix at this mount point.
     */
    useEffect(() => {
        if (!isOpen) return;
        const opener = document.activeElement as HTMLElement | null;
        // Captured once: by cleanup time `dialogRef.current` is already null,
        // so a cleanup that reads it can never tell whether focus was still
        // inside the panel it is closing.
        const panel = dialogRef.current;
        panel?.focus();

        const onTab = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            const root = panel;
            if (!root) return;
            const stops = Array.from(root.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
            )).filter(el => el.offsetParent !== null || el === document.activeElement);
            if (stops.length === 0) { e.preventDefault(); root.focus(); return; }
            const first = stops[0];
            const last = stops[stops.length - 1];
            const active = document.activeElement;
            if (!root.contains(active)) { e.preventDefault(); first.focus(); return; }
            if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
            else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        };
        window.addEventListener('keydown', onTab);
        return () => {
            window.removeEventListener('keydown', onTab);
            // Only reclaim focus if it is still inside the panel being closed;
            // if the operator has already clicked elsewhere, leave them there.
            const active = document.activeElement;
            if (opener?.isConnected && (!active || active === document.body || (!!panel && panel.contains(active)))) {
                opener.focus();
            }
        };
    }, [isOpen]);

    /**
     * Validated before it can be committed — a config that will not parse is a
     * container that will not start, found out at the worst possible moment.
     *
     * Parsed off a DEFERRED copy of the text: `JSON.parse` on every keystroke
     * turns a 40KB profile config into a full parse per character, on the
     * keystroke's own frame. Deferring keeps typing at input speed and still
     * settles on the real answer a frame later, which is all a validity badge
     * needs. The Commit handler re-checks synchronously, so a stale "valid"
     * can never be what authorises a write.
     */
    const deferredConfig = useDeferredValue(configContent);
    const jsonError = useMemo(() => parseError(deferredConfig), [deferredConfig]);

    /** Commit may only ever write text this editor loaded for THIS channel. */
    const configLoaded = configOwner != null && configOwner === profileName;
    const commitBlocked = saveState === 'saving' || configLoading || !!jsonError || !configLoaded;

    const handleSaveConfig = useCallback(async () => {
        if (!profile) return;
        // Provenance, then validity. Both re-checked synchronously here rather
        // than trusted from the deferred badge, and both explain themselves —
        // a disabled-looking button that silently does nothing when clicked is
        // worse than no button.
        if (configOwner !== profile.name) {
            setSaveState('failed');
            setSaveError(`This editor has not loaded ${profile.name}'s ${CONFIG_FILE}, so there is nothing safe to write.`);
            return;
        }
        const invalid = parseError(configContent);
        if (invalid) {
            setSaveState('failed');
            setSaveError(`Fix the JSON before committing — ${invalid}`);
            return;
        }
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        setSaveState('saving');
        setSaveError(null);
        try {
            const res = await saveConfig({
                variables: {
                    container_name: profile.name,
                    file_path: CONFIG_FILE,
                    data: encodeUtf8Base64(configContent),
                },
            });
            const write = res.data?.containerWriteFile;
            if (!write || write.status === 'error') {
                setSaveState('failed');
                setSaveError(write?.error || 'The container rejected the write.');
                return;
            }
            setSaveState('saved');
            markConfigDirty(false);
            savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2400);
        } catch (e) {
            setSaveState('failed');
            setSaveError((e as Error).message || 'The write never reached the container.');
        }
    }, [profile, configContent, configOwner, saveConfig, markConfigDirty]);

    const handleToggle = useCallback(async () => {
        if (!profile) return;
        try {
            const res = await startStopProfile({
                variables: { id: profile.id, action: profile.running ? 'stop' : 'start' },
            });
            // Mythic reports a refused start as `status: "error"` inside a
            // 200 OK, with the reason in `output` — not as a GraphQL error. Not
            // reading it is why a failed start looked exactly like a successful
            // one: spinner clears, row unchanged, operator clicks again.
            const out = res.data?.startStopProfile;
            if (out?.status === 'error') {
                snackActions.error(out.output || out.error || `Could not ${profile.running ? 'stop' : 'start'} ${profile.name}`);
            }
            // The interesting output arrives a beat after the container moves.
            toggleTimerRef.current = setTimeout(() => {
                fetchOutput({ variables: { id: profile.id } })
                    .then(r => {
                        const o = r.data?.getProfileOutput;
                        setConsoleOutput(o?.output || o?.error || 'The container has written nothing yet.');
                        setConsoleOwner(profile.id);
                    })
                    .catch(() => { /* the log tab's own reload reports this */ });
            }, 1000);
        } catch (e) {
            snackActions.error(`Failed to ${profile.running ? 'stop' : 'start'} ${profile.name} — ${getErrorMessage(e)}`);
        }
    }, [profile, startStopProfile, fetchOutput]);

    if (!profile) return null;

    const online = profile.running && profile.container_running;
    const stateTone: Tone = profile.deleted ? 'idle' : online ? 'live' : (profile.running || profile.container_running) ? 'warn' : 'signal';
    const stateWord = profile.deleted ? 'Archived'
        : online ? 'Online'
            : profile.running || profile.container_running ? 'Degraded' : 'Stopped';

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="c2-workbench"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.16 } }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    onClick={onClose}
                    // NOTE ON COST: this overlay is a full-screen
                    // `backdrop-filter`, and fading one is by far the most
                    // expensive thing this component does — on a GPU-less
                    // renderer dismissal measured ~1.9s with the blur against
                    // ~0.5s with the blur removed. A `will-change: opacity`
                    // hint was tried here and did NOT reproduce any benefit
                    // across repeated A/B runs, so it is deliberately absent
                    // rather than left in as a permanent layer promotion.
                    className="fixed inset-0 z-40 flex items-center justify-center bg-void/85 p-4 backdrop-blur-sm sm:p-6"
                >
                    <motion.section
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label={`${profile.name} channel workbench`}
                        tabIndex={-1}
                        // Panels settle: quick in, long tail. No spring — a
                        // spring is a physical metaphor and nothing here is
                        // a physical object being released.
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
                        transition={{ duration: 0.3, ease: [0.22, 0.68, 0, 1] }}
                        onClick={e => e.stopPropagation()}
                        className="flex h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-signal/25 bg-void font-mono text-signal focus:outline-none"
                    >
                        {/* ── Header strip: what this is, and how it is doing ── */}
                        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-signal/15 px-5 py-3">
                            <div className="flex min-w-0 items-center gap-2.5">
                                <Radio size={14} strokeWidth={2} className={cn('shrink-0', stateTone === 'live' ? 'text-accent' : 'text-signal')} aria-hidden="true" />
                                <span className={cn('shrink-0 text-signal opacity-70', LABEL)}>Channel</span>
                                <h2 className="min-w-0 truncate text-[16px] font-bold text-signal" title={profile.name}>
                                    {profile.name}
                                </h2>
                                {profile.semver && (
                                    <span className="hidden shrink-0 text-[11px] tabular-nums text-signal opacity-60 sm:inline">
                                        v{profile.semver}
                                    </span>
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-4">
                                <StatusWord tone={stateTone} dot className="hidden sm:inline-flex">{stateWord}</StatusWord>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    aria-label="Close workbench"
                                    className="flex h-8 w-8 items-center justify-center rounded-sm border border-signal/20 text-signal transition-colors hover:border-signal/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal"
                                >
                                    <X size={14} strokeWidth={2} aria-hidden="true" />
                                </button>
                            </div>
                        </header>

                        {/* ── Tab strip ─────────────────────────────────────── */}
                        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-signal/15 px-5 py-2.5">
                            <div role="tablist" aria-label="Workbench section" className="inline-flex overflow-hidden rounded-sm border border-signal/20">
                                {TABS.map(t => (
                                    <button
                                        key={t.key}
                                        role="tab"
                                        aria-selected={activeTab === t.key}
                                        onClick={() => setActiveTab(t.key)}
                                        className={cn(
                                            'inline-flex min-h-[32px] items-center gap-2 px-3.5 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors',
                                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal',
                                            activeTab === t.key ? 'bg-signal text-void' : 'text-signal hover:bg-signal/10',
                                        )}
                                    >
                                        {t.icon}
                                        <span className="hidden sm:inline">{t.label}</span>
                                    </button>
                                ))}
                            </div>

                            {activeTab === 'config' && (
                                <div className="flex items-center gap-3">
                                    {configDirty && saveState === 'idle' && (
                                        <StatusWord tone="warn">Unsaved</StatusWord>
                                    )}
                                    {saveState === 'saved' && (
                                        <StatusWord tone="live"><Check size={11} strokeWidth={2} aria-hidden="true" />Written</StatusWord>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => { markConfigDirty(false); setReloadNonce(n => n + 1); }}
                                        aria-label="Reload config from the container"
                                        title="Reload from the container, discarding unsaved changes"
                                        className="flex h-8 w-8 items-center justify-center rounded-sm border border-signal/20 text-signal transition-colors hover:border-signal/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal"
                                    >
                                        <RefreshCw size={13} strokeWidth={2} aria-hidden="true" className={cn(configLoading && 'animate-spin')} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveConfig}
                                        disabled={commitBlocked}
                                        title={
                                            !configLoaded ? `Load ${profile.name}'s ${CONFIG_FILE} before writing to it`
                                                : jsonError ? 'Fix the JSON before committing'
                                                    : `Write ${CONFIG_FILE} back to the ${profile.name} container`
                                        }
                                        className={cn(
                                            'inline-flex min-h-[32px] items-center gap-2 rounded-sm border px-3.5 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors',
                                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                                            commitBlocked
                                                ? 'cursor-not-allowed border-signal/20 text-signal opacity-50'
                                                : 'border-accent bg-accent text-void hover:bg-accent/90',
                                        )}
                                    >
                                        {saveState === 'saving'
                                            ? <RefreshCw size={12} strokeWidth={2} className="animate-spin" aria-hidden="true" />
                                            : <Save size={12} strokeWidth={2} aria-hidden="true" />}
                                        Commit
                                    </button>
                                </div>
                            )}

                            {activeTab === 'console' && (
                                <button
                                    type="button"
                                    onClick={() => fetchOutput({ variables: { id: profile.id } })}
                                    aria-label="Reload container output"
                                    title="Reload container output"
                                    className="flex h-8 w-8 items-center justify-center rounded-sm border border-signal/20 text-signal transition-colors hover:border-signal/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal"
                                >
                                    <RefreshCw size={13} strokeWidth={2} aria-hidden="true" className={cn(outputLoading && 'animate-spin')} />
                                </button>
                            )}
                        </div>

                        {/* ── Body ──────────────────────────────────────────── */}
                        <div className="cyber-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
                            {activeTab === 'overview' && (
                                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                                    <div className="space-y-5 lg:col-span-2">
                                        <section>
                                            <span className={cn('text-signal opacity-70', LABEL)}>Description</span>
                                            <p className="mt-2 text-[13px] leading-relaxed text-signal">
                                                {profile.description || 'This profile ships no description.'}
                                            </p>
                                        </section>

                                        <section>
                                            <span className={cn('text-signal opacity-70', LABEL)}>Subsystems</span>
                                            <div className="mt-1.5">
                                                <DataRow
                                                    label={<span className="flex items-center gap-2"><Cpu size={13} strokeWidth={2} aria-hidden="true" />Container</span>}
                                                    state={profile.container_running ? 'Up' : 'Down'}
                                                    tone={profile.container_running ? 'live' : 'signal'}
                                                />
                                                <DataRow
                                                    label={<span className="flex items-center gap-2"><Radio size={13} strokeWidth={2} aria-hidden="true" />C2 server</span>}
                                                    state={profile.running ? 'Listening' : 'Stopped'}
                                                    tone={profile.running ? 'live' : 'signal'}
                                                />
                                                <DataRow
                                                    label={<span className="flex items-center gap-2">
                                                        {profile.is_p2p
                                                            ? <Share2 size={13} strokeWidth={2} aria-hidden="true" />
                                                            : <Waypoints size={13} strokeWidth={2} aria-hidden="true" />}
                                                        Routing
                                                    </span>}
                                                    state={profile.is_p2p ? 'Peer to peer' : 'Egress'}
                                                    tone={profile.is_p2p ? 'range' : 'signal'}
                                                />
                                                <DataRow
                                                    label={<span className="flex items-center gap-2"><Server size={13} strokeWidth={2} aria-hidden="true" />Server routed</span>}
                                                    state={profile.is_server_routed ? 'Yes' : 'No'}
                                                    tone="signal"
                                                />
                                            </div>
                                        </section>

                                        <section>
                                            <span className={cn('text-signal opacity-70', LABEL)}>Supported agents</span>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {(profile.payloadtypec2profiles ?? []).length === 0 && (
                                                    <span className="text-[13px] text-signal opacity-55">
                                                        No agent declares support for this profile
                                                    </span>
                                                )}
                                                {(profile.payloadtypec2profiles ?? []).map(pt => (
                                                    <span
                                                        key={pt.payloadtype.name}
                                                        className="rounded-sm border border-signal/25 bg-signal/[0.04] px-2 py-0.5 text-[11px] text-signal"
                                                    >
                                                        {pt.payloadtype.name}
                                                    </span>
                                                ))}
                                            </div>
                                        </section>
                                    </div>

                                    <div className="space-y-1">
                                        <span className={cn('text-signal opacity-70', LABEL)}>Record</span>
                                        <DataRow label="Author" state={profile.author || '—'} />
                                        <DataRow label="Version" state={`v${profile.semver || '—'}`} />
                                        <DataRow label="Profile id" state={profile.id} />
                                        <DataRow
                                            label="Registered"
                                            state={profile.creation_time ? String(profile.creation_time).slice(0, 10) : '—'}
                                        />
                                        <DataRow label="Archived" state={profile.deleted ? 'Yes' : 'No'} tone={profile.deleted ? 'idle' : 'signal'} />
                                    </div>
                                </div>
                            )}

                            {activeTab === 'config' && (
                                <div className="flex min-h-0 flex-1 flex-col">
                                    {saveError && (
                                        <div role="alert" className="mb-3 flex items-start gap-2 rounded-sm border border-red-400/40 bg-red-400/[0.06] px-3 py-2">
                                            <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-red-400" aria-hidden="true" />
                                            <span className="text-[13px] text-red-400">{saveError}</span>
                                        </div>
                                    )}
                                    {jsonError && (
                                        <div role="status" className="mb-3 flex items-start gap-2 rounded-sm border border-amber-400/40 bg-amber-400/[0.06] px-3 py-2">
                                            <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
                                            <span className="text-[13px] text-amber-400">Invalid JSON — {jsonError}</span>
                                        </div>
                                    )}
                                    <div className="relative min-h-0 flex-1 overflow-hidden rounded-sm border border-signal/20 bg-black/40">
                                        {configLoading && (
                                            <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-void/70 text-[13px] text-signal">
                                                <RefreshCw size={14} strokeWidth={2} className="animate-spin" aria-hidden="true" />
                                                Reading {CONFIG_FILE} from the container…
                                            </div>
                                        )}
                                        <textarea
                                            value={configContent}
                                            onChange={e => { setConfigContent(e.target.value); markConfigDirty(true); setSaveState('idle'); }}
                                            spellCheck={false}
                                            aria-label={`${profile.name} ${CONFIG_FILE}`}
                                            aria-invalid={!!jsonError}
                                            className="cyber-scrollbar h-full w-full resize-none bg-transparent p-4 text-[13px] leading-relaxed text-signal focus:outline-none"
                                        />
                                    </div>
                                </div>
                            )}

                            {activeTab === 'console' && (
                                <div className="flex min-h-0 flex-1 flex-col">
                                    <pre
                                        ref={logRef}
                                        className="cyber-scrollbar min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-sm border border-signal/20 bg-black/40 p-4 text-[13px] leading-relaxed text-signal"
                                    >
                                        {consoleOwner !== profile.id
                                            ? (outputLoading ? 'Reading container output…' : 'No output loaded for this channel.')
                                            : consoleOutput || 'The container has written nothing yet.'}
                                    </pre>
                                </div>
                            )}
                        </div>

                        {/* ── Footer strip: provenance left, the one action right ── */}
                        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-signal/15 px-5 py-2.5">
                            <span className="min-w-0 truncate text-[11px] text-signal opacity-70">
                                {activeTab === 'config'
                                    ? <><FileJson size={11} strokeWidth={2} className="mr-1.5 inline" aria-hidden="true" />{CONFIG_FILE} · {profile.name} container</>
                                    : activeTab === 'console'
                                        ? <><Terminal size={11} strokeWidth={2} className="mr-1.5 inline" aria-hidden="true" />stdout · {profile.name} container</>
                                        : <>Escape closes · changes here affect every agent using this channel</>}
                            </span>
                            <button
                                type="button"
                                onClick={handleToggle}
                                disabled={toggling || profile.deleted}
                                title={profile.deleted ? 'Restore this channel before starting it' : undefined}
                                className={cn(
                                    'inline-flex min-h-[32px] shrink-0 items-center gap-2 rounded-sm border px-4 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors',
                                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                                    toggling || profile.deleted
                                        ? 'cursor-not-allowed border-signal/20 text-signal opacity-50'
                                        : profile.running
                                            ? 'border-red-400/50 text-red-400 hover:border-red-400 hover:bg-red-400/10'
                                            : 'border-accent bg-accent text-void hover:bg-accent/90',
                                )}
                            >
                                {toggling
                                    ? <><RefreshCw size={12} strokeWidth={2} className="animate-spin" aria-hidden="true" />Working</>
                                    : <><Power size={12} strokeWidth={2} aria-hidden="true" />{profile.running ? 'Stop channel' : 'Start channel'}</>}
                            </button>
                        </footer>
                    </motion.section>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
