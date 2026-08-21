import React, { useState, useRef, useMemo } from 'react';
import { useMutation } from "@apollo/client/react";
import {
    Terminal,
    X,
    Palette,
    Plus,
    Upload,
    ChevronDown,
    Globe,
    CheckCircle,
    Layers,
    ExternalLink,
    CheckSquare,
    Square,
    Activity,
    Bell,
}from 'lucide-react';
import { cn, getErrorMessage, parseIPString } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import { CyberModal } from '../../components/CyberModal';
import { CREATE_TASK_BULK, IMPORT_CALLBACK_CONFIG } from '../../lib/api';

export const COLOR_PRESETS = [
    '', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff',
];

export const CallbackColorPickerModal = ({ callback, onClose, onSave }: {
    callback: any; onClose: () => void; onSave: (color: string) => void;
}) => {
    const [selectedColor, setSelectedColor] = useState(callback.color || '');
    const [customColor, setCustomColor] = useState(callback.color || '');
    return (
        <CyberModal title="SET_CALLBACK_COLOR" onClose={onClose} icon={<Palette />}>
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-mono text-gray-500 mb-2 uppercase tracking-wider">Preset Colors</label>
                    <div className="flex flex-wrap gap-2">
                        {COLOR_PRESETS.map(c => (
                            <button key={c || 'none'} onClick={() => { setSelectedColor(c); setCustomColor(c); }}
                                className={cn('w-8 h-8 rounded border-2 transition-all',
                                    selectedColor === c ? 'border-signal scale-110' : 'border-white/20 hover:border-white/50')}
                                style={{ backgroundColor: c || 'transparent' }}
                                title={c || 'None (default)'}>
                                {!c && <X size={14} className="text-gray-500 m-auto" />}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-mono text-gray-500 mb-1 uppercase tracking-wider">Custom Color</label>
                    <div className="flex gap-2 items-center">
                        <input type="color" value={customColor || '#00ff41'}
                            onChange={e => { setCustomColor(e.target.value); setSelectedColor(e.target.value); }}
                            className="w-10 h-10 rounded cursor-pointer border border-white/20 bg-transparent" />
                        <input type="text" value={customColor} onChange={e => { setCustomColor(e.target.value); setSelectedColor(e.target.value); }}
                            className="flex-1 bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                            placeholder="#rrggbb" />
                        {selectedColor && (
                            <div className="w-10 h-10 rounded border border-white/20" style={{ backgroundColor: selectedColor }} />
                        )}
                    </div>
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                    <button onClick={() => onSave(selectedColor)} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">SAVE</button>
                </div>
            </div>
        </CyberModal>
    );
};

/* ─────────── IP Multi-selector Inner Dialog ─────────── */
export const IPSelectorModal = ({ callback, onClose, onSave }: {
    callback: any; onClose: () => void; onSave: (ips: string[]) => void;
}) => {
    const allIPs = parseIPString(callback.ip);
    const [primaryIdx, setPrimaryIdx] = useState(0);
    if (allIPs.length <= 1) {
        setTimeout(onClose, 0);
        return null;
    }
    const reordered = [allIPs[primaryIdx], ...allIPs.filter((_, i) => i !== primaryIdx)];
    return (
        <CyberModal title="SELECT_PRIMARY_IP" onClose={onClose} icon={<Globe />}>
            <div className="space-y-3">
                <p className="text-xs text-gray-500 font-mono">Select which IP to display as primary for Callback #{callback.display_id}</p>
                <div className="space-y-1">
                    {allIPs.map((ip, i) => (
                        <button key={i} onClick={() => setPrimaryIdx(i)}
                            className={cn('w-full flex items-center gap-3 px-3 py-2 border rounded font-mono text-sm transition-colors text-left',
                                primaryIdx === i ? 'border-signal/50 bg-signal/10 text-signal' : 'border-white/10 text-gray-300 hover:border-signal/30 hover:bg-white/5')}>
                            {primaryIdx === i ? <CheckCircle size={14} className="text-signal shrink-0" /> : <Globe size={14} className="text-gray-500 shrink-0" />}
                            {ip}
                            {i === 0 && <span className="ml-auto text-[10px] text-gray-500 font-mono">current primary</span>}
                        </button>
                    ))}
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                    <button onClick={() => onSave(reordered)} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">SAVE</button>
                </div>
            </div>
        </CyberModal>
    );
};

/* ─────────── Modify MythicTree Groups Modal ─────────── */
export const ModifyGroupsModal = ({ callback, allCallbacks, onClose, onSave }: {
    callback: any; allCallbacks?: any[]; onClose: () => void; onSave: (groups: string[]) => void;
}) => {
    const [groups, setGroups] = useState<string[]>((callback.mythictree_groups || []).filter(Boolean));
    const [newGroup, setNewGroup] = useState('');
    const [bulkMode, setBulkMode] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [showAllGroups, setShowAllGroups] = useState(false);

    const addGroup = () => {
        const g = newGroup.trim();
        if (g && !groups.includes(g)) { setGroups(prev => [...prev, g]); }
        setNewGroup('');
    };
    const removeGroup = (g: string) => setGroups(prev => prev.filter(x => x !== g));

    const applyBulk = () => {
        const newGroups = bulkText.split(/[\n,]+/).map(g => g.trim()).filter(Boolean);
        setGroups(prev => {
            const merged = [...prev];
            newGroups.forEach(g => { if (!merged.includes(g)) merged.push(g); });
            return merged;
        });
        setBulkText('');
        setBulkMode(false);
    };

    // Collect all unique groups from all callbacks for the VIEW ALL section
    const allGroups = useMemo(() => {
        if (!allCallbacks) return [];
        const s = new Set<string>();
        allCallbacks.forEach((cb: any) => (cb.mythictree_groups || []).forEach((g: string) => { if (g) s.add(g); }));
        return [...s].sort();
    }, [allCallbacks]);

    return (
        <CyberModal title="MODIFY_CALLBACK_GROUPS" onClose={onClose} icon={<Layers />}>
            <div className="space-y-4 min-w-[360px] max-w-[480px]">
                <p className="text-xs text-gray-500 font-mono">Modify MythicTree groups for Callback #{callback.display_id} ({callback.user}@{callback.host})</p>

                {/* Input mode toggle */}
                <div className="flex gap-2">
                    <button onClick={() => setBulkMode(false)}
                        className={cn('px-2 py-0.5 text-[10px] font-mono border transition-colors', !bulkMode ? 'border-signal/50 text-signal bg-signal/10' : 'border-white/10 text-gray-500 hover:border-signal/30')}>
                        SINGLE
                    </button>
                    <button onClick={() => setBulkMode(true)}
                        className={cn('px-2 py-0.5 text-[10px] font-mono border transition-colors', bulkMode ? 'border-signal/50 text-signal bg-signal/10' : 'border-white/10 text-gray-500 hover:border-signal/30')}>
                        BULK INPUT
                    </button>
                </div>

                {!bulkMode ? (
                    <div className="flex gap-2">
                        <input type="text" value={newGroup} onChange={e => setNewGroup(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addGroup()}
                            className="flex-1 bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                            placeholder="Add group name..." autoFocus />
                        <button onClick={addGroup} disabled={!newGroup.trim()}
                            className="px-3 py-2 bg-signal/20 border border-signal/40 text-signal hover:bg-signal/30 transition-colors disabled:opacity-30">
                            <Plus size={14} />
                        </button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <textarea
                            value={bulkText}
                            onChange={e => setBulkText(e.target.value)}
                            className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm resize-y min-h-[80px]"
                            placeholder="One group name per line (or comma-separated)&#10;e.g.&#10;web-servers&#10;internal&#10;domain-joined"
                            autoFocus
                        />
                        <button onClick={applyBulk} disabled={!bulkText.trim()}
                            className="w-full py-1.5 bg-signal/20 border border-signal/40 text-signal hover:bg-signal/30 transition-colors disabled:opacity-30 text-xs font-mono">
                            APPLY BULK GROUPS
                        </button>
                    </div>
                )}

                {/* Current groups */}
                <div className="min-h-[60px] flex flex-wrap gap-2">
                    {groups.length === 0 && <span className="text-gray-600 font-mono text-xs italic">No groups assigned — callback will be hidden from File/Process Browser</span>}
                    {groups.map(g => (
                        <span key={g} className="flex items-center gap-1 px-2 py-1 bg-signal/10 border border-signal/30 text-signal text-xs font-mono rounded">
                            {g}
                            <button onClick={() => removeGroup(g)} className="ml-1 text-signal/60 hover:text-red-400 transition-colors"><X size={10} /></button>
                        </span>
                    ))}
                </div>

                {/* View All Groups (across all callbacks) */}
                {allGroups.length > 0 && (
                    <div className="border border-white/10 rounded overflow-hidden">
                        <button
                            onClick={() => setShowAllGroups(p => !p)}
                            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-mono text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                        >
                            <span className="flex items-center gap-1.5"><Layers size={10} /> VIEW ALL GROUPS ({allGroups.length} in use across all callbacks)</span>
                            <ChevronDown size={10} className={cn('transition-transform duration-200', showAllGroups && 'rotate-180')} />
                        </button>
                        {showAllGroups && (
                            <div className="px-3 pb-2 flex flex-wrap gap-1.5 border-t border-white/5 pt-2 bg-black/20">
                                {allGroups.map(g => (
                                    <button key={g}
                                        onClick={() => { if (!groups.includes(g)) setGroups(prev => [...prev, g]); }}
                                        title={groups.includes(g) ? 'Already assigned' : 'Click to add to this callback'}
                                        className={cn(
                                            'flex items-center gap-1 px-2 py-0.5 border text-[10px] font-mono rounded transition-colors',
                                            groups.includes(g)
                                                ? 'border-signal/20 text-signal/40 bg-signal/5 cursor-default'
                                                : 'border-white/10 text-gray-400 hover:border-signal/40 hover:text-signal hover:bg-signal/5 cursor-pointer'
                                        )}>
                                        {groups.includes(g) ? <CheckCircle size={8} className="text-signal/40" /> : <Plus size={8} />}
                                        {g}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                    <button onClick={() => onSave(groups)} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">SAVE</button>
                </div>
            </div>
        </CyberModal>
    );
};

/* ─────────── C2 Path Dialog ─────────── */
// Custom node type for C2 graph: Agent node

type OpenMultipleMode = 'interact' | 'console' | 'files' | 'process';
export const OpenMultipleDialog = ({ allCallbacks, onClose }: { allCallbacks: any[]; onClose: () => void }) => {
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [mode, setMode] = useState<OpenMultipleMode>('interact');
    const active = allCallbacks.filter((c: any) => c.active !== false);
    const toggleSel = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const handleOpen = () => {
        if (mode === 'console') {
            // interactConsole — open console/terminal view in new tab
            [...selected].forEach(id => window.open(`/console/${id}`, '_blank'));
        } else {
            const suffix = mode === 'files' ? '?tab=files' : mode === 'process' ? '?tab=process' : '';
            [...selected].forEach(id => window.open(`/new/callbacks/${id}${suffix}`, '_blank'));
        }
        onClose();
    };
    const modeLabel: Record<OpenMultipleMode, string> = {
        interact: 'EXPAND', console: 'CONSOLE', files: 'FILES', process: 'PROCESSES',
    };
    const modeDesc: Record<OpenMultipleMode, string> = {
        interact: 'Full expand view', console: 'Console/terminal view', files: 'File browser', process: 'Process browser',
    };
    return (
        <CyberModal title="OPEN_MULTIPLE_CALLBACKS" onClose={onClose} icon={<ExternalLink />}>
            <div className="space-y-4">
                <div className="flex gap-1.5 text-xs font-mono flex-wrap">
                    {(['interact', 'console', 'files', 'process'] as OpenMultipleMode[]).map(m => (
                        <button key={m} onClick={() => setMode(m)} title={modeDesc[m]}
                            className={cn('px-3 py-1 border transition-colors uppercase', mode === m ? 'border-signal text-signal bg-signal/10' : 'border-ghost/30 text-gray-500 hover:text-gray-300')}>
                            {modeLabel[m]}
                        </button>
                    ))}
                </div>
                <div className="text-[10px] font-mono text-gray-600">{modeDesc[mode]} — each opens in a new browser tab</div>
                <div className="max-h-64 overflow-y-auto cyber-scrollbar space-y-0.5">
                    {active.map((cb: any) => (
                        <label key={cb.id} className={cn('flex items-center gap-2 px-2 py-1.5 cursor-pointer border transition-colors',
                            selected.has(cb.display_id) ? 'border-signal/40 bg-signal/5 text-signal' : 'border-transparent text-gray-400 hover:text-gray-200')}>
                            <input type="checkbox" className="sr-only" checked={selected.has(cb.display_id)} onChange={() => toggleSel(cb.display_id)} />
                            {selected.has(cb.display_id) ? <CheckSquare size={12} className="text-signal shrink-0" /> : <Square size={12} className="text-gray-600 shrink-0" />}
                            <span className="font-mono text-xs">#{cb.display_id}</span>
                            <span className="text-signal text-xs">{cb.user}</span>
                            <span className="text-gray-500 text-xs">@{cb.host}</span>
                            <span className="ml-auto text-[10px] text-gray-600 border border-ghost/20 px-1">{cb.payload?.payloadtype?.name}</span>
                        </label>
                    ))}
                </div>
                <div className="flex items-center gap-2 justify-between">
                    <div className="flex gap-2">
                        <button onClick={() => setSelected(new Set(active.map((c: any) => c.display_id)))} className="text-[10px] font-mono text-gray-500 hover:text-signal">SELECT ALL</button>
                        <button onClick={() => setSelected(new Set())} className="text-[10px] font-mono text-gray-500 hover:text-red-400">CLEAR</button>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                        <button onClick={handleOpen} disabled={selected.size === 0}
                            className="px-5 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors disabled:opacity-40 flex items-center gap-2">
                            <ExternalLink size={13} /> OPEN {selected.size > 0 ? selected.size : ''}
                        </button>
                    </div>
                </div>
            </div>
        </CyberModal>
    );
};

/* ─────────── Task Multiple Dialog ─────────── */
export const TaskMultipleDialog = ({ selectedDisplayIds, allCallbacks, onClose }: {
    selectedDisplayIds: number[]; allCallbacks: any[]; onClose: () => void;
}) => {
    const [command, setCommand] = useState('');
    const [params, setParams] = useState('');
    const [tasking, setTasking] = useState(false);
    const [createTaskBulk] = useMutation<any>(CREATE_TASK_BULK);

    // Determine the payloadtype_id from the first selected callback — enforce same agent type
    const firstSelected = allCallbacks.find(c => selectedDisplayIds.includes(c.display_id));
    const payloadTypeId = firstSelected?.payload?.payloadtype?.id;
    const payloadTypeName = firstSelected?.payload?.payloadtype?.name;

    // Filter to only callbacks with the same payload type (prevent mixed-agent tasking)
    const compatibleIds = useMemo(() => {
        if (!payloadTypeId) return selectedDisplayIds;
        const compatSet = new Set(
            allCallbacks
                .filter(c => c.payload?.payloadtype?.id === payloadTypeId)
                .map(c => c.display_id)
        );
        return selectedDisplayIds.filter(id => compatSet.has(id));
    }, [selectedDisplayIds, allCallbacks, payloadTypeId]);

    const incompatibleCount = selectedDisplayIds.length - compatibleIds.length;

    const handleSubmit = async () => {
        if (!command.trim() || compatibleIds.length === 0) return;
        setTasking(true);
        try {
            const result = await createTaskBulk({
                variables: {
                    callback_ids: compatibleIds,
                    command: command.trim(),
                    params: params,
                    payload_type: payloadTypeName || '',
                    tasking_location: 'command_line',
                    original_params: params,
                    parameter_group_name: 'Default',
                }
            });
            if (result.data?.createTask?.status === 'error') {
                snackActions.error(result.data.createTask.error);
            } else {
                snackActions.success(`Tasked ${compatibleIds.length} callbacks: ${command}`);
                onClose();
            }
        } catch (e: unknown) {
            snackActions.error('Bulk task failed: ' + getErrorMessage(e));
        } finally {
            setTasking(false);
        }
    };

    return (
        <CyberModal title="TASK_MULTIPLE_CALLBACKS" onClose={onClose} icon={<Terminal />}>
            <div className="space-y-4">
                <div className="text-xs font-mono space-y-1">
                    <div className="text-gray-500">
                        Tasking <span className="text-signal font-bold">{compatibleIds.length}</span> callback{compatibleIds.length !== 1 ? 's' : ''}
                        {payloadTypeName && <span className="text-gray-400"> (agent: <span className="text-blue-400">{payloadTypeName}</span>)</span>}
                    </div>
                    {incompatibleCount > 0 && (
                        <div className="text-orange-400 text-[11px]">
                            ⚠ {incompatibleCount} selected callback{incompatibleCount > 1 ? 's' : ''} skipped (different agent type)
                        </div>
                    )}
                    <div className="text-gray-600 text-[10px]">
                        IDs: {compatibleIds.map(id => `#${id}`).join(', ')}
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-mono text-gray-500 mb-1 uppercase tracking-wider">Command</label>
                    <input type="text" value={command} onChange={e => setCommand(e.target.value)}
                        className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                        placeholder="e.g. ls, shell, ps" autoFocus />
                </div>
                <div>
                    <label className="block text-xs font-mono text-gray-500 mb-1 uppercase tracking-wider">Parameters (optional)</label>
                    <input type="text" value={params} onChange={e => setParams(e.target.value)}
                        className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                        placeholder="e.g. -path C:\Windows" />
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                    <button onClick={handleSubmit} disabled={tasking || !command.trim() || compatibleIds.length === 0}
                        className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors disabled:opacity-40 flex items-center gap-2">
                        {tasking ? <><Activity size={13} className="animate-spin" /> TASKING…</> : <><Terminal size={13} /> TASK ALL</>}
                    </button>
                </div>
            </div>
        </CyberModal>
    );
};

/* ─────────── Import Config Modal ─────────── */
export const ImportConfigModal = ({ onClose }: { onClose: () => void }) => {
    const [fileName, setFileName] = useState('');
    const [fileContents, setFileContents] = useState('');
    const [importConfig] = useMutation<any>(IMPORT_CALLBACK_CONFIG);
    const inputRef = useRef<HTMLInputElement>(null);

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = ev => setFileContents(ev.target?.result as string || '');
        reader.readAsBinaryString(file);
    };

    const handleSubmit = async () => {
        if (!fileContents) { snackActions.warning('Select a config file first'); return; }
        try {
            const config = JSON.parse(fileContents);
            const result = await importConfig({ variables: { config } });
            if (result.data?.importCallbackConfig?.status === 'success') {
                snackActions.success('Callback imported successfully');
                onClose();
            } else {
                snackActions.error(result.data?.importCallbackConfig?.error || 'Import failed');
            }
        } catch (e: unknown) {
            snackActions.error('Failed to parse config: ' + getErrorMessage(e));
        }
    };

    return (
        <CyberModal title="IMPORT_CALLBACK_CONFIG" onClose={onClose} icon={<Upload />}>
            <div className="space-y-4">
                <p className="text-xs text-gray-500 font-mono">Import a callback config exported from another Mythic server to interact with that callback from here.</p>
                <div>
                    <input ref={inputRef} type="file" accept=".json" onChange={onFileChange} className="hidden" />
                    <button onClick={() => inputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-600 hover:border-signal/50 text-gray-400 hover:text-signal transition-colors font-mono text-sm">
                        <Upload size={16} />
                        {fileName || 'Select Config File (.json)'}
                    </button>
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                    <button onClick={handleSubmit} disabled={!fileContents}
                        className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors disabled:opacity-40">
                        IMPORT
                    </button>
                </div>
            </div>
        </CyberModal>
    );
};

/* ─────────── Alert Trigger Modal ─────────── */
export const AlertTriggerModal = ({ callback, onClose, onSave }: {
    callback: any; onClose: () => void; onSave: (minutes: number | null) => void;
}) => {
    const hasTrigger = !!callback.trigger_on_checkin_after_time;
    const [minutes, setMinutes] = useState(10);
    return (
        <CyberModal title="SET_ALERT_TRIGGER" onClose={onClose} icon={<Bell />}>
            <div className="space-y-4">
                <p className="text-xs text-gray-500 font-mono">
                    Alert after Callback #{callback.display_id} ({callback.user}@{callback.host}) hasn't checked in for N minutes.
                    {hasTrigger && <><br/><span className="text-orange-400 font-bold">Alert trigger is currently active.</span></>}
                </p>

                <div className="space-y-2 bg-black/30 border border-white/5 rounded p-3">
                    <p className="text-[10px] text-gray-400 font-mono leading-relaxed">
                        This adjusts how long, in minutes, this callback must <span className="font-bold">not</span> checkin before finally checking in to trigger an <span className="font-bold">eventing workflow</span> (trigger is callback_checkin).
                    </p>
                    <p className="text-[10px] text-gray-400 font-mono leading-relaxed">
                        A zero value means never trigger.
                    </p>
                    <p className="text-[10px] text-gray-400 font-mono leading-relaxed">
                        If no eventing workflow for <span className="font-bold">callback_checkin</span> that matches the right payload_types and supported_os restrictions, then nothing will happen.
                    </p>
                </div>

                <div>
                    <label className="block text-xs font-mono text-gray-500 mb-1 uppercase tracking-wider">Minutes without checkin</label>
                    <input type="number" min="1" value={minutes} onChange={e => setMinutes(parseInt(e.target.value) || 1)}
                        className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm" autoFocus />
                </div>
                <div className="flex justify-between gap-3">
                    {hasTrigger && <button onClick={() => onSave(null)} className="px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-900/30 font-mono text-sm">REMOVE TRIGGER</button>}
                    <div className="flex gap-3 ml-auto">
                        <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                        <button onClick={() => onSave(minutes)} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">SET TRIGGER</button>
                    </div>
                </div>
            </div>
        </CyberModal>
    );
};

/* ─────────── Per-column filter input ─────────── */
export const ColumnFilterInput = ({ value, onChange, placeholder = 'Filter...' }: {
    value: string; onChange: (v: string) => void; placeholder?: string;
}) => (
    <div className="relative">
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            className="w-full rounded-sm border border-signal/20 bg-black/40 px-2 py-1 text-[11px] font-mono text-signal transition-colors placeholder:text-signal/40 hover:border-signal/40 focus:border-signal/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-signal"
            onClick={e => e.stopPropagation()} />
        {value && <button onClick={e => { e.stopPropagation(); onChange(''); }} className="absolute right-1 top-1/2 -translate-y-1/2 text-signal opacity-60 transition-opacity hover:opacity-100"><X size={10} /></button>}
    </div>
);

/* ─────────── Main Callbacks Page ─────────── */
