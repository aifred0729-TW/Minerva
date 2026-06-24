import React, { useState, useEffect, useMemo } from 'react'
import { useMutation } from "@apollo/client/react";
import { useQueryCompat as useQuery, useLazyQueryCompat as useLazyQuery} from "../lib/useQueryCompat";
import { usePageVisible } from '../lib/usePageVisible';
import {
    GET_OPERATORS,
    CREATE_OPERATOR_MUTATION,
    UPDATE_OPERATOR_STATUS_MUTATION,
    UPDATE_OPERATOR_PASSWORD_MUTATION,
    UPDATE_OPERATOR_USERNAME_MUTATION,
    GET_INVITE_LINKS,
    CREATE_INVITE_LINK,
    UPDATE_INVITE_LINK,
    GET_OPERATIONS_LIST,
}from '../lib/api';
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
    AlertTriangle,
    Link2,
    Plus,
    Copy,
    Edit3,
    RefreshCw,
    X,
    Search,
    Mail,
    Crown,
    Hash,
    Clock,
    Activity,
}from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { snackActions } from '../lib/snackbar';
import { copyStringToClipboard } from '../lib/clipboard';
import { cn, getErrorMessage } from '../lib/utils';
import { useAppStore } from '../store';
import type { Operator }from '../types/operations';
import { ConfirmDialog } from '../components/ConfirmDialog';

// ============================================
// Page
// ============================================
export default function UsersPage() {
  const isSidebarCollapsed = useAppStore(s => s.isSidebarCollapsed);
  const pageVisible = usePageVisible();
  const [activeTab, setActiveTab] = useState<'users' | 'invites'>('users');
  const [selectedUser, setSelectedUser] = useState<Operator | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'admin'>('all');

  const POLL_INTERVAL_MS = 10_000;

  const { data, loading, refetch } = useQuery<any>(GET_OPERATORS, {
    pollInterval: pageVisible ? POLL_INTERVAL_MS : 0,
    fetchPolicy: 'network-only'
  });

  const [updateStatus] = useMutation<any>(UPDATE_OPERATOR_STATUS_MUTATION);

  const operators: Operator[] = useMemo(
    () => [...(data?.operator || [])].sort((a: Operator, b: Operator) => a.id - b.id),
    [data]
  );

  const stats = useMemo(() => {
    const total    = operators.length;
    const active   = operators.filter(o => o.active).length;
    const admins   = operators.filter(o => o.admin).length;
    const inactive = total - active;
    return { total, active, admins, inactive };
  }, [operators]);

  const filteredOperators = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return operators.filter(o => {
      if (q && !o.username.toLowerCase().includes(q)) return false;
      if (statusFilter === 'active'   && !o.active) return false;
      if (statusFilter === 'inactive' &&  o.active) return false;
      if (statusFilter === 'admin'    && !o.admin)  return false;
      return true;
    });
  }, [operators, searchQuery, statusFilter]);

  const handleCreate   = () => setShowCreateModal(true);
  const handleEdit     = (user: Operator) => { setSelectedUser(user); setShowEditModal(true); };
  const handlePassword = (user: Operator) => { setSelectedUser(user); setShowPasswordModal(true); };

  const handleToggleActive = async (user: Operator) => {
    try {
      await updateStatus({ variables: { operator_id: user.id, active: !user.active } });
      snackActions.success(`User ${user.active ? 'deactivated' : 'activated'}`);
      refetch();
    } catch (e) {
      snackActions.error("Failed to update status: " + getErrorMessage(e));
    }
  };

  const handleToggleAdmin = async (user: Operator) => {
    try {
      await updateStatus({ variables: { operator_id: user.id, admin: !user.admin } });
      snackActions.success(`User admin privileges ${user.admin ? 'revoked' : 'granted'}`);
      refetch();
    } catch (e) {
      snackActions.error("Failed to update admin status: " + getErrorMessage(e));
    }
  };

  const handleDeleteRequest = (user: Operator) => { setSelectedUser(user); setShowDeleteConfirm(true); };
  const handleDeleteConfirm = async () => {
    if (!selectedUser) return;
    try {
      await updateStatus({ variables: { operator_id: selectedUser.id, deleted: true } });
      snackActions.success("User deleted");
      refetch();
    } catch (e) {
      snackActions.error("Failed to delete user: " + getErrorMessage(e));
    }
    setShowDeleteConfirm(false);
  };

  return (
    <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className={cn("transition-all duration-300 p-6 lg:p-12 h-screen flex flex-col overflow-hidden", isSidebarCollapsed ? "ml-16" : "ml-64")}
      >
        {/* ── Header ───────────────────────────────────────────────── */}
        <header className="flex justify-between items-center mb-6 shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 border border-white/50 bg-white/10 rounded">
              <Users size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-widest text-white uppercase">USER MANAGEMENT</h1>
              <p className="text-xs text-white/95 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                USER ADMINISTRATION
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="p-2 border border-white/25 hover:border-signal text-white/80 hover:text-signal transition-colors rounded-full"
              title="Refresh"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            {activeTab === 'users' && (
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 px-4 py-2 bg-signal/15 border border-signal/40 text-signal text-xs font-mono font-bold uppercase tracking-wider hover:bg-signal/25 transition-colors rounded"
              >
                <UserPlus size={14} /> NEW OPERATOR
              </button>
            )}
          </div>
        </header>

        {/* ── Tabs ─────────────────────────────────────────────────── */}
        <div className="flex gap-1 mb-4 border-b border-signal/20 shrink-0">
          <button
            onClick={() => setActiveTab('users')}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 text-xs font-mono font-medium uppercase tracking-wider transition-colors border-b-2 -mb-px",
              activeTab === 'users'
                ? 'text-signal border-signal'
                : 'text-white/70 border-transparent hover:text-white/95'
            )}
          >
            <Users size={14} />
            Operators
            <span className="ml-1 text-[10px] text-white/55">({operators.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('invites')}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 text-xs font-mono font-medium uppercase tracking-wider transition-colors border-b-2 -mb-px",
              activeTab === 'invites'
                ? 'text-signal border-signal'
                : 'text-white/70 border-transparent hover:text-white/95'
            )}
          >
            <Link2 size={14} />
            Invite Links
          </button>
        </div>

        {/* ── Operators Tab ────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="flex-1 overflow-auto pr-1 min-h-0">
            {/* Stats strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard label="TOTAL"    value={stats.total}    icon={<Users size={14} />}     accent="signal" />
              <StatCard label="ACTIVE"   value={stats.active}   icon={<CheckCircle size={14} />} accent="green" />
              <StatCard label="INACTIVE" value={stats.inactive} icon={<XCircle size={14} />}    accent="red" />
              <StatCard label="ADMINS"   value={stats.admins}   icon={<Crown size={14} />}      accent="yellow" />
            </div>

            {/* Search & filter */}
            <div className="flex flex-wrap items-center gap-3 mb-4 px-4 py-3 bg-black/30 border border-white/10 rounded-lg">
              <div className="relative flex-1 max-w-md min-w-[200px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70" />
                <input
                  type="text"
                  placeholder="Filter by username…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded pl-9 pr-9 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-signal/50"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/55 hover:text-white/95">
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="flex items-center bg-black/40 border border-white/10 rounded overflow-hidden">
                {(['all', 'active', 'inactive', 'admin'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors',
                      statusFilter === f
                        ? 'bg-signal/20 text-signal'
                        : 'text-white/70 hover:text-white/95'
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-[10px] text-white/55 font-mono">
                showing <span className="text-signal">{filteredOperators.length}</span> of <span className="text-white/95">{operators.length}</span>
              </span>
            </div>

            {/* Operator cards grid */}
            {loading && operators.length === 0 ? (
              <div className="flex items-center justify-center py-20 text-white/55 font-mono text-xs animate-pulse">
                FETCHING_DATA…
              </div>
            ) : filteredOperators.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-white/45">
                <Users size={40} className="mb-3 opacity-40" />
                <span className="font-mono text-xs">
                  {searchQuery ? 'No operators match your search' : 'No operators found'}
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pb-4">
                {filteredOperators.map(user => (
                  <OperatorCard
                    key={user.id}
                    user={user}
                    onEdit={() => handleEdit(user)}
                    onPassword={() => handlePassword(user)}
                    onToggleActive={() => handleToggleActive(user)}
                    onToggleAdmin={() => handleToggleAdmin(user)}
                    onDelete={() => handleDeleteRequest(user)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Invite Links Tab ─────────────────────────────────────── */}
        {activeTab === 'invites' && <InviteLinksSection />}
      </motion.div>

      {/* ── Modals ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCreateModal && <CreateUserModal onClose={() => setShowCreateModal(false)} onSuccess={() => { setShowCreateModal(false); refetch(); }} />}
        {showEditModal && selectedUser && <EditUserModal user={selectedUser} onClose={() => setShowEditModal(false)} onSuccess={() => { setShowEditModal(false); refetch(); }} />}
        {showPasswordModal && selectedUser && <ChangePasswordModal user={selectedUser} onClose={() => setShowPasswordModal(false)} onSuccess={() => { setShowPasswordModal(false); refetch(); }} />}
        {showDeleteConfirm && selectedUser && (
          <ConfirmDialog
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

// ============================================
// StatCard
// ============================================
const ACCENT_MAP: Record<string, { text: string; border: string; bg: string }> = {
  signal: { text: 'text-signal',      border: 'border-signal/30',    bg: 'bg-signal/10' },
  green:  { text: 'text-green-400',   border: 'border-green-500/30', bg: 'bg-green-500/10' },
  red:    { text: 'text-red-400',     border: 'border-red-500/30',   bg: 'bg-red-500/10' },
  yellow: { text: 'text-yellow-400',  border: 'border-yellow-500/30',bg: 'bg-yellow-500/10' },
};

const StatCard = ({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent: keyof typeof ACCENT_MAP }) => {
  const a = ACCENT_MAP[accent];
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3 bg-black/30 border rounded-lg", a.border)}>
      <div className={cn("p-2 rounded", a.bg, a.text)}>{icon}</div>
      <div className="min-w-0">
        <div className={cn("text-[10px] font-mono uppercase tracking-widest", a.text)}>{label}</div>
        <div className="text-2xl font-mono font-bold text-white leading-none mt-0.5">{value}</div>
      </div>
    </div>
  );
};

// ============================================
// OperatorCard
// ============================================
const OperatorCard = ({
  user, onEdit, onPassword, onToggleActive, onToggleAdmin, onDelete,
}: {
  user: Operator;
  onEdit: () => void;
  onPassword: () => void;
  onToggleActive: () => void;
  onToggleAdmin: () => void;
  onDelete: () => void;
}) => {
  const accent = user.admin ? 'border-yellow-500/40' : (user.active ? 'border-signal/30' : 'border-white/10');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'bg-black/30 border rounded-lg overflow-hidden transition-colors hover:border-signal/50',
        accent
      )}
    >
      {/* Top: identity */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-signal/15 border border-signal/40 flex items-center justify-center text-signal font-mono font-bold text-sm shrink-0">
          {user.username.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-mono font-bold text-white truncate">{user.username}</span>
            {user.admin && (
              <span title="Administrator" className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-yellow-500/15 text-yellow-300 border border-yellow-500/40 rounded">
                <Crown size={9} /> ADMIN
              </span>
            )}
          </div>
          <div className="text-[10px] font-mono text-white/55 mt-0.5 flex items-center gap-2">
            <Hash size={9} />ID {String(user.id).padStart(3, '0')}
            {user.email && (
              <>
                <span className="text-white/45">·</span>
                <Mail size={9} />
                <span className="truncate">{user.email}</span>
              </>
            )}
          </div>
        </div>
        {/* Status pill (top-right) */}
        {user.active ? (
          <span className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-green-500/15 text-green-300 border border-green-500/40 rounded shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            ACTIVE
          </span>
        ) : (
          <span className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/40 rounded shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            INACTIVE
          </span>
        )}
      </div>

      {/* Middle: meta */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-2 text-[10px] font-mono">
        <div>
          <div className="text-white/55 uppercase tracking-wider mb-0.5 flex items-center gap-1"><Clock size={9} /> Last Login</div>
          <div className="text-white/95">
            {user.last_login ? new Date(user.last_login).toLocaleString() : <span className="text-white/45">Never</span>}
          </div>
        </div>
        <div>
          <div className="text-white/55 uppercase tracking-wider mb-0.5 flex items-center gap-1"><Activity size={9} /> Created</div>
          <div className="text-white/95">
            {user.creation_time ? new Date(user.creation_time).toLocaleDateString() : <span className="text-white/45">—</span>}
          </div>
        </div>
      </div>

      {/* Bottom: action bar */}
      <div className="border-t border-white/10 px-2 py-1.5 flex items-center gap-1 bg-black/20">
        <ActionButton onClick={onEdit}        icon={<Edit size={13} />}     label="Edit"     accent="signal" />
        <ActionButton onClick={onPassword}    icon={<Lock size={13} />}     label="Password" accent="signal" />
        <ActionButton
          onClick={onToggleAdmin}
          icon={user.admin ? <ShieldOff size={13} /> : <Shield size={13} />}
          label={user.admin ? 'Revoke' : 'Admin'}
          accent="yellow"
        />
        <ActionButton
          onClick={onToggleActive}
          icon={user.active ? <XCircle size={13} /> : <CheckCircle size={13} />}
          label={user.active ? 'Disable' : 'Enable'}
          accent={user.active ? 'red' : 'green'}
        />
        <span className="flex-1" />
        <ActionButton onClick={onDelete} icon={<Trash2 size={13} />} label="Delete" accent="red" iconOnly />
      </div>
    </motion.div>
  );
};

const BTN_ACCENT: Record<string, string> = {
  signal: 'text-white/80 hover:text-signal hover:bg-signal/10',
  yellow: 'text-white/80 hover:text-yellow-300 hover:bg-yellow-500/10',
  green:  'text-white/80 hover:text-green-300 hover:bg-green-500/10',
  red:    'text-white/80 hover:text-red-300 hover:bg-red-500/10',
};

const ActionButton = ({ onClick, icon, label, accent, iconOnly = false }: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent: keyof typeof BTN_ACCENT;
  iconOnly?: boolean;
}) => (
  <button
    onClick={onClick}
    title={label}
    className={cn(
      'flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono uppercase tracking-wider transition-colors',
      BTN_ACCENT[accent]
    )}
  >
    {icon}
    {!iconOnly && <span>{label}</span>}
  </button>
);

// ============================================
// Modal scaffolding
// ============================================
function ModalShell({ children, onClose, accent = 'signal' }: { children: React.ReactNode; onClose: () => void; accent?: 'signal' | 'yellow' | 'red' }) {
  const borderClr = accent === 'yellow' ? 'border-yellow-500/40' : accent === 'red' ? 'border-red-500/40' : 'border-signal/30';
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className={cn("bg-void border w-full max-w-md relative rounded-lg overflow-hidden", borderClr)}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

const FieldLabel = ({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) => (
  <label className="text-[10px] text-cyan-300 font-mono font-bold tracking-widest mb-1 flex items-center gap-1.5 uppercase">
    {icon}
    {children}
  </label>
);

const TextInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={cn(
      "w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-signal/60 font-mono",
      props.className
    )}
  />
);

// ============================================
// CreateUserModal
// ============================================
function CreateUserModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [username, setUsername]               = useState("");
  const [password, setPassword]               = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail]                     = useState("");
  const [createOp, { loading }] = useMutation<any>(CREATE_OPERATOR_MUTATION);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { snackActions.error("Passwords do not match"); return; }
    try {
      const { data } = await createOp({ variables: { username, password, email: email || "", bot: false } });
      if (data?.createOperator?.status === 'success') { snackActions.success("Operator created"); onSuccess(); }
      else snackActions.error("Failed to create operator: " + (data?.createOperator?.error || "Unknown error"));
    } catch (e) {
      snackActions.error("Failed to create operator: " + getErrorMessage(e));
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserPlus size={18} className="text-signal" />
          <h2 className="text-base font-bold text-white tracking-wide">Register New Operator</h2>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-white/80 hover:text-white">
          <X size={16} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <FieldLabel icon={<Hash size={10} />}>Username</FieldLabel>
          <TextInput type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="operator handle" required autoFocus />
        </div>
        <div>
          <FieldLabel icon={<Lock size={10} />}>Password</FieldLabel>
          <TextInput type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
        </div>
        <div>
          <FieldLabel icon={<Lock size={10} />}>Confirm Password</FieldLabel>
          <TextInput type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
        </div>
        <div>
          <FieldLabel icon={<Mail size={10} />}>Email (Optional)</FieldLabel>
          <TextInput type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@domain.com" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-xs font-mono text-white/80 hover:text-white transition-colors">CANCEL</button>
          <button type="submit" disabled={loading || !username || !password || !confirmPassword}
            className="px-4 py-2 bg-signal/20 border border-signal/40 text-signal font-mono font-bold text-xs uppercase tracking-wider hover:bg-signal/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed rounded">
            {loading ? "CREATING…" : "CREATE"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ============================================
// EditUserModal
// ============================================
function EditUserModal({ user, onClose, onSuccess }: { user: Operator; onClose: () => void; onSuccess: () => void }) {
  const [username, setUsername] = useState(user.username);
  const [updateUser, { loading }] = useMutation<any>(UPDATE_OPERATOR_USERNAME_MUTATION);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateUser({ variables: { id: user.id, username } });
      snackActions.success("Profile updated");
      onSuccess();
    } catch (e) {
      snackActions.error("Update failed: " + getErrorMessage(e));
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Edit size={18} className="text-signal" />
          <h2 className="text-base font-bold text-white tracking-wide">Edit Profile</h2>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-white/80 hover:text-white">
          <X size={16} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="text-[10px] font-mono text-white/70 mb-3">
          Editing: <span className="text-white">{user.username}</span> <span className="text-white/55">· ID {user.id}</span>
        </div>
        <div>
          <FieldLabel icon={<Hash size={10} />}>Username</FieldLabel>
          <TextInput type="text" value={username} onChange={e => setUsername(e.target.value)} required autoFocus />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-xs font-mono text-white/80 hover:text-white transition-colors">CANCEL</button>
          <button type="submit" disabled={loading || username === user.username || !username.trim()}
            className="px-4 py-2 bg-signal/20 border border-signal/40 text-signal font-mono font-bold text-xs uppercase tracking-wider hover:bg-signal/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed rounded">
            {loading ? "SAVING…" : "SAVE CHANGES"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ============================================
// ChangePasswordModal
// ============================================
function ChangePasswordModal({ user, onClose, onSuccess }: { user: Operator; onClose: () => void; onSuccess: () => void }) {
  const [password, setPassword]               = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail]                     = useState(user.email || "");
  const [updatePass, { loading }] = useMutation<any>(UPDATE_OPERATOR_PASSWORD_MUTATION);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { snackActions.error("Passwords do not match"); return; }
    try {
      await updatePass({ variables: { user_id: user.id, new_password: password, email } });
      snackActions.success("Credentials updated");
      onSuccess();
    } catch (e) {
      snackActions.error("Update failed: " + getErrorMessage(e));
    }
  };

  return (
    <ModalShell onClose={onClose} accent="yellow">
      <div className="px-5 py-4 border-b border-yellow-900/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-yellow-400" />
          <h2 className="text-base font-bold text-white tracking-wide">Update Credentials</h2>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-white/80 hover:text-white">
          <X size={16} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="text-[10px] font-mono text-white/70 mb-3">
          Updating: <span className="text-white">{user.username}</span> <span className="text-white/55">· ID {user.id}</span>
        </div>
        <div>
          <FieldLabel icon={<Lock size={10} />}>New Password</FieldLabel>
          <TextInput type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoFocus />
        </div>
        <div>
          <FieldLabel icon={<Lock size={10} />}>Confirm Password</FieldLabel>
          <TextInput type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
        </div>
        <div>
          <FieldLabel icon={<Mail size={10} />}>Email</FieldLabel>
          <TextInput type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@domain.com" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-xs font-mono text-white/80 hover:text-white transition-colors">CANCEL</button>
          <button type="submit" disabled={loading || !password || !confirmPassword}
            className="px-4 py-2 bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 font-mono font-bold text-xs uppercase tracking-wider hover:bg-yellow-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed rounded">
            {loading ? "UPDATING…" : "UPDATE"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ============================================
// Invite Links Section
// ============================================
const InviteLinksSection = () => {
  const [inviteLinks, setInviteLinks]       = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingLink, setEditingLink]       = useState<any>(null);
  const [operations, setOperations]         = useState<any[]>([]);

  const [getInviteLinks, { loading }] = useLazyQuery<any>(GET_INVITE_LINKS, {
    fetchPolicy: 'no-cache',
    onCompleted: (data: any) => {
      if (data.getInviteLinks?.status === 'error') {
        snackActions.error(data.getInviteLinks.error);
        return;
      }
      const links = [...(data.getInviteLinks?.links || [])];
      links.sort((a: any, b: any) => (a.valid ? -1 : b.valid ? 1 : 0));
      setInviteLinks(links);
    }
  });

  useQuery<any>(GET_OPERATIONS_LIST, {
    onCompleted: (data: any) => {
      const ops = data.operation?.filter((o: any) => !o.deleted && !o.complete) || [];
      ops.sort((a: any, b: any) => a.name.localeCompare(b.name));
      setOperations(ops);
    }
  });

  useEffect(() => { getInviteLinks(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleCopyLink = (link: string) => {
    copyStringToClipboard(link);
    snackActions.success('Link copied to clipboard');
  };

  const validCount = inviteLinks.filter(l => l.valid).length;
  const usedCount  = inviteLinks.reduce((sum, l) => sum + (l.used || 0), 0);

  return (
    <div className="flex-1 overflow-auto pr-1 min-h-0">
      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <StatCard label="TOTAL"  value={inviteLinks.length} icon={<Link2 size={14} />}    accent="signal" />
        <StatCard label="VALID"  value={validCount}         icon={<CheckCircle size={14} />} accent="green" />
        <StatCard label="USED"   value={usedCount}          icon={<Users size={14} />}    accent="yellow" />
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between mb-4 px-4 py-3 bg-black/30 border border-white/10 rounded-lg">
        <p className="text-xs text-white/80">
          <Activity size={11} className="inline mr-1.5 text-signal" />
          Generate invite links for new operators to register.
        </p>
        <div className="flex gap-2">
          <button onClick={() => getInviteLinks()}
            className="p-2 border border-white/25 hover:border-signal text-white/80 hover:text-signal transition-colors rounded">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => { setEditingLink(null); setShowCreateModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-signal/15 border border-signal/40 text-signal font-mono font-bold text-xs uppercase tracking-wider hover:bg-signal/25 transition-colors rounded">
            <Plus size={14} /> Generate Link
          </button>
        </div>
      </div>

      {/* Cards grid */}
      {inviteLinks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-white/45">
          <Link2 size={40} className="mb-3 opacity-40" />
          <span className="font-mono text-xs">No invite links generated yet</span>
          <span className="font-mono text-[10px] text-white/55 mt-1">
            Click <span className="text-signal">Generate Link</span> to create one
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pb-4">
          {inviteLinks.map(link => (
            <InviteLinkCard
              key={link.code}
              link={link}
              onCopy={() => handleCopyLink(link.link)}
              onEdit={() => { setEditingLink(link); setShowCreateModal(true); }}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <InviteLinkModal
            onClose={() => { setShowCreateModal(false); setEditingLink(null); getInviteLinks(); }}
            existingLink={editingLink}
            operations={operations}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ============================================
// InviteLinkCard
// ============================================
const InviteLinkCard = ({ link, onCopy, onEdit }: { link: any; onCopy: () => void; onEdit: () => void }) => {
  const exhausted = link.used >= link.total;
  const accent = !link.valid ? 'border-white/10 opacity-60' : exhausted ? 'border-red-500/40' : 'border-signal/30';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn('bg-black/30 border rounded-lg overflow-hidden hover:border-signal/50 transition-colors', accent)}
    >
      <div className="p-4 space-y-3">
        {/* Top: code + name */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className={cn(
              'text-base font-mono font-bold truncate',
              !link.valid ? 'line-through text-white/55' : 'text-white'
            )}>
              {link.code}
            </div>
            {link.name && (
              <div className="text-[10px] font-mono text-white/70 mt-0.5 truncate">{link.name}</div>
            )}
          </div>
          {/* Validity badge */}
          {link.valid ? (
            exhausted ? (
              <span className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/40 rounded shrink-0">
                EXHAUSTED
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-green-500/15 text-green-300 border border-green-500/40 rounded shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                VALID
              </span>
            )
          ) : (
            <span className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-white/10 text-white/55 border border-white/20 rounded shrink-0">
              EXPIRED
            </span>
          )}
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
          <div>
            <div className="text-white/55 uppercase tracking-wider mb-0.5">Creator</div>
            <div className="text-white/95 truncate">{link.operator || '—'}</div>
          </div>
          <div>
            <div className="text-white/55 uppercase tracking-wider mb-0.5">Usage</div>
            <div>
              <span className={cn('font-bold', exhausted ? 'text-red-400' : 'text-green-400')}>{link.used}</span>
              <span className="text-white/55"> / {link.total}</span>
            </div>
          </div>
          {link.operation_id > 0 && (
            <div className="col-span-2">
              <div className="text-white/55 uppercase tracking-wider mb-0.5">Assignment</div>
              <div className="text-signal">{link.operation_role}</div>
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="border-t border-white/10 px-2 py-1.5 flex items-center gap-1 bg-black/20">
        {link.valid && (
          <ActionButton onClick={onCopy} icon={<Copy size={13} />} label="Copy Link" accent="signal" />
        )}
        <ActionButton onClick={onEdit} icon={<Edit3 size={13} />} label="Edit" accent="signal" />
      </div>
    </motion.div>
  );
};

// ============================================
// InviteLinkModal
// ============================================
const InviteLinkModal = ({
  onClose, existingLink, operations,
}: {
  onClose: () => void;
  existingLink: any;
  operations: any[];
}) => {
  const isCreate = !existingLink;
  const [formData, setFormData] = useState({
    name:           existingLink?.name || '',
    short_code:     existingLink?.code || '',
    operation_id:   existingLink?.operation_id || 0,
    operation_role: existingLink?.operation_role || 'spectator',
    total:          existingLink?.total || 1,
  });

  const [createLink] = useMutation<any>(CREATE_INVITE_LINK, {
    onCompleted: (result: any) => {
      if (result.createInviteLink.status === 'success') {
        copyStringToClipboard(result.createInviteLink.link);
        snackActions.success('Invite link created and copied to clipboard');
        onClose();
      } else snackActions.error(result.createInviteLink.error);
    },
    onError: () => snackActions.error('Failed to create invite link'),
  });

  const [updateLink] = useMutation<any>(UPDATE_INVITE_LINK, {
    onCompleted: (result: any) => {
      if (result.updateInviteLink.status === 'success') {
        snackActions.success('Invite link updated');
        onClose();
      } else snackActions.error(result.updateInviteLink.error);
    },
    onError: () => snackActions.error('Failed to update invite link'),
  });

  const handleSubmit = () => {
    if (isCreate) createLink({ variables: formData });
    else          updateLink({ variables: { code: formData.short_code, total: formData.total } });
  };

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 size={18} className="text-signal" />
          <h2 className="text-base font-bold text-white tracking-wide">{isCreate ? 'Create' : 'Edit'} Invite Link</h2>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-white/80 hover:text-white">
          <X size={16} />
        </button>
      </div>

      {/* Form */}
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-[11px] text-yellow-200 leading-relaxed">
          <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
          <span>Invite links are deleted when Mythic restarts.</span>
        </div>

        <div>
          <FieldLabel icon={<Hash size={10} />}>Invite Code Name</FieldLabel>
          <TextInput
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            disabled={!isCreate}
            placeholder="Descriptive name for this link"
          />
        </div>

        <div>
          <FieldLabel icon={<Hash size={10} />}>Custom Invite Code</FieldLabel>
          <TextInput
            type="text"
            value={formData.short_code}
            onChange={(e) => setFormData({ ...formData, short_code: e.target.value })}
            disabled={!isCreate}
            placeholder="Optional — leave blank to auto-generate"
          />
        </div>

        <div>
          <FieldLabel icon={<Activity size={10} />}>Assign to Operation</FieldLabel>
          <select
            value={formData.operation_id}
            onChange={(e) => setFormData({ ...formData, operation_id: parseInt(e.target.value) })}
            disabled={!isCreate}
            className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-signal/60 font-mono disabled:opacity-50"
          >
            <option value={0}>No operation assignment</option>
            {operations.map((op) => (
              <option key={op.id} value={op.id}>{op.name}</option>
            ))}
          </select>
        </div>

        {formData.operation_id > 0 && (
          <div>
            <FieldLabel icon={<Shield size={10} />}>Operation Role</FieldLabel>
            <select
              value={formData.operation_role}
              onChange={(e) => setFormData({ ...formData, operation_role: e.target.value })}
              disabled={!isCreate}
              className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-signal/60 font-mono disabled:opacity-50"
            >
              <option value="spectator">Spectator</option>
              <option value="operator">Operator</option>
            </select>
          </div>
        )}

        <div>
          <FieldLabel icon={<Users size={10} />}>Total Uses Allowed</FieldLabel>
          <TextInput
            type="number"
            min={1}
            value={formData.total}
            onChange={(e) => setFormData({ ...formData, total: Math.max(1, parseInt(e.target.value) || 1) })}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/10">
        <button onClick={onClose}
          className="px-4 py-2 text-xs font-mono text-white/80 hover:text-white transition-colors">CANCEL</button>
        <button onClick={handleSubmit}
          className="px-4 py-2 bg-signal/20 border border-signal/40 text-signal font-mono font-bold text-xs uppercase tracking-wider hover:bg-signal/30 transition-colors rounded">
          {isCreate ? 'CREATE' : 'UPDATE'}
        </button>
      </div>
    </ModalShell>
  );
};
