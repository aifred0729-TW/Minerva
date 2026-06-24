import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQueryCompat as useQuery, useLazyQueryCompat as useLazyQuery} from "../lib/useQueryCompat";
import { motion, AnimatePresence } from 'framer-motion';
import {
    Target,
    Terminal,
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
    Tag,
} from 'lucide-react';
import { cn, downloadBlob } from '../lib/utils';
import { snackActions } from '../lib/snackbar';
import { useReactiveVar } from "@apollo/client/react";
import { meState } from '../lib/state';
import { useAppStore } from '../store';
import {
    GET_MITRE_ATTACK,
    GET_TASK_ATTACKS,
    GET_TASK_ATTACKS_FILTERED,
    GET_COMMAND_ATTACKS,
    GET_COMMAND_ATTACKS_FILTERED,
    GET_TASK_TAGS,
    GET_TASK_ATTACKS_BY_TAG,
} from '../lib/api/mitre';

// ============================================
// Types
// ============================================
interface Attack {
    id: number;
    name: string;
    t_num: string;
    os: string[] | string;
    tactic: string[] | string;
}

interface ParsedAttack {
    id: number;
    name: string;
    t_num: string;
    os: string[];
    tactic: string[];
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

interface TechniqueInTactic extends ParsedAttack {
    hasTask: boolean;
    hasCommand: boolean;
    hasTag: boolean;
    hasTaskByPt: boolean;
    taskCount: number;
    commandCount: number;
    tagCount: number;
    taskByPtCount: number;
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
// Helper: parse JSON fields from DB
// ============================================
function parseAttack(raw: Attack): ParsedAttack {
    let os: string[] = [];
    let tactic: string[] = [];
    try {
        os = typeof raw.os === 'string' ? JSON.parse(raw.os) : (Array.isArray(raw.os) ? raw.os : []);
    } catch { os = []; }
    try {
        tactic = typeof raw.tactic === 'string' ? JSON.parse(raw.tactic) : (Array.isArray(raw.tactic) ? raw.tactic : []);
    } catch { tactic = []; }
    return { ...raw, os, tactic };
}

// ============================================
// Technique Cell Component
// ============================================
const TechniqueCell = ({
    technique,
    viewMode,
    onClick
}: {
    technique: TechniqueInTactic;
    viewMode: 'commands' | 'tasks' | 'tasks_by_pt' | 'tags';
    onClick: () => void;
}) => {
    const isActive = viewMode === 'tasks' ? technique.hasTask
        : viewMode === 'tasks_by_pt' ? technique.hasTaskByPt
        : viewMode === 'tags' ? technique.hasTag
        : technique.hasCommand;
    const count = viewMode === 'tasks' ? technique.taskCount
        : viewMode === 'tasks_by_pt' ? technique.taskByPtCount
        : viewMode === 'tags' ? technique.tagCount
        : technique.commandCount;

    return (
        <motion.div
            whileHover={{ scale: 1.02 }}
            onClick={onClick}
            className={cn(
                "p-2 rounded border cursor-pointer transition-all text-xs",
                technique.t_num.includes('.') && "ml-4 border-l-2",
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
    technique: ParsedAttack | null;
    tasks: TaskAttack[];
    commands: CommandAttack[];
    viewMode: 'commands' | 'tasks' | 'tasks_by_pt' | 'tags';
    onClose: () => void;
}) => {
    const relevantTasks = tasks.filter(t => technique && t.attack_id === technique.id);
    const relevantCommands = commands.filter(c => technique && c.attack_id === technique.id);

    // Group tasks by payload type (like MythicReactUI reference)
    const groupedTasks = useMemo(() => {
        const groups: Record<string, { id: number; command: string; comment: string; callback_id: number; display_id: number }[]> = {};
        relevantTasks.forEach(t => {
            const ptName = t.task.callback?.payload?.payloadtype?.name || 'Unknown';
            if (!groups[ptName]) groups[ptName] = [];
            groups[ptName].push({
                id: t.task.id,
                command: t.task.command_name + (t.task.display_params ? ' ' + t.task.display_params : ''),
                comment: t.task.comment || '',
                callback_id: t.task.callback?.id || 0,
                display_id: t.task.callback?.display_id || 0,
            });
        });
        return Object.entries(groups);
    }, [relevantTasks]);

    // Group commands by payload type
    const groupedCommands = useMemo(() => {
        const groups: Record<string, string[]> = {};
        relevantCommands.forEach(c => {
            const ptName = c.command.payloadtype.name;
            if (!groups[ptName]) groups[ptName] = [];
            if (!groups[ptName].includes(c.command.cmd)) {
                groups[ptName].push(c.command.cmd);
            }
        });
        return Object.entries(groups);
    }, [relevantCommands]);

    if (!technique) return null;

    const showTasks = viewMode === 'tasks' || viewMode === 'tasks_by_pt' || viewMode === 'tags';

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
                            <p className="text-sm text-gray-400 mt-1">
                                Tactics: {technique.tactic.join(', ')}
                            </p>
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
                    {showTasks ? (
                        <div>
                            <h3 className="text-sm font-medium text-gray-400 uppercase mb-3 flex items-center gap-2">
                                <Activity size={16} />
                                Executed Tasks ({relevantTasks.length})
                            </h3>
                            {groupedTasks.length === 0 ? (
                                <p className="text-gray-500 text-sm">No tasks executed for this technique</p>
                            ) : (
                                <div className="space-y-4">
                                    {groupedTasks.map(([ptName, tasks]) => (
                                        <div key={ptName}>
                                            <div className="px-3 py-2 bg-signal/5 border border-signal/20 rounded-t font-medium text-signal text-sm">
                                                {ptName}
                                            </div>
                                            <div className="border border-t-0 border-ghost/20 rounded-b overflow-hidden">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="border-b border-ghost/20 text-gray-400 text-xs">
                                                            <th className="px-3 py-2 text-left w-20">Callback</th>
                                                            <th className="px-3 py-2 text-left w-16">Task</th>
                                                            <th className="px-3 py-2 text-left">Command</th>
                                                            <th className="px-3 py-2 text-left">Comment</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {tasks.map((task, idx) => (
                                                            <tr key={idx} className="border-b border-ghost/10 hover:bg-ghost/5">
                                                                <td className="px-3 py-2">
                                                                    <a
                                                                        href={`/callbacks/${task.callback_id}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-signal hover:underline font-mono"
                                                                    >
                                                                        #{task.display_id}
                                                                    </a>
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    <a
                                                                        href={`/tasks/${task.id}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-signal hover:underline font-mono"
                                                                    >
                                                                        {task.id}
                                                                    </a>
                                                                </td>
                                                                <td className="px-3 py-2 font-mono text-gray-300 truncate max-w-[300px]">
                                                                    {task.command}
                                                                </td>
                                                                <td className="px-3 py-2 text-gray-500 italic truncate max-w-[200px]">
                                                                    {task.comment}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
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
                            {groupedCommands.length === 0 ? (
                                <p className="text-gray-500 text-sm">No commands mapped to this technique</p>
                            ) : (
                                <div className="space-y-4">
                                    {groupedCommands.map(([ptName, cmds]) => (
                                        <div key={ptName}>
                                            <div className="px-3 py-2 bg-signal/5 border border-signal/20 rounded-t font-medium text-signal text-sm">
                                                {ptName}
                                            </div>
                                            <div className="border border-t-0 border-ghost/20 rounded-b overflow-hidden">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="border-b border-ghost/20 text-gray-400 text-xs">
                                                            <th className="px-3 py-2 text-left">Command</th>
                                                            <th className="px-3 py-2 text-left w-24">Docs</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {cmds.map((cmd, idx) => (
                                                            <tr key={idx} className="border-b border-ghost/10 hover:bg-ghost/5">
                                                                <td className="px-3 py-2 font-mono text-signal">{cmd}</td>
                                                                <td className="px-3 py-2">
                                                                    <a
                                                                        href={`/docs/agents/${ptName}/commands/${cmd}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="px-2 py-1 bg-signal/10 border border-signal/30 rounded text-signal text-xs hover:bg-signal/20 transition-colors"
                                                                    >
                                                                        Docs
                                                                    </a>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
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
    const isSidebarCollapsed = useAppStore(s => s.isSidebarCollapsed);
    const [viewMode, setViewMode] = useState<'commands' | 'tasks' | 'tasks_by_pt' | 'tags'>('tasks');
    const [attacksLoaded, setAttacksLoaded] = useState(false);
    const [attacks, setAttacks] = useState<ParsedAttack[]>([]);
    const [taskAttacks, setTaskAttacks] = useState<TaskAttack[]>([]);
    const [commandAttacks, setCommandAttacks] = useState<CommandAttack[]>([]);
    const [filteredTaskAttacks, setFilteredTaskAttacks] = useState<TaskAttack[]>([]);
    const [filteredCommandAttacks, setFilteredCommandAttacks] = useState<CommandAttack[]>([]);
    const [selectedTechnique, setSelectedTechnique] = useState<ParsedAttack | null>(null);
    const [filterPayloadType, setFilterPayloadType] = useState('all');
    const [filterTaskPayloadType, setFilterTaskPayloadType] = useState('all');
    const [techSearch, setTechSearch] = useState('');

    // #16 — by-tag state
    const [tagTaskAttacks, setTagTaskAttacks] = useState<TaskAttack[]>([]);
    const [selectedTagType, setSelectedTagType] = useState('');
    const [tagTypes, setTagTypes] = useState<string[]>([]);
    const [allTaskTags, setAllTaskTags] = useState<{task_id: number; tagtype: {name: string}}[]>([]);
    const [fetchTaskTags] = useLazyQuery<any>(GET_TASK_TAGS, {
        fetchPolicy: 'network-only',
        onCompleted: (data: any) => {
            const tags = data?.tag || [];
            setAllTaskTags(tags);
            const unique = [...new Set(tags.map((t: any) => t.tagtype?.name).filter(Boolean))] as string[];
            setTagTypes(unique.sort());
            if (unique.length > 0 && !selectedTagType) setSelectedTagType(unique[0]);
        }
    });
    const [fetchTaskAttacksByTag] = useLazyQuery<any>(GET_TASK_ATTACKS_BY_TAG, {
        fetchPolicy: 'network-only',
        onCompleted: (data: any) => {
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
    useQuery<any>(GET_MITRE_ATTACK, {
        fetchPolicy: "no-cache",
        onCompleted: (data: any) => {
            const parsed = (data.attack || []).map((a: Attack) => parseAttack(a));
            setAttacks(parsed);
            setAttacksLoaded(true);
        },
        onError: () => {
            snackActions.error('Failed to load MITRE ATT&CK data');
            setAttacksLoaded(true);
        }
    });

    // Fetch all task attacks (unfiltered)
    const [fetchTaskAttacks] = useLazyQuery<any>(GET_TASK_ATTACKS, {
        fetchPolicy: "network-only",
        onCompleted: (data: any) => {
            setTaskAttacks(data.attacktask || []);
        },
        onError: () => {
            snackActions.error('Failed to load task attack mappings');
        }
    });

    // Fetch filtered task attacks by payload type
    const [fetchTaskAttacksFiltered] = useLazyQuery<any>(GET_TASK_ATTACKS_FILTERED, {
        fetchPolicy: "network-only",
        onCompleted: (data: any) => {
            setFilteredTaskAttacks(data.attacktask || []);
        },
        onError: () => {
            snackActions.error('Failed to load filtered task attack mappings');
        }
    });

    // Fetch all command attacks (unfiltered)
    useQuery<any>(GET_COMMAND_ATTACKS, {
        onCompleted: (data: any) => {
            setCommandAttacks(data.attackcommand || []);
        }
    });

    // Fetch filtered command attacks by payload type
    const [fetchCommandAttacksFiltered] = useLazyQuery<any>(GET_COMMAND_ATTACKS_FILTERED, {
        fetchPolicy: "network-only",
        onCompleted: (data: any) => {
            setFilteredCommandAttacks(data.attackcommand || []);
        },
        onError: () => {
            snackActions.error('Failed to load filtered command attack mappings');
        }
    });

    // Initial fetch for tasks
    useEffect(() => {
        if (me?.user?.current_operation_id) {
            fetchTaskAttacks({ variables: { operation_id: me.user.current_operation_id } });
        }
    }, [me, fetchTaskAttacks]);

    // When command payload type filter changes
    useEffect(() => {
        if (viewMode === 'commands' && filterPayloadType !== 'all') {
            fetchCommandAttacksFiltered({ variables: { payload_type: filterPayloadType } });
        }
    }, [viewMode, filterPayloadType, fetchCommandAttacksFiltered]);

    // When task payload type filter changes
    useEffect(() => {
        if (viewMode === 'tasks_by_pt' && filterTaskPayloadType !== 'all' && me?.user?.current_operation_id) {
            fetchTaskAttacksFiltered({
                variables: {
                    operation_id: me.user.current_operation_id,
                    payload_type: filterTaskPayloadType
                }
            });
        }
    }, [viewMode, filterTaskPayloadType, me, fetchTaskAttacksFiltered]);

    // Determine which data sets to use based on view mode
    const activeTaskAttacks = useMemo(() => {
        if (viewMode === 'tags') return tagTaskAttacks;
        if (viewMode === 'tasks_by_pt' && filterTaskPayloadType !== 'all') return filteredTaskAttacks;
        return taskAttacks;
    }, [viewMode, taskAttacks, filteredTaskAttacks, tagTaskAttacks, filterTaskPayloadType]);

    const activeCommandAttacks = useMemo(() => {
        if (viewMode === 'commands' && filterPayloadType !== 'all') return filteredCommandAttacks;
        return commandAttacks;
    }, [viewMode, commandAttacks, filteredCommandAttacks, filterPayloadType]);

    // Process data into tactics — techniques can appear in MULTIPLE tactics
    const tacticsData = useMemo(() => {
        const taskAttackIds = new Set(activeTaskAttacks.map(t => t.attack_id));
        const commandAttackIds = new Set(activeCommandAttacks.map(c => c.attack_id));

        // Count per technique
        const taskCounts: Record<number, number> = {};
        const commandCounts: Record<number, number> = {};

        activeTaskAttacks.forEach(t => {
            taskCounts[t.attack_id] = (taskCounts[t.attack_id] || 0) + 1;
        });
        activeCommandAttacks.forEach(c => {
            commandCounts[c.attack_id] = (commandCounts[c.attack_id] || 0) + 1;
        });

        const lowerSearch = techSearch.toLowerCase();

        return TACTICS.map(tactic => {
            // Filter attacks that belong to THIS tactic (tactic is an array — a technique can be in multiple)
            const techniques: TechniqueInTactic[] = attacks
                .filter(a => a.tactic.includes(tactic.id))
                .filter(a => !techSearch || a.name.toLowerCase().includes(lowerSearch) || a.t_num.toLowerCase().includes(lowerSearch))
                .map(a => ({
                    ...a,
                    hasTask: taskAttackIds.has(a.id),
                    hasCommand: commandAttackIds.has(a.id),
                    hasTag: taskAttackIds.has(a.id),
                    hasTaskByPt: taskAttackIds.has(a.id),
                    taskCount: taskCounts[a.id] || 0,
                    commandCount: commandCounts[a.id] || 0,
                    tagCount: taskCounts[a.id] || 0,
                    taskByPtCount: taskCounts[a.id] || 0,
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
    }, [attacks, activeTaskAttacks, activeCommandAttacks, techSearch]);

    // Get unique payload types (from all commands)
    const payloadTypes = useMemo(() => {
        const types = new Set<string>();
        commandAttacks.forEach(c => types.add(c.command.payloadtype.name));
        return Array.from(types).sort();
    }, [commandAttacks]);

    // Get unique payload types from tasks
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

    // Export highlighted techniques to ATT&CK Navigator JSON layer
    const exportToNavigator = useCallback(() => {
        const highlightedTechniques: { t_num: string; tactic: string; score: number }[] = [];
        tacticsData.forEach(td => {
            td.techniques.forEach(tech => {
                let active = false;
                let score = 0;
                if (viewMode === 'tasks') { active = tech.hasTask; score = tech.taskCount; }
                else if (viewMode === 'tasks_by_pt') { active = tech.hasTaskByPt; score = tech.taskByPtCount; }
                else if (viewMode === 'commands') { active = tech.hasCommand; score = tech.commandCount; }
                else if (viewMode === 'tags') { active = tech.hasTag; score = tech.tagCount; }
                if (active) {
                    highlightedTechniques.push({
                        t_num: tech.t_num,
                        tactic: td.tactic.replaceAll(' ', '-').toLowerCase(),
                        score
                    });
                }
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
                techniqueID: t.t_num,
                tactic: t.tactic,
                color: "#bc3b24",
                comment: `Score: ${t.score}`,
                score: t.score,
                enabled: true,
                metadata: [],
                links: [],
                showSubtechniques: true,
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
        downloadBlob(blob, `mythic_attack_navigator_${viewMode}.json`);
        snackActions.success(`Exported ${highlightedTechniques.length} techniques to ATT&CK Navigator`);
    }, [tacticsData, viewMode]);

    const loading = !attacksLoaded;

    return (
        <div className="flex h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">

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
                        {/* Payload Type Filter (tasks_by_pt mode) */}
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
                        {/* Tag Type Filter */}
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

                        {/* Export to ATT&CK Navigator */}
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
                                <Tag size={14} className="inline-block mr-1.5" />
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
                                const count = viewMode === 'tasks' ? tacticData.taskCount
                                    : viewMode === 'tasks_by_pt' ? tacticData.taskByPtCount
                                    : viewMode === 'tags' ? tacticData.tagCount
                                    : tacticData.commandCount;

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
                                                    key={`${technique.id}-${tacticData.tactic}`}
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
                        <span>{viewMode === 'commands' ? 'Available' : 'Executed'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-ghost/5 border border-ghost/20 rounded opacity-60" />
                        <span>Not {viewMode === 'commands' ? 'Available' : 'Executed'}</span>
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
                        tasks={activeTaskAttacks}
                        commands={activeCommandAttacks}
                        viewMode={viewMode}
                        onClose={() => setSelectedTechnique(null)}
                    />
                )}
            </AnimatePresence>
    </div>
    );
};

export default MitreAttack;
