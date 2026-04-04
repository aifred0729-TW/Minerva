import React from 'react';
import { createPortal } from 'react-dom';
import type { Callback } from '../../types/callbacks';
import type { Node, Edge } from '@xyflow/react';
import {
    Terminal, Lock, Unlock, Eye, EyeOff, Edit, Info,
    GitBranch, X, ChevronRight, Plus, Zap, Link2, Trash2, Crosshair,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { snackActions } from '../../lib/snackbar';
import { getErrorMessage } from '../../lib/utils';

export interface NodeContextMenuState {
    x: number;
    y: number;
    callback: Callback;
}

export interface EdgeContextMenuState {
    x: number;
    y: number;
    edge: any;
}

export interface PaneContextMenuState {
    x: number;
    y: number;
}

export interface GraphContextMenusProps {
    contextMenu: NodeContextMenuState | null;
    setContextMenu: React.Dispatch<React.SetStateAction<NodeContextMenuState | null>>;
    edgeContextMenu: EdgeContextMenuState | null;
    setEdgeContextMenu: React.Dispatch<React.SetStateAction<EdgeContextMenuState | null>>;
    paneContextMenu: PaneContextMenuState | null;
    setPaneContextMenu: React.Dispatch<React.SetStateAction<PaneContextMenuState | null>>;
    linkFocusNodeId: string | null;
    edgesData: any;
    setEdges: React.Dispatch<React.SetStateAction<Edge<Record<string, unknown>>[]>>;
    setNodes: React.Dispatch<React.SetStateAction<Node<Record<string, unknown>>[]>>;
    removeEdgeMutation: (opts: { variables: { edge_id: number } }) => Promise<any>;
    // Node context menu actions
    onEditCustomNode: (node: any) => void;
    onClearLinkFocus: () => void;
    onSetLinkFocus: (id: string, label: string) => void;
    onSetParent: (callback: Callback) => void;
    getParentEdge: (id: number | string) => any;
    onDisconnectParent: (callback: Callback) => void;
    onDeleteCustomNode: (node: any) => void;
    onNavigateConsole: (displayId: number) => void;
    onOpenDetails: (callback: Callback) => void;
    onEditDescription: (callback: Callback) => void;
    onLockToggle: (callback: Callback) => void;
    onHide: (callback: Callback) => void;
    onTaskForEdge: (callback: any, callbackId: number) => void;
    onRemoveEdge: (callback: any) => void;
    onAddP2PEdge: (callback: any) => void;
    onTriggerEventing: (callback: Callback) => void;
}

export function GraphContextMenus({
    contextMenu, setContextMenu,
    edgeContextMenu, setEdgeContextMenu,
    paneContextMenu, setPaneContextMenu,
    linkFocusNodeId, edgesData,
    setEdges, setNodes, removeEdgeMutation,
    onEditCustomNode, onClearLinkFocus, onSetLinkFocus,
    onSetParent, getParentEdge, onDisconnectParent, onDeleteCustomNode,
    onNavigateConsole, onOpenDetails, onEditDescription,
    onLockToggle, onHide,
    onTaskForEdge, onRemoveEdge, onAddP2PEdge, onTriggerEventing,
}: GraphContextMenusProps) {
    return (
        <>
            {/* Node Context Menu Portal */}
            {contextMenu && createPortal(
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="fixed z-[9999] bg-black/95 border border-signal/40 shadow-lg shadow-signal/20 w-56 backdrop-blur-xl"
                    style={{ 
                        top: contextMenu.y, 
                        left: contextMenu.x,
                        transform: contextMenu.x > window.innerWidth - 250 ? 'translateX(-100%)' : 'none'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-3 py-2 border-b border-signal/20 flex items-center justify-between">
                        <span className="text-xs font-mono text-signal font-bold">
                            {contextMenu.callback.isCustom ? 'CUSTOM_NODE_' : 'CALLBACK_'}{contextMenu.callback.display_id}
                        </span>
                        {contextMenu.callback.locked && (
                            <Lock size={12} className="text-red-500" />
                        )}
                    </div>

                    <div className="p-1 flex flex-col">
                        {contextMenu.callback.isCustom ? (
                            /* Custom Node Options */
                            <>
                                <button 
                                    onClick={() => onEditCustomNode(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-signal/10 text-xs text-left text-gray-300 hover:text-signal transition-colors group"
                                >
                                    <Edit size={14} className="text-gray-500 group-hover:text-signal" /> 
                                    <span>Edit Node</span>
                                </button>

                                <div className="h-px bg-white/10 my-1" />

                                {linkFocusNodeId === String(contextMenu.callback.id) ? (
                                    <button
                                        onClick={() => { onClearLinkFocus(); setContextMenu(null); }}
                                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-amber-900/30 text-xs text-left text-amber-400 hover:text-amber-300 transition-colors group"
                                    >
                                        <Crosshair size={14} className="text-amber-400" />
                                        <span>Clear Link Focus</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => {
                                            onSetLinkFocus(String(contextMenu.callback.id), contextMenu.callback.host || contextMenu.callback.description || `Node ${contextMenu.callback.display_id}`);
                                            setContextMenu(null);
                                        }}
                                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-amber-900/20 text-xs text-left text-amber-500/80 hover:text-amber-400 transition-colors group"
                                    >
                                        <Crosshair size={14} className="text-amber-500/80" />
                                        <span>Set as Link Focus</span>
                                    </button>
                                )}

                                <button 
                                    onClick={() => onSetParent(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-900/30 text-xs text-left text-blue-400 hover:text-blue-300 transition-colors group"
                                >
                                    <GitBranch size={14} className="text-blue-500" /> 
                                    <span>Link to Parent</span>
                                </button>

                                {getParentEdge(contextMenu.callback.id) && (
                                    <button 
                                        onClick={() => onDisconnectParent(contextMenu.callback)} 
                                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-orange-900/30 text-xs text-left text-orange-400 hover:text-orange-300 transition-colors group"
                                    >
                                        <X size={14} className="text-orange-500" /> 
                                        <span>Disconnect from Parent</span>
                                    </button>
                                )}

                                <div className="h-px bg-white/10 my-1" />

                                <button 
                                    onClick={() => onDeleteCustomNode(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-red-900/30 text-xs text-left text-red-400 hover:text-red-300 transition-colors group"
                                >
                                    <X size={14} className="text-red-500" /> 
                                    <span>Delete Node</span>
                                </button>
                            </>
                        ) : (
                            /* Regular Callback Options */
                            <>
                                <button
                                    onClick={() => { onNavigateConsole(contextMenu.callback.display_id); setContextMenu(null); }}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-signal/10 text-xs text-left text-signal hover:text-white transition-colors group font-semibold"
                                >
                                    <Terminal size={14} className="text-signal" />
                                    <span>Interact (Console)</span>
                                </button>

                                <div className="h-px bg-white/10 my-1" />

                                <button 
                                    onClick={() => onOpenDetails(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-signal/10 text-xs text-left text-gray-300 hover:text-signal transition-colors group"
                                >
                                    <Info size={14} className="text-gray-500 group-hover:text-signal" /> 
                                    <span>View Details</span>
                                    <ChevronRight size={12} className="ml-auto text-gray-600" />
                                </button>

                                <button 
                                    onClick={() => onEditDescription(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-signal/10 text-xs text-left text-gray-300 hover:text-signal transition-colors group"
                                >
                                    <Edit size={14} className="text-gray-500 group-hover:text-signal" /> 
                                    <span>Edit Description</span>
                                </button>

                                <button 
                                    onClick={() => onLockToggle(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-signal/10 text-xs text-left text-gray-300 hover:text-signal transition-colors group"
                                >
                                    {contextMenu.callback.locked ? (
                                        <>
                                            <Unlock size={14} className="text-gray-500 group-hover:text-signal" /> 
                                            <span>Unlock Callback</span>
                                        </>
                                    ) : (
                                        <>
                                            <Lock size={14} className="text-gray-500 group-hover:text-signal" /> 
                                            <span>Lock Callback</span>
                                        </>
                                    )}
                                </button>

                                <div className="h-px bg-white/10 my-1" />

                                {linkFocusNodeId === String(contextMenu.callback.id) ? (
                                    <button
                                        onClick={() => { onClearLinkFocus(); setContextMenu(null); }}
                                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-amber-900/30 text-xs text-left text-amber-400 hover:text-amber-300 transition-colors group"
                                    >
                                        <Crosshair size={14} className="text-amber-400" />
                                        <span>Clear Link Focus</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => {
                                            onSetLinkFocus(String(contextMenu.callback.id), contextMenu.callback.host || `#${contextMenu.callback.display_id}`);
                                            setContextMenu(null);
                                        }}
                                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-amber-900/20 text-xs text-left text-amber-500/80 hover:text-amber-400 transition-colors group"
                                    >
                                        <Crosshair size={14} className="text-amber-500/80" />
                                        <span>Set as Link Focus</span>
                                    </button>
                                )}

                                <button 
                                    onClick={() => onSetParent(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-900/30 text-xs text-left text-blue-400 hover:text-blue-300 transition-colors group"
                                >
                                    <GitBranch size={14} className="text-blue-500" /> 
                                    <span>Link to Parent</span>
                                </button>

                                {getParentEdge(contextMenu.callback.id) && (
                                    <button 
                                        onClick={() => onDisconnectParent(contextMenu.callback)} 
                                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-orange-900/30 text-xs text-left text-orange-400 hover:text-orange-300 transition-colors group"
                                    >
                                        <X size={14} className="text-orange-500" /> 
                                        <span>Disconnect from Parent</span>
                                    </button>
                                )}

                                <div className="h-px bg-white/10 my-1" />

                                <button 
                                    onClick={() => onHide(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-red-900/30 text-xs text-left text-red-400 hover:text-red-300 transition-colors group"
                                >
                                    <EyeOff size={14} className="text-red-500" /> 
                                    <span>Hide Callback</span>
                                </button>

                                <div className="h-px bg-white/10 my-1" />

                                <button
                                    onClick={() => {
                                        onTaskForEdge(contextMenu.callback, contextMenu.callback.callback_id ?? 0);
                                        setContextMenu(null);
                                    }}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-900/30 text-xs text-left text-blue-400 hover:text-blue-300 transition-colors group"
                                >
                                    <Link2 size={14} className="text-blue-400" />
                                    <span>Task for Edge</span>
                                </button>

                                <button
                                    onClick={() => onRemoveEdge(contextMenu.callback)}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-orange-900/30 text-xs text-left text-orange-400 hover:text-orange-300 transition-colors group"
                                >
                                    <Trash2 size={14} className="text-orange-500" />
                                    <span>Remove Edge</span>
                                </button>

                                <button
                                    onClick={() => {
                                        onAddP2PEdge(contextMenu.callback);
                                        setContextMenu(null);
                                    }}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-cyan-900/30 text-xs text-left text-cyan-400 hover:text-cyan-300 transition-colors group"
                                >
                                    <Plus size={14} className="text-cyan-500" />
                                    <span>Add P2P Edge</span>
                                </button>

                                <div className="h-px bg-white/10 my-1" />

                                <button
                                    onClick={() => {
                                        onTriggerEventing(contextMenu.callback);
                                        setContextMenu(null);
                                    }}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-purple-900/30 text-xs text-left text-purple-400 hover:text-purple-300 transition-colors group"
                                >
                                    <Zap size={14} className="text-purple-400" />
                                    <span>Trigger Eventing</span>
                                </button>
                            </>
                        )}
                    </div>
                </motion.div>,
                document.body
            )}

            {/* Edge Context Menu */}
            {edgeContextMenu && createPortal(
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.1 }}
                    className="fixed z-[9999] bg-black/95 border border-white/20 w-44 backdrop-blur-xl rounded shadow-2xl overflow-hidden"
                    style={{ top: edgeContextMenu.y, left: edgeContextMenu.x }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-1">
                        {edgeContextMenu.edge.id?.startsWith('e') && !edgeContextMenu.edge.id?.startsWith('edge-') && (() => {
                            const parts = edgeContextMenu.edge.id.replace(/^e/, '').split('-');
                            const destId = Number(parts[0]);
                            const srcId = Number(parts[1]);
                            const dbEdge = edgesData?.callbackgraphedge?.find((e: any) =>
                                !e.end_timestamp && e.destination?.id === destId && e.source?.id === srcId
                            );
                            if (!dbEdge) return null;
                            return (
                                <button
                                    key="remove"
                                    onClick={async () => {
                                        try {
                                            await removeEdgeMutation({ variables: { edge_id: dbEdge.id } });
                                            snackActions.success('Edge removed');
                                        } catch (err: unknown) {
                                            snackActions.error('Failed: ' + getErrorMessage(err));
                                        }
                                        setEdgeContextMenu(null);
                                    }}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-orange-900/30 text-xs text-left text-orange-400 hover:text-orange-300 transition-colors w-full rounded"
                                >
                                    <Trash2 size={13} className="text-orange-500" />
                                    <span>Remove Edge</span>
                                </button>
                            );
                        })()}
                        <button
                            onClick={() => {
                                setEdges(eds => eds.filter(e => e.id !== edgeContextMenu.edge.id));
                                setEdgeContextMenu(null);
                            }}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-signal/10 text-xs text-left text-gray-300 hover:text-signal transition-colors w-full rounded"
                        >
                            <EyeOff size={13} className="text-gray-500" />
                            <span>Hide Edge (local)</span>
                        </button>
                    </div>
                </motion.div>,
                document.body
            )}

            {/* Pane Context Menu */}
            {paneContextMenu && createPortal(
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.1 }}
                    className="fixed z-[9999] bg-black/95 border border-white/20 w-44 backdrop-blur-xl rounded shadow-2xl overflow-hidden"
                    style={{ top: paneContextMenu.y, left: paneContextMenu.x }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-1">
                        <button
                            onClick={() => {
                                setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, isDimmed: false } })));
                                setPaneContextMenu(null);
                            }}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-signal/10 text-xs text-left text-gray-300 hover:text-signal transition-colors w-full rounded"
                        >
                            <Eye size={13} className="text-gray-500" />
                            <span>Unselect All</span>
                        </button>
                    </div>
                </motion.div>,
                document.body
            )}
        </>
    );
}
