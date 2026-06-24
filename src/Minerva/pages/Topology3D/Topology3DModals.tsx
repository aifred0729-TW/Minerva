import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Terminal,
    Info,
    Plus,
    Monitor,
    Shield,
    Network,
    Lock,
    Edit,
    GitBranch,
    Link2,
    Trash2,
    Zap,
    X,
    Box,
    Cpu,
    Skull,
    Target,
    Tag,
    Send,
    ChevronRight,
    Radio,
    Crosshair,
} from 'lucide-react';
import type { Callback, CallbackGraphEdge } from '../../types/callbacks';
import { CyberModal } from '../../components/CyberModal';
import { MythicDialog } from '../../components/MythicDialog';
import { EventTriggerContextSelectDialog } from '../../components/EventTriggerContextSelect';
import { getErrorMessage, parseFirstIP, cn, isCallbackAlive } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import {
    PANEL_CHAMFER, TILE_CHAMFER,
    CornerTicks, Section, SelectableTile, ChamferedToggle, ActionButton, StatusPill, EmptyTile,
} from '../../components/LinkPanel/linkPanelParts';

export interface Topology3DModalsProps {
    // Edit Description
    editDescriptionModal: any;
    setEditDescriptionModal: (v: any) => void;
    newDescription: string;
    setNewDescription: (v: string) => void;
    handleSaveDescription: () => void;

    // Edit Custom Node
    editCustomNodeModal: any;
    setEditCustomNodeModal: (v: any) => void;
    customNodeForm: { host: string; os: string; ip: string; user: string; description: string; architecture: string };
    setCustomNodeForm: (v: { host: string; os: string; ip: string; user: string; description: string; architecture: string }) => void;
    handleUpdateCustomNode: () => void;

    // Create Custom Node (background right-click → "New Custom Node")
    createCustomNodeModal: boolean;
    setCreateCustomNodeModal: (v: boolean) => void;
    handleCreateCustomNode: () => void;

    // Details Modal
    detailsModal: any;
    setDetailsModal: (v: any) => void;

    // Set Parent / Link
    setParentModal: any;
    setSetParentModal: (v: any) => void;
    /** Live screen-space projection of the source node — updated each Canvas
     *  frame by a ScreenProjector so the inline panel slides with the camera. */
    setParentScreenPos: { x: number; y: number };
    filteredCallbacksForParent: Callback[];
    /** Live callbackgraphedge rows — fed to isCallbackAlive so the LINK_TO_PARENT
     *  picker classifies LIVE/DEAD exactly like the 3D node colour (buildTopology
     *  / DetailPanel) instead of trusting Mythic's lagging `dead` column. */
    callbackEdges: CallbackGraphEdge[];
    selectedDestination: any;
    setSelectedDestination: (v: any) => void;
    isP2PConnection: boolean;
    setIsP2PConnection: (v: boolean) => void;
    selectedProfile: any;
    setSelectedProfile: (v: any) => void;
    edgeLabel: string;
    setEdgeLabel: (v: string) => void;
    p2pData: any;
    allC2Data: any;
    handleSetParent: () => void;

    // Task for Edge
    taskForEdgeModal: any;
    setTaskForEdgeModal: (v: any) => void;
    taskForEdgeCommand: any;
    setTaskForEdgeCommand: (v: any) => void;
    taskForEdgeParams: string;
    setTaskForEdgeParams: (v: string) => void;
    taskingForEdge: boolean;
    setTaskingForEdge: (v: boolean) => void;
    linkCommandsLoading: boolean;
    linkCommandsData: any;
    createTask: (options: any) => Promise<any>;

    // Eventing
    showEventingDialog: any;
    setShowEventingDialog: (v: any) => void;

    // Add P2P Edge
    manuallyAddEdgeModal: any;
    setManuallyAddEdgeModal: (v: any) => void;
    addEdgeSelectedProfile: any;
    setAddEdgeSelectedProfile: (v: any) => void;
    addEdgeSelectedDest: any;
    setAddEdgeSelectedDest: (v: any) => void;
    addEdgeDestOptions: any[];
    setAddEdgeDestOptions: (v: any[]) => void;
    handleManuallyAddEdge: () => void;

    // Remove Edge
    removeEdgeModal: any;
    setRemoveEdgeModal: (v: any) => void;
    removeEdge: (options: any) => Promise<any>;
}

export function Topology3DModals(props: Topology3DModalsProps) {
    const {
        editDescriptionModal, setEditDescriptionModal, newDescription, setNewDescription, handleSaveDescription,
        editCustomNodeModal, setEditCustomNodeModal, customNodeForm, setCustomNodeForm, handleUpdateCustomNode,
        createCustomNodeModal, setCreateCustomNodeModal, handleCreateCustomNode,
        detailsModal, setDetailsModal,
        setParentModal, setSetParentModal, setParentScreenPos, filteredCallbacksForParent, callbackEdges, selectedDestination, setSelectedDestination,
        isP2PConnection, setIsP2PConnection, selectedProfile, setSelectedProfile, edgeLabel, setEdgeLabel,
        p2pData, allC2Data, handleSetParent,
        taskForEdgeModal, setTaskForEdgeModal, taskForEdgeCommand, setTaskForEdgeCommand,
        taskForEdgeParams, setTaskForEdgeParams, taskingForEdge, setTaskingForEdge,
        linkCommandsLoading, linkCommandsData, createTask,
        showEventingDialog, setShowEventingDialog,
        manuallyAddEdgeModal, setManuallyAddEdgeModal, addEdgeSelectedProfile, setAddEdgeSelectedProfile,
        addEdgeSelectedDest, setAddEdgeSelectedDest, addEdgeDestOptions, setAddEdgeDestOptions, handleManuallyAddEdge,
        removeEdgeModal, setRemoveEdgeModal, removeEdge,
    } = props;

    return (
        <>
            {/* ═══════════════════════════════════════════════ */}
            {/*  Modal Dialogs (matching CallbackGraph)        */}
            {/* ═══════════════════════════════════════════════ */}

            {/* Edit Description Modal */}
            <AnimatePresence>
                {editDescriptionModal && (
                    <CyberModal
                        title="EDIT_DESCRIPTION"
                        onClose={() => setEditDescriptionModal(null)}
                        icon={<Edit />}
                    >
                        <div className="space-y-4">
                            <div className="text-xs text-gray-400 font-mono mb-2">
                                Callback #{editDescriptionModal.display_id} - {editDescriptionModal.host}
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">DESCRIPTION</label>
                                <input
                                    type="text"
                                    value={newDescription}
                                    onChange={(e) => setNewDescription(e.target.value)}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono"
                                    autoFocus
                                />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setEditDescriptionModal(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                <button
                                    onClick={handleSaveDescription}
                                    className="px-6 py-2 bg-cyan-500 text-black font-bold font-mono text-sm hover:bg-white transition-colors"
                                >
                                    SAVE
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Edit Custom Node Modal */}
            <AnimatePresence>
                {editCustomNodeModal && (
                    <CyberModal
                        title="EDIT_CUSTOM_NODE"
                        onClose={() => setEditCustomNodeModal(null)}
                        icon={<Edit />}
                    >
                        <div className="space-y-4">
                            <div className="text-xs text-gray-400 mb-4">
                                Edit custom node #{editCustomNodeModal.display_id} - {editCustomNodeModal.host}
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">HOSTNAME *</label>
                                <input type="text" value={customNodeForm.host}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, host: e.target.value})}
                                    placeholder="TARGET-PC-01"
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">OPERATING SYSTEM *</label>
                                <select value={customNodeForm.os}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, os: e.target.value})}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm">
                                    <option value="Windows">Windows</option>
                                    <option value="Linux">Linux</option>
                                    <option value="macOS">macOS</option>
                                    <option value="Unknown">Unknown</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">IP ADDRESS *</label>
                                <input type="text" value={customNodeForm.ip}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, ip: e.target.value})}
                                    placeholder="192.168.1.100"
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">ARCHITECTURE</label>
                                <select value={customNodeForm.architecture}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, architecture: e.target.value})}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm">
                                    <option value="x64">x64</option>
                                    <option value="x86">x86</option>
                                    <option value="arm64">ARM64</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">USER</label>
                                <input type="text" value={customNodeForm.user}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, user: e.target.value})}
                                    placeholder="Administrator"
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">DESCRIPTION</label>
                                <textarea value={customNodeForm.description}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, description: e.target.value})}
                                    placeholder="Target system details..."
                                    rows={3}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm resize-none" />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button onClick={() => setEditCustomNodeModal(null)}
                                    className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                <button onClick={handleUpdateCustomNode}
                                    className="px-6 py-2 bg-cyan-500 text-black font-bold font-mono text-sm hover:bg-white transition-colors">UPDATE</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Create Custom Node Modal (background right-click → "New Custom Node") */}
            <AnimatePresence>
                {createCustomNodeModal && (
                    <CyberModal
                        title="NEW_CUSTOM_NODE"
                        onClose={() => setCreateCustomNodeModal(false)}
                        icon={<Plus />}
                    >
                        <div className="space-y-4">
                            <div className="text-xs text-gray-400 mb-4">
                                Manually register a host in this operation's topology.
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">HOSTNAME *</label>
                                <input type="text" value={customNodeForm.host}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, host: e.target.value})}
                                    placeholder="TARGET-PC-01"
                                    autoFocus
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">OPERATING SYSTEM *</label>
                                <select value={customNodeForm.os}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, os: e.target.value})}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm">
                                    <option value="Windows">Windows</option>
                                    <option value="Linux">Linux</option>
                                    <option value="macOS">macOS</option>
                                    <option value="Unknown">Unknown</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">IP ADDRESS *</label>
                                <input type="text" value={customNodeForm.ip}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, ip: e.target.value})}
                                    placeholder="192.168.1.100"
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">ARCHITECTURE</label>
                                <select value={customNodeForm.architecture}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, architecture: e.target.value})}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm">
                                    <option value="x64">x64</option>
                                    <option value="x86">x86</option>
                                    <option value="arm64">ARM64</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">USER</label>
                                <input type="text" value={customNodeForm.user}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, user: e.target.value})}
                                    placeholder="Administrator"
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">DESCRIPTION</label>
                                <textarea value={customNodeForm.description}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, description: e.target.value})}
                                    placeholder="Target system details..."
                                    rows={3}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm resize-none" />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button onClick={() => setCreateCustomNodeModal(false)}
                                    className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                <button onClick={handleCreateCustomNode}
                                    className="px-6 py-2 bg-cyan-500 text-black font-bold font-mono text-sm hover:bg-white transition-colors">CREATE</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Details Modal */}
            <AnimatePresence>
                {detailsModal && (
                    <CyberModal
                        title={detailsModal.isCustom ? "CUSTOM_NODE_DETAILS" : "CALLBACK_DETAILS"}
                        onClose={() => setDetailsModal(null)}
                        icon={<Info />}
                    >
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 p-3 bg-black/30 border border-gray-800">
                                <div className={`p-2 border ${
                                    detailsModal.isCustom
                                        ? 'border-cyan-500 bg-cyan-500/10'
                                        : (detailsModal.integrity_level > 2 ? 'border-yellow-500 bg-yellow-500/10' : 'border-cyan-500 bg-cyan-500/10')
                                }`}>
                                    <Terminal size={20} className={detailsModal.isCustom ? 'text-cyan-500' : (detailsModal.integrity_level > 2 ? 'text-yellow-500' : 'text-cyan-500')} />
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
                                        <Shield size={12} className="text-yellow-500" />
                                        <span className="text-xs font-bold text-yellow-500">ADMIN</span>
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
                                    <div className="text-sm font-mono text-cyan-400">{detailsModal.sleep_info}</div>
                                </div>
                            )}
                            <div className="p-3 bg-black/30 border border-gray-800">
                                <div className="text-xs font-mono text-gray-500 mb-1">DESCRIPTION</div>
                                <div className="text-sm text-gray-300 italic">{detailsModal.description || 'No description set'}</div>
                            </div>
                            <div className="flex justify-end">
                                <button onClick={() => setDetailsModal(null)}
                                    className="px-6 py-2 bg-cyan-500 text-black font-bold font-mono text-sm hover:bg-white transition-colors">CLOSE</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* LINK_TO_PARENT — same Cyberpunk × Minerva design language as the 2D
                CallbackGraph version, but rendered as a centered modal because
                the 3D scene has no clean way to anchor to a node's screen rect. */}
            <Link3DParentModal
                source={setParentModal}
                screenPos={setParentScreenPos}
                onClose={() => setSetParentModal(null)}
                selectedDestination={selectedDestination}
                setSelectedDestination={setSelectedDestination}
                selectedProfile={selectedProfile}
                setSelectedProfile={setSelectedProfile}
                isP2PConnection={isP2PConnection}
                setIsP2PConnection={setIsP2PConnection}
                edgeLabel={edgeLabel}
                setEdgeLabel={setEdgeLabel}
                filteredCallbacksForParent={filteredCallbacksForParent}
                callbackEdges={callbackEdges}
                p2pData={p2pData}
                allC2Data={allC2Data}
                handleSetParent={handleSetParent}
            />

            {/* Task for Edge Modal */}
            <AnimatePresence>
                {taskForEdgeModal && (
                    <CyberModal
                        title="TASK_FOR_EDGE"
                        onClose={() => { setTaskForEdgeModal(null); setTaskForEdgeCommand(null); setTaskForEdgeParams(''); }}
                        icon={<Link2 />}
                    >
                        <div className="space-y-4 min-w-[380px]">
                            <div className="text-xs text-gray-400 font-mono">
                                Callback #{taskForEdgeModal.display_id} — {taskForEdgeModal.host}
                            </div>
                            {linkCommandsLoading && (
                                <div className="text-cyan-400 text-xs font-mono animate-pulse">LOADING_COMMANDS...</div>
                            )}
                            {!linkCommandsLoading && (linkCommandsData?.loadedcommands?.length ?? 0) === 0 && (
                                <div className="text-gray-500 text-xs font-mono">No link commands loaded on this callback.</div>
                            )}
                            {!linkCommandsLoading && (linkCommandsData?.loadedcommands?.length ?? 0) > 0 && (
                                <div className="space-y-2">
                                    <div className="text-xs font-mono text-gray-400">SELECT_COMMAND</div>
                                    {linkCommandsData!.loadedcommands.map((lc: any) => (
                                        <button key={lc.command.id}
                                            onClick={() => { setTaskForEdgeCommand(lc.command); setTaskForEdgeParams(''); }}
                                            className={`w-full flex items-center gap-2 px-3 py-2 border text-xs font-mono text-left transition-colors ${
                                                taskForEdgeCommand?.id === lc.command.id
                                                    ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-400'
                                                    : 'bg-black border-white/10 text-gray-400 hover:border-cyan-500/40 hover:text-cyan-400/70'
                                            }`}>
                                            <Zap size={12} />
                                            <span className="font-bold">{lc.command.cmd}</span>
                                            {lc.command.description && <span className="text-gray-600 truncate">— {lc.command.description}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {taskForEdgeCommand && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-mono text-gray-400">PARAMS (JSON or raw)</label>
                                    <textarea value={taskForEdgeParams} onChange={e => setTaskForEdgeParams(e.target.value)}
                                        rows={3} placeholder='{}'
                                        className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-xs resize-none" />
                                </div>
                            )}
                            <div className="flex justify-end gap-3">
                                <button onClick={() => { setTaskForEdgeModal(null); setTaskForEdgeCommand(null); setTaskForEdgeParams(''); }}
                                    className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                <button disabled={!taskForEdgeCommand || taskingForEdge}
                                    onClick={async () => {
                                        if (!taskForEdgeCommand) return;
                                        setTaskingForEdge(true);
                                        try {
                                            await createTask({ variables: { callback_id: taskForEdgeModal.callback_id, command: taskForEdgeCommand.cmd, params: taskForEdgeParams || '{}', token_id: 0 } });
                                            snackActions.success(`Tasked: ${taskForEdgeCommand.cmd}`);
                                            setTaskForEdgeModal(null); setTaskForEdgeCommand(null); setTaskForEdgeParams('');
                                        } catch (e: unknown) {
                                            snackActions.error('Task failed: ' + getErrorMessage(e));
                                        } finally {
                                            setTaskingForEdge(false);
                                        }
                                    }}
                                    className="px-6 py-2 bg-cyan-500 text-black font-bold font-mono text-sm hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                    {taskingForEdge ? 'TASKING...' : 'TASK'}
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Eventing Dialog */}
            {showEventingDialog && (
                <MythicDialog
                    fullWidth={true}
                    maxWidth="xl"
                    open={!!showEventingDialog}
                    onClose={() => setShowEventingDialog(null)}
                    innerDialog={
                        <EventTriggerContextSelectDialog
                            onClose={() => setShowEventingDialog(null)}
                            triggerContext={{ name: 'callback_id', value: showEventingDialog.id }}
                        />
                    }
                />
            )}

            {/* Add P2P Edge Modal */}
            <AnimatePresence>
                {manuallyAddEdgeModal && (
                    <CyberModal
                        title="ADD_P2P_EDGE"
                        onClose={() => { setManuallyAddEdgeModal(null); setAddEdgeSelectedProfile(null); setAddEdgeSelectedDest(null); setAddEdgeDestOptions([]); }}
                        icon={<Plus />}
                    >
                        <div className="space-y-4 min-w-[380px]">
                            <p className="text-xs text-gray-400 font-mono">
                                Source: <span className="text-cyan-400">#{manuallyAddEdgeModal.display_id ?? manuallyAddEdgeModal.callback_id}</span>
                                {manuallyAddEdgeModal.host && <span className="text-gray-500 ml-2">({manuallyAddEdgeModal.host})</span>}
                            </p>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">P2P_PROFILE</label>
                                <div className="grid gap-2 max-h-32 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                    {p2pData?.c2profile?.map((profile: any) => (
                                        <button key={profile.id}
                                            onClick={() => {
                                                setAddEdgeSelectedProfile(profile);
                                                setAddEdgeSelectedDest(null);
                                                const srcId = manuallyAddEdgeModal.id ?? manuallyAddEdgeModal.callback_id;
                                                const dests = (profile.callbackc2profiles || []).map((cp: { callback: Callback }) => cp.callback).filter((c: Callback | null) => c && c.id !== srcId);
                                                setAddEdgeDestOptions(dests);
                                            }}
                                            className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                                addEdgeSelectedProfile?.id === profile.id ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                            }`}>
                                            <GitBranch size={14} /><span>{profile.name}</span>
                                            <span className="ml-auto text-[11px] text-cyan-600 uppercase border border-cyan-800 px-1">P2P</span>
                                        </button>
                                    ))}
                                    {(!p2pData?.c2profile || p2pData.c2profile.length === 0) && (
                                        <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_P2P_PROFILES_AVAILABLE</div>
                                    )}
                                </div>
                            </div>
                            {addEdgeSelectedProfile && (
                                <div>
                                    <label className="block text-xs font-mono text-gray-500 mb-2">DESTINATION_CALLBACK</label>
                                    <div className="grid gap-2 max-h-32 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                        {addEdgeDestOptions.map((cb: Callback) => (
                                            <button key={cb.id} onClick={() => setAddEdgeSelectedDest(cb)}
                                                className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                                    addEdgeSelectedDest?.id === cb.id ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                                }`}>
                                                <Monitor size={14} /><span>#{cb.display_id}</span>
                                                {cb.description && <span className="text-gray-500 ml-1 truncate max-w-[140px]">{cb.description}</span>}
                                            </button>
                                        ))}
                                        {addEdgeDestOptions.length === 0 && (
                                            <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_CALLBACKS_WITH_PROFILE</div>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => { setManuallyAddEdgeModal(null); setAddEdgeSelectedProfile(null); setAddEdgeSelectedDest(null); setAddEdgeDestOptions([]); }}
                                    className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs">CANCEL</button>
                                <button onClick={handleManuallyAddEdge} disabled={!addEdgeSelectedProfile || !addEdgeSelectedDest}
                                    className="px-4 py-2 border border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500 font-mono text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                    CONFIRM_EDGE
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Remove Edge Modal */}
            <AnimatePresence>
                {removeEdgeModal && (
                    <CyberModal
                        title="REMOVE_EDGE"
                        onClose={() => setRemoveEdgeModal(null)}
                        icon={<Trash2 />}
                    >
                        <div className="space-y-3 min-w-[340px]">
                            <p className="text-xs text-gray-400 font-mono mb-2">Select an active edge to remove:</p>
                            {removeEdgeModal.map((e: CallbackGraphEdge) => (
                                <button key={e.id}
                                    onClick={async () => {
                                        try {
                                            await removeEdge({ variables: { edge_id: e.id } });
                                            snackActions.success('Edge removed');
                                        } catch (err: unknown) {
                                            snackActions.error('Failed: ' + getErrorMessage(err));
                                        }
                                        setRemoveEdgeModal(null);
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2 border border-white/10 hover:border-orange-500/40 text-xs font-mono text-left text-gray-300 hover:text-orange-300 hover:bg-orange-900/20 transition-colors">
                                    <Trash2 size={12} className="text-orange-500 shrink-0" />
                                    <span>
                                        #{e.source?.display_id} → #{e.destination?.display_id}
                                        {e.c2profile?.name && <span className="text-gray-500 ml-2">[{e.c2profile.name}]</span>}
                                    </span>
                                </button>
                            ))}
                            <div className="flex justify-end pt-2">
                                <button onClick={() => setRemoveEdgeModal(null)}
                                    className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>
        </>
    );
}

/* =============================================================================
 *  Link3DParentModal — centered modal variant of the LINK_TO_PARENT panel for
 *  the 3D Topology view. Shares its visual language (chamfered corners,
 *  inverted ID block header, GUI affordances, monochrome+accent palette) with
 *  the 2D CallbackGraph inline panel via ../../components/LinkPanel parts.
 * ===========================================================================*/

interface Link3DParentModalProps {
    source: any | null;
    /** Live projected screen position of the source 3D node — drives anchor. */
    screenPos: { x: number; y: number };
    onClose: () => void;
    selectedDestination: any | null;
    setSelectedDestination: (v: any | null) => void;
    selectedProfile: any;
    setSelectedProfile: (v: any) => void;
    isP2PConnection: boolean;
    setIsP2PConnection: (v: boolean) => void;
    edgeLabel: string;
    setEdgeLabel: (v: string) => void;
    filteredCallbacksForParent: Callback[];
    callbackEdges: CallbackGraphEdge[];
    p2pData: any;
    allC2Data: any;
    handleSetParent: () => void;
}

const PANEL_WIDTH_3D = 460;
const PANEL_MAX_HEIGHT_3D = 600;
const PANEL_OFFSET_X_3D = 40;   // gap to the right of the projected node center
const PANEL_OFFSET_Y_3D = -60;  // raise the panel slightly above node center

const Link3DParentModal: React.FC<Link3DParentModalProps> = ({
    source, screenPos, onClose,
    selectedDestination, setSelectedDestination,
    selectedProfile, setSelectedProfile,
    isP2PConnection, setIsP2PConnection,
    edgeLabel, setEdgeLabel,
    filteredCallbacksForParent, callbackEdges, p2pData, allC2Data, handleSetParent,
}) => {
    // Canonical liveness — identical to the 3D node colour (buildTopology's
    // `anyAlive`) and the DetailPanel status dot: a callback is live when it
    // is not operator-hidden AND its last_checkin is within the sleep-aware
    // threshold (orphan TCP P2P with no active peer counts dead via edges).
    // Deliberately does NOT consult Mythic's `dead` column: that flag only
    // refreshes every ~60s, is skipped while the agent's payload container is
    // down, and defers to each agent's own aliveness logic — so a callback
    // that is actively beaconing can still carry a stale `dead=true`. Trusting
    // it here is exactly what made live machines render as DEAD in this picker
    // while their 3D node stayed green.
    const isLiveCallback = (c: Callback): boolean =>
        !c.isCustom && c.active !== false && isCallbackAlive(c, callbackEdges);
    // Anchor the panel to the node's projected screen position. Always extends
    // *rightward* — no clamping back over the node. Vertical: clamp to keep the
    // panel fully visible. Recomputed every frame via screenPos updates.
    const position = React.useMemo(() => {
        const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
        let top = screenPos.y + PANEL_OFFSET_Y_3D;
        if (top + PANEL_MAX_HEIGHT_3D > vh - 16) top = Math.max(16, vh - PANEL_MAX_HEIGHT_3D - 16);
        if (top < 16) top = 16;
        return { left: screenPos.x + PANEL_OFFSET_X_3D, top };
    }, [screenPos]);
    // RUNNING profiles first, STOPPED last — matches the 2D version's contract
    const egressProfiles = React.useMemo(() => {
        const list = (allC2Data?.c2profile || []).filter((p: any) => !p.is_p2p);
        return [...list].sort((a: any, b: any) => (b?.running ? 1 : 0) - (a?.running ? 1 : 0));
    }, [allC2Data]);
    const p2pProfiles = React.useMemo(() => {
        const list = p2pData?.c2profile || [];
        return [...list].sort((a: any, b: any) => (b?.running ? 1 : 0) - (a?.running ? 1 : 0));
    }, [p2pData]);

    React.useEffect(() => {
        if (!source) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [source, onClose]);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {source && (
                <motion.div
                    initial={{ width: 0, opacity: 0.6 }}
                    animate={{ width: PANEL_WIDTH_3D, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                        top: position.top,
                        left: position.left,
                        maxHeight: PANEL_MAX_HEIGHT_3D,
                        clipPath: PANEL_CHAMFER,
                    }}
                    className="fixed z-[9999] overflow-hidden bg-black border border-signal/50 shadow-[0_0_40px_rgba(0,0,0,0.85)] backdrop-blur-md font-mono"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Connector line from the projected node centre to the panel
                        anchor — CP2077 quickhack "leash" feel */}
                    <svg
                        className="pointer-events-none fixed z-[9998]"
                        style={{
                            left: screenPos.x,
                            top: position.top + 28,
                            width: Math.max(2, position.left - screenPos.x),
                            height: 2,
                            overflow: 'visible',
                        }}
                    >
                        <line
                            x1="0"
                            y1="1"
                            x2={Math.max(2, position.left - screenPos.x)}
                            y2="1"
                            stroke="rgba(34,197,94,0.55)"
                            strokeWidth="1"
                            strokeDasharray="3 2"
                        />
                        <circle cx="0" cy="1" r="2.5" fill="rgba(34,197,94,0.85)" />
                    </svg>

                    <CornerTicks side="left" />
                    <CornerTicks side="right" />

                    {/* Inner held at fixed width so the parent's animated width
                        clips it from the left — content reveals rightward like
                        the 2D panel and the Broadcast strip. */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22, delay: 0.18 }}
                        className="flex flex-col"
                        style={{ width: PANEL_WIDTH_3D, maxHeight: PANEL_MAX_HEIGHT_3D }}
                    >
                        {/* Header — inverted ID tile + title + ARMED indicator + close */}
                        <div className="flex items-stretch border-b border-signal/40 bg-signal/[0.02]">
                            <div className="relative flex items-center justify-center bg-signal px-3 min-w-[64px] shadow-[inset_0_0_12px_rgba(255,255,255,0.25)]">
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
                        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 cyber-scrollbar">
                            {/* TARGET_MACHINE — pure machine picker. The 3D topology
                                  collapses callbacks per host into a single node, so
                                  the picker does the same: one row = one machine.
                                  When a machine is clicked we pick a representative
                                  callback (alive > custom > dead; newest display_id
                                  wins ties) because the link mutation still needs a
                                  concrete callback id under the hood. */}
                            {(() => {
                                const byHost = new Map<string, Callback[]>();
                                for (const cb of filteredCallbacksForParent) {
                                    const key = (cb.host || 'UNKNOWN_HOST').trim() || 'UNKNOWN_HOST';
                                    if (!byHost.has(key)) byHost.set(key, []);
                                    byHost.get(key)!.push(cb);
                                }
                                const pickRepresentative = (cbs: Callback[]): Callback => {
                                    const score = (c: Callback) =>
                                        c.isCustom ? 1
                                        : isLiveCallback(c) ? 2
                                        : 0;
                                    return cbs.slice().sort((a, b) => {
                                        const ds = score(b) - score(a);
                                        if (ds !== 0) return ds;
                                        return (b.display_id ?? 0) - (a.display_id ?? 0);
                                    })[0];
                                };
                                const groups = Array.from(byHost.entries()).sort(([ah, acbs], [bh, bcbs]) => {
                                    const aAlive = acbs.some(isLiveCallback);
                                    const bAlive = bcbs.some(isLiveCallback);
                                    if (aAlive !== bAlive) return aAlive ? -1 : 1;
                                    return ah.localeCompare(bh);
                                });

                                return (
                                    <Section
                                        label="TARGET_MACHINE"
                                        icon={<Target size={11} strokeWidth={2.5} />}
                                        count={byHost.size}
                                    >
                                        {filteredCallbacksForParent.length > 0 ? (
                                            <div className="max-h-72 overflow-y-auto cyber-scrollbar space-y-1 pr-0.5">
                                                {groups.map(([host, cbs]) => {
                                                    const aliveCount  = cbs.filter(isLiveCallback).length;
                                                    const deadCount   = cbs.filter(c => !c.isCustom && !isLiveCallback(c)).length;
                                                    const customCount = cbs.filter(c => c.isCustom).length;
                                                    const primaryIP   = cbs.map(c => c.isCustom ? c.ip : parseFirstIP(c.ip)).find(Boolean) || '';
                                                    const os          = cbs.map(c => c.os).find(Boolean) || '';
                                                    const onlyCustom  = customCount === cbs.length && customCount > 0;

                                                    const kind: 'custom' | 'alive' | 'dead' =
                                                        aliveCount > 0 ? 'alive'
                                                        : onlyCustom ? 'custom'
                                                        : 'dead';
                                                    const KindIcon = kind === 'custom' ? Box : kind === 'alive' ? Cpu : Skull;
                                                    const iconCls  = kind === 'custom' ? 'text-signal' : kind === 'alive' ? 'text-accent' : 'text-red-500';

                                                    const rep = pickRepresentative(cbs);
                                                    const selected = !!selectedDestination && cbs.some(c => c.id === selectedDestination.id);

                                                    return (
                                                        <SelectableTile
                                                            key={host}
                                                            selected={selected}
                                                            onClick={() => setSelectedDestination(rep)}
                                                        >
                                                            {/*  Hostname is the primary identifier — full-width line
                                                                 of its own so it never gets truncated by a long OS or
                                                                 IP. Status icon sits left; count pills float right on
                                                                 the same row. IP + OS live on a smaller secondary
                                                                 line underneath, deliberately dimmer so the eye
                                                                 lands on the hostname first. */}
                                                            <div className="flex w-full flex-col gap-0.5">
                                                                <div className="flex w-full items-center gap-2">
                                                                    <KindIcon size={14} strokeWidth={2.2} className={cn('shrink-0', iconCls)} />
                                                                    <span className="flex-1 truncate text-[13px] font-bold tracking-wide text-signal">
                                                                        {host}
                                                                    </span>
                                                                    {aliveCount > 0 && (
                                                                        <span className="shrink-0 border border-accent/60 bg-accent/10 px-1.5 py-px text-[9px] tracking-[0.2em] text-accent font-bold">
                                                                            {aliveCount} LIVE
                                                                        </span>
                                                                    )}
                                                                    {deadCount > 0 && (
                                                                        <span className="shrink-0 border border-red-500/60 bg-red-500/10 px-1.5 py-px text-[9px] tracking-[0.2em] text-red-400 font-bold">
                                                                            {deadCount} DEAD
                                                                        </span>
                                                                    )}
                                                                    {customCount > 0 && (
                                                                        <span className="shrink-0 border border-signal/50 px-1.5 py-px text-[9px] tracking-[0.2em] text-signal font-bold">
                                                                            {customCount} CUSTOM
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {(primaryIP || os) && (
                                                                    <div className="flex items-center gap-2 pl-[22px] text-[10px] font-mono text-signal/60">
                                                                        {primaryIP && <span className="truncate">{primaryIP}</span>}
                                                                        {primaryIP && os && <span className="text-signal/30">·</span>}
                                                                        {os && <span className="truncate">{os}</span>}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </SelectableTile>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <EmptyTile text="NO_OTHER_MACHINES_AVAILABLE" />
                                        )}
                                    </Section>
                                );
                            })()}

                            {/* CONNECTION_TYPE */}
                            <Section label="CONNECTION_TYPE" icon={<Crosshair size={11} strokeWidth={2.5} />}>
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

                            {/* PROFILE picker — RUNNING first */}
                            <Section
                                label={isP2PConnection ? 'P2P_PROFILE' : 'C2_PROFILE'}
                                icon={<Radio size={11} strokeWidth={2.5} />}
                                count={(isP2PConnection ? p2pProfiles : egressProfiles).length}
                            >
                                {(isP2PConnection ? p2pProfiles : egressProfiles).length > 0 ? (
                                    <div className="max-h-40 overflow-y-auto cyber-scrollbar space-y-1.5 pr-0.5">
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

                            {/* EDGE_LABEL */}
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

                            {/* LINK_PREVIEW */}
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

                        {/* Footer */}
                        <div className="flex items-center justify-between gap-3 border-t border-signal/40 bg-signal/[0.02] px-4 py-3">
                            <div className="flex items-center gap-1.5 text-[9px] tracking-[0.3em] text-signal">
                                <span className="h-1 w-1 bg-accent animate-pulse" />
                                <span>MINERVA · TOPO · LINK</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <ActionButton variant="ghost" onClick={onClose} icon={<X size={12} strokeWidth={2.5} />}>
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
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};
