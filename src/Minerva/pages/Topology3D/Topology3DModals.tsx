import { AnimatePresence } from 'framer-motion';
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
} from 'lucide-react';
import type { Callback, CallbackGraphEdge } from '../../types/callbacks';
import { CyberModal } from '../../components/CyberModal';
import { MythicDialog } from '../../components/MythicDialog';
import { EventTriggerContextSelectDialog } from '../../components/EventTriggerContextSelect';
import { getErrorMessage, parseFirstIP } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';

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

    // Details Modal
    detailsModal: any;
    setDetailsModal: (v: any) => void;

    // Set Parent / Link
    setParentModal: any;
    setSetParentModal: (v: any) => void;
    filteredCallbacksForParent: Callback[];
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
        detailsModal, setDetailsModal,
        setParentModal, setSetParentModal, filteredCallbacksForParent, selectedDestination, setSelectedDestination,
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

            {/* Set Parent / Link to Parent Modal */}
            <AnimatePresence>
                {setParentModal && (
                    <CyberModal
                        title="LINK_TO_PARENT"
                        onClose={() => setSetParentModal(null)}
                        icon={<GitBranch />}
                    >
                        <div className="space-y-4">
                            <div className="text-xs text-gray-400 font-mono mb-2">
                                Link {setParentModal.isCustom ? 'Custom Node' : 'Callback'} #{setParentModal.display_id} ({setParentModal.host}) to another node.
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">TARGET_NODE</label>
                                <div className="grid gap-2 max-h-48 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                    {filteredCallbacksForParent.length > 0 ? (
                                        filteredCallbacksForParent.map((callback: Callback) => {
                                            const ip = callback.isCustom ? callback.ip : parseFirstIP(callback.ip);
                                            return (
                                                <button key={callback.id} onClick={() => setSelectedDestination(callback)}
                                                    className={`flex items-center gap-3 px-3 py-2.5 border text-left text-xs font-mono transition-colors ${
                                                        selectedDestination?.id === callback.id
                                                            ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                                                            : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:bg-white/5'
                                                    }`}>
                                                    <div className={`w-2 h-2 rounded-full ${callback.isCustom ? 'bg-cyan-500' : (callback.integrity_level > 2 ? 'bg-yellow-500' : 'bg-green-500')}`} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold">#{callback.display_id}</span>
                                                            <span className="text-gray-500">@</span>
                                                            <span className="truncate">{callback.host}</span>
                                                            {callback.isCustom && <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1 py-0.5 border border-cyan-500/30">CUSTOM</span>}
                                                        </div>
                                                        <div className="text-[11px] text-gray-600 flex items-center gap-2">
                                                            <span>{callback.user}</span><span>·</span><span>{ip}</span>
                                                        </div>
                                                    </div>
                                                    <span className="text-[11px] uppercase text-gray-600 border border-gray-700 px-1.5 py-0.5">
                                                        {callback.isCustom ? 'CUSTOM' : callback.payload?.payloadtype?.name}
                                                    </span>
                                                </button>
                                            );
                                        })
                                    ) : (
                                        <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_OTHER_NODES_AVAILABLE</div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">CONNECTION_TYPE</label>
                                <div className="flex gap-2">
                                    <button onClick={() => { setIsP2PConnection(true); setSelectedProfile(null); }}
                                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border text-xs font-mono transition-colors ${
                                            isP2PConnection ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'
                                        }`}>
                                        <GitBranch size={14} /><span>P2P</span>
                                    </button>
                                    <button onClick={() => { setIsP2PConnection(false); setSelectedProfile(null); }}
                                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border text-xs font-mono transition-colors ${
                                            !isP2PConnection ? 'border-purple-500 bg-purple-500/10 text-purple-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'
                                        }`}>
                                        <Network size={14} /><span>EGRESS</span>
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">{isP2PConnection ? 'P2P_PROFILE' : 'C2_PROFILE'}</label>
                                <div className="grid gap-2 max-h-32 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                    {isP2PConnection ? (
                                        <>
                                            {p2pData?.c2profile?.map((profile: any) => (
                                                <button key={profile.id} onClick={() => setSelectedProfile(profile)}
                                                    className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                                        selectedProfile?.id === profile.id ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                                    }`}>
                                                    <GitBranch size={14} /><span>{profile.name}</span>
                                                    <span className="ml-auto text-[11px] text-cyan-600 uppercase border border-cyan-800 px-1">P2P</span>
                                                </button>
                                            ))}
                                            {(!p2pData?.c2profile || p2pData.c2profile.length === 0) && (
                                                <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_P2P_PROFILES_AVAILABLE</div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {allC2Data?.c2profile?.filter((p: any) => !p.is_p2p).map((profile: any) => (
                                                <button key={profile.id} onClick={() => setSelectedProfile(profile)}
                                                    className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                                        selectedProfile?.id === profile.id ? 'border-purple-500 bg-purple-500/10 text-purple-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                                    }`}>
                                                    <Network size={14} /><span>{profile.name}</span>
                                                    <div className="ml-auto flex items-center gap-1">
                                                        {profile.running
                                                            ? <span className="text-[11px] text-green-500 border border-green-800 px-1">RUNNING</span>
                                                            : <span className="text-[11px] text-red-500 border border-red-800 px-1">STOPPED</span>}
                                                    </div>
                                                </button>
                                            ))}
                                            {(!allC2Data?.c2profile?.filter((p: any) => !p.is_p2p)?.length) && (
                                                <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_EGRESS_PROFILES_AVAILABLE</div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">EDGE_LABEL <span className="text-gray-600">(optional)</span></label>
                                <input type="text" value={edgeLabel} onChange={(e) => setEdgeLabel(e.target.value)}
                                    placeholder="e.g., SMB Link, Internal Pivot..."
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-xs placeholder:text-gray-600" />
                            </div>
                            {selectedDestination && selectedProfile && (
                                <div className={`p-3 border text-xs font-mono ${isP2PConnection ? 'bg-cyan-900/20 border-cyan-500/30' : 'bg-purple-900/20 border-purple-500/30'}`}>
                                    <div className={`mb-2 flex items-center gap-2 ${isP2PConnection ? 'text-cyan-400' : 'text-purple-400'}`}>
                                        {isP2PConnection ? <GitBranch size={12} /> : <Network size={12} />}
                                        <span>LINK_SUMMARY</span>
                                        <span className={`text-[11px] px-1.5 py-0.5 border ${isP2PConnection ? 'border-cyan-600 text-cyan-500' : 'border-purple-600 text-purple-500'}`}>
                                            {isP2PConnection ? 'P2P' : 'EGRESS'}
                                        </span>
                                    </div>
                                    <div className="text-gray-300 flex items-center gap-2 flex-wrap">
                                        <span className="text-cyan-400 font-bold">#{setParentModal.display_id}</span>
                                        <span className="text-gray-600">({setParentModal.host})</span>
                                        <span className={isP2PConnection ? 'text-cyan-500' : 'text-purple-500'}>→</span>
                                        <span className={`px-2 py-0.5 ${isP2PConnection ? 'bg-cyan-900/50 text-cyan-400' : 'bg-purple-900/50 text-purple-400'}`}>{selectedProfile.name}</span>
                                        <span className={isP2PConnection ? 'text-cyan-500' : 'text-purple-500'}>→</span>
                                        <span className="text-cyan-400 font-bold">#{selectedDestination.display_id}</span>
                                        <span className="text-gray-600">({selectedDestination.host})</span>
                                    </div>
                                </div>
                            )}
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => setSetParentModal(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                <button onClick={handleSetParent} disabled={!selectedProfile || !selectedDestination}
                                    className={`px-6 py-2 font-bold font-mono text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                        isP2PConnection ? 'bg-cyan-600 text-white hover:bg-cyan-500' : 'bg-purple-600 text-white hover:bg-purple-500'
                                    }`}>CREATE_LINK</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

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
