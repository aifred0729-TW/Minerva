import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useLazyQuery, useReactiveVar } from '@apollo/client';
import {
    GET_OPERATIONS,
    CREATE_OPERATION_MUTATION,
    UPDATE_OPERATION_MUTATION,
    UPDATE_OPERATION_MEMBERS_MUTATION,
    TOGGLE_OPERATION_DELETE_MUTATION,
    UPDATE_CURRENT_OPERATION_MUTATION,
    UPDATE_OPERATION_ADMIN_MUTATION,
    CREATE_OPERATOR_MUTATION,
    GET_BLOCK_LISTS,
    CREATE_BLOCK_LIST_ENTRIES,
    DELETE_ENTIRE_BLOCK_LIST,
    DELETE_BLOCK_LIST_ENTRIES,
    GET_ALL_COMMANDS,
} from '../lib/api';
import { Sidebar } from '../components/Sidebar';
import {
    Layers, Plus, Edit, Users, Trash2, RotateCcw, CheckCircle,
    XCircle, Shield, Eye, EyeOff, UserPlus, AlertTriangle,
    Zap, ChevronDown, Globe, Bell, Palette,
    Ban, ChevronRight, Search as SearchIcon, X, Save,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { HexColorPicker } from 'react-colorful';
import { snackActions } from '../../components/utilities/Snackbar';
import { cn } from '../lib/utils';
import { meState } from '../../cache';
import { restartWebsockets } from '../../index';
import { useAppStore } from '../store';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Operator { id: number; username: string; }
interface OperatorOperation { id: number; view_mode: string; operator: Operator; }
interface Operation {
    id: number; name: string; complete: boolean; deleted: boolean;
    webhook: string; channel: string; banner_text: string; banner_color: string;
    admin: Operator; operatoroperations: OperatorOperation[];
}
interface MemberEntry {
    id: number; username: string; checked: boolean; view_mode: 'operator' | 'spectator' | 'lead';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
    lead:      'text-yellow-400 border-yellow-500/40 bg-yellow-900/20',
    operator:  'text-signal border-signal/40 bg-signal/5',
    spectator: 'text-blue-400 border-blue-500/40 bg-blue-900/20',
};
const ROLE_LABEL: Record<string, string> = { lead: 'LEAD', operator: 'OP', spectator: 'SPEC' };

// ── Modal Shell ───────────────────────────────────────────────────────────────
function ModalBackdrop({ children, onClose, wide = false }: {
    children: React.ReactNode; onClose: () => void; wide?: boolean;
}) {
    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className={cn("bg-void border border-signal/30 shadow-[0_0_30px_rgba(34,211,238,0.1)] relative overflow-hidden flex flex-col w-full", wide ? "max-w-2xl" : "max-w-lg")}
            >
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-signal to-transparent opacity-60" />
                {children}
            </motion.div>
        </motion.div>
    );
}

// ── Field Helper ──────────────────────────────────────────────────────────────
function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                {icon}{label}
            </label>
            {children}
        </div>
    );
}

// ── Role Select ───────────────────────────────────────────────────────────────
function RoleSelect({ value, onChange }: { value: string; onChange: (v: MemberEntry['view_mode']) => void }) {
    const [open, setOpen] = useState(false);
    const roles: MemberEntry['view_mode'][] = ['operator', 'spectator', 'lead'];
    return (
        <div className="relative">
            <button type="button" onClick={() => setOpen(o => !o)}
                className={cn("flex items-center gap-1.5 px-2 py-1 border text-[11px] font-mono font-bold w-full justify-between transition-colors",
                    ROLE_COLORS[value] || ROLE_COLORS.operator)}>
                <span>{ROLE_LABEL[value] || value.toUpperCase()}</span>
                <ChevronDown size={10} className={cn("transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-0.5 z-50 bg-black border border-signal/30 w-full shadow-lg">
                    {roles.map(r => (
                        <button key={r} type="button"
                            onClick={() => { onChange(r); setOpen(false); }}
                            className={cn("w-full px-2 py-1.5 text-[11px] font-mono text-left transition-colors",
                                r === value ? ROLE_COLORS[r] : "text-gray-400 hover:text-white hover:bg-white/5")}>
                            {r.toUpperCase()}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Create Operation ──────────────────────────────────────────────────────────
function CreateOperationModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [name, setName] = useState('');
    const [createOp, { loading }] = useMutation(CREATE_OPERATION_MUTATION);
    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        try {
            const { data } = await createOp({ variables: { name: name.trim() } });
            if (data?.createOperation?.status === 'error') throw new Error(data.createOperation.error);
            snackActions.success('Operation created');
            onSuccess();
        } catch (err: any) { snackActions.error(err.message || 'Failed to create operation'); }
    };
    return (
        <ModalBackdrop onClose={onClose}>
            <div className="p-6">
                <h2 className="text-lg font-bold tracking-widest mb-5 flex items-center gap-2">
                    <Plus size={18} className="text-signal" />NEW_OPERATION
                </h2>
                <form onSubmit={onSubmit} className="space-y-4">
                    <Field label="Operation Name">
                        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="my-operation"
                            className="w-full bg-black/50 border border-gray-700 focus:border-signal px-3 py-2 text-white outline-none font-mono text-sm" />
                    </Field>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs">CANCEL</button>
                        <button type="submit" disabled={loading || !name.trim()}
                            className="px-6 py-2 bg-signal text-void font-bold font-mono text-xs hover:bg-white disabled:opacity-50 transition-colors">
                            {loading ? 'CREATING…' : 'INITIALIZE'}
                        </button>
                    </div>
                </form>
            </div>
        </ModalBackdrop>
    );
}

// ── Create Operator ───────────────────────────────────────────────────────────
function CreateOperatorModal({ onClose }: { onClose: () => void }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [createOp, { loading }] = useMutation(CREATE_OPERATOR_MUTATION);
    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirm) { snackActions.error("Passwords don't match"); return; }
        if (password.length < 12) { snackActions.error('Password must be ≥ 12 characters'); return; }
        try {
            const { data } = await createOp({ variables: { username: username.trim(), password } });
            if (data?.createOperator?.status === 'error') throw new Error(data.createOperator.error);
            snackActions.success('Operator created: ' + username);
            onClose();
        } catch (err: any) { snackActions.error(err.message || 'Failed to create operator'); }
    };
    return (
        <ModalBackdrop onClose={onClose}>
            <div className="p-6">
                <h2 className="text-lg font-bold tracking-widest mb-5 flex items-center gap-2">
                    <UserPlus size={18} className="text-signal" />NEW_OPERATOR
                </h2>
                <form onSubmit={onSubmit} className="space-y-3">
                    {([
                        { label: 'Username', val: username, set: setUsername, type: 'text', ph: 'username' },
                        { label: 'Password', val: password, set: setPassword, type: 'password', ph: '≥12 characters' },
                        { label: 'Confirm Password', val: confirm, set: setConfirm, type: 'password', ph: 'repeat password' },
                    ] as const).map(({ label, val, set, type, ph }) => (
                        <Field key={label} label={label}>
                            <input type={type} value={val} onChange={e => (set as any)(e.target.value)} placeholder={ph}
                                className="w-full bg-black/50 border border-gray-700 focus:border-signal px-3 py-2 text-white outline-none font-mono text-sm" />
                        </Field>
                    ))}
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs">CANCEL</button>
                        <button type="submit" disabled={loading || !username.trim() || !password}
                            className="px-6 py-2 bg-signal text-void font-bold font-mono text-xs hover:bg-white disabled:opacity-50 transition-colors">
                            {loading ? 'CREATING…' : 'CREATE'}
                        </button>
                    </div>
                </form>
            </div>
        </ModalBackdrop>
    );
}

// ── Edit Operation ────────────────────────────────────────────────────────────
function EditOperationModal({ operation, onClose, onSuccess }: {
    operation: Operation; onClose: () => void; onSuccess: () => void;
}) {
    const [name, setName] = useState(operation.name);
    const [complete, setComplete] = useState(operation.complete);
    const [webhook, setWebhook] = useState(operation.webhook || '');
    const [channel, setChannel] = useState(operation.channel || '');
    const [bannerText, setBannerText] = useState(operation.banner_text || '');
    const [bannerColor, setBannerColor] = useState(operation.banner_color || '#be2a2a');
    const [showPicker, setShowPicker] = useState(false);
    const [updateOp, { loading }] = useMutation(UPDATE_OPERATION_MUTATION);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const { data } = await updateOp({ variables: {
                operation_id: operation.id, name, complete, webhook, channel,
                banner_text: bannerText, banner_color: bannerColor,
            }});
            if (data?.updateOperation?.status === 'error') throw new Error(data.updateOperation.error);
            const meCur = meState();
            if (meCur?.user?.current_operation_id === operation.id) {
                meState({ ...meCur, user: { ...meCur.user,
                    current_operation: data.updateOperation.name,
                    current_operation_complete: data.updateOperation.complete,
                    current_operation_banner_text: data.updateOperation.banner_text,
                    current_operation_banner_color: data.updateOperation.banner_color,
                }});
                localStorage.setItem('user', JSON.stringify(meState().user));
            }
            snackActions.success('Operation updated');
            onSuccess();
        } catch (err: any) { snackActions.error(err.message || 'Update failed'); }
    };

    return (
        <ModalBackdrop onClose={onClose} wide>
            <div className="p-6 flex-1 overflow-y-auto cyber-scrollbar max-h-[85vh]">
                <h2 className="text-lg font-bold tracking-widest mb-5 flex items-center gap-2">
                    <Edit size={18} className="text-signal" />EDIT_CONFIG: <span className="text-gray-300 font-normal">{operation.name}</span>
                </h2>
                <form onSubmit={onSubmit} className="space-y-4">
                    <Field label="Operation Name">
                        <input value={name} onChange={e => setName(e.target.value)}
                            className="w-full bg-black/50 border border-gray-700 focus:border-signal px-3 py-2 text-white outline-none font-mono text-sm" />
                    </Field>

                    <Field label="Status">
                        <button type="button" onClick={() => setComplete(c => !c)}
                            className={cn("flex items-center gap-3 px-4 py-2.5 border transition-colors w-full",
                                complete ? "border-gray-600 bg-black/30 text-gray-400" : "border-signal/40 bg-signal/5 text-signal")}>
                            <div className={cn("w-9 h-5 rounded-full relative transition-colors", complete ? "bg-gray-700" : "bg-signal/60")}>
                                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", complete ? "translate-x-4" : "translate-x-0")} />
                            </div>
                            <span className="font-mono text-sm">{complete ? 'COMPLETE (Archived)' : 'ACTIVE'}</span>
                        </button>
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Webhook URL" icon={<Globe size={11} />}>
                            <input value={webhook} onChange={e => setWebhook(e.target.value)} placeholder="https://hooks.slack.com/..."
                                className="w-full bg-black/50 border border-gray-700 focus:border-signal px-3 py-2 text-white outline-none font-mono text-xs" />
                        </Field>
                        <Field label="Webhook Channel" icon={<Bell size={11} />}>
                            <input value={channel} onChange={e => setChannel(e.target.value)} placeholder="#general"
                                className="w-full bg-black/50 border border-gray-700 focus:border-signal px-3 py-2 text-white outline-none font-mono text-xs" />
                        </Field>
                    </div>

                    <Field label="Banner" icon={<Palette size={11} />}>
                        <div className="space-y-2">
                            <input value={bannerText} onChange={e => setBannerText(e.target.value)} placeholder="Banner message (optional)"
                                className="w-full bg-black/50 border border-gray-700 focus:border-signal px-3 py-2 text-white outline-none font-mono text-sm" />
                            <div className="flex items-center gap-3">
                                <button type="button" onClick={() => setShowPicker(p => !p)}
                                    className="flex items-center gap-2 px-3 py-1.5 border border-gray-700 hover:border-signal/40 text-xs font-mono text-gray-300 transition-colors">
                                    <span className="w-4 h-4 rounded border border-white/20" style={{ backgroundColor: bannerColor }} />
                                    {bannerColor.toUpperCase()}
                                    <ChevronDown size={10} className={cn("transition-transform", showPicker && "rotate-180")} />
                                </button>
                                {bannerText && (
                                    <div className="flex-1 px-3 py-1 text-xs text-white font-mono rounded" style={{ backgroundColor: bannerColor }}>
                                        {bannerText}
                                    </div>
                                )}
                            </div>
                            {showPicker && (
                                <div className="p-3 border border-signal/20 bg-black/60 inline-block">
                                    <HexColorPicker color={bannerColor} onChange={setBannerColor} />
                                </div>
                            )}
                        </div>
                    </Field>

                    <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs">CANCEL</button>
                        <button type="submit" disabled={loading}
                            className="px-6 py-2 bg-signal text-void font-bold font-mono text-xs hover:bg-white disabled:opacity-50 transition-colors">
                            {loading ? 'SAVING…' : 'SAVE_CHANGES'}
                        </button>
                    </div>
                </form>
            </div>
        </ModalBackdrop>
    );
}

// ── Manage Members ────────────────────────────────────────────────────────────
function MembersOperationModal({ operation, allOperators, onClose, onSuccess }: {
    operation: Operation; allOperators: Operator[]; onClose: () => void; onSuccess: () => void;
}) {
    const buildInitial = (): MemberEntry[] =>
        allOperators.map(op => {
            const existing = operation.operatoroperations.find(oo => oo.operator.id === op.id);
            const isAdmin = op.id === operation.admin.id;
            if (existing) return { id: op.id, username: op.username, checked: true, view_mode: isAdmin ? 'lead' : existing.view_mode as any };
            return { id: op.id, username: op.username, checked: false, view_mode: 'operator' };
        });
    const [members, setMembers] = useState<MemberEntry[]>(buildInitial);
    const [updateMembers, { loading: lMem }] = useMutation(UPDATE_OPERATION_MEMBERS_MUTATION);
    const [updateAdmin, { loading: lAdmin }] = useMutation(UPDATE_OPERATION_ADMIN_MUTATION);
    const loading = lMem || lAdmin;

    const toggle = (id: number) => setMembers(prev => prev.map(m => m.id === id ? { ...m, checked: !m.checked } : m));
    const setRole = (id: number, role: MemberEntry['view_mode']) =>
        setMembers(prev => {
            let upd = prev.map(m => m.id === id ? { ...m, view_mode: role, checked: true } : m);
            if (role === 'lead') upd = upd.map(m => m.id !== id && m.view_mode === 'lead' ? { ...m, view_mode: 'operator' } : m);
            return upd;
        });

    const onSubmit = async () => {
        const origIds = new Set(operation.operatoroperations.map(oo => oo.operator.id));
        const toAdd: number[] = [], toRemove: number[] = [], operators: number[] = [], spectators: number[] = [];
        let newAdminId: number | null = null;
        members.forEach(m => {
            if (m.checked) {
                if (!origIds.has(m.id)) toAdd.push(m.id);
                if (m.view_mode === 'operator') operators.push(m.id);
                else if (m.view_mode === 'spectator') spectators.push(m.id);
                else if (m.view_mode === 'lead') newAdminId = m.id;
            } else if (origIds.has(m.id)) toRemove.push(m.id);
        });
        try {
            if (newAdminId && newAdminId !== operation.admin.id) {
                const { data } = await updateAdmin({ variables: { operation_id: operation.id, admin_id: newAdminId } });
                if (data?.updateOperation?.status === 'error') throw new Error(data.updateOperation.error);
            }
            const { data } = await updateMembers({ variables: {
                operation_id: operation.id, add_users: toAdd, remove_users: toRemove,
                view_mode_operators: operators, view_mode_spectators: spectators,
            }});
            if (data?.updateOperatorOperation?.status === 'error') throw new Error(data.updateOperatorOperation.error);
            snackActions.success('Members updated');
            onSuccess();
        } catch (err: any) { snackActions.error(err.message || 'Failed to update members'); }
    };

    const sorted = [...members].sort((a, b) => {
        if (a.view_mode === 'lead') return -1;
        if (b.view_mode === 'lead') return 1;
        if (a.checked !== b.checked) return a.checked ? -1 : 1;
        return a.username.localeCompare(b.username);
    });
    const currentLead = members.find(m => m.view_mode === 'lead' && m.checked);

    return (
        <ModalBackdrop onClose={onClose} wide>
            <div className="p-6 flex flex-col" style={{ maxHeight: '80vh' }}>
                <h2 className="text-lg font-bold tracking-widest mb-1 flex items-center gap-2 shrink-0">
                    <Users size={18} className="text-signal" />MANAGE_MEMBERS: <span className="text-gray-300 font-normal">{operation.name}</span>
                </h2>
                <p className="text-[11px] text-gray-600 font-mono mb-3 shrink-0">
                    LEAD = operation admin · OP = full access · SPEC = view only
                </p>

                <div className="grid grid-cols-[2rem_1fr_8rem] gap-2 px-2 py-1 text-[10px] font-mono text-gray-600 uppercase tracking-wider border-b border-white/10 shrink-0">
                    <span /><span>Operator</span><span>Role</span>
                </div>

                <div className="flex-1 overflow-y-auto cyber-scrollbar space-y-0.5 py-1">
                    {sorted.map(m => (
                        <div key={m.id} className={cn(
                            "grid grid-cols-[2rem_1fr_8rem] gap-2 items-center px-2 py-2 transition-colors rounded",
                            m.checked ? "bg-white/5 hover:bg-white/8" : "opacity-50 hover:opacity-80 hover:bg-white/5"
                        )}>
                            <button type="button" onClick={() => toggle(m.id)}
                                className={cn("w-4 h-4 border flex items-center justify-center transition-colors",
                                    m.checked ? "bg-signal border-signal" : "border-gray-600 hover:border-gray-400")}>
                                {m.checked && <CheckCircle size={11} className="text-void" />}
                            </button>
                            <span className="font-mono text-sm text-gray-200">{m.username}</span>
                            {m.checked ? (
                                <RoleSelect value={m.view_mode} onChange={role => setRole(m.id, role)} />
                            ) : (
                                <span className="text-gray-700 text-xs font-mono">–</span>
                            )}
                        </div>
                    ))}
                </div>

                {currentLead && (
                    <p className="text-[10px] text-yellow-500/70 font-mono mt-2 shrink-0">★ Lead: {currentLead.username}</p>
                )}

                <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-white/10 shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs">CANCEL</button>
                    <button type="button" onClick={onSubmit} disabled={loading}
                        className="px-6 py-2 bg-signal text-void font-bold font-mono text-xs hover:bg-white disabled:opacity-50 transition-colors">
                        {loading ? 'SAVING…' : 'CONFIRM_ACCESS'}
                    </button>
                </div>
            </div>
        </ModalBackdrop>
    );
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmText, isDestructive = false, onConfirm, onCancel }: any) {
    return (
        <ModalBackdrop onClose={onCancel}>
            <div className="p-6">
                <h2 className={cn("text-lg font-bold tracking-widest mb-3 flex items-center gap-2", isDestructive ? "text-red-400" : "text-signal")}>
                    <AlertTriangle size={18} className={isDestructive ? "text-red-500" : "text-yellow-500"} />{title}
                </h2>
                <p className="text-sm text-gray-300 font-mono mb-6">{message}</p>
                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs">CANCEL</button>
                    <button onClick={onConfirm}
                        className={cn("px-6 py-2 font-bold font-mono text-xs transition-colors",
                            isDestructive ? "bg-red-600 hover:bg-red-500 text-white" : "bg-signal text-void hover:bg-white")}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </ModalBackdrop>
    );
}

// ── Operation Row ─────────────────────────────────────────────────────────────
function OperationRow({ op, isCurrent, onMakeCurrent, onEdit, onMembers, onToggleDelete }: {
    op: Operation; isCurrent: boolean; onMakeCurrent: () => void;
    onEdit: () => void; onMembers: () => void; onToggleDelete: () => void;
}) {
    return (
        <div className={cn(
            "border p-4 transition-all",
            op.deleted ? "border-gray-800 opacity-60 bg-black/20" :
            isCurrent ? "border-signal/60 bg-signal/5 shadow-[0_0_12px_rgba(34,211,238,0.08)]" :
            "border-ghost/20 hover:border-signal/30 bg-black/20 hover:bg-black/30"
        )}>
            <div className="flex items-start gap-4">
                {/* Status dot */}
                <div className="mt-1 shrink-0">
                    {op.deleted ? <XCircle size={15} className="text-gray-600" /> :
                     op.complete ? <CheckCircle size={15} className="text-gray-500" /> :
                     <div className={cn("w-3.5 h-3.5 rounded-full", isCurrent ? "bg-signal animate-pulse" : "bg-signal/50")} />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="font-bold text-sm text-white font-mono">{op.name}</span>
                        {isCurrent && (
                            <span className="px-2 py-0.5 text-[10px] font-bold font-mono bg-signal/10 text-signal border border-signal/40 flex items-center gap-1">
                                <Zap size={9} />CURRENT
                            </span>
                        )}
                        {op.complete && !op.deleted && (
                            <span className="px-2 py-0.5 text-[10px] font-mono text-gray-500 border border-gray-700">COMPLETE</span>
                        )}
                        {op.deleted && (
                            <span className="px-2 py-0.5 text-[10px] font-mono text-red-500 border border-red-800">DELETED</span>
                        )}
                    </div>

                    {op.banner_text && (
                        <div className="inline-block px-2 py-0.5 text-xs font-mono text-white rounded mb-2"
                            style={{ backgroundColor: op.banner_color || '#be2a2a' }}>
                            {op.banner_text}
                        </div>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1">
                            <Shield size={11} className="text-yellow-500/80" />{op.admin.username}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Users size={11} className="text-gray-600" />
                            {op.operatoroperations.length === 0 ? (
                                <span className="text-gray-700 italic text-[11px]">no members</span>
                            ) : (
                                <>
                                    {op.operatoroperations.slice(0, 6).map(oo => (
                                        <span key={oo.id}
                                            className={cn("px-1.5 py-0 rounded text-[10px] border font-mono", ROLE_COLORS[oo.view_mode] || ROLE_COLORS.operator)}
                                            title={`${oo.operator.username} (${oo.view_mode})`}>
                                            {oo.operator.username.slice(0, 10)}
                                        </span>
                                    ))}
                                    {op.operatoroperations.length > 6 && (
                                        <span className="text-gray-600 text-[10px]">+{op.operatoroperations.length - 6}</span>
                                    )}
                                </>
                            )}
                        </span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {!isCurrent && !op.deleted && (
                        <button onClick={onMakeCurrent}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-signal/40 text-signal hover:bg-signal hover:text-void font-mono text-[11px] font-bold transition-colors">
                            <Zap size={11} />MAKE CURRENT
                        </button>
                    )}
                    {!op.deleted && (
                        <>
                            <button onClick={onEdit} title="Edit config"
                                className="p-2 border border-ghost/20 text-gray-500 hover:text-signal hover:border-signal/40 transition-colors">
                                <Edit size={14} />
                            </button>
                            <button onClick={onMembers} title="Manage members"
                                className="p-2 border border-ghost/20 text-gray-500 hover:text-signal hover:border-signal/40 transition-colors">
                                <Users size={14} />
                            </button>
                        </>
                    )}
                    <button onClick={onToggleDelete} title={op.deleted ? 'Restore operation' : 'Delete operation'}
                        className={cn("p-2 border transition-colors",
                            op.deleted ? "border-green-800/40 text-green-700 hover:text-green-400 hover:border-green-500/40"
                                       : "border-red-900/30 text-red-800 hover:text-red-400 hover:border-red-600/40")}>
                        {op.deleted ? <RotateCcw size={14} /> : <Trash2 size={14} />}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Block List Types ──────────────────────────────────────────────────────────
interface BlockListEntry { id: number; name: string; command: { id: number; cmd: string; payloadtype: { name: string } } }
interface CondensedBlockList { name: string; entries: Record<string, BlockListEntry[]> }
interface AllCommand { id: number; cmd: string; payloadtype: { name: string } }

// ── Edit Block List Modal ─────────────────────────────────────────────────────
function EditBlockListModal({ existingName, existingEntries, onClose, onSubmit }: {
    existingName?: string;
    existingEntries?: Record<string, AllCommand[]>;
    onClose: () => void;
    onSubmit: (args: { toAdd: any[]; toRemove: any[]; }) => void;
}) {
    const [listName, setListName] = useState(existingName || '');
    const [allCommands, setAllCommands] = useState<AllCommand[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [filterText, setFilterText] = useState('');
    const [payloadFilter, setPayloadFilter] = useState('all');

    const [fetchCommands] = useLazyQuery(GET_ALL_COMMANDS, {
        fetchPolicy: 'network-only',
        onCompleted: (data) => setAllCommands(data.command || []),
    });

    useEffect(() => {
        fetchCommands();
        // Build initial selected from existingEntries
        if (existingEntries) {
            const sel = new Set<string>();
            Object.values(existingEntries).forEach(cmds => cmds.forEach(c => sel.add(`${c.id}`)));
            setSelected(sel);
        }
    }, []);

    const payloadTypes = useMemo(() => {
        const pts = new Set<string>();
        allCommands.forEach(c => pts.add(c.payloadtype.name));
        return Array.from(pts).sort();
    }, [allCommands]);

    const filteredCommands = useMemo(() => {
        return allCommands.filter(c => {
            if (payloadFilter !== 'all' && c.payloadtype.name !== payloadFilter) return false;
            if (filterText && !c.cmd.toLowerCase().includes(filterText.toLowerCase()) && !c.payloadtype.name.toLowerCase().includes(filterText.toLowerCase())) return false;
            return true;
        });
    }, [allCommands, payloadFilter, filterText]);

    const toggle = (id: string) => {
        setSelected(prev => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    };

    const handleSave = () => {
        if (!listName.trim()) { snackActions.warning('Name required'); return; }
        const originalIds = new Set<string>();
        if (existingEntries) {
            Object.values(existingEntries).forEach(cmds => cmds.forEach(c => originalIds.add(`${c.id}`)));
        }
        const toAdd = Array.from(selected)
            .filter(id => !originalIds.has(id))
            .map(id => ({ name: listName.trim(), command_id: parseInt(id) }));
        const toRemove = Array.from(originalIds)
            .filter(id => !selected.has(id))
            .map(id => ({ name: listName.trim(), command_id: parseInt(id) }));
        onSubmit({ toAdd, toRemove });
    };

    return (
        <ModalBackdrop onClose={onClose} wide>
            <div className="p-5 border-b border-ghost/30 flex items-center justify-between">
                <h2 className="text-lg font-bold text-signal font-mono tracking-wider">{existingName ? 'EDIT BLOCK LIST' : 'CREATE BLOCK LIST'}</h2>
                <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-auto cyber-scrollbar">
                <Field label="Block List Name" icon={<Ban size={10} />}>
                    <input value={listName} onChange={e => setListName(e.target.value)} disabled={!!existingName}
                        placeholder="e.g. safe-ops-only"
                        className={cn("w-full h-9 px-3 bg-black/60 border border-ghost/30 text-white font-mono text-sm focus:border-signal/50 focus:outline-none", existingName && "opacity-50")} />
                </Field>

                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
                        <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)} placeholder="Filter commands..."
                            className="w-full h-9 pl-8 pr-3 bg-black/60 border border-ghost/30 text-white text-sm focus:border-signal/50 focus:outline-none font-mono" />
                    </div>
                    <select value={payloadFilter} onChange={e => setPayloadFilter(e.target.value)}
                        className="h-9 px-2 bg-black/60 border border-ghost/30 text-white text-sm font-mono focus:border-signal/50 focus:outline-none">
                        <option value="all">All Types</option>
                        {payloadTypes.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                    </select>
                </div>

                <div className="text-xs text-gray-500 font-mono">
                    {selected.size} commands selected • {filteredCommands.length} shown
                </div>
                <div className="max-h-[35vh] overflow-auto cyber-scrollbar border border-ghost/20 bg-black/30">
                    {filteredCommands.length === 0 ? (
                        <div className="p-6 text-center text-gray-600 font-mono text-sm">No commands match filter</div>
                    ) : (
                        <div className="divide-y divide-ghost/10">
                            {filteredCommands.map(c => (
                                <button key={c.id} onClick={() => toggle(`${c.id}`)}
                                    className={cn("w-full flex items-center gap-3 px-3 py-2 text-left text-sm font-mono transition-colors",
                                        selected.has(`${c.id}`) ? "bg-red-900/20 text-red-400" : "text-gray-400 hover:bg-white/5 hover:text-white")}>
                                    <span className={cn("w-4 h-4 border flex items-center justify-center flex-shrink-0",
                                        selected.has(`${c.id}`) ? "border-red-500 bg-red-500/20" : "border-ghost/40")}>
                                        {selected.has(`${c.id}`) && <Ban size={10} />}
                                    </span>
                                    <span className="text-[10px] text-gray-600 w-24 truncate">{c.payloadtype.name}</span>
                                    <span>{c.cmd}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="p-4 border-t border-ghost/30 flex justify-end gap-3">
                <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm transition-colors">CANCEL</button>
                <button onClick={handleSave}
                    className="flex items-center gap-2 px-5 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">
                    <Save size={14} />{existingName ? 'UPDATE' : 'CREATE'}
                </button>
            </div>
        </ModalBackdrop>
    );
}

// ── Block List Section ────────────────────────────────────────────────────────
function BlockListSection() {
    const [blockLists, setBlockLists] = useState<CondensedBlockList[]>([]);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [editList, setEditList] = useState<CondensedBlockList | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const [fetchBlockLists] = useLazyQuery(GET_BLOCK_LISTS, {
        fetchPolicy: 'network-only',
        onCompleted: (data) => {
            const condensed: Record<string, Record<string, BlockListEntry[]>> = {};
            (data.disabledcommandsprofile || []).forEach((entry: BlockListEntry) => {
                if (!condensed[entry.name]) condensed[entry.name] = {};
                const pt = entry.command.payloadtype.name;
                if (!condensed[entry.name][pt]) condensed[entry.name][pt] = [];
                condensed[entry.name][pt].push(entry);
            });
            setBlockLists(Object.entries(condensed).map(([name, entries]) => ({ name, entries })));
        },
        onError: () => snackActions.error('Failed to load block lists'),
    });

    const [createEntries] = useMutation(CREATE_BLOCK_LIST_ENTRIES, {
        onCompleted: () => { snackActions.success('Block list updated'); fetchBlockLists(); },
        onError: () => snackActions.error('Failed to create block list entries'),
    });

    const [deleteList] = useMutation(DELETE_ENTIRE_BLOCK_LIST, {
        onCompleted: (data) => {
            if (data.deleteBlockList.status === 'success') {
                setBlockLists(prev => prev.filter(b => b.name !== data.deleteBlockList.name));
                snackActions.success('Block list deleted');
            } else snackActions.error(data.deleteBlockList.error);
        },
        onError: () => snackActions.error('Failed to delete block list'),
    });

    const [deleteEntries] = useMutation(DELETE_BLOCK_LIST_ENTRIES, {
        onCompleted: (data) => {
            if (data.deleteBlockListEntry.status === 'success') {
                snackActions.success('Entries removed');
                fetchBlockLists();
            } else snackActions.error(data.deleteBlockListEntry.error);
        },
        onError: () => snackActions.error('Failed to delete entries'),
    });

    useEffect(() => { fetchBlockLists(); }, []);

    const handleSubmit = ({ toAdd, toRemove }: { toAdd: any[]; toRemove: any[] }) => {
        if (toAdd.length > 0) createEntries({ variables: { entries: toAdd } });
        if (toRemove.length > 0 && toRemove[0]?.name) {
            const ids = toRemove.map(e => e.command_id);
            deleteEntries({ variables: { name: toRemove[0].name, entries: ids } });
        }
        setShowCreate(false);
        setEditList(null);
    };

    return (
        <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 border border-red-500/30 bg-red-500/10"><Ban size={18} className="text-red-400" /></div>
                    <div>
                        <h2 className="text-lg font-bold tracking-widest text-white uppercase font-mono">COMMAND BLOCK LISTS</h2>
                        <p className="text-xs text-gray-600 font-mono">{blockLists.length} lists configured</p>
                    </div>
                </div>
                <button onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 font-mono text-xs transition-colors">
                    <Plus size={14} />NEW BLOCK LIST
                </button>
            </div>

            {blockLists.length === 0 ? (
                <div className="border border-ghost/20 bg-black/30 p-8 text-center">
                    <Ban size={32} className="mx-auto mb-3 text-gray-700" />
                    <p className="font-mono text-gray-600 text-sm">NO BLOCK LISTS CONFIGURED</p>
                    <p className="font-mono text-gray-700 text-xs mt-1">Block lists prevent specified commands from being used.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {blockLists.map(bl => {
                        const totalCmds = Object.values(bl.entries).reduce((sum, cmds) => sum + cmds.length, 0);
                        const isOpen = expanded === bl.name;
                        return (
                            <div key={bl.name} className="border border-ghost/20 bg-black/20">
                                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
                                    onClick={() => setExpanded(isOpen ? null : bl.name)}>
                                    <ChevronRight size={14} className={cn("text-gray-500 transition-transform", isOpen && "rotate-90")} />
                                    <Ban size={14} className="text-red-400" />
                                    <span className="text-white font-mono text-sm font-bold flex-1">{bl.name}</span>
                                    <span className="text-xs text-gray-500 font-mono">{totalCmds} blocked</span>
                                    <button onClick={e => { e.stopPropagation(); setEditList(bl); }}
                                        className="px-2 py-1 text-xs text-gray-500 hover:text-signal border border-ghost/20 hover:border-signal/30 transition-colors font-mono">
                                        EDIT
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); setConfirmDelete(bl.name); }}
                                        className="px-2 py-1 text-xs text-gray-500 hover:text-red-400 border border-ghost/20 hover:border-red-500/30 transition-colors font-mono">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                                <AnimatePresence>
                                    {isOpen && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden border-t border-ghost/10">
                                            <div className="p-4 space-y-3">
                                                {Object.entries(bl.entries).sort(([a],[b]) => a.localeCompare(b)).map(([pt, cmds]) => (
                                                    <div key={pt}>
                                                        <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-1.5">{pt}</p>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {cmds.sort((a,b) => a.command.cmd.localeCompare(b.command.cmd)).map(c => (
                                                                <span key={c.id} className="px-2 py-0.5 bg-red-900/20 border border-red-500/20 text-red-400 text-xs font-mono rounded">
                                                                    {c.command.cmd}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modals */}
            <AnimatePresence>
                {showCreate && (
                    <EditBlockListModal key="create-bl" onClose={() => setShowCreate(false)} onSubmit={handleSubmit} />
                )}
                {editList && (
                    <EditBlockListModal key={`edit-bl-${editList.name}`}
                        existingName={editList.name}
                        existingEntries={Object.fromEntries(Object.entries(editList.entries).map(([pt, cmds]) => [pt, cmds.map(c => c.command)]))}
                        onClose={() => setEditList(null)} onSubmit={handleSubmit} />
                )}
                {confirmDelete && (
                    <ConfirmModal key="confirm-delete-bl"
                        title="DELETE_BLOCK_LIST"
                        message={`Delete block list "${confirmDelete}" and all its entries?`}
                        confirmText="DELETE" isDestructive
                        onConfirm={() => { deleteList({ variables: { name: confirmDelete } }); setConfirmDelete(null); }}
                        onCancel={() => setConfirmDelete(null)} />
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Operations() {
    const { isSidebarCollapsed } = useAppStore();
    const me = useReactiveVar(meState);
    const currentUserId: number = me?.user?.user_id ?? me?.user?.id ?? 0;
    const currentOperationId: number = me?.user?.current_operation_id ?? 0;
    const isAdmin: boolean = !!me?.user?.admin;

    const [showDeleted, setShowDeleted] = useState(false);
    const [showCreateOp, setShowCreateOp] = useState(false);
    const [showCreateOperator, setShowCreateOperator] = useState(false);
    const [editOp, setEditOp] = useState<Operation | null>(null);
    const [membersOp, setMembersOp] = useState<Operation | null>(null);
    const [confirmOp, setConfirmOp] = useState<{ op: Operation; restore: boolean } | null>(null);

    const { data, loading, refetch } = useQuery(GET_OPERATIONS, {
        pollInterval: 10000, fetchPolicy: 'network-only',
    });

    const [toggleDelete] = useMutation(TOGGLE_OPERATION_DELETE_MUTATION);
    const [updateCurrentOp] = useMutation(UPDATE_CURRENT_OPERATION_MUTATION);

    const handleMakeCurrent = async (op: Operation) => {
        try {
            const { data: result } = await updateCurrentOp({ variables: { operator_id: currentUserId, operation_id: op.id } });
            const res = result?.updateCurrentOperation;
            if (res?.status === 'error') {
                if (res.error?.includes('not a member')) {
                    snackActions.warning('You are not a member of this operation.');
                    return;
                }
                throw new Error(res.error);
            }
            const meCur = meState();
            meState({ ...meCur, user: { ...meCur.user,
                current_operation_id: res.operation_id,
                current_operation: res.name,
                current_operation_complete: res.complete,
                current_operation_banner_text: res.banner_text,
                current_operation_banner_color: res.banner_color,
            }});
            localStorage.setItem('user', JSON.stringify(meState().user));
            restartWebsockets();
            snackActions.success(`Switched to: ${op.name}`);
            refetch();
        } catch (err: any) { snackActions.error(err.message || 'Failed to switch operation'); }
    };

    const handleToggleDelete = async () => {
        if (!confirmOp) return;
        try {
            await toggleDelete({ variables: { operation_id: confirmOp.op.id, deleted: !confirmOp.restore } });
            snackActions.success(confirmOp.restore ? 'Operation restored' : 'Operation deleted');
            refetch();
        } catch (err: any) { snackActions.error(err.message || 'Action failed'); }
        setConfirmOp(null);
    };

    const allOps: Operation[] = data?.operation || [];
    const allOperators: Operator[] = data?.operator || [];
    const operations = allOps.filter(op => showDeleted || !op.deleted);
    const stats = {
        total:    allOps.length,
        active:   allOps.filter(o => !o.complete && !o.deleted).length,
        complete: allOps.filter(o => o.complete && !o.deleted).length,
        deleted:  allOps.filter(o => o.deleted).length,
    };

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <Sidebar />
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
                className={cn("flex-1 transition-all duration-300 flex flex-col h-screen overflow-hidden", isSidebarCollapsed ? "ml-16" : "ml-64")}
            >
                <div className="flex-1 overflow-y-auto cyber-scrollbar">
                    <div className="p-6 lg:p-10">
                        {/* ── Header ── */}
                        <header className="flex justify-between items-start mb-8 gap-4 flex-wrap">
                            <div className="flex items-center gap-4">
                                <div className="p-3 border border-white/50 bg-white/10 rounded"><Layers size={24} className="text-white" /></div>
                                <div>
                                    <h1 className="text-2xl font-bold tracking-widest text-white uppercase">OPERATIONS MANAGER</h1>
                                    <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                        <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                        OPERATIONS CONTROL
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button onClick={() => setShowDeleted(d => !d)}
                                    className={cn("flex items-center gap-2 px-4 py-2.5 border font-mono text-xs transition-colors",
                                        showDeleted ? "border-red-700/60 text-red-400 bg-red-900/10 hover:bg-red-900/20"
                                                    : "border-ghost/30 text-gray-500 hover:text-gray-200 hover:border-gray-500/40")}>
                                    {showDeleted ? <EyeOff size={13} /> : <Eye size={13} />}
                                    {showDeleted ? 'HIDE DELETED' : 'SHOW DELETED'}
                                    {stats.deleted > 0 && (
                                        <span className="px-1.5 py-0.5 bg-red-900/30 text-red-500 text-[10px] rounded">{stats.deleted}</span>
                                    )}
                                </button>
                                {isAdmin && (
                                    <button onClick={() => setShowCreateOperator(true)}
                                        className="flex items-center gap-2 px-4 py-2.5 border border-ghost/30 text-gray-400 hover:text-white hover:border-gray-400/40 font-mono text-xs transition-colors">
                                        <UserPlus size={13} />NEW OPERATOR
                                    </button>
                                )}
                                <button onClick={() => setShowCreateOp(true)}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-signal text-void font-bold font-mono text-xs hover:bg-white transition-colors group">
                                    <Plus size={15} className="group-hover:rotate-90 transition-transform" />NEW OPERATION
                                </button>
                            </div>
                        </header>

                        {/* ── Stats ── */}
                        <div className="grid grid-cols-4 gap-3 mb-6">
                            {([
                                { label: 'TOTAL',    value: stats.total,    color: 'text-white' },
                                { label: 'ACTIVE',   value: stats.active,   color: 'text-signal' },
                                { label: 'COMPLETE', value: stats.complete, color: 'text-gray-500' },
                                { label: 'DELETED',  value: stats.deleted,  color: 'text-red-500' },
                            ] as const).map(s => (
                                <div key={s.label} className="border border-ghost/20 bg-black/30 px-4 py-3">
                                    <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">{s.label}</p>
                                    <p className={cn("text-2xl font-bold font-mono", s.color)}>{s.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* ── List ── */}
                        {loading ? (
                            <div className="flex items-center justify-center h-40 text-gray-600 font-mono text-sm animate-pulse">LOADING…</div>
                        ) : operations.length === 0 ? (
                            <div className="border border-ghost/20 p-12 text-center">
                                <Layers size={40} className="mx-auto mb-3 text-gray-700" />
                                <p className="font-mono text-gray-600 text-sm">NO OPERATIONS FOUND</p>
                                <p className="font-mono text-gray-700 text-xs mt-1">Ask a Mythic admin to create or add you to an operation.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {operations.map((op: Operation) => (
                                    <OperationRow
                                        key={op.id}
                                        op={op}
                                        isCurrent={op.id === currentOperationId}
                                        onMakeCurrent={() => handleMakeCurrent(op)}
                                        onEdit={() => setEditOp(op)}
                                        onMembers={() => setMembersOp(op)}
                                        onToggleDelete={() => setConfirmOp({ op, restore: op.deleted })}
                                    />
                                ))}
                            </div>
                        )}

                        {/* ── Block Lists ── */}
                        <BlockListSection />
                    </div>
                </div>
            </motion.div>

            {/* ── Modals ── */}
            <AnimatePresence>
                {showCreateOp && (
                    <CreateOperationModal key="create-op"
                        onClose={() => setShowCreateOp(false)}
                        onSuccess={() => { setShowCreateOp(false); refetch(); }} />
                )}
                {showCreateOperator && (
                    <CreateOperatorModal key="create-operator"
                        onClose={() => setShowCreateOperator(false)} />
                )}
                {editOp && (
                    <EditOperationModal key={`edit-${editOp.id}`}
                        operation={editOp}
                        onClose={() => setEditOp(null)}
                        onSuccess={() => { setEditOp(null); refetch(); }} />
                )}
                {membersOp && (
                    <MembersOperationModal key={`members-${membersOp.id}`}
                        operation={membersOp} allOperators={allOperators}
                        onClose={() => setMembersOp(null)}
                        onSuccess={() => { setMembersOp(null); refetch(); }} />
                )}
                {confirmOp && (
                    <ConfirmModal key="confirm"
                        title={confirmOp.restore ? 'RESTORE_OPERATION' : 'DELETE_OPERATION'}
                        message={confirmOp.restore
                            ? `Restore operation "${confirmOp.op.name}"?`
                            : `Delete operation "${confirmOp.op.name}"? This cannot be undone.`}
                        confirmText={confirmOp.restore ? 'RESTORE' : 'DELETE'}
                        isDestructive={!confirmOp.restore}
                        onConfirm={handleToggleDelete}
                        onCancel={() => setConfirmOp(null)} />
                )}
            </AnimatePresence>
        </div>
    );
}
