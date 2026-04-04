// ═══════════════════════════════════════════════
//  Console domain types
// ═══════════════════════════════════════════════

export interface FilterOptions {
    operatorsList: string[];
    commentsFlag: boolean;
    commandsList: string[];
    everythingButList: string[];
    parameterString: string;
    hideErrors: boolean;
    hideBrowserScripts: boolean;
}

export interface CallbackToken {
    token_id: number;
    id: number;
    user: string;
    description: string;
}

export interface ContextMenuState {
    x: number;
    y: number;
    isDir: boolean;
    path: string;
    name: string;
    items?: Array<{ label: string; action: () => void; icon?: React.ReactNode }>;
}

export interface MzExtractedCred {
    account: string;
    realm: string;
    credential: string;
    credType: 'hash' | 'plaintext';
    source: string;
}

/** Console file browser node (lighter than FileBrowser's FileNode) */
export interface ConsoleFileNode {
    id: string;
    name_text: string;
    full_path_text: string;
    parent_path_text: string;
    can_have_children: boolean;
    tree_type: string;
    deleted: boolean;
    metadata: string;
    host: string;
    has_children?: boolean;
    success?: boolean | null;
    filemeta?: { id: number; agent_file_id: string; filename_text: string } | null;
}

/** Raw process record from the GraphQL query */
export interface ProcessRecord {
    id: number;
    process_id: number;
    name: string;
    parent_process_id: number;
    architecture: string;
    bin_path: string;
    user: string;
    command_line: string;
    integrity_level: number;
    start_time: string;
    description: string;
    signer: string;
    host: string;
    timestamp: string;
    /** Parsed metadata fields */
    [key: string]: unknown;
}

/** Parsed process detail block */
export interface ProcessDetails {
    pid?: number;
    path: string;
    user: string;
    ppid: number;
    arch: string;
    cmdLine: string;
    signer: string;
    startTime: string;
    integrityLevel?: number;
    binPath?: string;
    sessionId?: number;
    description?: string;
    companyName?: string;
    windowTitle?: string;
    [key: string]: unknown;
}

/** Process tree node for process list viewer */
export interface ProcessNode {
    proc: ProcessRecord;
    details: ProcessDetails;
    children: ProcessNode[];
    depth: number;
}
