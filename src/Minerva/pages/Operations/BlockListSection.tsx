import React, { useState, useEffect, useMemo } from 'react';
import { useMutation } from "@apollo/client/react";
import { useLazyQueryCompat as useLazyQuery } from '../../lib/useQueryCompat';
import {
    GET_BLOCK_LISTS,
    CREATE_BLOCK_LIST_ENTRIES,
    DELETE_ENTIRE_BLOCK_LIST,
    DELETE_BLOCK_LIST_ENTRIES,
} from '../../lib/api';
import {
    Plus, Trash2, Ban, ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { snackActions } from '../../lib/snackbar';
import { cn } from '../../lib/utils';
import { EditBlockListModal, ConfirmModal } from './modals';
import type { AllCommand } from './modals';

// ── Block List Types ──────────────────────────────
interface BlockListEntry { id: number; name: string; command: { id: number; cmd: string; payloadtype: { name: string } } }
interface CondensedBlockList { name: string; entries: Record<string, BlockListEntry[]> }

// ── Block List Section ────────────────────────────
export function BlockListSection() {
    const [blockLists, setBlockLists] = useState<CondensedBlockList[]>([]);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [editList, setEditList] = useState<CondensedBlockList | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const [fetchBlockLists] = useLazyQuery<any>(GET_BLOCK_LISTS, {
        fetchPolicy: 'network-only',
        onCompleted: (data: any) => {
            const condensed: Record<string, Record<string, BlockListEntry[]>> = {};
            (data.disabledcommandsprofile || []).forEach((entry: BlockListEntry) => {
                if (!condensed[entry.name]) condensed[entry.name] = {};
                const pt = entry.command.payloadtype.name;
                if (!condensed[entry.name][pt]) condensed[entry.name][pt] = [];
                condensed[entry.name][pt].push(entry);
            });
            setBlockLists(Object.entries(condensed).map(([name, entries]) => ({ name, entries })));
        },
        onError: () => snackActions.error('Failed to load block lists'),
    });

    const [createEntries] = useMutation<any>(CREATE_BLOCK_LIST_ENTRIES, {
        onCompleted: () => { snackActions.success('Block list updated'); fetchBlockLists(); },
        onError: () => snackActions.error('Failed to create block list entries'),
    });

    const [deleteList] = useMutation<any>(DELETE_ENTIRE_BLOCK_LIST, {
        onCompleted: (data: any) => {
            if (data.deleteBlockList.status === 'success') {
                setBlockLists(prev => prev.filter(b => b.name !== data.deleteBlockList.name));
                snackActions.success('Block list deleted');
            } else snackActions.error(data.deleteBlockList.error);
        },
        onError: () => snackActions.error('Failed to delete block list'),
    });

    const [deleteEntries] = useMutation<any>(DELETE_BLOCK_LIST_ENTRIES, {
        onCompleted: (data: any) => {
            if (data.deleteBlockListEntry.status === 'success') {
                snackActions.success('Entries removed');
                fetchBlockLists();
            } else snackActions.error(data.deleteBlockListEntry.error);
        },
        onError: () => snackActions.error('Failed to delete entries'),
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchBlockLists(); }, []);

    const handleSubmit = ({ toAdd, toRemove }: { toAdd: any[]; toRemove: any[] }) => {
        if (toAdd.length > 0) createEntries({ variables: { entries: toAdd } });
        if (toRemove.length > 0 && toRemove[0]?.name) {
            const ids = toRemove.map(e => e.command_id);
            deleteEntries({ variables: { name: toRemove[0].name, entries: ids } });
        }
        setShowCreate(false);
        setEditList(null);
    };

    return (
        <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 border border-red-500/30 bg-red-500/10"><Ban size={18} className="text-red-400" /></div>
                    <div>
                        <h2 className="text-lg font-bold tracking-widest text-white uppercase font-mono">COMMAND BLOCK LISTS</h2>
                        <p className="text-xs text-gray-600 font-mono">{blockLists.length} lists configured</p>
                    </div>
                </div>
                <button onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 font-mono text-xs transition-colors">
                    <Plus size={14} />NEW BLOCK LIST
                </button>
            </div>

            {blockLists.length === 0 ? (
                <div className="border border-ghost/20 bg-black/30 p-8 text-center">
                    <Ban size={32} className="mx-auto mb-3 text-gray-700" />
                    <p className="font-mono text-gray-600 text-sm">NO BLOCK LISTS CONFIGURED</p>
                    <p className="font-mono text-gray-700 text-xs mt-1">Block lists prevent specified commands from being used.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {blockLists.map(bl => {
                        const totalCmds = Object.values(bl.entries).reduce((sum, cmds) => sum + cmds.length, 0);
                        const isOpen = expanded === bl.name;
                        return (
                            <div key={bl.name} className="border border-ghost/20 bg-black/20">
                                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
                                    onClick={() => setExpanded(isOpen ? null : bl.name)}>
                                    <ChevronRight size={14} className={cn("text-gray-500 transition-transform", isOpen && "rotate-90")} />
                                    <Ban size={14} className="text-red-400" />
                                    <span className="text-white font-mono text-sm font-bold flex-1">{bl.name}</span>
                                    <span className="text-xs text-gray-500 font-mono">{totalCmds} blocked</span>
                                    <button onClick={e => { e.stopPropagation(); setEditList(bl); }}
                                        className="px-2 py-1 text-xs text-gray-500 hover:text-signal border border-ghost/20 hover:border-signal/30 transition-colors font-mono">
                                        EDIT
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); setConfirmDelete(bl.name); }}
                                        className="px-2 py-1 text-xs text-gray-500 hover:text-red-400 border border-ghost/20 hover:border-red-500/30 transition-colors font-mono">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                                <AnimatePresence>
                                    {isOpen && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden border-t border-ghost/10">
                                            <div className="p-4 space-y-3">
                                                {Object.entries(bl.entries).sort(([a],[b]) => a.localeCompare(b)).map(([pt, cmds]) => (
                                                    <div key={pt}>
                                                        <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-1.5">{pt}</p>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {cmds.sort((a,b) => a.command.cmd.localeCompare(b.command.cmd)).map(c => (
                                                                <span key={c.id} className="px-2 py-0.5 bg-red-900/20 border border-red-500/20 text-red-400 text-xs font-mono rounded">
                                                                    {c.command.cmd}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modals */}
            <AnimatePresence>
                {showCreate && (
                    <EditBlockListModal key="create-bl" onClose={() => setShowCreate(false)} onSubmit={handleSubmit} />
                )}
                {editList && (
                    <EditBlockListModal key={`edit-bl-${editList.name}`}
                        existingName={editList.name}
                        existingEntries={Object.fromEntries(Object.entries(editList.entries).map(([pt, cmds]) => [pt, cmds.map(c => c.command)]))}
                        onClose={() => setEditList(null)} onSubmit={handleSubmit} />
                )}
                {confirmDelete && (
                    <ConfirmModal key="confirm-delete-bl"
                        title="DELETE_BLOCK_LIST"
                        message={`Delete block list "${confirmDelete}" and all its entries?`}
                        confirmText="DELETE" isDestructive
                        onConfirm={() => { deleteList({ variables: { name: confirmDelete } }); setConfirmDelete(null); }}
                        onCancel={() => setConfirmDelete(null)} />
                )}
            </AnimatePresence>
        </div>
    );
}
