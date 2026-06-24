import React, { useState, useEffect, useCallback } from 'react';
import { useLazyQuery, useSubscription } from "@apollo/client/react";
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import {
    Search as SearchIcon,
    Terminal, FileText, Key, Keyboard,
    Shield, Database, Activity, Box, Layers,
    Loader2, AlertCircle, ChevronDown, ExternalLink, Wifi, MessageSquare,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { cn } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import type { SearchTab } from '../../types/search';
import {
    SEARCH_TASKS_PARAMS, SEARCH_TASKS_RESPONSE, SEARCH_TASKS_COMMAND, SEARCH_TASKS_COMMENT,
    SEARCH_TASKS_TAG, SEARCH_TASKS_CALLBACK_ID, SEARCH_TASKS_CALLBACK_GROUP,
    SEARCH_TASKS_HOST, SEARCH_TASKS_STATUS, SEARCH_TASKS_OPERATOR,
    SEARCH_CALLBACKS_HOST, SEARCH_CALLBACKS_USER, SEARCH_CALLBACKS_DOMAIN, SEARCH_CALLBACKS_IP,
    SEARCH_CALLBACKS_DESC, SEARCH_CALLBACKS_AGENT, SEARCH_CALLBACKS_OS, SEARCH_CALLBACKS_ARCH,
    SEARCH_CALLBACKS_PID, SEARCH_CALLBACKS_GROUP, SEARCH_CALLBACKS_DISPLAY_ID,
    SEARCH_FILES_DOWNLOADS, SEARCH_FILES_UPLOADS, SEARCH_FILES_SCREENSHOTS,
    SEARCH_FILES_FILENAME, SEARCH_FILES_HASH, SEARCH_FILES_COMMENT, SEARCH_FILES_TAG,
    SEARCH_FILES_UUID, SEARCH_FILES_FILEBROWSER, SEARCH_FILES_EVENTING,
    SEARCH_CREDS_ACCOUNT, SEARCH_CREDS_REALM, SEARCH_CREDS_CREDENTIAL, SEARCH_CREDS_COMMENT, SEARCH_CREDS_TAG,
    SEARCH_ARTIFACTS_ARTIFACT, SEARCH_ARTIFACTS_HOST, SEARCH_ARTIFACTS_TYPE,
    SEARCH_ARTIFACTS_COMMAND, SEARCH_ARTIFACTS_TASK, SEARCH_ARTIFACTS_CALLBACK, SEARCH_ARTIFACTS_OPERATOR,
    SEARCH_KEYLOGS_KEYSTROKE, SEARCH_KEYLOGS_USER, SEARCH_KEYLOGS_PROGRAM, SEARCH_KEYLOGS_HOST,
    SEARCH_KEYLOGS_UNIQUE_USER, SEARCH_KEYLOGS_UNIQUE_PROGRAM,
    SEARCH_PAYLOADS_FILENAME, SEARCH_PAYLOADS_DESC, SEARCH_PAYLOADS_UUID,
    SEARCH_PAYLOADS_C2PARAM, SEARCH_PAYLOADS_BUILDPARAM,
    SEARCH_TOKENS_USER, SEARCH_TOKENS_HOST, SEARCH_TOKENS_SID,
    SEARCH_PROCESSES_NAME, SEARCH_PROCESSES_PID,
    SEARCH_SOCKS_IP, SEARCH_SOCKS_PORT, SUBSCRIBE_SOCKS,
    SEARCH_TAGS_TAG, SEARCH_TAGS_SOURCE,
    SEARCH_BROWSERS_PATH, SEARCH_BROWSERS_HOST, SEARCH_BROWSERS_NAME, SEARCH_BROWSERS_COMMENT,
    SEARCH_INTERACTIVE_PARAMS, SEARCH_INTERACTIVE_COMMAND, SEARCH_INTERACTIVE_HOST,
    SEARCH_INTERACTIVE_OPERATOR, SEARCH_INTERACTIVE_TYPE,
} from '../../lib/api/search';
import {
    TaskResult, CallbackResult, FileResult, CredentialResult, ArtifactResult,
    KeylogResult, PayloadResult, TokenResult, ProcessResult, SocksResult,
    TagResultItem, BrowserResult, InteractiveTaskResult,
} from './SearchResults';

// ── Per-tab field options ─────────────────────────────────────────────────────
const TAB_FIELDS: Record<SearchTab, string[]> = {
    callbacks:   ['Host', 'User', 'Domain', 'IP', 'Description', 'Agent', 'OS', 'Architecture', 'PID', 'Group', 'Display ID'],
    tasks:       ['Parameters', 'Response', 'Command', 'Comment', 'Tag', 'Callback ID', 'Callback Group', 'Host', 'Status', 'Operator'],
    payloads:    ['Filename', 'Description', 'UUID', 'C2 Parameter Value', 'Build Parameter'],
    files:       ['Downloads', 'Uploads', 'Screenshots', 'File Browser', 'Filename', 'Hash', 'Comment', 'Tag', 'UUID', 'Eventing Workflows'],
    credentials: ['Account', 'Realm', 'Credential', 'Comment', 'Tag'],
    keylogs:     ['Keystroke', 'User', 'Program', 'Host'],
    artifacts:   ['Artifact', 'Host', 'Type', 'Command', 'Task', 'Callback', 'Operator'],
    tokens:      ['User/Group', 'Host', 'SID'],
    processes:   ['Name', 'PID'],
    socks:       ['IP', 'Port'],
    tags:        ['Tag', 'Source'],
    browsers:    ['Path', 'Host', 'Name', 'Comment'],
    interactive_tasks: ['Parameters', 'Command', 'Host', 'Operator', 'Type'],
};

const TABS: { id: SearchTab; label: string; icon: React.ReactNode }[] = [
    { id: 'callbacks',   label: 'Callbacks',   icon: <Activity  size={15} /> },
    { id: 'tasks',       label: 'Tasks',        icon: <Terminal  size={15} /> },
    { id: 'payloads',    label: 'Payloads',     icon: <Box       size={15} /> },
    { id: 'files',       label: 'Files',        icon: <FileText  size={15} /> },
    { id: 'credentials', label: 'Credentials',  icon: <Key       size={15} /> },
    { id: 'keylogs',     label: 'Keylogs',      icon: <Keyboard  size={15} /> },
    { id: 'artifacts',   label: 'Artifacts',    icon: <Database  size={15} /> },
    { id: 'tokens',      label: 'Tokens',       icon: <Shield    size={15} /> },
    { id: 'processes',   label: 'Processes',    icon: <Layers    size={15} /> },
    { id: 'socks',       label: 'SOCKS',        icon: <Wifi      size={15} /> },
    { id: 'tags',        label: 'Tags',          icon: <Database  size={15} /> },
    { id: 'browsers',    label: 'Browsers',      icon: <ExternalLink size={15} /> },
    { id: 'interactive_tasks', label: 'Interactive', icon: <MessageSquare size={15} /> },
];

// ── Field Selector ────────────────────────────────────────────────────────────
const FieldSelector = ({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) => {
    const [open, setOpen] = useState(false);
    if (options.length === 0) return null;
    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 h-10 px-3 bg-black/40 border border-ghost/30 hover:border-signal/40 text-signal font-mono text-xs transition-colors min-w-[120px] justify-between"
            >
                <span>{value}</span>
                <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-black border border-signal/30 min-w-full shadow-lg shadow-signal/10">
                    {options.map(opt => (
                        <button
                            key={opt}
                            type="button"
                            onClick={() => { onChange(opt); setOpen(false); }}
                            className={cn(
                                "w-full px-3 py-2 text-xs font-mono text-left transition-colors",
                                opt === value ? "bg-signal/10 text-signal" : "text-gray-300 hover:bg-white/5 hover:text-signal"
                            )}
                        >
                            {opt}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────
const Search = () => {
    const isSidebarCollapsed = useAppStore(s => s.isSidebarCollapsed);
    const [searchParams, setSearchParams] = useSearchParams();

    const tabParam = (searchParams.get('tab') as SearchTab) || 'callbacks';
    const [activeTab, setActiveTab] = useState<SearchTab>(tabParam);
    const [searchField, setSearchField] = useState<string>(
        searchParams.get('field') || TAB_FIELDS[tabParam]?.[0] || ''
    );
    const [inputValue, setInputValue] = useState(searchParams.get('q') || '');
    const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
    const [results, setResults] = useState<any[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const limit = 25;

    // Tasks
    const [searchTasksParams]   = useLazyQuery<any>(SEARCH_TASKS_PARAMS,   { fetchPolicy: 'no-cache' });
    const [searchTasksResponse] = useLazyQuery<any>(SEARCH_TASKS_RESPONSE, { fetchPolicy: 'no-cache' });
    const [searchTasksCommand]  = useLazyQuery<any>(SEARCH_TASKS_COMMAND,  { fetchPolicy: 'no-cache' });
    const [searchTasksComment]  = useLazyQuery<any>(SEARCH_TASKS_COMMENT,  { fetchPolicy: 'no-cache' });
    const [searchTasksTag]      = useLazyQuery<any>(SEARCH_TASKS_TAG,      { fetchPolicy: 'no-cache' });
    const [searchTasksCbId]     = useLazyQuery<any>(SEARCH_TASKS_CALLBACK_ID, { fetchPolicy: 'no-cache' });
    const [searchTasksCbGroup]  = useLazyQuery<any>(SEARCH_TASKS_CALLBACK_GROUP, { fetchPolicy: 'no-cache' });
    // Callbacks
    const [searchCbHost]   = useLazyQuery<any>(SEARCH_CALLBACKS_HOST,   { fetchPolicy: 'no-cache' });
    const [searchCbUser]   = useLazyQuery<any>(SEARCH_CALLBACKS_USER,   { fetchPolicy: 'no-cache' });
    const [searchCbDomain] = useLazyQuery<any>(SEARCH_CALLBACKS_DOMAIN, { fetchPolicy: 'no-cache' });
    const [searchCbIP]     = useLazyQuery<any>(SEARCH_CALLBACKS_IP,     { fetchPolicy: 'no-cache' });
    const [searchCbDesc]   = useLazyQuery<any>(SEARCH_CALLBACKS_DESC,   { fetchPolicy: 'no-cache' });
    const [searchCbAgent]  = useLazyQuery<any>(SEARCH_CALLBACKS_AGENT,  { fetchPolicy: 'no-cache' });
    const [searchCbOS]     = useLazyQuery<any>(SEARCH_CALLBACKS_OS,     { fetchPolicy: 'no-cache' });
    const [searchCbArch]   = useLazyQuery<any>(SEARCH_CALLBACKS_ARCH,   { fetchPolicy: 'no-cache' });
    // Files
    const [searchFilesDownloads]   = useLazyQuery<any>(SEARCH_FILES_DOWNLOADS,   { fetchPolicy: 'no-cache' });
    const [searchFilesUploads]     = useLazyQuery<any>(SEARCH_FILES_UPLOADS,     { fetchPolicy: 'no-cache' });
    const [searchFilesScreenshots] = useLazyQuery<any>(SEARCH_FILES_SCREENSHOTS, { fetchPolicy: 'no-cache' });
    // Credentials
    const [searchCredsAccount]    = useLazyQuery<any>(SEARCH_CREDS_ACCOUNT,    { fetchPolicy: 'no-cache' });
    const [searchCredsRealm]      = useLazyQuery<any>(SEARCH_CREDS_REALM,      { fetchPolicy: 'no-cache' });
    const [searchCredsCredential] = useLazyQuery<any>(SEARCH_CREDS_CREDENTIAL, { fetchPolicy: 'no-cache' });
    const [searchCredsComment]    = useLazyQuery<any>(SEARCH_CREDS_COMMENT,    { fetchPolicy: 'no-cache' });
    // Artifacts
    const [searchArtifactsArtifact] = useLazyQuery<any>(SEARCH_ARTIFACTS_ARTIFACT, { fetchPolicy: 'no-cache' });
    const [searchArtifactsHost]     = useLazyQuery<any>(SEARCH_ARTIFACTS_HOST,     { fetchPolicy: 'no-cache' });
    const [searchArtifactsType]     = useLazyQuery<any>(SEARCH_ARTIFACTS_TYPE,     { fetchPolicy: 'no-cache' });
    // Keylogs
    const [searchKeylogsKeystroke] = useLazyQuery<any>(SEARCH_KEYLOGS_KEYSTROKE, { fetchPolicy: 'no-cache' });
    const [searchKeylogsUser]      = useLazyQuery<any>(SEARCH_KEYLOGS_USER,      { fetchPolicy: 'no-cache' });
    const [searchKeylogsProgram]   = useLazyQuery<any>(SEARCH_KEYLOGS_PROGRAM,   { fetchPolicy: 'no-cache' });
    // Payloads
    const [searchPayloadsFilename] = useLazyQuery<any>(SEARCH_PAYLOADS_FILENAME, { fetchPolicy: 'no-cache' });
    const [searchPayloadsDesc]     = useLazyQuery<any>(SEARCH_PAYLOADS_DESC,     { fetchPolicy: 'no-cache' });
    const [searchPayloadsUUID]     = useLazyQuery<any>(SEARCH_PAYLOADS_UUID,     { fetchPolicy: 'no-cache' });
    const [searchPayloadsC2Param]   = useLazyQuery<any>(SEARCH_PAYLOADS_C2PARAM,  { fetchPolicy: 'no-cache' });
    const [searchPayloadsBuildParam] = useLazyQuery<any>(SEARCH_PAYLOADS_BUILDPARAM, { fetchPolicy: 'no-cache' });
    // Tokens
    const [searchTokensUser] = useLazyQuery<any>(SEARCH_TOKENS_USER, { fetchPolicy: 'no-cache' });
    const [searchTokensHost] = useLazyQuery<any>(SEARCH_TOKENS_HOST, { fetchPolicy: 'no-cache' });
    // Processes
    const [searchProcessesName] = useLazyQuery<any>(SEARCH_PROCESSES_NAME, { fetchPolicy: 'no-cache' });
    const [searchProcessesPID]  = useLazyQuery<any>(SEARCH_PROCESSES_PID,  { fetchPolicy: 'no-cache' });
    // SOCKS
    const [searchSocksIP]   = useLazyQuery<any>(SEARCH_SOCKS_IP,   { fetchPolicy: 'no-cache' });
    const [searchSocksPort] = useLazyQuery<any>(SEARCH_SOCKS_PORT, { fetchPolicy: 'no-cache' });
    // Tags
    const [searchTagsTag]    = useLazyQuery<any>(SEARCH_TAGS_TAG,    { fetchPolicy: 'no-cache' });
    const [searchTagsSource] = useLazyQuery<any>(SEARCH_TAGS_SOURCE, { fetchPolicy: 'no-cache' });
    // Tasks — additional fields
    const [searchTasksHost]     = useLazyQuery<any>(SEARCH_TASKS_HOST,     { fetchPolicy: 'no-cache' });
    const [searchTasksStatus]   = useLazyQuery<any>(SEARCH_TASKS_STATUS,   { fetchPolicy: 'no-cache' });
    const [searchTasksOperator] = useLazyQuery<any>(SEARCH_TASKS_OPERATOR, { fetchPolicy: 'no-cache' });
    // Callbacks — additional fields
    const [searchCbPID]       = useLazyQuery<any>(SEARCH_CALLBACKS_PID,        { fetchPolicy: 'no-cache' });
    const [searchCbGroup]     = useLazyQuery<any>(SEARCH_CALLBACKS_GROUP,      { fetchPolicy: 'no-cache' });
    const [searchCbDisplayId] = useLazyQuery<any>(SEARCH_CALLBACKS_DISPLAY_ID, { fetchPolicy: 'no-cache' });
    // Artifacts — additional fields
    const [searchArtifactsCommand]  = useLazyQuery<any>(SEARCH_ARTIFACTS_COMMAND,  { fetchPolicy: 'no-cache' });
    const [searchArtifactsTask]     = useLazyQuery<any>(SEARCH_ARTIFACTS_TASK,     { fetchPolicy: 'no-cache' });
    const [searchArtifactsCallback] = useLazyQuery<any>(SEARCH_ARTIFACTS_CALLBACK, { fetchPolicy: 'no-cache' });
    const [searchArtifactsOperator] = useLazyQuery<any>(SEARCH_ARTIFACTS_OPERATOR, { fetchPolicy: 'no-cache' });
    // Files — individual fields
    const [searchFilesFilename] = useLazyQuery<any>(SEARCH_FILES_FILENAME, { fetchPolicy: 'no-cache' });
    const [searchFilesHash]     = useLazyQuery<any>(SEARCH_FILES_HASH,     { fetchPolicy: 'no-cache' });
    const [searchFilesComment]  = useLazyQuery<any>(SEARCH_FILES_COMMENT,  { fetchPolicy: 'no-cache' });
    const [searchFilesTag]      = useLazyQuery<any>(SEARCH_FILES_TAG,      { fetchPolicy: 'no-cache' });
    const [searchFilesUUID]     = useLazyQuery<any>(SEARCH_FILES_UUID,     { fetchPolicy: 'no-cache' });
    const [searchFilesEventing] = useLazyQuery<any>(SEARCH_FILES_EVENTING, { fetchPolicy: 'no-cache' });
    const [searchFilesFileBrowser] = useLazyQuery<any>(SEARCH_FILES_FILEBROWSER, { fetchPolicy: 'no-cache' });
    // Credentials — Tag
    const [searchCredsTag] = useLazyQuery<any>(SEARCH_CREDS_TAG, { fetchPolicy: 'no-cache' });
    // Keylogs — Host + unique
    const [searchKeylogsHost] = useLazyQuery<any>(SEARCH_KEYLOGS_HOST, { fetchPolicy: 'no-cache' });
    const [searchKeylogsUniqueUser]    = useLazyQuery<any>(SEARCH_KEYLOGS_UNIQUE_USER,    { fetchPolicy: 'no-cache' });
    const [searchKeylogsUniqueProgram] = useLazyQuery<any>(SEARCH_KEYLOGS_UNIQUE_PROGRAM, { fetchPolicy: 'no-cache' });
    // Tokens — SID
    const [searchTokensSID] = useLazyQuery<any>(SEARCH_TOKENS_SID, { fetchPolicy: 'no-cache' });
    // Browsers
    const [searchBrowsersPath]    = useLazyQuery<any>(SEARCH_BROWSERS_PATH,    { fetchPolicy: 'no-cache' });
    const [searchBrowsersHost]    = useLazyQuery<any>(SEARCH_BROWSERS_HOST,    { fetchPolicy: 'no-cache' });
    const [searchBrowsersName]    = useLazyQuery<any>(SEARCH_BROWSERS_NAME,    { fetchPolicy: 'no-cache' });
    const [searchBrowsersComment] = useLazyQuery<any>(SEARCH_BROWSERS_COMMENT, { fetchPolicy: 'no-cache' });
    // Interactive Tasks
    const [searchInteractiveParams]   = useLazyQuery<any>(SEARCH_INTERACTIVE_PARAMS,   { fetchPolicy: 'no-cache' });
    const [searchInteractiveCommand]  = useLazyQuery<any>(SEARCH_INTERACTIVE_COMMAND,  { fetchPolicy: 'no-cache' });
    const [searchInteractiveHost]     = useLazyQuery<any>(SEARCH_INTERACTIVE_HOST,     { fetchPolicy: 'no-cache' });
    const [searchInteractiveOperator] = useLazyQuery<any>(SEARCH_INTERACTIVE_OPERATOR, { fetchPolicy: 'no-cache' });
    const [searchInteractiveType]     = useLazyQuery<any>(SEARCH_INTERACTIVE_TYPE,     { fetchPolicy: 'no-cache' });

    // SOCKS live subscription mode
    const [socksLive, setSocksLive] = useState(false);
    const { data: socksSubData } = useSubscription<any>(SUBSCRIBE_SOCKS, { skip: !socksLive || activeTab !== 'socks', onError: (err) => { console.error('[SUBSCRIBE_SOCKS] subscription error:', err); } });
    useEffect(() => {
        if (socksLive && activeTab === 'socks' && socksSubData?.callbackport) {
            setResults(socksSubData.callbackport);
            setTotalCount(socksSubData.callbackport.length);
        }
    }, [socksSubData, socksLive, activeTab]);

    // Artifacts needs_cleanup / resolved filter
    const [artifactCleanup, setArtifactCleanup] = useState<'Any' | 'True' | 'False'>('Any');

    const executeSearch = useCallback(async () => {
        const isKeylogUnique = activeTab === 'keylogs' && !searchQuery.trim() && (searchField === 'User' || searchField === 'Program');
        if (!searchQuery.trim() && !isKeylogUnique) { setResults([]); setTotalCount(0); return; }
        setLoading(true);
        const s = `%${searchQuery}%`;
        const vars = { search: s, offset: (page - 1) * limit, limit };
        try {
            let data: any;
            switch (activeTab) {
                case 'tasks':
                    if (searchField === 'Response') data = await searchTasksResponse({ variables: vars });
                    else if (searchField === 'Command') data = await searchTasksCommand({ variables: vars });
                    else if (searchField === 'Comment') data = await searchTasksComment({ variables: vars });
                    else if (searchField === 'Tag') data = await searchTasksTag({ variables: vars });
                    else if (searchField === 'Callback ID') {
                        const cbId = parseInt(searchQuery);
                        if (!isNaN(cbId)) data = await searchTasksCbId({ variables: { search: cbId, offset: (page - 1) * limit, limit } });
                        else { setResults([]); setTotalCount(0); break; }
                    }
                    else if (searchField === 'Callback Group') data = await searchTasksCbGroup({ variables: { search: searchQuery, offset: (page - 1) * limit, limit } });
                    else if (searchField === 'Host') data = await searchTasksHost({ variables: vars });
                    else if (searchField === 'Status') data = await searchTasksStatus({ variables: vars });
                    else if (searchField === 'Operator') data = await searchTasksOperator({ variables: vars });
                    else data = await searchTasksParams({ variables: vars });
                    setResults(data.data?.task || []);
                    setTotalCount(data.data?.task_aggregate?.aggregate?.count || 0);
                    break;
                case 'callbacks':
                    if (searchField === 'User') data = await searchCbUser({ variables: vars });
                    else if (searchField === 'Domain') data = await searchCbDomain({ variables: vars });
                    else if (searchField === 'IP') data = await searchCbIP({ variables: vars });
                    else if (searchField === 'Description') data = await searchCbDesc({ variables: vars });
                    else if (searchField === 'Agent') data = await searchCbAgent({ variables: vars });
                    else if (searchField === 'OS') data = await searchCbOS({ variables: vars });
                    else if (searchField === 'Architecture') data = await searchCbArch({ variables: vars });
                    else if (searchField === 'PID') {
                        const pidNum = parseInt(searchQuery);
                        if (!isNaN(pidNum)) data = await searchCbPID({ variables: { search: pidNum, offset: (page - 1) * limit, limit } });
                        else { setResults([]); setTotalCount(0); break; }
                    }
                    else if (searchField === 'Group') data = await searchCbGroup({ variables: { search: searchQuery, offset: (page - 1) * limit, limit } });
                    else if (searchField === 'Display ID') {
                        const dispId = parseInt(searchQuery);
                        if (!isNaN(dispId)) data = await searchCbDisplayId({ variables: { search: dispId, offset: (page - 1) * limit, limit } });
                        else { setResults([]); setTotalCount(0); break; }
                    }
                    else data = await searchCbHost({ variables: vars });
                    setResults(data.data?.callback || []);
                    setTotalCount(data.data?.callback_aggregate?.aggregate?.count || 0);
                    break;
                case 'files':
                    if (searchField === 'Uploads') data = await searchFilesUploads({ variables: vars });
                    else if (searchField === 'Screenshots') data = await searchFilesScreenshots({ variables: vars });
                    else if (searchField === 'Filename') data = await searchFilesFilename({ variables: vars });
                    else if (searchField === 'Hash') data = await searchFilesHash({ variables: vars });
                    else if (searchField === 'Comment') data = await searchFilesComment({ variables: vars });
                    else if (searchField === 'Tag') data = await searchFilesTag({ variables: vars });
                    else if (searchField === 'UUID') data = await searchFilesUUID({ variables: vars });
                    else if (searchField === 'Eventing Workflows') {
                        data = await searchFilesEventing({ variables: vars });
                        setResults(data.data?.eventstepinstance || []);
                        setTotalCount(data.data?.eventstepinstance_aggregate?.aggregate?.count || 0);
                        break;
                    }
                    else if (searchField === 'File Browser') {
                        data = await searchFilesFileBrowser({ variables: vars });
                        setResults(data.data?.mythictree || []);
                        setTotalCount(data.data?.mythictree_aggregate?.aggregate?.count || 0);
                        break;
                    }
                    else data = await searchFilesDownloads({ variables: vars });
                    setResults(data.data?.filemeta || []);
                    setTotalCount(data.data?.filemeta_aggregate?.aggregate?.count || 0);
                    break;
                case 'credentials':
                    if (searchField === 'Realm') data = await searchCredsRealm({ variables: vars });
                    else if (searchField === 'Credential') data = await searchCredsCredential({ variables: vars });
                    else if (searchField === 'Comment') data = await searchCredsComment({ variables: vars });
                    else if (searchField === 'Tag') data = await searchCredsTag({ variables: vars });
                    else data = await searchCredsAccount({ variables: vars });
                    setResults(data.data?.credential || []);
                    setTotalCount(data.data?.credential_aggregate?.aggregate?.count || 0);
                    break;
                case 'artifacts':
                    if (searchField === 'Host') data = await searchArtifactsHost({ variables: vars });
                    else if (searchField === 'Type') data = await searchArtifactsType({ variables: vars });
                    else if (searchField === 'Command') data = await searchArtifactsCommand({ variables: vars });
                    else if (searchField === 'Task') {
                        const taskId = parseInt(searchQuery);
                        if (!isNaN(taskId)) data = await searchArtifactsTask({ variables: { search: taskId, offset: (page - 1) * limit, limit } });
                        else { setResults([]); setTotalCount(0); break; }
                    }
                    else if (searchField === 'Callback') {
                        const cbId = parseInt(searchQuery);
                        if (!isNaN(cbId)) data = await searchArtifactsCallback({ variables: { search: cbId, offset: (page - 1) * limit, limit } });
                        else { setResults([]); setTotalCount(0); break; }
                    }
                    else if (searchField === 'Operator') data = await searchArtifactsOperator({ variables: vars });
                    else data = await searchArtifactsArtifact({ variables: vars });
                    setResults(data.data?.taskartifact || []);
                    setTotalCount(data.data?.taskartifact_aggregate?.aggregate?.count || 0);
                    break;
                case 'keylogs':
                    if (!searchQuery.trim() && searchField === 'User') {
                        data = await searchKeylogsUniqueUser({ variables: { offset: (page - 1) * limit, limit } });
                    } else if (!searchQuery.trim() && searchField === 'Program') {
                        data = await searchKeylogsUniqueProgram({ variables: { offset: (page - 1) * limit, limit } });
                    } else if (searchField === 'User') data = await searchKeylogsUser({ variables: vars });
                    else if (searchField === 'Program') data = await searchKeylogsProgram({ variables: vars });
                    else if (searchField === 'Host') data = await searchKeylogsHost({ variables: vars });
                    else data = await searchKeylogsKeystroke({ variables: vars });
                    setResults(data.data?.keylog || []);
                    setTotalCount(data.data?.keylog_aggregate?.aggregate?.count || 0);
                    break;
                case 'payloads':
                    if (searchField === 'Description') data = await searchPayloadsDesc({ variables: vars });
                    else if (searchField === 'UUID') data = await searchPayloadsUUID({ variables: vars });
                    else if (searchField === 'C2 Parameter Value') data = await searchPayloadsC2Param({ variables: vars });
                    else if (searchField === 'Build Parameter') data = await searchPayloadsBuildParam({ variables: vars });
                    else data = await searchPayloadsFilename({ variables: vars });
                    setResults(data.data?.payload || []);
                    setTotalCount(data.data?.payload_aggregate?.aggregate?.count || 0);
                    break;
                case 'tokens':
                    if (searchField === 'Host') data = await searchTokensHost({ variables: vars });
                    else if (searchField === 'SID') data = await searchTokensSID({ variables: vars });
                    else data = await searchTokensUser({ variables: vars });
                    setResults(data.data?.token || []);
                    setTotalCount(data.data?.token_aggregate?.aggregate?.count || 0);
                    break;
                case 'processes':
                    if (searchField === 'PID') data = await searchProcessesPID({ variables: vars });
                    else data = await searchProcessesName({ variables: vars });
                    setResults(data.data?.mythictree || []);
                    setTotalCount(data.data?.mythictree_aggregate?.aggregate?.count || 0);
                    break;
                case 'socks':
                    if (searchField === 'Port') {
                        const portNum = parseInt(searchQuery);
                        if (!isNaN(portNum)) data = await searchSocksPort({ variables: { search: portNum, offset: (page - 1) * limit, limit } });
                        else { setResults([]); setTotalCount(0); break; }
                    } else data = await searchSocksIP({ variables: vars });
                    setResults(data?.data?.callbackport || []);
                    setTotalCount(data?.data?.callbackport_aggregate?.aggregate?.count || 0);
                    break;
                case 'tags':
                    if (searchField === 'Source') data = await searchTagsSource({ variables: vars });
                    else data = await searchTagsTag({ variables: vars });
                    setResults(data?.data?.tag || []);
                    setTotalCount(data?.data?.tag_aggregate?.aggregate?.count || 0);
                    break;
                case 'browsers':
                    if (searchField === 'Host') data = await searchBrowsersHost({ variables: vars });
                    else if (searchField === 'Name') data = await searchBrowsersName({ variables: vars });
                    else if (searchField === 'Comment') data = await searchBrowsersComment({ variables: vars });
                    else data = await searchBrowsersPath({ variables: vars });
                    setResults(data?.data?.mythictree || []);
                    setTotalCount(data?.data?.mythictree_aggregate?.aggregate?.count || 0);
                    break;
                case 'interactive_tasks':
                    if (searchField === 'Command') data = await searchInteractiveCommand({ variables: vars });
                    else if (searchField === 'Host') data = await searchInteractiveHost({ variables: vars });
                    else if (searchField === 'Operator') data = await searchInteractiveOperator({ variables: vars });
                    else if (searchField === 'Type') {
                        const typeNum = parseInt(searchQuery);
                        if (!isNaN(typeNum)) data = await searchInteractiveType({ variables: { search: typeNum, offset: (page - 1) * limit, limit } });
                        else { setResults([]); setTotalCount(0); break; }
                    }
                    else data = await searchInteractiveParams({ variables: vars });
                    setResults(data?.data?.task || []);
                    setTotalCount(data?.data?.task_aggregate?.aggregate?.count || 0);
                    break;
                default:
                    setResults([]); setTotalCount(0);
            }
        } catch (error: unknown) {
            console.error('Search error:', error);
            snackActions.error('Search failed: ' + ((error as Error)?.message || 'Unknown error'));
            setResults([]); setTotalCount(0);
        } finally {
            setLoading(false);
        }
    }, [
        searchQuery, activeTab, searchField, page,
        searchTasksParams, searchTasksResponse, searchTasksCommand, searchTasksComment,
        searchTasksTag, searchTasksCbId, searchTasksCbGroup,
        searchTasksHost, searchTasksStatus, searchTasksOperator,
        searchCbHost, searchCbUser, searchCbDomain, searchCbIP, searchCbDesc,
        searchCbAgent, searchCbOS, searchCbArch, searchCbPID, searchCbGroup, searchCbDisplayId,
        searchFilesDownloads, searchFilesUploads, searchFilesScreenshots, searchFilesFileBrowser,
        searchFilesFilename, searchFilesHash, searchFilesComment, searchFilesTag, searchFilesUUID,
        searchCredsAccount, searchCredsRealm, searchCredsCredential, searchCredsComment, searchCredsTag,
        searchArtifactsArtifact, searchArtifactsHost, searchArtifactsType,
        searchArtifactsCommand, searchArtifactsTask, searchArtifactsCallback, searchArtifactsOperator,
        searchKeylogsKeystroke, searchKeylogsUser, searchKeylogsProgram, searchKeylogsHost,
        searchKeylogsUniqueUser, searchKeylogsUniqueProgram,
        searchPayloadsFilename, searchPayloadsDesc, searchPayloadsUUID,
        searchPayloadsC2Param, searchPayloadsBuildParam,
        searchTokensUser, searchTokensHost, searchTokensSID,
        searchProcessesName, searchProcessesPID,
        searchSocksIP, searchSocksPort,
        searchTagsTag, searchTagsSource,
        searchBrowsersPath, searchBrowsersHost, searchBrowsersName, searchBrowsersComment,
        searchFilesEventing,
        searchInteractiveParams, searchInteractiveCommand, searchInteractiveHost,
        searchInteractiveOperator, searchInteractiveType,
    ]);

    useEffect(() => { executeSearch(); }, [executeSearch]);

    const handleTabChange = (tab: SearchTab) => {
        const firstField = TAB_FIELDS[tab]?.[0] || '';
        setActiveTab(tab);
        setSearchField(firstField);
        setPage(1);
        setResults([]);
        setTotalCount(0);
        setSearchParams({ tab, field: firstField, q: searchQuery });
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchQuery(inputValue);
        setPage(1);
        setSearchParams({ tab: activeTab, field: searchField, q: inputValue });
    };

    const handleFieldChange = (field: string) => {
        setSearchField(field);
        setPage(1);
        setSearchParams({ tab: activeTab, field, q: searchQuery });
    };

    const renderResults = () => {
        if (loading) return (
            <div className="flex items-center justify-center h-48">
                <Loader2 size={28} className="text-signal animate-spin" />
            </div>
        );
        if (!searchQuery && !(activeTab === 'keylogs' && (searchField === 'User' || searchField === 'Program'))) return (
            <div className="flex flex-col items-center justify-center h-48 text-gray-600">
                <SearchIcon size={40} className="mb-3 opacity-30" />
                <p className="font-mono text-sm tracking-widest">ENTER_QUERY_TO_SEARCH</p>
                <p className="text-xs mt-1.5 opacity-60">Searching {activeTab} by {searchField}</p>
                {activeTab === 'keylogs' && (searchField === 'User' || searchField === 'Program') && (
                    <p className="text-xs mt-2 opacity-80 text-signal/60">Leave empty to see one entry for each unique {searchField.toLowerCase()}</p>
                )}
            </div>
        );
        if (results.length === 0) return (
            <div className="flex flex-col items-center justify-center h-48 text-gray-600">
                <AlertCircle size={40} className="mb-3 opacity-30" />
                <p className="font-mono text-sm tracking-widest">NO_RESULTS</p>
                <p className="text-xs mt-1.5 opacity-60">Try a different term or field</p>
            </div>
        );
        return (
            <div className="space-y-2">
                {results.map((item, idx) => {
                    switch (activeTab) {
                        case 'tasks':       return <TaskResult       key={item.id ?? idx} task={item} />;
                        case 'callbacks':   return <CallbackResult   key={item.id ?? idx} callback={item} />;
                        case 'files':       return <FileResult       key={item.id ?? idx} file={item} />;
                        case 'credentials': return <CredentialResult key={item.id ?? idx} credential={item} />;
                        case 'artifacts':   return <ArtifactResult   key={item.id ?? idx} artifact={item} />;
                        case 'keylogs':     return <KeylogResult     key={item.id ?? idx} keylog={item} />;
                        case 'payloads':    return <PayloadResult    key={item.id ?? idx} payload={item} />;
                        case 'tokens':      return <TokenResult      key={item.id ?? idx} token={item} />;
                        case 'processes':   return <ProcessResult    key={item.id ?? idx} process={item} />;
                        case 'socks':       return <SocksResult      key={item.id ?? idx} socks={item} />;
                        case 'tags':        return <TagResultItem    key={item.id ?? idx} tag={item} />;
                        case 'browsers':    return <BrowserResult    key={item.id ?? idx} browser={item} />;
                        case 'interactive_tasks': return <InteractiveTaskResult key={item.id ?? idx} task={item} />;
                        default: return null;
                    }
                })}
            </div>
        );
    };

    const totalPages = Math.ceil(totalCount / limit);

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={cn(
                    "transition-all duration-300 p-6 lg:p-12 h-screen flex flex-col overflow-hidden",
                    isSidebarCollapsed ? "ml-16" : "ml-64"
                )}
            >
                {/* Header */}
                <header className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded">
                            <SearchIcon size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">SEARCH</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                GLOBAL SEARCH
                            </p>
                        </div>
                    </div>
                </header>

                {/* Search Controls */}
                <div className="shrink-0 mb-6">
                    <div className="py-3">
                        <form onSubmit={handleSearch} className="flex items-center gap-2">
                            <FieldSelector
                                options={TAB_FIELDS[activeTab] || []}
                                value={searchField}
                                onChange={handleFieldChange}
                            />
                            <div className="flex-1 relative">
                                <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={e => setInputValue(e.target.value)}
                                    placeholder={`Search ${activeTab} by ${searchField}...`}
                                    className="w-full h-10 pl-9 pr-4 bg-black/50 border border-ghost/30 text-white placeholder-gray-600 focus:border-signal/50 focus:outline-none font-mono text-sm"
                                />
                            </div>
                            <button
                                type="submit"
                                className="h-10 px-5 bg-signal hover:bg-signal/80 text-void font-bold font-mono text-xs transition-colors flex items-center gap-2 shrink-0"
                            >
                                <SearchIcon size={14} /> SEARCH
                            </button>
                            {activeTab === 'socks' && (
                                <button type="button" onClick={() => setSocksLive(prev => !prev)}
                                    className={cn("h-10 px-3 font-mono text-[10px] font-bold border transition-colors shrink-0",
                                        socksLive ? "border-green-400/50 bg-green-400/10 text-green-400" : "border-ghost/30 text-gray-500 hover:text-gray-300"
                                    )}>
                                    {socksLive ? '● LIVE' : '○ LIVE'}
                                </button>
                            )}
                            {activeTab === 'artifacts' && (
                                <select value={artifactCleanup} onChange={e => setArtifactCleanup(e.target.value as 'Any' | 'True' | 'False')}
                                    className="h-10 px-2 bg-black/50 border border-ghost/30 text-gray-300 font-mono text-[10px] focus:border-signal/50 focus:outline-none">
                                    <option value="Any">Cleanup: Any</option>
                                    <option value="True">Needs Cleanup</option>
                                    <option value="False">Resolved</option>
                                </select>
                            )}
                        </form>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-0.5 overflow-x-auto pb-0 cyber-scrollbar">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-2.5 text-xs font-mono font-bold whitespace-nowrap transition-colors border-b-2",
                                    activeTab === tab.id
                                        ? "border-signal text-signal"
                                        : "border-transparent text-gray-500 hover:text-gray-200 hover:border-gray-500/40"
                                )}
                            >
                                {tab.icon}
                                {tab.label.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Results */}
                <div className="flex-1 overflow-y-auto cyber-scrollbar">
                    {searchQuery && !loading && (
                        <div className="mb-3 text-xs text-gray-500 font-mono flex items-center gap-2">
                            <span className="text-signal">{totalCount}</span> results for
                            "<span className="text-white">{searchQuery}</span>"
                            <span className="text-gray-600">in</span>
                            <span className="text-signal">{activeTab} / {searchField}</span>
                        </div>
                    )}
                    {renderResults()}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="border-t border-ghost/30 py-3 flex items-center justify-center gap-2 shrink-0">
                        {[
                            { label: '«', action: () => setPage(1),            disabled: page === 1 },
                            { label: '‹', action: () => setPage(p => p - 1),   disabled: page === 1 },
                            { label: '›', action: () => setPage(p => p + 1),   disabled: page === totalPages },
                            { label: '»', action: () => setPage(totalPages),   disabled: page === totalPages },
                        ].map(({ label, action, disabled }) => (
                            <button
                                key={label}
                                onClick={action}
                                disabled={disabled}
                                className="w-8 h-8 flex items-center justify-center border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-sm"
                            >
                                {label}
                            </button>
                        ))}
                        <span className="px-3 text-gray-500 font-mono text-xs">
                            {page} / {totalPages}
                        </span>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default Search;
