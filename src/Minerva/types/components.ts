// ═══════════════════════════════════════════════
//  Shared component prop types
// ═══════════════════════════════════════════════

import type React from 'react';
import type { Callback } from './callbacks';
import type { Task } from './tasks';
import type { FilterOptions, CallbackToken } from './console';

// ───────── Console Components ─────────

/** Props for the ConsoleTerminal component */
export interface ConsoleTerminalProps {
    callbackId: number;
    callbackDisplayId: number;
    callbackHost: string;
    callbackOs: string;
    callbackPayloadType: string;
    callbackUser: string;
    callbackDomain: string;
    callbackIp: string;
    callbackActive: boolean;
    callbackDead: boolean;
    callbackSleepInfo: string;
    callbackIntegrityLevel: number;
    allCallbacks?: Callback[];
}

/** Props for the TaskBlock component */
export interface TaskBlockProps {
    task: Task;
    callbackHost: string;
    onFileAction?: (action: string, path: string) => void;
    scrollRoot?: React.RefObject<HTMLDivElement>;
    onReveal?: (taskId: number) => void;
    myUsername?: string;
    collapseAllEpoch?: number;
    expandAllEpoch?: number;
    defaultCollapsed?: boolean;
}

/** Props for the InteractiveTaskBlock component */
export interface InteractiveTaskBlockProps {
    taskId: number;
    task: Task;
    liveResponses: string[];
    callbackDisplayId: number;
    commandName: string;
    myUsername: string;
}

/** Props for the InfoPanel component */
export interface InfoPanelProps {
    callback: Callback;
    allCallbacks: Callback[];
}

/** Props for the FileBrowserPanel component */
export interface FileBrowserPanelProps {
    host: string;
    callbackId: number;
    onFileAction?: (action: string, path: string) => void;
}

/** Props for the ProcessList component */
export interface ProcessListProps {
    host: string;
}

// ───────── Callback Components ─────────

/** Props for the DetailedCallbackModal component */
export interface DetailedCallbackModalProps {
    callbackId: number;
    onClose: () => void;
}

/** Props for C2PathDialog component */
export interface C2PathDialogProps {
    callbackId: number;
    displayId: number;
    onClose: () => void;
}

/** Props for the CallbackColorPickerModal */
export interface CallbackColorPickerModalProps {
    callback: Callback;
    onClose: () => void;
    onSave: (newColor: string) => void;
}

// ───────── Topology Components ─────────

/** Props for the DetailPanel component */
export interface TopologyDetailPanelProps {
    node: import('./topology').TopoNode | null;
    onClose: () => void;
}

// ───────── Payload Components ─────────

/** Props for the PayloadRow component */
export interface PayloadRowProps {
    payload: import('./payloads').Payload;
    isExpanded: boolean;
    onToggle: () => void;
    onDelete: (id: number) => void;
    onRebuild: (id: number) => void;
    isCombat?: boolean;
}

// ───────── Generic / Shared ─────────

/** Props for a generic modal overlay */
export interface ModalProps {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}

/** Props for a confirmation dialog */
export interface ConfirmDialogProps {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    isDestructive?: boolean;
}

/** Info row display (used in multiple panels) */
export interface InfoRowProps {
    label: string;
    value: React.ReactNode;
    icon?: React.ComponentType<{ size?: number; className?: string }>;
    mono?: boolean;
    color?: string;
    accent?: string;
    valueClass?: string;
    highlight?: boolean;
}
