import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useLazyQuery, gql } from '@apollo/client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Target, 
    Grid3X3, 
    Terminal,
    Filter,
    ChevronDown,
    X,
    Loader2,
    ExternalLink,
    Eye,
    Command,
    Activity,
    Zap,
    Shield,
    Lock,
    Search as SearchIcon,
    Database,
    Crosshair,
    Move,
    FolderOpen,
    Radio,
    LogOut,
    Bomb,
    Info,
    Download,
    Cpu,
} from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { cn } from '../lib/utils';
import { snackActions } from '../../components/utilities/Snackbar';
import { useReactiveVar } from '@apollo/client';
import { meState } from '../../cache';
import { useAppStore } from '../store';

// ============================================
// GraphQL Queries
// ============================================
const GET_MITRE_ATTACK = gql`
query GetMitreAttack {
  attack(order_by: {t_num: asc}){
    id
    name
    t_num
    os
    tactic
  }
}
`;

const GET_TASK_ATTACKS = gql`
query GetMitreTaskAttack($operation_id: Int!) {
  attacktask(where: {task: {callback: {operation_id: {_eq: $operation_id}}}}) {
    attack_id
    task {
      id
      command_name
      comment
      display_params
      callback {
        id
        display_id
        payload {
          payloadtype {
            name
          }
        }
      }
    }
  }
}
`;

const GET_COMMAND_ATTACKS = gql`
query GetMitreCommandAttack{
  attackcommand {
    attack_id
    command {
      cmd
      payloadtype {
        name
      }
    }
  }
}
`;

// #16 — MITRE "by tag" mode queries
const GET_TASK_TAGS = gql`
query GetTaskTags {
  tag(where: {task_id: {_is_null: false}}) {
    id
    tagtype { name }
    task_id
  }
}
`;
const GET_TASK_ATTACKS_BY_TAG = gql`
query GetMitreTaskAttackByTag($tasks: [Int!]!) {
  attacktask(where: {task_id: {_in: $tasks}}) {
    attack_id
    task {
      id
      command_name
      comment
      display_params
      callback {
        id
        display_id
        payload { payloadtype { name } }
      }
    }
  }
}
`;

// ============================================
// Types
// ============================================
interface Attack {
    id: number;
    name: string;
    t_num: string;
    os: string[];
    tactic: string;
}

interface TaskAttack {
    attack_id: number;
    task: {
        id: number;
        command_name: string;
        comment: string;
        display_params: string;
        callback: {
            id: number;
            display_id: number;
            payload: {
                payloadtype: {
                    name: string;
                };
            };
        };
    };
}

interface CommandAttack {
    attack_id: number;
    command: {
        cmd: string;
        payloadtype: {
            name: string;
        };
    };
}

interface TacticData {
    tactic: string;
    techniques: (Attack & { 
        hasTask: boolean; 
        hasCommand: boolean; 
        taskCount: number;
        commandCount: number;
    })[];
    taskCount: number;
    commandCount: number;
}

// ============================================
// MITRE Tactics Configuration
// ============================================
const TACTICS = [
    { id: 'Reconnaissance', label: 'Reconnaissance', icon: SearchIcon },
    { id: 'Resource Development', label: 'Resource Development', icon: Database },
    { id: 'Initial Access', label: 'Initial Access', icon: Zap },
    { id: 'Execution', label: 'Execution', icon: Terminal },
    { id: 'Persistence', label: 'Persistence', icon: Activity },
    { id: 'Privilege Escalation', label: 'Privilege Escalation', icon: Crosshair },
    { id: 'Defense Evasion', label: 'Defense Evasion', icon: Shield },
    { id: 'Credential Access', label: 'Credential Access', icon: Lock },
    { id: 'Discovery', label: 'Discovery', icon: Eye },
    { id: 'Lateral Movement', label: 'Lateral Movement', icon: Move },
    { id: 'Collection', label: 'Collection', icon: FolderOpen },
    { id: 'Command And Control', label: 'Command & Control', icon: Radio },
    { id: 'Exfiltration', label: 'Exfiltration', icon: LogOut },
    { id: 'Impact', label: 'Impact', icon: Bomb },
];

// ============================================
// Technique Cell Component
// ============================================
const TechniqueCell = ({ 
    technique, 
    viewMode,
    onClick 
}: { 
    technique: Attack & { hasTask: boolean; hasCommand: boolean; hasTag?: boolean; hasTaskByPt?: boolean; taskCount: number; commandCount: number; tagCount?: number; taskByPtCount?: number };
    viewMode: 'commands' | 'tasks' | 'tasks_by_pt' | 'tags';
    onClick: () => void;
}) => {
    const isActive = viewMode === 'tasks' ? technique.hasTask : viewMode === 'tasks_by_pt' ? (technique.hasTaskByPt || false) : viewMode === 'tags' ? (technique.hasTag || false) : technique.hasCommand;
    const count = viewMode === 'tasks' ? technique.taskCount : viewMode === 'tasks_by_pt' ? (technique.taskByPtCount || 0) : viewMode === 'tags' ? (technique.tagCount || 0) : technique.commandCount;

    return (
        <motion.div
            whileHover={{ scale: 1.02 }}
            onClick={onClick}
            className={cn(
                "p-2 rounded border cursor-pointer transition-all text-xs",
                isActive
                    ? "bg-signal/10 border-signal/30 hover:border-signal/50"
                    : "bg-ghost/5 border-ghost/20 hover:border-ghost/40 opacity-60 hover:opacity-80"
            )}
        >
            <div className="flex items-center justify-between gap-1 mb-1">
                <span className={cn(
                    "font-mono",
                    isActive ? "text-signal" : "text-gray-500"
                )}>
                    {technique.t_num}
                </span>
                {isActive && (
                    <span className="px-1.5 py-0.5 bg-signal/20 text-signal rounded text-[10px] font-bold">
                        {count}
                    </span>
                )}
            </div>
            <p className={cn(
                "line-clamp-2 leading-tight",
                isActive ? "text-white" : "text-gray-500"
            )}>
                {technique.name}
            </p>
        </motion.div>
    );
};

// ============================================
// Technique Detail Modal
// ============================================
const TechniqueDetailModal = ({
    technique,
    tasks,
    commands,
    viewMode,
    onClose
}: {
    technique: Attack | null;
    tasks: TaskAttack[];
    commands: CommandAttack[];
    viewMode: 'commands' | 'tasks' | 'tasks_by_pt' | 'tags';
    onClose: () => void;
}) => {
    if (!technique) return null;

    const relevantTasks = tasks.filter(t => t.attack_id === technique.id);
    const relevantCommands = commands.filter(c => c.attack_id === technique.id);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-void border border-ghost/30 rounded-lg w-full max-w-3xl max-h-[80vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-ghost/30">
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-signal font-mono text-lg">{technique.t_num}</span>
                                <a 
                                    href={`https://attack.mitre.org/techniques/${technique.t_num.replace('.', '/')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-500 hover:text-signal transition-colors"
                                >
                                    <ExternalLink size={16} />
                                </a>
                            </div>
                            <h2 className="text-xl font-bold text-white">{technique.name}</h2>
                            <p className="text-sm text-gray-400 mt-1">Tactic: {technique.tactic}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-ghost/20 rounded transition-colors"
                        >
                            <X size={20} className="text-gray-400" />
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-auto max-h-[60vh]">
                    {(viewMode === 'tasks' || viewMode === 'tasks_by_pt' || viewMode === 'tags') ? (
                        <div>
                            <h3 className="text-sm font-medium text-gray-400 uppercase mb-3 flex items-center gap-2">
                                <Activity size={16} />
                                Executed Tasks ({relevantTasks.length})
                            </h3>
                            {relevantTasks.length === 0 ? (
                                <p className="text-gray-500 text-sm">No tasks executed for this technique</p>
                            ) : (
                                <div className="space-y-2">
                                    {relevantTasks.map((t, idx) => (
                                        <div 
                                            key={idx}
                                            className="p-3 bg-black/30 border border-ghost/20 rounded"
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-signal font-mono">{t.task.command_name}</span>
                                                <span className="text-gray-500 text-xs">
                                                    Callback #{t.task.callback?.display_id}
                                                </span>
                                                <span className="text-gray-500 text-xs">
                                                    ({t.task.callback?.payload?.payloadtype?.name})
                                                </span>
                                            </div>
                                            {t.task.display_params && (
                                                <p className="text-gray-400 font-mono text-xs truncate">{t.task.display_params}</p>
                                            )}
                                            {t.task.comment && (
                                                <p className="text-gray-500 text-xs italic mt-1">"{t.task.comment}"</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            <h3 className="text-sm font-medium text-gray-400 uppercase mb-3 flex items-center gap-2">
                                <Command size={16} />
                                Available Commands ({relevantCommands.length})
                            </h3>
                            {relevantCommands.length === 0 ? (
                                <p className="text-gray-500 text-sm">No commands mapped to this technique</p>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    {relevantCommands.map((c, idx) => (
                                        <div 
                                            key={idx}
                                            className="p-3 bg-black/30 border border-ghost/20 rounded flex items-center justify-between"
                                        >
                                            <span className="text-signal font-mono">{c.command.cmd}</span>
                                            <span className="text-gray-500 text-xs">{c.command.payloadtype.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

// ============================================
// Main MITRE ATT&CK Page
// ============================================
const MitreAttack = () => {
    const me = useReactiveVar(meState);
    const { isSidebarCollapsed } = useAppStore();
    const [viewMode, setViewMode] = useState<'commands' | 'tasks' | 'tasks_by_pt' | 'tags'>('tasks');
    const [loading, setLoading] = useState(true);
    const [attacks, setAttacks] = useState<Attack[]>([]);
    const [taskAttacks, setTaskAttacks] = useState<TaskAttack[]>([]);
    const [commandAttacks, setCommandAttacks] = useState<CommandAttack[]>([]);
    const [selectedTechnique, setSelectedTechnique] = useState<Attack | null>(null);
    const [filterPayloadType, setFilterPayloadType] = useState('all');
    const [filterTaskPayloadType, setFilterTaskPayloadType] = useState('all');
    const [techSearch, setTechSearch] = useState('');

    // #16 — by-tag state
    const [tagTaskAttacks, setTagTaskAttacks] = useState<TaskAttack[]>([]);
    const [selectedTagType, setSelectedTagType] = useState('');
    const [tagTypes, setTagTypes] = useState<string[]>([]);
    const [allTaskTags, setAllTaskTags] = useState<{task_id: number; tagtype: {name: string}}[]>([]);
    const [fetchTaskTags] = useLazyQuery(GET_TASK_TAGS, {
        fetchPolicy: 'network-only',
        onCompleted: (data) => {
            const tags = data?.tag || [];
            setAllTaskTags(tags);
            const unique = [...new Set(tags.map((t: any) => t.tagtype?.name).filter(Boolean))] as string[];
            setTagTypes(unique.sort());
            if (unique.length > 0 && !selectedTagType) setSelectedTagType(unique[0]);
        }
    });
    const [fetchTaskAttacksByTag] = useLazyQuery(GET_TASK_ATTACKS_BY_TAG, {
        fetchPolicy: 'network-only',
        onCompleted: (data) => {
            setTagTaskAttacks(data?.attacktask || []);
        }
    });
    // When tag type changes, filter and refetch
    useEffect(() => {
        if (viewMode === 'tags' && selectedTagType && allTaskTags.length > 0) {
            const taskIds = allTaskTags
                .filter(t => t.tagtype?.name === selectedTagType)
                .map(t => t.task_id);
            if (taskIds.length > 0) {
                fetchTaskAttacksByTag({ variables: { tasks: taskIds } });
            } else {
                setTagTaskAttacks([]);
            }
        }
    }, [viewMode, selectedTagType, allTaskTags, fetchTaskAttacksByTag]);
    // Fetch tags when switching to tag mode
    useEffect(() => {
        if (viewMode === 'tags') fetchTaskTags();
    }, [viewMode, fetchTaskTags]);

    // Fetch all MITRE techniques
    useQuery(GET_MITRE_ATTACK, {
        onCompleted: (data) => {
            setAttacks(data.attack);
        },
        onError: () => {
            snackActions.error('Failed to load MITRE ATT&CK data');
        }
    });

    // Fetch task attacks
    const [fetchTaskAttacks] = useLazyQuery(GET_TASK_ATTACKS, {
        fetchPolicy: "network-only",
        onCompleted: (data) => {
            setTaskAttacks(data.attacktask);
            setLoading(false);
        },
        onError: () => {
            snackActions.error('Failed to load task attack mappings');
            setLoading(false);
        }
    });

    // Fetch command attacks
    useQuery(GET_COMMAND_ATTACKS, {
        onCompleted: (data) => {
            setCommandAttacks(data.attackcommand);
        }
    });

    useEffect(() => {
        // @ts-ignore
        if (me?.user?.current_operation_id) {
            // @ts-ignore
            fetchTaskAttacks({ variables: { operation_id: me.user.current_operation_id } });
        }
    }, [me, fetchTaskAttacks]);

    // Process data into tactics
    const tacticsData = useMemo(() => {
        const taskAttackIds = new Set(taskAttacks.map(t => t.attack_id));
        const commandAttackIds = new Set(commandAttacks.map(c => c.attack_id));
        // #16 — tag mode attack ids
        const tagAttackIds = new Set(tagTaskAttacks.map(t => t.attack_id));

        // Count tasks and commands per technique
        const taskCounts: Record<number, number> = {};
        const commandCounts: Record<number, number> = {};
        const tagCounts: Record<number, number> = {};
        // #3 — tasks filtered by payload type
        const taskByPtCounts: Record<number, number> = {};
        const taskByPtIds = new Set<number>();

        taskAttacks.forEach(t => {
            taskCounts[t.attack_id] = (taskCounts[t.attack_id] || 0) + 1;
            // #3 — count per payload-type filter
            if (filterTaskPayloadType === 'all' || t.task?.callback?.payload?.payloadtype?.name === filterTaskPayloadType) {
                taskByPtCounts[t.attack_id] = (taskByPtCounts[t.attack_id] || 0) + 1;
                taskByPtIds.add(t.attack_id);
            }
        });

        commandAttacks.forEach(c => {
            if (filterPayloadType === 'all' || c.command.payloadtype.name === filterPayloadType) {
                commandCounts[c.attack_id] = (commandCounts[c.attack_id] || 0) + 1;
            }
        });

        tagTaskAttacks.forEach(t => {
            tagCounts[t.attack_id] = (tagCounts[t.attack_id] || 0) + 1;
        });

        const lowerSearch = techSearch.toLowerCase();

        return TACTICS.map(tactic => {
            const techniques = attacks
                .filter(a => a.tactic === tactic.id)
                .filter(a => !techSearch || a.name.toLowerCase().includes(lowerSearch) || a.t_num.toLowerCase().includes(lowerSearch))
                .map(a => ({
                    ...a,
                    hasTask: taskAttackIds.has(a.id),
                    hasCommand: commandAttackIds.has(a.id),
                    hasTag: tagAttackIds.has(a.id),
                    hasTaskByPt: taskByPtIds.has(a.id),
                    taskCount: taskCounts[a.id] || 0,
                    commandCount: commandCounts[a.id] || 0,
                    tagCount: tagCounts[a.id] || 0,
                    taskByPtCount: taskByPtCounts[a.id] || 0,
                }));

            return {
                tactic: tactic.id,
                techniques,
                taskCount: techniques.filter(t => t.hasTask).length,
                commandCount: techniques.filter(t => t.hasCommand).length,
                tagCount: techniques.filter(t => t.hasTag).length,
                taskByPtCount: techniques.filter(t => t.hasTaskByPt).length,
            };
        });
    }, [attacks, taskAttacks, commandAttacks, tagTaskAttacks, filterPayloadType, filterTaskPayloadType, techSearch]);

    // Get unique payload types (commands)
    const payloadTypes = useMemo(() => {
        const types = new Set<string>();
        commandAttacks.forEach(c => types.add(c.command.payloadtype.name));
        return Array.from(types).sort();
    }, [commandAttacks]);

    // #3 — Get unique payload types from tasks
    const taskPayloadTypes = useMemo(() => {
        const types = new Set<string>();
        taskAttacks.forEach(t => { const n = t.task?.callback?.payload?.payloadtype?.name; if (n) types.add(n); });
        return Array.from(types).sort();
    }, [taskAttacks]);

    // Calculate totals
    const totals = useMemo(() => {
        const uniqueTaskTechniques = new Set(taskAttacks.map(t => t.attack_id)).size;
        const uniqueCommandTechniques = new Set(commandAttacks.map(c => c.attack_id)).size;
        return {
            tasks: uniqueTaskTechniques,
            commands: uniqueCommandTechniques,
            totalTechniques: attacks.length
        };
    }, [attacks, taskAttacks, commandAttacks]);

    // #1 — Export highlighted techniques to ATT&CK Navigator JSON layer
    const exportToNavigator = () => {
        const highlightedTechniques: { t_num: string; score: number }[] = [];
        tacticsData.forEach(td => {
            td.techniques.forEach(tech => {
                let active = false;
                let score = 0;
                if (viewMode === 'tasks') { active = tech.hasTask; score = tech.taskCount; }
                else if (viewMode === 'tasks_by_pt') { active = tech.hasTaskByPt; score = tech.taskByPtCount; }
                else if (viewMode === 'commands') { active = tech.hasCommand; score = tech.commandCount; }
                else if (viewMode === 'tags') { active = tech.hasTag || false; score = tech.tagCount || 0; }
                if (active) highlightedTechniques.push({ t_num: tech.t_num, score });
            });
        });
        const layer = {
            name: `Mythic Coverage — ${viewMode}`,
            versions: { attack: "14", navigator: "4.9.1", layer: "4.5" },
            domain: "enterprise-attack",
            description: `Exported from Mythic Minerva UI (${viewMode} mode)`,
            filters: { platforms: ["Windows", "Linux", "macOS", "Network", "PRE", "Containers", "Office 365", "SaaS", "IaaS", "Google Workspace", "Azure AD"] },
            sorting: 0,
            layout: { layout: "side", aggregateFunction: "average", showID: true, showName: true, showAggregateScores: false, countUnscored: false },
            hideDisabled: false,
            techniques: highlightedTechniques.map(t => ({
                techniqueID: t.t_num.includes('.') ? t.t_num.split('.')[0] : t.t_num,
                ...(t.t_num.includes('.') ? { tactic: '', comment: '', enabled: true, metadata: [], links: [], showSubtechniques: true } : {}),
                tactic: "",
                color: "#bc3b24",
                comment: `Score: ${t.score}`,
                score: t.score,
                enabled: true,
                metadata: [],
                links: [],
                showSubtechniques: false,
            })),
            gradient: { colors: ["#ffffff", "#bc3b24"], minValue: 0, maxValue: Math.max(1, ...highlightedTechniques.map(t => t.score)) },
            legendItems: [],
            metadata: [],
            links: [],
            showTacticRowBackground: false,
            tacticRowBackground: "#dddddd",
            selectTechniquesAcrossTactics: true,
            selectSubtechniquesWithParent: false,
            selectVisibleTechniques: false,
        };
        const blob = new Blob([JSON.stringify(layer, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mythic_attack_navigator_${viewMode}.json`;
        a.click();
        URL.revokeObjectURL(url);
        snackActions.success(`Exported ${highlightedTechniques.length} techniques to ATT&CK Navigator`);
    };

    return (
        <div className="flex h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <Sidebar />
            
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={cn("flex-1 flex flex-col min-w-0 transition-all duration-300", isSidebarCollapsed ? "ml-16" : "ml-64")}
            >
                {/* Header */}
                <div className="h-16 border-b border-ghost/30 flex items-center justify-between px-6 bg-void/90 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                            <Target size={20} className="text-red-400" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-wide">MITRE ATT&CK</h1>
                            <p className="text-xs text-gray-500 font-mono">
                                {totals.totalTechniques} techniques • {totals.tasks} executed • {totals.commands} available
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Technique Search */}
                        <div className="relative">
                            <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
                            <input type="text" value={techSearch} onChange={e => setTechSearch(e.target.value)} placeholder="Filter techniques..."
                                className="h-9 pl-8 pr-8 bg-black/50 border border-ghost/30 rounded text-white text-sm focus:border-signal/50 focus:outline-none font-mono w-48" />
                            {techSearch && <button onClick={() => setTechSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"><X size={12} /></button>}
                        </div>
                        {/* Payload Type Filter (commands mode) */}
                        {viewMode === 'commands' && (
                            <select
                                value={filterPayloadType}
                                onChange={(e) => setFilterPayloadType(e.target.value)}
                                className="h-9 px-3 bg-black/50 border border-ghost/30 rounded text-white text-sm focus:border-signal/50 focus:outline-none"
                            >
                                <option value="all">All Payload Types</option>
                                {payloadTypes.map(pt => (
                                    <option key={pt} value={pt}>{pt}</option>
                                ))}
                            </select>
                        )}
                        {/* #3 — Payload Type Filter (tasks_by_pt mode) */}
                        {viewMode === 'tasks_by_pt' && (
                            <select
                                value={filterTaskPayloadType}
                                onChange={(e) => setFilterTaskPayloadType(e.target.value)}
                                className="h-9 px-3 bg-black/50 border border-ghost/30 rounded text-white text-sm focus:border-signal/50 focus:outline-none"
                            >
                                <option value="all">All Payload Types</option>
                                {taskPayloadTypes.map(pt => (
                                    <option key={pt} value={pt}>{pt}</option>
                                ))}
                            </select>
                        )}
                        {/* #16 — Tag Type Filter */}
                        {viewMode === 'tags' && tagTypes.length > 0 && (
                            <select
                                value={selectedTagType}
                                onChange={(e) => setSelectedTagType(e.target.value)}
                                className="h-9 px-3 bg-black/50 border border-ghost/30 rounded text-white text-sm focus:border-signal/50 focus:outline-none"
                            >
                                {tagTypes.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        )}

                        {/* #1 — Export to ATT&CK Navigator */}
                        <button
                            onClick={exportToNavigator}
                            className="h-9 px-3 bg-black/50 border border-ghost/30 rounded text-gray-400 text-sm hover:text-signal hover:border-signal/50 transition-colors flex items-center gap-2"
                            title="Export highlighted techniques to ATT&CK Navigator layer JSON"
                        >
                            <Download size={14} />
                            <span className="font-mono text-xs">Navigator</span>
                        </button>

                        {/* View Mode Toggle */}
                        <div className="flex items-center bg-black/50 border border-ghost/30 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('tasks')}
                                className={cn(
                                    "px-3 py-1.5 rounded text-sm font-medium transition-colors",
                                    viewMode === 'tasks'
                                        ? "bg-signal/20 text-signal"
                                        : "text-gray-400 hover:text-white"
                                )}
                            >
                                <Activity size={14} className="inline-block mr-1.5" />
                                Tasks
                            </button>
                            <button
                                onClick={() => setViewMode('tasks_by_pt')}
                                className={cn(
                                    "px-3 py-1.5 rounded text-sm font-medium transition-colors",
                                    viewMode === 'tasks_by_pt'
                                        ? "bg-signal/20 text-signal"
                                        : "text-gray-400 hover:text-white"
                                )}
                                title="Tasks filtered by Payload Type"
                            >
                                <Cpu size={14} className="inline-block mr-1.5" />
                                Tasks/PT
                            </button>
                            <button
                                onClick={() => setViewMode('commands')}
                                className={cn(
                                    "px-3 py-1.5 rounded text-sm font-medium transition-colors",
                                    viewMode === 'commands'
                                        ? "bg-signal/20 text-signal"
                                        : "text-gray-400 hover:text-white"
                                )}
                            >
                                <Command size={14} className="inline-block mr-1.5" />
                                Commands
                            </button>
                            <button
                                onClick={() => setViewMode('tags')}
                                className={cn(
                                    "px-3 py-1.5 rounded text-sm font-medium transition-colors",
                                    viewMode === 'tags'
                                        ? "bg-signal/20 text-signal"
                                        : "text-gray-400 hover:text-white"
                                )}
                            >
                                <Database size={14} className="inline-block mr-1.5" />
                                By Tag
                            </button>
                        </div>
                    </div>
                </div>

                {/* Matrix Grid */}
                <div className="flex-1 overflow-auto p-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 size={32} className="text-signal animate-spin" />
                        </div>
                    ) : (
                        <div className="flex gap-2 min-w-max">
                            {tacticsData.map((tacticData) => {
                                const tacticConfig = TACTICS.find(t => t.id === tacticData.tactic);
                                const TacticIcon = tacticConfig?.icon || Target;
                                const count = viewMode === 'tasks' ? tacticData.taskCount : viewMode === 'tasks_by_pt' ? tacticData.taskByPtCount : viewMode === 'tags' ? tacticData.tagCount : tacticData.commandCount;

                                return (
                                    <div 
                                        key={tacticData.tactic}
                                        className="w-48 flex-shrink-0"
                                    >
                                        {/* Tactic Header */}
                                        <div className="p-3 bg-black/40 border border-ghost/30 rounded-t-lg">
                                            <div className="flex items-center gap-2 mb-1">
                                                <TacticIcon size={14} className="text-signal" />
                                                <span className={cn(
                                                    "px-1.5 py-0.5 rounded text-xs font-bold",
                                                    count > 0 ? "bg-signal/20 text-signal" : "bg-ghost/20 text-gray-500"
                                                )}>
                                                    {count}/{tacticData.techniques.length}
                                                </span>
                                            </div>
                                            <h3 className="text-xs font-medium text-white leading-tight">
                                                {tacticConfig?.label || tacticData.tactic}
                                            </h3>
                                        </div>

                                        {/* Techniques */}
                                        <div className="border-x border-b border-ghost/30 rounded-b-lg bg-black/20 p-2 space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto cyber-scrollbar">
                                            {tacticData.techniques.map((technique) => (
                                                <TechniqueCell
                                                    key={technique.id}
                                                    technique={technique}
                                                    viewMode={viewMode}
                                                    onClick={() => setSelectedTechnique(technique)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Legend */}
                <div className="border-t border-ghost/30 p-4 flex items-center justify-center gap-8 text-xs text-gray-400">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-signal/10 border border-signal/30 rounded" />
                        <span>{viewMode === 'tasks' ? 'Executed' : 'Available'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-ghost/5 border border-ghost/20 rounded opacity-60" />
                        <span>Not {viewMode === 'tasks' ? 'Executed' : 'Available'}</span>
                    </div>
                    <a 
                        href="https://attack.mitre.org/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-signal hover:underline"
                    >
                        <Info size={14} />
                        MITRE ATT&CK Framework
                    </a>
                </div>
            </motion.div>

            {/* Technique Detail Modal */}
            <AnimatePresence>
                {selectedTechnique && (
                    <TechniqueDetailModal
                        technique={selectedTechnique}
                        tasks={taskAttacks}
                        commands={commandAttacks}
                        viewMode={viewMode}
                        onClose={() => setSelectedTechnique(null)}
                    />
                )}
            </AnimatePresence>
    </div>
    );
};

export default MitreAttack;
