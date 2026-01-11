import React, { useState, useMemo } from 'react';
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Code, 
    Play, 
    Pause, 
    Edit, 
    RotateCcw, 
    Plus, 
    Search, 
    X, 
    Check, 
    AlertCircle,
    ChevronDown,
    ChevronRight,
    Copy,
    Loader
} from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { cn } from '../lib/utils';
import { useAppStore } from '../store';
import { snackActions } from '../../Archive/components/utilities/Snackbar';
import { meState } from '../../cache';
import { useReactiveVar } from '@apollo/client';

// GraphQL Queries and Mutations
const SUB_BrowserScripts = gql`
subscription SubscribeBrowserScripts($operator_id: Int!) {
  browserscript(where: {operator_id: {_eq: $operator_id}, for_new_ui: {_eq: true}}, order_by: {payloadtype: {name: asc}}) {
    active
    author
    user_modified
    script
    payloadtype {
      name
      id
    }
    id
    creation_time
    container_version_author
    container_version
    command {
      cmd
      id
    }
  }
}
`;

const GET_PAYLOAD_TYPES = gql`
query GetPayloadTypes {
    payloadtype(where: {deleted: {_eq: false}}) {
        id
        name
        commands {
            id
            cmd
        }
    }
}
`;

const UPDATE_SCRIPT_ACTIVE = gql`
mutation updateBrowserScriptActive($browserscript_id: Int!, $active: Boolean!) {
  update_browserscript_by_pk(pk_columns: {id: $browserscript_id}, _set: {active: $active}) {
    id
  }
}
`;

const UPDATE_SCRIPT = gql`
mutation updateBrowserScriptScript($browserscript_id: Int!, $script: String!, $command_id: Int!, $payload_type_id: Int!) {
  update_browserscript_by_pk(pk_columns: {id: $browserscript_id}, _set: {script: $script, user_modified: true, command_id: $command_id, payload_type_id: $payload_type_id}) {
    id
  }
}
`;

const REVERT_SCRIPT = gql`
mutation updateBrowserScriptRevert($browserscript_id: Int!, $script: String!) {
  update_browserscript_by_pk(pk_columns: {id: $browserscript_id}, _set: {script: $script, user_modified: false}) {
    id
  }
}
`;

const CREATE_SCRIPT = gql`
mutation insertNewBrowserScript($script: String!, $payload_type_id: Int!, $command_id: Int!, $author: String!){
  insert_browserscript_one(object: {script: $script, payload_type_id: $payload_type_id, command_id: $command_id, author: $author}){
    id
  }
}
`;

interface BrowserScript {
    id: number;
    active: boolean;
    author: string;
    user_modified: boolean;
    script: string;
    payloadtype: {
        name: string;
        id: number;
    };
    command: {
        cmd: string;
        id: number;
    };
    container_version: string;
    container_version_author: string;
    creation_time: string;
}

interface PayloadType {
    id: number;
    name: string;
    commands: { id: number; cmd: string }[];
}

// Script Editor Modal
const ScriptEditorModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    script?: BrowserScript;
    payloadTypes: PayloadType[];
    onSubmit: (data: { script: string; command_id: number; payload_type_id: number }) => void;
    mode: 'edit' | 'create';
    username: string;
}> = ({ isOpen, onClose, script, payloadTypes, onSubmit, mode, username }) => {
    const [code, setCode] = useState(script?.script || '// Custom browser script\nfunction(task, responses){\n  return JSON.stringify(responses, null, 2);\n}');
    const [selectedPayloadType, setSelectedPayloadType] = useState(script?.payloadtype?.id || 0);
    const [selectedCommand, setSelectedCommand] = useState(script?.command?.id || 0);

    const commands = useMemo(() => {
        const pt = payloadTypes.find(p => p.id === selectedPayloadType);
        return pt?.commands || [];
    }, [selectedPayloadType, payloadTypes]);

    React.useEffect(() => {
        if (script) {
            setCode(script.script);
            setSelectedPayloadType(script.payloadtype.id);
            setSelectedCommand(script.command.id);
        } else {
            setCode('// Custom browser script\nfunction(task, responses){\n  return JSON.stringify(responses, null, 2);\n}');
            setSelectedPayloadType(payloadTypes[0]?.id || 0);
            setSelectedCommand(0);
        }
    }, [script, payloadTypes]);

    const handleSubmit = () => {
        if (!selectedPayloadType || !selectedCommand) {
            return;
        }
        onSubmit({
            script: code,
            command_id: selectedCommand,
            payload_type_id: selectedPayloadType
        });
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
                className="bg-void border border-ghost/30 rounded-lg w-[90vw] max-w-6xl max-h-[90vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-ghost/30">
                    <h2 className="text-xl font-bold text-signal">
                        {mode === 'edit' ? 'EDIT BROWSER SCRIPT' : 'CREATE BROWSER SCRIPT'}
                    </h2>
                    <button onClick={onClose} className="text-ghost hover:text-signal">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Selectors */}
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-sm text-ghost mb-2">Payload Type</label>
                            <select
                                value={selectedPayloadType}
                                onChange={(e) => {
                                    setSelectedPayloadType(Number(e.target.value));
                                    setSelectedCommand(0);
                                }}
                                className="w-full bg-void border border-ghost/30 rounded px-3 py-2 text-signal focus:border-signal outline-none"
                            >
                                <option value={0}>Select Payload Type</option>
                                {payloadTypes.map(pt => (
                                    <option key={pt.id} value={pt.id}>{pt.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm text-ghost mb-2">Command</label>
                            <select
                                value={selectedCommand}
                                onChange={(e) => setSelectedCommand(Number(e.target.value))}
                                className="w-full bg-void border border-ghost/30 rounded px-3 py-2 text-signal focus:border-signal outline-none"
                            >
                                <option value={0}>Select Command</option>
                                {commands.map(cmd => (
                                    <option key={cmd.id} value={cmd.id}>{cmd.cmd}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Code Editor - Simple Textarea */}
                    <div className="border border-ghost/30 rounded overflow-hidden">
                        <textarea
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            className="w-full h-[400px] bg-black/50 text-signal font-mono text-sm p-4 resize-none focus:outline-none"
                            placeholder="// Enter your browser script here..."
                            spellCheck={false}
                        />
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
                        disabled={!selectedPayloadType || !selectedCommand}
                        className="px-4 py-2 bg-signal text-void rounded hover:bg-signal/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Check size={16} />
                        {mode === 'edit' ? 'Save Changes' : 'Create Script'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// Script Row Component
const ScriptRow: React.FC<{
    script: BrowserScript;
    onToggleActive: (id: number, active: boolean) => void;
    onEdit: (script: BrowserScript) => void;
    onRevert: (id: number, originalScript: string) => void;
}> = ({ script, onToggleActive, onEdit, onRevert }) => {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(script.script);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border border-ghost/30 rounded-lg overflow-hidden mb-2"
        >
            {/* Main Row */}
            <div 
                className={cn(
                    "flex items-center gap-4 p-3 cursor-pointer transition-colors",
                    script.active ? "bg-void" : "bg-void/50 opacity-60"
                )}
                onClick={() => setExpanded(!expanded)}
            >
                <button className="text-ghost hover:text-signal">
                    {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </button>

                {/* Payload Type */}
                <div className="w-32">
                    <span className="px-2 py-1 bg-signal/20 text-signal rounded text-xs font-mono">
                        {script.payloadtype.name}
                    </span>
                </div>

                {/* Command */}
                <div className="flex-1">
                    <span className="text-signal font-mono">{script.command.cmd}</span>
                </div>

                {/* Author */}
                <div className="w-32 text-ghost text-sm">
                    {script.author}
                </div>

                {/* Modified Badge */}
                {script.user_modified && (
                    <span className="px-2 py-1 bg-matrix/20 text-matrix rounded text-xs">
                        Modified
                    </span>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button
                        onClick={() => onToggleActive(script.id, !script.active)}
                        className={cn(
                            "p-1.5 rounded transition-colors",
                            script.active 
                                ? "text-matrix hover:bg-matrix/20" 
                                : "text-ghost hover:bg-ghost/20"
                        )}
                        title={script.active ? "Deactivate" : "Activate"}
                    >
                        {script.active ? <Play size={16} /> : <Pause size={16} />}
                    </button>
                    <button
                        onClick={() => onEdit(script)}
                        className="p-1.5 text-ghost hover:text-signal hover:bg-signal/20 rounded transition-colors"
                        title="Edit Script"
                    >
                        <Edit size={16} />
                    </button>
                    {script.user_modified && (
                        <button
                            onClick={() => onRevert(script.id, script.container_version)}
                            className="p-1.5 text-ghost hover:text-alert hover:bg-alert/20 rounded transition-colors"
                            title="Revert to Original"
                        >
                            <RotateCcw size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Expanded Content */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-ghost/30 bg-black/30"
                    >
                        <div className="p-4">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-ghost">Script Code</span>
                                <button
                                    onClick={handleCopy}
                                    className="flex items-center gap-1 text-xs text-ghost hover:text-signal"
                                >
                                    {copied ? <Check size={14} /> : <Copy size={14} />}
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                            <pre className="bg-void p-3 rounded border border-ghost/30 overflow-x-auto text-sm font-mono text-signal max-h-64 overflow-y-auto">
                                {script.script}
                            </pre>
                            <div className="flex gap-4 mt-3 text-xs text-ghost">
                                <span>Container Version: {script.container_version || 'N/A'}</span>
                                <span>Container Author: {script.container_version_author || 'N/A'}</span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default function BrowserScripts() {
    const { isSidebarCollapsed } = useAppStore();
    const me = useReactiveVar(meState);

    const [scripts, setScripts] = useState<BrowserScript[]>([]);
    const [payloadTypes, setPayloadTypes] = useState<PayloadType[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterPayloadType, setFilterPayloadType] = useState<string>('');
    const [showActiveOnly, setShowActiveOnly] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingScript, setEditingScript] = useState<BrowserScript | undefined>();
    const [editorMode, setEditorMode] = useState<'edit' | 'create'>('create');
    const [loading, setLoading] = useState(true);

    // Load payload types
    useQuery(GET_PAYLOAD_TYPES, {
        onCompleted: (data) => {
            setPayloadTypes(data.payloadtype);
        }
    });

    // Subscribe to browser scripts
    // @ts-ignore
    useSubscription(SUB_BrowserScripts, {
        // @ts-ignore
        variables: { operator_id: me?.user?.id || 0 },
        fetchPolicy: "no-cache",
        onData: ({ data }) => {
            if (data?.data?.browserscript) {
                const sortedScripts = [...data.data.browserscript].sort((a: BrowserScript, b: BrowserScript) => {
                    if (a.payloadtype.name === b.payloadtype.name) {
                        return a.command.cmd.localeCompare(b.command.cmd);
                    }
                    return a.payloadtype.name.localeCompare(b.payloadtype.name);
                });
                setScripts(sortedScripts);
                setLoading(false);
            }
        }
    });

    // Mutations
    const [toggleActive] = useMutation(UPDATE_SCRIPT_ACTIVE, {
        onCompleted: () => snackActions.success('Script status updated'),
        onError: (err) => snackActions.error('Failed to update script: ' + err.message)
    });

    const [updateScript] = useMutation(UPDATE_SCRIPT, {
        onCompleted: () => snackActions.success('Script updated'),
        onError: (err) => snackActions.error('Failed to update script: ' + err.message)
    });

    const [revertScript] = useMutation(REVERT_SCRIPT, {
        onCompleted: () => snackActions.success('Script reverted'),
        onError: (err) => snackActions.error('Failed to revert script: ' + err.message)
    });

    const [createScript] = useMutation(CREATE_SCRIPT, {
        onCompleted: () => snackActions.success('Script created'),
        onError: (err) => snackActions.error('Failed to create script: ' + err.message)
    });

    // Filter scripts
    const filteredScripts = useMemo(() => {
        return scripts.filter(s => {
            if (showActiveOnly && !s.active) return false;
            if (filterPayloadType && s.payloadtype.name !== filterPayloadType) return false;
            if (searchTerm) {
                const search = searchTerm.toLowerCase();
                return (
                    s.command.cmd.toLowerCase().includes(search) ||
                    s.payloadtype.name.toLowerCase().includes(search) ||
                    s.author.toLowerCase().includes(search)
                );
            }
            return true;
        });
    }, [scripts, searchTerm, filterPayloadType, showActiveOnly]);

    // Group by payload type
    const groupedScripts = useMemo(() => {
        const groups: Record<string, BrowserScript[]> = {};
        filteredScripts.forEach(script => {
            const pt = script.payloadtype.name;
            if (!groups[pt]) groups[pt] = [];
            groups[pt].push(script);
        });
        return groups;
    }, [filteredScripts]);

    const handleToggleActive = (id: number, active: boolean) => {
        toggleActive({ variables: { browserscript_id: id, active } });
    };

    const handleEdit = (script: BrowserScript) => {
        setEditingScript(script);
        setEditorMode('edit');
        setEditorOpen(true);
    };

    const handleRevert = (id: number, originalScript: string) => {
        revertScript({ variables: { browserscript_id: id, script: originalScript } });
    };

    const handleSubmit = (data: { script: string; command_id: number; payload_type_id: number }) => {
        if (editorMode === 'edit' && editingScript) {
            updateScript({
                variables: {
                    browserscript_id: editingScript.id,
                    script: data.script,
                    command_id: data.command_id,
                    payload_type_id: data.payload_type_id
                }
            });
        } else {
            // @ts-ignore
            createScript({
                variables: {
                    // @ts-ignore
                    author: me?.user?.username || '',
                    script: data.script,
                    payload_type_id: data.payload_type_id,
                    command_id: data.command_id
                }
            });
        }
    };

    const handleCreate = () => {
        setEditingScript(undefined);
        setEditorMode('create');
        setEditorOpen(true);
    };

    const uniquePayloadTypes = useMemo(() => {
        return [...new Set(scripts.map(s => s.payloadtype.name))];
    }, [scripts]);

    return (
        <div className="min-h-screen bg-void text-signal">
            <Sidebar />

            <div className={cn("transition-all duration-300 p-6", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <Code className="text-signal" size={32} />
                        <h1 className="text-3xl font-bold tracking-wider">BROWSER_SCRIPTS</h1>
                    </div>
                    <p className="text-ghost">
                        Manage browser scripts for transforming task output in the UI
                    </p>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap gap-4 mb-6">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ghost" size={18} />
                        <input
                            type="text"
                            placeholder="Search scripts..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-void border border-ghost/30 rounded-lg pl-10 pr-4 py-2 text-signal placeholder:text-ghost/50 focus:border-signal outline-none"
                        />
                    </div>

                    {/* Payload Type Filter */}
                    <select
                        value={filterPayloadType}
                        onChange={(e) => setFilterPayloadType(e.target.value)}
                        className="bg-void border border-ghost/30 rounded-lg px-4 py-2 text-signal focus:border-signal outline-none min-w-[150px]"
                    >
                        <option value="">All Payload Types</option>
                        {uniquePayloadTypes.map(pt => (
                            <option key={pt} value={pt}>{pt}</option>
                        ))}
                    </select>

                    {/* Active Filter */}
                    <button
                        onClick={() => setShowActiveOnly(!showActiveOnly)}
                        className={cn(
                            "px-4 py-2 border rounded-lg transition-colors flex items-center gap-2",
                            showActiveOnly
                                ? "border-matrix text-matrix bg-matrix/20"
                                : "border-ghost/30 text-ghost hover:text-signal hover:border-signal"
                        )}
                    >
                        {showActiveOnly ? <Play size={16} /> : <AlertCircle size={16} />}
                        {showActiveOnly ? 'Active Only' : 'Show All'}
                    </button>

                    {/* Create Button */}
                    <button
                        onClick={handleCreate}
                        className="px-4 py-2 bg-signal text-void rounded-lg hover:bg-signal/80 transition-colors flex items-center gap-2"
                    >
                        <Plus size={18} />
                        New Script
                    </button>
                </div>

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <Loader className="animate-spin text-signal" size={32} />
                        <span className="ml-3 text-ghost">Loading scripts...</span>
                    </div>
                )}

                {/* Scripts List */}
                {!loading && (
                    <div className="space-y-6">
                        {Object.entries(groupedScripts).map(([payloadType, groupScripts]) => (
                            <div key={payloadType}>
                                <h2 className="text-lg font-bold text-matrix mb-3 flex items-center gap-2">
                                    <Code size={18} />
                                    {payloadType}
                                    <span className="text-ghost font-normal text-sm">
                                        ({groupScripts.length} scripts)
                                    </span>
                                </h2>
                                {groupScripts.map(script => (
                                    <ScriptRow
                                        key={script.id}
                                        script={script}
                                        onToggleActive={handleToggleActive}
                                        onEdit={handleEdit}
                                        onRevert={handleRevert}
                                    />
                                ))}
                            </div>
                        ))}

                        {Object.keys(groupedScripts).length === 0 && (
                            <div className="text-center py-20 text-ghost">
                                <Code size={48} className="mx-auto mb-4 opacity-50" />
                                <p>No browser scripts found</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Stats Footer */}
                <div className="mt-8 pt-4 border-t border-ghost/30 flex gap-6 text-sm text-ghost">
                    <span>Total: {scripts.length}</span>
                    <span>Active: {scripts.filter(s => s.active).length}</span>
                    <span>Modified: {scripts.filter(s => s.user_modified).length}</span>
                </div>
            </div>

            {/* Script Editor Modal */}
            <AnimatePresence>
                {editorOpen && (
                    <ScriptEditorModal
                        isOpen={editorOpen}
                        onClose={() => setEditorOpen(false)}
                        script={editingScript}
                        payloadTypes={payloadTypes}
                        onSubmit={handleSubmit}
                        mode={editorMode}
                        // @ts-ignore
                        username={me?.user?.username || ''}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
