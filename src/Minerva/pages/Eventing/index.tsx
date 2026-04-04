import React, { useState, useMemo } from 'react';
import { useMutation, useSubscription } from "@apollo/client/react";
import { useQueryCompat as useQuery, useLazyQueryCompat as useLazyQuery} from "../../lib/useQueryCompat";
import { motion, AnimatePresence } from 'framer-motion';
import {
    Zap, Plus, Search, Eye, EyeOff, Upload, Loader, List,
} from 'lucide-react';

import { cn, downloadBlob } from '../../lib/utils';
import { useAppStore } from '../../store';
import { snackActions } from '../../lib/snackbar';
import {
    GET_EVENTGROUPS,
    SUB_EVENTGROUPS,
    TOGGLE_EVENTGROUP_ACTIVE,
    DELETE_EVENTGROUP,
    RESTORE_EVENTGROUP,
    CREATE_EVENTGROUP,
    APPROVE_EVENTGROUP,
    TRIGGER_MANUAL,
    EXPORT_EVENT_GROUP,
} from '../../lib/api';
import type { EventGroup } from './eventing.types';
import { CreateWorkflowModal } from './CreateWorkflowModal';
import { EventGroupDetailModal } from './EventGroupDetailModal';
import { KeywordTriggerModal } from './KeywordTriggerModal';
import { EventGroupCard } from './EventGroupCard';
import { InstancesSection } from './InstancesSection';

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

    useQuery<any>(GET_EVENTGROUPS, {
        fetchPolicy: "no-cache",
        onCompleted: (data: any) => {
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

    useSubscription<any>(SUB_EVENTGROUPS, {
        fetchPolicy: "no-cache",
        onData: ({ data }: { data: any }) => {
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
        },
        onError: (err) => { console.error('[SUB_EVENTGROUPS] subscription error:', err); },
    });

    const [toggleActive] = useMutation<any>(TOGGLE_EVENTGROUP_ACTIVE, {
        onCompleted: () => snackActions.success('Event group status updated'),
        onError: (err) => snackActions.error('Failed to update: ' + err.message)
    });

    const [deleteEventGroup] = useMutation<any>(DELETE_EVENTGROUP, {
        onCompleted: () => {
            snackActions.success('Event group deleted');
            setDetailModalOpen(false);
        },
        onError: (err) => snackActions.error('Failed to delete: ' + err.message)
    });

    const [createEventGroup] = useMutation<any>(CREATE_EVENTGROUP, {
        onCompleted: (data: any) => {
            if (data.uploadEventFile.status === 'success') {
                snackActions.success('Workflow created successfully');
            } else {
                snackActions.error('Failed to create: ' + data.uploadEventFile.error);
            }
        },
        onError: (err) => snackActions.error('Failed to create: ' + err.message)
    });

    const [approveEventGroup] = useMutation<any>(APPROVE_EVENTGROUP, {
        onCompleted: (data: any) => {
            if (data.approveEventGroup.status === 'success') {
                snackActions.success('Event group approved');
            } else {
                snackActions.error('Failed to approve: ' + data.approveEventGroup.error);
            }
        },
        onError: (err) => snackActions.error('Failed to approve: ' + err.message)
    });

    const [restoreEventGroup] = useMutation<any>(RESTORE_EVENTGROUP, {
        onCompleted: () => {
            snackActions.success('Event group restored');
            setDetailModalOpen(false);
        },
        onError: (err) => snackActions.error('Failed to restore: ' + err.message)
    });

    const [triggerManual] = useMutation<any>(TRIGGER_MANUAL, {
        onCompleted: (data: any) => {
            if (data.eventingTriggerManual.status === 'success') {
                snackActions.success('Manual trigger sent');
            } else {
                snackActions.error(data.eventingTriggerManual.error);
            }
        },
        onError: (err) => snackActions.error('Trigger failed: ' + err.message)
    });

    const [exportEventGroup] = useLazyQuery<any>(EXPORT_EVENT_GROUP, {
        fetchPolicy: 'no-cache',
        onCompleted: (data: any) => {
            const eg = data.eventgroup_by_pk;
            if (eg) {
                const exportData = {
                    name: eg.name, description: eg.description, trigger: eg.trigger,
                    trigger_data: eg.trigger_data, keywords: eg.keywords,
                    environment: eg.environment, run_as: eg.run_as,
                };
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                downloadBlob(blob, `${eg.name.replace(/\s+/g, '_')}.json`);
                snackActions.success('Event group exported');
            }
        },
        onError: () => snackActions.error('Export failed'),
    });

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
        createEventGroup({ variables: { file: base64Content, filename } });
    };

    const handleToggleActive = () => {
        if (selectedEventGroup) {
            toggleActive({ variables: { id: selectedEventGroup.id, active: !selectedEventGroup.active } });
        }
    };

    const handleDelete = () => {
        if (selectedEventGroup) {
            deleteEventGroup({ variables: { id: selectedEventGroup.id } });
        }
    };

    const handleApprove = (approved: boolean) => {
        if (selectedEventGroup) {
            approveEventGroup({ variables: { eventgroup_id: selectedEventGroup.id, approved } });
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
                createEventGroup({ variables: { file: base64Content, filename: file.name } });
            };
            reader.readAsText(file);
        }
        e.target.value = '';
    };

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

                    <button
                        onClick={() => setCreateModalOpen(true)}
                        className="px-4 py-2 bg-signal text-void rounded-lg hover:bg-signal/80 transition-colors flex items-center gap-2"
                    >
                        <Plus size={18} />
                        New Workflow
                    </button>
                    </div>

                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <Loader className="animate-spin text-signal" size={32} />
                        <span className="ml-3 text-ghost">Loading workflows...</span>
                    </div>
                )}

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

            <AnimatePresence>
                {createModalOpen && (
                    <CreateWorkflowModal
                        isOpen={createModalOpen}
                        onClose={() => setCreateModalOpen(false)}
                        onCreate={handleCreate}
                    />
                )}
            </AnimatePresence>

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
