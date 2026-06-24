import React, { useState, useEffect } from 'react';
import { useMutation } from "@apollo/client/react";
import { useQueryCompat as useQuery, useLazyQueryCompat as useLazyQuery} from "../lib/useQueryCompat";
import { GET_ARTIFACTS, GET_ARTIFACT_TYPES, CREATE_ARTIFACT } from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Database, 
    Search, 
    Terminal,
    Filter,
    ChevronDown,
    Plus,
    X,
    Loader2,
    Copy,
} from 'lucide-react';
import type { Artifact } from '../types/artifacts';
import { useAppStore } from '../store';
import { cn } from '../lib/utils';
import { snackActions } from '../lib/snackbar';
import { toLocalTime } from '../lib/time';

// ============================================
// Artifact Type Badge Colors
// ============================================
const getArtifactTypeColor = (type: string) => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
        'Process Create': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
        'File Create': { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
        'File Write': { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
        'File Delete': { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
        'Registry Create': { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
        'Registry Write': { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
        'Network Connection': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
        'Pipe Create': { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
        'API Call': { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
    };
    return colors[type] || { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/30' };
};

// ============================================
// Artifact Row Component
// ============================================
const ArtifactRow = ({ artifact, onCopy }: { artifact: Artifact; onCopy: (text: string) => void }) => {
    const [expanded, setExpanded] = useState(false);
    const typeColors = getArtifactTypeColor(artifact.base_artifact);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border border-ghost/20 rounded-lg overflow-hidden hover:border-ghost/40 transition-colors"
        >
            <div 
                className="p-4 cursor-pointer bg-black/20 hover:bg-black/30 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                            <span className={cn(
                                "px-2 py-0.5 rounded text-xs font-mono border",
                                typeColors.bg, typeColors.text, typeColors.border
                            )}>
                                {artifact.base_artifact}
                            </span>
                            <span className="text-gray-500 text-xs">on</span>
                            <span className="text-white font-mono text-sm">{artifact.host}</span>
                        </div>
                        <p className="text-gray-300 font-mono text-sm truncate">{artifact.artifact_text}</p>
                    </div>
                    
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            onClick={(e) => { e.stopPropagation(); onCopy(artifact.artifact_text); }}
                            className="p-1.5 rounded hover:bg-ghost/20 text-gray-400 hover:text-signal transition-colors"
                            title="Copy artifact"
                        >
                            <Copy size={14} />
                        </button>
                        <div className="text-right text-xs text-gray-500">
                            <div>{toLocalTime(artifact.timestamp, false)}</div>
                            {artifact.task && (
                                <div className="mt-1">Callback #{artifact.task.callback?.display_id}</div>
                            )}
                        </div>
                        <ChevronDown 
                            size={16} 
                            className={cn(
                                "text-gray-500 transition-transform",
                                expanded && "rotate-180"
                            )}
                        />
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-ghost/20 bg-black/40"
                    >
                        <div className="p-4 space-y-4">
                            {/* Full Artifact Text */}
                            <div>
                                <label className="text-xs text-gray-500 uppercase mb-1 block">Artifact Details</label>
                                <pre className="p-3 bg-black/50 rounded border border-ghost/20 text-sm text-gray-300 font-mono whitespace-pre-wrap break-all">
                                    {artifact.artifact_text}
                                </pre>
                            </div>

                            {/* Task Information */}
                            {artifact.task && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase mb-1 block">Command</label>
                                        <div className="flex items-center gap-2">
                                            <Terminal size={14} className="text-signal" />
                                            <span className="text-signal font-mono">{artifact.task.command_name}</span>
                                        </div>
                                        {artifact.task.display_params && (
                                            <p className="text-gray-400 font-mono text-xs mt-1 truncate">{artifact.task.display_params}</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase mb-1 block">Operator</label>
                                        <span className="text-white">{artifact.task.operator?.username || 'Unknown'}</span>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase mb-1 block">Callback</label>
                                        <div className="text-white">
                                            #{artifact.task.callback?.display_id} - {artifact.task.callback?.user}@{artifact.task.callback?.host}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase mb-1 block">Agent Type</label>
                                        <span className="text-signal">{artifact.task.callback?.payload?.payloadtype?.name}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// ============================================
// Create Artifact Modal
// ============================================
const CreateArtifactModal = ({ 
    isOpen, 
    onClose, 
    onCreate,
    artifactTypes 
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    onCreate: (artifact: { artifact_text: string; base_artifact: string; host: string }) => void;
    artifactTypes: string[];
}) => {
    const [artifactText, setArtifactText] = useState('');
    const [baseArtifact, setBaseArtifact] = useState('');
    const [host, setHost] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!artifactText || !baseArtifact || !host) {
            snackActions.warning('Please fill in all fields');
            return;
        }
        onCreate({ artifact_text: artifactText, base_artifact: baseArtifact, host });
        setArtifactText('');
        setBaseArtifact('');
        setHost('');
        onClose();
    };

    if (!isOpen) return null;

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
                className="bg-void border border-ghost/30 rounded-lg w-full max-w-lg"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-ghost/30 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-signal">Create Artifact</h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-ghost/20 rounded transition-colors"
                    >
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="text-sm text-gray-400 block mb-2">Artifact Type</label>
                        <select
                            value={baseArtifact}
                            onChange={(e) => setBaseArtifact(e.target.value)}
                            className="w-full h-10 px-3 bg-black/50 border border-ghost/30 rounded text-white focus:border-signal/50 focus:outline-none"
                        >
                            <option value="">Select type...</option>
                            {artifactTypes.map((type) => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                            <option value="Custom">Custom</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-sm text-gray-400 block mb-2">Host</label>
                        <input
                            type="text"
                            value={host}
                            onChange={(e) => setHost(e.target.value)}
                            placeholder="hostname"
                            className="w-full h-10 px-3 bg-black/50 border border-ghost/30 rounded text-white placeholder-gray-500 focus:border-signal/50 focus:outline-none font-mono"
                        />
                    </div>

                    <div>
                        <label className="text-sm text-gray-400 block mb-2">Artifact Details</label>
                        <textarea
                            value={artifactText}
                            onChange={(e) => setArtifactText(e.target.value)}
                            placeholder="Enter artifact details..."
                            rows={4}
                            className="w-full px-3 py-2 bg-black/50 border border-ghost/30 rounded text-white placeholder-gray-500 focus:border-signal/50 focus:outline-none font-mono resize-none"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-signal hover:bg-signal/80 text-void font-medium rounded transition-colors"
                        >
                            Create Artifact
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
};

// ============================================
// Main Artifacts Page
// ============================================
const Artifacts = () => {
    const isSidebarCollapsed = useAppStore(s => s.isSidebarCollapsed);
    const [searchQuery, setSearchQuery] = useState('');
    const [inputValue, setInputValue] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [artifactTypes, setArtifactTypes] = useState<string[]>([]);
    const limit = 25;

    // Fetch artifact types
    useQuery<any>(GET_ARTIFACT_TYPES, {
        onCompleted: (data: any) => {
            const types = data.taskartifact.map((a: { base_artifact: string }) => a.base_artifact).filter(Boolean);
            setArtifactTypes([...new Set(types)] as string[]);
        }
    });

    // Fetch artifacts
    const [fetchArtifacts] = useLazyQuery<any>(GET_ARTIFACTS, {
        fetchPolicy: "no-cache",
        onCompleted: (data: any) => {
            setArtifacts(data.taskartifact);
            setTotalCount(data.taskartifact_aggregate.aggregate.count);
            setLoading(false);
        },
        onError: () => {
            snackActions.error('Failed to fetch artifacts');
            setLoading(false);
        }
    });

    // Create artifact mutation
    const [createArtifact] = useMutation<any>(CREATE_ARTIFACT, {
        onCompleted: (data: any) => {
            snackActions.success('Artifact created');
            // Refresh the list
            fetchArtifacts({
                variables: {
                    offset: 0,
                    limit,
                    search: searchQuery ? `%${searchQuery}%` : '%%'
                }
            });
        },
        onError: () => {
            snackActions.error('Failed to create artifact');
        }
    });

    useEffect(() => {
        setLoading(true);
        fetchArtifacts({
            variables: {
                offset: (page - 1) * limit,
                limit,
                search: searchQuery ? `%${searchQuery}%` : '%%'
            }
        });
    }, [searchQuery, page, fetchArtifacts]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchQuery(inputValue);
        setPage(1);
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        snackActions.success('Copied to clipboard');
    };

    const handleCreateArtifact = (artifact: { artifact_text: string; base_artifact: string; host: string }) => {
        createArtifact({ variables: artifact });
    };

    const filteredArtifacts = filterType === 'all' 
        ? artifacts 
        : artifacts.filter(a => a.base_artifact === filterType);

    const totalPages = Math.ceil(totalCount / limit);

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={cn("flex-1 flex flex-col min-w-0 h-screen transition-all duration-300", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                {/* Header */}
                <div className="h-16 border-b border-ghost/30 flex items-center justify-between px-6 bg-void/90 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
                            <Database size={20} className="text-orange-400" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-wide">ARTIFACTS</h1>
                            <p className="text-xs text-gray-500 font-mono">
                                {totalCount} total artifacts
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-signal hover:bg-signal/80 text-void font-medium rounded transition-colors"
                    >
                        <Plus size={16} />
                        New Artifact
                    </button>
                </div>

                {/* Search and Filters */}
                <div className="border-b border-ghost/30 p-4 flex items-center gap-4">
                    <form onSubmit={handleSearch} className="flex-1 flex items-center gap-4">
                        <div className="flex-1 relative">
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Search artifacts..."
                                className="w-full h-10 pl-10 pr-4 bg-black/50 border border-ghost/30 rounded text-white placeholder-gray-500 focus:border-signal/50 focus:outline-none font-mono"
                            />
                        </div>
                        <button
                            type="submit"
                            className="h-10 px-4 bg-signal/10 hover:bg-signal/20 border border-signal/30 text-signal rounded transition-colors"
                        >
                            Search
                        </button>
                    </form>

                    {/* Filter by Type */}
                    <div className="flex items-center gap-2">
                        <Filter size={16} className="text-gray-500" />
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="h-10 px-3 bg-black/50 border border-ghost/30 rounded text-white focus:border-signal/50 focus:outline-none"
                        >
                            <option value="all">All Types</option>
                            {artifactTypes.map((type) => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Artifacts List */}
                <div className="flex-1 overflow-auto p-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 size={32} className="text-signal animate-spin" />
                        </div>
                    ) : filteredArtifacts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                            <Database size={48} className="mb-4" />
                            <p className="text-lg">No artifacts found</p>
                            {searchQuery && (
                                <p className="text-sm mt-2">Try a different search term</p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredArtifacts.map((artifact) => (
                                <ArtifactRow 
                                    key={artifact.id} 
                                    artifact={artifact} 
                                    onCopy={handleCopy}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="border-t border-ghost/30 p-4 flex items-center justify-center gap-2">
                        <button
                            onClick={() => setPage(1)}
                            disabled={page === 1}
                            className="px-3 py-1.5 rounded border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            First
                        </button>
                        <button
                            onClick={() => setPage(p => p - 1)}
                            disabled={page === 1}
                            className="px-3 py-1.5 rounded border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Prev
                        </button>
                        
                        <span className="px-4 text-gray-400 font-mono text-sm">
                            Page {page} of {totalPages}
                        </span>
                        
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={page === totalPages}
                            className="px-3 py-1.5 rounded border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Next
                        </button>
                        <button
                            onClick={() => setPage(totalPages)}
                            disabled={page === totalPages}
                            className="px-3 py-1.5 rounded border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Last
                        </button>
                    </div>
                )}
            </motion.div>

            {/* Create Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <CreateArtifactModal
                        isOpen={showCreateModal}
                        onClose={() => setShowCreateModal(false)}
                        onCreate={handleCreateArtifact}
                        artifactTypes={artifactTypes}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Artifacts;
