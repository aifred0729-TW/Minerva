// ═══════════════════════════════════════════════════════════════════
//  Snackbar / toast utilities (Minerva-native)
//
//  Replaces the old Snackbar.js from components/utilities.
//  Removes dependencies on MythicNestedMenus & MythicStyledTooltip
//  by using plain MUI Menu for the snooze dropdown.
// ═══════════════════════════════════════════════════════════════════
import React from 'react';
import { toast, type ToastOptions, type ToastContent } from 'react-toastify';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import NotificationsPausedIcon from '@mui/icons-material/NotificationsPaused';
import AlarmIcon from '@mui/icons-material/Alarm';
import SnoozeIcon from '@mui/icons-material/Snooze';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { CheckCircle2, XCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';
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
    success: { label: 'OK', Icon: CheckCircle2, color: '#22c55e' },
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
export const CloseButton = ({ closeToast }: { closeToast?: () => void }) => {
    const anchorRef = React.useRef<HTMLDivElement | null>(null);
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [dnd] = React.useState(() => stillDoNotDisturb());

    const snoozeOptions = [
        { label: '5min', icon: <AlarmIcon />,  minutes: 5 },
        { label: '30min', icon: <AlarmIcon />,  minutes: 30 },
        { label: '1hr', icon: <AlarmIcon />,  minutes: 60 },
        { label: '4hr', icon: <AlarmIcon />,  minutes: 60 * 4 },
        { label: '24hr', icon: <SnoozeIcon />, minutes: 60 * 24 },
    ];

    if (dnd) {
        return (
            <div style= {{ display: 'flex', alignItems: 'center', gap: 4 }
    }>
        <AlarmIcon color="warning" fontSize = "small" />
            <span style={ { fontSize: 12 } }> Snoozed </span>
                </div>
        );
    }

return (
    <div>
    <ButtonGroup ref= { anchorRef } size = "small" style = {{ float: 'right', width: '70px' }}>
        <Button
                    size="small"
onClick = {(e) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
}}
title = "Snooze Info and Warning messages for a period of time. Revert this at any time in your settings"
    >
    <NotificationsPausedIcon color="error" fontSize = "small" />
        <ArrowDropDownIcon fontSize="small" />
            </Button>
            </ButtonGroup>
            < Menu
anchorEl = { anchorRef.current }
open = { menuOpen }
onClose = {() => setMenuOpen(false)}
anchorOrigin = {{ vertical: 'bottom', horizontal: 'left' }}
transformOrigin = {{ vertical: 'top', horizontal: 'left' }}
style = {{ zIndex: 100000 }}
            >
{
    snoozeOptions.map((opt) => (
        <MenuItem
                        key= { opt.label }
                        onClick = {(e) => {
        e.stopPropagation();
        dndWithTime(opt.minutes);
    setMenuOpen(false);
}}
                    >
    <span style={ { display: 'flex', alignItems: 'center', gap: 4 } }>
        { opt.icon } { opt.label }
</span>
    </MenuItem>
                ))}
</Menu>
    </div>
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
