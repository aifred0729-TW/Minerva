import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { Sidebar } from '../components/Sidebar';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { 
    Key, Search, Plus, Edit3, Trash2, RefreshCw, Copy, 
    User, Globe, Lock, FileText, Eye, EyeOff, ExternalLink,
    CheckCircle, XCircle, Tag, Shield, Hash, Award, ChevronDown,
    MoreVertical, AlertTriangle, Unlock
} from 'lucide-react';
import { snackActions } from '../../Archive/components/utilities/Snackbar';
import { useAppStore } from '../store';

// ============================================
// Types
// ============================================
interface Credential {
    id: number;
    account: string;
    realm: string;
    type: string;
    credential_text: string;
    comment: string;
    deleted: boolean;
    timestamp: string;
    operator?: { username: string };
    task?: {
        display_id: number;
        id: number;
        callback?: {
            id: number;
            host: string;
            display_id: number;
            mythictree_groups: string[];
        };
    };
    tags?: Array<{
        id: number;
        tagtype: { name: string; color: string; id: number };
    }>;
}

// ============================================
// GraphQL Queries & Mutations
// ============================================
const CREDENTIAL_FRAGMENT = gql`
    fragment CredentialData on credential {
        id
        account
        realm
        type
        credential_text
        comment
        deleted
        timestamp
        operator { username }
        task {
            display_id
            id
            callback {
                id
                host
                display_id
                mythictree_groups
            }
        }
        tags {
            id
            tagtype { name color id }
        }
    }
`;

const GET_CREDENTIALS = gql`
    ${CREDENTIAL_FRAGMENT}
    query GetCredentials($deleted: Boolean!) {
        credential(
            where: { deleted: { _eq: $deleted } },
            order_by: { id: desc },
            limit: 500
        ) {
            ...CredentialData
        }
        credential_aggregate(where: { deleted: { _eq: $deleted } }) {
            aggregate { count }
        }
    }
`;

const CREATE_CREDENTIAL = gql`
    mutation CreateCredential($account: String!, $realm: String!, $credential: String!, $type: String!, $comment: String!) {
        createCredential(account: $account, realm: $realm, credential: $credential, credential_type: $type, comment: $comment) {
            status
            error
            id
        }
    }
`;

const UPDATE_CREDENTIAL_COMMENT = gql`
    ${CREDENTIAL_FRAGMENT}
    mutation UpdateCredentialComment($credential_id: Int!, $comment: String!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { comment: $comment }) {
            ...CredentialData
        }
    }
`;

const UPDATE_CREDENTIAL_ACCOUNT = gql`
    ${CREDENTIAL_FRAGMENT}
    mutation UpdateCredentialAccount($credential_id: Int!, $account: String!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { account: $account }) {
            ...CredentialData
        }
    }
`;

const UPDATE_CREDENTIAL_REALM = gql`
    ${CREDENTIAL_FRAGMENT}
    mutation UpdateCredentialRealm($credential_id: Int!, $realm: String!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { realm: $realm }) {
            ...CredentialData
        }
    }
`;

const UPDATE_CREDENTIAL_TYPE = gql`
    ${CREDENTIAL_FRAGMENT}
    mutation UpdateCredentialType($credential_id: Int!, $type: String!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { type: $type }) {
            ...CredentialData
        }
    }
`;

const UPDATE_CREDENTIAL_VALUE = gql`
    ${CREDENTIAL_FRAGMENT}
    mutation UpdateCredentialValue($credential_id: Int!, $credential: String!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { credential_text: $credential }) {
            ...CredentialData
        }
    }
`;

const UPDATE_CREDENTIAL_DELETED = gql`
    ${CREDENTIAL_FRAGMENT}
    mutation UpdateCredentialDeleted($credential_id: Int!, $deleted: Boolean!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { deleted: $deleted }) {
            ...CredentialData
        }
    }
`;

// ============================================
// Constants
// ============================================
const CREDENTIAL_TYPES = ['plaintext', 'hash', 'ticket', 'certificate', 'key', 'hex'];

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    plaintext: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
    hash: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
    ticket: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
    certificate: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
    key: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
    hex: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
    plaintext: <Lock size={12} />,
    hash: <Hash size={12} />,
    ticket: <Award size={12} />,
    certificate: <Shield size={12} />,
    key: <Key size={12} />,
    hex: <FileText size={12} />,
};

// ============================================
// Main Component
// ============================================
export default function Credentials() {
    const { isSidebarCollapsed } = useAppStore();
    const [showDeleted, setShowDeleted] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchField, setSearchField] = useState<'all' | 'account' | 'realm' | 'credential' | 'comment'>('all');
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [editModal, setEditModal] = useState<{ credential: Credential; field: string } | null>(null);
    const [expandedCredential, setExpandedCredential] = useState<number | null>(null);
    const [visibleCredentials, setVisibleCredentials] = useState<Set<number>>(new Set());

    // Queries
    const { data, loading, refetch } = useQuery(GET_CREDENTIALS, {
        variables: { deleted: showDeleted },
        pollInterval: 30000,
    });

    // Mutations
    const [createCredential] = useMutation(CREATE_CREDENTIAL, {
        onCompleted: (data) => {
            if (data.createCredential.status === 'success') {
                snackActions.success('Credential created');
                refetch();
                setCreateModalOpen(false);
            } else {
                snackActions.error(data.createCredential.error);
            }
        },
        onError: () => snackActions.error('Failed to create credential'),
    });

    const [updateComment] = useMutation(UPDATE_CREDENTIAL_COMMENT, {
        onCompleted: () => { snackActions.success('Comment updated'); refetch(); },
    });

    const [updateAccount] = useMutation(UPDATE_CREDENTIAL_ACCOUNT, {
        onCompleted: () => { snackActions.success('Account updated'); refetch(); },
    });

    const [updateRealm] = useMutation(UPDATE_CREDENTIAL_REALM, {
        onCompleted: () => { snackActions.success('Realm updated'); refetch(); },
    });

    const [updateType] = useMutation(UPDATE_CREDENTIAL_TYPE, {
        onCompleted: () => { snackActions.success('Type updated'); refetch(); },
    });

    const [updateValue] = useMutation(UPDATE_CREDENTIAL_VALUE, {
        onCompleted: () => { snackActions.success('Credential updated'); refetch(); },
    });

    const [updateDeleted] = useMutation(UPDATE_CREDENTIAL_DELETED, {
        onCompleted: () => { snackActions.success('Status updated'); refetch(); },
    });

    const credentials: Credential[] = data?.credential || [];
    const totalCount = data?.credential_aggregate?.aggregate?.count || 0;

    // Filtering
    const filteredCredentials = useMemo(() => {
        if (!searchQuery) return credentials;
        const query = searchQuery.toLowerCase();
        return credentials.filter((cred) => {
            switch (searchField) {
                case 'account': return cred.account?.toLowerCase().includes(query);
                case 'realm': return cred.realm?.toLowerCase().includes(query);
                case 'credential': return cred.credential_text?.toLowerCase().includes(query);
                case 'comment': return cred.comment?.toLowerCase().includes(query);
                default:
                    return (
                        cred.account?.toLowerCase().includes(query) ||
                        cred.realm?.toLowerCase().includes(query) ||
                        cred.credential_text?.toLowerCase().includes(query) ||
                        cred.comment?.toLowerCase().includes(query)
                    );
            }
        });
    }, [credentials, searchQuery, searchField]);

    // Group by realm
    const credentialsByRealm = useMemo(() => {
        const grouped = new Map<string, Credential[]>();
        filteredCredentials.forEach((cred) => {
            const realm = cred.realm || 'No Realm';
            if (!grouped.has(realm)) {
                grouped.set(realm, []);
            }
            grouped.get(realm)!.push(cred);
        });
        return grouped;
    }, [filteredCredentials]);

    const copyToClipboard = (text: string, label = 'Text') => {
        navigator.clipboard.writeText(text);
        snackActions.success(`${label} copied to clipboard`);
    };

    const toggleCredentialVisibility = (id: number) => {
        const newSet = new Set(visibleCredentials);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setVisibleCredentials(newSet);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen bg-void text-signal font-sans flex overflow-hidden"
        >
            <Sidebar />

            <div className={cn("flex-1 flex flex-col transition-all duration-300 p-6 lg:p-12", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                {/* Header */}
                <header className="flex justify-between items-center mb-8 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-signal bg-signal/10 rounded">
                            <Key size={24} className="text-signal" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest">CREDENTIALS VAULT</h1>
                            <p className="text-xs text-gray-400 font-mono">/root/credentials/list</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCreateModalOpen(true)}
                            className="flex items-center gap-2 px-6 py-3 bg-signal text-void font-bold font-mono text-sm hover:bg-white hover:shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all rounded"
                        >
                            <Plus size={18} />
                            NEW CREDENTIAL
                        </button>
                        <button
                            onClick={() => setShowDeleted(!showDeleted)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 border rounded text-xs font-mono transition-colors",
                                showDeleted 
                                    ? "bg-red-500/20 text-red-400 border-red-500/30" 
                                    : "border-gray-700 text-gray-400 hover:border-signal hover:text-signal"
                            )}
                        >
                            {showDeleted ? <Eye size={14} /> : <EyeOff size={14} />}
                            {showDeleted ? 'SHOWING DELETED' : 'SHOW DELETED'}
                        </button>
                        <button
                            onClick={() => refetch()}
                            className="p-2 border border-gray-700 hover:border-signal text-gray-400 hover:text-signal transition-colors rounded-full"
                        >
                            <RefreshCw size={20} />
                        </button>
                    </div>
                </header>

                {/* Search Bar */}
                <div className="px-6 py-4 bg-black/30 border-b border-white/10 flex items-center gap-4">
                    <div className="relative flex-1 max-w-xl">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search credentials..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50"
                        />
                    </div>
                    <select
                        value={searchField}
                        onChange={(e) => setSearchField(e.target.value as any)}
                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500/50"
                    >
                        <option value="all">All Fields</option>
                        <option value="account">Account</option>
                        <option value="realm">Realm</option>
                        <option value="credential">Credential</option>
                        <option value="comment">Comment</option>
                    </select>
                    <div className="text-xs text-gray-500 font-mono">
                        {filteredCredentials.length} / {totalCount} credentials
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="text-gray-500 font-mono text-sm animate-pulse">LOADING_VAULT...</div>
                        </div>
                    ) : filteredCredentials.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            <Key size={48} className="text-gray-600 mb-4" />
                            <h3 className="text-lg font-bold text-white mb-2">NO CREDENTIALS FOUND</h3>
                            <p className="text-gray-500 text-sm">
                                {searchQuery ? 'Try adjusting your search query' : 'Create your first credential to get started'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {Array.from(credentialsByRealm.entries()).map(([realm, creds]) => (
                                <div key={realm} className="space-y-2">
                                    {/* Realm Header */}
                                    <div className="flex items-center gap-2 py-2">
                                        <Globe size={14} className="text-signal" />
                                        <h2 className="font-mono text-sm text-signal">{realm}</h2>
                                        <span className="text-[10px] text-gray-500 px-1.5 py-0.5 bg-white/10 rounded">
                                            {creds.length}
                                        </span>
                                    </div>

                                    {/* Credentials List */}
                                    <div className="space-y-2">
                                        {creds.map((cred) => (
                                            <CredentialCard
                                                key={cred.id}
                                                credential={cred}
                                                isExpanded={expandedCredential === cred.id}
                                                isVisible={visibleCredentials.has(cred.id)}
                                                onExpand={() => setExpandedCredential(expandedCredential === cred.id ? null : cred.id)}
                                                onToggleVisibility={() => toggleCredentialVisibility(cred.id)}
                                                onCopy={copyToClipboard}
                                                onEdit={(field) => setEditModal({ credential: cred, field })}
                                                onDelete={() => updateDeleted({ variables: { credential_id: cred.id, deleted: !cred.deleted } })}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Create Modal */}
            <AnimatePresence>
                {createModalOpen && (
                    <CreateCredentialModal
                        onClose={() => setCreateModalOpen(false)}
                        onCreate={(data) => createCredential({ variables: data })}
                    />
                )}
            </AnimatePresence>

            {/* Edit Modal */}
            <AnimatePresence>
                {editModal && (
                    <EditFieldModal
                        credential={editModal.credential}
                        field={editModal.field}
                        onClose={() => setEditModal(null)}
                        onSave={(value) => {
                            const { credential, field } = editModal;
                            switch (field) {
                                case 'account':
                                    updateAccount({ variables: { credential_id: credential.id, account: value } });
                                    break;
                                case 'realm':
                                    updateRealm({ variables: { credential_id: credential.id, realm: value } });
                                    break;
                                case 'type':
                                    updateType({ variables: { credential_id: credential.id, type: value } });
                                    break;
                                case 'credential':
                                    updateValue({ variables: { credential_id: credential.id, credential: value } });
                                    break;
                                case 'comment':
                                    updateComment({ variables: { credential_id: credential.id, comment: value } });
                                    break;
                            }
                            setEditModal(null);
                        }}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ============================================
// Sub-Components
// ============================================

const CredentialCard = ({
    credential,
    isExpanded,
    isVisible,
    onExpand,
    onToggleVisibility,
    onCopy,
    onEdit,
    onDelete,
}: {
    credential: Credential;
    isExpanded: boolean;
    isVisible: boolean;
    onExpand: () => void;
    onToggleVisibility: () => void;
    onCopy: (text: string, label: string) => void;
    onEdit: (field: string) => void;
    onDelete: () => void;
}) => {
    const typeColor = TYPE_COLORS[credential.type] || TYPE_COLORS.plaintext;
    const typeIcon = TYPE_ICONS[credential.type] || <Lock size={12} />;
    const maxLen = 50;
    const displayCred = isVisible 
        ? credential.credential_text 
        : '•'.repeat(Math.min(credential.credential_text.length, 24));
    const truncatedCred = displayCred.length > maxLen 
        ? displayCred.slice(0, maxLen) + '...' 
        : displayCred;

    return (
        <motion.div
            layout
            className={cn(
                "bg-black/40 border rounded-lg overflow-hidden transition-colors",
                credential.deleted 
                    ? "border-red-500/30 opacity-60" 
                    : "border-white/10 hover:border-white/20"
            )}
        >
            {/* Main Row */}
            <div className="p-3 flex items-center gap-3">
                {/* Type Badge */}
                <div className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono",
                    typeColor.bg, typeColor.text, typeColor.border, "border"
                )}>
                    {typeIcon}
                    <span className="uppercase">{credential.type}</span>
                </div>

                {/* Account */}
                <div className="flex items-center gap-2 min-w-[150px]">
                    <User size={12} className="text-gray-500" />
                    <span className="text-sm text-white font-mono truncate">{credential.account}</span>
                </div>

                {/* Credential Value */}
                <div className="flex-1 flex items-center gap-2">
                    <Lock size={12} className="text-gray-500" />
                    <span className="text-sm text-gray-300 font-mono truncate">{truncatedCred}</span>
                    <button
                        onClick={onToggleVisibility}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                        {isVisible ? <EyeOff size={12} className="text-gray-400" /> : <Eye size={12} className="text-gray-400" />}
                    </button>
                    <button
                        onClick={() => onCopy(credential.credential_text, 'Credential')}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                        <Copy size={12} className="text-gray-400" />
                    </button>
                </div>

                {/* Tags */}
                {credential.tags && credential.tags.length > 0 && (
                    <div className="flex gap-1">
                        {credential.tags.slice(0, 2).map((tag) => (
                            <span
                                key={tag.id}
                                className="px-1.5 py-0.5 rounded text-[9px] font-mono"
                                style={{ backgroundColor: `${tag.tagtype.color}20`, color: tag.tagtype.color }}
                            >
                                {tag.tagtype.name}
                            </span>
                        ))}
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={onExpand}
                        className={cn(
                            "p-1.5 rounded transition-colors",
                            isExpanded ? "bg-white/10 text-white" : "hover:bg-white/10 text-gray-400"
                        )}
                    >
                        <ChevronDown size={14} className={cn("transition-transform", isExpanded && "rotate-180")} />
                    </button>
                    <button
                        onClick={onDelete}
                        className={cn(
                            "p-1.5 rounded transition-colors",
                            credential.deleted 
                                ? "hover:bg-green-500/20 text-green-400" 
                                : "hover:bg-red-500/20 text-red-400"
                        )}
                        title={credential.deleted ? 'Restore' : 'Delete'}
                    >
                        {credential.deleted ? <Unlock size={14} /> : <Trash2 size={14} />}
                    </button>
                </div>
            </div>

            {/* Expanded Details */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-white/10"
                    >
                        <div className="p-4 bg-black/20 space-y-4">
                            {/* Editable Fields */}
                            <div className="grid grid-cols-2 gap-4 text-xs">
                                <EditableField
                                    label="Account"
                                    value={credential.account}
                                    onEdit={() => onEdit('account')}
                                    onCopy={() => onCopy(credential.account, 'Account')}
                                />
                                <EditableField
                                    label="Realm"
                                    value={credential.realm}
                                    onEdit={() => onEdit('realm')}
                                    onCopy={() => onCopy(credential.realm, 'Realm')}
                                />
                                <EditableField
                                    label="Type"
                                    value={credential.type}
                                    onEdit={() => onEdit('type')}
                                />
                                <div>
                                    <label className="text-gray-500 text-[10px]">TIMESTAMP</label>
                                    <p className="text-white font-mono">{new Date(credential.timestamp).toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Full Credential */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-gray-500 text-[10px]">CREDENTIAL</label>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => onEdit('credential')}
                                            className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                                        >
                                            <Edit3 size={10} />
                                        </button>
                                        <button
                                            onClick={() => onCopy(credential.credential_text, 'Credential')}
                                            className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                                        >
                                            <Copy size={10} />
                                        </button>
                                    </div>
                                </div>
                                <pre className="p-2 bg-black/40 rounded border border-white/10 text-xs text-gray-300 font-mono whitespace-pre-wrap break-all max-h-40 overflow-auto">
                                    {isVisible ? credential.credential_text : '•'.repeat(Math.min(credential.credential_text.length, 50))}
                                </pre>
                            </div>

                            {/* Comment */}
                            {(credential.comment || true) && (
                                <EditableField
                                    label="Comment"
                                    value={credential.comment || '-'}
                                    onEdit={() => onEdit('comment')}
                                    fullWidth
                                />
                            )}

                            {/* Source Info */}
                            {credential.task && (
                                <div className="pt-3 border-t border-white/10">
                                    <label className="text-gray-500 text-[10px] block mb-2">SOURCE</label>
                                    <div className="flex items-center gap-4 text-xs">
                                        <a
                                            href={`/new/callbacks/${credential.task.callback?.display_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-signal hover:underline"
                                        >
                                            <ExternalLink size={10} />
                                            Callback #{credential.task.callback?.display_id}
                                        </a>
                                        <a
                                            href={`/new/task/${credential.task.display_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-blue-400 hover:underline"
                                        >
                                            <ExternalLink size={10} />
                                            Task #{credential.task.display_id}
                                        </a>
                                        <span className="text-gray-500">Host: {credential.task.callback?.host}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

const EditableField = ({
    label,
    value,
    onEdit,
    onCopy,
    fullWidth = false,
}: {
    label: string;
    value: string;
    onEdit: () => void;
    onCopy?: () => void;
    fullWidth?: boolean;
}) => (
    <div className={fullWidth ? 'col-span-2' : ''}>
        <div className="flex items-center justify-between mb-1">
            <label className="text-gray-500 text-[10px]">{label.toUpperCase()}</label>
            <div className="flex gap-1">
                <button
                    onClick={onEdit}
                    className="p-0.5 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                >
                    <Edit3 size={10} />
                </button>
                {onCopy && (
                    <button
                        onClick={onCopy}
                        className="p-0.5 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                    >
                        <Copy size={10} />
                    </button>
                )}
            </div>
        </div>
        <p className="text-white font-mono text-xs">{value || '-'}</p>
    </div>
);

const CreateCredentialModal = ({
    onClose,
    onCreate,
}: {
    onClose: () => void;
    onCreate: (data: { account: string; realm: string; credential: string; type: string; comment: string }) => void;
}) => {
    const [form, setForm] = useState({
        account: '',
        realm: '',
        credential: '',
        type: 'plaintext',
        comment: '',
    });

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-void border border-white/20 rounded-lg w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Key size={18} className="text-yellow-400" />
                        <h2 className="font-bold text-white">New Credential</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
                        <XCircle size={18} className="text-gray-400" />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    <div>
                        <label className="text-gray-400 text-xs block mb-1">Type</label>
                        <select
                            value={form.type}
                            onChange={(e) => setForm({ ...form, type: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500/50"
                        >
                            {CREDENTIAL_TYPES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-gray-400 text-xs block mb-1">Account</label>
                        <input
                            type="text"
                            value={form.account}
                            onChange={(e) => setForm({ ...form, account: e.target.value })}
                            placeholder="username"
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50"
                        />
                    </div>
                    <div>
                        <label className="text-gray-400 text-xs block mb-1">Realm</label>
                        <input
                            type="text"
                            value={form.realm}
                            onChange={(e) => setForm({ ...form, realm: e.target.value })}
                            placeholder="domain.com"
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50"
                        />
                    </div>
                    <div>
                        <label className="text-gray-400 text-xs block mb-1">Credential</label>
                        <textarea
                            value={form.credential}
                            onChange={(e) => setForm({ ...form, credential: e.target.value })}
                            placeholder="password or hash..."
                            rows={3}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 resize-none"
                        />
                    </div>
                    <div>
                        <label className="text-gray-400 text-xs block mb-1">Comment</label>
                        <input
                            type="text"
                            value={form.comment}
                            onChange={(e) => setForm({ ...form, comment: e.target.value })}
                            placeholder="Optional comment..."
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50"
                        />
                    </div>
                </div>

                <div className="p-4 border-t border-white/10 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onCreate(form)}
                        disabled={!form.account || !form.credential}
                        className="px-4 py-2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded text-sm hover:bg-yellow-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Create
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

const EditFieldModal = ({
    credential,
    field,
    onClose,
    onSave,
}: {
    credential: Credential;
    field: string;
    onClose: () => void;
    onSave: (value: string) => void;
}) => {
    const initialValue = field === 'credential' 
        ? credential.credential_text 
        : (credential as any)[field] || '';
    const [value, setValue] = useState(initialValue);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-void border border-white/20 rounded-lg w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <h2 className="font-bold text-white">Edit {field.charAt(0).toUpperCase() + field.slice(1)}</h2>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
                        <XCircle size={18} className="text-gray-400" />
                    </button>
                </div>

                <div className="p-4">
                    {field === 'type' ? (
                        <select
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-signal/50"
                        >
                            {CREDENTIAL_TYPES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    ) : field === 'credential' || field === 'comment' ? (
                        <textarea
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            rows={5}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-signal/50 resize-none font-mono"
                        />
                    ) : (
                        <input
                            type="text"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-signal/50"
                        />
                    )}
                </div>

                <div className="p-4 border-t border-white/10 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave(value)}
                        className="px-4 py-2 bg-signal/20 text-signal border border-signal/30 rounded text-sm hover:bg-signal/30 transition-colors"
                    >
                        Save
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};
