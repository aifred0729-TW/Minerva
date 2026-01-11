import React, { useState, useMemo } from 'react';
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client';
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
    Edit,
    Clock,
    Calendar,
    Activity,
    FileText,
    Users,
    Loader
} from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { cn } from '../lib/utils';
import { useAppStore } from '../store';
import { snackActions } from '../../Archive/components/utilities/Snackbar';

// GraphQL Queries
const GET_EVENTGROUPS = gql`
query GetEventGroups {
  eventgroup(limit: 50, order_by: {id: desc}) {
    id
    operator {
        username
    }
    filemetum {
        agent_file_id
        id
        filename_text
    }
    filemeta(where: {deleted: {_eq: false}}) {
        agent_file_id
        id
        filename_text
        deleted
    }
    name
    description
    trigger
    trigger_data
    next_scheduled_run
    keywords
    environment
    active
    deleted
    created_at
    run_as
    approved_to_run
    eventgroupapprovals(order_by: {id: asc}) {
      id
      operator {
        id
        username
      }
      approved
      created_at
      updated_at
    }
    eventgroupconsumingcontainers {
        id
        consuming_container_name
        all_functions_available
        function_names
        consuming_container {
            container_running
            subscriptions
        }
    }
  }
}
`;

const SUB_EVENTGROUPS = gql`
subscription GetEventGroups {
  eventgroup_stream(cursor: {initial_value: {updated_at: "1970-01-01"}, ordering: ASC}, batch_size: 50, where: {}) {
    id
    operator {
        username
    }
    filemetum {
        agent_file_id
        id
        filename_text
    }
    filemeta(where: {deleted: {_eq: false}}) {
        agent_file_id
        id
        filename_text
        deleted
    }
    name
    description
    trigger
    trigger_data
    next_scheduled_run
    keywords
    environment
    active
    deleted
    created_at
    run_as
    approved_to_run
    eventgroupapprovals(order_by: {id: asc}) {
      id
      operator {
        id
        username
      }
      approved
      created_at
      updated_at
    }
    eventgroupconsumingcontainers {
        id
        consuming_container_name
        all_functions_available
        function_names
        consuming_container {
            container_running
            subscriptions
        }
    }
  }
}
`;

const TOGGLE_EVENTGROUP_ACTIVE = gql`
mutation ToggleEventGroupActive($id: Int!, $active: Boolean!) {
    update_eventgroup_by_pk(pk_columns: {id: $id}, _set: {active: $active}) {
        id
        active
    }
}
`;

const DELETE_EVENTGROUP = gql`
mutation DeleteEventGroup($id: Int!) {
    update_eventgroup_by_pk(pk_columns: {id: $id}, _set: {deleted: true}) {
        id
    }
}
`;

const RESTORE_EVENTGROUP = gql`
mutation RestoreEventGroup($id: Int!) {
    update_eventgroup_by_pk(pk_columns: {id: $id}, _set: {deleted: false}) {
        id
    }
}
`;

const CREATE_EVENTGROUP = gql`
mutation CreateEventGroupFromFile($file: String!, $filename: String!) {
    uploadEventFile(file: $file, filename: $filename) {
        status
        error
        file_id
    }
}
`;

const APPROVE_EVENTGROUP = gql`
mutation ApproveEventGroup($eventgroup_id: Int!, $approved: Boolean!) {
    approveEventGroup(eventgroup_id: $eventgroup_id, approved: $approved) {
        status
        error
    }
}
`;

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
}> = ({ isOpen, onClose, eventGroup, onToggleActive, onApprove, onDelete }) => {
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
                <div className="flex justify-between gap-3 p-4 border-t border-ghost/30">
                    <div className="flex gap-2">
                        {!eventGroup.approved_to_run && (
                            <button
                                onClick={() => onApprove(true)}
                                className="px-4 py-2 bg-matrix text-void rounded hover:bg-matrix/80 transition-colors flex items-center gap-2"
                            >
                                <Check size={16} />
                                Approve
                            </button>
                        )}
                        <button
                            onClick={onDelete}
                            className="px-4 py-2 bg-alert text-void rounded hover:bg-alert/80 transition-colors flex items-center gap-2"
                        >
                            <Trash2 size={16} />
                            Delete
                        </button>
                    </div>
                    <div className="flex gap-2">
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

export default function Eventing() {
    const { isSidebarCollapsed } = useAppStore();

    const [eventGroups, setEventGroups] = useState<EventGroup[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterTrigger, setFilterTrigger] = useState<string>('');
    const [showDeleted, setShowDeleted] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [selectedEventGroup, setSelectedEventGroup] = useState<EventGroup | null>(null);
    const [detailModalOpen, setDetailModalOpen] = useState(false);
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
            <Sidebar />

            <div className={cn("transition-all duration-300 p-6", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <Zap className="text-signal" size={32} />
                        <h1 className="text-3xl font-bold tracking-wider">EVENTING</h1>
                    </div>
                    <p className="text-ghost">
                        Manage automated workflows and event-driven actions
                    </p>
                </div>

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

                {/* Controls */}
                <div className="flex flex-wrap gap-4 mb-6">
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
            </div>

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
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
