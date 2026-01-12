import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { 
  GET_OPERATIONS, 
  CREATE_OPERATION_MUTATION, 
  UPDATE_OPERATION_MUTATION, 
  UPDATE_OPERATION_MEMBERS_MUTATION,
  TOGGLE_OPERATION_DELETE_MUTATION 
} from '../lib/api';
import { Sidebar } from '../components/Sidebar';
import { CyberTable } from '../components/CyberTable';
import { 
  Layers, 
  Plus, 
  MoreVertical, 
  Edit, 
  Users, 
  Trash2, 
  RotateCcw,
  CheckCircle, 
  XCircle,
  Shield,
  Eye,
  UserPlus,
  UserMinus,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { snackActions } from '../../Archive/components/utilities/Snackbar';
import { cn } from '../lib/utils';
import { meState } from '../../cache';
import { useAppStore } from '../store';

// --- Types ---
interface Admin {
  id: number;
  username: string;
}

interface Operator {
  id: number;
  username: string;
}

interface OperatorOperation {
  id: number;
  view_mode: string;
  operator: Operator;
}

interface Operation {
  id: number;
  name: string;
  complete: boolean;
  webhook: string;
  channel: string;
  banner_text: string;
  banner_color: string;
  admin: Admin;
  operatoroperations: OperatorOperation[];
}

// --- Main Page Component ---
export default function Operations() {
  const { isSidebarCollapsed } = useAppStore();
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionsMenuOpenId, setActionsMenuOpenId] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const { data, loading, error, refetch } = useQuery(GET_OPERATIONS, {
    pollInterval: 5000,
    fetchPolicy: 'network-only'
  });

  const [toggleDelete] = useMutation(TOGGLE_OPERATION_DELETE_MUTATION);

  const handleCreate = () => {
    setShowCreateModal(true);
  };

  const handleEdit = (op: Operation) => {
    setSelectedOperation(op);
    setShowEditModal(true);
    setActionsMenuOpenId(null);
  };

  const handleMembers = (op: Operation) => {
    setSelectedOperation(op);
    setShowMembersModal(true);
    setActionsMenuOpenId(null);
  };

  const handleDeleteRequest = (op: Operation) => {
    setSelectedOperation(op);
    setShowDeleteConfirm(true);
    setActionsMenuOpenId(null);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedOperation) return;
    try {
      await toggleDelete({
        variables: { operation_id: selectedOperation.id, deleted: true }
      });
      snackActions.success("Operation deleted");
      refetch();
    } catch (e: any) {
      snackActions.error("Failed to delete operation: " + e.message);
    }
    setShowDeleteConfirm(false);
  };

  const handleActionsClick = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 5, left: rect.right - 150 }); // Adjust as needed
    setActionsMenuOpenId(actionsMenuOpenId === id ? null : id);
  };

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = () => setActionsMenuOpenId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const columns = [
    {
      header: "STATUS",
      className: "w-24",
      cell: (op: Operation) => (
        <div className="flex items-center gap-2">
            {op.complete ? (
                <span className="flex items-center gap-1 text-gray-500 text-xs border border-gray-600 px-2 py-0.5 rounded-full bg-black/50">
                    <CheckCircle size={10} /> COMPLETE
                </span>
            ) : (
                <span className="flex items-center gap-1 text-green-500 text-xs border border-green-500/50 px-2 py-0.5 rounded-full bg-green-900/10 animate-pulse">
                    <ActivityIcon /> ACTIVE
                </span>
            )}
        </div>
      )
    },
    {
      header: "NAME",
      accessorKey: "name",
      className: "font-bold text-signal",
      cell: (op: Operation) => (
          <div>
              <div className="text-signal">{op.name}</div>
              {op.banner_text && (
                  <div className="text-[10px] px-1 bg-white/10 text-white inline-block mt-1 rounded" style={{ backgroundColor: op.banner_color }}>{op.banner_text}</div>
              )}
          </div>
      )
    },
    {
      header: "ADMIN",
      cell: (op: Operation) => (
        <div className="flex items-center gap-2 text-gray-400">
            <Shield size={14} className="text-yellow-500" />
            <span>{op.admin.username}</span>
        </div>
      )
    },
    {
      header: "MEMBERS",
      cell: (op: Operation) => (
        <div className="flex -space-x-2">
            {op.operatoroperations.map((member, idx) => (
                <div key={member.id} className="w-6 h-6 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center text-[10px] text-gray-300 relative group" title={member.operator.username}>
                    {member.operator.username.charAt(0).toUpperCase()}
                    {member.view_mode === 'lead' && <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-500 rounded-full border border-black"></span>}
                </div>
            ))}
            {op.operatoroperations.length === 0 && <span className="text-gray-600 text-xs italic">None</span>}
        </div>
      )
    },
    {
        header: "",
        className: "w-10",
        cell: (op: Operation) => (
            <div className="relative">
                <button 
                    onClick={(e) => handleActionsClick(e, op.id)}
                    className="p-1 hover:text-signal text-gray-500 transition-colors"
                >
                    <MoreVertical size={16} />
                </button>
                {actionsMenuOpenId === op.id && createPortal(
                    <div 
                        className="fixed z-50 bg-black border border-signal/30 shadow-lg shadow-signal/10 w-40 backdrop-blur-md"
                        style={{ top: menuPosition.top, left: menuPosition.left }}
                    >
                        <div className="p-1 flex flex-col">
                            <button onClick={() => handleEdit(op)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-left text-gray-300 hover:text-signal transition-colors">
                                <Edit size={14} /> Edit Config
                            </button>
                            <button onClick={() => handleMembers(op)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-left text-gray-300 hover:text-signal transition-colors">
                                <Users size={14} /> Manage Members
                            </button>
                            <div className="h-px bg-white/10 my-1" />
                            <button onClick={() => handleDeleteRequest(op)} className="flex items-center gap-2 px-3 py-2 hover:bg-red-900/30 text-xs text-left text-red-400 hover:text-red-300 transition-colors">
                                <Trash2 size={14} /> Delete
                            </button>
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        )
    }
  ];

  return (
    <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
      <Sidebar />
      
      <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className={cn("flex-1 transition-all duration-300 flex flex-col h-screen overflow-hidden", isSidebarCollapsed ? "ml-16" : "ml-64")}
      >
        <div className="p-6 lg:p-12 flex-1 flex flex-col">
        {/* Header (align with PAYLOADS OVERVIEW) */}
        <header className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
                <div className="p-3 border border-signal bg-signal/10 rounded">
                    <Layers size={24} className="text-signal" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-widest text-white uppercase">OPERATIONS MANAGER</h1>
                    <p className="text-xs text-gray-400 font-mono">/root/operations/list</p>
                </div>
            </div>
            <button 
                onClick={handleCreate}
                className="flex items-center gap-2 px-6 py-3 bg-signal text-void font-bold font-mono text-sm hover:bg-white hover:shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all rounded group"
            >
                <Plus size={18} className="group-hover:rotate-90 transition-transform" /> NEW OPERATION
            </button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
            <CyberTable 
                data={data?.operation || []} 
                columns={columns as any} 
                isLoading={loading}
                onRowClick={(row) => handleEdit(row)} 
            />
        </main>
        </div>
      </motion.div>

      {/* Modals */}
      <AnimatePresence>
        {showCreateModal && <CreateOperationModal onClose={() => setShowCreateModal(false)} onSuccess={() => { setShowCreateModal(false); refetch(); }} />}
        {showEditModal && selectedOperation && <EditOperationModal operation={selectedOperation} onClose={() => setShowEditModal(false)} onSuccess={() => { setShowEditModal(false); refetch(); }} />}
        {showMembersModal && selectedOperation && <MembersOperationModal operation={selectedOperation} onClose={() => setShowMembersModal(false)} onSuccess={() => { setShowMembersModal(false); refetch(); }} operators={data?.operator || []} />}
        {showDeleteConfirm && selectedOperation && (
            <ConfirmationModal 
                title="DELETE_OPERATION" 
                message={`Are you sure you want to delete operation "${selectedOperation.name}"? This action cannot be undone.`}
                onConfirm={handleDeleteConfirm} 
                onCancel={() => setShowDeleteConfirm(false)} 
                confirmText="DELETE"
                isDestructive
            />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Helper Components ---

function ActivityIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
    )
}

// --- Modals ---

function ModalBackdrop({ children, onClose }: { children: React.ReactNode, onClose: () => void }) {
    return (
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div 
                initial={{ scale: 0.95, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-void border border-signal/30 w-full max-w-lg shadow-[0_0_30px_rgba(34,211,238,0.1)] relative overflow-hidden"
            >
                {/* Cyberpunk Deco */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-signal to-transparent opacity-50"></div>
                {children}
            </motion.div>
        </motion.div>
    );
}

function CreateOperationModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
    const [name, setName] = useState("");
    const [createOp, { loading }] = useMutation(CREATE_OPERATION_MUTATION);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createOp({ variables: { name } });
            snackActions.success("Operation created successfully");
            onSuccess();
        } catch (e: any) {
            snackActions.error("Failed to create operation: " + e.message);
        }
    };

    return (
        <ModalBackdrop onClose={onClose}>
            <div className="p-6">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Plus className="text-signal" /> CREATE_NEW_OPERATION
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-mono text-gray-500 mb-1">OPERATION_NAME</label>
                        <input 
                            type="text" 
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono"
                            placeholder="MyOperation"
                            autoFocus
                        />
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                        <button 
                            type="submit" 
                            disabled={loading || !name}
                            className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white disabled:opacity-50 transition-colors"
                        >
                            {loading ? "CREATING..." : "INITIALIZE"}
                        </button>
                    </div>
                </form>
            </div>
        </ModalBackdrop>
    );
}

function EditOperationModal({ operation, onClose, onSuccess }: { operation: Operation, onClose: () => void, onSuccess: () => void }) {
    const [name, setName] = useState(operation.name);
    const [complete, setComplete] = useState(operation.complete);
    const [updateOp, { loading }] = useMutation(UPDATE_OPERATION_MUTATION);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await updateOp({ variables: { 
                operation_id: operation.id, 
                name, 
                complete 
            }});
            snackActions.success("Operation updated");
            onSuccess();
        } catch (e: any) {
            snackActions.error("Update failed: " + e.message);
        }
    };

    return (
        <ModalBackdrop onClose={onClose}>
            <div className="p-6">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Edit className="text-signal" /> EDIT_CONFIG: {operation.name}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-mono text-gray-500 mb-1">OPERATION_NAME</label>
                        <input 
                            type="text" 
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono"
                        />
                    </div>
                    <div className="flex items-center gap-3 border border-gray-800 p-3 bg-black/30">
                        <button 
                            type="button" 
                            onClick={() => setComplete(!complete)}
                            className={cn(
                                "w-10 h-5 rounded-full relative transition-colors",
                                complete ? "bg-gray-600" : "bg-green-500"
                            )}
                        >
                            <span className={cn(
                                "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform",
                                complete ? "translate-x-5" : "translate-x-0"
                            )} />
                        </button>
                        <span className="font-mono text-sm">
                            {complete ? "STATUS: COMPLETE (Archived)" : "STATUS: ACTIVE"}
                        </span>
                    </div>
                    
                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white disabled:opacity-50 transition-colors"
                        >
                            {loading ? "UPDATING..." : "SAVE_CHANGES"}
                        </button>
                    </div>
                </form>
            </div>
        </ModalBackdrop>
    );
}

function MembersOperationModal({ operation, operators, onClose, onSuccess }: { operation: Operation, operators: Operator[], onClose: () => void, onSuccess: () => void }) {
    const [selectedOperators, setSelectedOperators] = useState<Set<number>>(new Set(operation.operatoroperations.map(op => op.operator.id)));
    const [updateMembers, { loading }] = useMutation(UPDATE_OPERATION_MEMBERS_MUTATION);

    const handleSubmit = async () => {
        const originalIds = new Set(operation.operatoroperations.map(op => op.operator.id));
        const currentIds = selectedOperators;
        
        const toAdd = [...currentIds].filter(id => !originalIds.has(id));
        const toRemove = [...originalIds].filter(id => !currentIds.has(id));
        
        const viewModeOperators = toAdd; // New users default to operator role

        try {
            await updateMembers({
                variables: {
                    operation_id: operation.id,
                    add_users: toAdd,
                    remove_users: toRemove,
                    view_mode_operators: viewModeOperators
                }
            });
            snackActions.success("Members updated");
            onSuccess();
        } catch (e: any) {
            snackActions.error("Failed to update members: " + e.message);
        }
    };

    const toggleOperator = (id: number) => {
        const newSet = new Set(selectedOperators);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedOperators(newSet);
    };

    return (
        <ModalBackdrop onClose={onClose}>
            <div className="p-6 h-[500px] flex flex-col">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2 shrink-0">
                    <Users className="text-signal" /> MANAGE_MEMBERS
                </h2>
                
                <div className="flex-1 overflow-y-auto cyber-scrollbar border border-gray-800 bg-black/30 p-2 space-y-1">
                    {operators.map(op => {
                        const isMember = selectedOperators.has(op.id);
                        const isAdmin = op.id === operation.admin.id;
                        
                        return (
                            <div 
                                key={op.id} 
                                onClick={() => !isAdmin && toggleOperator(op.id)}
                                className={cn(
                                    "flex items-center justify-between p-3 border border-transparent hover:bg-white/5 cursor-pointer transition-colors",
                                    isMember ? "bg-signal/5 border-signal/20" : "",
                                    isAdmin ? "opacity-50 cursor-not-allowed" : ""
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-4 h-4 border flex items-center justify-center transition-colors",
                                        isMember ? "bg-signal border-signal" : "border-gray-600"
                                    )}>
                                        {isMember && <CheckCircle size={12} className="text-void" />}
                                    </div>
                                    <span className="font-mono text-sm text-gray-300">{op.username}</span>
                                </div>
                                {isAdmin && <span className="text-[10px] text-yellow-500 font-mono">ADMIN (LEAD)</span>}
                                {!isAdmin && isMember && <span className="text-[10px] text-signal font-mono">MEMBER</span>}
                            </div>
                        );
                    })}
                </div>

                <div className="flex justify-end gap-3 mt-6 shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                    <button 
                        type="button" 
                        onClick={handleSubmit}
                        disabled={loading}
                        className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white disabled:opacity-50 transition-colors"
                    >
                        {loading ? "UPDATING..." : "CONFIRM_ACCESS"}
                    </button>
                </div>
            </div>
        </ModalBackdrop>
    );
}

function ConfirmationModal({ title, message, onConfirm, onCancel, confirmText = "CONFIRM", isDestructive = false }: any) {
    return (
        <ModalBackdrop onClose={onCancel}>
            <div className="p-6 max-w-sm">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-signal">
                    <AlertTriangle className={isDestructive ? "text-red-500" : "text-signal"} /> {title}
                </h2>
                <p className="text-sm text-gray-300 mb-6 font-mono">{message}</p>
                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                    <button 
                        onClick={onConfirm}
                        className={cn(
                            "px-6 py-2 font-bold font-mono text-sm hover:opacity-80 transition-opacity",
                            isDestructive ? "bg-red-600 text-white" : "bg-signal text-void"
                        )}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </ModalBackdrop>
    )
}
