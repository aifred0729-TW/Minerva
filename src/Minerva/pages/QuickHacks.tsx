import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { useAppStore } from '../store';
import { Shield, Plus, Trash2, Edit, Save, X, Copy, ChevronDown, ChevronUp, Globe, Hash } from 'lucide-react';
import { QuickHackDef, QuickHackStep, QuickHackVariable, DEFAULT_QUICKHACKS, QUICKHACK_SETTING_KEY, useQuickHacks } from '../lib/quickhacks';
import { LucideIcon, PRESET_ICON_NAMES } from '../lib/iconMap';
import { useSetMythicSetting } from '../components/MythicSavedUserSetting';

const PRESET_COLORS = ['#22d3ee', '#22c55e', '#ff003c', '#ff6600', '#ffcc00', '#00ff88', '#6633ff', '#ff33cc', '#3b82f6', '#f59e0b'];

// Minerva page accent — matches the cyberpunk HUD palette
const __PAGE_ACCENT = '#22d3ee'; // cyan

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
};

const QuickHacks = () => {
    const { isSidebarCollapsed } = useAppStore();
    const storedHacks = useQuickHacks();
    const [setSetting] = useSetMythicSetting() as any;

    const [hacks, setHacks] = useState<QuickHackDef[]>(storedHacks);

    useEffect(() => {
        if (Array.isArray(storedHacks)) setHacks(storedHacks);
    }, [storedHacks]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<QuickHackDef | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [createForm, setCreateForm] = useState<Omit<QuickHackDef, 'id'>>(emptyHack);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const persistHacks = useCallback((next: QuickHackDef[]) => {
        setHacks(next);
        setSetting({ setting_name: QUICKHACK_SETTING_KEY, value: next });
    }, [setSetting]);

    const handleCreate = useCallback(() => {
        const steps = (createForm.steps ?? []).filter(s => s.command.trim());
        if (!createForm.name.trim() || steps.length === 0) return;
        const synced = { ...createForm, steps, command: steps[0].command, params: steps[0].params };
        const newHack: QuickHackDef = { ...synced, id: generateId() };
        persistHacks([...hacks, newHack]);
        setCreateForm(emptyHack);
        setIsCreating(false);
    }, [createForm, hacks, persistHacks]);

    const handleUpdate = useCallback(() => {
        if (!editForm) return;
        const steps = (editForm.steps ?? []).filter(s => s.command.trim());
        if (!editForm.name.trim() || steps.length === 0) return;
        const synced = { ...editForm, steps, command: steps[0].command, params: steps[0].params };
        persistHacks(hacks.map(h => h.id === synced.id ? synced : h));
        setEditingId(null);
        setEditForm(null);
    }, [editForm, hacks, persistHacks]);

    const handleDelete = useCallback((id: string) => {
        persistHacks(hacks.filter(h => h.id !== id));
        if (editingId === id) { setEditingId(null); setEditForm(null); }
    }, [hacks, persistHacks, editingId]);

    const handleDuplicate = useCallback((hack: QuickHackDef) => {
        const dup: QuickHackDef = { ...hack, id: generateId(), name: `${hack.name} (COPY)` };
        persistHacks([...hacks, dup]);
    }, [hacks, persistHacks]);

    const handleResetDefaults = useCallback(() => {
        persistHacks(DEFAULT_QUICKHACKS);
        setEditingId(null);
        setEditForm(null);
    }, [persistHacks]);

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
                        <div className="p-3 border border-white/50 bg-white/10 rounded">
                            <Shield size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">QUICKHACK ARSENAL</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                {hacks.length} MODULE{hacks.length !== 1 ? 'S' : ''} LOADED
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleResetDefaults}
                            className="px-3 py-2 text-xs font-mono border border-white/10 text-gray-400 hover:text-white hover:border-white/30 transition-colors tracking-wider"
                        >
                            RESET DEFAULTS
                        </button>
                        <button
                            onClick={() => { setIsCreating(true); setEditingId(null); setEditForm(null); }}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-mono border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 transition-colors tracking-wider"
                        >
                            <Plus size={14} /> NEW QUICKHACK
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
                                    onChange={setCreateForm as any}
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
                                        onChange={setEditForm}
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
                            className="text-center py-20 text-gray-500 font-mono text-sm"
                        >
                            <Shield size={40} className="mx-auto mb-4 opacity-30" />
                            <div>NO QUICKHACKS LOADED</div>
                            <div className="text-xs mt-1 text-gray-600">Create a new module or reset to defaults</div>
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
        className="border border-white/[0.06] bg-black/40 hover:border-white/[0.12] transition-colors"
        style={{ borderLeftColor: `${hack.color}50`, borderLeftWidth: 3 }}
    >
        {/* Main row */}
        <div className="flex items-center gap-4 px-5 py-4 cursor-pointer" onClick={onToggleExpand}>
            {/* Icon */}
            <div className="w-10 h-10 flex items-center justify-center shrink-0 rounded"
                style={{ background: `${hack.color}18`, border: `1px solid ${hack.color}35`, color: hack.color }}>
                <LucideIcon name={hack.icon} size={20} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-bold font-mono tracking-[0.15em]" style={{ color: hack.color }}>
                        {hack.name}
                    </span>
                    {(hack.steps ?? []).length > 1 && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 border tracking-wider"
                            style={{ borderColor: `${hack.color}35`, color: `${hack.color}90` }}>
                            {hack.steps.length} STEPS
                        </span>
                    )}
                    {hack.variables && hack.variables.length > 0 && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 border tracking-wider flex items-center gap-1"
                            style={{ borderColor: `${hack.color}35`, color: `${hack.color}90` }}>
                            {hack.variables.map(v => v.type === 'ip' ? <Globe key={v.key} size={8} /> : <Hash key={v.key} size={8} />)}
                            {hack.variables.length} VAR{hack.variables.length !== 1 ? 'S' : ''}
                        </span>
                    )}
                </div>
                <div className="text-xs text-gray-400 font-mono mt-0.5 truncate">{hack.description}</div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                <button onClick={onEdit} className="p-2 text-gray-500 hover:text-cyan-400 transition-colors" title="Edit">
                    <Edit size={14} />
                </button>
                <button onClick={onDuplicate} className="p-2 text-gray-500 hover:text-blue-400 transition-colors" title="Duplicate">
                    <Copy size={14} />
                </button>
                <button onClick={onDelete} className="p-2 text-gray-500 hover:text-red-400 transition-colors" title="Delete">
                    <Trash2 size={14} />
                </button>
            </div>

            <button className="text-gray-500 shrink-0">
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
                    <div className="px-5 pb-4 pt-1 border-t border-white/5 space-y-3">
                        {/* Steps */}
                        <div>
                            <div className="text-[9px] font-mono text-gray-400 uppercase tracking-[0.2em] mb-1.5">
                                COMMANDS <span className="text-gray-600">({(hack.steps ?? []).length || 1} STEP{((hack.steps ?? []).length || 1) !== 1 ? 'S' : ''})</span>
                            </div>
                            <div className="space-y-1.5">
                                {(hack.steps && hack.steps.length > 0 ? hack.steps : [{ command: hack.command, params: hack.params }]).map((step, idx) => (
                                    <div key={idx} className="flex gap-2 items-start text-xs font-mono bg-black/30 border border-white/5 px-2.5 py-1.5">
                                        <span className="text-gray-500 shrink-0 select-none">{idx + 1}.</span>
                                        <span className="shrink-0" style={{ color: hack.color }}>{step.command}</span>
                                        {step.params && <span className="text-gray-400 break-all">{step.params}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-6 items-end">
                            <div className="flex-1 min-w-0">
                                <div className="text-[9px] font-mono text-gray-400 uppercase tracking-[0.2em] mb-1">ICON</div>
                                <div className="flex items-center gap-2 text-xs text-gray-200">
                                    <LucideIcon name={hack.icon} size={14} style={{ color: hack.color }} />
                                    <span>{hack.icon}</span>
                                </div>
                            </div>
                            <DetailRow label="COLOR" value={hack.color} color={hack.color} />
                        </div>
                        {hack.variables && hack.variables.length > 0 && (
                            <div>
                                <div className="text-[9px] font-mono text-gray-400 uppercase tracking-[0.2em] mb-1">VARIABLES</div>
                                <div className="flex flex-wrap gap-2">
                                    {hack.variables.map(v => (
                                        <span key={v.key} className="text-[10px] font-mono px-2 py-1 border border-white/10 bg-black/30 flex items-center gap-1.5">
                                            {v.type === 'ip'
                                                ? <Globe size={9} className="text-cyan-400" />
                                                : <Hash size={9} className="text-amber-400" />
                                            }
                                            <span className="text-gray-300">{`{{${v.key}}}`}</span>
                                            <span className="text-gray-500 uppercase">{v.type}</span>
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
        <div className="text-[9px] font-mono text-gray-400 uppercase tracking-[0.2em] mb-1">{label}</div>
        <div className={cn("text-xs text-gray-200 break-all", mono && "font-mono bg-black/30 px-2 py-1 border border-white/5 max-h-20 overflow-y-auto cyber-scrollbar")}>
            {value || <span className="text-gray-600 italic">—</span>}
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
            <label className="text-[10px] font-mono text-gray-300 uppercase tracking-[0.2em] block mb-1.5">
                VARIABLES <span className="text-gray-500">— use {'{{KEY}}'} in parameters</span>
            </label>
            <div className="space-y-2">
                {variables.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-1.5 border bg-black/40 text-[10px] font-mono shrink-0"
                            style={{ borderColor: v.type === 'ip' ? 'rgba(34,211,238,0.3)' : 'rgba(245,158,11,0.3)' }}>
                            {v.type === 'ip'
                                ? <Globe size={10} className="text-cyan-400" />
                                : <Hash size={10} className="text-amber-400" />
                            }
                            <span className="text-gray-400 uppercase">{v.type}</span>
                        </div>
                        <input
                            value={v.key}
                            onChange={e => updateKey(i, e.target.value)}
                            placeholder="VARIABLE_NAME"
                            className="flex-1 bg-black/50 border border-white/10 px-2 py-1.5 text-[11px] font-mono text-white placeholder-gray-600 focus:border-cyan-500/40 focus:outline-none transition-colors tracking-wider"
                        />
                        <span className="text-[9px] font-mono text-gray-500 shrink-0">{`{{${v.key}}}`}</span>
                        <button onClick={() => removeVariable(i)} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                            <X size={12} />
                        </button>
                    </div>
                ))}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => addVariable('ip')}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono border border-cyan-500/25 text-cyan-400/80 hover:bg-cyan-500/10 hover:text-cyan-300 transition-colors tracking-wider"
                    >
                        <Globe size={10} /> + IP
                    </button>
                    <button
                        onClick={() => addVariable('number')}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono border border-amber-500/25 text-amber-400/80 hover:bg-amber-500/10 hover:text-amber-300 transition-colors tracking-wider"
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
    onChange: (f: any) => void;
    onSave: () => void;
    onCancel: () => void;
}) => {
    const update = (key: string, value: any) => onChange({ ...form, [key]: value });
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
        <div className="border border-cyan-500/20 bg-black/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono tracking-[0.25em] uppercase text-cyan-400">{title}</span>
                <button onClick={onCancel} className="text-gray-500 hover:text-white transition-colors"><X size={14} /></button>
            </div>

            {/* Name row */}
            <div>
                <label className="text-[10px] font-mono text-gray-300 uppercase tracking-[0.2em] block mb-1">NAME *</label>
                <input
                    value={form.name}
                    onChange={e => update('name', e.target.value.toUpperCase())}
                    placeholder="HARVEST"
                    className="w-full bg-black/50 border border-white/10 px-3 py-2 text-sm font-mono text-white placeholder-gray-500 focus:border-cyan-500/40 focus:outline-none transition-colors tracking-wider"
                />
            </div>

            {/* Description */}
            <div>
                <label className="text-[10px] font-mono text-gray-300 uppercase tracking-[0.2em] block mb-1">DESCRIPTION</label>
                <input
                    value={form.description}
                    onChange={e => update('description', e.target.value)}
                    placeholder="Brief description of what this quickhack does"
                    className="w-full bg-black/50 border border-white/10 px-3 py-2 text-xs font-mono text-white placeholder-gray-500 focus:border-cyan-500/40 focus:outline-none transition-colors"
                />
            </div>

            {/* Command Steps */}
            <div>
                <label className="text-[10px] font-mono text-gray-300 uppercase tracking-[0.2em] block mb-1.5">
                    COMMAND STEPS *
                    <span className="text-gray-500 ml-2">— {steps.length} step{steps.length !== 1 ? 's' : ''}, executed in order</span>
                    {form.variables && form.variables.length > 0 && (
                        <span className="text-gray-500 ml-2">| variables: {form.variables.map(v => `{{${v.key}}}`).join(', ')}</span>
                    )}
                </label>
                <div className="space-y-2">
                    {steps.map((step, idx) => (
                        <div key={idx} className="border border-white/[0.08] bg-black/30 p-3 space-y-2 relative group">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[9px] font-mono text-gray-500 tracking-wider select-none">STEP {idx + 1}</span>
                                <div className="flex-1" />
                                {steps.length > 1 && (
                                    <>
                                        <button onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                                            className="p-0.5 text-gray-600 hover:text-gray-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors" title="Move up">
                                            <ChevronUp size={12} />
                                        </button>
                                        <button onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}
                                            className="p-0.5 text-gray-600 hover:text-gray-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors" title="Move down">
                                            <ChevronDown size={12} />
                                        </button>
                                        <button onClick={() => removeStep(idx)}
                                            className="p-0.5 text-gray-600 hover:text-red-400 transition-colors" title="Remove step">
                                            <X size={12} />
                                        </button>
                                    </>
                                )}
                            </div>
                            <input
                                value={step.command}
                                onChange={e => updateStep(idx, 'command', e.target.value)}
                                placeholder="shell, mimikatz, download, etc."
                                className="w-full bg-black/50 border border-white/10 px-2.5 py-1.5 text-xs font-mono text-white placeholder-gray-500 focus:border-cyan-500/40 focus:outline-none transition-colors"
                            />
                            <textarea
                                value={step.params}
                                onChange={e => updateStep(idx, 'params', e.target.value)}
                                placeholder="Command parameters"
                                rows={2}
                                className="w-full bg-black/50 border border-white/10 px-2.5 py-1.5 text-xs font-mono text-white placeholder-gray-500 focus:border-cyan-500/40 focus:outline-none transition-colors resize-none cyber-scrollbar"
                            />
                        </div>
                    ))}
                    <button onClick={addStep}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono border border-dashed border-white/10 text-gray-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-colors tracking-wider w-full justify-center">
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
                <label className="text-[10px] font-mono text-gray-300 uppercase tracking-[0.2em] block mb-1">ICON</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                    {PRESET_ICON_NAMES.map(iconName => (
                        <button
                            key={iconName}
                            onClick={() => update('icon', iconName)}
                            title={iconName}
                            className={cn(
                                "w-8 h-8 flex items-center justify-center border transition-all",
                                form.icon === iconName
                                    ? "border-cyan-500/50 bg-cyan-500/10 scale-110 text-cyan-400"
                                    : "border-white/10 hover:border-white/30 bg-black/30 text-gray-400 hover:text-white"
                            )}
                        >
                            <LucideIcon name={iconName} size={16} />
                        </button>
                    ))}
                </div>
            </div>

            {/* Color picker */}
            <div>
                <label className="text-[10px] font-mono text-gray-300 uppercase tracking-[0.2em] block mb-1">ACCENT COLOR</label>
                <div className="flex items-center gap-2 flex-wrap">
                    {PRESET_COLORS.map(c => (
                        <button
                            key={c}
                            onClick={() => update('color', c)}
                            className={cn(
                                "w-7 h-7 rounded-sm border-2 transition-all",
                                form.color === c ? "scale-110 border-white/60" : "border-transparent hover:border-white/30"
                            )}
                            style={{ background: c }}
                        />
                    ))}
                    <input
                        type="color"
                        value={form.color}
                        onChange={e => update('color', e.target.value)}
                        className="w-7 h-7 bg-transparent border border-white/10 cursor-pointer"
                        title="Custom color"
                    />
                    <span className="text-[10px] font-mono text-gray-400 ml-1">{form.color}</span>
                </div>
            </div>

            {/* Preview + Save */}
            <div className="flex items-center justify-between pt-3 border-t border-white/5">
                {/* Preview */}
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 flex items-center justify-center rounded"
                        style={{ background: `${form.color}18`, border: `1px solid ${form.color}35`, color: form.color }}>
                        <LucideIcon name={form.icon} size={18} />
                    </div>
                    <div>
                        <span className="text-xs font-bold font-mono tracking-wider" style={{ color: form.color }}>
                            {form.name || 'UNNAMED'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={onCancel}
                        className="px-4 py-2 text-xs font-mono text-gray-400 hover:text-white border border-white/10 hover:border-white/30 transition-colors tracking-wider">
                        CANCEL
                    </button>
                    <button onClick={onSave}
                        disabled={!isValid}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 text-xs font-mono tracking-wider border transition-colors",
                            isValid
                                ? "border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"
                                : "border-white/5 text-gray-600 cursor-not-allowed"
                        )}>
                        <Save size={12} /> SAVE
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuickHacks;
