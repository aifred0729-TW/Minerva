import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useMutation, useReactiveVar, useApolloClient } from "@apollo/client/react";
import { useQueryCompat as useQuery, useLazyQueryCompat as useLazyQuery } from "../lib/useQueryCompat";
import { motion, AnimatePresence } from 'framer-motion';
import { cn, buildCsv, downloadBlob } from '../lib/utils';
import {
    Key, Search, Plus, Edit3, Trash2, RefreshCw, Copy,
    User, Globe, Lock, FileText, Eye, EyeOff, ExternalLink,
    XCircle, Tag, Shield, Hash, Award, ChevronDown,
    AlertTriangle, Unlock, Activity, ChevronLeft, ChevronRight,
    X, ClipboardPaste, Terminal, Palette, Check, BadgeCheck, Download,
} from 'lucide-react';
import { snackActions } from '../lib/snackbar';
import { useAppStore } from '../store';
import { meState } from '../lib/state';
import type { Credential } from '../types/credentials';
import type { MzExtractedCred } from '../types/console';
import { mzSplitSections, mzExtractAllCreds } from '../lib/mimikatzParser';
import { secretsdumpExtractAllCreds, looksLikeSecretsdump } from '../lib/secretsdumpParser';
import { GET_TAGTYPES, CREATE_TAGTYPE, CREATE_CREDENTIAL_TAG, DELETE_TAG } from '../lib/api/tags';
import {
    ACCOUNT_SEARCH,
    REALM_SEARCH,
    CREDENTIAL_SEARCH,
    COMMENT_SEARCH,
    TAG_SEARCH,
    CREATE_CREDENTIAL,
    UPDATE_CREDENTIAL_COMMENT,
    UPDATE_CREDENTIAL_ACCOUNT,
    UPDATE_CREDENTIAL_REALM,
    UPDATE_CREDENTIAL_TYPE,
    UPDATE_CREDENTIAL_VALUE,
    UPDATE_CREDENTIAL_DELETED,
    PROMOTE_CREDENTIAL_TO_VERIFIED,
    BULK_DELETE_HARVESTED,
    FETCH_ALL_HARVESTED,
    BULK_DELETE_BY_IDS,
    BULK_DELETE_VERIFIED,
    CHECK_EXISTING_CREDENTIAL,
    CREATE_CREDENTIAL_MUT,
} from '../lib/api/credentials';

const TAG_PRESET_COLORS = [
    '#22d3ee', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#3b82f6', '#f97316', '#14b8a6', '#6366f1',
];

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
const readUrlParams = (): { search: string; searchField: SearchField; deleted: boolean; types: Set<string> } => {
    const p = new URLSearchParams(window.location.search);
    const rawTypes = (p.get('types') ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const validTypes = rawTypes.filter(t => CREDENTIAL_TYPES.includes(t));
    return {
        search:      p.get('search') ?? '',
        searchField: (SEARCH_FIELD_OPTIONS.includes(p.get('searchField') as SearchField)
            ? p.get('searchField')
            : 'Account') as SearchField,
        deleted: p.get('deleted') === 'true',
        types:   new Set(validTypes),
    };
};
const writeUrlParams = (search: string, searchField: SearchField, deleted: boolean, types: Set<string>) => {
    const p = new URLSearchParams();
    if (search)                    p.set('search', search);
    if (searchField !== 'Account') p.set('searchField', searchField);
    if (deleted)                   p.set('deleted', 'true');
    if (types.size > 0)            p.set('types', [...types].join(','));
    const s = p.toString();
    window.history.replaceState(null, '', s ? `?${s}` : window.location.pathname);
};

// ============================================
// Main Component
// ============================================
export default function Credentials() {
    const isSidebarCollapsed = useAppStore(s => s.isSidebarCollapsed);
    const me = useReactiveVar(meState);
    const operationId: number = me?.user?.current_operation_id ?? 0;

    // ── state ──
    const initial = readUrlParams();
    const [searchQuery, setSearchQuery]   = useState(initial.search);
    const [searchField, setSearchField]   = useState<SearchField>(initial.searchField);
    const [showDeleted, setShowDeleted]   = useState(initial.deleted);
    const [selectedTypes, setSelectedTypes] = useState<Set<string>>(initial.types);
    const showDeletedRef                  = useRef(initial.deleted);
    const searchFieldRef                  = useRef<SearchField>(initial.searchField);
    const selectedTypesRef                = useRef<Set<string>>(initial.types);
    const [currentPage, setCurrentPage]   = useState(1);
    const [totalCount, setTotalCount]     = useState(0);
    const [credentials, setCredentials]   = useState<Credential[]>([]);

    const [createModalOpen, setCreateModalOpen]       = useState(false);
    const [editModal, setEditModal]                   = useState<{ credential: Credential; field: string } | null>(null);
    const [expandedCredential, setExpandedCredential] = useState<number | null>(null);
    const [visibleCredentials, setVisibleCredentials] = useState<Set<number>>(new Set());
    const [confirmDelete, setConfirmDelete]           = useState<Credential | null>(null);
    const [bulkDeleteConfirm, setBulkDeleteConfirm]   = useState<'harvested' | 'verified' | null>(null);
    const [pasteMzOpen, setPasteMzOpen]               = useState(false);
    const [addTagFor, setAddTagFor]                   = useState<Credential | null>(null);
    const [createTagTypeOpen, setCreateTagTypeOpen]   = useState(false);

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
    const [runAccountSearch]    = useLazyQuery<any>(ACCOUNT_SEARCH,    { fetchPolicy: 'no-cache', onCompleted: handleSearchResults, onError: handleSearchError });
    const [runRealmSearch]      = useLazyQuery<any>(REALM_SEARCH,      { fetchPolicy: 'no-cache', onCompleted: handleSearchResults, onError: handleSearchError });
    const [runCredSearch]       = useLazyQuery<any>(CREDENTIAL_SEARCH, { fetchPolicy: 'no-cache', onCompleted: handleSearchResults, onError: handleSearchError });
    const [runCommentSearch]    = useLazyQuery<any>(COMMENT_SEARCH,    { fetchPolicy: 'no-cache', onCompleted: handleSearchResults, onError: handleSearchError });
    const [runTagSearch]        = useLazyQuery<any>(TAG_SEARCH,        { fetchPolicy: 'no-cache', onCompleted: handleSearchResults, onError: handleSearchError });

    // ── search dispatcher ──────────────────────────────────────────────
    const doSearch = useCallback((field: SearchField, search: string, offset: number, deleted: boolean, opId: number) => {
        const s = `%${search}%`;
        // Server-side type filter — pass the full type list when no chip is
        // selected so `_in: $types` is a no-op; otherwise narrow to the chosen
        // subset so pagination respects the filter and matches always land on
        // the front pages.
        const sel = selectedTypesRef.current;
        const types = sel.size === 0 ? CREDENTIAL_TYPES : [...sel];
        const base = { operation_id: opId, offset, fetchLimit: FETCH_LIMIT, deleted, types };
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
                runTagSearch({ variables: { operation_id: opId, offset, fetchLimit: FETCH_LIMIT, tag: ts, deleted, types } });
                break;
            }
        }
    }, [runAccountSearch, runRealmSearch, runCredSearch, runCommentSearch, runTagSearch]);

    // ── mutations ──────────────────────────────────────────────────────
    const refresh = useCallback(() => {
        doSearch(searchFieldRef.current, searchQuery, (currentPage - 1) * FETCH_LIMIT, showDeletedRef.current, operationId);
    }, [doSearch, searchQuery, currentPage, operationId]);

    const [createCredential] = useMutation<any>(CREATE_CREDENTIAL, {
        onCompleted: (data: any) => {
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
    const [updateComment] = useMutation<any>(UPDATE_CREDENTIAL_COMMENT,  { onCompleted: () => { snackActions.success('Comment updated');    refresh(); } });
    const [updateAccount] = useMutation<any>(UPDATE_CREDENTIAL_ACCOUNT,  { onCompleted: () => { snackActions.success('Account updated');    refresh(); } });
    const [updateRealm]   = useMutation<any>(UPDATE_CREDENTIAL_REALM,    { onCompleted: () => { snackActions.success('Realm updated');      refresh(); } });
    const [updateType]    = useMutation<any>(UPDATE_CREDENTIAL_TYPE,     { onCompleted: () => { snackActions.success('Type updated');       refresh(); } });
    const [updateValue]   = useMutation<any>(UPDATE_CREDENTIAL_VALUE,    { onCompleted: () => { snackActions.success('Credential updated'); refresh(); } });
    const [updateDeleted] = useMutation<any>(UPDATE_CREDENTIAL_DELETED,  { onCompleted: () => { snackActions.success('Status updated');     refresh(); } });
    const [promoteToVerified] = useMutation<any>(PROMOTE_CREDENTIAL_TO_VERIFIED, {
        onCompleted: () => { snackActions.success('Moved to Verified Credentials'); refresh(); },
        onError:     () => snackActions.error('Failed to move credential'),
    });

    /** Strip the `[AUTO:source] …` prefix so the credential no longer matches
     *  `isHarvested()`. Preserves anything the operator typed after that block.
     *  Examples:
     *    "[AUTO:mimikatz] note · Pasted · 2026-05-14" → "note · Pasted · 2026-05-14"
     *    "[AUTO:bash_history]"                        → ""                                       */
    const stripAutoPrefix = (comment: string): string => {
        if (!comment) return '';
        return comment.replace(/^\s*\[AUTO:[^\]]*\]\s*/i, '').trim();
    };

    const [bulkDeleteHarvested, { loading: bulkDelHarvestedLoading }] = useMutation<any>(BULK_DELETE_HARVESTED, {
        onCompleted: (data: any) => {
            const n = data.update_credential?.affected_rows ?? 0;
            snackActions.success(`${n} harvested credential${n !== 1 ? 's' : ''} deleted`);
            setBulkDeleteConfirm(null);
            setCurrentPage(1);
            doSearch(searchFieldRef.current, searchQuery, 0, showDeletedRef.current, operationId);
        },
        onError: () => snackActions.error('Bulk delete failed'),
    });
    // ── dedup harvested credentials ──────────────────────────────────
    const [fetchAllHarvested] = useLazyQuery<any>(FETCH_ALL_HARVESTED, { fetchPolicy: 'no-cache' });
    const [bulkDeleteByIds]   = useMutation<any>(BULK_DELETE_BY_IDS);
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
                    // Refresh current view — read URL params to avoid stale closure
                    const current = readUrlParams();
                    doSearch(searchFieldRef.current, current.search, 0, showDeletedRef.current, operationId);
                }
            } catch (err) {
                console.error('Dedup failed:', err);
            }
        })();
    }, [operationId]); // eslint-disable-line react-hooks/exhaustive-deps

    const [bulkDeleteVerified, { loading: bulkDelVerifiedLoading }] = useMutation<any>(BULK_DELETE_VERIFIED, {
        onCompleted: (data: any) => {
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
        writeUrlParams(searchQuery, searchField, showDeleted, selectedTypes);
    }, [searchQuery, searchField, showDeleted, selectedTypes]);

    // ── Re-run server-side search when type chips change ──────────────
    // The very first run is owned by the on-mount effect below; this guard
    // prevents a duplicate query at startup.
    const typeFilterMountRef = useRef(true);
    useEffect(() => {
        selectedTypesRef.current = selectedTypes;
        if (typeFilterMountRef.current) { typeFilterMountRef.current = false; return; }
        if (!operationId) return;
        setCurrentPage(1);
        doSearch(searchFieldRef.current, searchQuery, 0, showDeletedRef.current, operationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTypes, operationId]);

    // ── on mount: load from URL params ────────────────────────────────
    useEffect(() => {
        const init = readUrlParams();
        setSearchQuery(init.search);
        setSearchField(init.searchField);
        setShowDeleted(init.deleted);
        setSelectedTypes(init.types);
        searchFieldRef.current = init.searchField;
        showDeletedRef.current = init.deleted;
        selectedTypesRef.current = init.types;
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

    /**
     * Export the given credential list to a CSV file the operator downloads.
     * Plaintext values are written in the clear — the file is for handoff to
     * cracking rigs, password managers, or reporting, so masking would
     * defeat the purpose. Operators are expected to handle the resulting
     * file the same way they handle the vault itself.
     */
    const exportCredentialsCsv = (scope: 'verified' | 'harvested', creds: Credential[]) => {
        if (creds.length === 0) {
            snackActions.warning(`No ${scope} credentials to export`);
            return;
        }
        const rows = creds.map(c => ({
            id:              c.id,
            account:         c.account ?? '',
            realm:           c.realm ?? '',
            type:            c.type ?? '',
            credential:      c.credential_text ?? '',
            comment:         c.comment ?? '',
            tags:            (c.tags ?? []).map(t => t.tagtype.name).join('; '),
            operator:        c.operator?.username ?? '',
            task_id:         c.task?.display_id ?? '',
            callback_id:     c.task?.callback?.display_id ?? '',
            callback_host:   c.task?.callback?.host ?? '',
            timestamp:       c.timestamp ?? '',
            deleted:         c.deleted ? 'true' : 'false',
        }));
        const csv = buildCsv(
            [
                { key: 'id',            header: 'id' },
                { key: 'account',       header: 'account' },
                { key: 'realm',         header: 'realm' },
                { key: 'type',          header: 'type' },
                { key: 'credential',    header: 'credential' },
                { key: 'comment',       header: 'comment' },
                { key: 'tags',          header: 'tags' },
                { key: 'operator',      header: 'operator' },
                { key: 'task_id',       header: 'task_id' },
                { key: 'callback_id',   header: 'callback_id' },
                { key: 'callback_host', header: 'callback_host' },
                { key: 'timestamp',     header: 'timestamp' },
                { key: 'deleted',       header: 'deleted' },
            ],
            rows,
        );
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        downloadBlob(
            new Blob([csv], { type: 'text/csv;charset=utf-8' }),
            `minerva-${scope}-credentials-${stamp}.csv`,
        );
        snackActions.success(`Exported ${creds.length} ${scope} credential${creds.length !== 1 ? 's' : ''}`);
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
    // A credential is "harvested" when it's still attached to a Mythic task or
    // its comment carries the auto-harvest marker. Operator-promoted rows
    // override that classification via a `[VERIFIED]` comment prefix — see
    // promoteToVerified mutation in lib/api/credentials.ts.
    const isHarvested = (c: Credential) => {
        if (c.comment?.startsWith('[VERIFIED]')) return false;
        return Boolean(c.task) || Boolean(c.comment?.startsWith('[AUTO'));
    };
    const parseAutoSource = (comment: string): string | null => {
        if (!comment?.startsWith('[AUTO:')) return null;
        const tagM = comment.match(/\[AUTO:([^\]]+)\]\s*([^·]*)/);
        if (!tagM) return null;
        const tag    = tagM[1];
        const sub    = tagM[2].trim();
        const taskM  = comment.match(/Task #(\d+)/);
        const hostM  = comment.match(/Host:\s*([^·]+)/);
        const pasted = /·\s*Pasted\s*·/.test(comment);
        if (taskM && hostM) return `${tag}${sub ? ' · ' + sub : ''} | Task #${taskM[1]} | Host: ${hostM[1].trim()}`;
        if (pasted)         return `${tag}${sub ? ' · ' + sub : ''} | Pasted (manual)`;
        return `${tag}${sub ? ' · ' + sub : ''}`;
    };

    // Type filtering happens server-side via `$types` in the GraphQL queries,
    // so the credentials array we get here is already narrowed correctly.
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

    // ── tag mutations ─────────────────────────────────────────────────
    const [deleteTag] = useMutation<any>(DELETE_TAG, {
        onCompleted: () => { snackActions.success('Tag removed'); refresh(); },
        onError: (err) => snackActions.error('Failed to remove tag: ' + err.message),
    });

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
        onEditTags: () => {
            // No more popup — open card and scroll the tag panel into view
            if (expandedCredential !== cred.id) setExpandedCredential(cred.id);
            requestAnimationFrame(() => {
                document.getElementById(`cred-tags-${cred.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        },
        onAddTag:    () => setAddTagFor(cred),
        onRemoveTag: (tagId: number) => deleteTag({ variables: { tag_id: tagId } }),
        // Promote handler — only fires from the button rendered on harvested
        // cards. We can't null out `task_id` (Hasura permissions), so we
        // express verification via a comment-prefix convention: strip any
        // `[AUTO:…]` marker and prepend `[VERIFIED]`. The classifier
        // (`isHarvested` + `isHarvestedCard` + BULK_* queries) all treat
        // `[VERIFIED]` as an override that moves the row out of Harvested.
        onPromote: () => {
            const stripped = stripAutoPrefix(cred.comment);
            const next = stripped ? `[VERIFIED] ${stripped}` : '[VERIFIED]';
            promoteToVerified({ variables: { credential_id: cred.id, comment: next } });
        },
    });

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">

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
                            <p className="text-xs text-white/95 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
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
                                    : 'border-white/25 text-white/80 hover:border-signal hover:text-signal'
                            )}
                        >
                            {showDeleted ? <Eye size={14} /> : <EyeOff size={14} />}
                            {showDeleted ? 'SHOWING DELETED' : 'SHOW DELETED'}
                        </button>
                        <button
                            onClick={refresh}
                            className="p-2 border border-white/25 hover:border-signal text-white/80 hover:text-signal transition-colors rounded-full"
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
                                        : 'text-white/70 hover:text-white/95'
                                )}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* Search input */}
                    <div className="relative flex-1 max-w-xl min-w-[200px]">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70" />
                        <input
                            type="text"
                            placeholder={`Search by ${searchField.toLowerCase()}...`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(searchQuery); }}
                            className="w-full bg-black/40 border border-white/10 rounded pl-9 pr-9 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-signal/50"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => handleSearchSubmit('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/55 hover:text-white/95"
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
                    <div className="text-xs text-white/70 font-mono ml-auto flex items-center gap-3">
                        <span><span className="text-signal">{verifiedCount}</span> verified</span>
                        <span className="text-white/45">|</span>
                        <span><span className="text-red-400/80">{harvestedCount}</span> harvested</span>
                        <span className="text-white/45">|</span>
                        <span className="text-white/55">total: {totalCount}</span>
                    </div>

                    {/* ── Type filter chips (multi-select) ───────────────── */}
                    <div className="basis-full flex items-center flex-wrap gap-2 pt-1 border-t border-white/10">
                        <span className="text-[10px] font-mono text-white/55 uppercase tracking-[0.2em] shrink-0">Type:</span>
                        {CREDENTIAL_TYPES.map(t => {
                            const c = TYPE_COLORS[t] ?? TYPE_COLORS.plaintext;
                            const Icon = TYPE_ICONS[t] ?? <Lock size={10} />;
                            const selected = selectedTypes.has(t);
                            return (
                                <button
                                    key={t}
                                    onClick={() => setSelectedTypes(prev => {
                                        const next = new Set(prev);
                                        if (next.has(t)) next.delete(t); else next.add(t);
                                        return next;
                                    })}
                                    className={cn(
                                        'flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.15em] border transition-colors',
                                        selected
                                            ? `${c.bg} ${c.text} ${c.border}`
                                            : 'bg-black/30 text-white/70 border-white/15 hover:border-white/30 hover:text-white'
                                    )}
                                >
                                    {Icon}
                                    {t}
                                </button>
                            );
                        })}
                        {selectedTypes.size > 0 && (
                            <button
                                onClick={() => setSelectedTypes(new Set())}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-red-300 hover:text-red-200 transition-colors"
                                title="Clear type filter"
                            >
                                <X size={11} /> CLEAR
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Credentials Content ────────────────────────────── */}
                <div className="flex-1 overflow-auto pr-1">
                    {credentials.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            <Key size={48} className="text-white/55 mb-4" />
                            <h3 className="text-lg font-bold text-white mb-2">NO CREDENTIALS FOUND</h3>
                            <p className="text-white/70 text-sm">
                                {searchQuery ? 'Try adjusting your search query' : 'Create your first credential to get started'}
                            </p>
                            <div className="mt-4 flex items-center gap-2">
                                <button
                                    onClick={() => setCreateModalOpen(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-signal/10 border border-signal/30 text-signal font-mono text-xs rounded hover:bg-signal/20 transition-colors"
                                >
                                    <Plus size={12} /> NEW CREDENTIAL
                                </button>
                                <button
                                    onClick={() => setPasteMzOpen(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-xs rounded hover:bg-red-500/20 transition-colors"
                                >
                                    <ClipboardPaste size={12} /> PASTE MIMIKATZ
                                </button>
                            </div>
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
                                    <span className="text-[10px] text-white/70 px-1.5 py-0.5 bg-white/10 rounded font-mono">
                                        {verifiedCount}
                                    </span>
                                    <span className="text-[10px] text-white/55 font-mono">· manually added only</span>
                                    <div className="ml-auto flex items-center gap-2">
                                        {verifiedCount > 0 && (
                                            <button
                                                onClick={() => exportCredentialsCsv(
                                                    'verified',
                                                    [...verifiedByRealm.values()].flat(),
                                                )}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-signal/10 border border-signal/30 text-signal font-mono text-xs hover:bg-signal/20 transition-colors rounded"
                                                title={`Export ${verifiedCount} verified credentials as CSV`}
                                            >
                                                <Download size={11} /> EXPORT CSV
                                            </button>
                                        )}
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
                                    <div className="flex flex-col items-center justify-center py-10 text-white/45">
                                        <Shield size={32} className="mb-2 opacity-30" />
                                        <span className="font-mono text-xs">No verified credentials</span>
                                        <span className="font-mono text-[10px] text-white/55 mt-1">Click NEW CREDENTIAL to manually add</span>
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
                                    <span className="text-[10px] text-white/70 px-1.5 py-0.5 bg-white/10 rounded font-mono">
                                        {harvestedCount}
                                    </span>
                                    <span className="text-[10px] text-white/55 font-mono">· from agents / mimikatz / secretsdump</span>
                                    <div className="ml-auto flex items-center gap-2">
                                        {harvestedCount > 0 && (
                                            <button
                                                onClick={() => exportCredentialsCsv(
                                                    'harvested',
                                                    [...harvestedByRealm.values()].flat(),
                                                )}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-signal/10 border border-signal/30 text-signal font-mono text-xs hover:bg-signal/20 transition-colors rounded"
                                                title={`Export ${harvestedCount} harvested credentials as CSV`}
                                            >
                                                <Download size={11} /> EXPORT CSV
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setPasteMzOpen(true)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 font-bold font-mono text-xs hover:bg-red-500/20 transition-colors rounded"
                                            title="Paste raw mimikatz or secretsdump.py output to auto-harvest credentials"
                                        >
                                            <ClipboardPaste size={11} /> PASTE DUMP
                                        </button>
                                        {harvestedCount > 0 && (
                                            <button
                                                onClick={() => setBulkDeleteConfirm('harvested')}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-xs hover:bg-red-500/20 transition-colors rounded"
                                                title={`Delete all ${harvestedCount} harvested credentials`}
                                            >
                                                <Trash2 size={11} /> DELETE ALL ({harvestedCount})
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {harvestedByRealm.size === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-white/45">
                                        <Activity size={32} className="mb-2 opacity-30" />
                                        <span className="font-mono text-xs">No harvested credentials yet</span>
                                        <span className="font-mono text-[10px] text-white/55 mt-1">Run mimikatz or secretsdump.py on a target — or click PASTE DUMP to import raw output</span>
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
                            className="p-1 disabled:opacity-30 text-white/80 hover:text-white transition-colors" title="First page">
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
                                            : 'text-white/70 hover:text-white/95 hover:bg-white/5'
                                    )}>
                                    {page}
                                </button>
                            );
                        })}
                        <button onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages}
                            className="p-1 disabled:opacity-30 text-white/80 hover:text-white transition-colors" title="Last page">
                            <ChevronRight size={13} />
                        </button>
                        <span className="text-[10px] text-white/55 font-mono ml-2">
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
                {pasteMzOpen && (
                    <PasteMimikatzDialog
                        onClose={() => setPasteMzOpen(false)}
                        onSaved={() => { setPasteMzOpen(false); refresh(); }}
                    />
                )}
                {addTagFor && (
                    <AddTagDialog
                        credential={addTagFor}
                        onClose={() => setAddTagFor(null)}
                        onAdded={() => { setAddTagFor(null); refresh(); }}
                        onRequestCreateTagType={() => setCreateTagTypeOpen(true)}
                    />
                )}
                {createTagTypeOpen && (
                    <CreateTagTypeDialog
                        onClose={() => setCreateTagTypeOpen(false)}
                        onCreated={() => setCreateTagTypeOpen(false)}
                    />
                )}
            </AnimatePresence>
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
                <span className="text-[10px] text-white/55 px-1 py-0.5 bg-white/5 rounded">{creds.length}</span>
            </div>
            {accountGroups ? (
                <div className="space-y-3">
                    {Array.from(accountGroups.entries()).map(([account, acctCreds]) => (
                        <div key={account} className="border-l-2 border-white/15 pl-3 space-y-1.5">
                            <div className="flex items-center gap-2 py-0.5">
                                <User size={11} className="text-white/70 shrink-0" />
                                <span className="font-mono text-xs text-white/95">{account}</span>
                                {acctCreds.length > 1 && (
                                    <span className="text-[9px] text-white/55 px-1 py-0.5 bg-white/5 rounded">{acctCreds.length}</span>
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
    onAddTag, onRemoveTag, onPromote,
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
    onAddTag: () => void;
    onRemoveTag: (tagId: number) => void;
    /** Optional — only attached for harvested cards so the button renders
     *  to the left of the delete action. Moves the credential to Verified. */
    onPromote?: () => void;
}) => {
    // A credential is "harvested" if it's still linked to a task OR its
    // comment carries the auto-harvest marker — but an operator-applied
    // `[VERIFIED]` prefix overrides that. The promote button only shows
    // when the credential is still classified as harvested AND not deleted.
    const hasVerifiedMarker = credential.comment?.startsWith('[VERIFIED]');
    const isHarvestedCard = !credential.deleted && !hasVerifiedMarker && (
        Boolean(credential.task) || Boolean(credential.comment?.startsWith('[AUTO'))
    );
    const typeColor = TYPE_COLORS[credential.type] ?? TYPE_COLORS.plaintext;
    const typeIcon  = TYPE_ICONS[credential.type]  ?? <Lock size={12} />;
    const DISPLAY_MAX_LEN = 50;
    const MASK_MAX_LEN = 24;
    const raw       = isVisible ? credential.credential_text : '•'.repeat(Math.min(credential.credential_text?.length ?? 0, MASK_MAX_LEN));
    const truncated = raw.length > DISPLAY_MAX_LEN ? raw.slice(0, DISPLAY_MAX_LEN) + '…' : raw;

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
                    <User size={12} className="text-white/70 shrink-0" />
                    <span className="text-sm text-white font-mono truncate">{credential.account}</span>
                </div>

                {/* Credential value (masked) */}
                <div className="flex-1 flex items-center gap-2 min-w-0">
                    <Lock size={12} className="text-white/70 shrink-0" />
                    <span className="text-sm text-white/95 font-mono truncate">{truncated}</span>
                    <button onClick={onToggleVisibility} className="p-1 hover:bg-white/10 rounded transition-colors shrink-0">
                        {isVisible ? <EyeOff size={12} className="text-white/80" /> : <Eye size={12} className="text-white/80" />}
                    </button>
                    <button onClick={() => onCopy(credential.credential_text, 'Credential')} className="p-1 hover:bg-white/10 rounded transition-colors shrink-0">
                        <Copy size={12} className="text-white/80" />
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
                            <span className="text-[9px] text-white/55">+{credential.tags.length - 3}</span>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    <button onClick={onEditTags} className="p-1.5 hover:bg-white/10 rounded text-white/80 hover:text-yellow-400 transition-colors" title="Edit Tags">
                        <Tag size={13} />
                    </button>
                    <button onClick={onExpand}
                        className={cn('p-1.5 rounded transition-colors', isExpanded ? 'bg-white/10 text-white' : 'hover:bg-white/10 text-white/80')}>
                        <ChevronDown size={14} className={cn('transition-transform', isExpanded && 'rotate-180')} />
                    </button>
                    {/* Promote to Verified — only rendered for harvested cards. Sits
                        immediately left of the delete button so the destructive
                        action stays the rightmost (and last) thing in the row. */}
                    {isHarvestedCard && onPromote && (
                        <button
                            onClick={onPromote}
                            className="p-1.5 rounded transition-colors hover:bg-accent/20 text-accent/85 hover:text-accent"
                            title="Move to Verified Credentials"
                        >
                            <BadgeCheck size={14} />
                        </button>
                    )}
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
                                    <label className="text-white/70 text-[10px]">TIMESTAMP</label>
                                    <p className="text-white font-mono text-xs">{new Date(credential.timestamp).toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Full credential value */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-white/70 text-[10px]">CREDENTIAL</label>
                                    <div className="flex gap-1">
                                        <button onClick={() => onEdit('credential')} className="p-1 hover:bg-white/10 rounded text-white/80 hover:text-white" title="Edit">
                                            <Edit3 size={10} />
                                        </button>
                                        <button onClick={() => onCopy(credential.credential_text, 'Credential')} className="p-1 hover:bg-white/10 rounded text-white/80 hover:text-white" title="Copy">
                                            <Copy size={10} />
                                        </button>
                                    </div>
                                </div>
                                <pre className="p-2 bg-black/40 rounded border border-white/10 text-xs text-white/95 font-mono whitespace-pre-wrap break-all max-h-40 overflow-auto">
                                    {isVisible
                                        ? credential.credential_text
                                        : '•'.repeat(Math.min(credential.credential_text?.length ?? 0, DISPLAY_MAX_LEN))}
                                </pre>
                            </div>

                            {/* Comment */}
                            <EditableField label="Comment" value={credential.comment || '—'} onEdit={() => onEdit('comment')} fullWidth />

                            {/* Source / Operator */}
                            <div className="pt-3 border-t border-white/10">
                                <label className="text-white/70 text-[10px] block mb-2">SOURCE</label>
                                {credential.task ? (
                                    <div className="flex items-center gap-4 text-xs flex-wrap">
                                        <a href={`/new/console/${credential.task.callback?.display_id}`}
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
                                            <span className="text-white/70">Host: {credential.task.callback.host}</span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-xs text-white/80">
                                        <User size={11} />
                                        <span>{credential.operator?.username ?? '—'}</span>
                                        <span className="text-white/55">(manual entry)</span>
                                    </div>
                                )}
                            </div>

                            {/* Tags management — inline (no popup) */}
                            <div id={`cred-tags-${credential.id}`} className="pt-3 border-t border-white/10">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-white/70 text-[10px] tracking-widest">TAGS</label>
                                    <button onClick={onAddTag}
                                        className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-[10px] font-mono rounded hover:bg-yellow-500/20 transition-colors"
                                        title="Add a tag">
                                        <Plus size={10} /> ADD TAG
                                    </button>
                                </div>
                                {credential.tags && credential.tags.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {credential.tags.map(tag => (
                                            <span key={tag.id}
                                                className="group inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded text-[10px] font-mono transition-colors"
                                                style={{
                                                    backgroundColor: `${tag.tagtype.color}20`,
                                                    color: tag.tagtype.color,
                                                    border: `1px solid ${tag.tagtype.color}40`,
                                                }}>
                                                {tag.tagtype.name}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onRemoveTag(tag.id); }}
                                                    className="opacity-50 group-hover:opacity-100 hover:bg-white/10 rounded p-0.5 transition-opacity"
                                                    title={`Remove ${tag.tagtype.name}`}>
                                                    <X size={9} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="text-white/45 text-[10px] font-mono">No tags — click ADD TAG to attach one</span>
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
            <label className="text-white/70 text-[10px]">{label.toUpperCase()}</label>
            <div className="flex gap-1">
                <button onClick={onEdit} className="p-0.5 hover:bg-white/10 rounded text-white/80 hover:text-white" title={`Edit ${label}`}>
                    <Edit3 size={10} />
                </button>
                {onCopy && (
                    <button onClick={onCopy} className="p-0.5 hover:bg-white/10 rounded text-white/80 hover:text-white" title={`Copy ${label}`}>
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
                <p><span className="text-white/70">Account: </span><span className="text-white/95">{credential.account}</span></p>
                <p><span className="text-white/70">Realm: </span><span className="text-white/95">{credential.realm}</span></p>
                <p><span className="text-white/70">Type: </span><span className="text-white/95">{credential.type}</span></p>
            </div>
            {!credential.deleted && (
                <p className="text-[10px] text-white/70">
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
                    className="flex-1 py-2 bg-white/5 text-white/80 border border-white/10 rounded text-xs font-mono hover:bg-white/10 transition-colors">
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
                <p className="text-[10px] text-white/70">
                    Deleted credentials cannot be used in tasking. They can be restored individually via <span className="text-white/80">SHOW DELETED</span>.
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
                        className="flex-1 py-2 bg-white/5 text-white/80 border border-white/10 rounded text-xs font-mono hover:bg-white/10 transition-colors disabled:opacity-50">
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
                        <XCircle size={18} className="text-white/80" />
                    </button>
                </div>
                <div className="p-4 space-y-4">
                    <div>
                        <label className="text-white/80 text-xs block mb-1">Type</label>
                        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500/50">
                            {CREDENTIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-white/80 text-xs block mb-1">Realm / Domain</label>
                        <input type="text" value={form.realm} onChange={(e) => setForm({ ...form, realm: e.target.value })}
                            placeholder="domain.com"
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-yellow-500/50" />
                    </div>
                    <div>
                        <label className="text-white/80 text-xs block mb-1">Account</label>
                        <input type="text" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })}
                            placeholder="username"
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-yellow-500/50" />
                    </div>
                    <div>
                        <label className="text-white/80 text-xs block mb-1">Credential</label>
                        <textarea value={form.credential} onChange={(e) => setForm({ ...form, credential: e.target.value })}
                            placeholder="password or hash..." rows={3}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-yellow-500/50 resize-none" />
                    </div>
                    <div>
                        <label className="text-white/80 text-xs block mb-1">Comment</label>
                        <input type="text" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })}
                            placeholder="Optional comment..."
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-yellow-500/50" />
                    </div>
                </div>
                <div className="p-4 border-t border-white/10 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-white/80 hover:text-white transition-colors">Cancel</button>
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
                        <XCircle size={18} className="text-white/80" />
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
                    <button onClick={onClose} className="px-4 py-2 text-sm text-white/80 hover:text-white transition-colors">Cancel</button>
                    <button onClick={() => onSave(value)}
                        className="px-4 py-2 bg-signal/20 text-signal border border-signal/30 rounded text-sm hover:bg-signal/30 transition-colors">
                        Save
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// ============================================
// PasteMimikatzDialog
// Manual auto-harvest: parses raw mimikatz output and writes
// extracted credentials with `[AUTO:mimikatz] ... · Pasted · DATE`
// so they land in the Auto-Harvested section, just like a live task.
// ============================================
const PasteMimikatzDialog = ({
    onClose, onSaved,
}: {
    onClose: () => void;
    onSaved: () => void;
}) => {
    const client = useApolloClient();
    const [createCred] = useMutation<any>(CREATE_CREDENTIAL_MUT);
    const [raw, setRaw] = useState('');
    const [stage, setStage] = useState<'input' | 'preview' | 'saving' | 'done'>('input');
    const [format, setFormat] = useState<'mimikatz' | 'secretsdump'>('mimikatz');
    const [extracted, setExtracted] = useState<MzExtractedCred[]>([]);
    const [savedCount, setSavedCount] = useState(0);
    const [skippedCount, setSkippedCount] = useState(0);
    const [errorCount, setErrorCount]     = useState(0);
    const [parseWarn, setParseWarn]       = useState<string | null>(null);

    const handleParse = () => {
        const text = raw.trim();
        if (!text) { snackActions.warning('Paste mimikatz or secretsdump output first'); return; }

        // Auto-detect the source tool. An interactive mimikatz session is
        // unmistakable (it carries `mimikatz #` prompts); anything else that
        // smells like Impacket goes through the secretsdump parser.
        const { sections } = mzSplitSections(text);
        if (sections.length > 0) {
            setFormat('mimikatz');
            const creds = mzExtractAllCreds(sections);
            setExtracted(creds);
            setParseWarn(creds.length === 0 ? `${sections.length} mimikatz command section(s) detected, but no harvestable credentials found.` : null);
            setStage('preview');
            return;
        }

        if (looksLikeSecretsdump(text)) {
            setFormat('secretsdump');
            const creds = secretsdumpExtractAllCreds(text);
            setExtracted(creds);
            setParseWarn(creds.length === 0 ? 'Detected secretsdump.py output, but no harvestable credentials were found.' : null);
            setStage('preview');
            return;
        }

        setFormat('mimikatz');
        setParseWarn('Unrecognised output. Expected an interactive mimikatz session (with `mimikatz #` prompts) or secretsdump.py output (uid:rid:lm:nt hashes, $DCC2$ entries, or LSA Secrets).');
        setExtracted([]);
        setStage('preview');
    };

    const handleSave = async () => {
        if (extracted.length === 0) return;
        setStage('saving');
        let saved = 0, skipped = 0, errored = 0;
        const ts = new Date().toISOString().slice(0, 10);
        for (const c of extracted) {
            try {
                const account = c.account || '(unknown)';
                const realm   = c.realm   || '';
                const { data: checkData } = await client.query({
                    query: CHECK_EXISTING_CREDENTIAL,
                    variables: { account, realm, credential: c.credential, type: c.credType },
                    fetchPolicy: 'no-cache',
                });
                if ((checkData as any)?.credential?.length > 0) { skipped++; continue; }
                const res = await createCred({ variables: {
                    account,
                    realm,
                    credential: c.credential,
                    type:       c.credType,
                    comment: `[AUTO:${format}] ${c.source} · Pasted · ${ts}`,
                }});
                if (res.data?.createCredential?.status === 'error') errored++;
                else saved++;
            } catch { errored++; }
        }
        setSavedCount(saved);
        setSkippedCount(skipped);
        setErrorCount(errored);
        setStage('done');
        const parts: string[] = [];
        if (saved   > 0) parts.push(`${saved} saved`);
        if (skipped > 0) parts.push(`${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped`);
        if (errored > 0) parts.push(`${errored} error${errored !== 1 ? 's' : ''}`);
        if (saved > 0)      snackActions.success(parts.join(' · '));
        else if (skipped)   snackActions.info(parts.join(' · '));
        else if (errored)   snackActions.error(parts.join(' · '));
    };

    const handleDone = () => { onSaved(); };

    const counts = useMemo(() => {
        const bySrc: Record<string, number> = {};
        let plaintext = 0, hash = 0, key = 0;
        for (const c of extracted) {
            bySrc[c.source] = (bySrc[c.source] || 0) + 1;
            if (c.credType === 'plaintext') plaintext++;
            else if (c.credType === 'key')  key++;
            else hash++;
        }
        return { bySrc, plaintext, hash, key };
    }, [extracted]);

    // Preview shows the full plaintext so the operator can verify what's
    // about to be written to the vault. Masking happens only after the
    // credentials are saved — the regular CredentialCard hides them by
    // default behind its Eye/EyeOff toggle.

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-void border border-red-500/40 rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-red-900/40 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <Terminal size={18} className="text-red-400" />
                        <h2 className="font-bold text-white tracking-wide">Paste Credential Dump</h2>
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 border border-red-500/60 bg-red-900/25 text-red-400 rounded-sm ml-2">
                            ⚠ AUTO-HARVEST
                        </span>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
                        <XCircle size={18} className="text-white/80" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 overflow-y-auto flex-1 min-h-0">
                    {stage === 'input' && (
                        <>
                            <p className="text-xs text-white/80 mb-2 leading-relaxed">
                                Paste raw <span className="text-red-300 font-mono">mimikatz</span> or{' '}
                                <span className="text-purple-300 font-mono">secretsdump.py</span> output — the format is detected automatically.
                            </p>
                            <p className="text-[11px] text-white/65 mb-2 leading-relaxed">
                                <span className="text-red-300 font-mono">mimikatz</span> (interactive session with <span className="text-red-400 font-mono">mimikatz #</span> prompts):{' '}
                                <span className="text-red-300 font-mono">sekurlsa::logonpasswords</span>,{' '}
                                <span className="text-red-300 font-mono">sekurlsa::ekeys</span>,{' '}
                                <span className="text-red-300 font-mono">lsadump::sam</span>,{' '}
                                <span className="text-orange-300 font-mono">lsadump::secrets</span>,{' '}
                                <span className="text-orange-300 font-mono">lsadump::cache</span>,{' '}
                                <span className="text-fuchsia-300 font-mono">lsadump::dcsync</span>,{' '}
                                <span className="text-yellow-300 font-mono">vault::cred /patch</span>.
                            </p>
                            <p className="text-[11px] text-white/65 mb-2 leading-relaxed">
                                <span className="text-purple-300 font-mono">secretsdump.py</span>: SAM &amp; NTDS hashes, cached <span className="text-purple-300 font-mono">$DCC2$</span> logons, LSA Secrets ($MACHINE.ACC NTLM + Kerberos keys), Kerberos keys, DefaultPassword, and DPAPI/NL$KM/gMSA secrets. Raw hex-byte dumps are skipped.
                            </p>
                            <p className="text-[11px] text-white/55 mb-2">Duplicates are skipped automatically.</p>
                            <textarea
                                autoFocus
                                value={raw}
                                onChange={(e) => setRaw(e.target.value)}
                                placeholder={
                                    'mimikatz # privilege::debug\n' +
                                    'Privilege \'20\' OK\n\n' +
                                    'mimikatz # sekurlsa::logonpasswords\n' +
                                    '...'
                                }
                                rows={16}
                                className="w-full bg-black/60 border border-white/10 rounded px-3 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:border-red-500/50 resize-none font-mono leading-relaxed"
                            />
                            <p className="text-[10px] text-white/55 mt-2 font-mono">
                                {raw.length} char{raw.length !== 1 ? 's' : ''}
                            </p>
                        </>
                    )}

                    {stage === 'preview' && (
                        <>
                            {parseWarn && (
                                <div className="flex items-start gap-2 px-3 py-2 mb-3 bg-yellow-900/15 border border-yellow-500/30 rounded">
                                    <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
                                    <span className="text-[11px] text-yellow-200 leading-relaxed">{parseWarn}</span>
                                </div>
                            )}
                            {extracted.length > 0 && (
                                <>
                                    <div className="flex items-center gap-3 mb-3 pb-2 border-b border-white/10 flex-wrap">
                                        <span className={cn(
                                            'text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border shrink-0',
                                            format === 'secretsdump'
                                                ? 'border-purple-500/50 bg-purple-900/25 text-purple-300'
                                                : 'border-red-500/50 bg-red-900/25 text-red-300',
                                        )}>
                                            {format}
                                        </span>
                                        <span className="text-sm text-white font-mono font-bold">{extracted.length}</span>
                                        <span className="text-xs text-white/80 font-mono">credential{extracted.length !== 1 ? 's' : ''} extracted</span>
                                        <span className="text-white/45">·</span>
                                        {counts.plaintext > 0 && <span className="text-[10px] font-mono text-green-400">{counts.plaintext} plaintext</span>}
                                        {counts.hash      > 0 && <span className="text-[10px] font-mono text-red-400">{counts.hash} hash</span>}
                                        {counts.key       > 0 && <span className="text-[10px] font-mono text-purple-400">{counts.key} key</span>}
                                        <span className="ml-auto flex flex-wrap gap-1.5">
                                            {Object.entries(counts.bySrc).map(([src, n]) => (
                                                <span key={src} className="text-[9px] font-mono px-1.5 py-0.5 bg-white/5 border border-white/10 rounded">
                                                    {src} <span className="text-white/70">×{n}</span>
                                                </span>
                                            ))}
                                        </span>
                                    </div>
                                    <div className="space-y-1 max-h-[40vh] overflow-y-auto pr-1">
                                        {extracted.map((c, i) => (
                                            <div key={i} className={cn(
                                                'flex items-center gap-2 px-2 py-1.5 rounded border text-xs font-mono',
                                                c.credType === 'plaintext'
                                                    ? 'border-green-500/30 bg-green-900/10'
                                                    : c.credType === 'key'
                                                        ? 'border-purple-500/30 bg-purple-900/10'
                                                        : 'border-red-500/30 bg-red-900/10',
                                            )}>
                                                <span className={cn(
                                                    'shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border',
                                                    c.credType === 'plaintext'
                                                        ? 'border-green-500/40 text-green-300 bg-green-900/30'
                                                        : c.credType === 'key'
                                                            ? 'border-purple-500/40 text-purple-300 bg-purple-900/30'
                                                            : 'border-red-500/40   text-red-300   bg-red-900/30',
                                                )}>
                                                    {c.credType}
                                                </span>
                                                {c.realm && <span className="text-cyan-300 shrink-0">{c.realm}\</span>}
                                                <span className="text-white shrink-0">{c.account || '(unknown)'}</span>
                                                <span
                                                    className={cn(
                                                        'truncate flex-1 break-all font-bold select-all',
                                                        c.credType === 'plaintext'
                                                            ? 'text-green-200'
                                                            : c.credType === 'key'
                                                                ? 'text-purple-200'
                                                                : 'text-red-200',
                                                    )}
                                                    title="Click to select. Saved value will be masked in the vault."
                                                >
                                                    {c.credential}
                                                </span>
                                                <span className="text-[9px] text-white/55 shrink-0">{c.source}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    {stage === 'saving' && (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Activity size={32} className="text-yellow-400 animate-spin" />
                            <span className="text-sm text-yellow-300 font-mono">Saving {extracted.length} credential{extracted.length !== 1 ? 's' : ''} to vault…</span>
                        </div>
                    )}

                    {stage === 'done' && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Key size={32} className="text-signal" />
                            <div className="text-center space-y-1">
                                <p className="text-lg text-white font-mono font-bold">{savedCount} saved</p>
                                <div className="text-xs text-white/80 font-mono">
                                    {skippedCount > 0 && <span>{skippedCount} duplicate{skippedCount !== 1 ? 's' : ''} skipped</span>}
                                    {skippedCount > 0 && errorCount > 0 && <span className="mx-1 text-white/45">·</span>}
                                    {errorCount  > 0 && <span className="text-red-400">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 flex justify-end gap-2 shrink-0">
                    {stage === 'input' && (
                        <>
                            <button onClick={onClose} className="px-4 py-2 text-sm text-white/80 hover:text-white transition-colors">Cancel</button>
                            <button onClick={handleParse} disabled={!raw.trim()}
                                className="px-4 py-2 bg-red-500/20 text-red-300 border border-red-500/40 rounded text-sm font-mono hover:bg-red-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                PARSE →
                            </button>
                        </>
                    )}
                    {stage === 'preview' && (
                        <>
                            <button onClick={() => setStage('input')} className="px-4 py-2 text-sm text-white/80 hover:text-white transition-colors">← Back</button>
                            <button onClick={onClose} className="px-4 py-2 text-sm text-white/80 hover:text-white transition-colors">Cancel</button>
                            <button onClick={handleSave} disabled={extracted.length === 0}
                                className="px-4 py-2 bg-red-500/20 text-red-300 border border-red-500/40 rounded text-sm font-mono hover:bg-red-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                AUTO-HARVEST {extracted.length > 0 ? `(${extracted.length})` : ''}
                            </button>
                        </>
                    )}
                    {stage === 'done' && (
                        <button onClick={handleDone}
                            className="px-4 py-2 bg-signal/20 text-signal border border-signal/30 rounded text-sm font-mono hover:bg-signal/30 transition-colors">
                            CLOSE
                        </button>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

// ============================================
// AddTagDialog — popup for "+ ADD TAG"
// ============================================
type Tagtype = { id: number; name: string; color: string; description: string };

const AddTagDialog = ({
    credential, onClose, onAdded, onRequestCreateTagType,
}: {
    credential: Credential;
    onClose: () => void;
    onAdded: () => void;
    onRequestCreateTagType: () => void;
}) => {
    const [tagtypes, setTagtypes] = useState<Tagtype[]>([]);
    const [selected, setSelected] = useState<Tagtype | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const { refetch } = useQuery<any>(GET_TAGTYPES, {
        fetchPolicy: 'network-only',
        onCompleted: (data: any) => setTagtypes(data?.tagtype ?? []),
    });

    // Re-fetch when this dialog regains focus (e.g. after CreateTagTypeDialog closes)
    useEffect(() => {
        const handler = () => refetch();
        window.addEventListener('focus', handler);
        return () => window.removeEventListener('focus', handler);
    }, [refetch]);

    // Auto-select newest type when list grows (so a freshly created tagtype is preselected)
    const prevCountRef = useRef(0);
    useEffect(() => {
        if (tagtypes.length > prevCountRef.current && tagtypes.length > 0) {
            const newest = [...tagtypes].sort((a, b) => b.id - a.id)[0];
            setSelected(newest);
        }
        prevCountRef.current = tagtypes.length;
    }, [tagtypes]);

    const [createTag] = useMutation<any>(CREATE_CREDENTIAL_TAG, {
        onCompleted: (data: any) => {
            setSubmitting(false);
            if (data?.createTag?.status === 'success') {
                snackActions.success('Tag added');
                onAdded();
            } else {
                snackActions.error(data?.createTag?.error || 'Failed to add tag');
            }
        },
        onError: (err) => { setSubmitting(false); snackActions.error('Failed to add tag: ' + err.message); },
    });

    const handleSubmit = () => {
        if (!selected) { snackActions.warning('Pick a tag type first'); return; }
        const alreadyAttached = credential.tags?.some(t => t.tagtype.id === selected.id);
        if (alreadyAttached) { snackActions.warning(`"${selected.name}" is already attached`); return; }
        setSubmitting(true);
        createTag({ variables: {
            credential_id: credential.id,
            tagtype_id:    selected.id,
            source: 'minerva',
            url:    '',
            data:   {},
        }});
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-void border border-yellow-500/40 rounded-lg w-full max-w-md flex flex-col max-h-[80vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-yellow-900/40 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <Tag size={16} className="text-yellow-400" />
                        <h2 className="font-bold text-white tracking-wide">Add New Tag</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
                        <XCircle size={18} className="text-white/80" />
                    </button>
                </div>

                <div className="p-4 space-y-4 overflow-y-auto">
                    <div className="text-[10px] text-white/70 font-mono">
                        Attaching to: <span className="text-white/95">{credential.account}</span>
                        {credential.realm && <span className="text-white/55"> @ {credential.realm}</span>}
                    </div>

                    <div>
                        <label className="text-[10px] text-white/80 font-mono tracking-widest mb-2 block">TAG TYPE</label>
                        {tagtypes.length === 0 ? (
                            <div className="px-3 py-4 bg-black/30 border border-white/10 rounded text-center">
                                <p className="text-xs text-white/70 mb-2">No tag types defined yet</p>
                                <button onClick={onRequestCreateTagType}
                                    className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-mono rounded hover:bg-yellow-500/20 transition-colors">
                                    <Plus size={11} /> CREATE A NEW TAG TYPE
                                </button>
                            </div>
                        ) : (
                            <>
                                <select
                                    value={selected?.id ?? ''}
                                    onChange={(e) => setSelected(tagtypes.find(t => t.id === Number(e.target.value)) || null)}
                                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500/50">
                                    <option value="" disabled>Select tag type…</option>
                                    {tagtypes.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                                {selected && (
                                    <div className="mt-2 px-3 py-2 bg-black/30 border border-white/10 rounded flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded text-[11px] font-mono"
                                            style={{
                                                backgroundColor: `${selected.color}20`,
                                                color: selected.color,
                                                border: `1px solid ${selected.color}40`,
                                            }}>
                                            {selected.name}
                                        </span>
                                        {selected.description && (
                                            <span className="text-[10px] text-white/70 truncate">{selected.description}</span>
                                        )}
                                    </div>
                                )}
                                <button onClick={onRequestCreateTagType}
                                    className="mt-3 w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-mono rounded hover:bg-yellow-500/20 transition-colors">
                                    <Plus size={11} /> CREATE A NEW TAG TYPE
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-white/10 flex justify-end gap-2 shrink-0">
                    <button onClick={onClose}
                        className="px-4 py-2 text-sm text-white/80 hover:text-white transition-colors">Cancel</button>
                    <button onClick={handleSubmit} disabled={!selected || submitting}
                        className="px-4 py-2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded text-sm font-mono hover:bg-yellow-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        {submitting ? 'ADDING…' : 'ADD TAG'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// ============================================
// CreateTagTypeDialog — popup for "+ CREATE NEW TAG TYPE"
// ============================================
const CreateTagTypeDialog = ({
    onClose, onCreated,
}: {
    onClose: () => void;
    onCreated: () => void;
}) => {
    const [name, setName]               = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor]             = useState(TAG_PRESET_COLORS[0]);
    const [submitting, setSubmitting]   = useState(false);

    const [createTagtype] = useMutation<any>(CREATE_TAGTYPE, {
        onCompleted: (data: any) => {
            setSubmitting(false);
            const created = data?.insert_tagtype_one;
            if (created?.id) {
                snackActions.success(`Tag type "${created.name}" created`);
                onCreated();
            } else {
                snackActions.error('Failed to create tag type');
            }
        },
        onError: (err) => { setSubmitting(false); snackActions.error('Failed to create tag type: ' + err.message); },
        refetchQueries: [{ query: GET_TAGTYPES }],
        awaitRefetchQueries: true,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { snackActions.warning('Name is required'); return; }
        setSubmitting(true);
        createTagtype({ variables: { name: name.trim(), description: description.trim(), color } });
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-8"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-void border border-yellow-500/40 rounded-lg w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-yellow-900/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Hash size={16} className="text-yellow-400" />
                        <h2 className="font-bold text-white tracking-wide">Create Tag Type</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
                        <XCircle size={18} className="text-white/80" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="text-[10px] text-white/80 font-mono tracking-widest mb-1 flex items-center gap-2">
                            <Hash size={11} /> NAME
                        </label>
                        <input
                            autoFocus
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. compromised, persistence, lateral"
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-yellow-500/50"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] text-white/80 font-mono tracking-widest mb-1 flex items-center gap-2">
                            <FileText size={11} /> DESCRIPTION
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional"
                            rows={2}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-yellow-500/50 resize-none"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] text-white/80 font-mono tracking-widest mb-2 flex items-center gap-2">
                            <Palette size={11} /> COLOR
                        </label>
                        <div className="flex items-center gap-3 flex-wrap">
                            {TAG_PRESET_COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className={cn(
                                        'w-7 h-7 rounded transition-all relative',
                                        color === c && 'ring-2 ring-white ring-offset-2 ring-offset-void scale-110'
                                    )}
                                    style={{ backgroundColor: c }}>
                                    {color === c && <Check size={12} className="text-white absolute inset-0 m-auto" />}
                                </button>
                            ))}
                            <input
                                type="color"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                className="w-9 h-9 rounded cursor-pointer bg-transparent border border-white/10"
                                title="Custom color"
                            />
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="pt-3 border-t border-white/10">
                        <label className="text-[10px] text-white/70 font-mono tracking-widest mb-2 block">PREVIEW</label>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono"
                            style={{
                                backgroundColor: `${color}20`,
                                color,
                                border: `1px solid ${color}40`,
                            }}>
                            <Tag size={11} />
                            {name || 'tag-name'}
                        </span>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 text-sm text-white/80 hover:text-white transition-colors">Cancel</button>
                        <button type="submit" disabled={!name.trim() || submitting}
                            className="px-4 py-2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded text-sm font-mono hover:bg-yellow-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                            {submitting ? 'CREATING…' : 'CREATE'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
};
