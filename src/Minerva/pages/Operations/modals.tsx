import React, { useState } from 'react';
import { useMutation } from "@apollo/client/react";
import { useLazyQueryCompat as useLazyQuery } from "../../lib/useQueryCompat";
import {
    CREATE_OPERATION_MUTATION,
    UPDATE_OPERATION_MUTATION,
    UPDATE_OPERATION_MEMBERS_MUTATION,
    UPDATE_OPERATION_ADMIN_MUTATION,
    CREATE_OPERATOR_MUTATION,
    GET_ALL_COMMANDS,
    CREATE_BLOCK_LIST_ENTRIES,
    DELETE_BLOCK_LIST_ENTRIES,
} from '../../lib/api';
import {
    Plus, Edit, Users, CheckCircle, Shield,
    UserPlus, Zap, ChevronDown,
    Globe, Bell, Palette, Ban, Search as SearchIcon,
    X, Save, Clock, Calendar,
} from 'lucide-react';
import { parseSchedule, withSchedule, msToLocalInputValue, localInputValueToMs, tDelta } from '../../lib/operationSchedule';
import { motion } from 'framer-motion';
import { HexColorPicker } from 'react-colorful';
import { snackActions } from '../../lib/snackbar';
import { cn } from '../../lib/utils';
import { meState } from '../../lib/state';
import type { OperatorRef, Operation, MemberEntry } from '../../types/operations';
import { useEffect, useMemo } from 'react';

// ── Helpers ───────────────────────────────────────
export const ROLE_COLORS: Record<string, string> = {
    lead:      'text-yellow-400 border-yellow-500/40 bg-yellow-900/20',
    operator:  'text-signal border-signal/40 bg-signal/5',
    spectator: 'text-blue-400 border-blue-500/40 bg-blue-900/20',
};
export const ROLE_LABEL: Record<string, string> = { lead: 'LEAD', operator: 'OP', spectator: 'SPEC' };

// ── Modal Shell ───────────────────────────────────
export function ModalBackdrop({ children, onClose, wide = false }: {
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

// ── Field Helper ──────────────────────────────────
export function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                {icon}{label}
            </label>
            {children}
        </div>
    );
}

// ── Role Select ───────────────────────────────────
export function RoleSelect({ value, onChange }: { value: string; onChange: (v: MemberEntry['view_mode']) => void }) {
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

// ── Create Operation ──────────────────────────────
export function CreateOperationModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [name, setName] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [createOp] = useMutation<any>(CREATE_OPERATION_MUTATION);

    /*  Why we don't `await` the mutation:
     *
     *  The Mythic `createOperation` action invalidates EVERY operator's
     *  Hasura claim cache server-side (operation_create_webhook.go calls
     *  UpdateHasuraClaims with invalidateAllOthers=true) right before
     *  returning. With Apollo Client v4 polling GET_OPERATIONS every 10s,
     *  the response-arrival race against the next claim refresh can leave
     *  the mutation promise unresolved indefinitely — the row IS written
     *  to the DB, but the modal sits on "CREATING…" forever.
     *
     *  Fix: close the modal as soon as the request is dispatched and run
     *  the mutation in the background. Success / failure feedback goes
     *  through the snackbar; the parent's refetch() picks up the new row
     *  regardless of whether the mutation promise resolved. */
    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || submitted) return;
        setSubmitted(true);

        // Optimistic close — list refetch will surface the new row.
        onSuccess();

        createOp({ variables: { name: trimmed } })
            .then(({ data }: any) => {
                if (data?.createOperation?.status === 'error') {
                    snackActions.error(`Create failed: ${data.createOperation.error || 'unknown error'}`);
                } else {
                    snackActions.success(`Operation "${trimmed}" created`);
                }
            })
            .catch((err: any) => {
                snackActions.error(err?.message || 'Failed to create operation');
            });
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
                        <button type="submit" disabled={submitted || !name.trim()}
                            className="px-6 py-2 bg-signal text-void font-bold font-mono text-xs hover:bg-white disabled:opacity-50 transition-colors">
                            {submitted ? 'CREATING…' : 'INITIALIZE'}
                        </button>
                    </div>
                </form>
            </div>
        </ModalBackdrop>
    );
}

// ── Create Operator ───────────────────────────────
export function CreateOperatorModal({ onClose }: { onClose: () => void }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [createOp, { loading }] = useMutation<any>(CREATE_OPERATOR_MUTATION);
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
                            <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph}
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

// ── Edit Operation ────────────────────────────────
export function EditOperationModal({ operation, onClose, onSuccess }: {
    operation: Operation; onClose: () => void; onSuccess: () => void;
}) {
    const initialSched = parseSchedule(operation.banner_text);
    const [name, setName] = useState(operation.name);
    const [complete, setComplete] = useState(operation.complete);
    const [webhook, setWebhook] = useState(operation.webhook || '');
    const [channel, setChannel] = useState(operation.channel || '');
    const [bannerText, setBannerText] = useState(initialSched.displayText);
    const [bannerColor, setBannerColor] = useState(operation.banner_color || '#be2a2a');
    const [startLocal, setStartLocal] = useState(msToLocalInputValue(initialSched.startMs));
    const [showPicker, setShowPicker] = useState(false);
    const [updateOp] = useMutation<any>(UPDATE_OPERATION_MUTATION);
    const [submitted, setSubmitted] = useState(false);

    /*  Same optimistic-close pattern as CreateOperationModal: the update
     *  mutation can hang because the Hasura claim cache gets invalidated
     *  mid-flight. Close immediately, update `meState` from local form
     *  values (which ARE the new values), and let snackbar + refetch
     *  reconcile the rest. */
    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (submitted) return;
        setSubmitted(true);

        const startMs = localInputValueToMs(startLocal);
        const composedBanner = withSchedule(bannerText, startMs);
        const vars = {
            operation_id: operation.id, name, complete, webhook, channel,
            banner_text: composedBanner, banner_color: bannerColor,
        };

        // Optimistic local-state update for the current-operation chips.
        const meCur = meState();
        if (meCur?.user?.current_operation_id === operation.id) {
            meState({ ...meCur, user: { ...meCur.user,
                current_operation: name,
                current_operation_complete: complete,
                current_operation_banner_text: composedBanner,
                current_operation_banner_color: bannerColor,
            }});
            localStorage.setItem('user', JSON.stringify(meState().user));
        }
        onSuccess();

        updateOp({ variables: vars })
            .then(({ data }: any) => {
                if (data?.updateOperation?.status === 'error') {
                    snackActions.error(`Update failed: ${data.updateOperation.error || 'unknown error'}`);
                } else {
                    snackActions.success('Operation updated');
                }
            })
            .catch((err: any) => {
                snackActions.error(err?.message || 'Update failed');
            });
    };

    const loading = submitted;

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
                    <Field label="Operation Start Time (T-0)" icon={<Calendar size={11} />}>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="datetime-local"
                                    value={startLocal}
                                    onChange={e => setStartLocal(e.target.value)}
                                    className="flex-1 bg-black/50 border border-gray-700 focus:border-signal px-3 py-2 text-white outline-none font-mono text-sm"
                                />
                                {startLocal && (
                                    <button
                                        type="button"
                                        onClick={() => setStartLocal('')}
                                        className="px-3 py-2 border border-gray-700 hover:border-red-500/50 text-xs font-mono text-gray-300 hover:text-red-400 transition-colors"
                                        title="Clear schedule"
                                    >
                                        CLEAR
                                    </button>
                                )}
                            </div>
                            {(() => {
                                const ms = localInputValueToMs(startLocal);
                                if (!ms) return (
                                    <div className="text-[10px] font-mono text-gray-500 leading-relaxed">
                                        No schedule set. Setting a time triggers a T-1min broadcast to every operator.
                                    </div>
                                );
                                const td = tDelta(ms);
                                const utcStr = new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
                                return (
                                    <div className="flex items-center gap-3 text-[11px] font-mono">
                                        <span className={cn(
                                            "inline-flex items-center gap-1.5 px-2 py-0.5 border tabular-nums",
                                            td && td.sign < 0 ? "border-yellow-400/60 text-yellow-300 bg-yellow-400/10" : "border-signal/60 text-signal bg-signal/10"
                                        )}>
                                            <Clock size={11} />{td?.formatted ?? '--'}
                                        </span>
                                        <span className="text-gray-400">UTC {utcStr}</span>
                                    </div>
                                );
                            })()}
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

// ── Manage Members ────────────────────────────────
export function MembersOperationModal({ operation, allOperators, onClose, onSuccess }: {
    operation: Operation; allOperators: OperatorRef[]; onClose: () => void; onSuccess: () => void;
}) {
    const buildInitial = (): MemberEntry[] =>
        allOperators.map(op => {
            const existing = operation.operatoroperations.find(oo => oo.operator.id === op.id);
            const isAdmin = op.id === operation.admin.id;
            if (existing) return { id: op.id, username: op.username, checked: true, view_mode: isAdmin ? 'lead' : existing.view_mode as MemberEntry['view_mode'] };
            return { id: op.id, username: op.username, checked: false, view_mode: 'operator' };
        });
    const [members, setMembers] = useState<MemberEntry[]>(buildInitial);
    const [updateMembers, { loading: lMem }] = useMutation<any>(UPDATE_OPERATION_MEMBERS_MUTATION);
    const [updateAdmin, { loading: lAdmin }] = useMutation<any>(UPDATE_OPERATION_ADMIN_MUTATION);
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
                            m.checked ? "bg-white/5 hover:bg-white/10" : "opacity-50 hover:opacity-80 hover:bg-white/5"
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

// ── Confirm Modal ─────────────────────────────────
export { ConfirmDialog as ConfirmModal } from '../../components/ConfirmDialog';

// ── Edit Block List Modal ─────────────────────────
export interface AllCommand { id: number; cmd: string; payloadtype: { name: string } }

export function EditBlockListModal({ existingName, existingEntries, onClose, onSubmit }: {
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

    const [fetchCommands] = useLazyQuery<any>(GET_ALL_COMMANDS, {
        fetchPolicy: 'network-only',
        onCompleted: (data: any) => setAllCommands(data.command || []),
    });

    useEffect(() => {
        fetchCommands();
        if (existingEntries) {
            const sel = new Set<string>();
            Object.values(existingEntries).forEach(cmds => cmds.forEach(c => sel.add(`${c.id}`)));
            setSelected(sel);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
