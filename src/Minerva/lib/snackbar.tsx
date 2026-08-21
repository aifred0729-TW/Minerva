// ═══════════════════════════════════════════════════════════════════
//  Snackbar / toast utilities (Minerva-native)
//
//  Replaces the old Snackbar.js from components/utilities.
//
//  The snooze dropdown used to be a plain MUI Menu. Every module in the app
//  imports `snackActions` from here, so this file is eager — and those four
//  MUI imports put @mui/material + @mui/system + @mui/utils + @emotion +
//  stylis (167 modules, ~740 KB of the entry bundle) on the critical path of
//  the login screen, for one dropdown on a toast close button. It is now a
//  portalled Tailwind menu in the house style.
// ═══════════════════════════════════════════════════════════════════
import React from 'react';
import { toast, type ToastOptions, type ToastContent } from 'react-toastify';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, AlertTriangle, Info, Loader2, AlarmClock, BellOff, ChevronDown, Moon } from 'lucide-react';
import { getSkewedNow } from './time';
import { playNotification } from './soundEffects';

// ── Do-Not-Disturb helper ──────────────────────────────────────────
interface DndState {
    doNotDisturb: boolean;
    doNotDisturbTimeStart: string;
    doNotDisturbMinutes?: number;
}

const DND_KEY = 'dnd';

function stillDoNotDisturb(): boolean {
    let raw = localStorage.getItem(DND_KEY);
    if (raw === null) {
        localStorage.setItem(DND_KEY, JSON.stringify({
            doNotDisturb: false,
            doNotDisturbTimeStart: new Date().toISOString(),
        }));
        return false;
    }
    try {
        const data: DndState = JSON.parse(raw);
        if (!data.doNotDisturb) return false;

        const diff = Math.abs(Date.now() - new Date(data.doNotDisturbTimeStart).getTime());
        if (diff < (data.doNotDisturbMinutes ?? 0) * 60 * 1000) {
            return true; // still snoozed
        }
        localStorage.setItem(DND_KEY, JSON.stringify({
            doNotDisturb: false,
            doNotDisturbTimeStart: new Date().toISOString(),
        }));
        return false;
    } catch {
        return false;
    }
}

function dndWithTime(minutes: number): void {
    localStorage.setItem(DND_KEY, JSON.stringify({
        doNotDisturb: true,
        doNotDisturbTimeStart: getSkewedNow().toISOString(),
        doNotDisturbMinutes: minutes,
    }));
    snackActions.clearAll();
}

// ── Cyber-toast renderer ───────────────────────────────────────────
type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

const TYPE_CONFIG: Record<ToastType, { label: string; Icon: React.ComponentType<any>; color: string }> = {
    success: { label: 'OK', Icon: CheckCircle2, color: '#4ade80' },
    error: { label: 'ERROR', Icon: XCircle, color: '#ef4444' },
    warning: { label: 'WARN', Icon: AlertTriangle, color: '#eab308' },
    info: { label: 'INFO', Icon: Info, color: '#3b82f6' },
    loading: { label: 'WAIT', Icon: Loader2, color: '#a3a3a3' },
};

const CyberToast = ({ msg, type }: { msg: React.ReactNode; type: ToastType }) => {
    const cfg = TYPE_CONFIG[type] ?? { label: 'MSG', Icon: Info, color: '#a3a3a3' };
    const { label, Icon, color } = cfg;
    return (
        <div style= {{ width: '100%' }
}>
    <span className="cyber-toast-label" style = {{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
        <Icon size={ 13 } color = { color } strokeWidth = { 2.5} style = {{ flexShrink: 0 }} />
{ label }
</span>
    < div className = "cyber-toast-message" > { msg } </div>
        </div>
    );
};

// ── CloseButton with snooze dropdown ───────────────────────────────
// NOTE: currently unreachable. App.tsx's <ToastContainer closeButton={false}>
// means this never mounts, and it is the only writer of the `dnd` key that
// snackActions.info/.warning read — so Do-Not-Disturb can be read but never
// set. Left in place (and de-MUI'd) rather than deleted, because wiring it up
// or dropping the feature is a product call, not a performance one.
const SNOOZE_OPTIONS: { label: string; minutes: number; long?: boolean }[] = [
    { label: '5 MIN', minutes: 5 },
    { label: '30 MIN', minutes: 30 },
    { label: '1 HR', minutes: 60 },
    { label: '4 HR', minutes: 60 * 4 },
    { label: '24 HR', minutes: 60 * 24, long: true },
];

export const CloseButton = ({ closeToast }: { closeToast?: () => void }) => {
    const anchorRef = React.useRef<HTMLButtonElement | null>(null);
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [menuPos, setMenuPos] = React.useState<{ top: number; left: number } | null>(null);
    const [dnd] = React.useState(() => stillDoNotDisturb());

    // Toasts live in a fixed, overflow-clipped container, so the menu is
    // portalled to <body> and positioned from the button's own rect — the one
    // thing MUI's Menu was actually doing here.
    React.useEffect(() => {
        if (!menuOpen) { setMenuPos(null); return; }
        const rect = anchorRef.current?.getBoundingClientRect();
        if (rect) setMenuPos({ top: rect.bottom + 4, left: rect.left });
        const close = () => setMenuOpen(false);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [menuOpen]);

    if (dnd) {
        return (
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-signal">
                <AlarmClock size={12} strokeWidth={2} className="shrink-0" />
                <span>Snoozed</span>
            </div>
        );
    }

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                title="Snooze Info and Warning messages for a period of time. Revert this at any time in your settings"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuOpen((prev) => !prev);
                }}
                className="float-right flex items-center gap-0.5 rounded-md border border-signal/20 px-1.5 py-1 text-signal transition-colors hover:border-signal/40 hover:bg-signal/10">
                <BellOff size={12} strokeWidth={2} className="shrink-0" />
                <ChevronDown size={11} strokeWidth={2} className="shrink-0" />
            </button>
            {menuOpen && menuPos && createPortal(
                <>
                    <div className="fixed inset-0 z-[100000]" onClick={() => setMenuOpen(false)} />
                    <div
                        role="menu"
                        style={{ top: menuPos.top, left: menuPos.left }}
                        className="fixed z-[100001] min-w-[9rem] rounded-md border border-signal/20 bg-machine py-1 shadow-lg">
                        {SNOOZE_OPTIONS.map((opt) => (
                            <button
                                key={opt.label}
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    dndWithTime(opt.minutes);
                                    setMenuOpen(false);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[10px] uppercase tracking-wider text-signal transition-colors hover:bg-signal/10">
                                {opt.long
                                    ? <Moon size={11} strokeWidth={2} className="shrink-0" />
                                    : <AlarmClock size={11} strokeWidth={2} className="shrink-0" />}
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </>,
                document.body,
            )}
        </>
    );
};

// ── snackActions — public API ──────────────────────────────────────
export const snackActions = {
    success(msg: React.ReactNode, options?: ToastOptions) {
        if (document.hidden) return;
        playNotification();
        toast(<CyberToast msg={ msg } type = "success" />, { type: 'success', onClick: this.dismiss, ...options });
    },

    warning(msg: React.ReactNode, options?: ToastOptions) {
        if (document.hidden) return;
        if (stillDoNotDisturb()) return;
        playNotification();
        toast(<CyberToast msg={ msg } type = "warning" />, { type: 'warning', onClick: this.dismiss, ...options });
    },

    info(msg: React.ReactNode, options?: ToastOptions) {
        if (document.hidden) return;
        if (stillDoNotDisturb()) return;
        playNotification();
        toast(<CyberToast msg={ msg } type = "info" />, { type: 'info', onClick: this.dismiss, ...options });
    },

    error(msg: React.ReactNode, options?: ToastOptions) {
        if (document.hidden) return;
        playNotification();
        toast(<CyberToast msg={ msg } type = "error" />, { type: 'error', onClick: this.dismiss, ...options });
    },

    update(msg: React.ReactNode, toastID: string | number, options?: ToastOptions) {
        if (document.hidden) return;
        if (toast.isActive(toastID)) {
            toast.update(toastID, { ...options, render: msg as ToastContent });
        }
    },

    loading(msg: React.ReactNode, options?: ToastOptions) {
        if (document.hidden) return;
        toast.loading(msg, { ...options });
    },

    dismiss() {
        toast.dismiss();
        toast.clearWaitingQueue();
    },

    clearAll() {
        toast.dismiss();
        toast.clearWaitingQueue();
    },
};
