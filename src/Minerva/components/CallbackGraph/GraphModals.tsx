import React from 'react';
import { createPortal } from 'react-dom';
import type { Callback } from '../../types/callbacks';
import { AnimatePresence, motion } from 'framer-motion';
import { CyberModal } from '../CyberModal';
import { MythicDialog } from '../MythicDialog';
import { EventTriggerContextSelectDialog } from '../EventTriggerContextSelect';
import { getErrorMessage, parseFirstIP, cn, isCallbackAlive } from '../../lib/utils';
import {
    PANEL_CHAMFER, TILE_CHAMFER,
    CornerTicks, Section, SelectableTile, ChamferedToggle, ActionButton, StatusPill, EmptyTile,
} from '../LinkPanel/linkPanelParts';
import { snackActions } from '../../lib/snackbar';
import {
    Edit, Plus, Share2, GitBranch, Network, Info, Terminal,
    Shield, Lock, Monitor, Link2, Zap, Trash2, X,
    Box, Cpu, Skull, Target, Tag, Send, ChevronRight, Radio, Crosshair,
} from 'lucide-react';

export interface CustomNodeFormData {
    host: string; os: string; ip: string; architecture: string; user: string; description: string;
}

export interface GraphModalsProps {
    // Edit Description
    editDescriptionModal: Callback | null;
    setEditDescriptionModal: (v: Callback | null) => void;
    newDescription: string;
    setNewDescription: (v: string) => void;
    handleSaveDescription: () => void;
    // Create Custom Node
    showCustomNodeModal: boolean;
    setShowCustomNodeModal: (v: boolean) => void;
    customNodeForm: CustomNodeFormData;
    setCustomNodeForm: (v: CustomNodeFormData) => void;
    handleCreateCustomNode: () => void;
    // Edit Custom Node
    editCustomNodeModal: Callback | null;
    setEditCustomNodeModal: (v: Callback | null) => void;
    handleUpdateCustomNode: () => void;
    // Export/Import
    showExportImportModal: boolean;
    setShowExportImportModal: (v: boolean) => void;
    exportData: string;
    importData: string;
    setImportData: (v: string) => void;
    customNodesCount: number;
    customEdgesCount: number;
    handleCopyExportData: () => void;
    handleImportCustomNodes: () => void;
    // Set Parent
    setParentModal: Callback | null;
    setSetParentModal: (v: Callback | null) => void;
    setParentAnchor: { flowX: number; flowY: number; width: number; height: number } | null;
    setSetParentAnchor: (v: { flowX: number; flowY: number; width: number; height: number } | null) => void;
    /** Live ReactFlow viewport (updated on pan/zoom) so flow-anchored panels stay attached. */
    liveViewport: { x: number; y: number; zoom: number };
    selectedDestination: Callback | null;
    setSelectedDestination: (v: Callback | null) => void;
    selectedProfile: any;
    setSelectedProfile: (v: any) => void;
    isP2PConnection: boolean;
    setIsP2PConnection: (v: boolean) => void;
    edgeLabel: string;
    setEdgeLabel: (v: string) => void;
    filteredCallbacksForParent: Callback[];
    p2pData: any;
    allC2Data: any;
    handleSetParent: () => void;
    // Details
    detailsModal: Callback | null;
    setDetailsModal: (v: Callback | null) => void;
    openEditCustomNode: (node: Callback) => void;
    // Task for Edge
    taskForEdgeModal: any;
    setTaskForEdgeModal: (v: any) => void;
    taskForEdgeCommand: any;
    setTaskForEdgeCommand: (v: any) => void;
    taskForEdgeParams: string;
    setTaskForEdgeParams: (v: string) => void;
    taskingForEdge: boolean;
    setTaskingForEdge: (v: boolean) => void;
    linkCommandsData: any;
    linkCommandsLoading: boolean;
    createTask: (opts: { variables: Record<string, unknown> }) => Promise<any>;
    // Eventing
    showEventingDialog: any;
    setShowEventingDialog: (v: any) => void;
    // Remove Edge / Manually Add Edge
    manuallyAddEdgeModal: any;
    setManuallyAddEdgeModal: (v: any) => void;
    addEdgeSelectedProfile: any;
    setAddEdgeSelectedProfile: (v: any) => void;
    addEdgeSelectedDest: Callback | null;
    setAddEdgeSelectedDest: (v: Callback | null) => void;
    addEdgeDestOptions: Callback[];
    setAddEdgeDestOptions: (v: Callback[]) => void;
    handleManuallyAddEdge: () => void;
    removeEdgeModal: any[] | null;
    setRemoveEdgeModal: (v: any[] | null) => void;
    removeEdge: (opts: { variables: Record<string, unknown> }) => Promise<any>;
}

export const GraphModals = (props: GraphModalsProps) => {
    const {
        editDescriptionModal, setEditDescriptionModal, newDescription, setNewDescription, handleSaveDescription,
        showCustomNodeModal, setShowCustomNodeModal, customNodeForm, setCustomNodeForm, handleCreateCustomNode,
        editCustomNodeModal, setEditCustomNodeModal, handleUpdateCustomNode,
        showExportImportModal, setShowExportImportModal, exportData, importData, setImportData,
        customNodesCount, customEdgesCount, handleCopyExportData, handleImportCustomNodes,
        setParentModal, setSetParentModal, setParentAnchor, setSetParentAnchor, liveViewport,
        selectedDestination, setSelectedDestination,
        selectedProfile, setSelectedProfile, isP2PConnection, setIsP2PConnection,
        edgeLabel, setEdgeLabel, filteredCallbacksForParent, p2pData, allC2Data, handleSetParent,
        detailsModal, setDetailsModal, openEditCustomNode,
        taskForEdgeModal, setTaskForEdgeModal, taskForEdgeCommand, setTaskForEdgeCommand,
        taskForEdgeParams, setTaskForEdgeParams, taskingForEdge, setTaskingForEdge,
        linkCommandsData, linkCommandsLoading, createTask,
        showEventingDialog, setShowEventingDialog,
        manuallyAddEdgeModal, setManuallyAddEdgeModal,
        addEdgeSelectedProfile, setAddEdgeSelectedProfile,
        addEdgeSelectedDest, setAddEdgeSelectedDest,
        addEdgeDestOptions, setAddEdgeDestOptions, handleManuallyAddEdge,
        removeEdgeModal, setRemoveEdgeModal, removeEdge,
    } = props;

    return (
        <>
            {/* Edit Description Modal */}
            <AnimatePresence>
                {editDescriptionModal && (
                    <CyberModal title="EDIT_DESCRIPTION" onClose={() => setEditDescriptionModal(null)} icon={<Edit />}>
                        <div className="space-y-4">
                            <div className="text-xs text-gray-400 font-mono mb-2">
                                Callback #{editDescriptionModal.display_id} - {editDescriptionModal.host}
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">DESCRIPTION</label>
                                <input type="text" value={newDescription} onChange={(e) => setNewDescription(e.target.value)}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono" autoFocus />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setEditDescriptionModal(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                <button onClick={handleSaveDescription} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">SAVE</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Custom Node Modal */}
            <AnimatePresence>
                {showCustomNodeModal && (
                    <CyberModal title="CREATE_CUSTOM_NODE" onClose={() => setShowCustomNodeModal(false)} icon={<Plus />}>
                        <CustomNodeFormFields form={customNodeForm} setForm={setCustomNodeForm} />
                        <div className="flex justify-end gap-3 pt-4">
                            <button onClick={() => setShowCustomNodeModal(false)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                            <button onClick={handleCreateCustomNode} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">CREATE</button>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Edit Custom Node Modal */}
            <AnimatePresence>
                {editCustomNodeModal && (
                    <CyberModal title="EDIT_CUSTOM_NODE" onClose={() => setEditCustomNodeModal(null)} icon={<Edit />}>
                        <div className="text-xs text-gray-400 mb-4">
                            Edit custom node #{editCustomNodeModal.display_id} - {editCustomNodeModal.host}
                        </div>
                        <CustomNodeFormFields form={customNodeForm} setForm={setCustomNodeForm} />
                        <div className="flex justify-end gap-3 pt-4">
                            <button onClick={() => setEditCustomNodeModal(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                            <button onClick={handleUpdateCustomNode} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">UPDATE</button>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Export/Import Custom Nodes Modal */}
            <AnimatePresence>
                {showExportImportModal && (
                    <CyberModal title="SHARE_CUSTOM_NODES" onClose={() => { setShowExportImportModal(false); setImportData(''); }} icon={<Share2 />}>
                        <div className="space-y-4">
                            <div className="text-xs text-gray-400 mb-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded">
                                <div className="flex items-start gap-2">
                                    <Info size={14} className="text-cyan-400 mt-0.5 shrink-0" />
                                    <div>
                                        <div className="font-bold text-cyan-400 mb-1">GraphQL Server Storage</div>
                                        <div>Custom nodes are stored on the Mythic server and synchronized in real-time across all clients. Export for backup or migration purposes.</div>
                                    </div>
                                </div>
                            </div>
                            <div className="border-t border-gray-800 pt-4">
                                <label className="block text-xs font-mono text-gray-500 mb-2 flex items-center gap-2">
                                    <span>EXPORT_DATA</span>
                                    <span className="text-[11px] text-gray-600">({customNodesCount} nodes, {customEdgesCount} edges)</span>
                                </label>
                                <textarea value={exportData} readOnly rows={8} className="w-full bg-black/50 border border-gray-700 p-2 text-signal font-mono text-xs resize-none" placeholder="Export data will appear here..." />
                                <button onClick={handleCopyExportData} className="w-full mt-2 px-4 py-2 bg-purple-500/20 border border-purple-500/50 text-purple-400 hover:bg-purple-500/30 font-mono text-sm transition-colors">COPY_TO_CLIPBOARD</button>
                            </div>
                            <div className="border-t border-gray-800 pt-4">
                                <label className="block text-xs font-mono text-gray-500 mb-2">IMPORT_DATA</label>
                                <textarea value={importData} onChange={(e) => setImportData(e.target.value)} rows={8} placeholder="Paste exported data here..." className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-xs resize-none" />
                                <button onClick={handleImportCustomNodes} disabled={!importData.trim()} className="w-full mt-2 px-4 py-2 bg-signal/20 border border-signal/50 text-signal hover:bg-signal/30 font-mono text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">IMPORT_NODES</button>
                            </div>
                            <div className="flex justify-end pt-2">
                                <button onClick={() => { setShowExportImportModal(false); setImportData(''); }} className="px-6 py-2 text-gray-400 hover:text-white font-mono text-sm">CLOSE</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Link-to-Parent Side Panel — anchored to the right of the right-clicked node */}
            <LinkToParentPanel
                source={setParentModal}
                anchor={setParentAnchor}
                viewport={liveViewport}
                onClose={() => { setSetParentModal(null); setSetParentAnchor(null); }}
                selectedDestination={selectedDestination as any}
                setSelectedDestination={setSelectedDestination}
                selectedProfile={selectedProfile}
                setSelectedProfile={setSelectedProfile}
                isP2PConnection={isP2PConnection}
                setIsP2PConnection={setIsP2PConnection}
                edgeLabel={edgeLabel}
                setEdgeLabel={setEdgeLabel}
                filteredCallbacksForParent={filteredCallbacksForParent}
                p2pData={p2pData}
                allC2Data={allC2Data}
                handleSetParent={handleSetParent}
            />

            {/* Details Modal */}
            <AnimatePresence>
                {detailsModal && (
                    <CyberModal title={detailsModal.isCustom ? "CUSTOM_NODE_DETAILS" : "CALLBACK_DETAILS"} onClose={() => setDetailsModal(null)} icon={<Info />}>
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 p-3 bg-black/30 border border-gray-800">
                                <div className={`p-2 border ${detailsModal.isCustom ? 'border-cyan-500 bg-cyan-500/10' : (detailsModal.integrity_level > 2 ? 'border-yellow-500 bg-yellow-500/10' : 'border-signal bg-signal/10')}`}>
                                    <Terminal size={20} className={detailsModal.isCustom ? 'text-cyan-500' : (detailsModal.integrity_level > 2 ? 'text-yellow-500' : 'text-signal')} />
                                </div>
                                <div>
                                    <div className="text-lg font-bold text-white font-mono">
                                        {detailsModal.isCustom ? 'CUSTOM_NODE' : 'CALLBACK'} #{detailsModal.display_id}
                                        {detailsModal.locked && <Lock size={14} className="inline ml-2 text-red-500" />}
                                    </div>
                                    <div className="text-xs text-gray-500">{detailsModal.host}</div>
                                </div>
                                {!detailsModal.isCustom && detailsModal.integrity_level > 2 && (
                                    <div className="ml-auto flex items-center gap-1 px-2 py-1 bg-yellow-500/20 border border-yellow-500/50">
                                        <Shield size={12} className="text-yellow-500" /><span className="text-xs font-bold text-yellow-500">ADMIN</span>
                                    </div>
                                )}
                                {detailsModal.isCustom && (
                                    <div className="ml-auto flex items-center gap-1 px-2 py-1 bg-cyan-500/20 border border-cyan-500/50">
                                        <span className="text-xs font-bold text-cyan-400">CUSTOM</span>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                                <div className="space-y-1"><div className="text-gray-500">USER</div><div className="text-white">{detailsModal.user}</div></div>
                                {!detailsModal.isCustom && <div className="space-y-1"><div className="text-gray-500">DOMAIN</div><div className="text-white">{detailsModal.domain || 'N/A'}</div></div>}
                                <div className="space-y-1"><div className="text-gray-500">IP_ADDRESS</div><div className="text-white">{detailsModal.ip}</div></div>
                                {!detailsModal.isCustom && <div className="space-y-1"><div className="text-gray-500">PID</div><div className="text-white">{detailsModal.pid}</div></div>}
                                <div className="space-y-1"><div className="text-gray-500">OS</div><div className="text-white">{detailsModal.os}</div></div>
                                <div className="space-y-1"><div className="text-gray-500">ARCHITECTURE</div><div className="text-white">{detailsModal.architecture}</div></div>
                                {!detailsModal.isCustom && (
                                    <>
                                        <div className="space-y-1"><div className="text-gray-500">AGENT</div><div className="text-white uppercase">{detailsModal.payloadType}</div></div>
                                        <div className="space-y-1"><div className="text-gray-500">INTEGRITY</div><div className={detailsModal.integrity_level > 2 ? 'text-yellow-500' : 'text-white'}>Level {detailsModal.integrity_level}</div></div>
                                    </>
                                )}
                            </div>
                            {!detailsModal.isCustom && detailsModal.sleep_info && (
                                <div className="p-3 bg-black/30 border border-gray-800">
                                    <div className="text-xs font-mono text-gray-500 mb-1">SLEEP_INFO</div>
                                    <div className="text-sm font-mono text-signal">{detailsModal.sleep_info}</div>
                                </div>
                            )}
                            <div className="p-3 bg-black/30 border border-gray-800">
                                <div className="text-xs font-mono text-gray-500 mb-1">DESCRIPTION</div>
                                <div className="text-sm text-gray-300 italic">{detailsModal.description || 'No description set'}</div>
                            </div>
                            {detailsModal.isCustom && (
                                <button onClick={() => { openEditCustomNode(detailsModal); setDetailsModal(null); }}
                                    className="w-full px-4 py-2 bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30 font-mono text-sm transition-colors">EDIT_NODE</button>
                            )}
                            <div className="flex justify-end">
                                <button onClick={() => setDetailsModal(null)} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">CLOSE</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Task for Edge Modal */}
            <AnimatePresence>
                {taskForEdgeModal && (
                    <CyberModal title="TASK_FOR_EDGE" onClose={() => { setTaskForEdgeModal(null); setTaskForEdgeCommand(null); setTaskForEdgeParams(''); }} icon={<Link2 />}>
                        <div className="space-y-4 min-w-[380px]">
                            <div className="text-xs text-gray-400 font-mono">Callback #{taskForEdgeModal.display_id} — {taskForEdgeModal.host}</div>
                            {linkCommandsLoading && <div className="text-signal text-xs font-mono animate-pulse">LOADING_COMMANDS...</div>}
                            {!linkCommandsLoading && (linkCommandsData?.loadedcommands?.length ?? 0) === 0 && <div className="text-gray-500 text-xs font-mono">No link commands loaded on this callback.</div>}
                            {!linkCommandsLoading && (linkCommandsData?.loadedcommands?.length ?? 0) > 0 && (
                                <div className="space-y-2">
                                    <div className="text-xs font-mono text-gray-400">SELECT_COMMAND</div>
                                    {linkCommandsData!.loadedcommands.map((lc: any) => (
                                        <button key={lc.command.id} onClick={() => { setTaskForEdgeCommand(lc.command); setTaskForEdgeParams(''); }}
                                            className={`w-full flex items-center gap-2 px-3 py-2 border rounded text-xs font-mono text-left transition-colors ${taskForEdgeCommand?.id === lc.command.id ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-400 hover:border-signal/40 hover:text-signal/70'}`}>
                                            <Zap size={12} /><span className="font-bold">{lc.command.cmd}</span>
                                            {lc.command.description && <span className="text-gray-600 truncate">— {lc.command.description}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {taskForEdgeCommand && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-mono text-gray-400">PARAMS (JSON or raw)</label>
                                    <textarea value={taskForEdgeParams} onChange={e => setTaskForEdgeParams(e.target.value)} rows={3} placeholder='{}'
                                        className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-xs resize-none" />
                                </div>
                            )}
                            <div className="flex justify-end gap-3">
                                <button onClick={() => { setTaskForEdgeModal(null); setTaskForEdgeCommand(null); setTaskForEdgeParams(''); }} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                <button disabled={!taskForEdgeCommand || taskingForEdge}
                                    onClick={async () => {
                                        if (!taskForEdgeCommand) return;
                                        setTaskingForEdge(true);
                                        try {
                                            await createTask({ variables: { callback_id: taskForEdgeModal.callback_id, command: taskForEdgeCommand.cmd, params: taskForEdgeParams || '{}', token_id: 0 } });
                                            snackActions.success(`Tasked: ${taskForEdgeCommand.cmd}`);
                                            setTaskForEdgeModal(null); setTaskForEdgeCommand(null); setTaskForEdgeParams('');
                                        } catch (e: unknown) { snackActions.error('Task failed: ' + getErrorMessage(e)); }
                                        finally { setTaskingForEdge(false); }
                                    }}
                                    className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                    {taskingForEdge ? 'TASKING...' : 'TASK'}
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Eventing Dialog */}
            {showEventingDialog && (
                <MythicDialog fullWidth={true} maxWidth="xl" open={!!showEventingDialog} onClose={() => setShowEventingDialog(null)}
                    innerDialog={<EventTriggerContextSelectDialog onClose={() => setShowEventingDialog(null)} triggerContext={{ name: 'callback_id', value: showEventingDialog.id }} />} />
            )}

            {/* Remove Edge / Manually Add P2P Edge */}
            <AnimatePresence>
                {manuallyAddEdgeModal && (
                    <CyberModal title="ADD_P2P_EDGE" onClose={() => { setManuallyAddEdgeModal(null); setAddEdgeSelectedProfile(null); setAddEdgeSelectedDest(null); setAddEdgeDestOptions([]); }} icon={<Plus />}>
                        <div className="space-y-4 min-w-[380px]">
                            <p className="text-xs text-gray-400 font-mono">
                                Source: <span className="text-signal">#{manuallyAddEdgeModal.display_id ?? manuallyAddEdgeModal.callback_id}</span>
                                {manuallyAddEdgeModal.host && <span className="text-gray-500 ml-2">({manuallyAddEdgeModal.host})</span>}
                            </p>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">P2P_PROFILE</label>
                                <div className="grid gap-2 max-h-32 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                    {p2pData?.c2profile?.map((profile: any) => (
                                        <button key={profile.id} onClick={() => {
                                            setAddEdgeSelectedProfile(profile); setAddEdgeSelectedDest(null);
                                            const srcId = manuallyAddEdgeModal.id ?? manuallyAddEdgeModal.callback_id;
                                            const dests = (profile.callbackc2profiles || []).map((cp: { callback: Callback }) => cp.callback).filter((c: Callback) => c && c.id !== srcId);
                                            setAddEdgeDestOptions(dests);
                                        }}
                                            className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${addEdgeSelectedProfile?.id === profile.id ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                                            <GitBranch size={14} /><span>{profile.name}</span>
                                            <span className="ml-auto text-[11px] text-cyan-600 uppercase border border-cyan-800 px-1">P2P</span>
                                        </button>
                                    ))}
                                    {(!p2pData?.c2profile || p2pData.c2profile.length === 0) && <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_P2P_PROFILES_AVAILABLE</div>}
                                </div>
                            </div>
                            {addEdgeSelectedProfile && (
                                <div>
                                    <label className="block text-xs font-mono text-gray-500 mb-2">DESTINATION_CALLBACK</label>
                                    <div className="grid gap-2 max-h-32 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                        {addEdgeDestOptions.map((cb: Callback) => (
                                            <button key={cb.id} onClick={() => setAddEdgeSelectedDest(cb)}
                                                className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${addEdgeSelectedDest?.id === cb.id ? 'border-signal bg-signal/10 text-signal' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                                                <Monitor size={14} /><span>#{cb.display_id}</span>
                                                {cb.description && <span className="text-gray-500 ml-1 truncate max-w-[140px]">{cb.description}</span>}
                                            </button>
                                        ))}
                                        {addEdgeDestOptions.length === 0 && <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_CALLBACKS_WITH_PROFILE</div>}
                                    </div>
                                </div>
                            )}
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => { setManuallyAddEdgeModal(null); setAddEdgeSelectedProfile(null); setAddEdgeSelectedDest(null); setAddEdgeDestOptions([]); }}
                                    className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs">CANCEL</button>
                                <button onClick={handleManuallyAddEdge} disabled={!addEdgeSelectedProfile || !addEdgeSelectedDest}
                                    className="px-4 py-2 border border-signal/50 bg-signal/10 text-signal hover:bg-signal/20 hover:border-signal font-mono text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-colors">CONFIRM_EDGE</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
                {removeEdgeModal && (
                    <CyberModal title="REMOVE_EDGE" onClose={() => setRemoveEdgeModal(null)} icon={<Trash2 />}>
                        <div className="space-y-3 min-w-[340px]">
                            <p className="text-xs text-gray-400 font-mono mb-2">Select an active edge to remove:</p>
                            {removeEdgeModal.map((e: any) => (
                                <button key={e.id} onClick={async () => {
                                    try { await removeEdge({ variables: { edge_id: e.id } }); snackActions.success('Edge removed'); }
                                    catch (err: unknown) { snackActions.error('Failed: ' + getErrorMessage(err)); }
                                    setRemoveEdgeModal(null);
                                }}
                                    className="w-full flex items-center gap-3 px-3 py-2 border border-white/10 hover:border-orange-500/40 rounded text-xs font-mono text-left text-gray-300 hover:text-orange-300 hover:bg-orange-900/20 transition-colors">
                                    <Trash2 size={12} className="text-orange-500 shrink-0" />
                                    <span>#{e.source?.display_id} → #{e.destination?.display_id}{e.c2profile?.name && <span className="text-gray-500 ml-2">[{e.c2profile.name}]</span>}</span>
                                </button>
                            ))}
                            <div className="flex justify-end pt-2">
                                <button onClick={() => setRemoveEdgeModal(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>
        </>
    );
};

/** Shared form fields for create/edit custom node */
const CustomNodeFormFields = ({ form, setForm }: { form: CustomNodeFormData; setForm: (f: CustomNodeFormData) => void }) => (
    <div className="space-y-4">
        <div>
            <label className="block text-xs font-mono text-gray-500 mb-1">HOSTNAME *</label>
            <input type="text" value={form.host} onChange={(e) => setForm({...form, host: e.target.value})} placeholder="TARGET-PC-01"
                className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm" />
        </div>
        <div>
            <label className="block text-xs font-mono text-gray-500 mb-1">OPERATING SYSTEM *</label>
            <select value={form.os} onChange={(e) => setForm({...form, os: e.target.value})}
                className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm">
                <option value="Windows">Windows</option><option value="Linux">Linux</option><option value="macOS">macOS</option><option value="Unknown">Unknown</option>
            </select>
        </div>
        <div>
            <label className="block text-xs font-mono text-gray-500 mb-1">IP ADDRESS *</label>
            <input type="text" value={form.ip} onChange={(e) => setForm({...form, ip: e.target.value})} placeholder="192.168.1.100"
                className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm" />
        </div>
        <div>
            <label className="block text-xs font-mono text-gray-500 mb-1">ARCHITECTURE</label>
            <select value={form.architecture} onChange={(e) => setForm({...form, architecture: e.target.value})}
                className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm">
                <option value="x64">x64</option><option value="x86">x86</option><option value="arm64">ARM64</option>
            </select>
        </div>
        <div>
            <label className="block text-xs font-mono text-gray-500 mb-1">USER</label>
            <input type="text" value={form.user} onChange={(e) => setForm({...form, user: e.target.value})} placeholder="Administrator"
                className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm" />
        </div>
        <div>
            <label className="block text-xs font-mono text-gray-500 mb-1">DESCRIPTION</label>
            <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="Target system details..." rows={3}
                className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm resize-none" />
        </div>
    </div>
);

/* ============================================================================
 * LinkToParentPanel
 * ----------------------------------------------------------------------------
 * Cyberpunk 2077 style inline side panel that slides out to the right of the
 * right-clicked node. NOT a modal — no scrim, no backdrop blur, the graph stays
 * fully interactive while the panel is open. Visual language matches the rest
 * of Minerva: pure void (black) surface, signal (white) text, ghost (gray)
 * borders, and accent (green) used sparingly for status emphasis only.
 * ========================================================================= */

const PANEL_WIDTH = 460;
const PANEL_MAX_HEIGHT = 600;
// Panel anchors at the node's bottom-right corner. Small offsets clear the
// node's outer glow / hover halo so the panel frame doesn't visually butt
// into the node — large enough to read as "outside the node" but tight
// enough to read as "attached to that corner".
const PANEL_OFFSET_X = 12;
const PANEL_OFFSET_Y = 12;
interface LinkToParentPanelProps {
    source: Callback | null;
    /** Source node's position in React Flow's *flow* coordinate space. */
    anchor: { flowX: number; flowY: number; width: number; height: number } | null;
    /** Live ReactFlow viewport — recompute screen position on every change. */
    viewport: { x: number; y: number; zoom: number };
    onClose: () => void;
    selectedDestination: Callback | null;
    setSelectedDestination: (v: Callback | null) => void;
    selectedProfile: any;
    setSelectedProfile: (v: any) => void;
    isP2PConnection: boolean;
    setIsP2PConnection: (v: boolean) => void;
    edgeLabel: string;
    setEdgeLabel: (v: string) => void;
    filteredCallbacksForParent: Callback[];
    p2pData: any;
    allC2Data: any;
    handleSetParent: () => void;
}

const LinkToParentPanel: React.FC<LinkToParentPanelProps> = ({
    source, anchor, viewport, onClose,
    selectedDestination, setSelectedDestination,
    selectedProfile, setSelectedProfile,
    isP2PConnection, setIsP2PConnection,
    edgeLabel, setEdgeLabel,
    filteredCallbacksForParent, p2pData, allC2Data, handleSetParent,
}) => {
    // Anchor the panel's top-left at the node's BOTTOM-RIGHT corner so it
    // drops down-and-rightward from there. Recomputed every pan/zoom frame so
    // the panel follows the node through canvas drags and zooms.
    // No clamping in either axis — pulling the panel back toward the node
    // would overlap it, so we let it overflow if needed; the panel follows
    // the node so the user just pans to bring everything into view.
    const position = React.useMemo(() => {
        if (!anchor) return { left: 80, top: 80 };
        const nodeRightScreenX  = (anchor.flowX + anchor.width)  * viewport.zoom + viewport.x;
        const nodeBottomScreenY = (anchor.flowY + anchor.height) * viewport.zoom + viewport.y;
        return {
            left: nodeRightScreenX  + PANEL_OFFSET_X,
            top:  nodeBottomScreenY + PANEL_OFFSET_Y,
        };
    }, [anchor, viewport]);

    // RUNNING profiles first, STOPPED last; preserve insertion order within each bucket.
    const egressProfiles = React.useMemo(() => {
        const list = (allC2Data?.c2profile || []).filter((p: any) => !p.is_p2p);
        return [...list].sort((a: any, b: any) => (b?.running ? 1 : 0) - (a?.running ? 1 : 0));
    }, [allC2Data]);

    const p2pProfiles = React.useMemo(() => {
        const list = p2pData?.c2profile || [];
        return [...list].sort((a: any, b: any) => (b?.running ? 1 : 0) - (a?.running ? 1 : 0));
    }, [p2pData]);

    if (typeof document === 'undefined') return null;

    // ESC closes the panel without trapping graph interaction
    React.useEffect(() => {
        if (!source) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [source, onClose]);

    // Broadcast-style horizontal reveal — outer width grows 0 → PANEL_WIDTH;
    // the fixed-width inner content gets clipped from the left edge so the
    // reveal extends rightward from the node into open space.
    const expandTransition = { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const };

    return createPortal(
        <AnimatePresence>
            {source && (
                <motion.div
                    initial={{ width: 0, opacity: 0.6 }}
                    animate={{ width: PANEL_WIDTH, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={expandTransition}
                    style={{
                        top: position.top,
                        left: position.left,
                        maxHeight: PANEL_MAX_HEIGHT,
                        clipPath: PANEL_CHAMFER,
                    }}
                    className="fixed z-[9999] overflow-hidden bg-black border border-signal/50 shadow-[0_0_40px_rgba(0,0,0,0.85)] backdrop-blur-md font-mono"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* L-shape corner ticks on the four corners — Cyberpunk HUD signature */}
                    <CornerTicks side="left" />
                    <CornerTicks side="right" />

                    {/* Inner is pinned at PANEL_WIDTH; parent's animated width clips
                        it from the left edge so content reveals rightward from the
                        node side. */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22, delay: 0.18 }}
                        className="flex flex-col"
                        style={{ width: PANEL_WIDTH, maxHeight: PANEL_MAX_HEIGHT }}
                    >
                    {/* Header — inverted ID tile + title block + glowing close button */}
                    <div className="flex items-stretch border-b border-signal/40 bg-signal/[0.02]">
                        <div className="relative flex items-center justify-center bg-signal px-3 min-w-[64px] shadow-[inset_0_0_12px_rgba(255,255,255,0.25)]">
                            {/* Small corner ticks INSIDE the inverted block — Cyberpunk badge feel */}
                            <span className="pointer-events-none absolute top-1 left-1 w-1.5 h-px bg-void" />
                            <span className="pointer-events-none absolute top-1 left-1 w-px h-1.5 bg-void" />
                            <span className="pointer-events-none absolute bottom-1 right-1 w-1.5 h-px bg-void" />
                            <span className="pointer-events-none absolute bottom-1 right-1 w-px h-1.5 bg-void" />
                            <span className="text-[16px] font-bold tracking-[0.15em] text-void">
                                #{source.display_id}
                            </span>
                        </div>
                        <div className="flex flex-col justify-center px-3 py-2 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <GitBranch size={12} strokeWidth={2.5} className="text-accent shrink-0" />
                                <span className="text-[11px] uppercase tracking-[0.3em] text-signal font-bold truncate">
                                    LINK_TO_PARENT
                                </span>
                                <span className="ml-auto flex items-center gap-1 border border-accent/60 bg-accent/10 px-1.5 py-px text-[8px] uppercase tracking-[0.2em] text-accent shrink-0">
                                    <span className="h-1 w-1 bg-accent animate-pulse rounded-full shadow-[0_0_4px_currentColor]" />
                                    ARMED
                                </span>
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.2em] text-signal truncate mt-0.5">
                                {source.isCustom ? 'CUSTOM' : 'CALLBACK'} · {source.host}
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="group flex items-center justify-center px-3 text-signal transition-all hover:bg-red-500/10 hover:text-red-400 border-l border-signal/40"
                            aria-label="Close"
                        >
                            <X size={14} strokeWidth={2.5} className="transition-transform duration-200 group-hover:rotate-90" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="relative flex-1 space-y-4 overflow-y-auto px-4 py-4 cyber-scrollbar">
                        {/* Target node picker */}
                        <Section
                            label="TARGET_NODE"
                            icon={<Target size={11} strokeWidth={2.5} />}
                            count={filteredCallbacksForParent.length}
                        >
                            {filteredCallbacksForParent.length > 0 ? (
                                <div className="max-h-44 overflow-y-auto cyber-scrollbar space-y-1.5 pr-0.5">
                                    {filteredCallbacksForParent.map((cb: Callback) => {
                                        const selected = selectedDestination?.id === cb.id;
                                        // Match the 2D graph node's own dead rendering (see
                                        // CallbackGraph/nodes.tsx): liveness is the sleep-aware
                                        // last_checkin check, NOT Mythic's `dead` column. That
                                        // column lags ~60s, is skipped while the payload
                                        // container is down, and follows each agent's own
                                        // aliveness logic — so trusting it here flagged actively
                                        // beaconing callbacks as DEAD in the picker even though
                                        // their node still rendered live.
                                        const kind: 'custom' | 'alive' | 'dead' = cb.isCustom
                                            ? 'custom'
                                            : !isCallbackAlive(cb)
                                                ? 'dead'
                                                : 'alive';
                                        const KindIcon = kind === 'custom' ? Box : kind === 'alive' ? Cpu : Skull;
                                        const iconCls  = kind === 'custom' ? 'text-signal' : kind === 'alive' ? 'text-accent' : 'text-red-500';
                                        const pillText = cb.isCustom ? 'CUSTOM' : cb.payload?.payloadtype?.name;
                                        return (
                                            <SelectableTile
                                                key={cb.id}
                                                selected={selected}
                                                onClick={() => setSelectedDestination(cb)}
                                            >
                                                {/* Status LED dot — pulses for live, dim for dead/custom */}
                                                <span className={cn(
                                                    'h-1.5 w-1.5 shrink-0 rounded-full',
                                                    kind === 'alive' && 'bg-accent animate-pulse shadow-[0_0_4px_currentColor] text-accent',
                                                    kind === 'dead' && 'bg-red-500 text-red-500',
                                                    kind === 'custom' && 'bg-signal text-signal',
                                                )} />
                                                <KindIcon size={12} strokeWidth={2.2} className={cn('shrink-0', iconCls)} />
                                                <span className="text-signal font-bold">#{cb.display_id}</span>
                                                <span className={kind === 'dead' ? 'text-red-500' : 'text-accent'}>@</span>
                                                <span className={cn('min-w-0 flex-1 truncate', kind === 'dead' ? 'text-signal line-through decoration-red-500/60' : 'text-signal')}>{cb.host}</span>
                                                {kind !== 'custom' && (
                                                    <span className={cn(
                                                        'border px-1.5 py-px text-[9px] tracking-[0.2em] shrink-0',
                                                        kind === 'alive' ? 'border-accent/60 bg-accent/10 text-accent' : 'border-red-500/60 bg-red-500/10 text-red-400'
                                                    )}>
                                                        {kind === 'alive' ? 'LIVE' : 'DEAD'}
                                                    </span>
                                                )}
                                                <span className={cn(
                                                    'border px-1.5 py-px text-[9px] tracking-[0.2em] shrink-0',
                                                    kind === 'custom' ? 'border-signal/50 text-signal' :
                                                    kind === 'alive' ? 'border-accent/60 text-accent' : 'border-red-500/60 text-red-400'
                                                )}>
                                                    {pillText}
                                                </span>
                                            </SelectableTile>
                                        );
                                    })}
                                </div>
                            ) : (
                                <EmptyTile text="NO_OTHER_CALLBACKS_AVAILABLE" />
                            )}
                        </Section>

                        {/* Connection type toggle */}
                        <Section
                            label="CONNECTION_TYPE"
                            icon={<Crosshair size={11} strokeWidth={2.5} />}
                        >
                            <div className="grid grid-cols-2 gap-2">
                                <ChamferedToggle
                                    icon={<GitBranch size={13} strokeWidth={2.2} />}
                                    label="P2P"
                                    active={isP2PConnection}
                                    onClick={() => { setIsP2PConnection(true); setSelectedProfile(null); }}
                                />
                                <ChamferedToggle
                                    icon={<Network size={13} strokeWidth={2.2} />}
                                    label="EGRESS"
                                    active={!isP2PConnection}
                                    onClick={() => { setIsP2PConnection(false); setSelectedProfile(null); }}
                                />
                            </div>
                        </Section>

                        {/* Profile picker */}
                        <Section
                            label={isP2PConnection ? 'P2P_PROFILE' : 'C2_PROFILE'}
                            icon={<Radio size={11} strokeWidth={2.5} />}
                            count={(isP2PConnection ? p2pProfiles : egressProfiles).length}
                        >
                            {(isP2PConnection ? p2pProfiles : egressProfiles).length > 0 ? (
                                <div className="max-h-36 overflow-y-auto cyber-scrollbar space-y-1.5 pr-0.5">
                                    {(isP2PConnection ? p2pProfiles : egressProfiles).map((profile: any) => {
                                        const selected = selectedProfile?.id === profile.id;
                                        const running = !!profile.running;
                                        return (
                                            <SelectableTile
                                                key={profile.id}
                                                selected={selected}
                                                onClick={() => setSelectedProfile(profile)}
                                            >
                                                <span className={cn(
                                                    'h-1.5 w-1.5 shrink-0 rounded-full',
                                                    running ? 'bg-accent animate-pulse shadow-[0_0_4px_currentColor] text-accent' : 'bg-signal/60 text-signal'
                                                )} />
                                                {isP2PConnection
                                                    ? <GitBranch size={11} strokeWidth={2.2} className={cn('shrink-0', running ? 'text-accent' : 'text-signal')} />
                                                    : <Network size={11} strokeWidth={2.2} className={cn('shrink-0', running ? 'text-accent' : 'text-signal')} />}
                                                <span className="flex-1 truncate text-signal font-bold">{profile.name}</span>
                                                <StatusPill running={running} />
                                            </SelectableTile>
                                        );
                                    })}
                                </div>
                            ) : (
                                <EmptyTile text={isP2PConnection ? 'NO_P2P_PROFILES_AVAILABLE' : 'NO_EGRESS_PROFILES_AVAILABLE'} />
                            )}
                        </Section>

                        {/* Optional edge label */}
                        <Section
                            label="EDGE_LABEL"
                            icon={<Tag size={11} strokeWidth={2.5} />}
                            hint="OPTIONAL"
                        >
                            <div className="relative" style={{ clipPath: TILE_CHAMFER }}>
                                <input
                                    type="text"
                                    value={edgeLabel}
                                    onChange={(e) => setEdgeLabel(e.target.value)}
                                    placeholder="SMB_LINK · INTERNAL_PIVOT"
                                    className="w-full border-l-2 border-l-signal/40 bg-signal/[0.03] pl-3 pr-5 py-2.5 text-[11px] tracking-wider text-signal placeholder:text-accent focus:border-l-accent focus:bg-signal/5 focus:outline-none transition-colors"
                                />
                            </div>
                        </Section>

                        {/* Link summary */}
                        {selectedDestination && selectedProfile && (
                            <div
                                style={{ clipPath: TILE_CHAMFER }}
                                className="relative border-l-2 border-l-accent bg-signal/[0.05] pl-3 pr-5 py-2.5 text-[11px] text-signal shadow-[0_0_18px_rgba(34,197,94,0.15)]"
                            >
                                <div className="mb-1.5 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <Send size={11} strokeWidth={2.5} className="text-accent" />
                                        <span className="text-[10px] uppercase tracking-[0.25em] text-signal">LINK_PREVIEW</span>
                                    </div>
                                    <span className="border border-accent/60 bg-accent/10 px-1.5 py-px text-[9px] tracking-[0.2em] text-accent">
                                        {isP2PConnection ? 'P2P' : 'EGRESS'}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-signal">
                                    <span className="border border-signal/40 bg-signal/10 px-1.5 py-px font-bold">#{source.display_id}</span>
                                    <span className="text-signal">{source.host}</span>
                                    <ChevronRight size={11} className="text-accent" />
                                    <span className="border border-accent/60 bg-accent/10 px-1.5 py-px text-accent">{selectedProfile.name}</span>
                                    <ChevronRight size={11} className="text-accent" />
                                    <span className="border border-signal/40 bg-signal/10 px-1.5 py-px font-bold">#{selectedDestination.display_id}</span>
                                    <span className="text-signal">{selectedDestination.host}</span>
                                </div>
                                {edgeLabel && (
                                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-signal">
                                        <Tag size={9} className="text-accent" />
                                        <span>{edgeLabel}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer — graphical action buttons with clear affordance */}
                    <div className="flex items-center justify-between gap-3 border-t border-signal/40 bg-signal/[0.02] px-4 py-3">
                        <div className="flex items-center gap-1.5 text-[9px] tracking-[0.3em] text-signal">
                            <span className="h-1 w-1 bg-accent animate-pulse" />
                            <span>MINERVA · LINK</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <ActionButton
                                variant="ghost"
                                onClick={onClose}
                                icon={<X size={12} strokeWidth={2.5} />}
                            >
                                CANCEL
                            </ActionButton>
                            <ActionButton
                                variant="primary"
                                onClick={handleSetParent}
                                disabled={!selectedProfile || !selectedDestination}
                                icon={<Link2 size={12} strokeWidth={2.5} />}
                            >
                                CREATE_LINK
                            </ActionButton>
                        </div>
                    </div>
                    </motion.div>{/* /inner fixed-width */}
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

/* (Reusable LinkPanel parts moved to ../LinkPanel/linkPanelParts.tsx —
   shared with the 3D Topology view to keep the visual language identical.) */
