import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useSubscription, useLazyQuery } from '@apollo/client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Zap, 
    Plus, 
    Search, 
    X, 
    Check, 
    AlertCircle,
    ChevronDown,
    ChevronRight,
    Play,
    Pause,
    Trash2,
    Eye,
    EyeOff,
    Upload,
    Clock,
    Activity,
    FileText,
    Users,
    Loader,
    RefreshCw,
    StopCircle,
    RotateCcw,
    List,
    XCircle
} from 'lucide-react';

import { cn } from '../lib/utils';
import { useAppStore } from '../store';
import { snackActions } from '../lib/snackbar';
import {
    GET_EVENT_GROUP_INSTANCES,
    SUB_EVENT_GROUP_INSTANCES,
    SUB_EVENTSTEP_INSTANCES,
    CANCEL_EVENT_GROUP_INSTANCE,
    RETRY_EVENT_GROUP_INSTANCE,
    GET_EVENTGROUPS,
    SUB_EVENTGROUPS,
    TOGGLE_EVENTGROUP_ACTIVE,
    DELETE_EVENTGROUP,
    RESTORE_EVENTGROUP,
    CREATE_EVENTGROUP,
    APPROVE_EVENTGROUP,
    TRIGGER_MANUAL,
    TRIGGER_KEYWORD,
    EXPORT_EVENT_GROUP,
} from '../lib/api';

interface EventGroup {
    id: number;
    name: string;
    description: string;
    trigger: string;
    trigger_data: any;
    keywords: string[];
    environment: any;
    active: boolean;
    deleted: boolean;
    created_at: string;
    run_as: string;
    approved_to_run: boolean;
    next_scheduled_run: string | null;
    operator: {
        username: string;
    };
    eventgroupapprovals: Array<{
        id: number;
        operator: { id: number; username: string };
        approved: boolean;
        created_at: string;
        updated_at: string;
    }>;
    eventgroupconsumingcontainers: Array<{
        id: number;
        consuming_container_name: string;
        all_functions_available: boolean;
        function_names: string[];
        consuming_container: {
            container_running: boolean;
            subscriptions: string[];
        };
    }>;
    filemetum?: {
        agent_file_id: string;
        id: number;
        filename_text: string;
    };
}

const initialWorkflow = `name: "New Eventing Workflow"
description: "automatically do something based on a new callback"
trigger: callback_new
trigger_data:
  payload_types:
    - apollo
keywords:
  - apollo_callback
environment:
steps:
  - name: "run command 1"
    inputs:
      CALLBACK_ID: env.display_id
    action: task_create
    action_data:
      callback_display_id: CALLBACK_ID
      params: string params here
      command_name: shell
  - name: "run command 2"
    description: "do something specific for the second command"
    inputs:
      CALLBACK_ID: env.display_id
    action: task_create
    action_data:
      callback_display_id: CALLBACK_ID
      params_dictionary:
        filename: a named parameter here
        code: another named parameter 
      command_name: command_with_named_params
    depends_on:
      - run command 1
    outputs:
      SCRIPT_TASK_ID: id
`;

// Trigger type colors
const getTriggerColor = (trigger: string) => {
    switch (trigger) {
        case 'callback_new': return 'text-matrix bg-matrix/20';
        case 'task_new': return 'text-signal bg-signal/20';
        case 'scheduled': return 'text-amber-400 bg-amber-400/20';
        case 'manual': return 'text-purple-400 bg-purple-400/20';
        case 'file_new': return 'text-cyan-400 bg-cyan-400/20';
        case 'response_new': return 'text-pink-400 bg-pink-400/20';
        default: return 'text-ghost bg-ghost/20';
    }
};

// Create Workflow Modal
const CreateWorkflowModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onCreate: (yaml: string, filename: string) => void;
}> = ({ isOpen, onClose, onCreate }) => {
    const [code, setCode] = useState(initialWorkflow);
    const [filename, setFilename] = useState('workflow.yaml');

    const handleSubmit = () => {
        onCreate(code, filename);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-void border border-ghost/30 rounded-lg w-[90vw] max-w-5xl max-h-[90vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-ghost/30">
                    <h2 className="text-xl font-bold text-signal">CREATE EVENTING WORKFLOW</h2>
                    <button onClick={onClose} className="text-ghost hover:text-signal">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm text-ghost mb-2">Workflow Filename</label>
                        <input
                            type="text"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            className="w-full bg-void border border-ghost/30 rounded px-3 py-2 text-signal focus:border-signal outline-none"
                            placeholder="workflow.yaml"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-ghost mb-2">Workflow Definition (YAML)</label>
                        <div className="border border-ghost/30 rounded overflow-hidden">
                            <textarea
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                className="w-full h-[400px] bg-black/50 text-signal font-mono text-sm p-4 resize-none focus:outline-none"
                                placeholder="# Enter your workflow YAML here..."
                                spellCheck={false}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t border-ghost/30">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-ghost/30 rounded text-ghost hover:text-signal hover:border-signal transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-4 py-2 bg-signal text-void rounded hover:bg-signal/80 transition-colors flex items-center gap-2"
                    >
                        <Check size={16} />
                        Create Workflow
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// Event Group Detail Modal
const EventGroupDetailModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    eventGroup: EventGroup | null;
    onToggleActive: () => void;
    onApprove: (approved: boolean) => void;
    onDelete: () => void;
    onRestore: () => void;
    onManualTrigger: () => void;
    onExport: () => void;
    onKeywordTrigger: () => void;
}> = ({ isOpen, onClose, eventGroup, onToggleActive, onApprove, onDelete, onRestore, onManualTrigger, onExport, onKeywordTrigger }) => {
    if (!isOpen || !eventGroup) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-void border border-ghost/30 rounded-lg w-[90vw] max-w-4xl max-h-[90vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-ghost/30">
                    <div className="flex items-center gap-3">
                        <Zap className="text-signal" size={24} />
                        <h2 className="text-xl font-bold text-signal">{eventGroup.name}</h2>
                        <span className={cn("px-2 py-0.5 rounded text-xs font-mono", getTriggerColor(eventGroup.trigger))}>
                            {eventGroup.trigger}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-ghost hover:text-signal">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
                    {/* Description */}
                    <div>
                        <h3 className="text-sm text-ghost mb-1">Description</h3>
                        <p className="text-signal">{eventGroup.description || 'No description'}</p>
                    </div>

                    {/* Status Info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-black/30 p-3 rounded border border-ghost/20">
                            <h4 className="text-xs text-ghost">Status</h4>
                            <p className={cn("font-bold", eventGroup.active ? "text-matrix" : "text-alert")}>
                                {eventGroup.active ? 'Active' : 'Inactive'}
                            </p>
                        </div>
                        <div className="bg-black/30 p-3 rounded border border-ghost/20">
                            <h4 className="text-xs text-ghost">Approved</h4>
                            <p className={cn("font-bold", eventGroup.approved_to_run ? "text-matrix" : "text-alert")}>
                                {eventGroup.approved_to_run ? 'Yes' : 'No'}
                            </p>
                        </div>
                        <div className="bg-black/30 p-3 rounded border border-ghost/20">
                            <h4 className="text-xs text-ghost">Created By</h4>
                            <p className="text-signal font-mono">{eventGroup.operator?.username || 'Unknown'}</p>
                        </div>
                        <div className="bg-black/30 p-3 rounded border border-ghost/20">
                            <h4 className="text-xs text-ghost">Run As</h4>
                            <p className="text-signal font-mono">{eventGroup.run_as || 'Default'}</p>
                        </div>
                    </div>

                    {/* Keywords */}
                    {eventGroup.keywords && eventGroup.keywords.length > 0 && (
                        <div>
                            <h3 className="text-sm text-ghost mb-2">Keywords</h3>
                            <div className="flex flex-wrap gap-2">
                                {eventGroup.keywords.map((keyword, idx) => (
                                    <span key={idx} className="px-2 py-1 bg-signal/20 text-signal rounded text-xs font-mono">
                                        {keyword}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Next Scheduled Run */}
                    {eventGroup.next_scheduled_run && (
                        <div>
                            <h3 className="text-sm text-ghost mb-1">Next Scheduled Run</h3>
                            <p className="text-signal flex items-center gap-2">
                                <Clock size={16} />
                                {new Date(eventGroup.next_scheduled_run).toLocaleString()}
                            </p>
                        </div>
                    )}

                    {/* Consuming Containers */}
                    {eventGroup.eventgroupconsumingcontainers && eventGroup.eventgroupconsumingcontainers.length > 0 && (
                        <div>
                            <h3 className="text-sm text-ghost mb-2">Consuming Containers</h3>
                            <div className="space-y-2">
                                {eventGroup.eventgroupconsumingcontainers.map(container => (
                                    <div key={container.id} className="bg-black/30 p-2 rounded border border-ghost/20 flex items-center justify-between">
                                        <span className="text-signal font-mono">{container.consuming_container_name}</span>
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "w-2 h-2 rounded-full",
                                                container.consuming_container?.container_running ? "bg-matrix" : "bg-alert"
                                            )} />
                                            <span className={cn(
                                                "text-xs",
                                                container.all_functions_available ? "text-matrix" : "text-alert"
                                            )}>
                                                {container.all_functions_available ? 'All Functions Available' : 'Missing Functions'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Approvals */}
                    {eventGroup.eventgroupapprovals && eventGroup.eventgroupapprovals.length > 0 && (
                        <div>
                            <h3 className="text-sm text-ghost mb-2">Approvals</h3>
                            <div className="space-y-2">
                                {eventGroup.eventgroupapprovals.map(approval => (
                                    <div key={approval.id} className="bg-black/30 p-2 rounded border border-ghost/20 flex items-center justify-between">
                                        <span className="text-signal">{approval.operator?.username}</span>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-xs",
                                            approval.approved ? "bg-matrix/20 text-matrix" : "bg-alert/20 text-alert"
                                        )}>
                                            {approval.approved ? 'Approved' : 'Pending'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Environment */}
                    {eventGroup.environment && Object.keys(eventGroup.environment).length > 0 && (
                        <div>
                            <h3 className="text-sm text-ghost mb-2">Environment</h3>
                            <pre className="bg-black/30 p-3 rounded border border-ghost/20 text-xs font-mono text-signal overflow-x-auto">
                                {JSON.stringify(eventGroup.environment, null, 2)}
                            </pre>
                        </div>
                    )}

                    {/* Trigger Data */}
                    {eventGroup.trigger_data && (
                        <div>
                            <h3 className="text-sm text-ghost mb-2">Trigger Data</h3>
                            <pre className="bg-black/30 p-3 rounded border border-ghost/20 text-xs font-mono text-signal overflow-x-auto">
                                {JSON.stringify(eventGroup.trigger_data, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-between gap-3 p-4 border-t border-ghost/30 flex-wrap">
                    <div className="flex gap-2 flex-wrap">
                        {!eventGroup.approved_to_run && (
                            <>
                                <button
                                    onClick={() => onApprove(true)}
                                    className="px-4 py-2 bg-matrix text-void rounded hover:bg-matrix/80 transition-colors flex items-center gap-2"
                                >
                                    <Check size={16} />
                                    Approve
                                </button>
                                <button
                                    onClick={() => onApprove(false)}
                                    className="px-4 py-2 bg-alert/20 text-alert rounded hover:bg-alert/30 transition-colors flex items-center gap-2"
                                >
                                    <XCircle size={16} />
                                    Deny
                                </button>
                            </>
                        )}
                        {eventGroup.deleted ? (
                            <button
                                onClick={onRestore}
                                className="px-4 py-2 bg-matrix/20 text-matrix rounded hover:bg-matrix/30 transition-colors flex items-center gap-2"
                            >
                                <RotateCcw size={16} />
                                Restore
                            </button>
                        ) : (
                            <button
                                onClick={onDelete}
                                className="px-4 py-2 bg-alert text-void rounded hover:bg-alert/80 transition-colors flex items-center gap-2"
                            >
                                <Trash2 size={16} />
                                Delete
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {eventGroup.trigger === 'manual' && (
                            <button
                                onClick={onManualTrigger}
                                className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors flex items-center gap-2"
                            >
                                <Play size={16} />
                                Run Now
                            </button>
                        )}
                        {eventGroup.keywords && eventGroup.keywords.length > 0 && (
                            <button
                                onClick={onKeywordTrigger}
                                className="px-4 py-2 bg-signal/20 text-signal rounded hover:bg-signal/30 transition-colors flex items-center gap-2"
                            >
                                <Zap size={16} />
                                Keyword Trigger
                            </button>
                        )}
                        <button
                            onClick={onExport}
                            className="px-4 py-2 border border-ghost/30 text-ghost rounded hover:text-signal hover:border-signal transition-colors flex items-center gap-2"
                        >
                            <FileText size={16} />
                            Export
                        </button>
                        <button
                            onClick={onToggleActive}
                            className={cn(
                                "px-4 py-2 rounded transition-colors flex items-center gap-2",
                                eventGroup.active
                                    ? "bg-alert/20 text-alert hover:bg-alert/30"
                                    : "bg-matrix/20 text-matrix hover:bg-matrix/30"
                            )}
                        >
                            {eventGroup.active ? <Pause size={16} /> : <Play size={16} />}
                            {eventGroup.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-ghost/30 rounded text-ghost hover:text-signal hover:border-signal transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

// Keyword Trigger Modal
const KeywordTriggerModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    keywords: string[];
}> = ({ isOpen, onClose, keywords }) => {
    const [selectedKeyword, setSelectedKeyword] = useState(keywords[0] || '');
    const [envPairs, setEnvPairs] = useState<Array<{key: string; value: string}>>([]);

    const [triggerKeyword] = useMutation(TRIGGER_KEYWORD, {
        onCompleted: (data) => {
            if (data.eventingTriggerKeyword.status === 'success') {
                snackActions.success('Keyword trigger sent successfully');
                onClose();
            } else {
                snackActions.error(data.eventingTriggerKeyword.error);
            }
        },
        onError: (err) => snackActions.error('Trigger failed: ' + err.message),
    });

    const handleTrigger = () => {
        const envData: Record<string, string> = {};
        envPairs.forEach(p => { if (p.key.trim()) envData[p.key.trim()] = p.value; });
        triggerKeyword({ variables: { keyword: selectedKeyword, keywordEnvData: envData } });
    };

    if (!isOpen) return null;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-void border border-ghost/30 rounded-lg w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-ghost/30">
                    <h2 className="text-lg font-bold text-signal font-mono">TRIGGER BY KEYWORD</h2>
                    <button onClick={onClose} className="text-ghost hover:text-signal"><X size={20} /></button>
                </div>
                <div className="p-4 space-y-4">
                    <div>
                        <label className="text-xs text-ghost mb-1 block font-mono">Keyword</label>
                        <select value={selectedKeyword} onChange={e => setSelectedKeyword(e.target.value)}
                            className="w-full h-9 px-3 bg-black/50 border border-ghost/30 rounded text-signal font-mono text-sm focus:border-signal outline-none">
                            {keywords.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs text-ghost font-mono">Environment Data (optional)</label>
                            <button onClick={() => setEnvPairs([...envPairs, { key: '', value: '' }])}
                                className="text-xs text-signal hover:text-white font-mono">+ Add</button>
                        </div>
                        {envPairs.map((pair, i) => (
                            <div key={i} className="flex items-center gap-2 mb-1.5">
                                <input value={pair.key} onChange={e => { const n = [...envPairs]; n[i].key = e.target.value; setEnvPairs(n); }}
                                    placeholder="key" className="flex-1 h-8 px-2 bg-black/50 border border-ghost/30 rounded text-white text-xs font-mono focus:border-signal outline-none" />
                                <input value={pair.value} onChange={e => { const n = [...envPairs]; n[i].value = e.target.value; setEnvPairs(n); }}
                                    placeholder="value" className="flex-1 h-8 px-2 bg-black/50 border border-ghost/30 rounded text-white text-xs font-mono focus:border-signal outline-none" />
                                <button onClick={() => setEnvPairs(envPairs.filter((_, j) => j !== i))}
                                    className="text-ghost hover:text-alert"><X size={14} /></button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex justify-end gap-3 p-4 border-t border-ghost/30">
                    <button onClick={onClose} className="px-4 py-2 text-ghost hover:text-signal font-mono text-sm">Cancel</button>
                    <button onClick={handleTrigger}
                        className="px-4 py-2 bg-signal text-void rounded hover:bg-signal/80 transition-colors flex items-center gap-2 font-mono text-sm">
                        <Play size={14} />Trigger
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// Event Group Card
const EventGroupCard: React.FC<{
    eventGroup: EventGroup;
    onClick: () => void;
}> = ({ eventGroup, onClick }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            onClick={onClick}
            className={cn(
                "p-4 border rounded-lg cursor-pointer transition-all",
                eventGroup.deleted
                    ? "border-alert/30 bg-alert/5 opacity-60"
                    : eventGroup.active
                        ? "border-ghost/30 bg-void hover:border-signal"
                        : "border-ghost/20 bg-void/50 opacity-70 hover:border-ghost/50"
            )}
        >
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Zap className={eventGroup.active ? "text-signal" : "text-ghost"} size={18} />
                    <h3 className="font-bold text-signal">{eventGroup.name}</h3>
                </div>
                <span className={cn("px-2 py-0.5 rounded text-xs font-mono", getTriggerColor(eventGroup.trigger))}>
                    {eventGroup.trigger}
                </span>
            </div>

            <p className="text-ghost text-sm mb-3 line-clamp-2">
                {eventGroup.description || 'No description'}
            </p>

            <div className="flex items-center justify-between text-xs text-ghost">
                <div className="flex items-center gap-2">
                    <Users size={14} />
                    {eventGroup.operator?.username || 'Unknown'}
                </div>
                <div className="flex items-center gap-2">
                    {eventGroup.approved_to_run ? (
                        <span className="flex items-center gap-1 text-matrix">
                            <Check size={14} />
                            Approved
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-alert">
                            <AlertCircle size={14} />
                            Pending
                        </span>
                    )}
                </div>
            </div>

            {/* Keywords */}
            {eventGroup.keywords && eventGroup.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                    {eventGroup.keywords.slice(0, 3).map((keyword, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 bg-signal/10 text-signal/70 rounded text-xs">
                            {keyword}
                        </span>
                    ))}
                    {eventGroup.keywords.length > 3 && (
                        <span className="text-ghost text-xs">+{eventGroup.keywords.length - 3} more</span>
                    )}
                </div>
            )}
        </motion.div>
    );
};

// ── Event Step Instance Row ────────────────────────────────────────────────────

const StepRows = ({ instanceId }: { instanceId: number }) => {
    const [steps, setSteps] = useState<any[]>([]);
    useSubscription(SUB_EVENTSTEP_INSTANCES, {
        variables: { eventgroupinstance_id: instanceId },
        onData: ({ data }) => {
            const batch: any[] = data.data?.eventstepinstance_stream ?? [];
            if (!batch.length) return;
            setSteps(prev => {
                const ids = new Set(prev.map(s => s.id));
                const news = batch.filter(s => !ids.has(s.id));
                return news.length
                    ? [...prev, ...news].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                    : prev.map(s => {
                        const upd = batch.find(b => b.id === s.id);
                        return upd ? { ...s, ...upd } : s;
                    });
            });
        },
    });
    const statusColor: Record<string, string> = {
        success: 'text-green-400', error: 'text-red-400',
        processing: 'text-yellow-400', skipped: 'text-gray-600',
    };
    if (steps.length === 0) return (
        <div className="text-[10px] text-gray-600 font-mono px-6 py-2 animate-pulse">Loading steps...</div>
    );
    return (
        <div className="border-t border-white/5 bg-black/20">
            {steps.map(s => (
                <div key={s.id} className="flex items-start gap-3 px-6 py-2 border-b border-white/5 last:border-0">
                    <span className={cn('text-[10px] font-mono w-4 text-center shrink-0 mt-0.5', statusColor[s.status] ?? 'text-gray-500')}>
                        {s.order ?? '—'}
                    </span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-mono text-gray-300">{s.eventstep?.name ?? s.eventstep?.action}</span>
                            <span className={cn('text-[9px] font-mono uppercase', statusColor[s.status] ?? 'text-gray-500')}>{s.status}</span>
                        </div>
                        {s.stdout && (
                            <pre className="text-[10px] text-gray-400 mt-0.5 whitespace-pre-wrap break-all max-h-20 overflow-y-auto">{s.stdout}</pre>
                        )}
                        {s.stderr && (
                            <pre className="text-[10px] text-red-400/80 mt-0.5 whitespace-pre-wrap break-all max-h-20 overflow-y-auto">{s.stderr}</pre>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

// ── Instance Row ──────────────────────────────────────────────────────────────

const InstanceRow = ({ inst }: { inst: any }) => {
    const [expanded, setExpanded] = useState(false);
    const [cancelInstance] = useMutation(CANCEL_EVENT_GROUP_INSTANCE, {
        variables: { id: inst.id },
        onCompleted: () => snackActions.success('Instance cancelled'),
        onError: (e) => snackActions.error('Cancel failed: ' + e.message),
    });
    const [retryInstance] = useMutation(RETRY_EVENT_GROUP_INSTANCE, {
        variables: { id: inst.id },
        onCompleted: () => snackActions.success('Instance retried'),
        onError: (e) => snackActions.error('Retry failed: ' + e.message),
    });
    const statusColor: Record<string, string> = {
        success: 'text-green-400 border-green-400/30', error: 'text-red-400 border-red-400/30',
        processing: 'text-yellow-400 border-yellow-400/30', cancelled: 'text-gray-500 border-gray-500/30',
    };
    const s = (inst.status ?? '').toLowerCase();
    const colorClass = Object.entries(statusColor).find(([k]) => s.includes(k))?.[1] ?? 'text-gray-400 border-white/15';
    const isRunning = s.includes('process');
    const isError = s.includes('error') || s.includes('cancel');

    return (
        <div className="border border-white/8 hover:border-signal/20 transition-all">
            <div className="flex items-center gap-3 px-4 py-3">
                <span className="font-mono text-[11px] text-gray-600 w-10 shrink-0">#{inst.id}</span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm text-white font-bold truncate">
                            {inst.eventgroup?.name ?? `Instance ${inst.id}`}
                        </span>
                        <span className={cn('text-[9px] font-mono border px-1.5 py-0.5 rounded-sm', colorClass)}>
                            {inst.status?.toUpperCase()}
                        </span>
                        {inst.trigger && (
                            <span className="text-[9px] text-gray-500 font-mono border border-white/10 px-1.5 py-0.5 rounded-sm">{inst.trigger}</span>
                        )}
                    </div>
                    <p className="text-[10px] text-gray-600 font-mono mt-0.5">
                        {inst.operator?.username && <span className="mr-3">{inst.operator.username}</span>}
                        {inst.created_at && new Date(inst.created_at).toLocaleString()}
                        {inst.end_timestamp && <span className="ml-3 text-gray-700">→ {new Date(inst.end_timestamp).toLocaleString()}</span>}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {isRunning && (
                        <button onClick={() => cancelInstance()} title="Cancel"
                            className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
                            <StopCircle size={14} />
                        </button>
                    )}
                    {isError && (
                        <button onClick={() => retryInstance()} title="Retry"
                            className="p-1.5 text-gray-500 hover:text-signal transition-colors">
                            <RotateCcw size={14} />
                        </button>
                    )}
                    <button onClick={() => setExpanded(v => !v)} className="text-gray-500 hover:text-signal transition-colors">
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                </div>
            </div>
            {expanded && <StepRows instanceId={inst.id} />}
        </div>
    );
};

// ── Instances Section ─────────────────────────────────────────────────────────

const InstancesSection = () => {
    const [instances, setInstances] = useState<any[]>([]);
    const [filterStatus, setFilterStatus] = useState('');

    const { loading, refetch } = useQuery(GET_EVENT_GROUP_INSTANCES, {
        fetchPolicy: 'network-only',
        onCompleted: (d) => setInstances(d.eventgroupinstance ?? []),
    });

    useSubscription(SUB_EVENT_GROUP_INSTANCES, {
        onData: ({ data }) => {
            const batch: any[] = data.data?.eventgroupinstance_stream ?? [];
            if (!batch.length) return;
            setInstances(prev => {
                const ids = new Set(prev.map(i => i.id));
                const news = batch.filter(i => !ids.has(i.id));
                return news.length
                    ? [...batch, ...prev].sort((a, b) => b.id - a.id)
                    : prev.map(p => {
                        const u = batch.find(b => b.id === p.id);
                        return u ? { ...p, ...u } : p;
                    });
            });
        },
    });

    const filtered = useMemo(() =>
        filterStatus
            ? instances.filter(i => (i.status ?? '').toLowerCase().includes(filterStatus.toLowerCase()))
            : instances,
        [instances, filterStatus]
    );

    const statuses = useMemo(() => [...new Set(instances.map(i => i.status).filter(Boolean))], [instances]);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="bg-void border border-ghost/30 rounded-lg px-3 py-1.5 text-sm text-signal focus:border-signal outline-none">
                    <option value="">All Statuses</option>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => refetch()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-ghost/30 text-ghost hover:text-signal hover:border-signal transition-colors rounded-sm">
                    <RefreshCw size={11} /> REFRESH
                </button>
                <span className="text-xs text-ghost font-mono ml-auto">{filtered.length} instance{filtered.length !== 1 ? 's' : ''}</span>
            </div>
            {loading && instances.length === 0 && (
                <div className="flex items-center justify-center py-12 text-ghost animate-pulse font-mono text-sm">
                    LOADING...
                </div>
            )}
            {!loading && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-ghost">
                    <Activity size={36} className="opacity-30" />
                    <p className="font-mono text-sm">No instances found</p>
                </div>
            )}
            <div className="space-y-2">
                {filtered.map(inst => <InstanceRow key={inst.id} inst={inst} />)}
            </div>
        </div>
    );
};

// ── Main Export ───────────────────────────────────────────────────────────────

export default function Eventing() {
    const { isSidebarCollapsed } = useAppStore();
    const [mainTab, setMainTab] = useState<'workflows' | 'instances'>('workflows');

    const [eventGroups, setEventGroups] = useState<EventGroup[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterTrigger, setFilterTrigger] = useState<string>('');
    const [showDeleted, setShowDeleted] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [selectedEventGroup, setSelectedEventGroup] = useState<EventGroup | null>(null);
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [keywordModalOpen, setKeywordModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    // Load event groups
    useQuery(GET_EVENTGROUPS, {
        fetchPolicy: "no-cache",
        onCompleted: (data) => {
            const newEvents = data.eventgroup.reduce((prev: EventGroup[], cur: EventGroup) => {
                const idx = prev.findIndex(e => e.id === cur.id);
                if (idx > -1) {
                    const updated = [...prev];
                    updated[idx] = cur;
                    return updated;
                }
                return [...prev, cur];
            }, []);
            newEvents.sort((a: EventGroup, b: EventGroup) => b.id - a.id);
            setEventGroups(newEvents);
            setLoading(false);
        },
        onError: (error) => {
            console.error(error);
            snackActions.error('Failed to load event groups');
            setLoading(false);
        }
    });

    // Subscribe to updates
    useSubscription(SUB_EVENTGROUPS, {
        fetchPolicy: "no-cache",
        onData: ({ data }) => {
            if (data?.data?.eventgroup_stream) {
                setEventGroups(prev => {
                    const newEvents = data.data.eventgroup_stream.reduce((p: EventGroup[], cur: EventGroup) => {
                        const idx = p.findIndex(e => e.id === cur.id);
                        if (idx > -1) {
                            const updated = [...p];
                            updated[idx] = cur;
                            return updated;
                        }
                        return [...p, cur];
                    }, [...prev]);
                    newEvents.sort((a: EventGroup, b: EventGroup) => b.id - a.id);
                    return newEvents;
                });
            }
        }
    });

    // Mutations
    const [toggleActive] = useMutation(TOGGLE_EVENTGROUP_ACTIVE, {
        onCompleted: () => snackActions.success('Event group status updated'),
        onError: (err) => snackActions.error('Failed to update: ' + err.message)
    });

    const [deleteEventGroup] = useMutation(DELETE_EVENTGROUP, {
        onCompleted: () => {
            snackActions.success('Event group deleted');
            setDetailModalOpen(false);
        },
        onError: (err) => snackActions.error('Failed to delete: ' + err.message)
    });

    const [createEventGroup] = useMutation(CREATE_EVENTGROUP, {
        onCompleted: (data) => {
            if (data.uploadEventFile.status === 'success') {
                snackActions.success('Workflow created successfully');
            } else {
                snackActions.error('Failed to create: ' + data.uploadEventFile.error);
            }
        },
        onError: (err) => snackActions.error('Failed to create: ' + err.message)
    });

    const [approveEventGroup] = useMutation(APPROVE_EVENTGROUP, {
        onCompleted: (data) => {
            if (data.approveEventGroup.status === 'success') {
                snackActions.success('Event group approved');
            } else {
                snackActions.error('Failed to approve: ' + data.approveEventGroup.error);
            }
        },
        onError: (err) => snackActions.error('Failed to approve: ' + err.message)
    });

    const [restoreEventGroup] = useMutation(RESTORE_EVENTGROUP, {
        onCompleted: () => {
            snackActions.success('Event group restored');
            setDetailModalOpen(false);
        },
        onError: (err) => snackActions.error('Failed to restore: ' + err.message)
    });

    const [triggerManual] = useMutation(TRIGGER_MANUAL, {
        onCompleted: (data) => {
            if (data.eventingTriggerManual.status === 'success') {
                snackActions.success('Manual trigger sent');
            } else {
                snackActions.error(data.eventingTriggerManual.error);
            }
        },
        onError: (err) => snackActions.error('Trigger failed: ' + err.message)
    });

    const [exportEventGroup] = useLazyQuery(EXPORT_EVENT_GROUP, {
        fetchPolicy: 'no-cache',
        onCompleted: (data) => {
            const eg = data.eventgroup_by_pk;
            if (eg) {
                const exportData = {
                    name: eg.name, description: eg.description, trigger: eg.trigger,
                    trigger_data: eg.trigger_data, keywords: eg.keywords,
                    environment: eg.environment, run_as: eg.run_as,
                };
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `${eg.name.replace(/\s+/g, '_')}.json`; a.click();
                URL.revokeObjectURL(url);
                snackActions.success('Event group exported');
            }
        },
        onError: () => snackActions.error('Export failed'),
    });

    // Filter event groups
    const filteredEventGroups = useMemo(() => {
        return eventGroups.filter(eg => {
            if (!showDeleted && eg.deleted) return false;
            if (filterTrigger && eg.trigger !== filterTrigger) return false;
            if (searchTerm) {
                const search = searchTerm.toLowerCase();
                return (
                    eg.name.toLowerCase().includes(search) ||
                    eg.description?.toLowerCase().includes(search) ||
                    eg.trigger.toLowerCase().includes(search) ||
                    eg.keywords?.some(k => k.toLowerCase().includes(search))
                );
            }
            return true;
        });
    }, [eventGroups, searchTerm, filterTrigger, showDeleted]);

    const triggerTypes = useMemo(() => {
        return [...new Set(eventGroups.map(eg => eg.trigger))];
    }, [eventGroups]);

    const handleCreate = (yamlContent: string, filename: string) => {
        const base64Content = btoa(yamlContent);
        createEventGroup({
            variables: {
                file: base64Content,
                filename
            }
        });
    };

    const handleToggleActive = () => {
        if (selectedEventGroup) {
            toggleActive({
                variables: {
                    id: selectedEventGroup.id,
                    active: !selectedEventGroup.active
                }
            });
        }
    };

    const handleDelete = () => {
        if (selectedEventGroup) {
            deleteEventGroup({
                variables: { id: selectedEventGroup.id }
            });
        }
    };

    const handleApprove = (approved: boolean) => {
        if (selectedEventGroup) {
            approveEventGroup({
                variables: {
                    eventgroup_id: selectedEventGroup.id,
                    approved
                }
            });
        }
    };

    const handleRestore = () => {
        if (selectedEventGroup) {
            restoreEventGroup({ variables: { id: selectedEventGroup.id } });
        }
    };

    const handleManualTrigger = () => {
        if (selectedEventGroup) {
            triggerManual({ variables: { eventgroup_id: selectedEventGroup.id } });
        }
    };

    const handleExport = () => {
        if (selectedEventGroup) {
            exportEventGroup({ variables: { id: selectedEventGroup.id } });
        }
    };

    const handleKeywordTrigger = () => {
        setKeywordModalOpen(true);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target?.result as string;
                const base64Content = btoa(content);
                createEventGroup({
                    variables: {
                        file: base64Content,
                        filename: file.name
                    }
                });
            };
            reader.readAsText(file);
        }
        e.target.value = '';
    };

    // Stats
    const stats = useMemo(() => ({
        total: eventGroups.filter(e => !e.deleted).length,
        active: eventGroups.filter(e => e.active && !e.deleted).length,
        pending: eventGroups.filter(e => !e.approved_to_run && !e.deleted).length,
        deleted: eventGroups.filter(e => e.deleted).length
    }), [eventGroups]);

    return (
        <div className="min-h-screen bg-void text-signal">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className={cn("transition-all duration-300 p-6", isSidebarCollapsed ? "ml-16" : "ml-64")}
            >
                {/* Header */}
                <header className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded">
                            <Zap size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">EVENTING</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                AUTOMATED WORKFLOWS
                            </p>
                        </div>
                    </div>
                </header>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-void border border-ghost/30 rounded-lg p-4">
                        <h3 className="text-ghost text-sm">Total Workflows</h3>
                        <p className="text-2xl font-bold text-signal">{stats.total}</p>
                    </div>
                    <div className="bg-void border border-ghost/30 rounded-lg p-4">
                        <h3 className="text-ghost text-sm">Active</h3>
                        <p className="text-2xl font-bold text-matrix">{stats.active}</p>
                    </div>
                    <div className="bg-void border border-ghost/30 rounded-lg p-4">
                        <h3 className="text-ghost text-sm">Pending Approval</h3>
                        <p className="text-2xl font-bold text-amber-400">{stats.pending}</p>
                    </div>
                    <div className="bg-void border border-ghost/30 rounded-lg p-4">
                        <h3 className="text-ghost text-sm">Deleted</h3>
                        <p className="text-2xl font-bold text-alert">{stats.deleted}</p>
                    </div>
                </div>

                {/* ── Main Tabs ── */}
                <div className="flex border-b border-ghost/20 mb-6">
                    <button onClick={() => setMainTab('workflows')}
                        className={cn('flex items-center gap-2 px-5 py-2.5 text-xs font-mono uppercase tracking-widest border-b-2 -mb-px transition-colors',
                            mainTab === 'workflows' ? 'border-signal text-signal' : 'border-transparent text-ghost hover:text-signal')}>
                        <Zap size={12} />WORKFLOWS
                    </button>
                    <button onClick={() => setMainTab('instances')}
                        className={cn('flex items-center gap-2 px-5 py-2.5 text-xs font-mono uppercase tracking-widest border-b-2 -mb-px transition-colors',
                            mainTab === 'instances' ? 'border-signal text-signal' : 'border-transparent text-ghost hover:text-signal')}>
                        <List size={12} />INSTANCES
                    </button>
                </div>

                {mainTab === 'instances' && <InstancesSection />}

                {mainTab === 'workflows' && (<>
                    <div className="flex items-center gap-3 mb-6 flex-wrap">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ghost" size={18} />
                        <input
                            type="text"
                            placeholder="Search workflows..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-void border border-ghost/30 rounded-lg pl-10 pr-4 py-2 text-signal placeholder:text-ghost/50 focus:border-signal outline-none"
                        />
                    </div>

                    {/* Trigger Filter */}
                    <select
                        value={filterTrigger}
                        onChange={(e) => setFilterTrigger(e.target.value)}
                        className="bg-void border border-ghost/30 rounded-lg px-4 py-2 text-signal focus:border-signal outline-none min-w-[150px]"
                    >
                        <option value="">All Triggers</option>
                        {triggerTypes.map(trigger => (
                            <option key={trigger} value={trigger}>{trigger}</option>
                        ))}
                    </select>

                    {/* Show Deleted Toggle */}
                    <button
                        onClick={() => setShowDeleted(!showDeleted)}
                        className={cn(
                            "px-4 py-2 border rounded-lg transition-colors flex items-center gap-2",
                            showDeleted
                                ? "border-alert text-alert bg-alert/20"
                                : "border-ghost/30 text-ghost hover:text-signal hover:border-signal"
                        )}
                    >
                        {showDeleted ? <Eye size={16} /> : <EyeOff size={16} />}
                        {showDeleted ? 'Showing Deleted' : 'Hide Deleted'}
                    </button>

                    {/* Upload Button */}
                    <label className="px-4 py-2 border border-signal/50 text-signal rounded-lg hover:bg-signal/10 transition-colors flex items-center gap-2 cursor-pointer">
                        <Upload size={18} />
                        Upload
                        <input
                            type="file"
                            accept=".yaml,.yml"
                            multiple
                            className="hidden"
                            onChange={handleFileUpload}
                        />
                    </label>

                    {/* Create Button */}
                    <button
                        onClick={() => setCreateModalOpen(true)}
                        className="px-4 py-2 bg-signal text-void rounded-lg hover:bg-signal/80 transition-colors flex items-center gap-2"
                    >
                        <Plus size={18} />
                        New Workflow
                    </button>
                    </div>

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <Loader className="animate-spin text-signal" size={32} />
                        <span className="ml-3 text-ghost">Loading workflows...</span>
                    </div>
                )}

                {/* Event Groups Grid */}
                {!loading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredEventGroups.map(eg => (
                            <EventGroupCard
                                key={eg.id}
                                eventGroup={eg}
                                onClick={() => {
                                    setSelectedEventGroup(eg);
                                    setDetailModalOpen(true);
                                }}
                            />
                        ))}

                        {filteredEventGroups.length === 0 && (
                            <div className="col-span-full text-center py-20 text-ghost">
                                <Zap size={48} className="mx-auto mb-4 opacity-50" />
                                <p>No workflows found</p>
                            </div>
                        )}
                    </div>
                )}
                </>)}
            </motion.div>

            {/* Create Workflow Modal */}
            <AnimatePresence>
                {createModalOpen && (
                    <CreateWorkflowModal
                        isOpen={createModalOpen}
                        onClose={() => setCreateModalOpen(false)}
                        onCreate={handleCreate}
                    />
                )}
            </AnimatePresence>

            {/* Event Group Detail Modal */}
            <AnimatePresence>
                {detailModalOpen && (
                    <EventGroupDetailModal
                        isOpen={detailModalOpen}
                        onClose={() => setDetailModalOpen(false)}
                        eventGroup={selectedEventGroup}
                        onToggleActive={handleToggleActive}
                        onApprove={handleApprove}
                        onDelete={handleDelete}
                        onRestore={handleRestore}
                        onManualTrigger={handleManualTrigger}
                        onExport={handleExport}
                        onKeywordTrigger={handleKeywordTrigger}
                    />
                )}
            </AnimatePresence>

            {/* Keyword Trigger Modal */}
            <AnimatePresence>
                {keywordModalOpen && selectedEventGroup && (
                    <KeywordTriggerModal
                        isOpen={keywordModalOpen}
                        onClose={() => setKeywordModalOpen(false)}
                        keywords={selectedEventGroup.keywords || []}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
