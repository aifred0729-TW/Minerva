/**
 * OutputRenderer/core — utilities, OutputPanel, MythicTable, TerminalPanel
 */
import React, { useMemo, useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import type { DecodedResponse, MythicTableDef } from '../../types/output';
import { Terminal, Database, FileText, X, ChevronRight, Wifi, Folder, Copy, Lock, Code, ChevronDown, Plus, Check, RotateCcw, FolderOpen, Archive, Box, Settings, Key, Image, List, Trash2, Syringe, Skull, Camera, Download, Upload, ArrowUp, ArrowDown, Filter, Clipboard, Search, Menu, WrapText, Maximize2, Minimize2, Monitor, Smartphone, Tablet, Server, User as UserIcon, Users as Users2, Globe, Fingerprint, Share2, Bluetooth, Cloud as CloudIcon, Shield as ShieldIcon, HardDrive, AlertTriangle, Bug, BadgeCheck, Star, Play, Palette } from 'lucide-react';
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
import { TaskFromUIButton } from '../TaskFromUIButton';
import { b64DecodeUnicode } from '../../lib/utils';
import '@xyflow/react/dist/style.css';

// ─── Utility helpers ──────────────────────────────────────────────────────────
export const fmtBytes = (n: number): string => {
    if (!n && n !== 0) return '';
    if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)}G`;
    if (n >= 1_048_576)     return `${(n / 1_048_576).toFixed(1)}M`;
    if (n >= 1024)          return `${(n / 1024).toFixed(1)}K`;
    return `${n}B`;
};
export const fmtUnixTime = (ts: number | undefined): string => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return d.toLocaleString();
};
export const tryParseJSON = (s: string): any => {
    try { return JSON.parse(s); } catch { return null; }
};

// ─── Utility ─────────────────────────────────────────────────────────────────

/** @deprecated Use b64DecodeUnicode from lib/utils instead. Kept as alias for barrel re-export. */
export const b64Decode = b64DecodeUnicode;

// ─── Mythic response data types (re-exported from centralized definitions) ────

export type { MythicCell, MythicTableRow, MythicTableDef, MythicScreenshot, MythicDownload, MythicBrowserScriptData, DecodedResponse } from '../../types/output';
// DecodedResponse is imported at top of file

/** Decode raw GraphQL response rows into DecodedResponse[] */
export const decodeResponses = (raw: any[]): DecodedResponse[] =>
    raw.map(r => ({ ...r, text: b64Decode(r.response ?? '') }));

// ─── Shared design tokens ─────────────────────────────────────────────────────

export const ACCENT   = '#00ffd1';
export const ERR      = '#ff5555';
export const PURPLE   = '#aa66ff';
export const AMBER    = '#ffaa44';
export const MONO     = "'Cascadia Code','Fira Code','JetBrains Mono',monospace";

export const ARCH_COLOR: Record<string, string> = {
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
                    {...({} as any)}
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
    const [activeTaskItem, setActiveTaskItem] = useState<Record<string, unknown> | null>(null);
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
                    {...({} as any)}
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
    const rawH = useMemo(() => tbl.headers || [], [tbl.headers]);
    // Extract header info: name + type
    const headerInfo = useMemo(() => rawH.map((h: any) => {
        if (typeof h === 'string') return { name: h, type: 'string' };
        return { name: h.plaintext ?? String(h), type: (h.type || 'string').toLowerCase() };
    }), [rawH]);
    const headers: string[] = useMemo(() => headerInfo.map(h => h.name), [headerInfo]);
    const headerTypes: Record<string, string> = useMemo(() => {
        const m: Record<string, string> = {};
        headerInfo.forEach(h => { m[h.name] = h.type; });
        return m;
    }, [headerInfo]);
    const rows = useMemo(() => tbl.rows || [], [tbl.rows]);

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
                count={hasActiveFilters ? `${sortedRows.length}/${rows.length}` as string | number : rows.length}>
                {tableEl}
            </OutputPanel>
            {/* TaskFromUIButton for row_actions */}
            {activeRowAction && callbackId && (() => {
                const row = sortedRows[activeRowAction.rowIdx];
                const params: Record<string, unknown> = { ...(activeRowAction.action.parameters || {}) };
                if (activeRowAction.action.row_data_key) params[activeRowAction.action.row_data_key] = row;
                else if (!activeRowAction.action.parameters) Object.assign(params, row);
                return (
                    <TaskFromUIButton
                        {...({} as any)}
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
    // eslint-disable-next-line no-control-regex
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

