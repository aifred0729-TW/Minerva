import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { 
  GET_OPERATORS, 
  CREATE_OPERATOR_MUTATION, 
  UPDATE_OPERATOR_STATUS_MUTATION, 
  UPDATE_OPERATOR_PASSWORD_MUTATION,
  UPDATE_OPERATOR_USERNAME_MUTATION 
} from '../lib/api';
import { Sidebar } from '../components/Sidebar';
import { CyberTable } from '../components/CyberTable';
import { 
  Users, 
  UserPlus, 
  Edit, 
  Trash2, 
  Shield, 
  ShieldOff, 
  CheckCircle, 
  XCircle, 
  Lock, 
  MoreVertical,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { snackActions } from '../../components/utilities/Snackbar';
import { cn } from '../lib/utils';

// --- Types ---
interface Operator {
  id: number;
  username: string;
  active: boolean;
  admin: boolean;
  last_login: string;
  creation_time: string;
  email: string;
  deleted: boolean;
}

// --- Main Page Component ---
export default function UsersPage() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [selectedUser, setSelectedUser] = useState<Operator | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionsMenuOpenId, setActionsMenuOpenId] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const { data, loading, error, refetch } = useQuery(GET_OPERATORS, {
    pollInterval: 10000,
    fetchPolicy: 'network-only'
  });

  const [updateStatus] = useMutation(UPDATE_OPERATOR_STATUS_MUTATION);

  const handleCreate = () => {
    setShowCreateModal(true);
  };

  const handleEdit = (user: Operator) => {
    setSelectedUser(user);
    setShowEditModal(true);
    setActionsMenuOpenId(null);
  };

  const handlePassword = (user: Operator) => {
    setSelectedUser(user);
    setShowPasswordModal(true);
    setActionsMenuOpenId(null);
  };

  const handleToggleActive = async (user: Operator) => {
    try {
        await updateStatus({
            variables: { operator_id: user.id, active: !user.active }
        });
        snackActions.success(`User ${user.active ? 'deactivated' : 'activated'}`);
        refetch();
    } catch (e: any) {
        snackActions.error("Failed to update status: " + e.message);
    }
    setActionsMenuOpenId(null);
  };

  const handleToggleAdmin = async (user: Operator) => {
    try {
        await updateStatus({
            variables: { operator_id: user.id, admin: !user.admin }
        });
        snackActions.success(`User admin privileges ${user.admin ? 'revoked' : 'granted'}`);
        refetch();
    } catch (e: any) {
        snackActions.error("Failed to update admin status: " + e.message);
    }
    setActionsMenuOpenId(null);
  };

  const handleDeleteRequest = (user: Operator) => {
    setSelectedUser(user);
    setShowDeleteConfirm(true);
    setActionsMenuOpenId(null);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedUser) return;
    try {
        await updateStatus({
            variables: { operator_id: selectedUser.id, deleted: true }
        });
        snackActions.success("User deleted");
        refetch();
    } catch (e: any) {
        snackActions.error("Failed to delete user: " + e.message);
    }
    setShowDeleteConfirm(false);
  };

  const handleActionsClick = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 5, left: rect.right - 160 });
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
        header: "ID",
        accessorKey: "id",
        className: "w-16 font-mono text-gray-500"
    },
    {
      header: "USERNAME",
      accessorKey: "username",
      className: "font-bold text-signal",
      cell: (user: Operator) => (
          <div className="flex items-center gap-2">
              <span className="text-signal">{user.username}</span>
              {user.admin && <Shield size={12} className="text-yellow-500" />}
          </div>
      )
    },
    {
      header: "STATUS",
      cell: (user: Operator) => (
        <div className="flex items-center gap-2">
            {user.active ? (
                <span className="flex items-center gap-1 text-green-500 text-xs border border-green-500/50 px-2 py-0.5 rounded-full bg-green-900/10 animate-pulse">
                    <CheckCircle size={10} /> ACTIVE
                </span>
            ) : (
                <span className="flex items-center gap-1 text-red-500 text-xs border border-red-500/50 px-2 py-0.5 rounded-full bg-red-900/10">
                    <XCircle size={10} /> INACTIVE
                </span>
            )}
        </div>
      )
    },
    {
        header: "LAST LOGIN",
        accessorKey: "last_login",
        className: "font-mono text-xs text-gray-400",
        cell: (user: Operator) => user.last_login ? new Date(user.last_login).toLocaleString() : "NEVER"
    },
    {
        header: "",
        className: "w-10",
        cell: (user: Operator) => (
            <div className="relative">
                <button 
                    onClick={(e) => handleActionsClick(e, user.id)}
                    className="p-1 hover:text-signal text-gray-500 transition-colors"
                >
                    <MoreVertical size={16} />
                </button>
                {actionsMenuOpenId === user.id && createPortal(
                    <div 
                        className="fixed z-50 bg-black border border-signal/30 shadow-lg shadow-signal/10 w-40 backdrop-blur-md"
                        style={{ top: menuPosition.top, left: menuPosition.left }}
                    >
                        <div className="p-1 flex flex-col">
                            <button onClick={() => handleEdit(user)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-left text-gray-300 hover:text-signal transition-colors">
                                <Edit size={14} /> Edit Profile
                            </button>
                            <button onClick={() => handlePassword(user)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-left text-gray-300 hover:text-signal transition-colors">
                                <Lock size={14} /> Change Password
                            </button>
                            <div className="h-px bg-white/10 my-1" />
                            <button onClick={() => handleToggleActive(user)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-left text-gray-300 hover:text-signal transition-colors">
                                {user.active ? <XCircle size={14} className="text-red-400"/> : <CheckCircle size={14} className="text-green-400"/>} 
                                {user.active ? "Deactivate" : "Activate"}
                            </button>
                            <button onClick={() => handleToggleAdmin(user)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-left text-gray-300 hover:text-signal transition-colors">
                                {user.admin ? <ShieldOff size={14} className="text-yellow-500"/> : <Shield size={14} className="text-yellow-500"/>} 
                                {user.admin ? "Revoke Admin" : "Make Admin"}
                            </button>
                            <div className="h-px bg-white/10 my-1" />
                            <button onClick={() => handleDeleteRequest(user)} className="flex items-center gap-2 px-3 py-2 hover:bg-red-900/30 text-xs text-left text-red-400 hover:text-red-300 transition-colors">
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
    <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void flex">
      <Sidebar isCollapsed={isSidebarCollapsed} setIsCollapsed={setIsSidebarCollapsed} />
      
      <div className={cn("flex-1 transition-all duration-300 flex flex-col", isSidebarCollapsed ? "ml-16" : "ml-64")}>
        {/* Header */}
        <header className="h-20 border-b border-ghost/30 flex items-center justify-between px-8 bg-black/40 backdrop-blur-sm sticky top-0 z-40">
            <div className="flex items-center gap-4">
                <Users className="text-signal" />
                <h1 className="text-xl font-bold tracking-wider">USER_MANAGEMENT</h1>
            </div>
            <button 
                onClick={handleCreate}
                className="flex items-center gap-2 px-4 py-2 bg-signal/10 border border-signal/50 text-signal hover:bg-signal hover:text-void transition-all font-mono text-sm group"
            >
                <UserPlus size={16} />
                NEW_OPERATOR
            </button>
        </header>

        {/* Content */}
        <main className="p-8 flex-1 overflow-y-auto">
            <CyberTable 
                data={data?.operator || []} 
                columns={columns as any} 
                isLoading={loading}
                onRowClick={(row) => handleEdit(row)}
            />
        </main>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showCreateModal && <CreateUserModal onClose={() => setShowCreateModal(false)} onSuccess={() => { setShowCreateModal(false); refetch(); }} />}
        {showEditModal && selectedUser && <EditUserModal user={selectedUser} onClose={() => setShowEditModal(false)} onSuccess={() => { setShowEditModal(false); refetch(); }} />}
        {showPasswordModal && selectedUser && <ChangePasswordModal user={selectedUser} onClose={() => setShowPasswordModal(false)} onSuccess={() => { setShowPasswordModal(false); refetch(); }} />}
        {showDeleteConfirm && selectedUser && (
            <ConfirmationModal 
                title="DELETE_USER" 
                message={`Are you sure you want to delete user "${selectedUser.username}"? This action cannot be undone.`}
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
                className="bg-void border border-signal/30 w-full max-w-md shadow-[0_0_30px_rgba(34,211,238,0.1)] relative overflow-hidden"
            >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-signal to-transparent opacity-50"></div>
                {children}
            </motion.div>
        </motion.div>
    );
}

function CreateUserModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [email, setEmail] = useState("");
    const [createOp, { loading }] = useMutation(CREATE_OPERATOR_MUTATION);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (password !== confirmPassword) {
            snackActions.error("Passwords do not match");
            return;
        }

        try {
            const variables: any = {
                username,
                password,
                email: email || "",
                bot: false
            };
            console.log("Creating operator with variables:", variables);
            const { data } = await createOp({ variables });
            console.log("Create operator response:", data);
            
            if (data?.createOperator?.status === 'success') {
                snackActions.success("Operator created successfully");
                onSuccess();
            } else {
                snackActions.error("Failed to create operator: " + (data?.createOperator?.error || "Unknown error"));
            }
        } catch (e: any) {
            console.error("Create operator error:", e);
            snackActions.error("Failed to create operator: " + e.message);
        }
    };

    return (
        <ModalBackdrop onClose={onClose}>
            <div className="p-6">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <UserPlus className="text-signal" /> NEW_OPERATOR
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-mono text-gray-500 mb-1">USERNAME</label>
                        <input 
                            type="text" 
                            value={username} 
                            onChange={(e) => setUsername(e.target.value)} 
                            className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-mono text-gray-500 mb-1">PASSWORD</label>
                        <input 
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-mono text-gray-500 mb-1">CONFIRM PASSWORD</label>
                        <input 
                            type="password" 
                            value={confirmPassword} 
                            onChange={(e) => setConfirmPassword(e.target.value)} 
                            className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-mono text-gray-500 mb-1">EMAIL (Optional)</label>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono"
                        />
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                        <button 
                            type="submit" 
                            disabled={loading || !username || !password || !confirmPassword}
                            className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white disabled:opacity-50 transition-colors"
                        >
                            {loading ? "CREATING..." : "CREATE"}
                        </button>
                    </div>
                </form>
            </div>
        </ModalBackdrop>
    );
}

function EditUserModal({ user, onClose, onSuccess }: { user: Operator, onClose: () => void, onSuccess: () => void }) {
    const [username, setUsername] = useState(user.username);
    const [updateUser, { loading }] = useMutation(UPDATE_OPERATOR_USERNAME_MUTATION);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await updateUser({ variables: { id: user.id, username } });
            snackActions.success("Profile updated");
            onSuccess();
        } catch (e: any) {
            snackActions.error("Update failed: " + e.message);
        }
    };

    return (
        <ModalBackdrop onClose={onClose}>
            <div className="p-6">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Edit className="text-signal" /> EDIT_PROFILE
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-mono text-gray-500 mb-1">USERNAME</label>
                        <input 
                            type="text" 
                            value={username} 
                            onChange={(e) => setUsername(e.target.value)} 
                            className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono"
                            required
                        />
                    </div>
                    
                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white disabled:opacity-50 transition-colors"
                        >
                            {loading ? "SAVING..." : "SAVE_CHANGES"}
                        </button>
                    </div>
                </form>
            </div>
        </ModalBackdrop>
    );
}

function ChangePasswordModal({ user, onClose, onSuccess }: { user: Operator, onClose: () => void, onSuccess: () => void }) {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [email, setEmail] = useState(user.email || "");
    const [updatePass, { loading }] = useMutation(UPDATE_OPERATOR_PASSWORD_MUTATION);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (password !== confirmPassword) {
            snackActions.error("Passwords do not match");
            return;
        }

        try {
            await updatePass({ variables: { user_id: user.id, new_password: password, email } });
            snackActions.success("Credentials updated");
            onSuccess();
        } catch (e: any) {
            snackActions.error("Update failed: " + e.message);
        }
    };

    return (
        <ModalBackdrop onClose={onClose}>
            <div className="p-6">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Lock className="text-signal" /> UPDATE_CREDENTIALS
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-mono text-gray-500 mb-1">NEW_PASSWORD</label>
                        <input 
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-mono text-gray-500 mb-1">CONFIRM_PASSWORD</label>
                        <input 
                            type="password" 
                            value={confirmPassword} 
                            onChange={(e) => setConfirmPassword(e.target.value)} 
                            className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-mono text-gray-500 mb-1">EMAIL</label>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono"
                        />
                    </div>
                    
                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                        <button 
                            type="submit" 
                            disabled={loading || !password || !confirmPassword}
                            className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white disabled:opacity-50 transition-colors"
                        >
                            {loading ? "UPDATING..." : "UPDATE"}
                        </button>
                    </div>
                </form>
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
