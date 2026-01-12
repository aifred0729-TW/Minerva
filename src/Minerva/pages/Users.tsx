import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useLazyQuery } from '@apollo/client';
import { 
  GET_OPERATORS, 
  CREATE_OPERATOR_MUTATION, 
  UPDATE_OPERATOR_STATUS_MUTATION, 
  UPDATE_OPERATOR_PASSWORD_MUTATION,
  UPDATE_OPERATOR_USERNAME_MUTATION,
  GET_INVITE_LINKS,
  CREATE_INVITE_LINK,
  UPDATE_INVITE_LINK,
  GET_OPERATIONS_LIST
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
  AlertTriangle,
  Link2,
  Plus,
  Copy,
  Edit3,
  RefreshCw,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { snackActions } from '../../Archive/components/utilities/Snackbar';
import { copyStringToClipboard } from '../../Archive/components/utilities/Clipboard';
import { cn } from '../lib/utils';
import { useAppStore } from '../store';

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
  const { isSidebarCollapsed } = useAppStore();
  const [activeTab, setActiveTab] = useState<'users' | 'invites'>('users');
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
    <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
      <Sidebar />
      
      <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className={cn("transition-all duration-300 p-6 lg:p-12 h-screen flex flex-col overflow-hidden", isSidebarCollapsed ? "ml-16" : "ml-64")}
      >
        {/* Header */}
        <header className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
                <div className="p-3 border border-signal bg-signal/10 rounded">
                    <Users size={24} className="text-signal" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-widest">USER MANAGEMENT</h1>
                    <p className="text-xs text-gray-400 font-mono">/root/users/admin</p>
                </div>
            </div>
            {activeTab === 'users' && (
                <button 
                    onClick={handleCreate}
                    className="flex items-center gap-2 px-6 py-3 bg-signal text-void font-bold font-mono text-sm hover:bg-white hover:shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all rounded"
                >
                    <UserPlus size={18} /> NEW OPERATOR
                </button>
            )}
        </header>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-signal/20">
            <button
                onClick={() => setActiveTab('users')}
                className={cn(
                    "flex items-center gap-2 px-6 py-3 text-sm font-medium uppercase tracking-wider transition-colors border-b-2 -mb-px",
                    activeTab === 'users'
                        ? 'text-signal border-signal'
                        : 'text-gray-500 border-transparent hover:text-gray-300'
                )}
            >
                <Users size={16} />
                Operators
            </button>
            <button
                onClick={() => setActiveTab('invites')}
                className={cn(
                    "flex items-center gap-2 px-6 py-3 text-sm font-medium uppercase tracking-wider transition-colors border-b-2 -mb-px",
                    activeTab === 'invites'
                        ? 'text-signal border-signal'
                        : 'text-gray-500 border-transparent hover:text-gray-300'
                )}
            >
                <Link2 size={16} />
                Invite Links
            </button>
        </div>

        {/* Content */}
        <main className="">
          {activeTab === 'users' && (
            <CyberTable 
              data={[...(data?.operator || [])].sort((a: Operator, b: Operator) => a.id - b.id)} 
              columns={columns as any} 
              isLoading={loading}
              onRowClick={(row) => handleEdit(row)}
            />
          )}
          {activeTab === 'invites' && <InviteLinksSection />}
        </main>
      </motion.div>

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

// ===== Invite Links Section =====
const InviteLinksSection = () => {
    const [inviteLinks, setInviteLinks] = useState<any[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingLink, setEditingLink] = useState<any>(null);
    const [operations, setOperations] = useState<any[]>([]);

    const [getInviteLinks, { loading }] = useLazyQuery(GET_INVITE_LINKS, {
        fetchPolicy: 'no-cache',
        onCompleted: (data) => {
            if (data.getInviteLinks?.status === 'error') {
                snackActions.error(data.getInviteLinks.error);
                return;
            }
            const links = [...(data.getInviteLinks?.links || [])];
            links.sort((a: any, b: any) => (a.valid ? -1 : b.valid ? 1 : 0));
            setInviteLinks(links);
        }
    });

    useQuery(GET_OPERATIONS_LIST, {
        onCompleted: (data) => {
            const ops = data.operation?.filter((o: any) => !o.deleted && !o.complete) || [];
            ops.sort((a: any, b: any) => a.name.localeCompare(b.name));
            setOperations(ops);
        }
    });

    useEffect(() => {
        getInviteLinks();
    }, []);

    const handleCopyLink = (link: string) => {
        copyStringToClipboard(link);
        snackActions.success('Link copied to clipboard');
    };

    const handleRefresh = () => {
        getInviteLinks();
    };

    return (
        <div className="space-y-4">
            {/* Header with Create Button */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                    Generate invite links for new operators to register
                </p>
                <div className="flex gap-2">
                    <button
                        onClick={handleRefresh}
                        className="p-2 border border-signal/30 text-signal hover:bg-signal/10 transition-colors"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => {
                            setEditingLink(null);
                            setShowCreateModal(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-signal text-black text-sm font-medium uppercase tracking-wider hover:bg-signal/80 transition-colors"
                    >
                        <Plus size={16} />
                        Generate Link
                    </button>
                </div>
            </div>

            {/* Links Table */}
            <div className="border border-signal/20 overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-signal/10 border-b border-signal/20">
                            <th className="px-4 py-3 text-left text-xs font-medium text-signal uppercase tracking-wider">Code</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-signal uppercase tracking-wider">Name</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-signal uppercase tracking-wider">Creator</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-signal uppercase tracking-wider">Assignment</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-signal uppercase tracking-wider">Usage</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-signal uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {inviteLinks.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">
                                    No invite links generated yet
                                </td>
                            </tr>
                        ) : (
                            inviteLinks.map((link: any) => (
                                <tr 
                                    key={link.code} 
                                    className={`border-b border-signal/10 hover:bg-signal/5 transition-colors ${
                                        !link.valid ? 'opacity-50' : ''
                                    }`}
                                >
                                    <td className="px-4 py-3">
                                        <span className={`text-sm font-mono ${!link.valid ? 'line-through text-gray-500' : 'text-white'}`}>
                                            {link.code}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-300">{link.name || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-300">{link.operator}</td>
                                    <td className="px-4 py-3 text-sm text-gray-300">
                                        {link.operation_id > 0 ? (
                                            <span className="text-signal">{link.operation_role}</span>
                                        ) : '-'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-sm font-medium ${
                                            link.used >= link.total ? 'text-red-400' : 'text-green-400'
                                        }`}>
                                            {link.used}
                                        </span>
                                        <span className="text-gray-500"> / {link.total}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-center gap-1">
                                            {link.valid && (
                                                <button
                                                    onClick={() => handleCopyLink(link.link)}
                                                    className="p-1.5 text-gray-400 hover:text-signal hover:bg-signal/10 transition-colors"
                                                    title="Copy Link"
                                                >
                                                    <Copy size={14} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    setEditingLink(link);
                                                    setShowCreateModal(true);
                                                }}
                                                className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
                                                title="Edit"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create/Edit Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <InviteLinkModal
                        onClose={() => {
                            setShowCreateModal(false);
                            setEditingLink(null);
                            getInviteLinks();
                        }}
                        existingLink={editingLink}
                        operations={operations}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

// ===== Invite Link Modal =====
const InviteLinkModal = ({ 
    onClose, 
    existingLink, 
    operations 
}: { 
    onClose: () => void; 
    existingLink: any; 
    operations: any[];
}) => {
    const isCreate = !existingLink;
    const [formData, setFormData] = useState({
        name: existingLink?.name || '',
        short_code: existingLink?.code || '',
        operation_id: existingLink?.operation_id || 0,
        operation_role: existingLink?.operation_role || 'spectator',
        total: existingLink?.total || 1,
    });

    const [createLink] = useMutation(CREATE_INVITE_LINK, {
        onCompleted: (result) => {
            if (result.createInviteLink.status === 'success') {
                copyStringToClipboard(result.createInviteLink.link);
                snackActions.success('Invite link created and copied to clipboard');
                onClose();
            } else {
                snackActions.error(result.createInviteLink.error);
            }
        },
        onError: () => {
            snackActions.error('Failed to create invite link');
        }
    });

    const [updateLink] = useMutation(UPDATE_INVITE_LINK, {
        onCompleted: (result) => {
            if (result.updateInviteLink.status === 'success') {
                snackActions.success('Invite link updated');
                onClose();
            } else {
                snackActions.error(result.updateInviteLink.error);
            }
        },
        onError: () => {
            snackActions.error('Failed to update invite link');
        }
    });

    const handleSubmit = () => {
        if (isCreate) {
            createLink({ variables: formData });
        } else {
            updateLink({ variables: { code: formData.short_code, total: formData.total } });
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-black border border-signal/40 w-full max-w-lg"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-signal/20">
                    <h2 className="text-lg font-medium text-white uppercase tracking-wider">
                        {isCreate ? 'Create' : 'Edit'} Invite Link
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <div className="p-6 space-y-4">
                    <div className="text-xs text-yellow-500/80 flex items-center gap-2 mb-4">
                        <AlertTriangle size={14} />
                        <span>Note: Invite links are deleted if Mythic restarts</span>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                            Invite Code Name
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            disabled={!isCreate}
                            className="w-full bg-black/60 border border-signal/30 px-3 py-2 text-sm text-white focus:outline-none focus:border-signal disabled:opacity-50"
                            placeholder="Descriptive name for link..."
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                            Custom Invite Code
                        </label>
                        <input
                            type="text"
                            value={formData.short_code}
                            onChange={(e) => setFormData({ ...formData, short_code: e.target.value })}
                            disabled={!isCreate}
                            className="w-full bg-black/60 border border-signal/30 px-3 py-2 text-sm text-white focus:outline-none focus:border-signal disabled:opacity-50"
                            placeholder="Custom code (optional)..."
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                            Assign to Operation
                        </label>
                        <select
                            value={formData.operation_id}
                            onChange={(e) => setFormData({ ...formData, operation_id: parseInt(e.target.value) })}
                            disabled={!isCreate}
                            className="w-full bg-black/60 border border-signal/30 px-3 py-2 text-sm text-white focus:outline-none focus:border-signal disabled:opacity-50"
                        >
                            <option value={0}>No operation assignment</option>
                            {operations.map((op) => (
                                <option key={op.id} value={op.id}>{op.name}</option>
                            ))}
                        </select>
                    </div>

                    {formData.operation_id > 0 && (
                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                                Operation Role
                            </label>
                            <select
                                value={formData.operation_role}
                                onChange={(e) => setFormData({ ...formData, operation_role: e.target.value })}
                                disabled={!isCreate}
                                className="w-full bg-black/60 border border-signal/30 px-3 py-2 text-sm text-white focus:outline-none focus:border-signal disabled:opacity-50"
                            >
                                <option value="spectator">Spectator</option>
                                <option value="operator">Operator</option>
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                            Total Uses Allowed
                        </label>
                        <input
                            type="number"
                            min={1}
                            value={formData.total}
                            onChange={(e) => setFormData({ ...formData, total: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="w-full bg-black/60 border border-signal/30 px-3 py-2 text-sm text-white focus:outline-none focus:border-signal"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-signal/20">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-6 py-2 bg-signal text-black text-sm font-medium uppercase tracking-wider hover:bg-signal/80 transition-colors"
                    >
                        {isCreate ? 'Create' : 'Update'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};
