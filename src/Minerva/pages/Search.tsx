import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useLazyQuery, gql } from '@apollo/client';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
    Search as SearchIcon, 
    Terminal,
    FileText,
    Key,
    Keyboard,
    Users,
    Shield,
    Database,
    Network,
    Activity,
    Tag,
    Globe,
    Box,
    Layers,
    Filter,
    X,
    ChevronDown,
    ChevronRight,
    MoreVertical,
    Download,
    Copy,
    ExternalLink,
    Clock,
    User,
    Server,
    Hash,
    Loader2,
    AlertCircle
} from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { cn } from '../lib/utils';
import { snackActions } from '../../Archive/components/utilities/Snackbar';
import { toLocalTime } from '../../Archive/components/utilities/Time';

// ============================================
// Types
// ============================================
type SearchTab = 'callbacks' | 'tasks' | 'payloads' | 'files' | 'credentials' | 'keylogs' | 'artifacts' | 'tokens' | 'proxies' | 'processes' | 'tags' | 'browsers';

interface TabConfig {
    id: SearchTab;
    label: string;
    icon: React.ReactNode;
    description: string;
}

// ============================================
// Tab Configuration
// ============================================
const TABS: TabConfig[] = [
    { id: 'callbacks', label: 'Callbacks', icon: <Activity size={16} />, description: 'Search for callback sessions' },
    { id: 'tasks', label: 'Tasks', icon: <Terminal size={16} />, description: 'Search task commands and output' },
    { id: 'payloads', label: 'Payloads', icon: <Box size={16} />, description: 'Search generated payloads' },
    { id: 'files', label: 'Files', icon: <FileText size={16} />, description: 'Search files (uploads/downloads)' },
    { id: 'credentials', label: 'Credentials', icon: <Key size={16} />, description: 'Search captured credentials' },
    { id: 'keylogs', label: 'Keylogs', icon: <Keyboard size={16} />, description: 'Search keylogger captures' },
    { id: 'artifacts', label: 'Artifacts', icon: <Database size={16} />, description: 'Search operation artifacts' },
    { id: 'tokens', label: 'Tokens', icon: <Shield size={16} />, description: 'Search access tokens' },
    { id: 'proxies', label: 'Proxies', icon: <Network size={16} />, description: 'Search SOCKS proxies' },
    { id: 'processes', label: 'Processes', icon: <Layers size={16} />, description: 'Search process listings' },
    { id: 'tags', label: 'Tags', icon: <Tag size={16} />, description: 'Search tagged items' },
    { id: 'browsers', label: 'Browsers', icon: <Globe size={16} />, description: 'Search custom browser data' },
];

// ============================================
// GraphQL Queries
// ============================================

// Tasks Search
const SEARCH_TASKS = gql`
query SearchTasks($search: String!, $offset: Int!, $limit: Int!) {
    task(where: {
        _or: [
            {display_params: {_ilike: $search}},
            {original_params: {_ilike: $search}},
            {command_name: {_ilike: $search}},
            {comment: {_ilike: $search}}
        ]
    }, order_by: {id: desc}, limit: $limit, offset: $offset) {
        id
        display_params
        original_params
        command_name
        comment
        status
        timestamp
        callback {
            id
            display_id
            host
        }
        operator {
            username
        }
    }
    task_aggregate(where: {
        _or: [
            {display_params: {_ilike: $search}},
            {original_params: {_ilike: $search}},
            {command_name: {_ilike: $search}},
            {comment: {_ilike: $search}}
        ]
    }) {
        aggregate { count }
    }
}
`;

// Callbacks Search
const SEARCH_CALLBACKS = gql`
query SearchCallbacks($search: String!, $offset: Int!, $limit: Int!) {
    callback(where: {
        _or: [
            {host: {_ilike: $search}},
            {user: {_ilike: $search}},
            {description: {_ilike: $search}},
            {ip: {_ilike: $search}},
            {process_name: {_ilike: $search}}
        ]
    }, order_by: {id: desc}, limit: $limit, offset: $offset) {
        id
        display_id
        host
        user
        description
        ip
        pid
        process_name
        integrity_level
        active
        last_checkin
        init_callback
        payload {
            payloadtype {
                name
            }
        }
    }
    callback_aggregate(where: {
        _or: [
            {host: {_ilike: $search}},
            {user: {_ilike: $search}},
            {description: {_ilike: $search}},
            {ip: {_ilike: $search}},
            {process_name: {_ilike: $search}}
        ]
    }) {
        aggregate { count }
    }
}
`;

// Files Search
const SEARCH_FILES = gql`
query SearchFiles($search: String!, $offset: Int!, $limit: Int!) {
    filemeta(where: {
        _or: [
            {filename_text: {_ilike: $search}},
            {full_remote_path_text: {_ilike: $search}},
            {comment: {_ilike: $search}}
        ],
        deleted: {_eq: false}
    }, order_by: {id: desc}, limit: $limit, offset: $offset) {
        id
        agent_file_id
        filename_text
        full_remote_path_text
        comment
        is_download_from_agent
        is_screenshot
        complete
        chunks_received
        total_chunks
        timestamp
        host
        task {
            id
            callback {
                display_id
            }
        }
    }
    filemeta_aggregate(where: {
        _or: [
            {filename_text: {_ilike: $search}},
            {full_remote_path_text: {_ilike: $search}},
            {comment: {_ilike: $search}}
        ],
        deleted: {_eq: false}
    }) {
        aggregate { count }
    }
}
`;

// Credentials Search
const SEARCH_CREDENTIALS = gql`
query SearchCredentials($search: String!, $offset: Int!, $limit: Int!) {
    credential(where: {
        _or: [
            {account: {_ilike: $search}},
            {realm: {_ilike: $search}},
            {credential_text: {_ilike: $search}},
            {comment: {_ilike: $search}}
        ],
        deleted: {_eq: false}
    }, order_by: {id: desc}, limit: $limit, offset: $offset) {
        id
        account
        realm
        type
        credential_text
        comment
        timestamp
        task_id
        operator {
            username
        }
    }
    credential_aggregate(where: {
        _or: [
            {account: {_ilike: $search}},
            {realm: {_ilike: $search}},
            {credential_text: {_ilike: $search}},
            {comment: {_ilike: $search}}
        ],
        deleted: {_eq: false}
    }) {
        aggregate { count }
    }
}
`;

// Artifacts Search
const SEARCH_ARTIFACTS = gql`
query SearchArtifacts($search: String!, $offset: Int!, $limit: Int!) {
    taskartifact(where: {
        _or: [
            {artifact_text: {_ilike: $search}},
            {host: {_ilike: $search}}
        ]
    }, order_by: {id: desc}, limit: $limit, offset: $offset) {
        id
        artifact_text
        host
        timestamp
        base_artifact
        task {
            id
            command_name
            callback {
                display_id
            }
        }
    }
    taskartifact_aggregate(where: {
        _or: [
            {artifact_text: {_ilike: $search}},
            {host: {_ilike: $search}}
        ]
    }) {
        aggregate { count }
    }
}
`;

// Keylogs Search  
const SEARCH_KEYLOGS = gql`
query SearchKeylogs($search: String!, $offset: Int!, $limit: Int!) {
    keylog(where: {
        _or: [
            {keystrokes_text: {_ilike: $search}},
            {window: {_ilike: $search}},
            {user: {_ilike: $search}}
        ]
    }, order_by: {id: desc}, limit: $limit, offset: $offset) {
        id
        keystrokes_text
        window
        user
        timestamp
        task {
            callback {
                display_id
                host
            }
        }
    }
    keylog_aggregate(where: {
        _or: [
            {keystrokes_text: {_ilike: $search}},
            {window: {_ilike: $search}},
            {user: {_ilike: $search}}
        ]
    }) {
        aggregate { count }
    }
}
`;

// Payloads Search
const SEARCH_PAYLOADS = gql`
query SearchPayloads($search: String!, $offset: Int!, $limit: Int!) {
    payload(where: {
        _or: [
            {description: {_ilike: $search}},
            {uuid: {_ilike: $search}}
        ],
        deleted: {_eq: false}
    }, order_by: {id: desc}, limit: $limit, offset: $offset) {
        id
        uuid
        description
        build_phase
        timestamp
        payloadtype {
            name
        }
        filemetum {
            filename_text
        }
    }
    payload_aggregate(where: {
        _or: [
            {description: {_ilike: $search}},
            {uuid: {_ilike: $search}}
        ],
        deleted: {_eq: false}
    }) {
        aggregate { count }
    }
}
`;

// Tokens Search
const SEARCH_TOKENS = gql`
query SearchTokens($search: String!, $offset: Int!, $limit: Int!) {
    token(where: {
        _or: [
            {user: {_ilike: $search}},
            {description: {_ilike: $search}}
        ],
        deleted: {_eq: false}
    }, order_by: {id: desc}, limit: $limit, offset: $offset) {
        id
        token_id
        user
        description
        timestamp
        task {
            callback {
                display_id
                host
            }
        }
    }
    token_aggregate(where: {
        _or: [
            {user: {_ilike: $search}},
            {description: {_ilike: $search}}
        ],
        deleted: {_eq: false}
    }) {
        aggregate { count }
    }
}
`;

// Processes Search
const SEARCH_PROCESSES = gql`
query SearchProcesses($search: String!, $offset: Int!, $limit: Int!) {
    mythictree(where: {
        tree_type: {_eq: "process"},
        _or: [
            {name_text: {_ilike: $search}},
            {full_path_text: {_ilike: $search}},
            {host: {_ilike: $search}}
        ]
    }, order_by: {id: desc}, limit: $limit, offset: $offset) {
        id
        name_text
        full_path_text
        host
        metadata
        timestamp
        task {
            callback {
                display_id
            }
        }
    }
    mythictree_aggregate(where: {
        tree_type: {_eq: "process"},
        _or: [
            {name_text: {_ilike: $search}},
            {full_path_text: {_ilike: $search}},
            {host: {_ilike: $search}}
        ]
    }) {
        aggregate { count }
    }
}
`;

// ============================================
// Result Components
// ============================================

const TaskResult = ({ task }: { task: any }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 border border-ghost/20 rounded-lg hover:border-signal/30 transition-colors bg-black/20"
    >
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-signal font-mono text-sm">{task.command_name}</span>
                    <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-mono",
                        task.status === "success" ? "bg-matrix/10 text-matrix" :
                        task.status === "error" ? "bg-red-500/10 text-red-400" :
                        "bg-gray-500/10 text-gray-400"
                    )}>{task.status}</span>
                </div>
                <p className="text-gray-300 font-mono text-sm truncate">{task.display_params || task.original_params || '(no parameters)'}</p>
                {task.comment && (
                    <p className="text-gray-500 text-xs mt-1 italic">"{task.comment}"</p>
                )}
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0">
                <div className="flex items-center gap-1 justify-end">
                    <User size={12} />
                    {task.operator?.username}
                </div>
                <div className="mt-1">Callback #{task.callback?.display_id}</div>
                <div className="mt-1">{toLocalTime(task.timestamp, false)}</div>
            </div>
        </div>
    </motion.div>
);

const CallbackResult = ({ callback }: { callback: any }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 border border-ghost/20 rounded-lg hover:border-signal/30 transition-colors bg-black/20"
    >
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-signal font-bold">#{callback.display_id}</span>
                    <span className={cn(
                        "w-2 h-2 rounded-full",
                        callback.active ? "bg-matrix" : "bg-gray-500"
                    )} />
                    <span className="text-xs text-gray-400">{callback.payload?.payloadtype?.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                        <span className="text-gray-500">Host:</span>
                        <span className="ml-2 text-white font-mono">{callback.host}</span>
                    </div>
                    <div>
                        <span className="text-gray-500">User:</span>
                        <span className="ml-2 text-white font-mono">{callback.user}</span>
                    </div>
                    <div>
                        <span className="text-gray-500">IP:</span>
                        <span className="ml-2 text-white font-mono">{callback.ip}</span>
                    </div>
                    <div>
                        <span className="text-gray-500">Process:</span>
                        <span className="ml-2 text-white font-mono">{callback.process_name} ({callback.pid})</span>
                    </div>
                </div>
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0">
                <div>Last: {toLocalTime(callback.last_checkin, false)}</div>
                <div className="mt-1">Init: {toLocalTime(callback.init_callback, false)}</div>
            </div>
        </div>
    </motion.div>
);

const FileResult = ({ file }: { file: any }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 border border-ghost/20 rounded-lg hover:border-signal/30 transition-colors bg-black/20"
    >
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                    <FileText size={16} className="text-signal" />
                    <span className="text-white font-mono text-sm truncate">{file.filename_text}</span>
                    {file.is_screenshot && <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 text-xs rounded">Screenshot</span>}
                    {file.is_download_from_agent && <span className="px-1.5 py-0.5 bg-signal/10 text-signal text-xs rounded">Download</span>}
                </div>
                {file.full_remote_path_text && (
                    <p className="text-gray-400 font-mono text-xs truncate">{file.full_remote_path_text}</p>
                )}
                {file.comment && (
                    <p className="text-gray-500 text-xs mt-1 italic">"{file.comment}"</p>
                )}
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0">
                <div>Host: {file.host}</div>
                <div className="mt-1">Callback #{file.task?.callback?.display_id}</div>
                <div className="mt-1">{file.complete ? 'Complete' : `${file.chunks_received}/${file.total_chunks} chunks`}</div>
            </div>
        </div>
    </motion.div>
);

const CredentialResult = ({ credential }: { credential: any }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 border border-ghost/20 rounded-lg hover:border-signal/30 transition-colors bg-black/20"
    >
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                    <Key size={16} className="text-yellow-400" />
                    <span className="text-white font-mono">{credential.account}</span>
                    <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 text-xs rounded">{credential.type}</span>
                </div>
                <div className="text-sm">
                    <span className="text-gray-500">Realm:</span>
                    <span className="ml-2 text-white font-mono">{credential.realm || 'N/A'}</span>
                </div>
                <div className="text-sm mt-1">
                    <span className="text-gray-500">Credential:</span>
                    <span className="ml-2 text-matrix font-mono truncate block">{credential.credential_text}</span>
                </div>
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0">
                <div>By: {credential.operator?.username}</div>
                <div className="mt-1">{toLocalTime(credential.timestamp, false)}</div>
            </div>
        </div>
    </motion.div>
);

const ArtifactResult = ({ artifact }: { artifact: any }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 border border-ghost/20 rounded-lg hover:border-signal/30 transition-colors bg-black/20"
    >
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                    <Database size={16} className="text-orange-400" />
                    <span className="px-1.5 py-0.5 bg-orange-500/10 text-orange-400 text-xs rounded">{artifact.base_artifact}</span>
                </div>
                <p className="text-white font-mono text-sm">{artifact.artifact_text}</p>
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0">
                <div>Host: {artifact.host}</div>
                <div className="mt-1">Task: {artifact.task?.command_name}</div>
                <div className="mt-1">Callback #{artifact.task?.callback?.display_id}</div>
            </div>
        </div>
    </motion.div>
);

const KeylogResult = ({ keylog }: { keylog: any }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 border border-ghost/20 rounded-lg hover:border-signal/30 transition-colors bg-black/20"
    >
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                    <Keyboard size={16} className="text-purple-400" />
                    <span className="text-white text-sm">{keylog.window}</span>
                </div>
                <p className="text-matrix font-mono text-sm bg-black/30 p-2 rounded">{keylog.keystrokes_text}</p>
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0">
                <div>User: {keylog.user}</div>
                <div className="mt-1">Host: {keylog.task?.callback?.host}</div>
                <div className="mt-1">{toLocalTime(keylog.timestamp, false)}</div>
            </div>
        </div>
    </motion.div>
);

const PayloadResult = ({ payload }: { payload: any }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 border border-ghost/20 rounded-lg hover:border-signal/30 transition-colors bg-black/20"
    >
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                    <Box size={16} className="text-signal" />
                    <span className="text-signal font-mono">{payload.payloadtype?.name}</span>
                    <span className={cn(
                        "px-1.5 py-0.5 text-xs rounded",
                        payload.build_phase === "success" ? "bg-matrix/10 text-matrix" :
                        payload.build_phase === "error" ? "bg-red-500/10 text-red-400" :
                        "bg-gray-500/10 text-gray-400"
                    )}>{payload.build_phase}</span>
                </div>
                <p className="text-white font-mono text-sm">{payload.filemetum?.filename_text || payload.uuid}</p>
                {payload.description && (
                    <p className="text-gray-500 text-xs mt-1">{payload.description}</p>
                )}
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0">
                <div>{toLocalTime(payload.timestamp, false)}</div>
            </div>
        </div>
    </motion.div>
);

const TokenResult = ({ token }: { token: any }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 border border-ghost/20 rounded-lg hover:border-signal/30 transition-colors bg-black/20"
    >
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                    <Shield size={16} className="text-blue-400" />
                    <span className="text-white font-mono">{token.user}</span>
                    <span className="text-gray-500 text-xs">ID: {token.token_id}</span>
                </div>
                {token.description && (
                    <p className="text-gray-400 text-sm">{token.description}</p>
                )}
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0">
                <div>Host: {token.task?.callback?.host}</div>
                <div className="mt-1">Callback #{token.task?.callback?.display_id}</div>
            </div>
        </div>
    </motion.div>
);

const ProcessResult = ({ process }: { process: any }) => {
    let metadata: any = {};
    try {
        metadata = typeof process.metadata === 'string' ? JSON.parse(process.metadata) : process.metadata || {};
    } catch (e) {}

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 border border-ghost/20 rounded-lg hover:border-signal/30 transition-colors bg-black/20"
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                        <Layers size={16} className="text-cyan-400" />
                        <span className="text-white font-mono">{process.name_text}</span>
                        {metadata.process_id && <span className="text-gray-500 text-xs">PID: {metadata.process_id}</span>}
                    </div>
                    <p className="text-gray-400 font-mono text-xs truncate">{process.full_path_text}</p>
                </div>
                <div className="text-right text-xs text-gray-500 shrink-0">
                    <div>Host: {process.host}</div>
                    <div className="mt-1">Callback #{process.task?.callback?.display_id}</div>
                </div>
            </div>
        </motion.div>
    );
};

const GenericResult = ({ item, tab }: { item: any, tab: SearchTab }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 border border-ghost/20 rounded-lg hover:border-signal/30 transition-colors bg-black/20"
    >
        <pre className="text-xs text-gray-400 overflow-auto">{JSON.stringify(item, null, 2)}</pre>
    </motion.div>
);

// ============================================
// Main Search Page
// ============================================
const Search = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<SearchTab>((searchParams.get('tab') as SearchTab) || 'callbacks');
    const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
    const [inputValue, setInputValue] = useState(searchParams.get('q') || '');
    const [results, setResults] = useState<any[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const limit = 25;

    // Search Queries
    const [searchTasks] = useLazyQuery(SEARCH_TASKS, { fetchPolicy: "no-cache" });
    const [searchCallbacks] = useLazyQuery(SEARCH_CALLBACKS, { fetchPolicy: "no-cache" });
    const [searchFiles] = useLazyQuery(SEARCH_FILES, { fetchPolicy: "no-cache" });
    const [searchCredentials] = useLazyQuery(SEARCH_CREDENTIALS, { fetchPolicy: "no-cache" });
    const [searchArtifacts] = useLazyQuery(SEARCH_ARTIFACTS, { fetchPolicy: "no-cache" });
    const [searchKeylogs] = useLazyQuery(SEARCH_KEYLOGS, { fetchPolicy: "no-cache" });
    const [searchPayloads] = useLazyQuery(SEARCH_PAYLOADS, { fetchPolicy: "no-cache" });
    const [searchTokens] = useLazyQuery(SEARCH_TOKENS, { fetchPolicy: "no-cache" });
    const [searchProcesses] = useLazyQuery(SEARCH_PROCESSES, { fetchPolicy: "no-cache" });

    const executeSearch = useCallback(async () => {
        if (!searchQuery) {
            setResults([]);
            setTotalCount(0);
            return;
        }

        setLoading(true);
        const searchTerm = `%${searchQuery}%`;
        const offset = (page - 1) * limit;

        try {
            let data;
            switch (activeTab) {
                case 'tasks':
                    data = await searchTasks({ variables: { search: searchTerm, offset, limit } });
                    setResults(data.data?.task || []);
                    setTotalCount(data.data?.task_aggregate?.aggregate?.count || 0);
                    break;
                case 'callbacks':
                    data = await searchCallbacks({ variables: { search: searchTerm, offset, limit } });
                    setResults(data.data?.callback || []);
                    setTotalCount(data.data?.callback_aggregate?.aggregate?.count || 0);
                    break;
                case 'files':
                    data = await searchFiles({ variables: { search: searchTerm, offset, limit } });
                    setResults(data.data?.filemeta || []);
                    setTotalCount(data.data?.filemeta_aggregate?.aggregate?.count || 0);
                    break;
                case 'credentials':
                    data = await searchCredentials({ variables: { search: searchTerm, offset, limit } });
                    setResults(data.data?.credential || []);
                    setTotalCount(data.data?.credential_aggregate?.aggregate?.count || 0);
                    break;
                case 'artifacts':
                    data = await searchArtifacts({ variables: { search: searchTerm, offset, limit } });
                    setResults(data.data?.taskartifact || []);
                    setTotalCount(data.data?.taskartifact_aggregate?.aggregate?.count || 0);
                    break;
                case 'keylogs':
                    data = await searchKeylogs({ variables: { search: searchTerm, offset, limit } });
                    setResults(data.data?.keylog || []);
                    setTotalCount(data.data?.keylog_aggregate?.aggregate?.count || 0);
                    break;
                case 'payloads':
                    data = await searchPayloads({ variables: { search: searchTerm, offset, limit } });
                    setResults(data.data?.payload || []);
                    setTotalCount(data.data?.payload_aggregate?.aggregate?.count || 0);
                    break;
                case 'tokens':
                    data = await searchTokens({ variables: { search: searchTerm, offset, limit } });
                    setResults(data.data?.token || []);
                    setTotalCount(data.data?.token_aggregate?.aggregate?.count || 0);
                    break;
                case 'processes':
                    data = await searchProcesses({ variables: { search: searchTerm, offset, limit } });
                    setResults(data.data?.mythictree || []);
                    setTotalCount(data.data?.mythictree_aggregate?.aggregate?.count || 0);
                    break;
                default:
                    setResults([]);
                    setTotalCount(0);
            }
        } catch (error) {
            console.error('Search error:', error);
            snackActions.error('Search failed');
            setResults([]);
            setTotalCount(0);
        } finally {
            setLoading(false);
        }
    }, [searchQuery, activeTab, page, searchTasks, searchCallbacks, searchFiles, searchCredentials, searchArtifacts, searchKeylogs, searchPayloads, searchTokens, searchProcesses]);

    useEffect(() => {
        executeSearch();
    }, [executeSearch]);

    const handleTabChange = (tab: SearchTab) => {
        setActiveTab(tab);
        setPage(1);
        setSearchParams({ tab, q: searchQuery });
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchQuery(inputValue);
        setPage(1);
        setSearchParams({ tab: activeTab, q: inputValue });
    };

    const renderResults = () => {
        if (loading) {
            return (
                <div className="flex items-center justify-center h-64">
                    <Loader2 size={32} className="text-signal animate-spin" />
                </div>
            );
        }

        if (!searchQuery) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                    <SearchIcon size={48} className="mb-4" />
                    <p className="text-lg">Enter a search query to begin</p>
                    <p className="text-sm mt-2">Search across {TABS.find(t => t.id === activeTab)?.label.toLowerCase()}</p>
                </div>
            );
        }

        if (results.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                    <AlertCircle size={48} className="mb-4" />
                    <p className="text-lg">No results found</p>
                    <p className="text-sm mt-2">Try a different search term or tab</p>
                </div>
            );
        }

        return (
            <div className="space-y-3">
                {results.map((item, idx) => {
                    switch (activeTab) {
                        case 'tasks': return <TaskResult key={item.id || idx} task={item} />;
                        case 'callbacks': return <CallbackResult key={item.id || idx} callback={item} />;
                        case 'files': return <FileResult key={item.id || idx} file={item} />;
                        case 'credentials': return <CredentialResult key={item.id || idx} credential={item} />;
                        case 'artifacts': return <ArtifactResult key={item.id || idx} artifact={item} />;
                        case 'keylogs': return <KeylogResult key={item.id || idx} keylog={item} />;
                        case 'payloads': return <PayloadResult key={item.id || idx} payload={item} />;
                        case 'tokens': return <TokenResult key={item.id || idx} token={item} />;
                        case 'processes': return <ProcessResult key={item.id || idx} process={item} />;
                        default: return <GenericResult key={item.id || idx} item={item} tab={activeTab} />;
                    }
                })}
            </div>
        );
    };

    const totalPages = Math.ceil(totalCount / limit);

    return (
        <div className="flex h-screen bg-void">
            <Sidebar />
            
            <div className="flex-1 flex flex-col min-w-0 ml-16">
                {/* Header with Search Bar */}
                <div className="border-b border-ghost/30 bg-void/90 backdrop-blur-sm">
                    <div className="px-6 py-4">
                        <form onSubmit={handleSearch} className="flex items-center gap-4">
                            <div className="flex-1 relative">
                                <SearchIcon size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    placeholder={`Search ${TABS.find(t => t.id === activeTab)?.label.toLowerCase()}...`}
                                    className="w-full h-12 pl-12 pr-4 bg-black/50 border border-ghost/30 rounded-lg text-white placeholder-gray-500 focus:border-signal/50 focus:outline-none focus:ring-1 focus:ring-signal/30 font-mono"
                                />
                            </div>
                            <button
                                type="submit"
                                className="h-12 px-6 bg-signal hover:bg-signal/80 text-void font-medium rounded-lg transition-colors flex items-center gap-2"
                            >
                                <SearchIcon size={18} />
                                Search
                            </button>
                        </form>
                    </div>

                    {/* Tabs */}
                    <div className="px-6 flex gap-1 overflow-x-auto pb-2 custom-scrollbar">
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                                    activeTab === tab.id
                                        ? "bg-signal/10 text-signal border border-signal/30"
                                        : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                                )}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Results Area */}
                <div className="flex-1 overflow-auto p-6">
                    {/* Results Count */}
                    {searchQuery && !loading && (
                        <div className="mb-4 text-sm text-gray-500">
                            Found <span className="text-signal font-mono">{totalCount}</span> results for "<span className="text-white">{searchQuery}</span>"
                        </div>
                    )}

                    {renderResults()}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="border-t border-ghost/30 p-4 flex items-center justify-center gap-2">
                        <button
                            onClick={() => setPage(1)}
                            disabled={page === 1}
                            className="px-3 py-1.5 rounded border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            First
                        </button>
                        <button
                            onClick={() => setPage(p => p - 1)}
                            disabled={page === 1}
                            className="px-3 py-1.5 rounded border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Prev
                        </button>
                        
                        <span className="px-4 text-gray-400 font-mono text-sm">
                            Page {page} of {totalPages}
                        </span>
                        
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={page === totalPages}
                            className="px-3 py-1.5 rounded border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Next
                        </button>
                        <button
                            onClick={() => setPage(totalPages)}
                            disabled={page === totalPages}
                            className="px-3 py-1.5 rounded border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Last
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Search;
