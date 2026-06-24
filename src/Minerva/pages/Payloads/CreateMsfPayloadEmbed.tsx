/* =============================================================================
 *  CreateMsfPayloadEmbed — Metasploit payload generation wizard
 *
 *  Rendered inside CreatePayloadEmbed when the operator picks METASPLOIT as the
 *  agent type for a given OS. The wizard has three steps:
 *
 *    Step 1  MODULE  — pick a payload module (filtered to `payload/<os>/*`)
 *    Step 2  OPTIONS — fill module options (LHOST/LPORT/...) + Format + Encoder
 *    Step 3  BUILD   — generate, persist (localStorage + agentstorage), download
 *
 *  Visual language matches the existing Mythic CreatePayloadEmbed so the two
 *  flows feel like one page. Generated payloads are written to BOTH localStorage
 *  (instant) and Mythic agentstorage (cross-operator share).
 * ===========================================================================*/
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useMutation } from '@apollo/client/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Loader2, Box, ChevronLeft, ChevronRight, Check, X,
    Cpu, Settings, Package, AlertTriangle, Download, Rocket, RefreshCw,
    Terminal as TerminalIcon, Zap, Layers, Server,
    Coffee, Code2, FileCode, Smartphone,
    Network, ArrowLeftRight, ArrowDownToLine, Play, Radar,
} from 'lucide-react';
import {
    WinIcon, TuxIcon, AppleIcon, AndroidIcon, ChromeIcon, RobotIcon,
} from '../Callbacks/utils';
import { cn, getErrorMessage } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import {
    listModules, getModuleOptions, generatePayload,
    type MsfModuleOption,
} from '../Metasploit/msfrpc';
import {
    type MsfPayloadRecord, newMsfPayloadId, bytesToB64,
    saveLocalPayload, osFromModule, suggestFilename, encodeRecordForAgentStorage,
    classifyMsfModule, type MsfModuleFacets, type MsfPayloadKind,
    type MsfConnType, type MsfProtocol,
} from '../../lib/msfPayloads';
import { UPSERT_MSF_PAYLOAD, msfPayloadUniqueIdFor } from '../../lib/api/msfPayloads';
import { meState } from '../../lib/state';
import { useReactiveVar } from '@apollo/client/react';

/* ── OS → MSF path prefix(es) ──────────────────────────────────────────────
 * Mythic's `supported_os` strings are 'Windows', 'Linux', 'macOS', etc. — map
 * them to the lowercased path segments MSF actually uses for filtering.       */
const OS_TO_MSF_PREFIXES: Record<string, string[]> = {
    Windows: ['windows/', 'cmd/windows/'],
    Linux:   ['linux/', 'cmd/linux/', 'cmd/unix/'],
    macOS:   ['osx/', 'apple_ios/'],
    OSX:     ['osx/'],
    Mac:     ['osx/'],
    Android: ['android/'],
    iOS:     ['apple_ios/'],
    Chrome:  ['multi/'],
};

/** Multi-platform payloads (java/python/php/...) always shown so operators can
 *  pick a cross-platform implant even when targeting a specific OS. */
const MULTI_PLATFORM_PREFIXES = ['multi/', 'java/', 'python/', 'php/', 'ruby/', 'nodejs/'];

function prefixesForOS(os: string): string[] {
    const direct = OS_TO_MSF_PREFIXES[os] ?? [];
    return [...direct, ...MULTI_PLATFORM_PREFIXES];
}

/* ── PLATFORM tile metadata ───────────────────────────────────────────────
 * Each MSF platform segment gets a label, an icon, and a one-line description.
 * Unknown platforms fall back to a generic Server icon — chips still appear so
 * the operator can discover BSDs / Solaris / AIX / etc. without us hardcoding
 * every flavour. */
type IconRender = (props: { size: number; className?: string }) => React.ReactElement;

interface PlatformMeta {
    label: string;
    icon: IconRender;
    desc: string;
}

const PLATFORM_META: Record<string, PlatformMeta> = {
    windows:    { label: 'Windows',  icon: WinIcon,                                              desc: 'Win32/Win64 host' },
    linux:      { label: 'Linux',    icon: TuxIcon,                                              desc: 'Linux kernel host' },
    osx:        { label: 'macOS',    icon: AppleIcon,                                            desc: 'macOS / Darwin' },
    apple_ios:  { label: 'iOS',      icon: AppleIcon,                                            desc: 'Apple iOS device' },
    android:    { label: 'Android',  icon: AndroidIcon,                                          desc: 'Android device' },
    multi:      { label: 'Multi',    icon: ({ size, className }) => <Layers size={size} className={className} />,    desc: 'Cross-platform stager' },
    java:       { label: 'Java',     icon: ({ size, className }) => <Coffee size={size} className={className} />,    desc: 'JVM bytecode payload' },
    python:     { label: 'Python',   icon: ({ size, className }) => <FileCode size={size} className={className} />,  desc: 'Python interpreter' },
    php:        { label: 'PHP',      icon: ({ size, className }) => <Code2 size={size} className={className} />,     desc: 'PHP web shell' },
    ruby:       { label: 'Ruby',     icon: ({ size, className }) => <Code2 size={size} className={className} />,     desc: 'Ruby interpreter' },
    nodejs:     { label: 'Node.js',  icon: ({ size, className }) => <Code2 size={size} className={className} />,     desc: 'Node.js JS payload' },
    cmd:        { label: 'CMD',      icon: ({ size, className }) => <TerminalIcon size={size} className={className} />, desc: 'Native shell command' },
    bsd:        { label: 'BSD',      icon: ({ size, className }) => <Server size={size} className={className} />,    desc: 'BSD-family host' },
    freebsd:    { label: 'FreeBSD',  icon: ({ size, className }) => <Server size={size} className={className} />,    desc: 'FreeBSD host' },
    openbsd:    { label: 'OpenBSD',  icon: ({ size, className }) => <Server size={size} className={className} />,    desc: 'OpenBSD host' },
    netbsd:     { label: 'NetBSD',   icon: ({ size, className }) => <Server size={size} className={className} />,    desc: 'NetBSD host' },
    solaris:    { label: 'Solaris',  icon: ({ size, className }) => <Server size={size} className={className} />,    desc: 'Solaris / SunOS' },
    aix:        { label: 'AIX',      icon: ({ size, className }) => <Server size={size} className={className} />,    desc: 'IBM AIX UNIX' },
    hpux:       { label: 'HP-UX',    icon: ({ size, className }) => <Server size={size} className={className} />,    desc: 'HP-UX host' },
    unix:       { label: 'UNIX',     icon: ({ size, className }) => <Server size={size} className={className} />,    desc: 'Generic UNIX' },
    chrome:     { label: 'Chrome',   icon: ChromeIcon,                                           desc: 'Chrome OS / extension' },
    firefox:    { label: 'Firefox',  icon: ({ size, className }) => <Code2 size={size} className={className} />,     desc: 'Firefox browser' },
    mainframe:  { label: 'Mainframe', icon: ({ size, className }) => <Server size={size} className={className} />,   desc: 'z/OS / mainframe' },
    bsdi:       { label: 'BSDi',     icon: ({ size, className }) => <Server size={size} className={className} />,    desc: 'BSD/OS' },
    irix:       { label: 'IRIX',     icon: ({ size, className }) => <Server size={size} className={className} />,    desc: 'SGI IRIX' },
    mobile:     { label: 'Mobile',   icon: ({ size, className }) => <Smartphone size={size} className={className} />, desc: 'Generic mobile' },
};

function getPlatformMeta(p: string): PlatformMeta {
    return PLATFORM_META[p] ?? {
        label: p.toUpperCase(),
        icon: ({ size, className }) => <RobotIcon size={size} className={className} />,
        desc: `${p} target`,
    };
}

/* ── Format / Encoder catalogues ───────────────────────────────────────────
 *  MSF RPC almost always sends the supported values for these as `enums` on
 *  the module option, but a few legacy modules omit them. These fallback
 *  lists track msfvenom -l (formats|encoders) so the picker is never empty
 *  even when the RPC underprovides metadata. Grouped + ordered the way
 *  operators usually scan them. */

const FORMAT_GROUPS: ReadonlyArray<{ label: string; items: ReadonlyArray<{ key: string; hint?: string }> }> = [
    { label: 'EXECUTABLE', items: [
        { key: 'exe',          hint: 'Windows PE' },
        { key: 'exe-only',     hint: 'shellcode-only PE' },
        { key: 'exe-service',  hint: 'service binary' },
        { key: 'exe-small',    hint: 'compact PE' },
        { key: 'dll' },
        { key: 'msi' }, { key: 'msi-nouac' },
        { key: 'elf' }, { key: 'elf-so' },
        { key: 'macho' },
        { key: 'apk' }, { key: 'jar' }, { key: 'war' },
    ] },
    { label: 'SCRIPT', items: [
        { key: 'psh',          hint: 'PowerShell' },
        { key: 'psh-cmd' }, { key: 'psh-net' }, { key: 'psh-reflection' },
        { key: 'vba' }, { key: 'vba-exe' }, { key: 'vba-psh' },
        { key: 'vbs' }, { key: 'loop-vbs' },
        { key: 'hta' }, { key: 'hta-psh' },
        { key: 'asp' }, { key: 'aspx' }, { key: 'aspx-exe' },
    ] },
    { label: 'SOURCE', items: [
        { key: 'c' }, { key: 'csharp' }, { key: 'java' },
        { key: 'python', hint: 'Python source' },
        { key: 'perl' }, { key: 'ruby' }, { key: 'powershell' },
        { key: 'bash' },
        { key: 'js_be' }, { key: 'js_le' },
    ] },
    { label: 'RAW', items: [
        { key: 'raw',  hint: 'pure shellcode' },
        { key: 'num' }, { key: 'dw' }, { key: 'dword' }, { key: 'hex' },
    ] },
];
const ALL_FORMATS = FORMAT_GROUPS.flatMap(g => g.items.map(it => it.key));

/* Encoders — curated subset of `msfvenom -l encoders` weighted toward what
 * operators actually use. shikata_ga_nai is the canonical x86 polymorphic
 * encoder; zutto_dekiru is its x64 counterpart. */
const ENCODER_GROUPS: ReadonlyArray<{ label: string; items: ReadonlyArray<{ key: string; hint?: string }> }> = [
    { label: 'POPULAR', items: [
        { key: 'x86/shikata_ga_nai', hint: 'polymorphic XOR (x86)' },
        { key: 'x64/zutto_dekiru',   hint: 'polymorphic XOR (x64)' },
        { key: 'generic/none',       hint: 'no encoding' },
    ] },
    { label: 'X86', items: [
        { key: 'x86/alpha_mixed' }, { key: 'x86/alpha_upper' },
        { key: 'x86/call4_dword_xor' }, { key: 'x86/countdown' },
        { key: 'x86/fnstenv_mov' }, { key: 'x86/jmp_call_additive' },
        { key: 'x86/nonalpha' }, { key: 'x86/nonupper' },
        { key: 'x86/single_static_bit' },
        { key: 'x86/unicode_mixed' }, { key: 'x86/unicode_upper' },
        { key: 'x86/xor_dynamic' },
    ] },
    { label: 'X64', items: [
        { key: 'x64/xor' }, { key: 'x64/xor_dynamic' }, { key: 'x64/xor_context' },
    ] },
    { label: 'CMD', items: [
        { key: 'cmd/echo' }, { key: 'cmd/generic_sh' },
        { key: 'cmd/powershell_base64' },
        { key: 'cmd/perl' }, { key: 'cmd/printf_php_mq' },
    ] },
    { label: 'OTHER', items: [
        { key: 'php/base64' }, { key: 'ruby/base64' },
        { key: 'ppc/longxor' }, { key: 'ppc/longxor_tag' },
        { key: 'sparc/longxor_tag' },
        { key: 'mipsbe/byte_xori' }, { key: 'mipsle/byte_xori' },
    ] },
];
const ALL_ENCODERS = ENCODER_GROUPS.flatMap(g => g.items.map(it => it.key));

/** Bucket a flat list of keys (e.g. the module's `enums`) back into the
 *  curated groups so the operator-facing ordering survives even when the
 *  module's enum list is different from the canonical one. Anything that
 *  doesn't match a curated group falls into a final OTHER bucket so it's
 *  still selectable. */
function groupKeys(
    groups: ReadonlyArray<{ label: string; items: ReadonlyArray<{ key: string; hint?: string }> }>,
    available: string[],
): Array<{ label: string; items: Array<{ key: string; hint?: string }> }> {
    const avail = new Set(available);
    const consumed = new Set<string>();
    const out: Array<{ label: string; items: Array<{ key: string; hint?: string }> }> = [];
    for (const g of groups) {
        const items = g.items.filter(it => avail.has(it.key));
        if (items.length) {
            out.push({ label: g.label, items: items as any });
            items.forEach(it => consumed.add(it.key));
        }
    }
    const leftover = available.filter(k => !consumed.has(k));
    if (leftover.length) {
        out.push({ label: 'OTHER', items: leftover.map(k => ({ key: k })) });
    }
    return out;
}

/* ── OptionField — same shape as Metasploit/LaunchAttack OptionField, kept
 *     local so we don't create a cross-package import dependency. ─────────── */
function OptionField({ name, opt, value, onChange }: {
    name: string; opt: MsfModuleOption; value: string; onChange: (v: string) => void;
}) {
    const isBool = opt.type === 'bool' || opt.type === 'boolean';
    const hasEnums = opt.enums && opt.enums.length > 0;
    return (
        <div>
            <div className="flex items-center gap-2 mb-1">
                <label className="text-sm font-mono text-signal font-bold">{name}</label>
                {opt.required && <span className="text-[10px] font-mono text-red-400 bg-red-500/10 px-1.5 py-px rounded">REQ</span>}
                <span className="text-[10px] font-mono text-signal/70 uppercase">{opt.type}</span>
            </div>
            {opt.desc && <p className="text-xs text-signal/80 mb-1.5 leading-relaxed">{opt.desc}</p>}
            {isBool ? (
                <button
                    onClick={() => onChange(value === 'true' ? 'false' : 'true')}
                    className={cn('px-3 py-1.5 text-xs font-mono border transition-colors',
                        value === 'true' ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-ghost/30 text-signal hover:border-white/30')}
                >
                    {value === 'true' ? 'TRUE' : 'FALSE'}
                </button>
            ) : hasEnums ? (
                <select
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="w-full bg-black/60 border border-ghost/30 text-signal font-mono text-sm px-3 py-2 focus:border-signal/60 focus:outline-none transition-colors"
                >
                    <option value="">-- select --</option>
                    {opt.enums!.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
            ) : (
                <input
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={opt.default != null ? `Default: ${opt.default}` : ''}
                    className="w-full bg-black/60 border border-ghost/30 text-signal font-mono text-sm px-3 py-2 focus:border-signal/60 focus:outline-none transition-colors"
                />
            )}
        </div>
    );
}

/* ── Main wizard ──────────────────────────────────────────────────────────── */
export const CreateMsfPayloadEmbed: React.FC<{
    os: string;
    onBack: () => void;
    onComplete: () => void;
}> = ({ os, onBack, onComplete }) => {
    const me = useReactiveVar(meState);
    const username = me?.user?.username ?? undefined;
    const opId = me?.user?.current_operation_id ?? 0;

    /* ── data fetching: payload module list + selected module's options ──── */
    const [modules, setModules] = useState<string[]>([]);
    const [loadingModules, setLoadingModules] = useState(false);
    const [moduleError, setModuleError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoadingModules(true);
        setModuleError(null);
        listModules('payloads')
            .then(list => { if (!cancelled) setModules(list); })
            .catch(e => { if (!cancelled) setModuleError(getErrorMessage(e)); })
            .finally(() => { if (!cancelled) setLoadingModules(false); });
        return () => { cancelled = true; };
    }, []);

    const defaultPlatforms = useMemo(() => {
        // Strip trailing slashes — we'll match on platform path segment exactly.
        return new Set(prefixesForOS(os).map(p => p.replace(/\/$/, '')));
    }, [os]);

    const [filter, setFilter] = useState('');

    /* ── Facets — all multi-select except `stagingFilter` (radio) ─────────
     * `platformFilter` defaults to the OS-derived prefixes; the user can
     * override to widen scope (e.g. target Solaris / OpenBSD which Mythic
     * doesn't list) or narrow further. Empty Set = "no filter". */
    const [platformFilter, setPlatformFilter] = useState<Set<string>>(defaultPlatforms);
    const [archFilter, setArchFilter] = useState<Set<string>>(new Set());
    const [kindFilter, setKindFilter] = useState<Set<MsfPayloadKind>>(new Set());
    const [stageFilter, setStageFilter] = useState<Set<string>>(new Set());
    const [connFilter, setConnFilter] = useState<Set<string>>(new Set());
    const [stagingFilter, setStagingFilter] = useState<'all' | 'staged' | 'non-staged'>('all');
    // TRANSPORT step facets — derived from `connType` + `protocol` of each module.
    const [connTypeFilter, setConnTypeFilter] = useState<Set<MsfConnType>>(new Set());
    const [protocolFilter, setProtocolFilter] = useState<Set<MsfProtocol>>(new Set());

    // Reset to the OS-derived default whenever the parent's OS prop changes.
    useEffect(() => { setPlatformFilter(defaultPlatforms); }, [defaultPlatforms]);

    // Pre-classify every module once — facet counts are computed against the
    // *full* dataset so chip totals reflect what's available beyond the
    // current platform scope, which lets the operator discover modules they
    // wouldn't have found via the Mythic OS list.
    const allClassified = useMemo(
        () => modules.map(m => ({ module: m, facets: classifyMsfModule(m) })),
        [modules],
    );

    // Build platform list dynamically from the dataset (sorted by count desc
    // so the most common platforms surface first).
    const platformChips = useMemo(() => {
        const tally = new Map<string, number>();
        for (const { facets } of allClassified) {
            tally.set(facets.platform, (tally.get(facets.platform) ?? 0) + 1);
        }
        return Array.from(tally.entries())
            .sort(([, a], [, b]) => b - a)
            .map(([k, v]) => [k, v] as const);
    }, [allClassified]);

    // Apply ALL active filters
    const filteredEntries = useMemo(() => {
        const lc = filter.toLowerCase();
        return allClassified.filter(({ module, facets }) => {
            if (platformFilter.size > 0 && !platformFilter.has(facets.platform)) return false;
            if (lc && !module.toLowerCase().includes(lc)) return false;
            if (archFilter.size > 0 && !archFilter.has(facets.arch)) return false;
            if (kindFilter.size > 0 && !kindFilter.has(facets.kind)) return false;
            if (stageFilter.size > 0 && !stageFilter.has(facets.stage)) return false;
            if (connFilter.size > 0 && !connFilter.has(facets.conn)) return false;
            if (connTypeFilter.size > 0 && !connTypeFilter.has(facets.connType)) return false;
            if (protocolFilter.size > 0 && !protocolFilter.has(facets.protocol)) return false;
            if (stagingFilter === 'staged' && facets.staging !== 'staged') return false;
            if (stagingFilter === 'non-staged' && facets.staging === 'staged') return false;
            return true;
        });
    }, [allClassified, filter, platformFilter, archFilter, kindFilter, stageFilter, connFilter, connTypeFilter, protocolFilter, stagingFilter]);

    // Facet counts are computed against the platform-scoped subset so
    // chip totals reflect what's reachable given the current platform pick.
    const facetCounts = useMemo(() => {
        const scope = allClassified.filter(({ facets }) =>
            platformFilter.size === 0 || platformFilter.has(facets.platform),
        );
        const arch = new Map<string, number>();
        const kind = new Map<string, number>();
        const stage = new Map<string, number>();
        const conn = new Map<string, number>();
        const staging = new Map<string, number>();
        const connType = new Map<MsfConnType, number>();
        const protocol = new Map<MsfProtocol, number>();
        for (const { facets } of scope) {
            arch.set(facets.arch, (arch.get(facets.arch) ?? 0) + 1);
            kind.set(facets.kind, (kind.get(facets.kind) ?? 0) + 1);
            stage.set(facets.stage, (stage.get(facets.stage) ?? 0) + 1);
            conn.set(facets.conn, (conn.get(facets.conn) ?? 0) + 1);
            staging.set(facets.staging, (staging.get(facets.staging) ?? 0) + 1);
            connType.set(facets.connType, (connType.get(facets.connType) ?? 0) + 1);
            protocol.set(facets.protocol, (protocol.get(facets.protocol) ?? 0) + 1);
        }
        return { arch, kind, stage, conn, staging, connType, protocol, scopeTotal: scope.length };
    }, [allClassified, platformFilter]);

    // Group filtered modules by stage so the list reads as semantic sections
    const groupedFiltered = useMemo(() => {
        const groups = new Map<string, { module: string; facets: MsfModuleFacets }[]>();
        for (const entry of filteredEntries) {
            const key = entry.facets.stage;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(entry);
        }
        // Sort stages: meterpreter first, then shell, then alphabetical
        const stageOrder = (s: string) => {
            if (s === 'meterpreter') return 0;
            if (s === 'shell') return 1;
            if (s === 'exec') return 2;
            if (s === 'vncinject') return 3;
            if (s === 'dllinject') return 4;
            if (s === 'handler') return 99;
            if (s === 'other') return 100;
            return 10;
        };
        return Array.from(groups.entries()).sort(([a], [b]) => {
            const oa = stageOrder(a), ob = stageOrder(b);
            return oa !== ob ? oa - ob : a.localeCompare(b);
        });
    }, [filteredEntries]);

    const totalCount = filteredEntries.length;
    const platformCustomized = !setsEqual(platformFilter, defaultPlatforms);
    const hasActiveFilters =
        platformCustomized ||
        archFilter.size + kindFilter.size + stageFilter.size + connFilter.size +
        connTypeFilter.size + protocolFilter.size > 0 ||
        stagingFilter !== 'all';
    const clearFacets = () => {
        setPlatformFilter(defaultPlatforms);
        setArchFilter(new Set());
        setKindFilter(new Set());
        setStageFilter(new Set());
        setConnFilter(new Set());
        setConnTypeFilter(new Set());
        setProtocolFilter(new Set());
        setStagingFilter('all');
    };
    function toggleSet<T>(s: Set<T>, v: T, set: (s: Set<T>) => void) {
        const next = new Set(s);
        if (next.has(v)) next.delete(v); else next.add(v);
        set(next);
    }
    function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
        if (a.size !== b.size) return false;
        for (const x of a) if (!b.has(x)) return false;
        return true;
    }

    /* Wizard state */
    /* Wizard steps:
     *   0 PROFILE   — STAGING + KIND
     *   1 TRANSPORT — ARCH + CONN_TYPE + PROTOCOL
     *   2 MODULE    — final list, just search
     *   3 OPTIONS   — module-specific knobs
     *   4 BUILD     — generate + persist
     */
    const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
    const [selectedModule, setSelectedModule] = useState<string | null>(null);
    const [moduleOptions, setModuleOptions] = useState<Record<string, MsfModuleOption>>({});
    const [loadingOptions, setLoadingOptions] = useState(false);
    const [optionValues, setOptionValues] = useState<Record<string, string>>({});

    /* Fetch options whenever module changes */
    useEffect(() => {
        if (!selectedModule) return;
        let cancelled = false;
        setLoadingOptions(true);
        setModuleOptions({});
        setOptionValues({});
        getModuleOptions('payload', selectedModule)
            .then(opts => {
                if (cancelled) return;
                setModuleOptions(opts);
                // Seed with defaults
                const seed: Record<string, string> = {};
                for (const [k, v] of Object.entries(opts)) {
                    if (v.default != null) seed[k] = String(v.default);
                }
                setOptionValues(seed);
            })
            .catch(e => snackActions.error('Failed to load options: ' + getErrorMessage(e)))
            .finally(() => { if (!cancelled) setLoadingOptions(false); });
        return () => { cancelled = true; };
    }, [selectedModule]);

    /* Format + Encoder are surfaced as dedicated OUTPUT controls below; hide
     * them from the generic Required/Optional/Advanced grids so the operator
     * doesn't see two pickers for the same option. */
    const isOutputKey = (k: string) => k === 'Format' || k === 'Encoder';
    const requiredOpts = useMemo(
        () => Object.entries(moduleOptions).filter(([k, o]) => o.required && !o.advanced && !isOutputKey(k)),
        [moduleOptions],
    );
    const optionalOpts = useMemo(
        () => Object.entries(moduleOptions).filter(([k, o]) => !o.required && !o.advanced && !isOutputKey(k)),
        [moduleOptions],
    );
    const advancedOpts = useMemo(
        () => Object.entries(moduleOptions).filter(([k, o]) => o.advanced && !isOutputKey(k)),
        [moduleOptions],
    );

    /* Pull the catalogue from the module's `enums` when present, otherwise
     * fall back to the curated list so the picker is never empty. */
    const formatChoices = useMemo<string[]>(() => {
        const e = moduleOptions['Format']?.enums;
        if (e && e.length) return e;
        return ALL_FORMATS;
    }, [moduleOptions]);
    const encoderChoices = useMemo<string[]>(() => {
        const e = moduleOptions['Encoder']?.enums;
        if (e && e.length) return e;
        return ALL_ENCODERS;
    }, [moduleOptions]);

    const formatGroups = useMemo(() => groupKeys(FORMAT_GROUPS, formatChoices), [formatChoices]);
    const encoderGroups = useMemo(() => groupKeys(ENCODER_GROUPS, encoderChoices), [encoderChoices]);

    const [showAdvanced, setShowAdvanced] = useState(false);

    const missingRequired = requiredOpts.filter(([k]) => !optionValues[k] || optionValues[k] === '').map(([k]) => k);

    /* ── build / persist ─────────────────────────────────────────────────── */
    const [building, setBuilding] = useState(false);
    const [buildResult, setBuildResult] = useState<{ ok: true; record: MsfPayloadRecord } | { ok: false; error: string } | null>(null);

    /* Payload name — operator-set at creation. Falls back to the module's
       last path segment when the operator hasn't typed anything yet. Reset
       on module change so the placeholder always reflects the active module
       (without overwriting a name the operator has already typed). */
    const [payloadName, setPayloadName] = useState('');
    const [payloadNameTouched, setPayloadNameTouched] = useState(false);
    useEffect(() => {
        if (!payloadNameTouched) setPayloadName('');
    }, [selectedModule, payloadNameTouched]);
    const defaultName = selectedModule ? (selectedModule.split('/').pop() ?? selectedModule) : 'payload';
    const effectiveName = payloadName.trim() || defaultName;

    const [upsertMsfPayload] = useMutation<any>(UPSERT_MSF_PAYLOAD);

    const handleGenerate = useCallback(async () => {
        if (!selectedModule) return;
        if (missingRequired.length > 0) {
            snackActions.warning(`Missing required option(s): ${missingRequired.join(', ')}`);
            return;
        }
        setBuilding(true);
        setBuildResult(null);
        try {
            const res = await generatePayload(selectedModule, optionValues);
            if (res.error) {
                setBuildResult({ ok: false, error: `${res.error}: ${res.error_message || ''}` });
                setBuilding(false);
                return;
            }
            const fmt = (optionValues.Format || res.format || 'raw').toLowerCase();
            const enc = optionValues.Encoder || res.encoder || undefined;
            const record: MsfPayloadRecord = {
                id: newMsfPayloadId(),
                name: effectiveName,
                module: selectedModule,
                os: osFromModule(selectedModule),
                format: fmt,
                encoder: enc,
                options: optionValues,
                createdAt: new Date().toISOString(),
                createdBy: username,
                bytesB64: bytesToB64(res.bytes),
                size: res.size,
            };
            if (!opId) {
                snackActions.warning('No active operation — payload saved locally only.');
            }
            saveLocalPayload(opId, record);
            // fire-and-forget background sync to agentstorage so other
            // operators in the same operation see it. unique_id embeds
            // the operation id so other operations stay disjoint.
            if (opId) {
                upsertMsfPayload({
                    variables: {
                        unique_id: msfPayloadUniqueIdFor(opId, record.id),
                        data: encodeRecordForAgentStorage(record),
                    },
                }).catch(e => {
                    // Local copy is already safe; just warn so the operator knows it
                    // didn't fan out to the team.
                    snackActions.warning('Saved locally — agentstorage sync failed: ' + getErrorMessage(e));
                });
            }
            setBuildResult({ ok: true, record });
        } catch (e) {
            setBuildResult({ ok: false, error: getErrorMessage(e) });
        }
        setBuilding(false);
    }, [selectedModule, optionValues, missingRequired, username, upsertMsfPayload, effectiveName, opId]);

    /* ── download helper for the final step ──────────────────────────────── */
    const handleDownload = useCallback((record: MsfPayloadRecord) => {
        const bin = atob(record.bytesB64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = suggestFilename(record);
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    /* ── step header progress dots ───────────────────────────────────────── */
    const STEPS = [
        { label: 'PROFILE',   icon: <Server size={14} /> },
        { label: 'TRANSPORT', icon: <Network size={14} /> },
        { label: 'MODULE',    icon: <Box size={14} /> },
        { label: 'OPTIONS',   icon: <Settings size={14} /> },
        { label: 'BUILD',     icon: <Rocket size={14} /> },
    ];

    /* Each step has REQUIRED selections — NEXT only enables when satisfied.
     *  Together they make the wizard a series of real decisions, not a series
     *  of "I'll just hit NEXT" prompts. */
    const profileMissing: string[] = [];
    if (stagingFilter === 'all') profileMissing.push('STAGING');
    if (kindFilter.size === 0) profileMissing.push('KIND');

    const transportMissing: string[] = [];
    if (connTypeFilter.size === 0) transportMissing.push('CONNECTION');
    if (protocolFilter.size === 0) transportMissing.push('PROTOCOL');
    if (archFilter.size === 0) transportMissing.push('ARCH');

    const canNext =
        (step === 0 && profileMissing.length === 0) ||
        (step === 1 && transportMissing.length === 0) ||
        (step === 2 && !!selectedModule) ||
        (step === 3 && missingRequired.length === 0 && !loadingOptions);

    /** What's currently blocking NEXT — shown next to the footer button. */
    const blockedReason: string | null =
        step === 0 && profileMissing.length > 0 ? `Pick: ${profileMissing.join(' + ')}` :
        step === 1 && transportMissing.length > 0 ? `Pick: ${transportMissing.join(' + ')}` :
        step === 2 && !selectedModule ? 'Pick a module' :
        step === 3 && missingRequired.length > 0 ? `Fill required: ${missingRequired.join(', ')}` :
        null;

    return (
        <div className="flex-1 flex flex-col min-h-0">
            {/* Header bar — matches existing CreatePayloadEmbed look */}
            <div className="border-b border-ghost/30 pb-4 mb-4 flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 border border-signal/30 bg-signal/5">
                        <Cpu className="text-signal" size={18} />
                    </div>
                    <div>
                        <div className="text-sm tracking-[0.3em] text-signal font-mono font-bold">
                            METASPLOIT · {os.toUpperCase()}
                        </div>
                        <div className="text-xs text-signal/80 font-mono">
                            msfvenom-style payload generation
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {STEPS.map((s, i) => (
                        <React.Fragment key={s.label}>
                            <div className={cn(
                                'flex items-center gap-1.5 px-2.5 py-1.5 border font-mono text-xs tracking-[0.2em] transition-colors',
                                i < step ? 'border-signal/60 text-signal bg-signal/10' :
                                i === step ? 'border-signal text-signal bg-signal/20' :
                                'border-ghost/30 text-signal/70',
                            )}>
                                {i < step ? <Check size={11} /> : s.icon}
                                {s.label}
                            </div>
                            {i < STEPS.length - 1 && <span className="text-signal/40">›</span>}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 border border-ghost/30 rounded-lg overflow-hidden flex flex-col min-h-0 bg-black/20">
                <div className="flex-1 overflow-y-auto p-6 cyber-scrollbar">
                    <AnimatePresence mode="wait">
                        {/* ─ STEP 0 — PROFILE (Staging + Kind) — smooth & minimal ── */}
                        {step === 0 && (
                            <motion.div
                                key="msf-profile"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.22 }}
                                className="space-y-8"
                            >
                                <StepIntro
                                    index="01"
                                    total="05"
                                    title="PROFILE"
                                    intro="Shape the module pool. Pick a staging mode and at least one session kind — both required to continue."
                                />

                                <SmoothSection
                                    label="STAGING"
                                    hint="how the payload reaches the target"
                                    required
                                    filled={stagingFilter !== 'all'}
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        {([
                                            { key: 'all' as const, label: 'ALL', icon: <Layers size={24} strokeWidth={1.6} />,
                                              desc: 'Show every payload regardless of staging mode.',
                                              count: facetCounts.scopeTotal },
                                            { key: 'staged' as const, label: 'STAGED', icon: <ArrowDownToLine size={24} strokeWidth={1.6} />,
                                              desc: 'Small dropper fetches the stage from a listener at runtime.',
                                              count: facetCounts.staging.get('staged') ?? 0 },
                                            { key: 'non-staged' as const, label: 'NON-STAGED', icon: <Package size={24} strokeWidth={1.6} />,
                                              desc: 'Single self-contained binary, no follow-up download.',
                                              count: (facetCounts.staging.get('inline') ?? 0) + (facetCounts.staging.get('single') ?? 0) },
                                        ]).map(opt => (
                                            <SmoothTile
                                                key={opt.key}
                                                active={stagingFilter === opt.key}
                                                onClick={() => setStagingFilter(opt.key)}
                                                icon={opt.icon}
                                                label={opt.label}
                                                count={opt.count}
                                                desc={opt.desc}
                                            />
                                        ))}
                                    </div>
                                </SmoothSection>

                                <SmoothSection
                                    label="KIND"
                                    hint="what kind of session do you want"
                                    required
                                    filled={kindFilter.size > 0}
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        {([
                                            { key: 'meterpreter' as MsfPayloadKind, label: 'METERPRETER', icon: <Cpu size={24} strokeWidth={1.6} />,
                                              desc: 'Full session — files, processes, pivoting.' },
                                            { key: 'shell' as MsfPayloadKind, label: 'SHELL_ONLY', icon: <TerminalIcon size={24} strokeWidth={1.6} />,
                                              desc: 'Plain command shell. Minimal footprint and capability.' },
                                            { key: 'special' as MsfPayloadKind, label: 'SPECIAL', icon: <Zap size={24} strokeWidth={1.6} />,
                                              desc: 'exec / vncinject / dllinject / adduser / handler.' },
                                        ]).map(opt => {
                                            const count = facetCounts.kind.get(opt.key) ?? 0;
                                            if (count === 0) return null;
                                            return (
                                                <SmoothTile
                                                    key={opt.key}
                                                    active={kindFilter.has(opt.key)}
                                                    onClick={() => toggleSet(kindFilter, opt.key, setKindFilter)}
                                                    icon={opt.icon}
                                                    label={opt.label}
                                                    count={count}
                                                    desc={opt.desc}
                                                />
                                            );
                                        })}
                                    </div>
                                </SmoothSection>

                                <ResultLine count={totalCount} />
                            </motion.div>
                        )}

                        {/* ─ STEP 1 — TRANSPORT (Arch + Conn type + Protocol) ───── */}
                        {step === 1 && (
                            <motion.div
                                key="msf-transport"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.22 }}
                                className="space-y-8"
                            >
                                <StepIntro
                                    index="02"
                                    total="05"
                                    title="TRANSPORT"
                                    intro="How the payload moves on the wire. Pick at least one connection style, protocol, and architecture."
                                />

                                {/* CONNECTION TYPE — primary tile row */}
                                <SmoothSection
                                    label="CONNECTION"
                                    hint="reverse / bind / exec / find"
                                    required
                                    filled={connTypeFilter.size > 0}
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                        {([
                                            { key: 'reverse' as MsfConnType, label: 'REVERSE', icon: <ArrowLeftRight size={22} strokeWidth={1.6} />,
                                              desc: 'Payload calls home to a listener.' },
                                            { key: 'bind' as MsfConnType, label: 'BIND', icon: <Radar size={22} strokeWidth={1.6} />,
                                              desc: 'Payload listens on the target for us to connect.' },
                                            { key: 'exec' as MsfConnType, label: 'EXEC', icon: <Play size={22} strokeWidth={1.6} />,
                                              desc: 'Runs locally — no network connection.' },
                                            { key: 'find' as MsfConnType, label: 'FIND', icon: <Search size={22} strokeWidth={1.6} />,
                                              desc: 'Reuses an existing socket / port.' },
                                        ]).map(opt => {
                                            const count = facetCounts.connType.get(opt.key) ?? 0;
                                            if (count === 0) return null;
                                            return (
                                                <SmoothTile
                                                    key={opt.key}
                                                    active={connTypeFilter.has(opt.key)}
                                                    onClick={() => toggleSet(connTypeFilter, opt.key, setConnTypeFilter)}
                                                    icon={opt.icon}
                                                    label={opt.label}
                                                    count={count}
                                                    desc={opt.desc}
                                                    compact
                                                />
                                            );
                                        })}
                                    </div>
                                </SmoothSection>

                                {/* PROTOCOL — chip row, secondary */}
                                <SmoothSection
                                    label="PROTOCOL"
                                    hint="tcp / udp / http / https / named pipe / other"
                                    required
                                    filled={protocolFilter.size > 0}
                                >
                                    <div className="flex flex-wrap gap-2">
                                        {([
                                            { key: 'tcp' as MsfProtocol, label: 'TCP' },
                                            { key: 'udp' as MsfProtocol, label: 'UDP' },
                                            { key: 'http' as MsfProtocol, label: 'HTTP' },
                                            { key: 'https' as MsfProtocol, label: 'HTTPS' },
                                            { key: 'named_pipe' as MsfProtocol, label: 'NAMED PIPE' },
                                            { key: 'ipv6' as MsfProtocol, label: 'IPv6' },
                                            { key: 'other' as MsfProtocol, label: 'OTHER' },
                                            { key: 'none' as MsfProtocol, label: 'NONE' },
                                        ]).map(opt => {
                                            const count = facetCounts.protocol.get(opt.key) ?? 0;
                                            if (count === 0) return null;
                                            return (
                                                <SmoothChip
                                                    key={opt.key}
                                                    active={protocolFilter.has(opt.key)}
                                                    onClick={() => toggleSet(protocolFilter, opt.key, setProtocolFilter)}
                                                    label={opt.label}
                                                    count={count}
                                                />
                                            );
                                        })}
                                    </div>
                                </SmoothSection>

                                {/* ARCH — chip row, secondary */}
                                <SmoothSection
                                    label="ARCHITECTURE"
                                    hint="x64 / x86 / arm / aarch64 / mipsle / ppc / any"
                                    required
                                    filled={archFilter.size > 0}
                                >
                                    <div className="flex flex-wrap gap-2">
                                        {Array.from(facetCounts.arch.entries())
                                            .sort(([a, na], [b, nb]) => {
                                                const wA = a === 'any' ? -3 : a === 'x64' ? -2 : a === 'x86' ? -1 : 0;
                                                const wB = b === 'any' ? -3 : b === 'x64' ? -2 : b === 'x86' ? -1 : 0;
                                                return wA !== wB ? wA - wB : nb - na;
                                            })
                                            .map(([value, count]) => (
                                                <SmoothChip
                                                    key={value}
                                                    active={archFilter.has(value)}
                                                    onClick={() => toggleSet(archFilter, value, setArchFilter)}
                                                    label={value === 'any' ? 'ANY' : value.toUpperCase()}
                                                    count={count}
                                                />
                                            ))}
                                    </div>
                                </SmoothSection>

                                <ResultLine count={totalCount} />
                            </motion.div>
                        )}

                        {/* ─ STEP 2 — MODULE selection (full-width 2-col preview) ─ */}
                        {step === 2 && (
                            <motion.div
                                key="msf-module"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.22 }}
                                className="space-y-4 h-full flex flex-col"
                            >
                                {/* Header — same StepIntro pattern as PROFILE / TRANSPORT */}
                                <div className="flex items-end gap-4">
                                    <div className="flex-1">
                                        <StepIntro
                                            index="03"
                                            total="05"
                                            title="MODULE"
                                            intro={`Pick a specific payload module. ${totalCount} match your filters.`}
                                        />
                                    </div>
                                    {hasActiveFilters && (
                                        <button
                                            onClick={clearFacets}
                                            className="text-xs font-mono tracking-[0.25em] border border-accent/60 bg-accent/10 px-3 py-2 text-accent hover:bg-accent/20 rounded-md whitespace-nowrap"
                                        >
                                            CLEAR FILTERS
                                        </button>
                                    )}
                                </div>

                                {/* Filter breadcrumb — recap of PROFILE + TRANSPORT picks */}
                                <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                                    <span className="text-signal/80 tracking-[0.25em]">FILTERS:</span>
                                    <span className="border border-signal/40 bg-signal/5 px-2 py-1 text-signal rounded">{os}</span>
                                    {stagingFilter !== 'all' && (
                                        <span className={cn(
                                            'border px-2 py-1 rounded',
                                            stagingFilter === 'non-staged' ? 'border-accent bg-accent/10 text-accent' : 'border-signal bg-signal/10 text-signal',
                                        )}>
                                            {stagingFilter === 'staged' ? 'STAGED' : 'NON-STAGED'}
                                        </span>
                                    )}
                                    {Array.from(kindFilter).map(k => (
                                        <span key={k} className="border border-accent bg-accent/10 text-accent px-2 py-1 rounded">
                                            {k === 'meterpreter' ? 'METERPRETER' : k === 'shell' ? 'SHELL' : 'SPECIAL'}
                                        </span>
                                    ))}
                                    {Array.from(connTypeFilter).map(c => (
                                        <span key={c} className="border border-accent bg-accent/10 text-accent px-2 py-1 rounded">
                                            {c.toUpperCase()}
                                        </span>
                                    ))}
                                    {Array.from(protocolFilter).map(p => (
                                        <span key={p} className="border border-signal/60 bg-signal/10 text-signal px-2 py-1 rounded">
                                            {p === 'named_pipe' ? 'NAMED PIPE' : p.toUpperCase()}
                                        </span>
                                    ))}
                                    {Array.from(archFilter).map(a => (
                                        <span key={a} className="border border-signal/60 bg-signal/10 text-signal px-2 py-1 rounded">
                                            {a === 'any' ? 'ANY' : a.toUpperCase()}
                                        </span>
                                    ))}
                                </div>

                                {/* Two-column body: list (2/3) + preview (1/3) */}
                                <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">

                                    {/* ─ LEFT: search + result list ──────────────────────── */}
                                    <div className="lg:col-span-2 flex flex-col gap-3 min-h-0">
                                        <div className="relative">
                                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-signal/70" />
                                            <input
                                                autoFocus
                                                value={filter}
                                                onChange={e => setFilter(e.target.value)}
                                                placeholder="search by module name…"
                                                className="w-full bg-black/60 border border-signal/20 rounded-md text-signal font-mono text-base pl-11 pr-3 py-3 focus:border-signal/60 focus:outline-none transition-colors"
                                            />
                                        </div>

                                        {loadingModules ? (
                                            <div className="flex items-center justify-center py-12 text-signal/80 font-mono text-sm">
                                                <Loader2 className="animate-spin mr-2" size={18} /> LOADING_MODULES…
                                            </div>
                                        ) : moduleError ? (
                                            <div className="border border-red-500/40 bg-red-500/10 rounded-md p-4 text-red-400 font-mono text-sm flex items-center gap-2">
                                                <AlertTriangle size={16} /> {moduleError}
                                            </div>
                                        ) : filteredEntries.length === 0 ? (
                                            <div className="border border-dashed border-signal/20 rounded-md p-8 text-center text-signal font-mono">
                                                <Package size={36} className="mx-auto mb-2 opacity-50" />
                                                <div className="text-sm">NO_MATCHING_MODULES</div>
                                                <div className="text-xs text-signal/70 mt-1">Try going back and widening filters.</div>
                                            </div>
                                        ) : (
                                            <div className="flex-1 space-y-4 overflow-y-auto cyber-scrollbar pr-2 min-h-0">
                                                {groupedFiltered.map(([stageName, entries]) => (
                                                    <div key={stageName} className="space-y-1.5">
                                                        <div className="flex items-center gap-2 sticky top-0 bg-black/90 backdrop-blur-sm py-1.5 z-10">
                                                            <span className="h-px w-3 bg-accent" />
                                                            <span className="text-sm font-mono tracking-[0.3em] text-accent uppercase font-bold">
                                                                {stageName}
                                                            </span>
                                                            <span className="border border-accent/60 bg-accent/10 px-2 py-px text-xs font-mono tracking-[0.2em] text-accent rounded">
                                                                {entries.length.toString().padStart(2, '0')}
                                                            </span>
                                                            <span className="h-px flex-1 bg-signal/15" />
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            {entries.map(({ module: m, facets }) => {
                                                                const selected = selectedModule === m;
                                                                const segs = m.split('/');
                                                                const tail = segs[segs.length - 1];
                                                                const head = segs.slice(0, -1).join('/');
                                                                const meta = getPlatformMeta(facets.platform);
                                                                const Icon = meta.icon;
                                                                return (
                                                                    <button
                                                                        key={m}
                                                                        onClick={() => setSelectedModule(m)}
                                                                        className={cn(
                                                                            'group relative w-full text-left px-3 py-2.5 border rounded-md font-mono flex items-center gap-3 transition-all',
                                                                            selected
                                                                                ? 'border-accent bg-accent/[0.08] shadow-[0_0_12px_rgba(34,197,94,0.2)]'
                                                                                : 'border-signal/20 hover:border-signal/50 bg-black/30 hover:bg-black/50',
                                                                        )}
                                                                    >
                                                                        <span className={cn(
                                                                            'flex items-center justify-center w-10 h-10 shrink-0 rounded-md transition-colors',
                                                                            selected ? 'bg-accent/15 text-accent' : 'bg-signal/[0.05] text-signal/85 group-hover:text-signal',
                                                                        )}>
                                                                            <Icon size={18} />
                                                                        </span>
                                                                        <div className="min-w-0 flex-1">
                                                                            <div className="text-sm truncate">
                                                                                <span className="text-signal/70">{head}/</span>
                                                                                <span className={cn('font-bold', selected ? 'text-accent' : 'text-signal')}>{tail}</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                                <span className={cn(
                                                                                    'border px-1.5 py-px text-[10px] tracking-[0.2em] font-bold rounded',
                                                                                    facets.staging === 'staged'
                                                                                        ? 'border-signal/60 text-signal'
                                                                                        : 'border-accent/60 text-accent bg-accent/10',
                                                                                )}>
                                                                                    {facets.staging === 'staged' ? 'STAGED' : 'NON-STAGED'}
                                                                                </span>
                                                                                {facets.arch !== 'any' && (
                                                                                    <span className="border border-signal/40 px-1.5 py-px text-[10px] tracking-widest text-signal font-bold rounded">
                                                                                        {facets.arch.toUpperCase()}
                                                                                    </span>
                                                                                )}
                                                                                {facets.conn !== 'none' && (
                                                                                    <span className="font-mono text-[10px] text-signal/80 tracking-widest">
                                                                                        {facets.conn}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        {selected && (
                                                                            <Check size={16} className="text-accent shrink-0" />
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* ─ RIGHT: preview pane ─────────────────────────────── */}
                                    <div className="lg:col-span-1 min-h-0">
                                        <ModulePreviewPane
                                            selectedModule={selectedModule}
                                            classified={selectedModule ? allClassified.find(e => e.module === selectedModule) ?? null : null}
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* ─ STEP 3 — OPTIONS ───────────────────────────────────── */}
                        {step === 3 && (
                            <motion.div
                                key="msf-options"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                transition={{ duration: 0.25 }}
                                className="space-y-5"
                            >
                                <div className="flex items-center gap-2">
                                    <h3 className="text-lg font-mono text-signal flex items-center gap-2">
                                        <span className="text-signal/70">04.</span> MODULE OPTIONS
                                    </h3>
                                    <span className="ml-auto text-sm font-mono text-signal truncate max-w-md font-bold">
                                        {selectedModule}
                                    </span>
                                </div>

                                {loadingOptions ? (
                                    <div className="flex items-center justify-center py-12 text-signal/70 font-mono text-xs">
                                        <Loader2 className="animate-spin mr-2" size={16} /> LOADING_OPTIONS…
                                    </div>
                                ) : (
                                    /* Sections scroll internally — keeps the page chrome (step
                                       progress + NEXT/BACK footer) pinned in place. */
                                    <div className="space-y-5 max-h-[60vh] overflow-y-auto cyber-scrollbar pr-2">
                                        {/* OUTPUT — Format + Encoder pickers.
                                            Operator-facing first because the
                                            generated file's extension and
                                            stealth profile both come from
                                            these two knobs. */}
                                        <div className="border border-accent/40 bg-accent/[0.03] p-4 space-y-4">
                                            <div className="text-xs font-mono tracking-[0.3em] text-accent flex items-center gap-2 font-bold">
                                                <FileCode size={13} /> OUTPUT
                                            </div>

                                            <FacetPicker
                                                title="FORMAT"
                                                description="Output file type. msfvenom -f. exe / dll / raw / python / etc."
                                                groups={formatGroups}
                                                value={optionValues.Format || ''}
                                                onChange={v => setOptionValues(prev => ({ ...prev, Format: v }))}
                                                placeholder={moduleOptions['Format']?.default != null ? `default: ${String(moduleOptions['Format']?.default)}` : 'select format'}
                                            />

                                            <FacetPicker
                                                title="ENCODER"
                                                description="Optional. shikata_ga_nai polymorphic XOR for x86; zutto_dekiru for x64. Leave on NONE for no encoding."
                                                groups={encoderGroups}
                                                value={optionValues.Encoder || ''}
                                                onChange={v => setOptionValues(prev => ({ ...prev, Encoder: v }))}
                                                placeholder="none (no encoding)"
                                                allowClear
                                            />
                                        </div>

                                        {/* Required */}
                                        {requiredOpts.length > 0 && (
                                            <div className="border border-red-500/30 bg-red-500/[0.03] p-4 space-y-3">
                                                <div className="text-xs font-mono tracking-[0.3em] text-red-300 flex items-center gap-2 font-bold">
                                                    <AlertTriangle size={13} /> REQUIRED
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {requiredOpts.map(([k, opt]) => (
                                                        <OptionField
                                                            key={k}
                                                            name={k}
                                                            opt={opt}
                                                            value={optionValues[k] ?? ''}
                                                            onChange={v => setOptionValues(prev => ({ ...prev, [k]: v }))}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Optional */}
                                        {optionalOpts.length > 0 && (
                                            <div className="border border-ghost/30 p-4 space-y-3">
                                                <div className="text-xs font-mono tracking-[0.3em] text-signal font-bold">OPTIONAL</div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {optionalOpts.map(([k, opt]) => (
                                                        <OptionField
                                                            key={k}
                                                            name={k}
                                                            opt={opt}
                                                            value={optionValues[k] ?? ''}
                                                            onChange={v => setOptionValues(prev => ({ ...prev, [k]: v }))}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Advanced */}
                                        {advancedOpts.length > 0 && (
                                            <div className="border border-ghost/30">
                                                <button
                                                    onClick={() => setShowAdvanced(v => !v)}
                                                    className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-mono tracking-[0.3em] text-signal hover:bg-signal/5 font-bold"
                                                >
                                                    <span>ADVANCED · {advancedOpts.length}</span>
                                                    <ChevronRight size={12} className={cn('transition-transform', showAdvanced && 'rotate-90')} />
                                                </button>
                                                {showAdvanced && (
                                                    <div className="p-4 border-t border-ghost/30 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {advancedOpts.map(([k, opt]) => (
                                                            <OptionField
                                                                key={k}
                                                                name={k}
                                                                opt={opt}
                                                                value={optionValues[k] ?? ''}
                                                                onChange={v => setOptionValues(prev => ({ ...prev, [k]: v }))}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* ─ STEP 4 — BUILD ─────────────────────────────────────── */}
                        {step === 4 && (
                            <motion.div
                                key="msf-build"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                transition={{ duration: 0.25 }}
                                className="space-y-5"
                            >
                                <h3 className="text-lg font-mono text-signal flex items-center gap-2">
                                    <span className="text-signal/70">05.</span> BUILD &amp; DEPLOY
                                </h3>

                                {/* Summary */}
                                <div className="border border-ghost/30 p-4 space-y-2.5 font-mono text-sm">
                                    <SummaryRow label="MODULE" value={selectedModule ?? ''} />
                                    <SummaryRow label="FORMAT" value={optionValues.Format || 'raw'} />
                                    {optionValues.Encoder && <SummaryRow label="ENCODER" value={optionValues.Encoder} />}
                                    {requiredOpts.map(([k]) => (
                                        <SummaryRow key={k} label={k} value={optionValues[k] ?? ''} />
                                    ))}
                                </div>

                                {/* Payload name — operator picks it before
                                    generation so the resulting filename is
                                    sensible from the start. Renameable later
                                    from the row's action menu either way. */}
                                {!buildResult && (
                                    <div className="border border-ghost/30 p-4 space-y-2 font-mono text-sm">
                                        <label className="text-[10px] text-signal/70 tracking-[0.25em] uppercase">
                                            PAYLOAD_NAME
                                        </label>
                                        <input
                                            value={payloadName}
                                            onChange={e => { setPayloadName(e.target.value); setPayloadNameTouched(true); }}
                                            placeholder={defaultName}
                                            className="w-full bg-black border border-signal/30 text-signal text-sm font-mono px-3 py-2 outline-none focus:border-accent/60"
                                        />
                                        <div className="text-[10px] text-signal/50">
                                            File will be saved as <span className="text-signal/80">{
                                                suggestFilename({
                                                    name: effectiveName,
                                                    format: optionValues.Format || 'raw',
                                                    os: selectedModule ? osFromModule(selectedModule) : 'other',
                                                })
                                            }</span>
                                        </div>
                                    </div>
                                )}

                                {/* Action / result */}
                                {!buildResult && (
                                    <button
                                        disabled={building}
                                        onClick={handleGenerate}
                                        className={cn(
                                            'w-full px-6 py-3 border font-mono text-sm tracking-[0.3em] font-bold transition-all flex items-center justify-center gap-2',
                                            building
                                                ? 'border-signal/40 text-signal/70 cursor-wait'
                                                : 'border-accent bg-accent text-void hover:bg-signal hover:border-signal',
                                        )}
                                    >
                                        {building ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                                        {building ? 'GENERATING…' : 'INITIATE_BUILD_SEQUENCE'}
                                    </button>
                                )}

                                {buildResult && buildResult.ok && (
                                    <div className="border border-accent/60 bg-accent/[0.05] p-4 space-y-3">
                                        <div className="flex items-center gap-2 text-accent font-mono text-sm font-bold">
                                            <Check size={14} /> BUILD_COMPLETE
                                        </div>
                                        <div className="text-sm font-mono text-signal grid grid-cols-2 gap-2">
                                            <div><span className="text-signal/70">SIZE</span> · {buildResult.record.size.toLocaleString()} bytes</div>
                                            <div><span className="text-signal/70">FORMAT</span> · {buildResult.record.format}</div>
                                            <div className="col-span-2 truncate"><span className="text-signal/70">FILE</span> · {suggestFilename(buildResult.record)}</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleDownload(buildResult.record)}
                                                className="flex items-center gap-2 px-4 py-2 border border-accent bg-accent text-void font-mono text-xs tracking-[0.25em] font-bold hover:bg-signal hover:border-signal transition-colors"
                                            >
                                                <Download size={12} /> DOWNLOAD
                                            </button>
                                            <button
                                                onClick={onComplete}
                                                className="flex items-center gap-2 px-4 py-2 border border-signal/60 font-mono text-xs tracking-[0.25em] text-signal hover:bg-signal/10 transition-colors"
                                            >
                                                <ChevronLeft size={12} /> BACK_TO_LIST
                                            </button>
                                            <button
                                                onClick={() => { setBuildResult(null); }}
                                                className="flex items-center gap-2 px-4 py-2 border border-ghost/40 font-mono text-xs tracking-[0.25em] text-signal hover:bg-signal/5 transition-colors"
                                            >
                                                <RefreshCw size={12} /> REGENERATE
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {buildResult && !buildResult.ok && (
                                    <div className="border border-red-500/50 bg-red-500/10 p-4 space-y-2 font-mono text-sm">
                                        <div className="flex items-center gap-2 text-red-400 font-bold">
                                            <X size={14} /> BUILD_FAILED
                                        </div>
                                        <div className="text-red-300 text-xs">{buildResult.error}</div>
                                        <button
                                            onClick={() => { setBuildResult(null); }}
                                            className="mt-2 px-3 py-1.5 border border-red-500/40 text-red-300 text-[10px] tracking-[0.25em] hover:bg-red-500/10"
                                        >
                                            RETRY
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer — nav */}
                <div className="border-t border-ghost/30 px-6 py-3 flex items-center justify-between bg-black/40">
                    <button
                        onClick={step === 0 ? onBack : () => setStep((s) => (s - 1) as typeof step)}
                        className="flex items-center gap-2 px-4 py-1.5 border border-signal/40 font-mono text-xs tracking-[0.25em] text-signal hover:bg-signal/10 transition-colors"
                    >
                        <ChevronLeft size={12} /> {step === 0 ? 'CHANGE_AGENT' : 'BACK'}
                    </button>
                    {step < 4 && (
                        <div className="flex items-center gap-3">
                            {blockedReason && (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono tracking-[0.25em] text-amber-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                                    {blockedReason}
                                </span>
                            )}
                            <button
                                disabled={!canNext}
                                onClick={() => setStep((s) => (s + 1) as typeof step)}
                                className={cn(
                                    'flex items-center gap-2 px-5 py-1.5 border font-mono text-xs tracking-[0.25em] font-bold transition-colors',
                                    canNext
                                        ? 'border-accent bg-accent text-void hover:bg-signal hover:border-signal'
                                        : 'border-ghost/30 text-signal/70 cursor-not-allowed opacity-50',
                                )}
                            >
                                NEXT <ChevronRight size={12} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

/* =============================================================================
 *  Smooth minimal parts for PROFILE + TRANSPORT steps.
 *  No clip-paths, no corner ticks, no badges — just clean borders, generous
 *  whitespace, and a single accent green to mark selection.
 * ===========================================================================*/

/** Step intro — minimal header with step number, title, one-line subtitle. */
const StepIntro: React.FC<{ index: string; total: string; title: string; intro: string }> = ({ index, total, title, intro }) => (
    <div className="space-y-1">
        <div className="text-[11px] font-mono tracking-[0.3em] text-signal/80">
            STEP {index} / {total}
        </div>
        <h3 className="text-2xl font-mono text-signal font-bold tracking-[0.15em]">{title}</h3>
        <p className="text-sm font-mono text-signal/90 leading-relaxed">{intro}</p>
    </div>
);

/** Section wrapper — label, hint, thin underline, optional REQUIRED badge.
 *  When `required` is true (filled = false), shows an amber "PICK ONE" hint
 *  inline next to the label so the operator knows they can't skip it. */
const SmoothSection: React.FC<{
    label: string;
    hint: string;
    required?: boolean;
    filled?: boolean;
    children: React.ReactNode;
}> = ({ label, hint, required, filled, children }) => {
    const needs = required && !filled;
    return (
        <div className="space-y-3">
            <div className={cn(
                'flex items-baseline gap-3 pb-1.5 border-b',
                needs ? 'border-amber-400/40' : 'border-signal/15',
            )}>
                <span className="text-sm font-mono tracking-[0.3em] text-signal font-bold">{label}</span>
                <span className="font-mono text-xs text-signal/80">{hint}</span>
                {needs && (
                    <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-mono tracking-[0.3em] text-amber-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_5px_currentColor]" />
                        REQUIRED
                    </span>
                )}
                {required && filled && (
                    <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-mono tracking-[0.3em] text-accent">
                        <Check size={11} strokeWidth={2.5} />
                        SET
                    </span>
                )}
            </div>
            {children}
        </div>
    );
};

/** Clean selectable tile.
 *   - Rounded, soft bg, 1px border resting at signal/15
 *   - Active: accent-tinted border + bg + soft glow + small accent dot top-right
 *   - Hover: brighter border
 *   - `compact` shrinks the icon + collapses the description to 1 line */
const SmoothTile: React.FC<{
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    count: number;
    desc: string;
    compact?: boolean;
}> = ({ active, onClick, icon, label, count, desc, compact }) => (
    <button
        onClick={onClick}
        className={cn(
            'group relative text-left transition-all duration-150 rounded-md',
            'border bg-black/30 hover:bg-black/50',
            'flex flex-col gap-2',
            compact ? 'p-3' : 'p-4',
            active
                ? 'border-accent bg-accent/[0.06] shadow-[0_0_14px_rgba(34,197,94,0.20)]'
                : 'border-signal/20 hover:border-signal/50',
        )}
    >
        <div className="flex items-center justify-between">
            <div className={cn(
                'flex items-center justify-center transition-colors rounded-md',
                compact ? 'w-9 h-9' : 'w-11 h-11',
                active
                    ? 'bg-accent/15 text-accent'
                    : 'bg-signal/[0.05] text-signal/85 group-hover:text-signal',
            )}>
                {icon}
            </div>
            <div className="text-right">
                <div className={cn(
                    'font-mono tabular-nums font-bold leading-none',
                    compact ? 'text-base' : 'text-lg',
                    active ? 'text-accent' : 'text-signal',
                )}>
                    {count}
                </div>
                <div className="font-mono text-[9px] tracking-[0.25em] text-signal/70 mt-0.5">MODULES</div>
            </div>
        </div>
        <div className={cn(
            'font-mono tracking-[0.18em] font-bold transition-colors',
            compact ? 'text-sm' : 'text-base',
            active ? 'text-accent' : 'text-signal',
        )}>
            {label}
        </div>
        <p className={cn(
            'font-mono text-signal/85 leading-snug',
            compact ? 'text-[11px] line-clamp-2' : 'text-xs',
        )}>
            {desc}
        </p>
        {active && (
            <span className="absolute top-3 right-3 h-1.5 w-1.5 rounded-full bg-accent animate-pulse shadow-[0_0_5px_currentColor] text-accent" />
        )}
    </button>
);

/** Compact chip for ARCH / PROTOCOL rows. */
const SmoothChip: React.FC<{
    active: boolean;
    onClick: () => void;
    label: string;
    count: number;
}> = ({ active, onClick, label, count }) => (
    <button
        onClick={onClick}
        className={cn(
            'group inline-flex items-center gap-2 px-3 py-2 rounded-md border font-mono text-sm tracking-[0.15em] transition-all',
            active
                ? 'border-accent bg-accent/10 text-accent font-bold'
                : 'border-signal/20 text-signal hover:border-signal/50 hover:bg-signal/[0.04]',
        )}
    >
        <span>{label}</span>
        <span className={cn('text-xs tabular-nums', active ? 'text-accent/80' : 'text-signal/60')}>{count}</span>
    </button>
);

/** Live "X modules match" preview at the bottom of each filter step. */
const ResultLine: React.FC<{ count: number }> = ({ count }) => (
    <div className="flex items-center gap-3 pt-3 border-t border-signal/15">
        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse shadow-[0_0_5px_currentColor] text-accent" />
        <span className="text-sm font-mono tracking-[0.25em] text-signal/80">MATCHES</span>
        <span className="font-mono text-2xl text-signal font-bold tabular-nums leading-none">{count}</span>
        <span className="font-mono text-xs text-signal/85">modules will be available on the next step</span>
    </div>
);

/** Sticky preview pane on the MODULE step — shows the currently-selected module's
 *  full path, platform icon, every parsed facet, and a "next step" hint. Empty
 *  state is a calm placeholder, not a loud alert. */
const ModulePreviewPane: React.FC<{
    selectedModule: string | null;
    classified: { module: string; facets: MsfModuleFacets } | null;
}> = ({ selectedModule, classified }) => {
    if (!selectedModule || !classified) {
        return (
            <div className="h-full border border-dashed border-signal/20 rounded-md bg-black/30 p-6 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-12 h-12 rounded-md bg-signal/[0.05] flex items-center justify-center">
                    <Box size={22} className="text-signal/70" strokeWidth={1.5} />
                </div>
                <div className="font-mono text-sm tracking-[0.2em] text-signal">NO SELECTION</div>
                <p className="font-mono text-[11px] text-signal/80 leading-relaxed max-w-[200px]">
                    Pick a module on the left to see its classification + transport details here.
                </p>
            </div>
        );
    }
    const { module, facets } = classified;
    const segs = module.split('/');
    const tail = segs[segs.length - 1];
    const head = segs.slice(0, -1).join('/');
    const meta = getPlatformMeta(facets.platform);
    const Icon = meta.icon;

    return (
        <div className="h-full border border-signal/20 rounded-md bg-black/40 flex flex-col overflow-hidden">
            {/* Header — platform icon + path */}
            <div className="border-b border-signal/15 p-4 bg-signal/[0.03]">
                <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-md bg-accent/15 text-accent flex items-center justify-center shrink-0">
                        <Icon size={24} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-mono tracking-[0.3em] text-accent mb-1">SELECTED</div>
                        <div className="font-mono text-sm leading-snug break-all">
                            <span className="text-signal/70">{head}/</span>
                            <span className="text-signal font-bold">{tail}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Badges row */}
            <div className="border-b border-signal/15 p-4">
                <div className="text-[10px] font-mono tracking-[0.3em] text-signal/80 mb-2">PROFILE</div>
                <div className="flex flex-wrap gap-1.5">
                    <span className={cn(
                        'border px-2 py-1 text-[10px] tracking-[0.2em] font-bold rounded font-mono',
                        facets.staging === 'staged'
                            ? 'border-signal/60 text-signal'
                            : 'border-accent/60 text-accent bg-accent/10',
                    )}>
                        {facets.staging === 'staged' ? 'STAGED' : 'NON-STAGED'}
                    </span>
                    <span className="border border-accent/60 bg-accent/10 text-accent px-2 py-1 text-[10px] tracking-[0.2em] font-bold rounded font-mono">
                        {facets.kind.toUpperCase()}
                    </span>
                </div>

                <div className="text-[10px] font-mono tracking-[0.3em] text-signal/80 mt-3 mb-2">TRANSPORT</div>
                <div className="flex flex-wrap gap-1.5">
                    <span className="border border-accent/60 bg-accent/10 text-accent px-2 py-1 text-[10px] tracking-[0.2em] font-bold rounded font-mono">
                        {facets.connType.toUpperCase()}
                    </span>
                    {facets.protocol !== 'none' && (
                        <span className="border border-signal/40 bg-signal/[0.04] text-signal px-2 py-1 text-[10px] tracking-[0.2em] font-bold rounded font-mono">
                            {facets.protocol === 'named_pipe' ? 'NAMED PIPE' : facets.protocol.toUpperCase()}
                        </span>
                    )}
                    {facets.arch !== 'any' && (
                        <span className="border border-signal/40 bg-signal/[0.04] text-signal px-2 py-1 text-[10px] tracking-[0.2em] font-bold rounded font-mono">
                            {facets.arch.toUpperCase()}
                        </span>
                    )}
                </div>
            </div>

            {/* Classifier table — flexes to fill available height */}
            <div className="flex-1 overflow-y-auto cyber-scrollbar p-4">
                <div className="text-[10px] font-mono tracking-[0.3em] text-signal/80 mb-2">CLASSIFIER</div>
                <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 font-mono text-xs">
                    <PreviewRow label="Platform" value={meta.label} />
                    <PreviewRow label="Stage"    value={facets.stage} />
                    <PreviewRow label="Conn"     value={facets.conn} />
                    <PreviewRow label="Type"     value={facets.connType} />
                    <PreviewRow label="Proto"    value={facets.protocol} />
                    <PreviewRow label="Arch"     value={facets.arch} />
                    <PreviewRow label="Staging"  value={facets.staging} />
                </dl>
            </div>

            {/* Footer hint */}
            <div className="border-t border-signal/15 p-3 bg-signal/[0.02] flex items-center gap-2">
                <ChevronRight size={12} className="text-accent" />
                <span className="font-mono text-[11px] text-signal/85">Next: configure module options</span>
            </div>
        </div>
    );
};

const PreviewRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <>
        <dt className="text-signal/70 tracking-[0.2em] uppercase text-[10px] pt-px">{label}</dt>
        <dd className="text-signal break-all">{value}</dd>
    </>
);

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-baseline gap-3">
        <span className="text-signal/80 text-xs tracking-[0.25em] uppercase shrink-0 w-24 font-bold">{label}</span>
        <span className="text-signal break-all">{value}</span>
    </div>
);

/** FacetPicker — grouped chip-style selector used for Format / Encoder.
 *  Shows the current selection prominently and expands a group-segmented chip
 *  cloud below it so the operator can scan options without a giant dropdown.
 *  Each chip carries an optional hint tooltip (e.g. "polymorphic XOR (x86)"
 *  on shikata_ga_nai). */
const FacetPicker: React.FC<{
    title: string;
    description?: string;
    groups: Array<{ label: string; items: Array<{ key: string; hint?: string }> }>;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    allowClear?: boolean;
}> = ({ title, description, groups, value, onChange, placeholder, allowClear }) => {
    const [open, setOpen] = useState(false);
    const totalCount = groups.reduce((n, g) => n + g.items.length, 0);
    const selectedHint = (() => {
        for (const g of groups) {
            const hit = g.items.find(it => it.key === value);
            if (hit?.hint) return hit.hint;
        }
        return undefined;
    })();
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-mono tracking-[0.3em] text-signal font-bold">{title}</span>
                <span className="text-[10px] font-mono text-signal/60">· {totalCount} available</span>
                <button
                    onClick={() => setOpen(o => !o)}
                    className="ml-auto text-[10px] font-mono tracking-[0.25em] text-signal hover:text-accent flex items-center gap-1"
                >
                    {open ? 'COLLAPSE' : 'EXPAND'}
                    <ChevronRight size={11} className={cn('transition-transform', open && 'rotate-90')} />
                </button>
            </div>
            {description && <p className="text-[11px] text-signal/70 leading-relaxed">{description}</p>}
            <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 border text-xs font-mono',
                    value
                        ? 'border-accent/50 bg-accent/10 text-accent'
                        : 'border-ghost/40 text-signal/60',
                )}>
                    <Check size={11} className={value ? '' : 'opacity-40'} />
                    {value || placeholder || 'unset'}
                </span>
                {selectedHint && (
                    <span className="text-[10px] font-mono text-signal/60">{selectedHint}</span>
                )}
                {allowClear && value && (
                    <button
                        onClick={() => onChange('')}
                        className="text-[10px] font-mono text-signal/60 hover:text-red-300 tracking-[0.25em]"
                    >
                        CLEAR
                    </button>
                )}
            </div>
            {open && (
                <div className="space-y-3 border border-ghost/30 bg-black/30 p-3">
                    {groups.map(g => (
                        <div key={g.label} className="space-y-1.5">
                            <div className="text-[10px] font-mono tracking-[0.3em] text-signal/70">{g.label}</div>
                            <div className="flex flex-wrap gap-1.5">
                                {g.items.map(it => (
                                    <button
                                        key={it.key}
                                        onClick={() => { onChange(it.key); setOpen(false); }}
                                        title={it.hint}
                                        className={cn(
                                            'px-2 py-1 border text-[11px] font-mono transition-colors',
                                            value === it.key
                                                ? 'border-accent bg-accent text-void font-bold'
                                                : 'border-ghost/30 text-signal hover:border-signal/60 hover:text-accent',
                                        )}
                                    >
                                        {it.key}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

/** Section wrapper for a prominent facet group (PLATFORM / ARCH / KIND). */
const FacetSection: React.FC<{
    label: string;
    hint?: string;
    children: React.ReactNode;
}> = ({ label, hint, children }) => (
    <div className="border border-ghost/30 bg-black/30 p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono tracking-[0.3em] text-accent font-bold">{label}</span>
            {hint && <span className="text-[11px] font-mono text-signal/80">{hint}</span>}
        </div>
        {children}
    </div>
);

/** Compact secondary facet row (CONN / STAGE inside the ADVANCED disclosure). */
const FacetRow: React.FC<{
    label: string;
    counts: Map<string, number>;
    active: Set<string>;
    onToggle: (value: string) => void;
    sortKey?: (value: string) => number;
    valueClass?: string;
}> = ({ label, counts, active, onToggle, sortKey, valueClass }) => {
    const entries = Array.from(counts.entries()).filter(([, n]) => n > 0);
    entries.sort(([a], [b]) => {
        const ka = sortKey ? sortKey(a) : 50;
        const kb = sortKey ? sortKey(b) : 50;
        return ka !== kb ? ka - kb : a.localeCompare(b);
    });
    if (entries.length === 0) return null;
    return (
        <div className="flex items-start gap-2">
            <span className="text-xs font-mono tracking-[0.25em] text-signal w-14 shrink-0 pt-1">{label}</span>
            <div className="flex flex-wrap items-center gap-1.5">
                {entries.map(([value, count]) => {
                    const isActive = active.has(value);
                    return (
                        <button
                            key={value}
                            onClick={() => onToggle(value)}
                            className={cn(
                                'px-2.5 py-1 border font-mono text-xs tracking-[0.15em] transition-colors',
                                isActive
                                    ? 'border-accent bg-accent/15 text-accent font-bold'
                                    : cn('border-ghost/30 hover:border-signal/60 hover:bg-signal/5', valueClass ?? 'text-signal'),
                            )}
                        >
                            {value} <span className={isActive ? 'text-accent/80' : 'text-signal/60'}>·{count}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default CreateMsfPayloadEmbed;
