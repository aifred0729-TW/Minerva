/* =============================================================================
 *  NODE DOSSIER — the netrunner read on one machine
 *  ---------------------------------------------------------------------------
 *  Opened from the 3D topology's right-click menu (VIEW DETAILS). A panel, not
 *  a takeover: the scene stays visible around it, and it only closes on EXIT
 *  INTERFACE (or Escape, the keyboard spelling of the same button) — orbiting
 *  the camera is a drag that starts outside the panel, and an outside-click
 *  rule threw the dossier away every time the operator moved the view.
 *
 *  Built against the operator's reference frame (`/opt/Ref/detail.png`):
 *
 *    LEFT COLUMN — the machine, in the reference's terminal green:
 *      · a thin filled rule with machine-readable meta at both ends;
 *      · a dark body, 1px accent frame, BOTTOM-RIGHT CORNER CHAMFERED;
 *      · the facts grouped under `//SECTION` headers — terminal-flavoured, but
 *        laid out as label/value pairs, NOT a raw log dump. Only the rows that
 *        carry a live status get the dotted leader, exactly like the reference
 *        (its `//ROOT` and `//LOGIN_SUCCESS` lines have none);
 *      · a second meta rule, then the filled verdict block with the chip glyph.
 *
 *    RIGHT COLUMN — the defence matrix, in a different colour and at maximum
 *    contrast, because this is the block the operator reads before acting:
 *      · a filled title plate, dark text;
 *      · session code cells + hex glyph, a rule, then three FILLED rows —
 *        bright fill with near-black text, badge far left, icon and title to
 *        its right, right end chamfered. A decided state is a solid colour; the
 *        undecided one is the only outlined row, so "not assessed" can never be
 *        mistaken for "handled".
 *
 *  Motion is ported from the operator's reference implementation
 *  (github.com/yet3/cyberpunk2077-breach-protocol): plates unroll on Y, bodies
 *  wipe open on X, text flickers in, a secured row keeps a slow glow. Keyframes
 *  live in `index.css` under `bp-*`. This is the one post-login surface allowed
 *  that chrome (DESIGN_LANGUAGE Section 11.1).
 * ===========================================================================*/
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Flame, KeyRound, Shield, ShieldOff, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn, isCallbackAlive } from '../../lib/utils';
import { timeAgo } from '../../lib/time';
import type { TopoNode, TopoNodeData } from '../../types/topology';
import { extractPrimaryIP, getOSFullLabel, getPrivilege } from './topology';
import { extractAllIPs } from '../../lib/quickhacks';
import { cycleDefense, hostKeyOf, useHostDefense, type DefenseState } from './defenseMarks';

/* ── The reference's silhouettes ────────────────────────────────────────── */
/** Panel bodies: the bottom-right corner is cut. */
const BODY_CHAMFER = 'polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%)';
/** Status rows: the right edge stays vertical — only the bottom-right corner
 *  is notched, the same cut the panel bodies take. */
const ROW_CHAMFER = 'polygon(0 0, 100% 0, 100% calc(100% - 11px), calc(100% - 11px) 100%, 0 100%)';
/** Buttons: opposite corners notched. */
const BUTTON_NOTCH = 'polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px)';

type PlateTone = 'accent' | 'signal' | 'fail';

const PLATE_FILL: Record<PlateTone, string> = {
    accent: 'bg-accent text-void',
    signal: 'bg-signal text-void',
    fail: 'bg-red-400 text-void',
};
/** The 1px frame is drawn as a background sandwich so it follows the chamfer —
 *  a clipped border would be sliced off along the diagonal. */
const FRAME_FILL: Record<PlateTone, string> = {
    accent: 'bg-accent/45',
    signal: 'bg-signal/45',
    fail: 'bg-red-400/45',
};

const bpDelay = (ms: number): React.CSSProperties => ({ ['--bp-delay' as string]: `${ms}ms` });

/* ── Thin filled rule with meta at both ends ────────────────────────────── */
const MetaRule = ({ tone, left, right, title, delayMs = 0 }: {
    tone: PlateTone;
    left: string;
    right: string;
    /** Present on the head rule only — the plate's name, in the fill's own black. */
    title?: string;
    delayMs?: number;
}) => (
    <div
        className={cn('bp-scale-y flex items-center gap-3 px-3 py-1', PLATE_FILL[tone])}
        style={bpDelay(delayMs)}
    >
        {title
            ? <span className="truncate text-[13px] font-bold uppercase tracking-[0.18em]">{title}</span>
            : <span className="shrink-0 text-[9px] font-bold tracking-[0.1em] tabular-nums text-void/70">{left}</span>}
        <span aria-hidden="true" className="flex-1" />
        <span className="hidden shrink-0 text-right text-[9px] font-bold leading-[1.35] tracking-[0.1em] tabular-nums text-void/70 sm:block">
            {title && <span className="block">{left}</span>}
            <span className="block">{right}</span>
        </span>
    </div>
);

/* ── Chamfered body: 1px frame + near-black fill ────────────────────────── */
const ChamferBody = ({ tone, className, style, children }: {
    tone: PlateTone;
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
}) => (
    <div className={cn('p-px', FRAME_FILL[tone], className)} style={{ clipPath: BODY_CHAMFER, ...style }}>
        <div className="h-full bg-[#04070a]" style={{ clipPath: BODY_CHAMFER }}>
            {children}
        </div>
    </div>
);

/* ── Terminal-flavoured section header ──────────────────────────────────── */
const Section = ({ label, delayMs = 0 }: { label: string; delayMs?: number }) => (
    <div className="bp-blink mb-0.5 mt-2 flex items-center gap-2 first:mt-0" style={bpDelay(delayMs)}>
        <span className="shrink-0 text-[10px] font-bold tracking-[0.2em] text-accent">{`//${label}`}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-accent/25" />
    </div>
);

/* ── Fact row. `status` rows get the reference's dotted leader; plain facts
      are a label/value pair, so the column reads as data, not as a log. ──── */
const LEADER = '..............................................................';

const Fact = ({ label, value, tone = 'signal', leader = false, delayMs = 0 }: {
    label: string;
    value: React.ReactNode;
    tone?: 'signal' | 'accent' | 'fail';
    leader?: boolean;
    delayMs?: number;
}) => (
    <div className="bp-blink flex items-baseline gap-2 text-[11px] leading-[1.55]" style={bpDelay(delayMs)}>
        <span className="w-[92px] shrink-0 truncate tracking-[0.1em] text-accent/80">{label}</span>
        {leader
            ? <span aria-hidden="true" className="min-w-0 flex-1 overflow-hidden tracking-[0.25em] text-accent/30">{LEADER}</span>
            : <span aria-hidden="true" className="flex-1" />}
        <span className={cn(
            'max-w-[62%] shrink-0 truncate text-right font-bold tracking-[0.08em]',
            tone === 'accent' && 'text-accent',
            tone === 'fail' && 'text-red-400',
            tone === 'signal' && 'text-signal',
        )}>
            {value}
        </span>
    </div>
);

/* ── Session code cell — the reference's buffer slots ───────────────────── */
const CodeSlot = ({ text, tone = 'filled', delayMs = 0 }: {
    text?: string;
    tone?: 'filled' | 'empty';
    delayMs?: number;
}) => (
    <span
        style={bpDelay(delayMs)}
        className={cn(
            'bp-blink flex h-7 min-w-[46px] items-center justify-center px-1.5 text-[11px] font-bold tracking-[0.08em] tabular-nums',
            tone === 'empty'
                ? 'border border-dashed border-signal/25 text-signal/30'
                : 'border border-signal/60 bg-signal/[0.08] text-signal',
        )}
    >
        {text ?? '--'}
    </span>
);

const ChipGlyph = ({ className }: { className?: string }) => (
    <span aria-hidden="true" className={cn('grid shrink-0 grid-cols-3 gap-[2px] border p-[3px]', className)}>
        {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="h-[3px] w-[3px] bg-current" style={{ opacity: i % 3 === 1 ? 0.45 : 1 }} />
        ))}
    </span>
);

const HexGlyph = ({ lines }: { lines: string[] }) => (
    <span className="flex shrink-0 items-center gap-1.5">
        <svg width="22" height="24" viewBox="0 0 20 22" aria-hidden="true" className="text-signal/70">
            <polygon points="10,1 19,6 19,16 10,21 1,16 1,6" fill="none" stroke="currentColor" strokeWidth="1" />
            <polygon points="10,6 14.5,8.5 14.5,13.5 10,16 5.5,13.5 5.5,8.5" fill="currentColor" opacity="0.4" />
        </svg>
        <span aria-hidden="true" className="hidden flex-col text-[7px] leading-[1.5] tracking-[0.05em] tabular-nums text-signal/35 lg:flex">
            {lines.map(l => <span key={l}>{l}</span>)}
        </span>
    </span>
);

/* ── The defence rows: decided states are SOLID, undecided is outlined ──── */
type RowState = 'won' | 'lost' | 'unknown';

const ROW_STYLE: Record<RowState, { shell: string; badge: string; detail: string }> = {
    // Bright fill, near-black text — the reference's [INSTALLED] rows, and the
    // highest-contrast pairing the palette offers.
    won: { shell: 'bg-accent text-void', badge: 'border-void/50 text-void', detail: 'text-void/80' },
    lost: { shell: 'bg-red-400 text-void', badge: 'border-void/50 text-void', detail: 'text-void/80' },
    // The one outlined row: an unassessed defence must never read as handled.
    unknown: { shell: 'border border-signal/70 bg-signal/[0.06] text-signal', badge: 'border-signal/60 text-signal', detail: 'text-signal/75' },
};

const BreachRow = ({ state, badge, title, detail, icon: Icon, onClick, hint, delayMs = 0 }: {
    state: RowState;
    badge: string;
    title: string;
    detail: string;
    icon: LucideIcon;
    /** Omitted for derived rows — they are readouts, not controls. */
    onClick?: () => void;
    hint?: string;
    delayMs?: number;
}) => {
    const s = ROW_STYLE[state];
    const inner = (
        <>
            <span className={cn('shrink-0 border px-2 py-[2px] text-[10px] font-bold tracking-[0.12em]', s.badge)}>
                {badge}
            </span>
            <span aria-hidden="true" className="flex-1" />
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
            <span className="w-[56%] min-w-0 shrink-0">
                <span className="block truncate text-[12px] font-bold uppercase tracking-[0.1em]">{title}</span>
                <span className={cn('block truncate text-[11px] leading-[1.35]', s.detail)}>{detail}</span>
            </span>
        </>
    );
    const shell = cn('bp-blink flex w-full items-center gap-2.5 py-2 pl-2.5 pr-3 text-left', s.shell);
    const style = { clipPath: ROW_CHAMFER, ...bpDelay(delayMs) };

    if (!onClick) return <div className={shell} style={style} title={hint} role="status">{inner}</div>;
    return (
        <button
            type="button"
            onClick={onClick}
            title={hint}
            style={style}
            className={cn(
                shell, 'cursor-pointer transition-[filter,background-color] duration-150',
                state === 'unknown' ? 'hover:bg-signal/[0.14]' : 'hover:brightness-110',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-void',
            )}
        >
            {inner}
        </button>
    );
};

const rowState = (v: DefenseState): RowState => (v === 'bypassed' ? 'won' : v === 'active' ? 'lost' : 'unknown');

export const NodeDossier = ({ node, onClose, edges }: {
    node: TopoNode | null;
    onClose: () => void;
    /** Raw GQL edges — fed to isCallbackAlive so P2P orphans read as dead. */
    edges?: any[] | null;
}) => {
    const reduce = useReducedMotion();
    const exitRef = useRef<HTMLButtonElement>(null);

    const sessions: TopoNodeData[] = useMemo(
        () => (node ? ((node.allCallbacks as TopoNodeData[] | undefined) ?? (node.data ? [node.data] : [])) : []),
        [node],
    );
    const cb: TopoNodeData | null = sessions[0] ?? node?.data ?? null;
    const hostKey = hostKeyOf(cb?.host || node?.label);
    const defense = useHostDefense(hostKey);

    useEffect(() => {
        if (!node) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        exitRef.current?.focus({ preventScroll: true });
        return () => document.removeEventListener('keydown', onKey);
    }, [node, onClose]);

    const ips = useMemo(() => (cb?.ip ? extractAllIPs(cb.ip) : []), [cb?.ip]);
    const cycleAv = useCallback(() => cycleDefense(hostKey, 'av'), [hostKey]);
    const cycleFw = useCallback(() => cycleDefense(hostKey, 'fw'), [hostKey]);

    if (!node) return null;

    const isCallback = node.type === 'callback';
    const alive = isCallback && cb ? (cb.active !== false && isCallbackAlive(cb, edges)) : null;
    // Privilege is read per platform: Windows has a ladder (SYSTEM > admin >
    // user), unix is binary (root or not). See getPrivilege().
    const privInfo = isCallback && cb ? getPrivilege(cb) : { label: '', tier: 'unknown' as const, unix: false };
    const priv = privInfo.label;
    const privState: RowState =
        privInfo.tier === 'max' ? 'won'
        : privInfo.tier === 'elevated' || privInfo.tier === 'unknown' ? 'unknown'
        : 'lost';
    const wonCount = [rowState(defense.av), rowState(defense.fw), privState].filter(v => v === 'won').length;

    const plateTone: PlateTone = alive === false ? 'fail' : alive === true ? 'accent' : 'signal';
    const verdict = alive === false ? 'LINK DOWN'
        : alive === true ? 'ACCESS ESTABLISHED'
        : node.type === 'core' ? 'MINERVA CORE'
        : 'STATIC RECORD';

    const traceId = `0x${String(node.id).replace(/\D/g, '').slice(-6).padStart(6, '0')}`;
    const swLine = `SW LINE ${String(cb?.display_id ?? 0).padStart(4, '0')}.${String(cb?.pid ?? 0).padStart(6, '0')}`;
    const loadLine = `LOAD ${(cb?.payload?.payloadtype?.name || 'STATIC').toUpperCase()} · ${traceId}`;

    return createPortal(
        <motion.div
            role="dialog"
            aria-label={`Node dossier — ${node.label}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: 16, transition: { duration: 0.16 } }}
            transition={{ duration: 0.28, ease: [0.22, 0.68, 0, 1] }}
            className={cn(
                // Docked to the right edge, vertically centred: it leaves the
                // scene's left side and the page chrome above it clear, and the
                // height cap keeps the footer — and EXIT — inside the viewport.
                'pointer-events-auto fixed right-5 top-1/2 z-[10000] -translate-y-1/2',
                'flex max-h-[min(600px,76vh)] w-[min(820px,92vw)] flex-col font-mono',
                'border border-signal/20 bg-void/90 backdrop-blur-md',
            )}
            onContextMenu={e => e.preventDefault()}
        >
            {/* Frame decorations — the reference implementation's corner rules */}
            <span aria-hidden="true" className="pointer-events-none absolute -left-px -top-px h-4 w-4 border-l-2 border-t-2 border-accent/70" />
            <span aria-hidden="true" className="pointer-events-none absolute -right-px -top-px h-4 w-4 border-r-2 border-t-2 border-accent/70" />
            <span aria-hidden="true" className="pointer-events-none absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-accent/70" />
            <span aria-hidden="true" className="pointer-events-none absolute -left-[3px] top-1/3 h-1.5 w-1.5 bg-accent/70" />

            {/* Only the plates scroll. The rail below is pinned, so EXIT is
                always on screen however long a machine's record runs. */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
                    {/* ══ LEFT — the machine ══ */}
                    <section className="flex min-w-0 flex-col">
                        <MetaRule tone={plateTone} title={node.label} left={swLine} right={loadLine} />

                        <ChamferBody tone={plateTone} className="bp-scale-x min-h-0" style={bpDelay(60)}>
                            <div className="max-h-[320px] overflow-y-auto px-3 py-2 custom-scrollbar">
                                {isCallback && cb ? (
                                    <>
                                        <Section label="IDENTITY" delayMs={80} />
                                        <Fact delayMs={100} label="HOST" value={(cb.host || node.label || '—').toUpperCase()} />
                                        <Fact delayMs={120} label="DOMAIN" value={(cb.domain || 'WORKGROUP').toUpperCase()} />
                                        <Fact delayMs={140} label="USER" value={(cb.user || '—').toUpperCase()} tone={privInfo.tier === 'max' ? 'accent' : 'signal'} />
                                        <Fact
                                            delayMs={160}
                                            label={privInfo.unix ? 'PRIVILEGE' : 'INTEGRITY'}
                                            value={priv || '—'}
                                            tone={privInfo.tier === 'max' ? 'accent' : 'signal'}
                                        />

                                        <Section label="PLATFORM" delayMs={180} />
                                        <Fact delayMs={200} label="OS" value={getOSFullLabel(cb).toUpperCase()} />
                                        <Fact delayMs={220} label="ARCH" value={(cb.architecture || '—').toUpperCase()} />
                                        <Fact delayMs={240} label="PROCESS" value={`${cb.pid ?? '—'}${cb.process_short_name || cb.process_name ? ` · ${String(cb.process_short_name || cb.process_name).toUpperCase()}` : ''}`} />

                                        <Section label="NETWORK" delayMs={260} />
                                        <Fact delayMs={280} label="ADDRESS" value={extractPrimaryIP(cb.ip) || '—'} tone="accent" />
                                        <Fact delayMs={300} label="INTERFACES" value={String(ips.length || 0).padStart(2, '0')} />
                                        {node.subnet && <Fact delayMs={320} label="SPACE" value={node.subnet} tone="accent" />}

                                        <Section label="LINK" delayMs={340} />
                                        <Fact delayMs={360} label="AGENT" value={(cb.payload?.payloadtype?.name || '—').toUpperCase()} />
                                        <Fact delayMs={380} label="SLEEP" value={(cb.sleep_info || '—').toUpperCase()} />
                                        <Fact
                                            delayMs={400}
                                            leader
                                            label="CHECKIN"
                                            value={cb.last_checkin ? timeAgo(cb.last_checkin).toUpperCase() : 'NEVER'}
                                            tone={alive ? 'accent' : 'fail'}
                                        />
                                        <Fact delayMs={420} leader label="STATE" value={alive ? 'LIVE' : 'DEAD'} tone={alive ? 'accent' : 'fail'} />
                                        {cb.description && (
                                            <>
                                                <Section label="NOTE" delayMs={440} />
                                                <div className="bp-blink text-[11px] leading-[1.5] text-signal" style={bpDelay(460)}>
                                                    {cb.description}
                                                </div>
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <Section label="IDENTITY" delayMs={80} />
                                        <Fact delayMs={100} label="HOST" value={(cb?.hostname || node.label || '—').toUpperCase()} />
                                        <Fact delayMs={120} label="ADDRESS" value={cb?.ip_address || '—'} tone="accent" />
                                        <Section label="PLATFORM" delayMs={140} />
                                        <Fact delayMs={160} label="OS" value={(cb?.operating_system || '—').toUpperCase()} />
                                        <Fact delayMs={180} label="C2" value={(cb?.c2profile || '—').toUpperCase()} />
                                        <Fact delayMs={200} leader label="RECORD" value={node.type.toUpperCase()} />
                                    </>
                                )}
                            </div>
                        </ChamferBody>

                        <MetaRule tone={plateTone} left={swLine} right={cb?.last_checkin ? `SEEN ${timeAgo(cb.last_checkin).toUpperCase()}` : 'NO CHECKIN'} delayMs={220} />

                        <div
                            className={cn('bp-scale-y mt-1.5 flex items-center justify-between gap-3 px-4 py-3', PLATE_FILL[plateTone])}
                            style={{ clipPath: BODY_CHAMFER, ...bpDelay(240) }}
                        >
                            <span className="text-[14px] font-bold tracking-[0.22em]">{verdict}</span>
                            <ChipGlyph className="border-void/45 text-void" />
                        </div>
                    </section>

                    {/* ══ RIGHT — the defence matrix ══ */}
                    <section className="flex min-w-0 flex-col">
                        <MetaRule tone="signal" title="DEFENCE MATRIX" left={swLine} right={`${wonCount} / 3 SECURED`} delayMs={80} />

                        <ChamferBody tone="signal" className="bp-scale-x flex-1" style={bpDelay(140)}>
                            <div className="flex h-full flex-col">
                                <div className="px-3 py-2.5">
                                    <div className="bp-blink text-[12px] font-bold tracking-[0.12em] text-signal" style={bpDelay(160)}>
                                        SESSIONS ON HOST:
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        {sessions.slice(0, 6).map((s, i) => (
                                            <CodeSlot
                                                key={String(s.display_id ?? s.id)}
                                                text={s.display_id != null ? `C-${s.display_id}` : '--'}
                                                delayMs={180 + i * 60}
                                            />
                                        ))}
                                        {sessions.length < 3 && Array.from({ length: 3 - sessions.length }).map((_, i) => (
                                            <CodeSlot key={`empty-${i}`} tone="empty" delayMs={180 + (sessions.length + i) * 60} />
                                        ))}
                                        {sessions.length > 6 && (
                                            <span className="text-[10px] font-bold tracking-[0.12em] tabular-nums text-signal/70">
                                                +{sessions.length - 6}
                                            </span>
                                        )}
                                        <HexGlyph lines={[traceId.toUpperCase(), swLine.replace('SW LINE ', ''), String(ips.length).padStart(4, '0')]} />
                                    </div>
                                </div>

                                <div aria-hidden="true" className="h-px bg-signal/45" />

                                <div className="space-y-2 p-2.5">
                                    <BreachRow
                                        delayMs={220}
                                        state={rowState(defense.av)}
                                        badge={defense.av === 'bypassed' ? 'BYPASSED' : defense.av === 'active' ? 'ACTIVE' : 'UNKNOWN'}
                                        title="ANTI-VIRUS / EDR"
                                        detail={
                                            defense.av === 'bypassed' ? 'Endpoint protection neutralised'
                                            : defense.av === 'active' ? 'Endpoint protection still running'
                                            : 'Not assessed — click to mark'
                                        }
                                        icon={defense.av === 'bypassed' ? ShieldOff : Shield}
                                        hint="Click to cycle: UNKNOWN → BYPASSED → ACTIVE"
                                        onClick={cycleAv}
                                    />
                                    <BreachRow
                                        delayMs={260}
                                        state={rowState(defense.fw)}
                                        badge={defense.fw === 'bypassed' ? 'DISABLED' : defense.fw === 'active' ? 'ACTIVE' : 'UNKNOWN'}
                                        title="FIREWALL"
                                        detail={
                                            defense.fw === 'bypassed' ? 'Host firewall down or holed'
                                            : defense.fw === 'active' ? 'Host firewall still filtering'
                                            : 'Not assessed — click to mark'
                                        }
                                        icon={Flame}
                                        hint="Click to cycle: UNKNOWN → DISABLED → ACTIVE"
                                        onClick={cycleFw}
                                    />
                                    <BreachRow
                                        delayMs={300}
                                        state={privState}
                                        badge={priv || 'UNKNOWN'}
                                        title="PRIVILEGE"
                                        detail={
                                            privInfo.tier === 'max'
                                                ? (privInfo.unix ? 'Running as root — full control' : 'Running as SYSTEM — full control')
                                            : privInfo.tier === 'elevated' ? 'Elevated admin, but not SYSTEM'
                                            : privInfo.tier === 'unknown' ? 'Privilege not reported by the agent'
                                            : (privInfo.unix ? 'Unprivileged — not root' : 'Unprivileged session')
                                        }
                                        icon={KeyRound}
                                        hint={privInfo.unix
                                            ? "Unix sessions are root or not — sudo membership is not reported"
                                            : "Derived from the session's integrity level"}
                                    />
                                </div>

                                <div className="mt-auto px-3 pb-2.5 text-[10px] leading-[1.6] tracking-[0.06em] text-signal/55">
                                    AV/EDR AND FIREWALL ARE OPERATOR MARKS — MYTHIC REPORTS NEITHER.
                                    <br />
                                    PRIVILEGE IS DERIVED FROM THE SESSION&rsquo;S INTEGRITY LEVEL.
                                </div>
                            </div>
                        </ChamferBody>
                    </section>
                </div>
            </div>

            {/* ── Bottom rail — pinned, so EXIT is always reachable ── */}
            <div className="bp-blink flex shrink-0 items-center gap-3 border-t border-signal/15 px-3 py-2" style={bpDelay(340)}>
                <div className="hidden text-[9px] leading-[1.5] tracking-[0.1em] tabular-nums text-signal/35 sm:block">
                    <div>{extractPrimaryIP(cb?.ip) || '0.0.0.0'} · {String(cb?.pid ?? 0).padStart(6, '0')}</div>
                    <div>PROTOCOL {(cb?.payload?.payloadtype?.name || 'NONE').toUpperCase()}-{String(cb?.display_id ?? 0).padStart(4, '0')}</div>
                </div>
                <span aria-hidden="true" className="flex-1" />
                <span className="hidden text-[9px] font-bold tracking-[0.2em] text-signal/45 md:block">ESC · EXIT</span>
                <button
                    ref={exitRef}
                    type="button"
                    onClick={onClose}
                    style={{ clipPath: BUTTON_NOTCH }}
                    className={cn(
                        'flex min-h-[36px] cursor-pointer items-center gap-2 border px-7',
                        'text-[11px] font-bold tracking-[0.28em] transition-colors duration-150',
                        'border-signal/50 text-signal hover:border-accent hover:bg-accent hover:text-void',
                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
                    )}
                >
                    <X size={12} strokeWidth={2} aria-hidden="true" />
                    EXIT INTERFACE
                </button>
            </div>
        </motion.div>,
        document.body,
    );
};
