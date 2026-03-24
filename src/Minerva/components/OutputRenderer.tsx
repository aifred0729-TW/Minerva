/**
 * OutputRenderer — Minerva shared output-rendering library
 *
 * Provides panel-style structured rendering for all Mythic agent responses.
 * Import and use in any page that needs to display task output.
 *
 * Public API:
 *   b64Decode(s)          — robust base64 → string (UTF-8 aware)
 *   ParsedOutput          — auto-detects JSON shape → structured panels
 *   RawOutput             — exact decoded bytes in a terminal <pre>
 *   OutputModeToggle      — [PARSED] [RAW] pill toggle
 *   OutputPanel           — generic labelled panel wrapper (re-exported for custom panels)
 *   MythicTable           — Mythic browser-script table
 *   TerminalPanel         — plain-text / error terminal block
 *   ProcessPanel          — process_list[] specialist view
 *   FilesPanel            — files[] / file_browser specialist view
 *   ScreenshotPanel       — screenshot[] images
 *   DownloadPanel         — download[] file cards
 *   JsonPanel             — generic JSON key-value grid
 */
import React, { useMemo, useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { Terminal, Database, FileText, ExternalLink, Layers, Hash, X, ChevronRight, Wifi, Activity, Network, Folder, Copy, Lock, Code, ChevronDown, Plus, Check, RotateCcw, FolderOpen, Archive, Box, Settings, Key, Image, List, Trash2, Syringe, Skull, Camera, Download, Upload, ArrowUp, ArrowDown, Filter, MoreHorizontal, Clipboard, ChevronUp, Search, Menu, ChevronLeft, WrapText, Eye, Maximize2, Minimize2, Monitor, Smartphone, Tablet, Server, User as UserIcon, Users as Users2, Globe, Fingerprint, Share2, Bluetooth, Cloud as CloudIcon, Shield as ShieldIcon, HardDrive, AlertTriangle, Bug, BadgeCheck, Star, Play, Palette } from 'lucide-react';
import Anser from 'anser';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/mode-csharp';
import 'ace-builds/src-noconflict/mode-golang';
import 'ace-builds/src-noconflict/mode-html';
import 'ace-builds/src-noconflict/mode-markdown';
import 'ace-builds/src-noconflict/mode-ruby';
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/mode-java';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/mode-toml';
import 'ace-builds/src-noconflict/mode-swift';
import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/mode-rust';
import 'ace-builds/src-noconflict/mode-powershell';
import 'ace-builds/src-noconflict/mode-pgsql';
import 'ace-builds/src-noconflict/mode-perl';
import 'ace-builds/src-noconflict/mode-php';
import 'ace-builds/src-noconflict/mode-objectivec';
import 'ace-builds/src-noconflict/mode-nginx';
import 'ace-builds/src-noconflict/mode-makefile';
import 'ace-builds/src-noconflict/mode-kotlin';
import 'ace-builds/src-noconflict/mode-dockerfile';
import 'ace-builds/src-noconflict/mode-sh';
import 'ace-builds/src-noconflict/mode-ini';
import 'ace-builds/src-noconflict/mode-apache_conf';
import 'ace-builds/src-noconflict/mode-plain_text';
import 'ace-builds/src-noconflict/theme-monokai';
import { TaskFromUIButton } from '../../components/pages/Callbacks/TaskFromUIButton';
import {
    ReactFlow, Background, ReactFlowProvider,
    Handle, Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ─── Utility helpers ──────────────────────────────────────────────────────────
const fmtBytes = (n: number): string => {
    if (!n && n !== 0) return '';
    if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)}G`;
    if (n >= 1_048_576)     return `${(n / 1_048_576).toFixed(1)}M`;
    if (n >= 1024)          return `${(n / 1024).toFixed(1)}K`;
    return `${n}B`;
};
const fmtUnixTime = (ts: number | undefined): string => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return d.toLocaleString();
};
const tryParseJSON = (s: string): any => {
    try { return JSON.parse(s); } catch { return null; }
};

// ─── Utility ─────────────────────────────────────────────────────────────────

/** Robust base64 decode that handles UTF-8 / multi-byte characters correctly */
export const b64Decode = (s: string): string => {
    if (!s) return '';
    try {
        const text  = window.atob(s);
        const bytes = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    } catch {
        try { return decodeURIComponent(window.atob(s)); } catch {
            try { return window.atob(s); } catch { return s; }
        }
    }
};

// ─── Mythic response data types ───────────────────────────────────────────────

export interface MythicCell {
    plaintext?: string;
    button?: { name?: string; [k: string]: any };
    [k: string]: any;
}

export interface MythicTableRow {
    [header: string]: MythicCell | string | number | boolean | null | undefined;
}

export interface MythicTableDef {
    title?: string;
    headers: (string | { plaintext: string; [k: string]: any })[];
    rows: MythicTableRow[];
}

export interface MythicScreenshot {
    agent_file_id: string;
    plaintext?: string;
}

export interface MythicDownload {
    agent_file_id: string;
    name?: string;
    plaintext?: string;
}

export interface MythicBrowserScriptData {
    plaintext?: string;
    table?: MythicTableDef[];
    screenshot?: MythicScreenshot[];
    download?: MythicDownload[];
    process_list?: any[];
    files?: any[];
    file_browser?: { files?: any[] };
    [k: string]: any;
}

// ─── Decoded response entry (from subscription or task.responses) ─────────────

export interface DecodedResponse {
    id: number;
    text: string;
    is_error?: boolean;
    timestamp?: string;
}

/** Decode raw GraphQL response rows into DecodedResponse[] */
export const decodeResponses = (raw: any[]): DecodedResponse[] =>
    raw.map(r => ({ ...r, text: b64Decode(r.response ?? '') }));

// ─── Shared design tokens ─────────────────────────────────────────────────────

const ACCENT   = '#00ffd1';
const ERR      = '#ff5555';
const PURPLE   = '#aa66ff';
const AMBER    = '#ffaa44';
const MONO     = "'Cascadia Code','Fira Code','JetBrains Mono',monospace";

const ARCH_COLOR: Record<string, string> = {
    x64: '#6888ff', x86: '#ff8866', arm64: '#aa66ff', arm: '#ff66aa',
};

// ─── Callback ID context (for task-type buttons) ────────────────────────────

export const OutputCallbackContext = createContext<number | null>(null);

// ─── Icon mapping (FA icon names → Lucide components) ────────────────────────

const ICON_MAP: Record<string, React.ComponentType<any>> = {
    add: Plus, plus: Plus,
    x: X, close: X,
    check: Check,
    refresh: RotateCcw,
    openfolder: FolderOpen, folder: FolderOpen,
    closedfolder: Folder,
    archive: Archive, zip: Archive,
    diskimage: Box,
    executable: Settings, cog: Settings,
    word: FileText, excel: FileText, powerpoint: FileText,
    pdf: FileText, adobe: FileText,
    database: Database,
    key: Key,
    code: Code, source: Code,
    download: Download,
    upload: Upload,
    png: Image, jpg: Image, image: Image,
    list: List,
    delete: Trash2,
    inject: Syringe,
    kill: Skull,
    camera: Camera,
    copy: Copy,
    search: Search,
    menu: Menu,
    // #11 — OldReactUI device/entity icon set (mapped to closest Lucide equivalents)
    laptop: Monitor, desktop: Monitor, computer: Monitor,
    phone: Smartphone, tablet: Tablet,
    vm: Server, container: Server,
    account: UserIcon, user: UserIcon, group: Users2,
    language: Globe, lock: Lock, fingerprint: Fingerprint,
    share: Share2, wifi: Wifi, bluetooth: Bluetooth,
    cloud: CloudIcon, vpn: ShieldIcon, sdcard: HardDrive,
    warning: AlertTriangle, bug: Bug, shield: ShieldIcon,
    verified: BadgeCheck, star: Star,
};

export function getIconComponent(name?: string, size = 12): React.ReactNode {
    if (!name) return null;
    const Comp = ICON_MAP[name.toLowerCase()];
    if (Comp) return <Comp size={size}/>;
    // fallback: render the name as text
    return <span className="font-mono text-[9px]" style={{ opacity: 0.5 }}>{name}</span>;
}

export function getIconColor(color?: string): string {
    if (!color) return '#888';
    switch (color.toLowerCase()) {
        case 'info': return '#60a5fa';
        case 'warning': return '#fbbf24';
        case 'primary': return ACCENT;
        case 'error': return '#ef4444';
        case 'success': return '#4ade80';
        case 'secondary': return '#a78bfa';
        default: return color;
    }
}

// ─── Size formatting for "size" cell type ────────────────────────────────────

function formatCellSize(plaintext: string): string {
    try {
        const bytes = parseInt(plaintext, 10);
        if (plaintext === '') return '';
        if (bytes === 0) return '0 Bytes';
        if (isNaN(bytes)) return plaintext;
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    } catch { return plaintext || ''; }
}

// ─── OutputPanel ─────────────────────────────────────────────────────────────

export interface OutputPanelProps {
    icon: React.ReactNode;
    label: string;
    accent?: string;
    count?: number;
    toolbar?: React.ReactNode;
    children: React.ReactNode;
}

/** Generic labelled panel wrapper used by all section renderers */
export function OutputPanel({ icon, label, accent = ACCENT, count, toolbar, children }: OutputPanelProps) {
    return (
        <div className="mb-3 rounded-sm overflow-hidden"
            style={{ border: `1px solid ${accent}1a`, background: '#0a0a0a' }}>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b"
                style={{ borderColor: `${accent}18`, background: `${accent}09` }}>
                <span style={{ color: accent, opacity: 0.85 }}>{icon}</span>
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: accent, opacity: 0.8 }}>{label}</span>
                {count !== undefined && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm"
                        style={{ color: accent, background: `${accent}18` }}>{count}</span>
                )}
                {toolbar && <div className="ml-auto">{toolbar}</div>}
                {!toolbar && count !== undefined && <span className="ml-auto"/>}
            </div>
            <div className="px-3 py-2.5">{children}</div>
        </div>
    );
}

// ─── CellButton — clickable button cell with type-aware rendering ─────────────

function CellButton({ cell }: { cell: any }) {
    const btn = cell.button || {};
    const label = btn.name || cell.plaintext || 'View';
    const value = btn.value;
    const buttonType = (btn.type || 'dictionary').toLowerCase();
    const isDisabled = btn.disabled || false;
    const callbackId = useContext(OutputCallbackContext);

    // For task type → use TaskButton
    if (buttonType === 'task') {
        return <TaskButton btn={btn} label={label} callbackId={callbackId} isDisabled={isDisabled}/>;
    }

    // For menu type → use MenuButton
    if (buttonType === 'menu') {
        return <MenuButton btn={btn} label={label} callbackId={callbackId} isDisabled={isDisabled}/>;
    }

    // For string/dictionary/table → modal display
    return <ModalButton btn={btn} label={label} value={value} buttonType={buttonType} isDisabled={isDisabled}/>;
}

/** Task button — triggers full TaskFromUIButton flow with dialogs */
function TaskButton({ btn, label, callbackId, isDisabled }: {
    btn: any; label: string; callbackId: number | null; isDisabled: boolean;
}) {
    const [active, setActive] = useState(false);

    return (
        <>
            <button
                onClick={() => { if (callbackId && !isDisabled) setActive(true); }}
                disabled={isDisabled || active || !callbackId}
                className="font-mono text-[10px] px-2 py-0.5 rounded-sm border transition-colors hover:opacity-80 cursor-pointer flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: '#fbbf2440', color: '#fbbf24', background: '#fbbf240a' }}
                title={btn.hoverText || 'Submit Task'}>
                {btn.startIcon && (
                    <span style={{ color: getIconColor(btn.startIconColor) }}>
                        {getIconComponent(btn.startIcon, 10)}
                    </span>
                )}
                {active ? '…' : label || 'Task'}
            </button>
            {active && callbackId && (
                <TaskFromUIButton
                    callback_id={callbackId}
                    ui_feature={btn.ui_feature || ''}
                    parameters={btn.parameters}
                    openDialog={btn.openDialog || false}
                    getConfirmation={btn.getConfirmation || false}
                    onTasked={() => setActive(false)}
                    dontShowSuccessDialog={true}
                />
            )}
        </>
    );
}

/** Menu button — dropdown menu with sub-items, each can be task/dictionary/string/table */
function MenuButton({ btn, label, callbackId, isDisabled }: {
    btn: any; label: string; callbackId: number | null; isDisabled: boolean;
}) {
    const [dropOpen, setDropOpen] = useState(false);
    const [subModal, setSubModal] = useState<{ item: any } | null>(null);
    const [activeTaskItem, setActiveTaskItem] = useState<any>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        if (!dropOpen) return;
        const handle = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setDropOpen(false);
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, [dropOpen]);

    const menuItems: any[] = Array.isArray(btn.value) ? btn.value : [];

    const handleItemClick = useCallback((item: any) => {
        setDropOpen(false);
        const itemType = (item.type || 'dictionary').toLowerCase();
        if (itemType === 'task') {
            setActiveTaskItem(item);
        } else {
            setSubModal({ item });
        }
    }, []);

    return (
        <div className="relative inline-block" ref={menuRef}>
            <button
                onClick={() => setDropOpen(!dropOpen)}
                disabled={isDisabled}
                className="font-mono text-[10px] px-2 py-0.5 rounded-sm border transition-colors hover:opacity-80 cursor-pointer flex items-center gap-1 disabled:opacity-40"
                style={{ borderColor: '#ffffff20', color: '#ccc', background: '#ffffff08' }}>
                {btn.startIcon && (
                    <span style={{ color: getIconColor(btn.startIconColor) }}>
                        {getIconComponent(btn.startIcon, 10)}
                    </span>
                )}
                {label}
                <ChevronDown size={9}/>
            </button>
            {dropOpen && menuItems.length > 0 && (
                <div className="absolute z-[9999] left-0 top-full mt-1 min-w-[160px] max-h-[260px] overflow-y-auto shadow-2xl border rounded-sm"
                    style={{ background: '#0d0d0d', borderColor: '#ffffff20' }}>
                    {menuItems.map((item: any, i: number) => (
                        <button key={i}
                            onClick={() => handleItemClick(item)}
                            disabled={item.disabled}
                            className="w-full text-left px-3 py-1.5 text-[10px] font-mono flex items-center gap-1.5 transition-colors hover:bg-white/5 disabled:opacity-30"
                            style={{ color: item.type === 'task' ? '#fbbf24' : '#ccc' }}
                            title={item.hoverText || ''}>
                            {item.startIcon && (
                                <span style={{ color: getIconColor(item.startIconColor) }}>
                                    {getIconComponent(item.startIcon, 10)}
                                </span>
                            )}
                            {item.name || `Item ${i + 1}`}
                        </button>
                    ))}
                </div>
            )}
            {/* Sub-modal for dictionary/string/table sub-items */}
            {subModal && (
                <CellModal
                    title={subModal.item.title || subModal.item.name || 'Details'}
                    value={subModal.item.value}
                    buttonType={(subModal.item.type || 'dictionary').toLowerCase()}
                    onClose={() => setSubModal(null)}
                />
            )}
            {/* TaskFromUIButton for menu task items */}
            {activeTaskItem && callbackId && (
                <TaskFromUIButton
                    callback_id={callbackId}
                    ui_feature={activeTaskItem.ui_feature || ''}
                    parameters={activeTaskItem.parameters}
                    openDialog={activeTaskItem.openDialog || false}
                    getConfirmation={activeTaskItem.getConfirmation || false}
                    onTasked={() => setActiveTaskItem(null)}
                    dontShowSuccessDialog={true}
                />
            )}
        </div>
    );
}

/** Modal display for dictionary/string/table button types */
function ModalButton({ btn, label, value, buttonType, isDisabled }: {
    btn: any; label: string; value: any; buttonType: string; isDisabled: boolean;
}) {
    const [open, setOpen] = useState(false);
    const hasValue = value !== undefined && value !== null;

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open]);

    if (!hasValue && !isDisabled) {
        return (
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-sm border"
                style={{ borderColor: '#00ffd130', color: ACCENT, background: '#00ffd10a' }}>
                {label}
            </span>
        );
    }

    const btnColor = buttonType === 'task' ? '#fbbf24' : ACCENT;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                disabled={isDisabled}
                className="font-mono text-[10px] px-2 py-0.5 rounded-sm border transition-colors hover:opacity-80 cursor-pointer flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: `${btnColor}30`, color: btnColor, background: `${btnColor}0a` }}
                title={btn.hoverText || ''}>
                {btn.startIcon && (
                    <span style={{ color: getIconColor(btn.startIconColor) }}>
                        {getIconComponent(btn.startIcon, 10)}
                    </span>
                )}
                <ChevronRight size={9}/>
                {label}
            </button>
            {open && (
                <CellModal
                    title={btn.title || label}
                    leftColumn={btn.leftColumnTitle}
                    rightColumn={btn.rightColumnTitle}
                    value={value}
                    buttonType={buttonType}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}

/** Full-screen modal for viewing cell button data */
function CellModal({ title, value, buttonType, leftColumn, rightColumn, onClose }: {
    title: string; value: any; buttonType: string; leftColumn?: string; rightColumn?: string; onClose: () => void;
}) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.72)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div
                className="flex flex-col rounded-sm overflow-hidden shadow-2xl"
                style={{
                    width: 'min(720px, 90vw)', maxHeight: '75vh',
                    background: '#0d0d0d',
                    border: `1px solid ${ACCENT}33`,
                }}>
                {/* header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
                    style={{ borderColor: `${ACCENT}22`, background: `${ACCENT}09` }}>
                    <div className="flex items-center gap-2">
                        <span style={{ width: 3, height: 14, background: ACCENT, display: 'inline-block', borderRadius: 1 }}/>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest"
                            style={{ color: ACCENT }}>{title}</span>
                    </div>
                    <button onClick={onClose}
                        className="text-gray-500 hover:text-white transition-colors p-0.5">
                        <X size={14}/>
                    </button>
                </div>
                {/* content */}
                <div className="flex-1 overflow-auto p-4" style={{ fontFamily: MONO }}>
                    {buttonType === 'string' ? (
                        <pre className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words"
                            style={{ color: '#d8d8d8' }}>{String(value ?? '')}</pre>
                    ) : buttonType === 'dictionary' ? (
                        <CellButtonContent value={value} leftColumn={leftColumn} rightColumn={rightColumn}/>
                    ) : (
                        <CellButtonContent value={value}/>
                    )}
                </div>
            </div>
        </div>
    );
}

function CellButtonContent({ value, leftColumn, rightColumn }: { value: any; leftColumn?: string; rightColumn?: string }) {
    // Array of objects → table
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
        const keys = [...new Set<string>(value.flatMap((r: any) => Object.keys(r)))];
        return (
            <div className="overflow-x-auto">
                <table className="text-[11px] border-collapse w-full font-mono">
                    <thead>
                        <tr style={{ background: '#00ffd10c' }}>
                            {keys.map(k => (
                                <th key={k}
                                    className="px-3 py-1.5 border-b text-left text-[10px] tracking-wider uppercase whitespace-nowrap"
                                    style={{ borderColor: '#00ffd122', color: '#00ffd1bb' }}>{k}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {value.map((row: any, ri: number) => (
                            <tr key={ri}
                                style={{ background: ri % 2 === 0 ? 'transparent' : '#ffffff03' }}
                                className="transition-colors hover:bg-[#00ffd10a]">
                                {keys.map(k => (
                                    <td key={k} className="px-3 py-1.5 border-b whitespace-pre-wrap break-words"
                                        style={{ borderColor: '#ffffff07', color: '#ccc' }}>
                                        {renderCell(row[k])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
    // Plain object → key-value grid (dictionary type)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return (
            <div className="grid gap-px" style={{ gridTemplateColumns: 'auto 1fr' }}>
                {leftColumn && rightColumn && (
                    <>
                        <div className="pr-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider border-b"
                            style={{ color: `${ACCENT}99`, borderColor: '#ffffff10' }}>{leftColumn}</div>
                        <div className="py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider border-b"
                            style={{ color: `${ACCENT}99`, borderColor: '#ffffff10' }}>{rightColumn}</div>
                    </>
                )}
                {Object.entries(value).map(([k, v]) => (
                    <React.Fragment key={k}>
                        <div className="pr-4 py-1 font-mono text-[11px] font-semibold whitespace-nowrap"
                            style={{ color: '#00ffd177' }}>{k}</div>
                        <div className="py-1 font-mono text-[11.5px] break-all" style={{ color: '#ccc' }}>
                            {v === null || v === undefined
                                ? <span style={{ color: '#444' }}>—</span>
                                : typeof v === 'object'
                                    ? <span style={{ color: '#555' }}>{JSON.stringify(v)}</span>
                                    : String(v)}
                        </div>
                    </React.Fragment>
                ))}
            </div>
        );
    }
    // Primitive / string
    return (
        <pre className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words"
            style={{ color: '#d8d8d8' }}>{String(value)}</pre>
    );
}

// ─── renderCell (used by MythicTable and exported for external custom tables) ──

export function renderCell(cell: any, headerType?: string): React.ReactNode {
    if (cell === null || cell === undefined) return <span style={{ color: '#444' }}>—</span>;
    if (typeof cell !== 'object') return String(cell);
    if (cell.button) return <CellButton cell={cell}/>;

    // "size" header type: convert bytes → human readable
    if (headerType === 'size') {
        return (
            <CellWrapper cell={cell}>
                {formatCellSize(String(cell.plaintext ?? ''))}
            </CellWrapper>
        );
    }

    // Cell with rich properties (startIcon, endIcon, copyIcon, cellStyle, plaintextHoverText)
    if (cell.startIcon || cell.endIcon || cell.copyIcon || cell.cellStyle || cell.plaintextHoverText) {
        return (
            <CellWrapper cell={cell}>
                {cell.plaintext !== undefined ? String(cell.plaintext) : JSON.stringify(cell)}
            </CellWrapper>
        );
    }

    return cell.plaintext !== undefined ? String(cell.plaintext) : JSON.stringify(cell);
}

/** Wraps cell content with startIcon, endIcon, copyIcon, cellStyle, plaintextHoverText */
function CellWrapper({ cell, children }: { cell: any; children: React.ReactNode }) {
    const onCopy = useCallback(() => {
        navigator.clipboard.writeText(String(cell.plaintext ?? ''));
    }, [cell.plaintext]);

    return (
        <span className="inline-flex items-center gap-1" style={cell.cellStyle || undefined}>
            {cell.copyIcon && (
                <button onClick={onCopy} className="p-0.5 rounded hover:bg-white/10 transition-colors shrink-0"
                    title="Copy to clipboard">
                    <Copy size={10} style={{ color: '#555' }}/>
                </button>
            )}
            {cell.startIcon && (
                <span title={cell.startIconHoverText || ''} className="shrink-0"
                    style={{ color: getIconColor(cell.startIconColor) }}>
                    {getIconComponent(cell.startIcon, 11)}
                </span>
            )}
            {cell.plaintextHoverText ? (
                <span title={cell.plaintextHoverText}
                    className="cursor-help border-b border-dashed border-white/20">
                    {children}
                </span>
            ) : (
                <>{children}</>
            )}
            {cell.endIcon && (
                <span title={cell.endIconHoverText || ''} className="shrink-0"
                    style={{ color: getIconColor(cell.endIconColor) }}>
                    {getIconComponent(cell.endIcon, 11)}
                </span>
            )}
        </span>
    );
}

// ─── MythicTable ─────────────────────────────────────────────────────────────

export interface MythicTableProps {
    tbl: MythicTableDef | any;
    /** When false, renders the table directly without an OutputPanel wrapper */
    showPanel?: boolean;
}

type SortDir = 'ASC' | 'DESC' | null;

export function MythicTable({ tbl, showPanel = true }: MythicTableProps) {
    const rawH: any[] = tbl.headers || [];
    // Extract header info: name + type
    const headerInfo = useMemo(() => rawH.map((h: any) => {
        if (typeof h === 'string') return { name: h, type: 'string' };
        return { name: h.plaintext ?? String(h), type: (h.type || 'string').toLowerCase() };
    }), [rawH]);
    const headers: string[] = headerInfo.map(h => h.name);
    const headerTypes: Record<string, string> = useMemo(() => {
        const m: Record<string, string> = {};
        headerInfo.forEach(h => { m[h.name] = h.type; });
        return m;
    }, [headerInfo]);
    const rows: any[] = tbl.rows || [];

    // ── Sort state ──
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>(null);

    // ── Filter state ──
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [filterCol, setFilterCol] = useState<string | null>(null);
    const filterInputRef = useRef<HTMLInputElement>(null);

    // ── Context menu state ──
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; rowIdx: number; colIdx: number } | null>(null);
    const ctxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ctxMenu) return;
        const handle = (e: MouseEvent) => {
            if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, [ctxMenu]);

    // Focus filter input when opened
    useEffect(() => {
        if (filterCol && filterInputRef.current) filterInputRef.current.focus();
    }, [filterCol]);

    const numericCols = useMemo(() => {
        const nc = new Set<string>();
        headers.forEach(h => {
            if (headerTypes[h] === 'size' || headerTypes[h] === 'number') { nc.add(h); return; }
            const sample = rows.slice(0, 10).map((r: any) => {
                const c = r[h];
                return typeof c === 'object' && c !== null ? c.plaintext : c;
            });
            if (sample.every((v: any) =>
                v === '' || v === null || v === undefined || !isNaN(Number(v))
            )) nc.add(h);
        });
        return nc;
    }, [headers, rows, headerTypes]);

    // ── Filtered rows ──
    const filteredRows = useMemo(() => {
        return rows.filter(row => {
            for (const [key, val] of Object.entries(filters) as [string, string][]) {
                if (!val) continue;
                const cell = row[key];
                const pt = typeof cell === 'object' && cell !== null ? String(cell.plaintext ?? '') : String(cell ?? '');
                if (!pt.toLowerCase().includes(val.toLowerCase())) return false;
            }
            return true;
        });
    }, [rows, filters]);

    // ── Sorted rows ──
    const sortedRows = useMemo(() => {
        if (!sortKey || !sortDir) return filteredRows;
        return [...filteredRows].sort((a, b) => {
            const av = typeof a[sortKey] === 'object' && a[sortKey] !== null ? a[sortKey].plaintext : a[sortKey];
            const bv = typeof b[sortKey] === 'object' && b[sortKey] !== null ? b[sortKey].plaintext : b[sortKey];
            // #13 — date sort type
            if (headerTypes[sortKey] === 'date') {
                const da = new Date(String(av ?? '')).getTime();
                const db = new Date(String(bv ?? '')).getTime();
                if (!isNaN(da) && !isNaN(db)) { return sortDir === 'ASC' ? da - db : db - da; }
            }
            const an = Number(av), bn = Number(bv);
            const isNum = !isNaN(an) && !isNaN(bn);
            let cmp = 0;
            if (isNum) cmp = an - bn;
            else cmp = String(av ?? '').localeCompare(String(bv ?? ''));
            return sortDir === 'ASC' ? cmp : -cmp;
        });
    }, [filteredRows, sortKey, sortDir, headerTypes]);

    const handleHeaderClick = useCallback((h: string) => {
        if (sortKey === h) {
            if (sortDir === 'ASC') setSortDir('DESC');
            else if (sortDir === 'DESC') { setSortKey(null); setSortDir(null); }
        } else { setSortKey(h); setSortDir('ASC'); }
    }, [sortKey, sortDir]);

    const handleHeaderRightClick = useCallback((e: React.MouseEvent, h: string) => {
        e.preventDefault();
        setFilterCol(filterCol === h ? null : h);
    }, [filterCol]);

    // #2 — Extract row_actions from table definition
    const rowActions: any[] = tbl.row_actions || [];

    const handleRowCtx = useCallback((e: React.MouseEvent, ri: number, ci: number) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY, rowIdx: ri, colIdx: ci });
    }, []);

    const copyToClip = useCallback((text: string) => {
        navigator.clipboard.writeText(text);
        setCtxMenu(null);
    }, []);

    // #2 — row_actions task dispatch via TaskFromUIButton
    const callbackId = useContext(OutputCallbackContext);
    const [activeRowAction, setActiveRowAction] = useState<{ action: any; rowIdx: number } | null>(null);
    const doRowAction = useCallback((action: any, ri: number) => {
        if (!callbackId) return;
        const row = sortedRows[ri];
        if (!row) return;
        setCtxMenu(null);
        setActiveRowAction({ action, rowIdx: ri });
    }, [callbackId, sortedRows]);

    const hasActiveFilters = Object.values(filters).some(v => !!v);

    const tableEl = (
        <div className="overflow-x-auto relative">
            <table className="text-[11.5px] border-collapse w-full font-mono">
                <thead>
                    <tr style={{ background: '#00ffd10c' }}>
                        {headers.map((h, i) => (
                            <th key={i}
                                className={`px-3 py-1.5 border-b font-bold whitespace-nowrap text-[10px] tracking-wider uppercase select-none cursor-pointer ${numericCols.has(h) ? 'text-right' : 'text-left'}`}
                                style={{ borderColor: '#00ffd122', color: sortKey === h ? ACCENT : '#00ffd1bb' }}
                                onClick={() => handleHeaderClick(h)}
                                onContextMenu={(e) => handleHeaderRightClick(e, h)}>
                                <span className="flex items-center gap-1">
                                    {!numericCols.has(h) && <span>{h}</span>}
                                    {sortKey === h && sortDir === 'ASC' && <ArrowUp size={9}/>}
                                    {sortKey === h && sortDir === 'DESC' && <ArrowDown size={9}/>}
                                    {filters[h] && (
                                        <Filter size={8} style={{ color: AMBER, opacity: 0.8 }}/>
                                    )}
                                    {numericCols.has(h) && <span className="ml-auto">{h}</span>}
                                </span>
                            </th>
                        ))}
                    </tr>
                    {/* Filter row */}
                    {filterCol && (
                        <tr style={{ background: '#00ffd108' }}>
                            {headers.map((h, i) => (
                                <th key={i} className="px-1 py-1 border-b" style={{ borderColor: '#ffffff07' }}>
                                    {h === filterCol ? (
                                        <input
                                            ref={filterInputRef}
                                            type="text"
                                            value={filters[h] || ''}
                                            onChange={(e) => setFilters(prev => ({ ...prev, [h]: e.target.value }))}
                                            onKeyDown={(e) => { if (e.key === 'Escape') setFilterCol(null); if (e.key === 'Enter') setFilterCol(null); }}
                                            placeholder={`Filter ${h}…`}
                                            className="w-full bg-black/50 border border-white/10 rounded-sm px-2 py-0.5 text-[10px] font-mono text-white focus:outline-none focus:border-signal/40"
                                        />
                                    ) : (
                                        filters[h] ? (
                                            <button
                                                onClick={() => setFilters(prev => { const n = { ...prev }; delete n[h]; return n; })}
                                                className="text-[9px] font-mono px-1 py-0.5 rounded-sm border transition-colors hover:bg-white/5"
                                                style={{ color: AMBER, borderColor: `${AMBER}30` }}>
                                                ✕ {filters[h]}
                                            </button>
                                        ) : null
                                    )}
                                </th>
                            ))}
                        </tr>
                    )}
                </thead>
                <tbody>
                    {sortedRows.map((row: any, ri: number) => (
                        <tr key={ri}
                            style={{ background: ri % 2 === 0 ? 'transparent' : '#ffffff03' }}
                            className="transition-colors hover:bg-[#00ffd10a]"
                            onContextMenu={(e) => handleRowCtx(e, ri, 0)}>
                            {headers.map((h, ci) => (
                                <td key={ci}
                                    className={`px-3 py-1.5 border-b whitespace-pre-wrap break-words max-w-xs ${numericCols.has(h) ? 'text-right tabular-nums' : ''}`}
                                    style={{ borderColor: '#ffffff07', color: numericCols.has(h) ? '#a8d8ff' : '#ccc' }}
                                    onContextMenu={(e) => { e.stopPropagation(); handleRowCtx(e, ri, ci); }}>
                                    {renderCell(row[h], headerTypes[h])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Context Menu */}
            {ctxMenu && (
                <div ref={ctxRef}
                    className="fixed z-[9999] min-w-[160px] shadow-2xl border rounded-sm overflow-hidden"
                    style={{ left: ctxMenu.x, top: ctxMenu.y, background: '#0d0d0d', borderColor: '#ffffff20' }}>
                    <button onClick={() => {
                        const cell = sortedRows[ctxMenu.rowIdx]?.[headers[ctxMenu.colIdx]];
                        const pt = typeof cell === 'object' && cell !== null ? String(cell.plaintext ?? '') : String(cell ?? '');
                        copyToClip(pt);
                    }} className="w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-white/5 transition-colors flex items-center gap-2"
                        style={{ color: '#ccc' }}>
                        <Copy size={10}/> Copy Cell
                    </button>
                    <button onClick={() => {
                        const row = sortedRows[ctxMenu.rowIdx];
                        if (row) copyToClip(JSON.stringify(row, null, 2));
                    }} className="w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-white/5 transition-colors flex items-center gap-2"
                        style={{ color: '#ccc' }}>
                        <Clipboard size={10}/> Copy Row JSON
                    </button>
                    <button onClick={() => {
                        const row = sortedRows[ctxMenu.rowIdx];
                        if (row) {
                            const vals = headers.map(h => {
                                const cell = row[h];
                                return typeof cell === 'object' && cell !== null ? String(cell.plaintext ?? '') : String(cell ?? '');
                            });
                            copyToClip(vals.join('\t'));
                        }
                    }} className="w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-white/5 transition-colors flex items-center gap-2"
                        style={{ color: '#ccc' }}>
                        <Clipboard size={10}/> Copy Row TSV
                    </button>
                    <div className="border-t" style={{ borderColor: '#ffffff10' }}/>
                    <button onClick={() => {
                        const allRows = sortedRows.map(row =>
                            headers.map(h => {
                                const cell = row[h];
                                return typeof cell === 'object' && cell !== null ? String(cell.plaintext ?? '') : String(cell ?? '');
                            }).join('\t')
                        );
                        copyToClip([headers.join('\t'), ...allRows].join('\n'));
                    }} className="w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-white/5 transition-colors flex items-center gap-2"
                        style={{ color: '#ccc' }}>
                        <Database size={10}/> Copy Table TSV
                    </button>
                    <button onClick={() => {
                        copyToClip(JSON.stringify(sortedRows, null, 2));
                    }} className="w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-white/5 transition-colors flex items-center gap-2"
                        style={{ color: '#ccc' }}>
                        <Database size={10}/> Copy Table JSON
                    </button>
                    <div className="border-t" style={{ borderColor: '#ffffff10' }}/>
                    {/* #14 — CSV export */}
                    <button onClick={() => {
                        const escCsv = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
                        const row = sortedRows[ctxMenu.rowIdx];
                        if (row) {
                            const vals = headers.map(h => {
                                const cell = row[h];
                                return escCsv(typeof cell === 'object' && cell !== null ? String(cell.plaintext ?? '') : String(cell ?? ''));
                            });
                            copyToClip(vals.join(','));
                        }
                    }} className="w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-white/5 transition-colors flex items-center gap-2"
                        style={{ color: '#ccc' }}>
                        <Clipboard size={10}/> Copy Row CSV
                    </button>
                    <button onClick={() => {
                        const escCsv = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
                        const allRows = sortedRows.map(row =>
                            headers.map(h => {
                                const cell = row[h];
                                return escCsv(typeof cell === 'object' && cell !== null ? String(cell.plaintext ?? '') : String(cell ?? ''));
                            }).join(',')
                        );
                        copyToClip([headers.join(','), ...allRows].join('\n'));
                    }} className="w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-white/5 transition-colors flex items-center gap-2"
                        style={{ color: '#ccc' }}>
                        <Database size={10}/> Copy Table CSV
                    </button>
                    {/* #2 — row_actions from browser script */}
                    {rowActions.length > 0 && (
                        <>
                            <div className="border-t" style={{ borderColor: '#ffffff10' }}/>
                            <div className="px-3 py-1 text-[9px] font-mono uppercase tracking-wider" style={{ color: '#555' }}>Actions</div>
                            {rowActions.map((action: any, ai: number) => (
                                <button key={ai}
                                    onClick={() => doRowAction(action, ctxMenu.rowIdx)}
                                    className="w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-white/5 transition-colors flex items-center gap-2"
                                    style={{ color: action.ui_feature ? ACCENT : '#ccc' }}>
                                    {action.icon ? getIconComponent(action.icon, 10) : <Play size={10}/>}
                                    {action.name || action.ui_feature || `Action ${ai + 1}`}
                                </button>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );

    if (!showPanel) return tableEl;
    return (
        <>
            <OutputPanel icon={<Database size={11}/>} label={tbl.title || 'TABLE'}
                count={hasActiveFilters ? `${sortedRows.length}/${rows.length}` as any : rows.length}>
                {tableEl}
            </OutputPanel>
            {/* TaskFromUIButton for row_actions */}
            {activeRowAction && callbackId && (() => {
                const row = sortedRows[activeRowAction.rowIdx];
                const params: Record<string, any> = { ...(activeRowAction.action.parameters || {}) };
                if (activeRowAction.action.row_data_key) params[activeRowAction.action.row_data_key] = row;
                else if (!activeRowAction.action.parameters) Object.assign(params, row);
                return (
                    <TaskFromUIButton
                        callback_id={callbackId}
                        ui_feature={activeRowAction.action.ui_feature || ''}
                        parameters={JSON.stringify(params)}
                        openDialog={activeRowAction.action.openDialog || false}
                        getConfirmation={activeRowAction.action.getConfirmation || false}
                        onTasked={() => setActiveRowAction(null)}
                        dontShowSuccessDialog={true}
                    />
                );
            })()}
        </>
    );
}

// ─── AutoTable: plain object array → MythicTable ─────────────────────────────

export function AutoTable({ rows, title }: { rows: any[]; title?: string }) {
    const headers = useMemo(() => {
        const keys = new Set<string>();
        rows.slice(0, 10).forEach(r => {
            if (r && typeof r === 'object') Object.keys(r).forEach(k => keys.add(k));
        });
        return [...keys];
    }, [rows]);
    const normalised = rows.map(r => {
        const row: any = {};
        headers.forEach(h => {
            row[h] = { plaintext: r[h] !== null && r[h] !== undefined ? String(r[h]) : '' };
        });
        return row;
    });
    return (
        <MythicTable
            tbl={{ title: title ?? '', headers, rows: normalised }}
            showPanel={false}
        />
    );
}

// ─── ANSI rendering helper ────────────────────────────────────────────────────
const renderAnsi = (text: string): React.ReactNode => {
    try {
        const tokens: any[] = Anser.ansiToJson(text, { json: true, remove_empty: true });
        if (tokens.length <= 1 && !tokens[0]?.fg && !tokens[0]?.bg && !tokens[0]?.decoration) return null; // no ANSI
        return tokens.map((token, i) => {
            const style: React.CSSProperties = { display: 'inline', whiteSpace: 'pre-wrap', wordBreak: 'break-all' };
            const fg = token.fg_truecolor || token.fg;
            const bg = token.bg_truecolor || token.bg;
            if (fg) style.color = `rgb(${fg})`;
            if (bg) style.backgroundColor = `rgb(${bg})`;
            if (token.decoration === 'bold') style.fontWeight = 'bold';
            if (token.decoration === 'italic') style.fontStyle = 'italic';
            if (token.decoration === 'underline') style.textDecoration = 'underline';
            return <span key={i} style={style}>{token.content}</span>;
        });
    } catch { return null; }
};

// ─── TerminalPanel ────────────────────────────────────────────────────────────

export function TerminalPanel({ text, isError }: { text: string; isError?: boolean }) {
    const accent     = isError ? ERR : ACCENT;
    const lineCount  = text.split('\n').length;
    const ansiRendered = useMemo(() => renderAnsi(text), [text]);
    const [wrapText, setWrapText] = useState(true);
    const [useAce, setUseAce]     = useState(false);
    const [expanded, setExpanded] = useState(false);
    // #7 — ANSI toggle
    const hasAnsi = useMemo(() => /\x1b\[/.test(text), [text]);
    const [ansiEnabled, setAnsiEnabled] = useState(true);
    // Auto-detect JSON and pretty-format
    const prettyText = useMemo(() => {
        const trimmed = text.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try { return JSON.stringify(JSON.parse(trimmed), null, 2); } catch { /*noop*/ }
        }
        return null;
    }, [text]);
    const displayText = prettyText ?? text;
    return (
        <OutputPanel
            icon={<Terminal size={11}/>}
            label={isError ? 'ERROR' : 'OUTPUT'}
            accent={accent}
            count={lineCount > 1 ? lineCount : undefined}
            toolbar={
                <div className="flex items-center gap-1">
                    <button onClick={() => setWrapText(w => !w)} title={wrapText ? 'Disable wrap' : 'Enable wrap'}
                        className="p-0.5 rounded transition-colors hover:bg-white/10"
                        style={{ color: wrapText ? ACCENT : '#555' }}>
                        <WrapText size={12}/>
                    </button>
                    {/* #7 — ANSI toggle (only show when ANSI codes detected) */}
                    {hasAnsi && (
                        <button onClick={() => setAnsiEnabled(a => !a)} title={ansiEnabled ? 'Disable ANSI colors' : 'Enable ANSI colors'}
                            className="p-0.5 rounded transition-colors hover:bg-white/10 flex items-center gap-0.5"
                            style={{ color: ansiEnabled ? ACCENT : '#555' }}>
                            <Palette size={12}/>
                            <span className="text-[8px] font-mono">ANSI</span>
                        </button>
                    )}
                    <button onClick={() => setUseAce(a => !a)} title={useAce ? 'Simple view' : 'AceEditor view'}
                        className="p-0.5 rounded transition-colors hover:bg-white/10"
                        style={{ color: useAce ? ACCENT : '#555' }}>
                        <Code size={12}/>
                    </button>
                    {useAce && (
                        <button onClick={() => setExpanded(e => !e)} title={expanded ? 'Collapse' : 'Expand'}
                            className="p-0.5 rounded transition-colors hover:bg-white/10"
                            style={{ color: '#888' }}>
                            {expanded ? <Minimize2 size={12}/> : <Maximize2 size={12}/>}
                        </button>
                    )}
                    <button onClick={() => { navigator.clipboard.writeText(displayText); }} title="Copy text"
                        className="p-0.5 rounded transition-colors hover:bg-white/10"
                        style={{ color: '#555' }}>
                        <Clipboard size={12}/>
                    </button>
                </div>
            }>
            {useAce ? (
                <AceEditor
                    mode={prettyText ? 'json' : 'plain_text'}
                    theme="monokai"
                    fontSize={12}
                    showGutter={true}
                    highlightActiveLine={false}
                    showPrintMargin={false}
                    value={displayText}
                    height={expanded ? '100%' : undefined}
                    maxLines={expanded ? undefined : 30}
                    width="100%"
                    wrapEnabled={wrapText}
                    minLines={2}
                    readOnly
                    setOptions={{ showLineNumbers: true, tabSize: 4, useWorker: false }}
                    style={{ background: 'transparent' }}
                />
            ) : (
                <pre className="font-mono text-[12.5px] leading-[1.75] break-words"
                    style={{
                        color: isError ? '#ff8888' : '#d8d8d8',
                        fontFamily: MONO,
                        whiteSpace: wrapText ? 'pre-wrap' : 'pre',
                        overflowX: wrapText ? 'hidden' : 'auto',
                    }}>
                    {ansiEnabled && ansiRendered ? ansiRendered : displayText}
                </pre>
            )}
        </OutputPanel>
    );
}

// ─── ProcessPanel ─────────────────────────────────────────────────────────────

interface ProcessContextMenu {
    x: number;
    y: number;
    proc: any;
}

export function ProcessPanel({ procs }: { procs: any[] }) {
    const callbackId = useContext(OutputCallbackContext);
    const [ctxMenu, setCtxMenu] = useState<ProcessContextMenu | null>(null);
    const [filter, setFilter]   = useState('');
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ctxMenu) return;
        const h = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setCtxMenu(null);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [ctxMenu]);

    const handleRowContext = useCallback((e: React.MouseEvent, proc: any) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY, proc });
    }, []);

    const [activeProcessAction, setActiveProcessAction] = useState<{ uifeature: string; proc: any } | null>(null);
    const doProcessAction = useCallback((uifeature: string, proc: any) => {
        if (!callbackId) return;
        setCtxMenu(null);
        setActiveProcessAction({ uifeature, proc });
    }, [callbackId]);

    const filtered = useMemo(() => {
        if (!filter.trim()) return procs;
        const f = filter.toLowerCase();
        return procs.filter((p: any) => {
            const name = (p.name ?? p.process_name ?? '').toLowerCase();
            const pid  = String(p.process_id ?? p.pid ?? '');
            const user = (p.user ?? '').toLowerCase();
            const path = (p.bin_path ?? p.path ?? '').toLowerCase();
            return name.includes(f) || pid.includes(f) || user.includes(f) || path.includes(f);
        });
    }, [procs, filter]);

    return (
        <>
        <OutputPanel icon={<Layers size={11}/>} label="PROCESS LIST" count={procs.length}
            toolbar={
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2" style={{ color: '#555' }}/>
                        <input
                            type="text"
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            placeholder="Filter..."
                            className="h-5 pl-5 pr-2 bg-black/50 border border-white/10 text-[10px] font-mono text-white placeholder-gray-600 focus:border-[#00ffd133] focus:outline-none w-28"
                        />
                    </div>
                    {filter && (
                        <span className="font-mono text-[9px]" style={{ color: ACCENT }}>{filtered.length}/{procs.length}</span>
                    )}
                </div>
            }>
            <div className="overflow-x-auto">
                <table className="text-[11px] border-collapse w-full font-mono">
                    <thead>
                        <tr style={{ background: '#00ffd10c' }}>
                            {['PID','PPID','NAME','ARCH','USER','PATH'].map(h => (
                                <th key={h}
                                    className="px-2 py-1.5 border-b text-left text-[10px] tracking-wider uppercase whitespace-nowrap"
                                    style={{ borderColor: '#00ffd122', color: '#00ffd1bb' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((p: any, ri: number) => {
                            const arch = p.architecture ?? p.arch ?? '';
                            return (
                                <tr key={ri}
                                    style={{ background: ri % 2 === 0 ? 'transparent' : '#ffffff03' }}
                                    className="transition-colors hover:bg-[#00ffd10a] cursor-context-menu"
                                    onContextMenu={(e) => handleRowContext(e, p)}>
                                    <td className="px-2 py-1 border-b tabular-nums text-right"
                                        style={{ borderColor: '#ffffff07', color: '#a8d8ff' }}>
                                        {p.process_id ?? p.pid ?? ''}
                                    </td>
                                    <td className="px-2 py-1 border-b tabular-nums text-right"
                                        style={{ borderColor: '#ffffff07', color: '#667' }}>
                                        {p.parent_process_id ?? p.ppid ?? ''}
                                    </td>
                                    <td className="px-2 py-1 border-b font-semibold max-w-[180px] truncate"
                                        style={{ borderColor: '#ffffff07', color: '#e0e0e0' }}>
                                        {p.name ?? p.process_name ?? ''}
                                    </td>
                                    <td className="px-2 py-1 border-b" style={{ borderColor: '#ffffff07' }}>
                                        {arch && (
                                            <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold"
                                                style={{
                                                    background: `${ARCH_COLOR[arch] ?? '#555'}22`,
                                                    color: ARCH_COLOR[arch] ?? '#aaa',
                                                }}>
                                                {arch}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-2 py-1 border-b max-w-[120px] truncate"
                                        style={{ borderColor: '#ffffff07', color: '#aaa' }}>
                                        {p.user ?? ''}
                                    </td>
                                    <td className="px-2 py-1 border-b max-w-[200px] truncate"
                                        style={{ borderColor: '#ffffff07', color: '#666', fontSize: '10px' }}>
                                        {p.bin_path ?? p.path ?? ''}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Process context menu */}
            {ctxMenu && (
                <div ref={menuRef}
                    className="fixed z-[9999] border rounded shadow-xl"
                    style={{
                        left: ctxMenu.x, top: ctxMenu.y,
                        background: '#111', borderColor: '#333',
                        minWidth: 200,
                    }}>
                    <div className="px-3 py-1.5 border-b text-[10px] font-mono font-bold"
                        style={{ borderColor: '#222', color: '#888' }}>
                        PID {ctxMenu.proc.process_id ?? ctxMenu.proc.pid} — {ctxMenu.proc.name ?? ctxMenu.proc.process_name ?? 'process'}
                    </div>
                    <button className="w-full px-3 py-1.5 flex items-center gap-2 text-[11px] font-mono hover:bg-white/5 transition-colors text-left"
                        style={{ color: '#fbbf24' }}
                        onClick={() => { navigator.clipboard.writeText(JSON.stringify(ctxMenu.proc, null, 2)); setCtxMenu(null); }}>
                        <Clipboard size={12}/> Copy Process Info
                    </button>
                    {callbackId && (
                        <>
                            <div className="border-t" style={{ borderColor: '#222' }}/>
                            <button className="w-full px-3 py-1.5 flex items-center gap-2 text-[11px] font-mono hover:bg-white/5 transition-colors text-left"
                                style={{ color: '#fbbf24' }}
                                onClick={() => doProcessAction('process_browser:inject', ctxMenu.proc)}>
                                <Syringe size={12}/> Inject
                            </button>
                            <button className="w-full px-3 py-1.5 flex items-center gap-2 text-[11px] font-mono hover:bg-white/5 transition-colors text-left"
                                style={{ color: '#fbbf24' }}
                                onClick={() => doProcessAction('process_browser:list_tokens', ctxMenu.proc)}>
                                <List size={12}/> List Tokens
                            </button>
                            <button className="w-full px-3 py-1.5 flex items-center gap-2 text-[11px] font-mono hover:bg-white/5 transition-colors text-left"
                                style={{ color: '#ef4444' }}
                                onClick={() => doProcessAction('process_browser:steal_token', ctxMenu.proc)}>
                                <Key size={12}/> Steal Token
                            </button>
                            <button className="w-full px-3 py-1.5 flex items-center gap-2 text-[11px] font-mono hover:bg-white/5 transition-colors text-left"
                                style={{ color: '#ef4444' }}
                                onClick={() => { if (window.confirm(`Kill PID ${ctxMenu.proc.process_id ?? ctxMenu.proc.pid}?`)) doProcessAction('process_browser:kill', ctxMenu.proc); }}>
                                <Skull size={12}/> Kill Process
                            </button>
                        </>
                    )}
                </div>
            )}
        </OutputPanel>
        {/* TaskFromUIButton for process actions */}
        {activeProcessAction && callbackId && (
            <TaskFromUIButton
                callback_id={callbackId}
                ui_feature={activeProcessAction.uifeature}
                parameters={JSON.stringify({ process_id: activeProcessAction.proc.process_id ?? activeProcessAction.proc.pid, architecture: activeProcessAction.proc.architecture ?? activeProcessAction.proc.arch ?? '' })}
                onTasked={() => setActiveProcessAction(null)}
                dontShowSuccessDialog={true}
            />
        )}
    </>
    );
}

// ─── FilesPanel ───────────────────────────────────────────────────────────────

export function FilesPanel({ files }: { files: any[] }) {
    return (
        <OutputPanel icon={<FileText size={11}/>} label="FILE LISTING" count={files.length}>
            <div className="overflow-x-auto">
                <table className="text-[11px] border-collapse w-full font-mono">
                    <thead>
                        <tr style={{ background: '#00ffd10c' }}>
                            {['NAME','SIZE','PERMISSIONS','OWNER','MODIFIED'].map(h => (
                                <th key={h}
                                    className="px-2 py-1.5 border-b text-left text-[10px] tracking-wider uppercase whitespace-nowrap"
                                    style={{ borderColor: '#00ffd122', color: '#00ffd1bb' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {files.map((f: any, ri: number) => {
                            const isDir = f.is_file === false || f.type === 'dir' || f.type === 'directory';
                            const sz    = f.size;
                            const sizeStr = sz !== undefined
                                ? sz > 1_048_576 ? `${(sz / 1_048_576).toFixed(1)}M`
                                : sz > 1024      ? `${(sz / 1024).toFixed(1)}K`
                                :                  `${sz}B`
                                : '';
                            return (
                                <tr key={ri}
                                    style={{ background: ri % 2 === 0 ? 'transparent' : '#ffffff03' }}
                                    className="transition-colors hover:bg-[#00ffd10a]">
                                    <td className="px-2 py-1.5 border-b font-semibold"
                                        style={{ borderColor: '#ffffff07', color: isDir ? ACCENT : '#d0d0d0' }}>
                                        <span style={{ marginRight: 5, opacity: 0.6 }}>{isDir ? '📁' : '📄'}</span>
                                        {(() => { const n = f.name ?? f.filename ?? ''; return typeof n === 'object' ? JSON.stringify(n) : String(n); })()}
                                    </td>
                                    <td className="px-2 py-1.5 border-b tabular-nums text-right"
                                        style={{ borderColor: '#ffffff07', color: '#a8d8ff' }}>{sizeStr}</td>
                                    <td className="px-2 py-1.5 border-b font-mono"
                                        style={{ borderColor: '#ffffff07', color: '#888', fontSize: '10px' }}>
                                        {(() => {
                                            const p = f.permissions ?? f.perms;
                                            if (p === null || p === undefined) return '';
                                            if (typeof p === 'object') {
                                                // Array of ACE objects (Windows)
                                                if (Array.isArray(p)) {
                                                    return p.map((ace: any, ai: number) => (
                                                        <span key={ai} title={JSON.stringify(ace)}
                                                            className="block truncate max-w-[120px]"
                                                            style={{ color: '#8ab', fontSize: '10px' }}>
                                                            {ace.account ?? ace.rights ?? JSON.stringify(ace)}
                                                        </span>
                                                    ));
                                                }
                                                // Single ACE / generic permissions object
                                                const acc = (p as any).account;
                                                return acc
                                                    ? <span title={JSON.stringify(p)} style={{ color: '#8ab' }}>{acc}</span>
                                                    : <span title={JSON.stringify(p)} style={{ color: '#555' }}>{JSON.stringify(p)}</span>;
                                            }
                                            return String(p);
                                        })()}
                                    </td>
                                    <td className="px-2 py-1.5 border-b"
                                        style={{ borderColor: '#ffffff07', color: '#777', fontSize: '10px' }}>
                                        {(() => {
                                            const o = f.owner ?? f.user;
                                            if (o === null || o === undefined) return '';
                                            return typeof o === 'object' ? JSON.stringify(o) : String(o);
                                        })()}
                                    </td>
                                    <td className="px-2 py-1.5 border-b"
                                        style={{ borderColor: '#ffffff07', color: '#555', fontSize: '10px' }}>
                                        {(() => {
                                            const m = f.modify_time ?? f.modified;
                                            if (m === null || m === undefined) return '';
                                            return typeof m === 'object' ? JSON.stringify(m) : String(m);
                                        })()}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </OutputPanel>
    );
}

// ─── ScreenshotPanel ──────────────────────────────────────────────────────────

export function ScreenshotPanel({ screenshots }: { screenshots: MythicScreenshot[] }) {
    const [currentIdx, setCurrentIdx] = useState(0);
    const [viewMode, setViewMode]     = useState<'gallery' | 'single'>(screenshots.length > 3 ? 'single' : 'gallery');
    const [expandedImg, setExpandedImg] = useState<{ src: string; alt: string } | null>(null);
    const total = screenshots.length;

    useEffect(() => {
        if (!expandedImg) return;
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedImg(null); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [expandedImg]);

    return (
        <OutputPanel
            icon={<Camera size={11}/>}
            label="SCREENSHOT"
            accent={PURPLE}
            count={total > 1 ? total : undefined}
            toolbar={total > 1 ? (
                <div className="flex items-center gap-1">
                    <button onClick={() => setViewMode(m => m === 'gallery' ? 'single' : 'gallery')}
                        className="p-0.5 rounded transition-colors hover:bg-white/10"
                        style={{ color: '#888' }}
                        title={viewMode === 'gallery' ? 'Single view' : 'Gallery view'}>
                        {viewMode === 'gallery' ? <Minimize2 size={12}/> : <Maximize2 size={12}/>}
                    </button>
                    {viewMode === 'single' && (
                        <>
                            <button onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                                disabled={currentIdx === 0}
                                className="p-0.5 rounded transition-colors hover:bg-white/10 disabled:opacity-30"
                                style={{ color: PURPLE }}>
                                <ChevronLeft size={14}/>
                            </button>
                            <span className="font-mono text-[10px] px-1" style={{ color: '#888' }}>
                                {currentIdx + 1}/{total}
                            </span>
                            <button onClick={() => setCurrentIdx(i => Math.min(total - 1, i + 1))}
                                disabled={currentIdx >= total - 1}
                                className="p-0.5 rounded transition-colors hover:bg-white/10 disabled:opacity-30"
                                style={{ color: PURPLE }}>
                                <ChevronRight size={14}/>
                            </button>
                        </>
                    )}
                </div>
            ) : undefined}>
            <div className="space-y-3">
                {(viewMode === 'single' ? [screenshots[currentIdx]] : screenshots)
                    .filter(Boolean)
                    .map((scr, i) => {
                        const idx = viewMode === 'single' ? currentIdx : i;
                        const src = `/api/v1.4/files/download/${scr.agent_file_id}`;
                        const alt = scr.plaintext || `Screenshot ${idx + 1}`;
                        return (
                            <div key={idx}>
                                {scr.plaintext && (
                                    <div className="font-mono text-[11px] mb-1.5 pb-1 border-b"
                                        style={{ color: '#998', borderColor: `${PURPLE}22` }}>
                                        {scr.plaintext}
                                    </div>
                                )}
                                <img
                                    src={src}
                                    alt={alt}
                                    className="rounded-sm border w-full object-contain cursor-zoom-in transition-opacity hover:opacity-90"
                                    style={{ borderColor: `${PURPLE}33`, maxHeight: 340 }}
                                    onClick={() => setExpandedImg({ src, alt })}
                                />
                            </div>
                        );
                    })}
            </div>

            {/* Fullscreen modal */}
            {expandedImg && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.85)' }}
                    onClick={() => setExpandedImg(null)}>
                    <div className="flex flex-col rounded-sm overflow-hidden shadow-2xl max-w-[90vw] max-h-[90vh]"
                        style={{ background: '#0a0a0a', border: `1px solid ${PURPLE}40` }}
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0"
                            style={{ borderColor: `${PURPLE}22`, background: `${PURPLE}09` }}>
                            <span className="font-mono text-[10px] text-gray-400">{expandedImg.alt}</span>
                            <div className="flex items-center gap-2">
                                <a href={expandedImg.src} download target="_blank" rel="noreferrer"
                                    className="font-mono text-[10px] px-2 py-0.5 rounded-sm border transition-opacity hover:opacity-80"
                                    style={{ color: AMBER, borderColor: `${AMBER}30`, background: `${AMBER}10` }}>
                                    ↓ save
                                </a>
                                <button onClick={() => setExpandedImg(null)}
                                    className="text-gray-500 hover:text-white transition-colors p-0.5">
                                    <X size={14}/>
                                </button>
                            </div>
                        </div>
                        <img src={expandedImg.src} alt={expandedImg.alt}
                            className="block max-w-full max-h-[80vh] object-contain"/>
                    </div>
                </div>
            )}
        </OutputPanel>
    );
}

// ─── DownloadPanel ────────────────────────────────────────────────────────────

export function DownloadPanel({ downloads }: { downloads: MythicDownload[] }) {
    return (
        <OutputPanel icon={<Database size={11}/>} label="DOWNLOADS" accent={AMBER} count={downloads.length}>
            <div className="space-y-2">
                {downloads.map((dl, i) => {
                    const href = `/api/v1.4/files/download/${dl.agent_file_id}`;
                    const fname = dl.name || dl.plaintext || 'file';
                    return (
                        <div key={i}
                            className="flex items-center gap-3 p-2 rounded-sm"
                            style={{ background: `${AMBER}08`, border: `1px solid ${AMBER}20` }}>
                            <Database size={12} style={{ color: AMBER, flexShrink: 0 }}/>
                            <span className="font-mono text-[12px] flex-1 truncate" style={{ color: '#ccc' }}>
                                {fname}
                            </span>
                            <button
                                onClick={() => navigator.clipboard.writeText(window.location.origin + href)}
                                className="font-mono text-[10px] px-2 py-1 rounded-sm transition-colors hover:opacity-100"
                                title="Copy link"
                                style={{ color: '#888', background: '#ffffff08', border: '1px solid #ffffff15', opacity: 0.7 }}>
                                <Clipboard size={10}/>
                            </button>
                            <a
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-[11px] px-2 py-1 rounded-sm transition-colors hover:opacity-100"
                                title="Preview in new tab"
                                style={{ color: '#60a5fa', background: '#60a5fa15', border: '1px solid #60a5fa30', opacity: 0.8 }}>
                                <Eye size={10}/>
                            </a>
                            <a
                                href={href}
                                download={fname}
                                className="font-mono text-[11px] px-2 py-1 rounded-sm transition-colors hover:opacity-100"
                                style={{ color: AMBER, background: `${AMBER}15`, border: `1px solid ${AMBER}30`, opacity: 0.8 }}>
                                ↓ save
                            </a>
                        </div>
                    );
                })}
            </div>
        </OutputPanel>
    );
}

// ─── #12 MediaPanel — Combined 4-tab viewer (Preview / Text / Hex / Database) ─

export function MediaPanel({ agentFileId, filename }: { agentFileId: string; filename?: string }) {
    const [activeTab, setActiveTab] = useState<'preview' | 'text' | 'hex' | 'database'>('preview');
    const [rawBytes, setRawBytes] = useState<Uint8Array | null>(null);
    const [textContent, setTextContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [mimeType, setMimeType] = useState('');
    const src = `/api/v1.4/files/download/${agentFileId}`;
    const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
    const isImage = ['png','jpg','jpeg','gif','bmp','webp','svg','ico'].includes(ext);
    const isAudio = ['mp3','wav','ogg','flac','m4a','aac'].includes(ext);
    const isVideo = ['mp4','webm','mkv','avi','mov'].includes(ext);
    const isDb = ['db','sqlite','sqlite3'].includes(ext);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const resp = await fetch(src);
                setMimeType(resp.headers.get('content-type') || '');
                const buf = await resp.arrayBuffer();
                if (cancelled) return;
                const bytes = new Uint8Array(buf);
                setRawBytes(bytes);
                try { setTextContent(new TextDecoder().decode(bytes)); } catch { setTextContent('[binary data]'); }
                setLoading(false);
                // Auto-select best tab
                if (isDb) setActiveTab('database');
                else if (isImage || isAudio || isVideo) setActiveTab('preview');
                else setActiveTab('text');
            } catch { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [agentFileId]);

    const tabs: { id: typeof activeTab; label: string }[] = [
        { id: 'preview', label: 'PREVIEW' },
        { id: 'text',    label: 'TEXT' },
        { id: 'hex',     label: 'HEX' },
        ...(isDb ? [{ id: 'database' as const, label: 'DATABASE' }] : []),
    ];

    const hexDump = useMemo(() => {
        if (!rawBytes || activeTab !== 'hex') return '';
        const lines: string[] = [];
        const len = Math.min(rawBytes.length, 8192); // limit to 8KB for hex display
        for (let i = 0; i < len; i += 16) {
            const slice = rawBytes.slice(i, i + 16);
            const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
            const ascii = Array.from(slice).map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '.').join('');
            lines.push(`${i.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii}`);
        }
        if (rawBytes.length > len) lines.push(`\n... truncated (${rawBytes.length} total bytes)`);
        return lines.join('\n');
    }, [rawBytes, activeTab]);

    return (
        <OutputPanel icon={<Eye size={11}/>} label={filename || 'MEDIA'} accent={PURPLE}
            toolbar={
                <div className="flex items-center gap-0.5">
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)}
                            className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider transition-colors rounded-sm"
                            style={{
                                color: activeTab === t.id ? '#000' : '#888',
                                background: activeTab === t.id ? ACCENT : 'transparent',
                            }}>
                            {t.label}
                        </button>
                    ))}
                </div>
            }>
            {loading && <div className="font-mono text-[10px] py-4 text-center" style={{ color: '#555' }}>Loading file…</div>}
            {!loading && activeTab === 'preview' && (
                <div className="space-y-2">
                    {isImage && <img src={src} alt={filename} className="max-w-full max-h-[400px] object-contain rounded-sm border" style={{ borderColor: `${PURPLE}33` }}/>}
                    {isAudio && <audio src={src} controls className="w-full"/>}
                    {isVideo && <video src={src} controls className="w-full max-h-[400px] rounded-sm"/>}
                    {!isImage && !isAudio && !isVideo && (
                        <div className="font-mono text-[11px] text-gray-500 py-4 text-center">
                            No preview available. <a href={src} download={filename} className="text-signal hover:underline">Download file</a>
                        </div>
                    )}
                </div>
            )}
            {!loading && activeTab === 'text' && (
                <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-[400px] overflow-auto"
                    style={{ color: '#ccc' }}>
                    {textContent.slice(0, 500000) || '[empty]'}
                </pre>
            )}
            {!loading && activeTab === 'hex' && (
                <pre className="font-mono text-[10px] leading-relaxed max-h-[400px] overflow-auto"
                    style={{ color: '#a8d8ff' }}>
                    {hexDump || '[empty]'}
                </pre>
            )}
            {!loading && activeTab === 'database' && isDb && (
                <DatabasePanel agentFileId={agentFileId} filename={filename}/>
            )}
        </OutputPanel>
    );
}

// ─── GraphPanel (#2, #18) ─────────────────────────────────────────────────────
// Dagre-style hierarchical layout with icon support and auto-hide for >50 nodes

interface GraphNode { id: string; label?: string; color?: string; img?: string; overlay_icon?: string; group?: string }
interface GraphEdge { source: string; target: string; label?: string; color?: string }

const GRAPH_ICON: Record<string, React.FC<{ size: number; color: string }>> = {
    group:     ({ size, color }) => <Folder size={size} color={color}/>,
    computer:  ({ size, color }) => <Box size={size} color={color}/>,
    user:      ({ size, color }) => <Skull size={size} color={color}/>,
    lan:       ({ size, color }) => <Wifi size={size} color={color}/>,
    language:  ({ size, color }) => <Code size={size} color={color}/>,
    list:      ({ size, color }) => <List size={size} color={color}/>,
    container: ({ size, color }) => <Archive size={size} color={color}/>,
    help:      ({ size, color }) => <Hash size={size} color={color}/>,
    diamond:   ({ size, color }) => <Key size={size} color={color}/>,
    skull:     ({ size, color }) => <Skull size={size} color={color}/>,
};

/** Simple layered graph layout (Sugiyama-style) */
function dagreLayout(nodes: GraphNode[], edges: GraphEdge[], rankDir: string) {
    const horizontal = rankDir === 'LR' || rankDir === 'RL';
    const nodeW = 140, nodeH = 56, gapX = 36, gapY = 46;
    // build adjacency
    const adj: Record<string, string[]> = {};
    const indeg: Record<string, number> = {};
    nodes.forEach(n => { adj[n.id] = []; indeg[n.id] = 0; });
    edges.forEach(e => {
        if (adj[e.source]) adj[e.source].push(e.target);
        if (indeg[e.target] !== undefined) indeg[e.target]++;
    });
    // topological sort → assign ranks
    const queue: string[] = [];
    const rank: Record<string, number> = {};
    nodes.forEach(n => { if (!indeg[n.id]) queue.push(n.id); });
    let head = 0;
    while (head < queue.length) {
        const cur = queue[head++];
        (adj[cur] || []).forEach(t => {
            rank[t] = Math.max(rank[t] || 0, (rank[cur] || 0) + 1);
            indeg[t]--;
            if (indeg[t] === 0) queue.push(t);
        });
    }
    // assign unlinked nodes
    nodes.forEach(n => { if (rank[n.id] === undefined) rank[n.id] = 0; });
    // group by rank
    const layers: Record<number, string[]> = {};
    let maxRank = 0;
    nodes.forEach(n => {
        const r = rank[n.id];
        maxRank = Math.max(maxRank, r);
        if (!layers[r]) layers[r] = [];
        layers[r].push(n.id);
    });
    // position
    const pos: Record<string, { x: number; y: number }> = {};
    for (let r = 0; r <= maxRank; r++) {
        const ids = layers[r] || [];
        ids.forEach((id, i) => {
            if (horizontal) {
                pos[id] = { x: r * (nodeW + gapX) + nodeW / 2 + 20, y: i * (nodeH + gapY) + nodeH / 2 + 20 };
            } else {
                pos[id] = { x: i * (nodeW + gapX) + nodeW / 2 + 20, y: r * (nodeH + gapY) + nodeH / 2 + 20 };
            }
        });
    }
    const maxCols = Object.values(layers).reduce((m, l) => Math.max(m, l.length), 0);
    const totalW = horizontal ? (maxRank + 1) * (nodeW + gapX) + 40 : maxCols * (nodeW + gapX) + 40;
    const totalH = horizontal ? maxCols * (nodeH + gapY) + 40 : (maxRank + 1) * (nodeH + gapY) + 40;
    return { pos, width: totalW, height: totalH, nodeW, nodeH };
}

export function GraphPanel({ nodes, edges, rankDir = 'LR' }: { nodes: GraphNode[]; edges: GraphEdge[]; rankDir?: string }) {
    const [show, setShow] = useState(nodes.length < 50);
    const [useReactFlow, setUseReactFlow] = useState(false);
    const { pos, width, height, nodeW, nodeH } = useMemo(() => dagreLayout(nodes, edges, rankDir), [nodes, edges, rankDir]);
    const nodeMap: Record<string, GraphNode> = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);
    // Context menu state
    const [graphCtx, setGraphCtx] = useState<{ x: number; y: number; node: GraphNode } | null>(null);
    const graphCtxRef = useRef<HTMLDivElement>(null);
    const [viewAllNode, setViewAllNode] = useState<GraphNode | null>(null);

    useEffect(() => {
        if (!graphCtx) return;
        const handler = (e: MouseEvent) => {
            if (graphCtxRef.current && !graphCtxRef.current.contains(e.target as Node)) setGraphCtx(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [graphCtx]);

    return (
        <OutputPanel icon={<Network size={11}/>} label="GRAPH" count={nodes.length}
            toolbar={
                <button onClick={() => setUseReactFlow(!useReactFlow)}
                    className="px-2 py-0.5 text-[9px] font-mono rounded transition-colors"
                    style={{
                        background: useReactFlow ? `${ACCENT}30` : 'transparent',
                        color: useReactFlow ? ACCENT : '#888',
                        border: `1px solid ${useReactFlow ? ACCENT : '#444'}`,
                    }}>
                    {useReactFlow ? 'INTERACTIVE' : 'STATIC'}
                </button>
            }>
            {!show && nodes.length >= 50 && (
                <button onClick={() => setShow(true)}
                    className="font-mono text-[10px] px-3 py-1.5 rounded-sm border transition-colors hover:opacity-80"
                    style={{ color: ACCENT, borderColor: `${ACCENT}40`, background: `${ACCENT}10` }}>
                    Show {nodes.length} nodes (large graph)
                </button>
            )}
            {show && useReactFlow && nodes.length < 200 && (
                <InteractiveGraphFlow nodes={nodes} edges={edges} />
            )}
            {show && !useReactFlow && (
                <div className="border border-white/10 rounded overflow-auto" style={{ maxHeight: 500 }}>
                    <svg width={width} height={height} className="block">
                        <defs>
                            <marker id="gp-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                                <path d="M0,0 L0,6 L6,3 z" fill={`${ACCENT}90`}/>
                            </marker>
                        </defs>
                        {/* edges */}
                        {edges.map((e, i) => {
                            const s = pos[e.source], t = pos[e.target];
                            if (!s || !t) return null;
                            return (
                                <g key={`e${i}`}>
                                    <line x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                                        stroke={e.color || `${ACCENT}40`} strokeWidth="1.5" markerEnd="url(#gp-arrow)"/>
                                    {e.label && (
                                        <text x={(s.x + t.x) / 2} y={(s.y + t.y) / 2 - 4}
                                            fill="#888" fontSize="8" textAnchor="middle" fontFamily="monospace">{e.label}</text>
                                    )}
                                </g>
                            );
                        })}
                        {/* nodes */}
                        {nodes.map(n => {
                            const p = pos[n.id];
                            if (!p) return null;
                            const fill = n.color || '#00ffd115';
                            const stroke = n.color || `${ACCENT}50`;
                            const IconComp = n.img ? null : GRAPH_ICON[n.overlay_icon || n.group || ''];
                            return (
                                <g key={n.id} style={{ cursor: 'context-menu' }}
                                    onContextMenu={(e) => { e.preventDefault(); setGraphCtx({ x: e.clientX, y: e.clientY, node: n }); }}>
                                    <rect x={p.x - nodeW / 2} y={p.y - nodeH / 2} width={nodeW} height={nodeH}
                                        rx="4" fill={fill} stroke={stroke} strokeWidth="1"/>
                                    {n.img && (
                                        <image href={n.img} x={p.x - 10} y={p.y - nodeH / 2 + 4} width={20} height={20}/>
                                    )}
                                    {IconComp && (
                                        <foreignObject x={p.x - 8} y={p.y - nodeH / 2 + 4} width={16} height={16}>
                                            <IconComp size={14} color={n.color || ACCENT}/>
                                        </foreignObject>
                                    )}
                                    <text x={p.x} y={n.img || IconComp ? p.y + 8 : p.y + 2}
                                        fill="#e0e0e0" fontSize="9" textAnchor="middle" dominantBaseline="middle"
                                        fontFamily="monospace">
                                        {(n.label || n.id).slice(0, 20)}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            )}
            {/* #6 — Graph node context menu */}
            {graphCtx && (
                <div ref={graphCtxRef}
                    className="fixed z-[9999] min-w-[140px] shadow-2xl border rounded-sm overflow-hidden"
                    style={{ left: graphCtx.x, top: graphCtx.y, background: '#0d0d0d', borderColor: '#ffffff20' }}>
                    <button onClick={() => { setViewAllNode(graphCtx.node); setGraphCtx(null); }}
                        className="w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-white/5 transition-colors flex items-center gap-2"
                        style={{ color: ACCENT }}>
                        <Eye size={10}/> View All Data
                    </button>
                    <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(graphCtx.node, null, 2)); setGraphCtx(null); }}
                        className="w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-white/5 transition-colors flex items-center gap-2"
                        style={{ color: '#ccc' }}>
                        <Copy size={10}/> Copy Node JSON
                    </button>
                </div>
            )}
            {/* #6 — View All Data modal */}
            {viewAllNode && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.75)' }}
                    onClick={() => setViewAllNode(null)}>
                    <div className="rounded-sm overflow-hidden shadow-2xl max-w-lg w-full max-h-[70vh] flex flex-col"
                        style={{ background: '#0a0a0a', border: `1px solid ${ACCENT}30` }}
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0"
                            style={{ borderColor: `${ACCENT}15`, background: `${ACCENT}06` }}>
                            <span className="font-mono text-[11px]" style={{ color: ACCENT }}>
                                NODE DATA — {viewAllNode.label || viewAllNode.id}
                            </span>
                            <button onClick={() => setViewAllNode(null)} className="text-gray-500 hover:text-white transition-colors p-0.5"><X size={14}/></button>
                        </div>
                        <div className="overflow-auto p-4 flex-1">
                            <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: '#ccc' }}>
                                {JSON.stringify(viewAllNode, null, 2)}
                            </pre>
                        </div>
                        <div className="flex justify-end gap-2 px-4 py-2 border-t" style={{ borderColor: '#ffffff10' }}>
                            <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(viewAllNode, null, 2)); }}
                                className="px-3 py-1 text-[10px] font-mono border transition-colors hover:opacity-80"
                                style={{ color: ACCENT, borderColor: `${ACCENT}30`, background: `${ACCENT}10` }}>
                                <Copy size={10} className="inline mr-1"/> Copy
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </OutputPanel>
    );
}

// ─── InteractiveGraphFlow — ReactFlow-powered graph visualization ─────────────

function InteractiveGraphFlow({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
    const rfNodes = useMemo(() =>
        nodes.map(n => ({
            id: n.id,
            data: {
                label: n.label || n.id,
                color: n.color || ACCENT,
                icon: n.overlay_icon || n.group,
                img: n.img,
            },
            position: { x: Math.random() * 400, y: Math.random() * 400 },
        })), [nodes]);

    const rfEdges = useMemo(() =>
        edges.map((e, i) => ({
            id: `${e.source}-${e.target}-${i}`,
            source: e.source,
            target: e.target,
            label: e.label,
            style: { stroke: e.color || `${ACCENT}60` },
        })), [edges]);

    return (
        <div style={{ width: '100%', height: 500 }}>
            <ReactFlowProvider>
                <ReactFlow nodes={rfNodes} edges={rfEdges} fitView>
                    <Background color="#ffffff10" gap={16} />
                </ReactFlow>
            </ReactFlowProvider>
        </div>
    );
}

// ─── DatabasePanel (#1) — SQLite viewer via sql.js ────────────────────────────

export function DatabasePanel({ agentFileId, filename }: { agentFileId: string; filename?: string }) {
    const [db, setDb] = useState<any>(null);
    const [tables, setTables] = useState<string[]>([]);
    const [sql, setSql] = useState('');
    const [results, setResults] = useState<{ columns: string[]; values: any[][] } | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const initSqlJs = (await import('sql.js')).default;
                const SQL = await initSqlJs({ locateFile: (f: string) => `https://sql.js.org/dist/${f}` });
                const resp = await fetch(`/api/v1.4/files/download/${agentFileId}`);
                const buf = await resp.arrayBuffer();
                const database = new SQL.Database(new Uint8Array(buf));
                if (cancelled) return;
                setDb(database);
                // list tables
                const res = database.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
                if (res.length > 0) setTables(res[0].values.map((r: any[]) => String(r[0])));
                setLoading(false);
            } catch (e: any) {
                if (!cancelled) {
                    setError(e?.message || 'Failed to load database');
                    setLoading(false);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [agentFileId]);

    const runQuery = useCallback(() => {
        if (!db || !sql.trim()) return;
        try {
            const res = db.exec(sql);
            if (res.length > 0) {
                setResults(res[0]);
                setError('');
            } else {
                setResults(null);
                setError('Query returned no results');
            }
        } catch (e: any) {
            setError(e?.message || 'Query error');
            setResults(null);
        }
    }, [db, sql]);

    const exportCsv = useCallback(() => {
        if (!results) return;
        const esc = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
        const csv = [results.columns.join(','), ...results.values.map(row => row.map(c => esc(String(c ?? ''))).join(','))].join('\n');
        navigator.clipboard.writeText(csv);
    }, [results]);

    return (
        <OutputPanel icon={<Database size={11}/>} label="DATABASE" accent={AMBER}>
            {loading && <div className="font-mono text-[10px]" style={{ color: '#555' }}>Loading database…</div>}
            {error && !loading && <div className="font-mono text-[10px]" style={{ color: '#f87171' }}>{error}</div>}
            {!loading && db && (
                <div className="space-y-3">
                    {/* Table list */}
                    <div className="flex flex-wrap gap-1">
                        {tables.map(t => (
                            <button key={t} onClick={() => { setSql(`SELECT * FROM "${t}" LIMIT 100`); }}
                                className="px-2 py-0.5 font-mono text-[10px] rounded-sm border transition-colors hover:opacity-80"
                                style={{ color: ACCENT, borderColor: `${ACCENT}30`, background: `${ACCENT}08` }}>
                                {t}
                            </button>
                        ))}
                    </div>
                    {/* SQL editor */}
                    <div className="flex gap-2">
                        <input value={sql} onChange={e => setSql(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') runQuery(); }}
                            placeholder="SELECT * FROM ..."
                            className="flex-1 px-2 py-1 font-mono text-[11px] rounded-sm border"
                            style={{ background: '#0d0d0d', color: '#ccc', borderColor: '#ffffff15' }}/>
                        <button onClick={runQuery}
                            className="px-3 py-1 font-mono text-[10px] rounded-sm border transition-colors"
                            style={{ color: ACCENT, borderColor: `${ACCENT}40`, background: `${ACCENT}10` }}>
                            Run
                        </button>
                        {results && (
                            <button onClick={exportCsv} title="Copy CSV"
                                className="px-2 py-1 font-mono text-[10px] rounded-sm border transition-colors"
                                style={{ color: '#888', borderColor: '#ffffff15', background: '#ffffff08' }}>
                                <Clipboard size={10}/>
                            </button>
                        )}
                    </div>
                    {/* Results table */}
                    {results && (
                        <div className="overflow-auto border border-white/10 rounded-sm" style={{ maxHeight: 400 }}>
                            <table className="w-full text-left font-mono text-[10px]">
                                <thead>
                                    <tr style={{ background: '#ffffff06' }}>
                                        {results.columns.map(c => (
                                            <th key={c} className="px-2 py-1.5 whitespace-nowrap" style={{ color: `${ACCENT}90`, borderBottom: '1px solid #ffffff10' }}>{c}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.values.map((row, ri) => (
                                        <tr key={ri} className="hover:bg-white/[0.02]">
                                            {row.map((cell, ci) => (
                                                <td key={ci} className="px-2 py-1 whitespace-nowrap" style={{ color: '#aaa', borderBottom: '1px solid #ffffff06' }}>{String(cell ?? '')}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </OutputPanel>
    );
}

// ─── JsonPanel ────────────────────────────────────────────────────────────────

export function JsonPanel({ data }: { data: object }) {
    const entries = Object.entries(data);
    return (
        <OutputPanel icon={<Hash size={11}/>} label="JSON" count={entries.length}>
            <div className="grid gap-px" style={{ gridTemplateColumns: 'auto 1fr' }}>
                {entries.map(([k, v]) => (
                    <React.Fragment key={k}>
                        <div className="pr-4 py-1 font-mono text-[11px] font-semibold whitespace-nowrap align-top"
                            style={{ color: '#00ffd177' }}>
                            {k}
                        </div>
                        <div className="py-1 font-mono text-[11.5px] break-all"
                            style={{
                                color: typeof v === 'number' ? '#a8d8ff'
                                    : typeof v === 'boolean' ? (v ? '#88ff88' : '#ff8888')
                                    : '#ccc',
                            }}>
                            {v === null || v === undefined
                                ? <span style={{ color: '#444' }}>—</span>
                                : typeof v === 'object'
                                    ? <span style={{ color: '#555' }}>{JSON.stringify(v)}</span>
                                    : String(v)}
                        </div>
                    </React.Fragment>
                ))}
            </div>
        </OutputPanel>
    );
}

// ─── ParsedOutput ─────────────────────────────────────────────────────────────

export interface ParsedOutputProps {
    /** Pre-decoded text string (already passed through b64Decode) */
    text?: string;
    /** Pass a pre-parsed object directly to skip JSON.parse (e.g. browser script result) */
    data?: any;
    isError?: boolean;
}

/**
 * ParsedOutput: auto-detects the shape of a decoded Mythic response and
 * renders the appropriate panel(s).
 *
 * Detection order:
 *   1. Error text → TerminalPanel (red)
 *   2. Non-JSON / empty → TerminalPanel
 *   3. Mythic browser-script object → plaintext + table[] + process_list + files + screenshot[] + download[]
 *   4. Array of objects → AutoTable inside OutputPanel
 *   5. Array of primitives → TerminalPanel
 *   6. Unrecognised object → JsonPanel
 */
export function ParsedOutput({ text = '', data: dataProp, isError }: ParsedOutputProps) {
    const parsed = useMemo(() => {
        if (dataProp !== undefined) return dataProp;
        if (!text.trim()) return null;
        try { return JSON.parse(text); } catch { return null; }
    }, [dataProp, text]);

    if (isError) return <TerminalPanel text={text} isError/>;
    if (!parsed)  return <TerminalPanel text={text}/>;

    // ── Mythic browser-script shape ──────────────────────────────────────────
    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        const hasMythicKey = (
            'plaintext'    in parsed ||
            'table'        in parsed ||
            'screenshot'   in parsed ||
            'download'     in parsed ||
            'process_list' in parsed ||
            'files'        in parsed ||
            'file_browser' in parsed
        );

        if (hasMythicKey) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sections: any[] = [];

            if (parsed.plaintext !== undefined)
                sections.push(<TerminalPanel key="pt" text={String(parsed.plaintext)}/>);

            if (Array.isArray(parsed.table))
                (parsed.table as MythicTableDef[]).forEach((tbl, i) =>
                    sections.push(<MythicTable key={`tbl-${i}`} tbl={tbl}/>));

            if (Array.isArray(parsed.process_list))
                sections.push(<ProcessPanel key="pl" procs={parsed.process_list}/>);

            if (Array.isArray(parsed.files))
                sections.push(<FilesPanel key="files" files={parsed.files}/>);

            if (parsed.file_browser?.files)
                sections.push(<FilesPanel key="fb" files={parsed.file_browser.files}/>);

            if (Array.isArray(parsed.screenshot))
                sections.push(<ScreenshotPanel key="scr" screenshots={parsed.screenshot}/>);

            if (Array.isArray(parsed.download))
                sections.push(<DownloadPanel key="dl" downloads={parsed.download}/>);

            return sections.length > 0 ? <>{sections}</> : <JsonPanel data={parsed}/>;
        }

        // unrecognised object
        return <JsonPanel data={parsed}/>;
    }

    // ── Array of objects → auto table ────────────────────────────────────────
    if (Array.isArray(parsed) && parsed.length > 0 &&
        typeof parsed[0] === 'object' && parsed[0] !== null) {
        return (
            <OutputPanel icon={<Database size={11}/>} label="TABLE" count={parsed.length}>
                <AutoTable rows={parsed}/>
            </OutputPanel>
        );
    }

    // ── Array of primitives ───────────────────────────────────────────────────
    if (Array.isArray(parsed))
        return <TerminalPanel text={parsed.map(String).join('\n')}/>;

    return <TerminalPanel text={text}/>;
}

// ─── BrowserScriptOutput ─────────────────────────────────────────────────────
// Full browser-script data renderer — mirrors Console.tsx's bsd rendering
// pipeline exactly. Use this instead of ParsedOutput when browserScriptData
// is available (i.e. the command has a registered browser script).

export function BrowserScriptOutput({ bsd }: { bsd: any }) {
    const [expandedScreenshot, setExpandedScreenshot] =
        useState<{ src: string; alt: string } | null>(null);
    const [activeTab, setActiveTab] = useState(0);

    useEffect(() => {
        if (!expandedScreenshot) return;
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedScreenshot(null); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [expandedScreenshot]);

    // Reset tab index when bsd changes
    useEffect(() => { setActiveTab(0); }, [bsd]);

    return (
        <div className="space-y-2">
            {/* plaintext */}
            {bsd.plaintext !== undefined && (
                <TerminalPanel text={String(bsd.plaintext)}/>
            )}

            {/* table[] */}
            {Array.isArray(bsd.table) && bsd.table.map((tbl: any, i: number) => (
                <MythicTable key={i} tbl={tbl}/>
            ))}

            {/* process_list */}
            {Array.isArray(bsd.process_list) && (
                <ProcessPanel procs={bsd.process_list}/>
            )}

            {/* files / file_browser */}
            {Array.isArray(bsd.files) && (
                <FilesPanel files={bsd.files}/>
            )}
            {bsd.file_browser?.files && (
                <FilesPanel files={bsd.file_browser.files}/>
            )}

            {/* download[] */}
            {Array.isArray(bsd.download) && (
                <DownloadPanel downloads={bsd.download}/>
            )}

            {/* screenshot[] — with click-to-expand */}
            {Array.isArray(bsd.screenshot) && bsd.screenshot.length > 0 && (
                <OutputPanel
                    icon={<ExternalLink size={11}/>}
                    label="SCREENSHOT"
                    accent={PURPLE}
                    count={bsd.screenshot.length > 1 ? bsd.screenshot.length : undefined}>
                    <div className="space-y-3">
                        {bsd.screenshot.map((scr: any, i: number) => {
                            const src = `/api/v1.4/files/download/${scr.agent_file_id}`;
                            const alt = scr.plaintext || `Screenshot ${i + 1}`;
                            return (
                                <div key={i}>
                                    {scr.plaintext && (
                                        <div className="font-mono text-[11px] mb-1.5 pb-1 border-b"
                                            style={{ color: '#998', borderColor: `${PURPLE}22` }}>
                                            {scr.plaintext}
                                        </div>
                                    )}
                                    <img
                                        src={src} alt={alt}
                                        className="rounded-sm border w-full object-contain cursor-zoom-in transition-opacity hover:opacity-90"
                                        style={{ borderColor: `${PURPLE}33`, maxHeight: 340 }}
                                        onClick={() => setExpandedScreenshot({ src, alt })}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </OutputPanel>
            )}

            {/* media[] — inline audio/video player */}
            {Array.isArray(bsd.media) && bsd.media.map((m: any, i: number) => {
                const src = `/api/v1.4/files/download/${m.agent_file_id}`;
                const name: string = (m.name || m.plaintext || '').toLowerCase();
                const isAudio = /\.(mp3|ogg|wav|aac|flac|m4a)$/.test(name);
                const isVideo = /\.(mp4|webm|ogv|mov|avi|mkv)$/.test(name);
                return (
                    <OutputPanel key={i} icon={<ExternalLink size={11}/>} label="MEDIA">
                        {m.plaintext && (
                            <div className="font-mono text-[11px] mb-2" style={{ color: '#aaa' }}>{m.plaintext}</div>
                        )}
                        {isAudio ? (
                            <audio controls src={src} className="w-full h-8 max-w-sm"/>
                        ) : isVideo ? (
                            <video controls src={src}
                                className="max-w-full rounded-sm border border-white/10"
                                style={{ maxHeight: 240 }}/>
                        ) : (
                            <a href={src} target="_blank" rel="noreferrer"
                                className="font-mono text-[11px] flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                                style={{ color: ACCENT }}>
                                ↗ View Media
                            </a>
                        )}
                    </OutputPanel>
                );
            })}

            {/* #3 — search[] — clickable Mythic search links */}
            {Array.isArray(bsd.search) && bsd.search.length > 0 && (
                <OutputPanel icon={<Search size={11}/>} label="SEARCH LINKS" count={bsd.search.length}>
                    <div className="space-y-1.5">
                        {bsd.search.map((s: any, i: number) => {
                            const label = s.name || s.plaintext || JSON.stringify(s);
                            const query = s.search || s.plaintext || '';
                            const href = `${window.location.origin}/new/search/?${query}`;
                            return (
                                <div key={i} className="flex items-start gap-2">
                                    {s.plaintext && (
                                        <span className="font-mono text-[11px]" style={{ color: '#ccc' }}>{s.plaintext}</span>
                                    )}
                                    <a href={href} target="_blank" rel="noreferrer"
                                        className="font-mono text-[11px] flex items-center gap-1 hover:underline transition-colors"
                                        style={{ color: ACCENT }}
                                        title={s.hoverText || 'View on Search Page'}>
                                        <Search size={9} className="shrink-0"/>
                                        {label}
                                    </a>
                                </div>
                            );
                        })}
                    </div>
                </OutputPanel>
            )}

            {/* #2 — graph — dagre-style hierarchical layout with node icons & #18 auto-hide >50 */}
            {bsd.graph && (() => {
                type GNode = { id: string; label?: string; color?: string; img?: string; overlay_icon?: string; group?: string };
                type GEdge = { source: string; target: string; label?: string; color?: string };
                const gnodes: GNode[] = Array.isArray(bsd.graph.nodes) ? bsd.graph.nodes : [];
                const gedges: GEdge[] = Array.isArray(bsd.graph.edges) ? bsd.graph.edges : [];
                if (!gnodes.length) {
                    return (
                        <OutputPanel icon={<Network size={11}/>} label="GRAPH">
                            <pre className="font-mono text-[9px] overflow-auto max-h-40"
                                style={{ color: '#555' }}>{JSON.stringify(bsd.graph, null, 2)}</pre>
                        </OutputPanel>
                    );
                }
                return <GraphPanel nodes={gnodes} edges={gedges} rankDir={bsd.graph.rankDir || bsd.graph.group_by ? 'TB' : 'LR'} />;
            })()}

            {/* #20 — tabs[] — full-featured tab switcher with all nested types */}
            {Array.isArray(bsd.tabs) && bsd.tabs.length > 0 && (() => {
                const currentTab = bsd.tabs[activeTab] || bsd.tabs[0];
                const renderTabContent = (t: any) => (
                    <div className="space-y-2">
                        {t.plaintext !== undefined && t.plaintext !== '' && <TerminalPanel text={String(t.plaintext)}/>}
                        {Array.isArray(t.table) && t.table.map((tbl: any, i: number) => <MythicTable key={i} tbl={tbl}/>)}
                        {Array.isArray(t.process_list) && <ProcessPanel procs={t.process_list}/>}
                        {Array.isArray(t.files) && <FilesPanel files={t.files}/>}
                        {t.file_browser?.files && <FilesPanel files={t.file_browser.files}/>}
                        {Array.isArray(t.download) && <DownloadPanel downloads={t.download}/>}
                        {t.screenshot?.agent_file_id && (
                            <img src={`/api/v1.4/files/download/${t.screenshot.agent_file_id}`}
                                alt={t.screenshot.filename || 'screenshot'}
                                className="max-w-full rounded-sm border border-white/10 cursor-zoom-in" style={{ maxHeight: 300 }}
                                onClick={() => setExpandedScreenshot({ src: `/api/v1.4/files/download/${t.screenshot.agent_file_id}`, alt: t.screenshot.filename || '' })} />
                        )}
                        {Array.isArray(t.screenshot) && t.screenshot.length > 0 && (
                            <ScreenshotPanel screenshots={t.screenshot}/>
                        )}
                        {Array.isArray(t.media) && t.media.map((m: any, mi: number) => {
                            const src = `/api/v1.4/files/download/${m.agent_file_id}`;
                            const name: string = (m.name || m.plaintext || '').toLowerCase();
                            return <div key={mi}>{/\.(mp3|ogg|wav|aac|flac|m4a)$/.test(name) ? <audio controls src={src} className="w-full h-8 max-w-sm"/> : /\.(mp4|webm|ogv|mov)$/.test(name) ? <video controls src={src} className="max-w-full border border-white/10" style={{maxHeight:240}}/> : <a href={src} target="_blank" rel="noreferrer" className="text-[11px] flex items-center gap-1 hover:opacity-80" style={{color:ACCENT}}>↗ View Media</a>}</div>;
                        })}
                        {Array.isArray(t.search) && t.search.length > 0 && t.search.map((s: any, si: number) => {
                            const href = `${window.location.origin}/new/search/?${s.search || s.plaintext || ''}`;
                            return <a key={si} href={href} target="_blank" rel="noreferrer" className="font-mono text-[11px] flex items-center gap-1 hover:underline" style={{color:ACCENT}}><Search size={9}/>{s.name || s.plaintext || ''}</a>;
                        })}
                    </div>
                );
                return (
                    <OutputPanel icon={<Layers size={11}/>} label="TABS" count={bsd.tabs.length}>
                        <div className="flex gap-0 flex-wrap border-b mb-2" style={{ borderColor: '#ffffff10' }}>
                            {bsd.tabs.map((t: any, ti: number) => (
                                <button key={ti} onClick={() => setActiveTab(ti)}
                                    className="px-3 py-1.5 font-mono text-[10px] border-b-2 transition-colors"
                                    style={ti === activeTab
                                        ? { borderColor: ACCENT, color: ACCENT, background: '#00ffd108' }
                                        : { borderColor: 'transparent', color: '#555' }}>
                                    {t.title || `Tab ${ti + 1}`}
                                </button>
                            ))}
                        </div>
                        {renderTabContent(currentTab)}
                    </OutputPanel>
                );
            })()}

            {/* Screenshot fullscreen modal */}
            {expandedScreenshot && (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.85)' }}
                    onClick={() => setExpandedScreenshot(null)}>
                    <div
                        className="flex flex-col rounded-sm overflow-hidden shadow-2xl max-w-[90vw] max-h-[90vh]"
                        style={{ background: '#0a0a0a', border: `1px solid ${PURPLE}40` }}
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0"
                            style={{ borderColor: `${PURPLE}22`, background: `${PURPLE}09` }}>
                            <span className="font-mono text-[10px] text-gray-400">{expandedScreenshot.alt}</span>
                            <div className="flex items-center gap-2">
                                <a href={expandedScreenshot.src} download target="_blank" rel="noreferrer"
                                    className="font-mono text-[10px] px-2 py-0.5 rounded-sm border transition-opacity hover:opacity-80"
                                    style={{ color: AMBER, borderColor: `${AMBER}30`, background: `${AMBER}10` }}>
                                    ↓ save
                                </a>
                                <button onClick={() => setExpandedScreenshot(null)}
                                    className="text-gray-500 hover:text-white transition-colors p-0.5">
                                    <X size={14}/>
                                </button>
                            </div>
                        </div>
                        <img src={expandedScreenshot.src} alt={expandedScreenshot.alt}
                            className="block max-w-full max-h-[80vh] object-contain"/>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── IfconfigPanel ───────────────────────────────────────────────────────────

export function IfconfigPanel({ adapters }: { adapters: any[] }) {
    return (
        <OutputPanel icon={<Wifi size={11}/>} label="NETWORK INTERFACES" count={adapters.length}>
            <div className="space-y-2">
                {adapters.map((iface: any, i: number) => (
                    <div key={i} className="border rounded px-3 py-2"
                        style={{ background: '#080808', borderColor: '#ffffff0f' }}>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <Wifi size={12} style={{ color: iface.Status === 'Up' ? ACCENT : '#555' }}/>
                            <span className="font-mono text-xs font-bold" style={{ color: '#fff' }}>
                                {iface.AdapterName}
                            </span>
                            <span className="font-mono text-[9px] px-1.5 py-0.5 uppercase font-bold border rounded-sm"
                                style={iface.Status === 'Up'
                                    ? { color: ACCENT, borderColor: `${ACCENT}40`, background: `${ACCENT}10` }
                                    : { color: '#555', borderColor: '#333', background: '#1a1a1a' }}>
                                {iface.Status}
                            </span>
                            {iface.Description && (
                                <span className="font-mono text-[10px]" style={{ color: '#555' }}>{iface.Description}</span>
                            )}
                        </div>
                        <div className="grid text-[11px] gap-x-6 gap-y-0.5"
                            style={{ gridTemplateColumns: 'auto 1fr' }}>
                            {iface.AdressesV4?.filter(Boolean).length > 0 && (
                                <><span style={{ color: '#666' }}>IPv4</span><span style={{ color: '#7ab8ff' }}>{iface.AdressesV4.join(', ')}</span></>
                            )}
                            {iface.AdressesV6?.filter(Boolean).length > 0 && (
                                <><span style={{ color: '#666' }}>IPv6</span><span style={{ color: '#6be5c3' }}>{iface.AdressesV6.join(', ')}</span></>
                            )}
                            {iface.Gateways?.filter(Boolean).length > 0 && (
                                <><span style={{ color: '#666' }}>Gateway</span><span style={{ color: '#ffd080' }}>{iface.Gateways.join(', ')}</span></>
                            )}
                            {iface.DnsServers?.filter(Boolean).length > 0 && (
                                <><span style={{ color: '#666' }}>DNS</span><span style={{ color: '#c0a0ff' }}>{iface.DnsServers.join(', ')}</span></>
                            )}
                            {iface.DhcpAddresses?.filter(Boolean).length > 0 && (
                                <><span style={{ color: '#666' }}>DHCP</span><span style={{ color: '#ffb870' }}>{iface.DhcpAddresses.join(', ')}</span></>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </OutputPanel>
    );
}

// ─── NetstatPanel ─────────────────────────────────────────────────────────────

export function NetstatPanel({ rows }: { rows: any[] }) {
    const STATE_CLS: Record<string, { color: string; bg: string; border: string }> = {
        Established: { color: ACCENT,    bg: `${ACCENT}10`,   border: `${ACCENT}40` },
        Listen:      { color: '#555',    bg: '#1a1a1a',       border: '#333' },
        CloseWait:   { color: '#ffb870', bg: '#ffb87010',     border: '#ffb87040' },
        SynSent:     { color: '#ffd080', bg: '#ffd08010',     border: '#ffd08040' },
        TimeWait:    { color: '#ff7070', bg: '#ff707010',     border: '#ff707040' },
        FinWait1:    { color: '#ff7070', bg: '#ff707010',     border: '#ff707040' },
        FinWait2:    { color: '#ff7070', bg: '#ff707010',     border: '#ff707040' },
        SynReceived: { color: '#ffd080', bg: '#ffd08010',     border: '#ffd08040' },
    };
    const PORT_KNOWN: Record<number, string> = {
        80:'HTTP', 443:'HTTPS', 22:'SSH', 21:'FTP', 3389:'RDP', 445:'SMB', 135:'RPC',
        139:'NetBIOS', 1433:'MSSQL', 5985:'WinRM', 5986:'WinRM-TLS', 3306:'MySQL',
        5432:'PG', 8080:'HTTP-ALT', 8443:'HTTPS-ALT', 25:'SMTP', 53:'DNS', 123:'NTP',
    };
    const PORT_HL: Record<number, string> = {
        3389:'#ffa040', 445:'#ff6060', 1433:'#ffa040', 5985:'#ffa040', 5986:'#ffa040',
        22: ACCENT, 80:'#7ab8ff', 443:'#7ab8ff', 135:'#ffd080',
    };
    const seenKey = new Set<string>();
    const deduped: any[] = [];
    for (const row of rows) {
        if (row.state === 'Listen' || row.state === null) {
            const k = `${row.protocol}-${row.local_port}`;
            if (seenKey.has(k)) continue;
            seenKey.add(k);
        }
        deduped.push(row);
    }
    const tcpActive = deduped.filter(r => r.protocol === 'TCP' && r.state !== 'Listen').sort((a, b) => a.local_port - b.local_port);
    const tcpListen = deduped.filter(r => r.protocol === 'TCP' && r.state === 'Listen').sort((a, b) => a.local_port - b.local_port);
    const udpRows   = deduped.filter(r => r.protocol === 'UDP').sort((a, b) => a.local_port - b.local_port);

    const AddrCell = ({ addr, port, dim }: { addr: string; port: number; dim?: boolean }) => {
        const clean = addr.replace(/^\[(.+)\]$/, '$1');
        const label = PORT_KNOWN[port];
        const hlColor = PORT_HL[port];
        return (
            <span className="flex items-baseline gap-1 font-mono">
                <span className="truncate max-w-[100px]" style={{ color: dim ? '#333' : '#888' }}>{clean}</span>
                <span style={{ color: '#333' }}>:</span>
                <span className="font-bold shrink-0" style={{ color: hlColor || (dim ? '#555' : '#ccc') }}>{port}</span>
                {label && <span className="text-[9px] shrink-0" style={{ color: '#555' }}>{label}</span>}
            </span>
        );
    };
    const TableHeader = () => (
        <div className="grid gap-x-3 px-2 py-0.5 border-b text-[9px] uppercase tracking-wider select-none"
            style={{ borderColor: '#ffffff10', color: '#444', gridTemplateColumns: '3rem 1fr 1fr 5.5rem 3.5rem' }}>
            <span>Proto</span><span>Local</span><span>Remote</span><span>State</span><span>PID</span>
        </div>
    );
    const NetRow = ({ row }: { row: any }) => {
        const st = row.state ? (STATE_CLS[row.state] || { color: '#aaa', bg: '#1a1a1a', border: '#333' }) : null;
        return (
            <div className="grid gap-x-3 px-2 py-0.5 items-center text-[10px] transition-colors hover:bg-white/5"
                style={{ gridTemplateColumns: '3rem 1fr 1fr 5.5rem 3.5rem' }}>
                <span className="font-mono font-bold text-[9px] uppercase"
                    style={{ color: row.protocol === 'TCP' ? '#7ab8ff' : '#c0a0ff' }}>
                    {row.protocol}{row.ip_version === 6 ? '6' : '4'}
                </span>
                <AddrCell addr={row.local_address} port={row.local_port}/>
                <AddrCell addr={row.remote_address} port={row.remote_port} dim={row.remote_port === 0}/>
                {st ? (
                    <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 border rounded-sm w-fit"
                        style={{ color: st.color, background: st.bg, borderColor: st.border }}>
                        {row.state.toUpperCase()}
                    </span>
                ) : <span style={{ color: '#333' }}>—</span>}
                <span className="font-mono" style={{ color: row.state === 'Listen' ? '#444' : '#888' }}>
                    {row.pid || '—'}
                </span>
            </div>
        );
    };
    const Section = ({ label, items, color, icon, defaultOpen }: { label: string; items: any[]; color: string; icon: React.ReactNode; defaultOpen?: boolean }) => {
        const [open, setOpen] = useState(!!defaultOpen);
        return (
            <div className="border rounded overflow-hidden" style={{ borderColor: '#ffffff10', background: '#080808' }}>
                <button className="w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                    onClick={() => setOpen(o => !o)}>
                    <span style={{ color }}>{icon}</span>
                    <span className="font-mono font-bold text-[10px] uppercase tracking-widest" style={{ color }}>{label}</span>
                    <span className="text-[10px]" style={{ color: '#444' }}>({items.length})</span>
                    <ChevronRight size={10} className="ml-auto transition-transform" style={{ color: '#444', transform: open ? 'rotate(90deg)' : 'none' }}/>
                </button>
                {open && (<><TableHeader/>{items.map((r, i) => <NetRow key={i} row={r}/>)}</>)}
            </div>
        );
    };
    return (
        <OutputPanel icon={<Network size={11}/>} label="NETSTAT" count={deduped.length}>
            <div className="space-y-2">
                {tcpActive.length > 0 && (
                    <Section label="Active Connections" items={tcpActive} color={ACCENT} icon={<Activity size={11}/>} defaultOpen/>
                )}
                {tcpListen.length > 0 && (
                    <Section label="Listening Ports" items={tcpListen} color="#7ab8ff" icon={<Network size={11} style={{ color: '#7ab8ff' }}/>} defaultOpen={tcpActive.length === 0}/>
                )}
                {udpRows.length > 0 && (
                    <Section label="UDP" items={udpRows} color="#c0a0ff" icon={<Wifi size={11} style={{ color: '#c0a0ff' }}/>}/>
                )}
            </div>
        </OutputPanel>
    );
}

// ─── ProcessDetailPanel ───────────────────────────────────────────────────────

function ProcessDetailItem({ p }: { p: any }) {
    const [open, setOpen] = React.useState(false);
    return (
        <div className="border rounded px-2 py-1.5 transition-colors"
            style={{ border: '1px solid #ffffff0a', background: '#080808' }}>
            <button className="w-full flex items-center gap-3 text-left" onClick={() => setOpen(o => !o)}>
                <ChevronRight size={10} className="shrink-0 transition-transform"
                    style={{ color: '#555', transform: open ? 'rotate(90deg)' : 'none' }}/>
                <span className="font-mono font-bold text-xs truncate" style={{ color: '#e0e0e0' }}>
                    {p.name || '(unknown)'}
                </span>
                <span className="font-mono text-[11px]" style={{ color: '#777' }}>PID {p.process_id}</span>
                {p.user && <span className="font-mono text-[10px] ml-auto shrink-0" style={{ color: '#888' }}>{p.user}</span>}
            </button>
            {open && (
                <div className="mt-1.5 pl-4 space-y-0.5 font-mono text-[11px]" style={{ color: '#999' }}>
                    {p.description  && <div><span style={{ color: '#555' }}>Desc: </span>{p.description}</div>}
                    {p.bin_path     && <div><span style={{ color: '#555' }}>Bin: </span>{p.bin_path}</div>}
                    {p.command_line && <div><span style={{ color: '#555' }}>Cmd: </span>{p.command_line}</div>}
                </div>
            )}
        </div>
    );
}

export function ProcessDetailPanel({ procs }: { procs: any[] }) {
    return (
        <OutputPanel icon={<Layers size={11}/>} label="PROCESS LIST" count={procs.length}>
            <div className="space-y-1">
                {procs.map((p: any, i: number) => <ProcessDetailItem key={i} p={p} />)}
            </div>
        </OutputPanel>
    );
}

// ─── DirectoryPanel ───────────────────────────────────────────────────────────

export function DirectoryPanel({ directory, host, files }: { directory: string; host?: string; files: any[] }) {
    return (
        <OutputPanel icon={<Folder size={11}/>} label={directory} count={files.length}>
            {/* Header row */}
            <div className="grid gap-x-3 px-1 py-0.5 border-b font-mono text-[9px] uppercase tracking-wider select-none mb-0.5"
                style={{ borderColor: `${ACCENT}18`, color: '#555',
                    gridTemplateColumns: '1.2rem 1fr 7rem 8rem 5rem 7rem' }}>
                <span/><span>Name</span><span>Permissions</span><span>Owner:Group</span>
                <span className="text-right">Size</span><span>Modified</span>
            </div>
            <div className="space-y-0">
                {files.map((f: any, idx: number) => {
                    const perms    = typeof f.permissions === 'object' && f.permissions !== null && !Array.isArray(f.permissions) ? f.permissions : {};
                    const permStr  = perms.permissions || '---------';
                    const typeChar = !f.is_file ? 'd' : (perms.symlink ? 'l' : '-');
                    const fullPerm = typeChar + permStr;
                    const owner    = perms.user  || String(perms.uid ?? '—');
                    const group    = perms.group || String(perms.gid ?? '—');
                    const modTime  = fmtUnixTime(f.modify_time);
                    const isDir    = !f.is_file;
                    const isLink   = !!perms.symlink;
                    const displayName = isLink ? `${f.name} → ${perms.symlink}` : f.name;
                    return (
                        <div key={idx} className="grid gap-x-3 px-1 py-0.5 rounded font-mono text-[11px] items-center transition-colors hover:bg-white/5"
                            style={{ gridTemplateColumns: '1.2rem 1fr 7rem 8rem 5rem 7rem' }}>
                            <span>{isDir ? '📁' : isLink ? '🔗' : '📄'}</span>
                            <span className="truncate font-bold"
                                style={{ color: isDir ? '#ffd080' : isLink ? '#7ab8ff' : '#aaddff' }}
                                title={f.full_name || f.name}>{displayName}</span>
                            <span style={{ color: '#5a5' }}>{fullPerm}</span>
                            <span className="truncate" style={{ color: '#c0a0ff' }}>
                                {owner}<span style={{ color: '#333' }}>:</span>{group}
                            </span>
                            <span className="text-right tabular-nums" style={{ color: '#aaa' }}>
                                {f.is_file ? fmtBytes(f.size) : '—'}
                            </span>
                            <span className="tabular-nums" style={{ color: '#555' }}>{modTime}</span>
                        </div>
                    );
                })}
            </div>
            {host && (
                <div className="mt-1 font-mono text-[10px]" style={{ color: '#444' }}>host: {host}</div>
            )}
        </OutputPanel>
    );
}

// ─── Mimikatz parsers ────────────────────────────────────────────────────────
const mzParseSam = (body: string) => {
    const users: { rid: string; name: string; ntlm: string; ntlmHist: string[] }[] = [];
    body.split(/(?=RID\s+:)/).forEach(block => {
        const rM = block.match(/RID\s+:\s+\S+\s+\((\d+)\)/);
        const nM = block.match(/User\s+:\s+(\S+)/);
        const hM = block.match(/Hash NTLM:\s*([a-f0-9]{32})/i);
        if (rM && nM) {
            const hist = [...block.matchAll(/ntlm-\s*\d+:\s*([a-f0-9]{32})/gi)].map(m => m[1]);
            users.push({ rid: rM[1], name: nM[1].trim(), ntlm: hM ? hM[1] : '', ntlmHist: hist });
        }
    });
    return users;
};
const mzParseSecrets = (body: string) =>
    body.split(/\nSecret\s+:/).slice(1).map(block => {
        const nl2 = block.indexOf('\n');
        const name = block.substring(0, nl2).trim();
        return {
            name,
            curText: block.match(/cur\/text:\s*(.+)/)?.[1].trim(),
            curNtlm: block.match(/NTLM:([a-f0-9]{32})/i)?.[1],
            curSha1: block.match(/SHA1:([a-f0-9]+)/i)?.[1],
            oldText: block.match(/old\/text:\s*(.+)/)?.[1].trim(),
            error:   block.match(/ERROR\s+(.+)/)?.[0].trim(),
        };
    });
const mzParseCache = (body: string) =>
    body.split(/(?=\[NL\$)/).flatMap(block => {
        const sM = block.match(/\[(NL\$\d+)\s+-\s+([^\]]+)\]/);
        const uM = block.match(/User\s+:\s*([^\n]+)/);
        const hM = block.match(/MsCacheV2\s+:\s*([a-f0-9]+)/i);
        return (sM && uM && hM) ? [{ slot: sM[1], date: sM[2].trim(), user: uM[1].trim(), hash: hM[1].trim() }] : [];
    });
const mzParseLogon = (body: string) =>
    body.split(/Authentication Id\s*:/).slice(1).flatMap(block => {
        const uM = block.match(/User Name\s+:\s*(.+)/);
        if (!uM || uM[1].trim() === '(null)') return [];
        const dM  = block.match(/Domain\s+:\s*(.+)/);
        const nM  = block.match(/\*\s+NTLM\s*:\s*([a-f0-9]{32})/i);
        const sM  = block.match(/\*\s+SHA1\s*:\s*([a-f0-9]+)/i);
        const ptM = block.match(/\*\s+Password\s*:\s*(.+)/);
        return [{ user: uM[1].trim(), domain: dM?.[1].trim() || '', ntlm: nM?.[1], sha1: sM?.[1], plaintext: ptM && ptM[1].trim() !== '(null)' ? ptM[1].trim() : undefined }];
    });
const MZ_CMD_CLS: Record<string, { color: string; border: string; bg: string }> = {
    'privilege::debug':         { color: '#facc15', border: '#ca8a0440', bg: '#713f1210' },
    'sekurlsa::logonpasswords': { color: '#f87171', border: '#ef444440', bg: '#450a0a10' },
    'token::elevate':           { color: '#fb923c', border: '#f9731640', bg: '#43140910' },
    'lsadump::sam':             { color: '#f87171', border: '#ef444440', bg: '#450a0a10' },
    'lsadump::secrets':         { color: '#fb923c', border: '#f9731640', bg: '#43140910' },
    'lsadump::cache':           { color: '#fb923c', border: '#f9731640', bg: '#43140910' },
    'vault::cred /patch':       { color: '#facc15', border: '#ca8a0440', bg: '#713f1210' },
};
const isMzSensitiveSecret = (n: string) =>
    !n.startsWith('$MACHINE') && !n.startsWith('DPAPI') && !n.startsWith('NL$') && !n.includes('TELEMETRY');

// ─── MimikatzPanel ────────────────────────────────────────────────────────────
export function MimikatzPanel({ content }: { content: string }) {
    const mzParts = content.split(/mimikatz\(commandline\)\s*#\s*/);
    const mzHeader = mzParts[0];
    const mzSections: { cmd: string; body: string }[] = mzParts.slice(1).map(pt => {
        const nl = pt.indexOf('\n');
        return { cmd: nl >= 0 ? pt.substring(0, nl).trim() : pt.trim(), body: nl >= 0 ? pt.substring(nl + 1) : '' };
    });
    const verM = mzHeader.match(/mimikatz\s+(\d+\.\d+\.\d+[^\s]*)/);
    const mzVer = verM ? verM[1] : null;
    return (
        <div className="space-y-2">
            {/* Banner */}
            <div className="flex items-center gap-2 flex-wrap border-b pb-1.5" style={{ borderColor: '#7f1d1d50' }}>
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm border"
                    style={{ color: '#f87171', borderColor: '#ef444460', background: '#450a0a25' }}>
                    ⚠ MIMIKATZ{mzVer ? ` ${mzVer}` : ''}
                </span>
                <span className="font-mono text-[9px]" style={{ color: '#555' }}>
                    {mzSections.length} command{mzSections.length !== 1 ? 's' : ''}
                </span>
            </div>
            {/* Command sections */}
            {mzSections.map((sec, si) => {
                const cls = MZ_CMD_CLS[sec.cmd] || { color: '#9ca3af', border: '#4b556350', bg: '#1f292e20' };
                const hasErr = /ERROR kuhl/i.test(sec.body);
                const hasOk  = /\bOK\b/.test(sec.body) || /Privilege.*OK/.test(sec.body);
                return (
                    <div key={si} className="border rounded-sm overflow-hidden"
                        style={{ borderColor: '#ffffff08', background: '#00000025' }}>
                        {/* cmd header */}
                        <div className="flex items-center gap-2 px-2 py-1.5 border-b flex-wrap"
                            style={{ background: '#00000030', borderColor: '#ffffff05' }}>
                            <span className="font-mono text-[9px]" style={{ color: '#444' }}>mimikatz #</span>
                            <span className="font-mono text-[9px] font-bold px-2 py-0.5 border rounded-sm"
                                style={{ color: cls.color, borderColor: cls.border, background: cls.bg }}>{sec.cmd}</span>
                            {hasErr && <span className="font-bold text-[9px]" style={{ color: '#ef4444cc' }}>✗ FAILED</span>}
                            {hasOk  && <span className="font-bold text-[9px]" style={{ color: ACCENT }}>✓ OK</span>}
                        </div>
                        <div className="px-3 py-2 text-xs font-mono space-y-1.5">
                            {/* lsadump::sam */}
                            {sec.cmd === 'lsadump::sam' && (() => {
                                const domM = sec.body.match(/Domain\s+:\s*([^\n]+)/);
                                const sysM = sec.body.match(/SysKey\s+:\s*([a-f0-9]+)/i);
                                const samM = sec.body.match(/SAMKey\s+:\s*([a-f0-9]+)/i);
                                const users = mzParseSam(sec.body);
                                return (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pb-1.5 border-b" style={{ borderColor: '#ffffff08' }}>
                                            {domM && <span><span style={{ color: '#555' }}>Domain </span><span style={{ color: '#67e8f9', fontWeight: 700 }}>{domM[1].trim()}</span></span>}
                                            {sysM && <span><span style={{ color: '#555' }}>SysKey </span><span style={{ color: '#9ca3af' }}>{sysM[1]}</span></span>}
                                            {samM && <span><span style={{ color: '#555' }}>SAMKey </span><span style={{ color: '#9ca3af' }}>{samM[1]}</span></span>}
                                        </div>
                                        <div className="space-y-1.5">
                                            {users.map((u, ui) => (
                                                <div key={ui} className="border rounded-sm px-2 py-1.5"
                                                    style={{ borderColor: u.ntlm ? '#ef444440' : '#374151', background: u.ntlm ? '#450a0a20' : '#00000010', opacity: u.ntlm ? 1 : 0.6 }}>
                                                    <div className="flex items-center gap-3 flex-wrap mb-1">
                                                        <span className="font-bold text-sm" style={{ color: '#fff' }}>{u.name}</span>
                                                        <span style={{ color: '#6b7280', fontSize: 10 }}>RID {u.rid}</span>
                                                        {!u.ntlm && <span style={{ color: '#6b7280', fontSize: 10, fontStyle: 'italic' }}>no hash</span>}
                                                    </div>
                                                    {u.ntlm && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold tracking-wider uppercase" style={{ color: '#f87171', fontSize: 10, flexShrink: 0 }}>NTLM</span>
                                                            <span className="select-all tracking-wide break-all flex-1" style={{ color: '#fecaca', fontSize: 13 }}>{u.ntlm}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(u.ntlm)} className="p-0.5 rounded hover:bg-white/10" title="Copy NTLM">
                                                                <Copy size={11} style={{ color: '#555' }}/>
                                                            </button>
                                                        </div>
                                                    )}
                                                    {u.ntlmHist.length > 1 && (
                                                        <details className="mt-1">
                                                            <summary className="cursor-pointer" style={{ color: '#6b7280', fontSize: 10 }}>{u.ntlmHist.length} historical hashes</summary>
                                                            <div className="mt-1 pl-2 border-l space-y-0.5" style={{ borderColor: '#374151' }}>
                                                                {u.ntlmHist.slice(1).map((h, hi) => (
                                                                    <div key={hi} className="flex gap-2" style={{ fontSize: 10 }}>
                                                                        <span style={{ color: '#4b5563', width: 48, flexShrink: 0 }}>ntlm-{hi + 1}</span>
                                                                        <span className="select-all break-all flex-1" style={{ color: '#9ca3af' }}>{h}</span>
                                                                        <button onClick={() => navigator.clipboard.writeText(h)} className="p-0.5 rounded hover:bg-white/10"><Copy size={10} style={{ color: '#4b5563' }}/></button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </details>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                            {/* lsadump::secrets */}
                            {sec.cmd === 'lsadump::secrets' && (() => {
                                const domM  = sec.body.match(/Domain\s+:\s*([^\n]+)/);
                                const fqdnM = sec.body.match(/Domain FQDN\s+:\s*(.+)/);
                                const secrets = mzParseSecrets(sec.body);
                                return (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pb-1.5 border-b" style={{ borderColor: '#ffffff08' }}>
                                            {domM  && <span><span style={{ color: '#555' }}>Domain </span><span style={{ color: '#67e8f9', fontWeight: 700 }}>{domM[1].trim()}</span></span>}
                                            {fqdnM && <span><span style={{ color: '#555' }}>FQDN </span><span style={{ color: '#67e8f9cc' }}>{fqdnM[1].trim()}</span></span>}
                                        </div>
                                        {secrets.map((s, si2) => {
                                            const sens = isMzSensitiveSecret(s.name);
                                            const active = s.curText && sens;
                                            return (
                                                <div key={si2} className="border rounded-sm px-2 py-1.5"
                                                    style={{ borderColor: active ? '#ef444450' : '#374151', background: active ? '#450a0a25' : '#00000010' }}>
                                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                        <Lock size={11} style={{ color: active ? '#f87171' : '#6b7280', flexShrink: 0 }}/>
                                                        <span className="font-bold text-sm" style={{ color: active ? '#fff' : '#9ca3af' }}>{s.name}</span>
                                                    </div>
                                                    {s.error && <div style={{ color: '#f87171', fontSize: 10, marginBottom: 4 }}>{s.error}</div>}
                                                    {s.curText && (
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className="font-bold uppercase tracking-wider" style={{ color: '#4ade80', fontSize: 10, flexShrink: 0 }}>cur</span>
                                                            <span className="select-all break-all flex-1" style={{ color: sens ? '#fecaca' : '#d1d5db', fontWeight: sens ? 700 : 400, fontSize: 13 }}>{s.curText}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.curText!)} className="p-0.5 rounded hover:bg-white/10" title="Copy">
                                                                <Copy size={11} style={{ color: '#555' }}/>
                                                            </button>
                                                        </div>
                                                    )}
                                                    {s.curNtlm && (
                                                        <div className="flex gap-2.5 mt-0.5 items-center">
                                                            <span className="font-bold uppercase" style={{ color: '#f87171', fontSize: 10, flexShrink: 0 }}>NTLM</span>
                                                            <span className="select-all break-all flex-1 tracking-wide" style={{ color: '#fecaca', fontSize: 13 }}>{s.curNtlm}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.curNtlm!)} className="p-0.5 rounded hover:bg-white/10">
                                                                <Copy size={11} style={{ color: '#555' }}/>
                                                            </button>
                                                        </div>
                                                    )}
                                                    {s.curSha1 && <div className="flex gap-2.5 mt-0.5 items-center"><span className="font-bold uppercase" style={{ color: '#6b7280', fontSize: 10, flexShrink: 0 }}>SHA1</span><span className="select-all break-all flex-1" style={{ color: '#9ca3af' }}>{s.curSha1}</span></div>}
                                                    {s.oldText && s.oldText !== s.curText && (
                                                        <div className="flex items-start gap-2 mt-1 pt-1 border-t" style={{ borderColor: '#ffffff08' }}>
                                                            <span className="font-bold uppercase tracking-wider" style={{ color: '#4b5563', fontSize: 10, flexShrink: 0, marginTop: 2 }}>old</span>
                                                            <span className="select-all break-all" style={{ color: '#6b7280' }}>{s.oldText}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                            {/* lsadump::cache */}
                            {sec.cmd === 'lsadump::cache' && (() => {
                                const domM  = sec.body.match(/Domain\s+:\s*([^\n]+)/);
                                const fqdnM = sec.body.match(/Domain FQDN\s+:\s*(.+)/);
                                const creds = mzParseCache(sec.body);
                                return (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pb-1.5 border-b" style={{ borderColor: '#ffffff08' }}>
                                            {domM  && <span><span style={{ color: '#555' }}>Domain </span><span style={{ color: '#67e8f9', fontWeight: 700 }}>{domM[1].trim()}</span></span>}
                                            {fqdnM && <span><span style={{ color: '#555' }}>FQDN </span><span style={{ color: '#67e8f9cc' }}>{fqdnM[1].trim()}</span></span>}
                                        </div>
                                        {creds.length === 0 && <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No cached credentials</div>}
                                        <div className="space-y-1.5">
                                            {creds.map((c, ci) => (
                                                <div key={ci} className="border rounded-sm px-2 py-1.5"
                                                    style={{ borderColor: '#f9731640', background: '#43140920' }}>
                                                    <div className="flex items-center gap-3 flex-wrap mb-1">
                                                        <span className="font-bold text-sm" style={{ color: '#fff' }}>{c.user}</span>
                                                        <span style={{ color: '#6b7280', fontSize: 10 }}>{c.slot}</span>
                                                        <span style={{ color: '#6b7280', fontSize: 10 }}>{c.date}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold uppercase tracking-wider" style={{ color: '#fb923c', fontSize: 10, flexShrink: 0 }}>MsCacheV2</span>
                                                        <span className="select-all break-all flex-1 tracking-wide" style={{ color: '#fed7aa', fontSize: 13 }}>{c.hash}</span>
                                                        <button onClick={() => navigator.clipboard.writeText(c.hash)} className="p-0.5 rounded hover:bg-white/10" title="Copy">
                                                            <Copy size={11} style={{ color: '#555' }}/>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                            {/* sekurlsa::logonpasswords */}
                            {sec.cmd === 'sekurlsa::logonpasswords' && (() => {
                                const sessions = mzParseLogon(sec.body);
                                return (
                                    <div className="space-y-1.5">
                                        {sessions.length === 0 && (
                                            <div style={{ color: '#f87171', fontSize: 10 }}>
                                                {sec.body.split('\n').find((l: string) => l.includes('ERROR')) || 'No credentials extracted'}
                                            </div>
                                        )}
                                        {sessions.map((s, si2) => {
                                            const label = `${s.domain && s.domain !== '(null)' ? s.domain + '\\' : ''}${s.user}`;
                                            return (
                                                <div key={si2} className="border rounded-sm px-2 py-2"
                                                    style={{ borderColor: '#ef444440', background: '#450a0a20' }}>
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <span className="font-bold text-sm flex-1" style={{ color: '#fff' }}>{label}</span>
                                                        {s.plaintext && <span className="font-bold px-1.5 py-0.5 border rounded-sm"
                                                            style={{ color: '#86efac', borderColor: '#22c55e50', background: '#14532d25', fontSize: 10, flexShrink: 0 }}>PLAINTEXT</span>}
                                                    </div>
                                                    {s.plaintext && (
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="font-bold uppercase" style={{ color: '#4ade80', fontSize: 10, flexShrink: 0 }}>PASS</span>
                                                            <span className="font-bold select-all flex-1" style={{ color: '#bbf7d0', fontSize: 13 }}>{s.plaintext}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.plaintext!)} className="p-0.5 rounded hover:bg-white/10" title="Copy password">
                                                                <Copy size={11} style={{ color: '#555' }}/>
                                                            </button>
                                                        </div>
                                                    )}
                                                    {s.ntlm && (
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="font-bold uppercase" style={{ color: '#f87171', fontSize: 10, flexShrink: 0 }}>NTLM</span>
                                                            <span className="select-all flex-1 tracking-wide" style={{ color: '#fecaca', fontSize: 13 }}>{s.ntlm}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.ntlm!)} className="p-0.5 rounded hover:bg-white/10" title="Copy hash">
                                                                <Copy size={11} style={{ color: '#555' }}/>
                                                            </button>
                                                        </div>
                                                    )}
                                                    {s.sha1 && <div className="flex gap-2.5 items-center"><span className="font-bold uppercase" style={{ color: '#6b7280', fontSize: 10, flexShrink: 0 }}>SHA1</span><span className="select-all" style={{ color: '#9ca3af' }}>{s.sha1}</span></div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                            {/* generic: privilege / token / vault / unknown */}
                            {sec.cmd !== 'lsadump::sam' && sec.cmd !== 'lsadump::secrets' &&
                             sec.cmd !== 'lsadump::cache' && sec.cmd !== 'sekurlsa::logonpasswords' && (
                                <div className="space-y-0.5">
                                    {sec.body.split('\n').filter((l: string) => l.trim()).map((line: string, li: number) => {
                                        const color =
                                            /^ERROR/i.test(line.trim())                   ? '#ef4444' :
                                            /Privilege.*OK|\bOK\b/.test(line)             ? ACCENT    :
                                            /NT AUTHORITY|S-1-5-|Impersonated/.test(line) ? '#fdba74' :
                                            /[a-f0-9]{32}/i.test(line)                   ? '#fecaca' :
                                            /^\s*\*/.test(line)                          ? '#e5e7eb' :
                                            '#d1d5db';
                                        return (
                                            <div key={li} style={{ fontSize: 11, lineHeight: '1.7', color,
                                                ...(/[a-f0-9]{32}/i.test(line) ? { letterSpacing: '0.05em' } : {}) }}>{line}</div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── hasBuiltinStructuredRenderer ────────────────────────────────────────────
/**
 * Returns true if any decoded response would be claimed by a built-in
 * specialist panel (ifconfig cards / netstat / ps detail / directory listing).
 * Used by SingleTaskView to decide whether to skip the browser-script output
 * in favour of the more detailed structured renderer.
 */
export function hasBuiltinStructuredRenderer(responses: DecodedResponse[]): boolean {
    return responses.some(r => {
        // Plain-text mimikatz output — check before JSON parse
        if (/mimikatz\s+\d+\.\d+|mimikatz\(commandline\)\s*#/i.test(r.text)) return true;
        const parsed = tryParseJSON(r.text);
        if (!parsed) return false;
        if (parsed && Array.isArray(parsed.files) && parsed.files.length > 0 &&
            parsed.files[0]?.is_file !== undefined) return true;
        if (Array.isArray(parsed) && parsed.length > 0) {
            if (parsed[0]?.AdapterName !== undefined) return true;
            if (parsed[0]?.local_port !== undefined && parsed[0]?.protocol !== undefined) return true;
            if (parsed[0]?.process_id !== undefined) return true;
        }
        return false;
    });
}

// ─── StructuredResponseOutput — auto-router for raw decoded responses ————————─
// Detects the data shape of each raw-decoded Mythic response chunk and picks
// the best specialist renderer. Mirrors Console.tsx’s fallback path exactly.

export function StructuredResponseOutput({ responses }: { responses: DecodedResponse[] }) {
    const groups = useMemo(() => {
        const directoryMap = new Map<string, { directory: string; host: string; files: Map<string, any> }>();
        const other: { resp: DecodedResponse; parsed: any }[] = [];
        responses.forEach(r => {
            const parsed = tryParseJSON(r.text);
            if (parsed && Array.isArray(parsed.files)) {
                // Build full directory path
                const fullDir = (() => {
                    const p: string = parsed.parent_path ?? '';
                    const n: string = parsed.name || '';
                    const isWin = /^[A-Za-z]:[\\/]/.test(p) || p.includes('\\') ||
                                  (/^[A-Za-z]:/.test(n) && (n.includes('\\') || n.includes(':')));
                    if (isWin) {
                        if (/^[A-Za-z]:/.test(n) && (!p || p === '\\' || p === '/')) return n;
                        const stripped = p.replace(/[\\/]+$/, '');
                        return stripped ? `${stripped}\\${n}` : n;
                    }
                    if (p === '' || p === '/') return '/' + n;
                    return p.replace(/\/+$/, '') + '/' + n;
                })();
                const dirKey = `${fullDir}|${parsed.host || ''}`;
                if (!directoryMap.has(dirKey))
                    directoryMap.set(dirKey, { directory: fullDir, host: parsed.host || '', files: new Map() });
                const entry = directoryMap.get(dirKey)!;
                parsed.files.forEach((f: any) => {
                    const k = f.full_name || f.name || `${f.name}-${f.size}`;
                    if (!entry.files.has(k)) entry.files.set(k, f);
                });
            } else {
                other.push({ resp: r, parsed });
            }
        });
        return { directoryMap, other };
    }, [responses]);

    return (
        <div className="space-y-2">
            {/* Directory listings */}
            {Array.from(groups.directoryMap.entries()).map(([key, d]) => (
                <DirectoryPanel key={key} directory={d.directory} host={d.host} files={Array.from(d.files.values())}/>
            ))}
            {/* Per-response structured or plain rendering */}
            {groups.other.map(({ resp, parsed }) => {
                if (Array.isArray(parsed) && parsed.length > 0) {
                    if (parsed[0]?.AdapterName !== undefined)
                        return <IfconfigPanel key={resp.id} adapters={parsed}/>;
                    if (parsed[0]?.local_port !== undefined && parsed[0]?.protocol !== undefined)
                        return <NetstatPanel key={resp.id} rows={parsed}/>;
                    if (parsed[0]?.process_id !== undefined)
                        return <ProcessDetailPanel key={resp.id} procs={parsed}/>;
                }
                if (/mimikatz\s+\d+\.\d+|mimikatz\(commandline\)\s*#/i.test(resp.text))
                    return <MimikatzPanel key={resp.id} content={resp.text}/>;
                return <ParsedOutput key={resp.id} text={resp.text} isError={resp.is_error}/>;
            })}
        </div>
    );
}

// ─── RawOutput ────────────────────────────────────────────────────────────────

export interface RawOutputProps {
    responses: DecodedResponse[];
}

/** Raw terminal view: exact decoded bytes, errors in red */
export function RawOutput({ responses }: RawOutputProps) {
    if (!responses.length)
        return <p className="font-mono text-[13px] animate-pulse" style={{ color: '#555' }}>waiting for output…</p>;
    return (
        <pre className="font-mono text-[13px] leading-[1.7] whitespace-pre-wrap break-words select-text"
            style={{ color: '#d0d0d0', fontFamily: MONO }}>
            {responses.map(r => (
                <span key={r.id} style={{ color: r.is_error ? ERR : undefined }}>{r.text}</span>
            ))}
        </pre>
    );
}

// ─── OutputModeToggle ─────────────────────────────────────────────────────────

export type OutputMode = 'parsed' | 'raw';

export interface OutputModeToggleProps {
    mode: OutputMode;
    onChange: (m: OutputMode) => void;
}

/** Inline [PARSED] [RAW] pill toggle, Minerva-styled */
export function OutputModeToggle({ mode, onChange }: OutputModeToggleProps) {
    return (
        <div className="flex items-center shrink-0">
            {(['parsed', 'raw'] as OutputMode[]).map(m => (
                <button key={m} onClick={() => onChange(m)}
                    className="px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors first:rounded-l-sm last:rounded-r-sm border"
                    style={{
                        background:   mode === m ? '#00ffd115' : 'transparent',
                        color:        mode === m ? ACCENT      : '#555',
                        borderColor:  mode === m ? '#00ffd140' : '#222',
                        fontWeight:   mode === m ? 700         : 400,
                    }}>
                    {m}
                </button>
            ))}
        </div>
    );
}

// ─── Ace syntax modes supported ──────────────────────────────────────────────
export const syntaxModes = [
    "csharp", "golang", "html", "json", "markdown", "ruby", "python", "java",
    "javascript", "yaml", "toml", "swift", "sql", "rust", "powershell", "pgsql",
    "perl", "php", "objectivec", "nginx", "makefile", "kotlin", "dockerfile", "sh", "ini", "apache_conf"
].sort();

/** AceEditor-based syntax highlighting panel for code/script output */
export function SyntaxHighlightPanel({ text, initialMode, wrapText }: {
    text: string;
    initialMode?: string;
    wrapText?: boolean;
}) {
    const [mode, setMode] = useState(initialMode || 'json');
    const [wrap, setWrap] = useState(wrapText ?? true);
    const [showDropdown, setShowDropdown] = useState(false);
    
    return (
        <OutputPanel icon={<Code size={14} />} label="SYNTAX_HIGHLIGHT" accent="#a78bfa">
            <div className="flex items-center gap-2 mb-2">
                <div className="relative">
                    <button
                        onClick={() => setShowDropdown(!showDropdown)}
                        className="flex items-center gap-1 px-2 py-1 bg-black/60 border border-white/10 text-xs font-mono text-gray-300 hover:border-purple-500/40 transition-colors"
                    >
                        {mode} <ChevronDown size={10} />
                    </button>
                    {showDropdown && (
                        <div className="absolute top-full left-0 mt-1 w-40 max-h-64 overflow-y-auto bg-black border border-white/20 z-50 py-1">
                            {syntaxModes.map(m => (
                                <button key={m} onClick={() => { setMode(m); setShowDropdown(false); }}
                                    className={`w-full text-left px-3 py-1 text-xs font-mono transition-colors ${mode === m ? 'text-purple-400 bg-purple-500/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                    {m}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <button
                    onClick={() => setWrap(!wrap)}
                    className={`px-2 py-1 text-[10px] font-mono border transition-colors ${wrap ? 'border-purple-500/40 text-purple-400 bg-purple-500/10' : 'border-white/10 text-gray-500 hover:text-gray-300'}`}
                >
                    WRAP
                </button>
                <button onClick={() => { navigator.clipboard.writeText(text); }}
                    className="px-2 py-1 text-[10px] font-mono border border-white/10 text-gray-500 hover:text-white hover:border-white/30 transition-colors flex items-center gap-1"
                >
                    <Copy size={10} /> COPY
                </button>
            </div>
            <div className="border border-white/10 overflow-hidden" style={{ minHeight: 200 }}>
                <AceEditor
                    mode={mode}
                    theme="monokai"
                    value={text}
                    name="syntax-highlight-panel"
                    readOnly={true}
                    width="100%"
                    height={`${Math.min(Math.max(text.split('\n').length * 16, 200), 600)}px`}
                    fontSize={12}
                    wrapEnabled={wrap}
                    showPrintMargin={false}
                    showGutter={true}
                    highlightActiveLine={false}
                    setOptions={{
                        useWorker: false,
                        showLineNumbers: true,
                        tabSize: 4,
                    }}
                    style={{ background: '#0a0a0a' }}
                />
            </div>
        </OutputPanel>
    );
}

/** Hex dump viewer for binary data */
export function HexViewerPanel({ data }: { data: string }) {
    const hexLines = useMemo(() => {
        const bytes: number[] = [];
        // Try to decode as base64 first
        try {
            const decoded = window.atob(data);
            for (let i = 0; i < decoded.length; i++) bytes.push(decoded.charCodeAt(i));
        } catch {
            // If not base64, treat as raw string
            for (let i = 0; i < data.length; i++) bytes.push(data.charCodeAt(i));
        }
        const lines: { offset: string; hex: string; ascii: string }[] = [];
        for (let off = 0; off < bytes.length; off += 16) {
            const chunk = bytes.slice(off, off + 16);
            const hexParts = chunk.map(b => b.toString(16).padStart(2, '0'));
            while (hexParts.length < 16) hexParts.push('  ');
            const left = hexParts.slice(0, 8).join(' ');
            const right = hexParts.slice(8).join(' ');
            const ascii = chunk.map(b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.').join('');
            lines.push({
                offset: off.toString(16).padStart(8, '0'),
                hex: `${left}  ${right}`,
                ascii,
            });
        }
        return lines;
    }, [data]);

    return (
        <OutputPanel icon={<Hash size={14} />} label="HEX_DUMP" accent="#f59e0b" count={hexLines.length}>
            <div className="font-mono text-[11px] bg-black/80 border border-white/10 overflow-auto max-h-[500px]">
                <div className="px-3 py-1 bg-white/5 border-b border-white/10 flex gap-1 text-gray-500">
                    <span className="w-[72px]">OFFSET</span>
                    <span className="flex-1">00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F</span>
                    <span className="w-[140px]">ASCII</span>
                </div>
                {hexLines.map((line, i) => (
                    <div key={i} className="px-3 py-0.5 flex gap-1 hover:bg-white/5 transition-colors">
                        <span className="w-[72px] text-yellow-600/70 shrink-0">{line.offset}</span>
                        <span className="flex-1 text-signal/70">{line.hex}</span>
                        <span className="w-[140px] text-cyan-500/60 shrink-0">{line.ascii}</span>
                    </div>
                ))}
            </div>
        </OutputPanel>
    );
}
