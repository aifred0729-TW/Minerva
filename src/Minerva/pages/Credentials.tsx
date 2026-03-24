import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useMutation, gql, useReactiveVar, useLazyQuery } from '@apollo/client';
import { Sidebar } from '../components/Sidebar';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import {
    Key, Search, Plus, Edit3, Trash2, RefreshCw, Copy,
    User, Globe, Lock, FileText, Eye, EyeOff, ExternalLink,
    XCircle, Tag, Shield, Hash, Award, ChevronDown,
    AlertTriangle, Unlock, Activity, ChevronLeft, ChevronRight,
    X,
} from 'lucide-react';
import { snackActions } from '../../components/utilities/Snackbar';
import { useAppStore } from '../store';
import { meState } from '../../cache';
import { ViewEditTagsDialog } from '../../components/MythicComponents/MythicTag';
import { MythicDialog } from '../../components/MythicComponents/MythicDialog';

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
// GraphQL — Fragment & Queries & Mutations
// ============================================
const CREDENTIAL_FRAGMENT = gql`
    fragment CredentialData on credential {
        id account realm type credential_text comment deleted timestamp
        operator { username }
        task {
            display_id id
            callback { id host display_id mythictree_groups }
        }
        tags { id tagtype { name color id } }
    }
`;

const ACCOUNT_SEARCH = gql`
    ${CREDENTIAL_FRAGMENT}
    query accountQuery($operation_id: Int!, $account: String!, $offset: Int!, $fetchLimit: Int!, $deleted: Boolean!) {
        credential_aggregate(distinct_on: id, where: {account: {_ilike: $account}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            aggregate { count }
        }
        credential(limit: $fetchLimit, distinct_on: id, offset: $offset, order_by: {id: desc}, where: {account: {_ilike: $account}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            ...CredentialData
        }
    }
`;
const REALM_SEARCH = gql`
    ${CREDENTIAL_FRAGMENT}
    query realmQuery($operation_id: Int!, $realm: String!, $offset: Int!, $fetchLimit: Int!, $deleted: Boolean!) {
        credential_aggregate(distinct_on: id, where: {realm: {_ilike: $realm}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            aggregate { count }
        }
        credential(limit: $fetchLimit, distinct_on: id, offset: $offset, order_by: {id: desc}, where: {realm: {_ilike: $realm}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            ...CredentialData
        }
    }
`;
const CREDENTIAL_SEARCH = gql`
    ${CREDENTIAL_FRAGMENT}
    query credQuery($operation_id: Int!, $credential: String!, $offset: Int!, $fetchLimit: Int!, $deleted: Boolean!) {
        credential_aggregate(distinct_on: id, where: {credential_text: {_ilike: $credential}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            aggregate { count }
        }
        credential(limit: $fetchLimit, distinct_on: id, offset: $offset, order_by: {id: desc}, where: {credential_text: {_ilike: $credential}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            ...CredentialData
        }
    }
`;
const COMMENT_SEARCH = gql`
    ${CREDENTIAL_FRAGMENT}
    query commentQuery($operation_id: Int!, $comment: String!, $offset: Int!, $fetchLimit: Int!, $deleted: Boolean!) {
        credential_aggregate(distinct_on: id, where: {comment: {_ilike: $comment}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            aggregate { count }
        }
        credential(limit: $fetchLimit, distinct_on: id, offset: $offset, order_by: {id: desc}, where: {comment: {_ilike: $comment}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            ...CredentialData
        }
    }
`;
const TAG_SEARCH = gql`
    ${CREDENTIAL_FRAGMENT}
    query tagQuery($tag: String!, $offset: Int!, $fetchLimit: Int!) {
        tag_aggregate(distinct_on: credential_id, where: {credential_id: {_is_null: false}, _or: [{data: {_cast: {String: {_ilike: $tag}}}}, {tagtype: {name: {_ilike: $tag}}}]}) {
            aggregate { count }
        }
        tag(limit: $fetchLimit, distinct_on: credential_id, offset: $offset, order_by: {credential_id: desc}, where: {credential_id: {_is_null: false}, _or: [{data: {_cast: {String: {_ilike: $tag}}}}, {tagtype: {name: {_ilike: $tag}}}]}) {
            credential { ...CredentialData }
        }
    }
`;

// ── mutations ──────────────────────────────────────────────────────────
const CREATE_CREDENTIAL = gql`
    mutation CreateCredential($account: String!, $realm: String!, $credential: String!, $type: String!, $comment: String!) {
        createCredential(account: $account, realm: $realm, credential: $credential, credential_type: $type, comment: $comment) {
            status error id
        }
    }
`;
const UPDATE_CREDENTIAL_COMMENT = gql`
    mutation UpdateCredentialComment($credential_id: Int!, $comment: String!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { comment: $comment }) {
            id comment operator { username }
        }
    }
`;
const UPDATE_CREDENTIAL_ACCOUNT = gql`
    mutation UpdateCredentialAccount($credential_id: Int!, $account: String!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { account: $account }) {
            id account operator { username }
        }
    }
`;
const UPDATE_CREDENTIAL_REALM = gql`
    mutation UpdateCredentialRealm($credential_id: Int!, $realm: String!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { realm: $realm }) {
            id realm operator { username }
        }
    }
`;
const UPDATE_CREDENTIAL_TYPE = gql`
    mutation UpdateCredentialType($credential_id: Int!, $type: String!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { type: $type }) {
            id type operator { username }
        }
    }
`;
// FIX: credential_text is a generated/virtual column — write to credential_raw (bytea) instead
const UPDATE_CREDENTIAL_VALUE = gql`
    mutation UpdateCredentialValue($credential_id: Int!, $credential: bytea!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { credential_raw: $credential }) {
            id credential_text operator { username }
        }
    }
`;
const UPDATE_CREDENTIAL_DELETED = gql`
    mutation UpdateCredentialDeleted($credential_id: Int!, $deleted: Boolean!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { deleted: $deleted }) {
            id deleted operator { username }
        }
    }
`;
const BULK_DELETE_HARVESTED = gql`
    mutation BulkDeleteHarvested($operation_id: Int!) {
        update_credential(
            where: {
                operation_id: { _eq: $operation_id }
                deleted: { _eq: false }
                _or: [
                    { task_id: { _is_null: false } }
                    { comment: { _ilike: "[AUTO:%" } }
                ]
            }
            _set: { deleted: true }
        ) { affected_rows }
    }
`;
// Fetch ALL non-deleted harvested credentials for client-side dedup
const FETCH_ALL_HARVESTED = gql`
    query FetchAllHarvested($operation_id: Int!) {
        credential(
            where: {
                operation_id: { _eq: $operation_id }
                deleted: { _eq: false }
                _or: [
                    { task_id: { _is_null: false } }
                    { comment: { _ilike: "[AUTO:%" } }
                ]
            }
            order_by: { id: desc }
        ) {
            id account realm type credential_text
        }
    }
`;
const BULK_DELETE_BY_IDS = gql`
    mutation BulkDeleteByIds($ids: [Int!]!) {
        update_credential(where: { id: { _in: $ids } }, _set: { deleted: true }) {
            affected_rows
        }
    }
`;
const BULK_DELETE_VERIFIED = gql`
    mutation BulkDeleteVerified($operation_id: Int!) {
        update_credential(
            where: {
                operation_id: { _eq: $operation_id }
                deleted: { _eq: false }
                task_id: { _is_null: true }
                _not: { comment: { _ilike: "[AUTO:%" } }
            }
            _set: { deleted: true }
        ) { affected_rows }
    }
`;

// ============================================
// Constants
// ============================================
const FETCH_LIMIT = 20;
const CREDENTIAL_TYPES = ['plaintext', 'hash', 'ticket', 'certificate', 'key', 'hex'];
const SEARCH_FIELD_OPTIONS = ['Account', 'Realm', 'Credential', 'Comment', 'Tag'] as const;
type SearchField = typeof SEARCH_FIELD_OPTIONS[number];

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    plaintext:   { bg: 'bg-green-500/20',  text: 'text-green-400',  border: 'border-green-500/30'  },
    hash:        { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
    ticket:      { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
    certificate: { bg: 'bg-blue-500/20',   text: 'text-blue-400',   border: 'border-blue-500/30'   },
    key:         { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
    hex:         { bg: 'bg-cyan-500/20',   text: 'text-cyan-400',   border: 'border-cyan-500/30'   },
};
const TYPE_ICONS: Record<string, React.ReactNode> = {
    plaintext:   <Lock size={12} />,
    hash:        <Hash size={12} />,
    ticket:      <Award size={12} />,
    certificate: <Shield size={12} />,
    key:         <Key size={12} />,
    hex:         <FileText size={12} />,
};

// ============================================
// URL Param Helpers
// ============================================
const readUrlParams = (): { search: string; searchField: SearchField; deleted: boolean } => {
    const p = new URLSearchParams(window.location.search);
    return {
        search:      p.get('search') ?? '',
        searchField: (SEARCH_FIELD_OPTIONS.includes(p.get('searchField') as any)
            ? p.get('searchField')
            : 'Account') as SearchField,
        deleted: p.get('deleted') === 'true',
    };
};
const writeUrlParams = (search: string, searchField: SearchField, deleted: boolean) => {
    const p = new URLSearchParams();
    if (search)                    p.set('search', search);
    if (searchField !== 'Account') p.set('searchField', searchField);
    if (deleted)                   p.set('deleted', 'true');
    const s = p.toString();
    window.history.replaceState(null, '', s ? `?${s}` : window.location.pathname);
};

// ============================================
// Main Component
// ============================================
export default function Credentials() {
    const { isSidebarCollapsed } = useAppStore();
    const me = useReactiveVar(meState) as any;
    const operationId: number = me?.user?.current_operation_id ?? 0;

    // ── state ──
    const initial = readUrlParams();
    const [searchQuery, setSearchQuery]   = useState(initial.search);
    const [searchField, setSearchField]   = useState<SearchField>(initial.searchField);
    const [showDeleted, setShowDeleted]   = useState(initial.deleted);
    const showDeletedRef                  = useRef(initial.deleted);
    const searchFieldRef                  = useRef<SearchField>(initial.searchField);
    const [currentPage, setCurrentPage]   = useState(1);
    const [totalCount, setTotalCount]     = useState(0);
    const [credentials, setCredentials]   = useState<Credential[]>([]);

    const [createModalOpen, setCreateModalOpen]       = useState(false);
    const [editModal, setEditModal]                   = useState<{ credential: Credential; field: string } | null>(null);
    const [expandedCredential, setExpandedCredential] = useState<number | null>(null);
    const [visibleCredentials, setVisibleCredentials] = useState<Set<number>>(new Set());
    const [confirmDelete, setConfirmDelete]           = useState<Credential | null>(null);
    const [tagEditCredential, setTagEditCredential]   = useState<Credential | null>(null);
    const [bulkDeleteConfirm, setBulkDeleteConfirm]   = useState<'harvested' | 'verified' | null>(null);

    // ── query result handler ───────────────────────────────────────────
    const handleSearchResults = useCallback((data: any) => {
        snackActions.dismiss();
        if (searchFieldRef.current === 'Tag') {
            setTotalCount(data.tag_aggregate?.aggregate?.count ?? 0);
            setCredentials((data.tag ?? []).map((t: any) => t.credential));
        } else {
            setTotalCount(data.credential_aggregate?.aggregate?.count ?? 0);
            setCredentials(data.credential ?? []);
        }
    }, []);
    const handleSearchError = useCallback((err: any) => {
        snackActions.dismiss();
        snackActions.error('Failed to fetch credentials');
        console.error(err);
    }, []);

    // ── lazy queries ───────────────────────────────────────────────────
    const [runAccountSearch]    = useLazyQuery(ACCOUNT_SEARCH,    { fetchPolicy: 'no-cache', onCompleted: handleSearchResults, onError: handleSearchError });
    const [runRealmSearch]      = useLazyQuery(REALM_SEARCH,      { fetchPolicy: 'no-cache', onCompleted: handleSearchResults, onError: handleSearchError });
    const [runCredSearch]       = useLazyQuery(CREDENTIAL_SEARCH, { fetchPolicy: 'no-cache', onCompleted: handleSearchResults, onError: handleSearchError });
    const [runCommentSearch]    = useLazyQuery(COMMENT_SEARCH,    { fetchPolicy: 'no-cache', onCompleted: handleSearchResults, onError: handleSearchError });
    const [runTagSearch]        = useLazyQuery(TAG_SEARCH,        { fetchPolicy: 'no-cache', onCompleted: handleSearchResults, onError: handleSearchError });

    // ── search dispatcher ──────────────────────────────────────────────
    const doSearch = useCallback((field: SearchField, search: string, offset: number, deleted: boolean, opId: number) => {
        const s = `%${search}%`;
        const base = { operation_id: opId, offset, fetchLimit: FETCH_LIMIT, deleted };
        switch (field) {
            case 'Account':    runAccountSearch({ variables: { ...base, account:    s } }); break;
            case 'Realm':      runRealmSearch({   variables: { ...base, realm:      s } }); break;
            case 'Credential': runCredSearch({    variables: { ...base, credential: s } }); break;
            case 'Comment': {
                const cs = search === '' ? '_%' : s;
                runCommentSearch({ variables: { ...base, comment: cs } });
                break;
            }
            case 'Tag': {
                const ts = search === '' ? '_%' : s;
                runTagSearch({ variables: { operation_id: opId, offset, fetchLimit: FETCH_LIMIT, tag: ts, deleted } });
                break;
            }
        }
    }, [runAccountSearch, runRealmSearch, runCredSearch, runCommentSearch, runTagSearch]);

    // ── mutations ──────────────────────────────────────────────────────
    const refresh = useCallback(() => {
        doSearch(searchFieldRef.current, searchQuery, (currentPage - 1) * FETCH_LIMIT, showDeletedRef.current, operationId);
    }, [doSearch, searchQuery, currentPage, operationId]);

    const [createCredential] = useMutation(CREATE_CREDENTIAL, {
        onCompleted: (data) => {
            if (data.createCredential.status === 'success') {
                snackActions.success('Credential created');
                setCreateModalOpen(false);
                refresh();
            } else {
                snackActions.error(data.createCredential.error);
            }
        },
        onError: () => snackActions.error('Failed to create credential'),
    });
    const [updateComment] = useMutation(UPDATE_CREDENTIAL_COMMENT,  { onCompleted: () => { snackActions.success('Comment updated');    refresh(); } });
    const [updateAccount] = useMutation(UPDATE_CREDENTIAL_ACCOUNT,  { onCompleted: () => { snackActions.success('Account updated');    refresh(); } });
    const [updateRealm]   = useMutation(UPDATE_CREDENTIAL_REALM,    { onCompleted: () => { snackActions.success('Realm updated');      refresh(); } });
    const [updateType]    = useMutation(UPDATE_CREDENTIAL_TYPE,     { onCompleted: () => { snackActions.success('Type updated');       refresh(); } });
    const [updateValue]   = useMutation(UPDATE_CREDENTIAL_VALUE,    { onCompleted: () => { snackActions.success('Credential updated'); refresh(); } });
    const [updateDeleted] = useMutation(UPDATE_CREDENTIAL_DELETED,  { onCompleted: () => { snackActions.success('Status updated');     refresh(); } });

    const [bulkDeleteHarvested, { loading: bulkDelHarvestedLoading }] = useMutation(BULK_DELETE_HARVESTED, {
        onCompleted: (data) => {
            const n = data.update_credential?.affected_rows ?? 0;
            snackActions.success(`${n} harvested credential${n !== 1 ? 's' : ''} deleted`);
            setBulkDeleteConfirm(null);
            setCurrentPage(1);
            doSearch(searchFieldRef.current, searchQuery, 0, showDeletedRef.current, operationId);
        },
        onError: () => snackActions.error('Bulk delete failed'),
    });
    // ── dedup harvested credentials ──────────────────────────────────
    const [fetchAllHarvested] = useLazyQuery(FETCH_ALL_HARVESTED, { fetchPolicy: 'no-cache' });
    const [bulkDeleteByIds]   = useMutation(BULK_DELETE_BY_IDS);
    const dedupRanRef = useRef(false);

    useEffect(() => {
        if (dedupRanRef.current || !operationId) return;
        dedupRanRef.current = true;
        (async () => {
            try {
                const { data } = await fetchAllHarvested({ variables: { operation_id: operationId } });
                const creds: { id: number; account: string; realm: string; type: string; credential_text: string }[] = data?.credential ?? [];
                if (creds.length === 0) return;
                // Group by (account, realm, type, credential_text) — keep newest (first, since ordered by id desc)
                const seen = new Set<string>();
                const dupIds: number[] = [];
                for (const c of creds) {
                    const key = `${c.account}\x00${c.realm}\x00${c.type}\x00${c.credential_text}`;
                    if (seen.has(key)) {
                        dupIds.push(c.id);
                    } else {
                        seen.add(key);
                    }
                }
                if (dupIds.length > 0) {
                    await bulkDeleteByIds({ variables: { ids: dupIds } });
                    snackActions.success(`Auto-removed ${dupIds.length} duplicate credential${dupIds.length !== 1 ? 's' : ''}`);
                    // Refresh current view
                    doSearch(searchFieldRef.current, searchQuery, (currentPage - 1) * FETCH_LIMIT, showDeletedRef.current, operationId);
                }
            } catch (err) {
                console.error('Dedup failed:', err);
            }
        })();
    }, [operationId]); // eslint-disable-line react-hooks/exhaustive-deps

    const [bulkDeleteVerified, { loading: bulkDelVerifiedLoading }] = useMutation(BULK_DELETE_VERIFIED, {
        onCompleted: (data) => {
            const n = data.update_credential?.affected_rows ?? 0;
            snackActions.success(`${n} verified credential${n !== 1 ? 's' : ''} deleted`);
            setBulkDeleteConfirm(null);
            setCurrentPage(1);
            doSearch(searchFieldRef.current, searchQuery, 0, showDeletedRef.current, operationId);
        },
        onError: () => snackActions.error('Bulk delete failed'),
    });

    // ── URL sync ───────────────────────────────────────────────────────
    useEffect(() => {
        writeUrlParams(searchQuery, searchField, showDeleted);
    }, [searchQuery, searchField, showDeleted]);

    // ── on mount: load from URL params ────────────────────────────────
    useEffect(() => {
        const init = readUrlParams();
        setSearchQuery(init.search);
        setSearchField(init.searchField);
        setShowDeleted(init.deleted);
        searchFieldRef.current = init.searchField;
        showDeletedRef.current = init.deleted;
        doSearch(init.searchField, init.search, 0, init.deleted, operationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── handlers ──────────────────────────────────────────────────────
    const submitSearch = (query: string, field?: SearchField, deleted?: boolean, page = 1) => {
        const f = field  ?? searchFieldRef.current;
        const d = deleted ?? showDeletedRef.current;
        doSearch(f, query, (page - 1) * FETCH_LIMIT, d, operationId);
    };

    const handleSearchFieldChange = (field: SearchField) => {
        setSearchField(field);
        searchFieldRef.current = field;
        setCurrentPage(1);
        submitSearch(searchQuery, field, showDeletedRef.current, 1);
    };

    const handleToggleDeleted = () => {
        const next = !showDeleted;
        setShowDeleted(next);
        showDeletedRef.current = next;
        setCurrentPage(1);
        submitSearch(searchQuery, searchFieldRef.current, next, 1);
    };

    const handleSearchSubmit = (q: string) => {
        setSearchQuery(q);
        setCurrentPage(1);
        submitSearch(q, searchFieldRef.current, showDeletedRef.current, 1);
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        submitSearch(searchQuery, searchFieldRef.current, showDeletedRef.current, page);
    };

    const handleEditSave = (credential: Credential, field: string, value: string) => {
        switch (field) {
            case 'account':    updateAccount({ variables: { credential_id: credential.id, account: value } }); break;
            case 'realm':      updateRealm({   variables: { credential_id: credential.id, realm: value } }); break;
            case 'type':       updateType({    variables: { credential_id: credential.id, type: value } }); break;
            case 'credential': updateValue({   variables: { credential_id: credential.id, credential: value } }); break;
            case 'comment':    updateComment({ variables: { credential_id: credential.id, comment: value } }); break;
        }
        setEditModal(null);
    };

    // ── section split ──────────────────────────────────────────────────
    const isHarvested = (c: Credential) => c.task || c.comment?.startsWith('[AUTO');
    const parseAutoSource = (comment: string): string | null => {
        const m = comment?.match(/\[AUTO:([^\]]+)\]\s*(.*?)·\s*Task #(\d+)\s*·\s*Host:\s*([^·]+)/);
        return m ? `${m[1]} | Task #${m[3]} | Host: ${m[4].trim()}` : null;
    };

    const verifiedByRealm = useMemo(() => {
        const g = new Map<string, Credential[]>();
        credentials.filter(c => !isHarvested(c)).forEach(c => {
            const r = c.realm || 'No Realm';
            if (!g.has(r)) g.set(r, []);
            g.get(r)!.push(c);
        });
        return g;
    }, [credentials]);

    const harvestedByRealm = useMemo(() => {
        const g = new Map<string, Credential[]>();
        credentials.filter(c => isHarvested(c)).forEach(c => {
            const r = c.realm || 'No Realm';
            if (!g.has(r)) g.set(r, []);
            g.get(r)!.push(c);
        });
        // Sort each realm group so same accounts are adjacent
        g.forEach((creds, realm) => {
            creds.sort((a, b) => {
                const acmp = a.account.localeCompare(b.account);
                if (acmp !== 0) return acmp;
                return b.id - a.id; // newest first within same account
            });
            g.set(realm, creds);
        });
        return g;
    }, [credentials]);

    const copyToClipboard = (text: string, label = 'Text') => {
        navigator.clipboard.writeText(text);
        snackActions.success(`${label} copied`);
    };
    const toggleVisibility = (id: number) => {
        setVisibleCredentials(prev => {
            const s = new Set(prev);
            s.has(id) ? s.delete(id) : s.add(id);
            return s;
        });
    };

    const verifiedCount  = [...verifiedByRealm.values()].reduce((a, b) => a + b.length, 0);
    const harvestedCount = [...harvestedByRealm.values()].reduce((a, b) => a + b.length, 0);
    const totalPages     = Math.max(1, Math.ceil(totalCount / FETCH_LIMIT));

    // ── shared card props builder ──────────────────────────────────────
    const cardProps = (cred: Credential) => ({
        credential: cred,
        isExpanded: expandedCredential === cred.id,
        isVisible: visibleCredentials.has(cred.id),
        onExpand: () => setExpandedCredential(expandedCredential === cred.id ? null : cred.id),
        onToggleVisibility: () => toggleVisibility(cred.id),
        onCopy: copyToClipboard,
        onEdit: (field: string) => setEditModal({ credential: cred, field }),
        onDelete: () => setConfirmDelete(cred),
        onEditTags: () => setTagEditCredential(cred),
    });

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <Sidebar />

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={cn(
                    'flex-1 flex flex-col transition-all duration-300 p-6 lg:p-12 h-screen overflow-hidden',
                    isSidebarCollapsed ? 'ml-16' : 'ml-64'
                )}
            >
                {/* ── Header ─────────────────────────────────────────── */}
                <header className="flex justify-between items-center mb-6 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded">
                            <Key size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">CREDENTIALS VAULT</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                CREDENTIAL STORAGE
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleToggleDeleted}
                            className={cn(
                                'flex items-center gap-2 px-4 py-2 border rounded text-xs font-mono transition-colors',
                                showDeleted
                                    ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                    : 'border-gray-700 text-gray-400 hover:border-signal hover:text-signal'
                            )}
                        >
                            {showDeleted ? <Eye size={14} /> : <EyeOff size={14} />}
                            {showDeleted ? 'SHOWING DELETED' : 'SHOW DELETED'}
                        </button>
                        <button
                            onClick={refresh}
                            className="p-2 border border-gray-700 hover:border-signal text-gray-400 hover:text-signal transition-colors rounded-full"
                        >
                            <RefreshCw size={20} />
                        </button>
                    </div>
                </header>

                {/* ── Search Bar ─────────────────────────────────────── */}
                <div className="shrink-0 px-4 py-3 bg-black/30 border border-white/10 rounded-lg flex flex-wrap items-center gap-3 mb-4">
                    {/* Field selector tabs */}
                    <div className="flex items-center bg-black/40 border border-white/10 rounded overflow-hidden">
                        {SEARCH_FIELD_OPTIONS.map(f => (
                            <button
                                key={f}
                                onClick={() => handleSearchFieldChange(f)}
                                className={cn(
                                    'px-3 py-1.5 text-[10px] font-mono transition-colors',
                                    searchField === f
                                        ? 'bg-signal/20 text-signal'
                                        : 'text-gray-500 hover:text-gray-300'
                                )}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* Search input */}
                    <div className="relative flex-1 max-w-xl min-w-[200px]">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder={`Search by ${searchField.toLowerCase()}...`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(searchQuery); }}
                            className="w-full bg-black/40 border border-white/10 rounded pl-9 pr-9 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-signal/50"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => handleSearchSubmit('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => handleSearchSubmit(searchQuery)}
                        className="px-3 py-2 bg-signal/10 border border-signal/30 text-signal text-xs font-mono rounded hover:bg-signal/20 transition-colors"
                    >
                        SEARCH
                    </button>

                    {/* Stats */}
                    <div className="text-xs text-gray-500 font-mono ml-auto flex items-center gap-3">
                        <span><span className="text-signal">{verifiedCount}</span> verified</span>
                        <span className="text-gray-700">|</span>
                        <span><span className="text-red-400/80">{harvestedCount}</span> harvested</span>
                        <span className="text-gray-700">|</span>
                        <span className="text-gray-600">total: {totalCount}</span>
                    </div>
                </div>

                {/* ── Credentials Content ────────────────────────────── */}
                <div className="flex-1 overflow-auto pr-1">
                    {credentials.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            <Key size={48} className="text-gray-600 mb-4" />
                            <h3 className="text-lg font-bold text-white mb-2">NO CREDENTIALS FOUND</h3>
                            <p className="text-gray-500 text-sm">
                                {searchQuery ? 'Try adjusting your search query' : 'Create your first credential to get started'}
                            </p>
                            <button
                                onClick={() => setCreateModalOpen(true)}
                                className="mt-4 flex items-center gap-2 px-4 py-2 bg-signal/10 border border-signal/30 text-signal font-mono text-xs rounded hover:bg-signal/20 transition-colors"
                            >
                                <Plus size={12} /> NEW CREDENTIAL
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-10 pb-4">

                            {/* ── SECTION 1: VERIFIED ───────────────────── */}
                            <div>
                                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-signal/20">
                                    <Shield size={16} className="text-signal shrink-0" />
                                    <h2 className="font-mono font-bold text-signal tracking-widest uppercase text-sm">
                                        Verified Credentials
                                    </h2>
                                    <span className="text-[10px] text-gray-500 px-1.5 py-0.5 bg-white/10 rounded font-mono">
                                        {verifiedCount}
                                    </span>
                                    <span className="text-[10px] text-gray-600 font-mono">· manually added only</span>
                                    <div className="ml-auto flex items-center gap-2">
                                        {verifiedCount > 0 && (
                                            <button
                                                onClick={() => setBulkDeleteConfirm('verified')}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-xs hover:bg-red-500/20 transition-colors rounded"
                                                title={`Delete all ${verifiedCount} verified credentials`}
                                            >
                                                <Trash2 size={11} /> DELETE ALL ({verifiedCount})
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setCreateModalOpen(true)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-signal/10 border border-signal/30 text-signal font-bold font-mono text-xs hover:bg-signal/20 transition-colors rounded"
                                        >
                                            <Plus size={12} /> NEW CREDENTIAL
                                        </button>
                                    </div>
                                </div>
                                {verifiedByRealm.size === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-gray-700">
                                        <Shield size={32} className="mb-2 opacity-30" />
                                        <span className="font-mono text-xs">No verified credentials</span>
                                        <span className="font-mono text-[10px] text-gray-600 mt-1">Click NEW CREDENTIAL to manually add</span>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {Array.from(verifiedByRealm.entries()).map(([realm, creds]) => (
                                            <RealmGroup key={realm} realm={realm} creds={creds} color="signal"
                                                cardProps={cardProps}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* ── SECTION 2: AUTO-HARVESTED ─────────────── */}
                            <div>
                                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-red-900/30">
                                    <Activity size={16} className="text-red-400 shrink-0" />
                                    <h2 className="font-mono font-bold text-red-400 tracking-widest uppercase text-sm">
                                        Auto-Harvested
                                    </h2>
                                    <span className="text-[10px] text-gray-500 px-1.5 py-0.5 bg-white/10 rounded font-mono">
                                        {harvestedCount}
                                    </span>
                                    <span className="text-[10px] text-gray-600 font-mono">· from agents / mimikatz</span>
                                    {harvestedCount > 0 && (
                                        <button
                                            onClick={() => setBulkDeleteConfirm('harvested')}
                                            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-xs hover:bg-red-500/20 transition-colors rounded"
                                            title={`Delete all ${harvestedCount} harvested credentials`}
                                        >
                                            <Trash2 size={11} /> DELETE ALL ({harvestedCount})
                                        </button>
                                    )}
                                </div>
                                {harvestedByRealm.size === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-gray-700">
                                        <Activity size={32} className="mb-2 opacity-30" />
                                        <span className="font-mono text-xs">No harvested credentials yet</span>
                                        <span className="font-mono text-[10px] text-gray-600 mt-1">Run mimikatz on a target to start harvesting</span>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {Array.from(harvestedByRealm.entries()).map(([realm, creds]) => (
                                            <RealmGroup key={realm} realm={realm} creds={creds} color="red"
                                                parseAutoSource={parseAutoSource}
                                                cardProps={cardProps}
                                                groupByAccount
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Pagination ─────────────────────────────────────── */}
                {totalPages > 1 && (
                    <div className="shrink-0 flex items-center justify-center gap-2 py-4 border-t border-white/10">
                        <button onClick={() => handlePageChange(1)} disabled={currentPage === 1}
                            className="p-1 disabled:opacity-30 text-gray-400 hover:text-white transition-colors" title="First page">
                            <ChevronLeft size={13} />
                        </button>
                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                            let page = i + 1;
                            if (totalPages > 7) {
                                if      (currentPage <= 4)              page = i + 1;
                                else if (currentPage >= totalPages - 3) page = totalPages - 6 + i;
                                else                                     page = currentPage - 3 + i;
                            }
                            if (page < 1 || page > totalPages) return null;
                            return (
                                <button key={page} onClick={() => handlePageChange(page)}
                                    className={cn(
                                        'w-7 h-7 rounded text-xs font-mono transition-colors',
                                        page === currentPage
                                            ? 'bg-signal/20 text-signal border border-signal/30'
                                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                    )}>
                                    {page}
                                </button>
                            );
                        })}
                        <button onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages}
                            className="p-1 disabled:opacity-30 text-gray-400 hover:text-white transition-colors" title="Last page">
                            <ChevronRight size={13} />
                        </button>
                        <span className="text-[10px] text-gray-600 font-mono ml-2">
                            page {currentPage}/{totalPages} · {totalCount} total
                        </span>
                    </div>
                )}
            </motion.div>

            {/* ── Modals ─────────────────────────────────────────────── */}
            <AnimatePresence>
                {createModalOpen && (
                    <CreateCredentialModal
                        onClose={() => setCreateModalOpen(false)}
                        onCreate={(data) => createCredential({ variables: data })}
                    />
                )}
                {editModal && (
                    <EditFieldModal
                        credential={editModal.credential}
                        field={editModal.field}
                        onClose={() => setEditModal(null)}
                        onSave={(value) => handleEditSave(editModal.credential, editModal.field, value)}
                    />
                )}
                {confirmDelete && (
                    <ConfirmDeleteModal
                        credential={confirmDelete}
                        onClose={() => setConfirmDelete(null)}
                        onConfirm={() => {
                            updateDeleted({ variables: { credential_id: confirmDelete.id, deleted: !confirmDelete.deleted } });
                            setConfirmDelete(null);
                        }}
                    />
                )}
                {bulkDeleteConfirm && (
                    <BulkDeleteConfirmModal
                        type={bulkDeleteConfirm}
                        count={bulkDeleteConfirm === 'harvested' ? harvestedCount : verifiedCount}
                        loading={bulkDeleteConfirm === 'harvested' ? bulkDelHarvestedLoading : bulkDelVerifiedLoading}
                        onClose={() => setBulkDeleteConfirm(null)}
                        onConfirm={() => {
                            if (bulkDeleteConfirm === 'harvested') {
                                bulkDeleteHarvested({ variables: { operation_id: operationId } });
                            } else {
                                bulkDeleteVerified({ variables: { operation_id: operationId } });
                            }
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Tag Edit dialog — wraps MythicTag's ViewEditTagsDialog */}
            {tagEditCredential && (
                <MythicDialog
                    fullWidth
                    maxWidth="md"
                    open={!!tagEditCredential}
                    onClose={() => { setTagEditCredential(null); refresh(); }}
                    innerDialog={
                        <ViewEditTagsDialog
                            me={me}
                            target_object="credential_id"
                            target_object_id={tagEditCredential.id}
                            onClose={() => { setTagEditCredential(null); refresh(); }}
                        />
                    }
                />
            )}
        </div>
    );
}

// ============================================
// RealmGroup
// ============================================
const RealmGroup = ({
    realm, creds, color, cardProps, parseAutoSource, groupByAccount = false,
}: {
    realm: string;
    creds: Credential[];
    color: 'signal' | 'red';
    cardProps: (cred: Credential) => any;
    parseAutoSource?: (comment: string) => string | null;
    groupByAccount?: boolean;
}) => {
    const rc = color === 'signal' ? 'text-signal' : 'text-red-400/70';

    // Group by account for harvested view
    const accountGroups = useMemo(() => {
        if (!groupByAccount) return null;
        const g = new Map<string, Credential[]>();
        for (const c of creds) {
            const acct = c.account || '(unknown)';
            if (!g.has(acct)) g.set(acct, []);
            g.get(acct)!.push(c);
        }
        return g;
    }, [creds, groupByAccount]);

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 py-1">
                <Globe size={13} className={rc} />
                <span className={cn('font-mono text-xs', rc)}>{realm}</span>
                <span className="text-[10px] text-gray-600 px-1 py-0.5 bg-white/5 rounded">{creds.length}</span>
            </div>
            {accountGroups ? (
                <div className="space-y-3">
                    {Array.from(accountGroups.entries()).map(([account, acctCreds]) => (
                        <div key={account} className="border-l-2 border-gray-700/50 pl-3 space-y-1.5">
                            <div className="flex items-center gap-2 py-0.5">
                                <User size={11} className="text-gray-500 shrink-0" />
                                <span className="font-mono text-xs text-gray-300">{account}</span>
                                {acctCreds.length > 1 && (
                                    <span className="text-[9px] text-gray-600 px-1 py-0.5 bg-white/5 rounded">{acctCreds.length}</span>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                {acctCreds.map((cred) => {
                                    const autoSrc = parseAutoSource?.(cred.comment ?? '');
                                    return (
                                        <div key={cred.id}>
                                            {autoSrc && (
                                                <div className="flex items-center gap-1.5 px-2 py-0.5 mb-0.5 bg-red-900/10 border-l-2 border-red-500/40 text-[9px] font-mono text-red-400/70">
                                                    <Activity size={8} className="shrink-0" />
                                                    {autoSrc}
                                                </div>
                                            )}
                                            <CredentialCard {...cardProps(cred)} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-2">
                    {creds.map((cred) => {
                        const autoSrc = parseAutoSource?.(cred.comment ?? '');
                        return (
                            <div key={cred.id}>
                                {autoSrc && (
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 mb-0.5 bg-red-900/10 border-l-2 border-red-500/40 text-[9px] font-mono text-red-400/70">
                                        <Activity size={8} className="shrink-0" />
                                        {autoSrc}
                                    </div>
                                )}
                                <CredentialCard {...cardProps(cred)} />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ============================================
// CredentialCard
// ============================================
const CredentialCard = ({
    credential, isExpanded, isVisible,
    onExpand, onToggleVisibility, onCopy, onEdit, onDelete, onEditTags,
}: {
    credential: Credential;
    isExpanded: boolean;
    isVisible: boolean;
    onExpand: () => void;
    onToggleVisibility: () => void;
    onCopy: (text: string, label: string) => void;
    onEdit: (field: string) => void;
    onDelete: () => void;
    onEditTags: () => void;
}) => {
    const typeColor = TYPE_COLORS[credential.type] ?? TYPE_COLORS.plaintext;
    const typeIcon  = TYPE_ICONS[credential.type]  ?? <Lock size={12} />;
    const maxLen    = 50;
    const raw       = isVisible ? credential.credential_text : '•'.repeat(Math.min(credential.credential_text?.length ?? 0, 24));
    const truncated = raw.length > maxLen ? raw.slice(0, maxLen) + '…' : raw;

    return (
        <motion.div
            layout
            className={cn(
                'bg-black/40 border rounded-lg overflow-hidden transition-colors',
                credential.deleted ? 'border-red-500/30 opacity-60' : 'border-white/10 hover:border-white/20'
            )}
        >
            {/* Main row */}
            <div className="p-3 flex items-center gap-3">
                {/* Type badge */}
                <div className={cn('flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border shrink-0', typeColor.bg, typeColor.text, typeColor.border)}>
                    {typeIcon}
                    <span className="uppercase">{credential.type}</span>
                </div>

                {/* Account */}
                <div className="flex items-center gap-2 min-w-[140px]">
                    <User size={12} className="text-gray-500 shrink-0" />
                    <span className="text-sm text-white font-mono truncate">{credential.account}</span>
                </div>

                {/* Credential value (masked) */}
                <div className="flex-1 flex items-center gap-2 min-w-0">
                    <Lock size={12} className="text-gray-500 shrink-0" />
                    <span className="text-sm text-gray-300 font-mono truncate">{truncated}</span>
                    <button onClick={onToggleVisibility} className="p-1 hover:bg-white/10 rounded transition-colors shrink-0">
                        {isVisible ? <EyeOff size={12} className="text-gray-400" /> : <Eye size={12} className="text-gray-400" />}
                    </button>
                    <button onClick={() => onCopy(credential.credential_text, 'Credential')} className="p-1 hover:bg-white/10 rounded transition-colors shrink-0">
                        <Copy size={12} className="text-gray-400" />
                    </button>
                </div>

                {/* Tags badges (read-only) */}
                {credential.tags && credential.tags.length > 0 && (
                    <div className="flex gap-1 shrink-0">
                        {credential.tags.slice(0, 3).map((tag) => (
                            <span key={tag.id} className="px-1.5 py-0.5 rounded text-[9px] font-mono"
                                style={{ backgroundColor: `${tag.tagtype.color}20`, color: tag.tagtype.color }}>
                                {tag.tagtype.name}
                            </span>
                        ))}
                        {credential.tags.length > 3 && (
                            <span className="text-[9px] text-gray-600">+{credential.tags.length - 3}</span>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    <button onClick={onEditTags} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-yellow-400 transition-colors" title="Edit Tags">
                        <Tag size={13} />
                    </button>
                    <button onClick={onExpand}
                        className={cn('p-1.5 rounded transition-colors', isExpanded ? 'bg-white/10 text-white' : 'hover:bg-white/10 text-gray-400')}>
                        <ChevronDown size={14} className={cn('transition-transform', isExpanded && 'rotate-180')} />
                    </button>
                    <button onClick={onDelete}
                        className={cn('p-1.5 rounded transition-colors',
                            credential.deleted ? 'hover:bg-green-500/20 text-green-400' : 'hover:bg-red-500/20 text-red-400'
                        )}
                        title={credential.deleted ? 'Restore' : 'Delete'}>
                        {credential.deleted ? <Unlock size={14} /> : <Trash2 size={14} />}
                    </button>
                </div>
            </div>

            {/* Expanded detail panel */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-white/10"
                    >
                        <div className="p-4 bg-black/20 space-y-4">
                            {/* Editable info grid */}
                            <div className="grid grid-cols-2 gap-4 text-xs">
                                <EditableField label="Account"   value={credential.account}
                                    onEdit={() => onEdit('account')}  onCopy={() => onCopy(credential.account, 'Account')} />
                                <EditableField label="Realm"     value={credential.realm}
                                    onEdit={() => onEdit('realm')}    onCopy={() => onCopy(credential.realm, 'Realm')} />
                                <EditableField label="Type"      value={credential.type}
                                    onEdit={() => onEdit('type')} />
                                <div>
                                    <label className="text-gray-500 text-[10px]">TIMESTAMP</label>
                                    <p className="text-white font-mono text-xs">{new Date(credential.timestamp).toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Full credential value */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-gray-500 text-[10px]">CREDENTIAL</label>
                                    <div className="flex gap-1">
                                        <button onClick={() => onEdit('credential')} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Edit">
                                            <Edit3 size={10} />
                                        </button>
                                        <button onClick={() => onCopy(credential.credential_text, 'Credential')} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Copy">
                                            <Copy size={10} />
                                        </button>
                                    </div>
                                </div>
                                <pre className="p-2 bg-black/40 rounded border border-white/10 text-xs text-gray-300 font-mono whitespace-pre-wrap break-all max-h-40 overflow-auto">
                                    {isVisible
                                        ? credential.credential_text
                                        : '•'.repeat(Math.min(credential.credential_text?.length ?? 0, 50))}
                                </pre>
                            </div>

                            {/* Comment */}
                            <EditableField label="Comment" value={credential.comment || '—'} onEdit={() => onEdit('comment')} fullWidth />

                            {/* Source / Operator */}
                            <div className="pt-3 border-t border-white/10">
                                <label className="text-gray-500 text-[10px] block mb-2">SOURCE</label>
                                {credential.task ? (
                                    <div className="flex items-center gap-4 text-xs flex-wrap">
                                        <a href={`/new/callbacks/${credential.task.callback?.display_id}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-signal hover:underline">
                                            <ExternalLink size={10} />
                                            C-{credential.task.callback?.display_id}
                                        </a>
                                        <a href={`/new/task/${credential.task.display_id}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-blue-400 hover:underline">
                                            <ExternalLink size={10} />
                                            T-{credential.task.display_id}
                                        </a>
                                        {credential.task.callback?.host && (
                                            <span className="text-gray-500">Host: {credential.task.callback.host}</span>
                                        )}
                                        {credential.task.callback?.mythictree_groups &&
                                            credential.task.callback.mythictree_groups.length > 0 &&
                                            !credential.task.callback.mythictree_groups.every(g => g === 'Default') && (
                                            <span className="text-gray-600 text-[10px]">
                                                Groups: {credential.task.callback.mythictree_groups.join(', ')}
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-xs text-gray-400">
                                        <User size={11} />
                                        <span>{credential.operator?.username ?? '—'}</span>
                                        <span className="text-gray-600">(manual entry)</span>
                                    </div>
                                )}
                            </div>

                            {/* Tags management */}
                            <div className="pt-3 border-t border-white/10">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-gray-500 text-[10px]">TAGS</label>
                                    <button onClick={onEditTags}
                                        className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[10px] font-mono rounded hover:bg-yellow-500/20 transition-colors">
                                        <Tag size={9} /> MANAGE TAGS
                                    </button>
                                </div>
                                {credential.tags && credential.tags.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {credential.tags.map(tag => (
                                            <span key={tag.id} className="px-2 py-0.5 rounded text-[10px] font-mono"
                                                style={{
                                                    backgroundColor: `${tag.tagtype.color}20`,
                                                    color: tag.tagtype.color,
                                                    border: `1px solid ${tag.tagtype.color}40`,
                                                }}>
                                                {tag.tagtype.name}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="text-gray-700 text-[10px] font-mono">No tags — click MANAGE TAGS to add</span>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// ============================================
// EditableField
// ============================================
const EditableField = ({
    label, value, onEdit, onCopy, fullWidth = false,
}: {
    label: string; value: string;
    onEdit: () => void;
    onCopy?: () => void;
    fullWidth?: boolean;
}) => (
    <div className={fullWidth ? 'col-span-2' : ''}>
        <div className="flex items-center justify-between mb-1">
            <label className="text-gray-500 text-[10px]">{label.toUpperCase()}</label>
            <div className="flex gap-1">
                <button onClick={onEdit} className="p-0.5 hover:bg-white/10 rounded text-gray-400 hover:text-white" title={`Edit ${label}`}>
                    <Edit3 size={10} />
                </button>
                {onCopy && (
                    <button onClick={onCopy} className="p-0.5 hover:bg-white/10 rounded text-gray-400 hover:text-white" title={`Copy ${label}`}>
                        <Copy size={10} />
                    </button>
                )}
            </div>
        </div>
        <p className="text-white font-mono text-xs break-all">{value || '—'}</p>
    </div>
);

// ============================================
// ConfirmDeleteModal  (Minerva style)
// ============================================
const ConfirmDeleteModal = ({
    credential, onClose, onConfirm,
}: {
    credential: Credential;
    onClose: () => void;
    onConfirm: () => void;
}) => (
    <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-8"
        onClick={onClose}
    >
        <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            className="bg-void border border-red-500/30 rounded-lg w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-400 shrink-0" />
                <h3 className="font-bold text-white text-sm">
                    {credential.deleted ? 'Restore Credential?' : 'Delete Credential?'}
                </h3>
            </div>
            <div className="bg-black/40 border border-white/10 rounded p-3 space-y-1 text-xs font-mono">
                <p><span className="text-gray-500">Account: </span><span className="text-gray-300">{credential.account}</span></p>
                <p><span className="text-gray-500">Realm: </span><span className="text-gray-300">{credential.realm}</span></p>
                <p><span className="text-gray-500">Type: </span><span className="text-gray-300">{credential.type}</span></p>
            </div>
            {!credential.deleted && (
                <p className="text-[10px] text-gray-500">
                    Deleted credentials cannot be used in tasking, but can be restored at any time.
                </p>
            )}
            <div className="flex gap-2 pt-1">
                <button onClick={onConfirm}
                    className={cn(
                        'flex-1 py-2 border rounded text-xs font-mono transition-colors',
                        credential.deleted
                            ? 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'
                    )}>
                    {credential.deleted ? 'RESTORE' : 'DELETE'}
                </button>
                <button onClick={onClose}
                    className="flex-1 py-2 bg-white/5 text-gray-400 border border-white/10 rounded text-xs font-mono hover:bg-white/10 transition-colors">
                    CANCEL
                </button>
            </div>
        </motion.div>
    </motion.div>
);

// ============================================
// BulkDeleteConfirmModal
// ============================================
const BulkDeleteConfirmModal = ({
    type, count, loading, onClose, onConfirm,
}: {
    type: 'harvested' | 'verified';
    count: number;
    loading: boolean;
    onClose: () => void;
    onConfirm: () => void;
}) => {
    const isHarvested = type === 'harvested';
    const accentBorder = isHarvested ? 'border-red-500/40'   : 'border-orange-500/40';
    const accentText   = isHarvested ? 'text-red-400'        : 'text-orange-400';
    const accentBg     = isHarvested ? 'bg-red-500/20'       : 'bg-orange-500/20';
    const accentHover  = isHarvested ? 'hover:bg-red-500/30' : 'hover:bg-orange-500/30';
    const label        = isHarvested ? 'Auto-Harvested'      : 'Verified';
    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className={cn('bg-void border rounded-lg w-full max-w-sm p-5 space-y-4', accentBorder)}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className={cn('shrink-0', accentText)} />
                    <h3 className="font-bold text-white text-sm">Delete All {label} Credentials?</h3>
                </div>
                <div className={cn('rounded p-3 border text-xs font-mono space-y-1', accentBg, accentBorder)}>
                    <p className={accentText}>
                        <span className="text-2xl font-bold">{count}</span>
                        <span className="ml-2">{label.toLowerCase()} credential{count !== 1 ? 's' : ''} will be marked as deleted.</span>
                    </p>
                </div>
                <p className="text-[10px] text-gray-500">
                    Deleted credentials cannot be used in tasking. They can be restored individually via <span className="text-gray-400">SHOW DELETED</span>.
                </p>
                <div className="flex gap-2 pt-1">
                    <button onClick={onConfirm} disabled={loading}
                        className={cn(
                            'flex-1 py-2 border rounded text-xs font-mono transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                            accentBg, accentText, accentBorder, accentHover
                        )}>
                        {loading ? 'DELETING…' : `DELETE ALL ${count}`}
                    </button>
                    <button onClick={onClose} disabled={loading}
                        className="flex-1 py-2 bg-white/5 text-gray-400 border border-white/10 rounded text-xs font-mono hover:bg-white/10 transition-colors disabled:opacity-50">
                        CANCEL
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// ============================================
// CreateCredentialModal
// ============================================
const CreateCredentialModal = ({
    onClose, onCreate,
}: {
    onClose: () => void;
    onCreate: (data: { account: string; realm: string; credential: string; type: string; comment: string }) => void;
}) => {
    const [form, setForm] = useState({ account: '', realm: '', credential: '', type: 'plaintext', comment: '' });
    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-void border border-white/20 rounded-lg w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Key size={18} className="text-yellow-400" />
                        <h2 className="font-bold text-white">Register New Credential</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
                        <XCircle size={18} className="text-gray-400" />
                    </button>
                </div>
                <div className="p-4 space-y-4">
                    <div>
                        <label className="text-gray-400 text-xs block mb-1">Type</label>
                        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500/50">
                            {CREDENTIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-gray-400 text-xs block mb-1">Realm / Domain</label>
                        <input type="text" value={form.realm} onChange={(e) => setForm({ ...form, realm: e.target.value })}
                            placeholder="domain.com"
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50" />
                    </div>
                    <div>
                        <label className="text-gray-400 text-xs block mb-1">Account</label>
                        <input type="text" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })}
                            placeholder="username"
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50" />
                    </div>
                    <div>
                        <label className="text-gray-400 text-xs block mb-1">Credential</label>
                        <textarea value={form.credential} onChange={(e) => setForm({ ...form, credential: e.target.value })}
                            placeholder="password or hash..." rows={3}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 resize-none" />
                    </div>
                    <div>
                        <label className="text-gray-400 text-xs block mb-1">Comment</label>
                        <input type="text" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })}
                            placeholder="Optional comment..."
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50" />
                    </div>
                </div>
                <div className="p-4 border-t border-white/10 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                    <button onClick={() => onCreate(form)} disabled={!form.account || !form.credential}
                        className="px-4 py-2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded text-sm hover:bg-yellow-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        Create
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// ============================================
// EditFieldModal
// ============================================
const EditFieldModal = ({
    credential, field, onClose, onSave,
}: {
    credential: Credential;
    field: string;
    onClose: () => void;
    onSave: (value: string) => void;
}) => {
    const initialValue = field === 'credential' ? credential.credential_text : (credential as any)[field] ?? '';
    const [value, setValue] = useState(initialValue);
    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
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
                        <select value={value} onChange={(e) => setValue(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-signal/50">
                            {CREDENTIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                    ) : field === 'credential' || field === 'comment' ? (
                        <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={5}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-signal/50 resize-none font-mono" />
                    ) : (
                        <input type="text" value={value} onChange={(e) => setValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') onSave(value); }}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-signal/50" />
                    )}
                </div>
                <div className="p-4 border-t border-white/10 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                    <button onClick={() => onSave(value)}
                        className="px-4 py-2 bg-signal/20 text-signal border border-signal/30 rounded text-sm hover:bg-signal/30 transition-colors">
                        Save
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};
