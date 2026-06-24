import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { useAppStore } from '../store';
import { Shield, Plus, Trash2, Edit, Save, X, Copy, ChevronDown, ChevronUp, Globe, Hash, Cpu, RefreshCw, User } from 'lucide-react';
import { QuickHackDef, QuickHackStep, QuickHackVariable, useQuickHacks, useUpsertQuickHack, useDeleteQuickHack, KNOWN_AGENT_TYPES } from '../lib/quickhacks';
import { LucideIcon, PRESET_ICON_NAMES } from '../lib/iconMap';
import { snackActions } from '../lib/snackbar';

const PRESET_COLORS = ['#22d3ee', '#22c55e', '#ff003c', '#ff6600', '#ffcc00', '#00ff88', '#6633ff', '#ff33cc', '#3b82f6', '#f59e0b'];

const generateId = () => `qh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const emptyHack: Omit<QuickHackDef, 'id'> = {
    name: '',
    description: '',
    icon: 'Zap',
    color: '#22d3ee',
    command: '',
    params: '',
    steps: [{ command: '', params: '' }],
    variables: [],
    agentTypes: [],
    isDefault: false,
};

const QuickHacks = () => {
    const isSidebarCollapsed = useAppStore(s => s.isSidebarCollapsed);
    const { hacks, loading, refetch } = useQuickHacks();
    const upsertHack = useUpsertQuickHack();
    const deleteHack = useDeleteQuickHack();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<QuickHackDef | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [createForm, setCreateForm] = useState<Omit<QuickHackDef, 'id'>>(emptyHack);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await refetch();
            snackActions.success('Quickhacks refreshed');
        } catch (e: any) {
            snackActions.error(`Refresh failed: ${e?.message ?? 'unknown'}`);
        } finally {
            setRefreshing(false);
        }
    }, [refetch]);

    const handleCreate = useCallback(async () => {
        const steps = (createForm.steps ?? []).filter(s => s.command.trim());
        if (!createForm.name.trim() || steps.length === 0) return;
        const synced = { ...createForm, steps, command: steps[0].command, params: steps[0].params };
        const newHack: QuickHackDef = { ...synced, id: generateId(), isDefault: false };
        try {
            await upsertHack(newHack);
            setCreateForm(emptyHack);
            setIsCreating(false);
        } catch (e: any) {
            snackActions.error(`Save failed: ${e?.message ?? 'unknown'}`);
        }
    }, [createForm, upsertHack]);

    const handleUpdate = useCallback(async () => {
        if (!editForm) return;
        const steps = (editForm.steps ?? []).filter(s => s.command.trim());
        if (!editForm.name.trim() || steps.length === 0) return;
        const synced = { ...editForm, steps, command: steps[0].command, params: steps[0].params };
        try {
            await upsertHack(synced);
            setEditingId(null);
            setEditForm(null);
        } catch (e: any) {
            snackActions.error(`Save failed: ${e?.message ?? 'unknown'}`);
        }
    }, [editForm, upsertHack]);

    const handleDelete = useCallback(async (id: string) => {
        try {
            await deleteHack(id);
            if (editingId === id) { setEditingId(null); setEditForm(null); }
        } catch (e: any) {
            snackActions.error(`Delete failed: ${e?.message ?? 'unknown'}`);
        }
    }, [deleteHack, editingId]);

    const handleDuplicate = useCallback(async (hack: QuickHackDef) => {
        const dup: QuickHackDef = { ...hack, id: generateId(), name: `${hack.name} (COPY)`, isDefault: false };
        try {
            await upsertHack(dup);
        } catch (e: any) {
            snackActions.error(`Duplicate failed: ${e?.message ?? 'unknown'}`);
        }
    }, [upsertHack]);

    const handleResetDefaults = useCallback(async () => {
        if (!window.confirm('Delete every custom quickhack in this operation? This affects all operators.')) return;
        try {
            for (const h of hacks) {
                if (!h.isDefault) await deleteHack(h.id);
            }
            setEditingId(null);
            setEditForm(null);
            snackActions.success('Custom quickhacks cleared');
        } catch (e: any) {
            snackActions.error(`Reset failed: ${e?.message ?? 'unknown'}`);
        }
    }, [hacks, deleteHack]);

    const startEdit = (hack: QuickHackDef) => {
        setEditingId(hack.id);
        setEditForm({ ...hack });
        setIsCreating(false);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm(null);
    };

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={cn("transition-all duration-300 p-6 lg:p-12 h-screen flex flex-col overflow-hidden", isSidebarCollapsed ? "ml-16" : "ml-64")}
            >
                {/* Header */}
                <header className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-4">
                        <div
                            className="p-3 border border-white/40 bg-white/5 relative"
                            style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
                        >
                            <Shield size={22} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-[0.25em] text-white uppercase">QUICKHACK ARSENAL</h1>
                            <p className="text-[10px] text-zinc-200 font-mono flex items-center gap-2 uppercase tracking-[0.3em] mt-0.5">
                                <span className="w-1.5 h-1.5 bg-signal rounded-full animate-pulse" />
                                {hacks.length} MODULE{hacks.length !== 1 ? 'S' : ''} LOADED
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing || loading}
                            title="Refresh from server (auto-syncs while page is open)"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono border border-white/15 text-zinc-200 hover:border-signal/60 hover:text-signal transition-colors tracking-[0.2em] disabled:opacity-40"
                        >
                            <RefreshCw size={11} className={refreshing || loading ? 'animate-spin' : ''} />
                            REFRESH
                        </button>
                        <button
                            onClick={handleResetDefaults}
                            className="px-3 py-1.5 text-[10px] font-mono border border-white/15 text-zinc-200 hover:border-red-400/60 hover:text-red-300 transition-colors tracking-[0.2em]"
                        >
                            RESET DEFAULTS
                        </button>
                        <button
                            onClick={() => { setIsCreating(true); setEditingId(null); setEditForm(null); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono border border-cyan-400/60 text-cyan-300 bg-cyan-400/10 hover:bg-cyan-400/20 hover:border-cyan-300 transition-colors tracking-[0.2em]"
                        >
                            <Plus size={11} /> NEW QUICKHACK
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto cyber-scrollbar space-y-3 pr-2">
                    {/* Create form */}
                    <AnimatePresence>
                        {isCreating && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                                className="overflow-hidden"
                            >
                                <HackForm
                                    title="CREATE NEW QUICKHACK"
                                    form={createForm}
                                    onChange={setCreateForm as (f: QuickHackDef | Omit<QuickHackDef, 'id'>) => void}
                                    onSave={handleCreate}
                                    onCancel={() => { setIsCreating(false); setCreateForm(emptyHack); }}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Existing quickhacks */}
                    <AnimatePresence mode="popLayout">
                        {hacks.map((hack, i) => (
                            <motion.div
                                key={hack.id}
                                layout
                                initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
                                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, x: -30, filter: 'blur(4px)' }}
                                transition={{ duration: 0.3, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                            >
                                {editingId === hack.id && editForm ? (
                                    <HackForm
                                        title="EDIT QUICKHACK"
                                        form={editForm}
                                        onChange={setEditForm as any}
                                        onSave={handleUpdate}
                                        onCancel={cancelEdit}
                                    />
                                ) : (
                                    <HackCard
                                        hack={hack}
                                        isExpanded={expandedId === hack.id}
                                        onToggleExpand={() => setExpandedId(expandedId === hack.id ? null : hack.id)}
                                        onEdit={() => startEdit(hack)}
                                        onDelete={() => handleDelete(hack.id)}
                                        onDuplicate={() => handleDuplicate(hack)}
                                    />
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {hacks.length === 0 && !isCreating && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="text-center py-20 font-mono"
                        >
                            <Shield size={36} className="mx-auto mb-3 text-zinc-300 opacity-60" />
                            <div className="text-xs text-white tracking-[0.3em]">NO QUICKHACKS LOADED</div>
                            <div className="text-[10px] mt-1 text-zinc-300 tracking-wider">Create a new module or reset to defaults</div>
                        </motion.div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

/** Readonly card for a quickhack */
const HackCard = ({
    hack, isExpanded, onToggleExpand, onEdit, onDelete, onDuplicate,
}: {
    hack: QuickHackDef;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
}) => (
    <div
        className="border border-white/10 bg-black/50 hover:border-white/25 transition-colors"
        style={{ borderLeftColor: hack.color, borderLeftWidth: 3 }}
    >
        {/* Main row */}
        <div className="flex items-center gap-4 px-5 py-4 cursor-pointer" onClick={onToggleExpand}>
            {/* Icon — outlined HUD tile with inner glow */}
            <div className="w-10 h-10 flex items-center justify-center shrink-0"
                style={{
                    background: `${hack.color}10`,
                    border: `1px solid ${hack.color}80`,
                    color: hack.color,
                    boxShadow: `inset 0 0 12px ${hack.color}25`,
                }}>
                <LucideIcon name={hack.icon} size={20} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold font-mono tracking-[0.18em]"
                        style={{ color: hack.color, textShadow: `0 0 8px ${hack.color}30` }}>
                        {hack.name}
                    </span>
                    {/* DEFAULT / CUSTOM source badge */}
                    {hack.isDefault ? (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 border tracking-[0.15em] uppercase border-zinc-400/40 text-zinc-200 bg-zinc-400/5">
                            DEFAULT
                        </span>
                    ) : (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 border tracking-[0.15em] uppercase border-cyan-400/50 text-cyan-300 bg-cyan-400/10">
                            CUSTOM
                        </span>
                    )}
                    {/* Author chip */}
                    {hack.author?.username && (
                        <span
                            className="text-[9px] font-mono font-bold px-1.5 py-0.5 border tracking-[0.15em] uppercase flex items-center gap-1 border-purple-400/50 text-purple-300 bg-purple-400/10"
                            title={`Author: ${hack.author.username}`}
                        >
                            <User size={9} />
                            {hack.author.username}
                        </span>
                    )}
                    {/* Agent type restriction badge */}
                    {hack.agentTypes && hack.agentTypes.length > 0 ? (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 border tracking-[0.15em] flex items-center gap-1"
                            style={{ borderColor: `${hack.color}80`, color: hack.color, background: `${hack.color}12` }}>
                            <Cpu size={9} />
                            {hack.agentTypes.map(a => a.toUpperCase()).join(' / ')}
                        </span>
                    ) : (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 border tracking-[0.15em] flex items-center gap-1 border-white/15 text-zinc-300 bg-white/[0.03]">
                            <Cpu size={9} />
                            ALL AGENTS
                        </span>
                    )}
                    {(hack.steps ?? []).length > 1 && (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 border tracking-[0.15em] border-amber-400/50 text-amber-300 bg-amber-400/10">
                            {hack.steps.length} STEPS
                        </span>
                    )}
                    {hack.variables && hack.variables.length > 0 && (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 border tracking-[0.15em] flex items-center gap-1 border-emerald-400/50 text-emerald-300 bg-emerald-400/10">
                            {hack.variables.map(v => v.type === 'ip' ? <Globe key={v.key} size={9} /> : <Hash key={v.key} size={9} />)}
                            {hack.variables.length} VAR{hack.variables.length !== 1 ? 'S' : ''}
                        </span>
                    )}
                </div>
                <div className="text-xs text-zinc-200 font-mono mt-1 truncate">{hack.description}</div>
            </div>

            {/* Actions — visible at rest, bright accent on hover */}
            <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                <button onClick={onEdit}
                    className="p-1.5 text-zinc-300 hover:text-cyan-300 hover:bg-cyan-400/10 transition-colors"
                    title="Edit">
                    <Edit size={14} />
                </button>
                <button onClick={onDuplicate}
                    className="p-1.5 text-zinc-300 hover:text-blue-300 hover:bg-blue-400/10 transition-colors"
                    title="Duplicate">
                    <Copy size={14} />
                </button>
                <button onClick={onDelete}
                    className="p-1.5 text-zinc-300 hover:text-red-300 hover:bg-red-400/10 transition-colors"
                    title="Delete">
                    <Trash2 size={14} />
                </button>
            </div>

            <button className="text-zinc-300 hover:text-white shrink-0">
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
        </div>

        {/* Expanded details */}
        <AnimatePresence>
            {isExpanded && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                >
                    <div className="px-5 pb-4 pt-3 border-t border-white/10 space-y-3 bg-black/30">
                        {/* Steps */}
                        <div>
                            <div className="text-[10px] font-mono text-zinc-200 uppercase tracking-[0.25em] mb-1.5">
                                COMMANDS <span className="text-zinc-400">({(hack.steps ?? []).length || 1} STEP{((hack.steps ?? []).length || 1) !== 1 ? 'S' : ''})</span>
                            </div>
                            <div className="space-y-1.5">
                                {(hack.steps && hack.steps.length > 0 ? hack.steps : [{ command: hack.command, params: hack.params }]).map((step, idx) => (
                                    <div key={idx} className="flex gap-2 items-start text-xs font-mono bg-black/40 border border-white/10 px-2.5 py-1.5"
                                        style={{ borderLeft: `2px solid ${hack.color}80` }}>
                                        <span className="text-zinc-400 shrink-0 select-none">{idx + 1}.</span>
                                        <span className="shrink-0 font-bold" style={{ color: hack.color }}>{step.command}</span>
                                        {step.params && <span className="text-zinc-200 break-all">{step.params}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-6 items-end flex-wrap">
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-mono text-zinc-200 uppercase tracking-[0.25em] mb-1">ICON</div>
                                <div className="flex items-center gap-2 text-xs text-white font-mono">
                                    <LucideIcon name={hack.icon} size={14} style={{ color: hack.color }} />
                                    <span>{hack.icon}</span>
                                </div>
                            </div>
                            <DetailRow label="COLOR" value={hack.color} color={hack.color} />
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-mono text-zinc-200 uppercase tracking-[0.25em] mb-1">COMPATIBLE AGENTS</div>
                                <div className="text-xs text-white font-mono">
                                    {hack.agentTypes && hack.agentTypes.length > 0
                                        ? hack.agentTypes.map(a => a.toUpperCase()).join(', ')
                                        : <span className="text-zinc-300">ALL</span>}
                                </div>
                            </div>
                        </div>
                        {hack.variables && hack.variables.length > 0 && (
                            <div>
                                <div className="text-[10px] font-mono text-zinc-200 uppercase tracking-[0.25em] mb-1.5">VARIABLES</div>
                                <div className="flex flex-wrap gap-2">
                                    {hack.variables.map(v => (
                                        <span key={v.key} className="text-[10px] font-mono px-2 py-1 border bg-black/40 flex items-center gap-1.5"
                                            style={{ borderColor: v.type === 'ip' ? 'rgba(34,211,238,0.4)' : 'rgba(245,158,11,0.4)' }}>
                                            {v.type === 'ip'
                                                ? <Globe size={10} className="text-cyan-300" />
                                                : <Hash size={10} className="text-amber-300" />
                                            }
                                            <span className="text-white">{`{{${v.key}}}`}</span>
                                            <span className={cn("uppercase tracking-wider text-[9px]",
                                                v.type === 'ip' ? 'text-cyan-300' : 'text-amber-300')}>
                                                {v.type}
                                            </span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
);

const DetailRow = ({ label, value, color, mono }: { label: string; value: string; color: string; mono?: boolean }) => (
    <div className="flex-1 min-w-0">
        <div className="text-[10px] font-mono text-zinc-200 uppercase tracking-[0.25em] mb-1">{label}</div>
        <div className={cn("text-xs text-white break-all flex items-center gap-1.5 font-mono",
            mono && "bg-black/40 px-2 py-1 border border-white/10 max-h-20 overflow-y-auto cyber-scrollbar")}>
            {color && (
                <span className="inline-block w-3 h-3 shrink-0 border border-white/30" style={{ background: color }} />
            )}
            {value || <span className="text-zinc-400 italic">—</span>}
        </div>
    </div>
);

/** Variables editor sub-component */
const VariablesEditor = ({
    variables,
    onChange,
    accentColor,
}: {
    variables: QuickHackVariable[];
    onChange: (vars: QuickHackVariable[]) => void;
    accentColor: string;
}) => {
    const addVariable = (type: 'ip' | 'number') => {
        const prefix = type === 'ip' ? 'TARGET_IP' : 'TARGET_NUMBER';
        const existingCount = variables.filter(v => v.type === type).length;
        const key = existingCount === 0 ? prefix : `${prefix}_${existingCount + 1}`;
        onChange([...variables, { key, type }]);
    };

    const removeVariable = (index: number) => {
        onChange(variables.filter((_, i) => i !== index));
    };

    const updateKey = (index: number, newKey: string) => {
        const next = [...variables];
        next[index] = { ...next[index], key: newKey.toUpperCase().replace(/[^A-Z0-9_]/g, '') };
        onChange(next);
    };

    return (
        <div>
            <label className="text-[10px] font-mono text-zinc-200 uppercase tracking-[0.25em] block mb-1.5">
                VARIABLES <span className="text-zinc-400 normal-case tracking-normal">— use {'{{KEY}}'} in parameters</span>
            </label>
            <div className="space-y-2">
                {variables.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-1.5 border bg-black/40 text-[10px] font-mono shrink-0"
                            style={{ borderColor: v.type === 'ip' ? 'rgba(34,211,238,0.5)' : 'rgba(245,158,11,0.5)' }}>
                            {v.type === 'ip'
                                ? <Globe size={10} className="text-cyan-300" />
                                : <Hash size={10} className="text-amber-300" />
                            }
                            <span className={cn("uppercase tracking-wider",
                                v.type === 'ip' ? 'text-cyan-300' : 'text-amber-300')}>
                                {v.type}
                            </span>
                        </div>
                        <input
                            value={v.key}
                            onChange={e => updateKey(i, e.target.value)}
                            placeholder="VARIABLE_NAME"
                            className="flex-1 bg-black/40 border border-white/15 px-2 py-1.5 text-[11px] font-mono text-white placeholder-zinc-500 focus:border-cyan-400/60 focus:outline-none transition-colors tracking-wider"
                        />
                        <span className="text-[10px] font-mono text-zinc-300 shrink-0">{`{{${v.key}}}`}</span>
                        <button onClick={() => removeVariable(i)}
                            className="p-1 text-zinc-300 hover:text-red-300 hover:bg-red-400/10 transition-colors">
                            <X size={12} />
                        </button>
                    </div>
                ))}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => addVariable('ip')}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono border border-cyan-400/50 text-cyan-300 bg-cyan-400/10 hover:bg-cyan-400/20 hover:border-cyan-300 transition-colors tracking-[0.15em]"
                    >
                        <Globe size={10} /> + IP
                    </button>
                    <button
                        onClick={() => addVariable('number')}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono border border-amber-400/50 text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 hover:border-amber-300 transition-colors tracking-[0.15em]"
                    >
                        <Hash size={10} /> + NUMBER
                    </button>
                </div>
            </div>
        </div>
    );
};

/** Edit / Create form */
const HackForm = ({
    title, form, onChange, onSave, onCancel,
}: {
    title: string;
    form: QuickHackDef | Omit<QuickHackDef, 'id'>;
    onChange: (f: QuickHackDef | Omit<QuickHackDef, 'id'>) => void;
    onSave: () => void;
    onCancel: () => void;
}) => {
    const update = (key: string, value: unknown) => onChange({ ...form, [key]: value });
    const steps: QuickHackStep[] = form.steps && form.steps.length > 0
        ? form.steps
        : [{ command: form.command ?? '', params: form.params ?? '' }];
    const updateStep = (idx: number, field: 'command' | 'params', value: string) => {
        const next = [...steps];
        next[idx] = { ...next[idx], [field]: value };
        onChange({ ...form, steps: next, command: next[0]?.command ?? '', params: next[0]?.params ?? '' });
    };
    const addStep = () => onChange({ ...form, steps: [...steps, { command: '', params: '' }] });
    const removeStep = (idx: number) => {
        if (steps.length <= 1) return;
        const next = steps.filter((_, i) => i !== idx);
        onChange({ ...form, steps: next, command: next[0]?.command ?? '', params: next[0]?.params ?? '' });
    };
    const moveStep = (idx: number, dir: -1 | 1) => {
        const target = idx + dir;
        if (target < 0 || target >= steps.length) return;
        const next = [...steps];
        [next[idx], next[target]] = [next[target], next[idx]];
        onChange({ ...form, steps: next, command: next[0]?.command ?? '', params: next[0]?.params ?? '' });
    };
    const isValid = form.name.trim() && steps.some(s => s.command.trim());

    return (
        <div className="border border-cyan-400/40 bg-black/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono tracking-[0.3em] uppercase text-cyan-300 flex items-center gap-2">
                    <span className="w-1 h-3 bg-cyan-300" style={{ boxShadow: '0 0 6px #22d3ee' }} />
                    {title}
                </span>
                <button onClick={onCancel}
                    className="p-1 text-zinc-300 hover:text-red-300 hover:bg-red-400/10 transition-colors"><X size={14} /></button>
            </div>

            {/* Name row */}
            <div>
                <label className="text-[10px] font-mono text-zinc-200 uppercase tracking-[0.25em] block mb-1">NAME *</label>
                <input
                    value={form.name}
                    onChange={e => update('name', e.target.value.toUpperCase())}
                    placeholder="HARVEST"
                    className="w-full bg-black/40 border border-white/15 px-3 py-2 text-sm font-mono text-white placeholder-zinc-500 focus:border-cyan-400/60 focus:outline-none transition-colors tracking-wider"
                />
            </div>

            {/* Description */}
            <div>
                <label className="text-[10px] font-mono text-zinc-200 uppercase tracking-[0.25em] block mb-1">DESCRIPTION</label>
                <input
                    value={form.description}
                    onChange={e => update('description', e.target.value)}
                    placeholder="Brief description of what this quickhack does"
                    className="w-full bg-black/40 border border-white/15 px-3 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:border-cyan-400/60 focus:outline-none transition-colors"
                />
            </div>

            {/* Command Steps */}
            <div>
                <label className="text-[10px] font-mono text-zinc-200 uppercase tracking-[0.25em] block mb-1.5">
                    COMMAND STEPS *
                    <span className="text-zinc-400 ml-2 normal-case tracking-normal">— {steps.length} step{steps.length !== 1 ? 's' : ''}, executed in order</span>
                    {form.variables && form.variables.length > 0 && (
                        <span className="text-zinc-400 ml-2 normal-case tracking-normal">| variables: {form.variables.map(v => `{{${v.key}}}`).join(', ')}</span>
                    )}
                </label>
                <div className="space-y-2">
                    {steps.map((step, idx) => (
                        <div key={idx} className="border border-white/10 bg-black/40 p-3 space-y-2 relative group">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-mono text-zinc-200 tracking-[0.2em] select-none">STEP {idx + 1}</span>
                                <div className="flex-1" />
                                {steps.length > 1 && (
                                    <>
                                        <button onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                                            className="p-0.5 text-zinc-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Move up">
                                            <ChevronUp size={12} />
                                        </button>
                                        <button onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}
                                            className="p-0.5 text-zinc-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Move down">
                                            <ChevronDown size={12} />
                                        </button>
                                        <button onClick={() => removeStep(idx)}
                                            className="p-0.5 text-zinc-300 hover:text-red-300 hover:bg-red-400/10 transition-colors" title="Remove step">
                                            <X size={12} />
                                        </button>
                                    </>
                                )}
                            </div>
                            <input
                                value={step.command}
                                onChange={e => updateStep(idx, 'command', e.target.value)}
                                placeholder="shell, mimikatz, download, etc."
                                className="w-full bg-black/50 border border-white/15 px-2.5 py-1.5 text-xs font-mono text-white placeholder-zinc-500 focus:border-cyan-400/60 focus:outline-none transition-colors"
                            />
                            <textarea
                                value={step.params}
                                onChange={e => updateStep(idx, 'params', e.target.value)}
                                placeholder="Command parameters"
                                rows={2}
                                className="w-full bg-black/50 border border-white/15 px-2.5 py-1.5 text-xs font-mono text-white placeholder-zinc-500 focus:border-cyan-400/60 focus:outline-none transition-colors resize-none cyber-scrollbar"
                            />
                        </div>
                    ))}
                    <button onClick={addStep}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono border border-dashed border-white/15 text-zinc-300 hover:text-cyan-300 hover:border-cyan-400/50 hover:bg-cyan-400/5 transition-colors tracking-[0.2em] w-full justify-center">
                        <Plus size={12} /> ADD STEP
                    </button>
                </div>
            </div>

            {/* Variables */}
            <VariablesEditor
                variables={form.variables ?? []}
                onChange={vars => update('variables', vars)}
                accentColor={form.color}
            />

            {/* Icon picker */}
            <div>
                <label className="text-[10px] font-mono text-zinc-200 uppercase tracking-[0.25em] block mb-1">ICON</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                    {PRESET_ICON_NAMES.map(iconName => (
                        <button
                            key={iconName}
                            onClick={() => update('icon', iconName)}
                            title={iconName}
                            className={cn(
                                "w-8 h-8 flex items-center justify-center border transition-all",
                                form.icon === iconName
                                    ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-300 scale-110"
                                    : "border-white/15 hover:border-white/40 bg-black/40 text-zinc-200 hover:text-white"
                            )}
                        >
                            <LucideIcon name={iconName} size={16} />
                        </button>
                    ))}
                </div>
            </div>

            {/* Color picker */}
            <div>
                <label className="text-[10px] font-mono text-zinc-200 uppercase tracking-[0.25em] block mb-1">ACCENT COLOR</label>
                <div className="flex items-center gap-2 flex-wrap">
                    {PRESET_COLORS.map(c => (
                        <button
                            key={c}
                            onClick={() => update('color', c)}
                            className={cn(
                                "w-7 h-7 border transition-all",
                                form.color === c ? "scale-110 border-white" : "border-white/15 hover:border-white/40"
                            )}
                            style={{ background: c }}
                        />
                    ))}
                    <input
                        type="color"
                        value={form.color}
                        onChange={e => update('color', e.target.value)}
                        className="w-7 h-7 bg-transparent border border-white/15 cursor-pointer"
                        title="Custom color"
                    />
                    <span className="text-[10px] font-mono text-zinc-200 ml-1 px-1.5 py-0.5 border border-white/15 bg-black/40">{form.color}</span>
                </div>
            </div>

            {/* Agent type restriction */}
            <div>
                <label className="text-[10px] font-mono text-zinc-200 uppercase tracking-[0.25em] block mb-1">
                    COMPATIBLE AGENTS
                    <span className="text-zinc-400 ml-2 normal-case tracking-normal">— leave empty to allow all agents</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                    {KNOWN_AGENT_TYPES.map(agent => {
                        const selected = (form.agentTypes ?? []).includes(agent);
                        return (
                            <button
                                key={agent}
                                type="button"
                                onClick={() => {
                                    const current = form.agentTypes ?? [];
                                    update('agentTypes', selected
                                        ? current.filter(a => a !== agent)
                                        : [...current, agent]
                                    );
                                }}
                                className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono border transition-all tracking-[0.15em]",
                                    selected
                                        ? "border-cyan-400/60 text-cyan-300 bg-cyan-400/10"
                                        : "border-white/15 text-zinc-200 hover:border-white/40 hover:text-white bg-black/40"
                                )}
                            >
                                <Cpu size={9} className={selected ? 'text-cyan-300' : 'text-zinc-400'} />
                                {agent.toUpperCase()}
                            </button>
                        );
                    })}
                </div>
                {(form.agentTypes ?? []).length === 0 && (
                    <div className="text-[10px] font-mono text-emerald-300 mt-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" style={{ boxShadow: '0 0 4px #34d399' }} />
                        Unrestricted — runs on any agent
                    </div>
                )}
            </div>

            {/* Preview + Save */}
            <div className="flex items-center justify-between pt-3 border-t border-white/10">
                {/* Preview */}
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 flex items-center justify-center"
                        style={{
                            background: `${form.color}10`,
                            border: `1px solid ${form.color}80`,
                            color: form.color,
                            boxShadow: `inset 0 0 10px ${form.color}25`,
                        }}>
                        <LucideIcon name={form.icon} size={18} />
                    </div>
                    <div>
                        <span className="text-xs font-bold font-mono tracking-[0.18em]"
                            style={{ color: form.color, textShadow: `0 0 6px ${form.color}30` }}>
                            {form.name || 'UNNAMED'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={onCancel}
                        className="px-4 py-1.5 text-[10px] font-mono text-zinc-200 border border-white/15 hover:text-white hover:border-white/40 transition-colors tracking-[0.2em]">
                        CANCEL
                    </button>
                    <button onClick={onSave}
                        disabled={!isValid}
                        className={cn(
                            "flex items-center gap-2 px-4 py-1.5 text-[10px] font-mono tracking-[0.2em] border transition-colors",
                            isValid
                                ? "border-cyan-400/60 text-cyan-300 bg-cyan-400/10 hover:bg-cyan-400/20 hover:border-cyan-300"
                                : "border-white/10 text-zinc-500 cursor-not-allowed"
                        )}>
                        <Save size={12} /> SAVE
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuickHacks;
