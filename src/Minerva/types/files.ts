// ═══════════════════════════════════════════════
//  File / File Browser domain types
// ═══════════════════════════════════════════════
import type React from 'react';
import type { Callback } from './callbacks';

export interface TagType {
    name: string;
    color: string;
}

export interface FileTag {
    id: number;
    tagtype: TagType;
    data: Record<string, unknown>;
}

/** File tree node used in the Files page */
export interface MythicTreeNode {
    id: number;
    full_path_text: string;
    host: string;
    comment: string;
    deleted: boolean;
    metadata?: string;
    can_have_children: boolean;
    filemeta?: Array<{
        id: number;
        agent_file_id: string;
        complete: boolean;
        size: number;
        total_chunks: number;
        chunks_received: number;
        timestamp: string;
        task?: { comment?: string };
    }>;
    task?: { display_id: number; id: number; comment?: string };
    callback?: { id: number; display_id: number; mythictree_groups?: string[] };
    tags?: FileTag[];
}

/** Full file metadata (Downloads/Uploads) */
export interface FileMeta {
    id: number;
    agent_file_id: string;
    filename_text: string;
    full_remote_path_text: string;
    host: string;
    size: number;
    chunk_size?: number;
    complete: boolean;
    deleted: boolean;
    is_download_from_agent: boolean;
    is_screenshot: boolean;
    is_payload: boolean;
    md5: string;
    sha1: string;
    timestamp: string;
    comment: string;
    chunks_received: number;
    total_chunks: number;
    operator?: { username: string };
    task?: {
        display_id: number;
        comment?: string;
        command?: { cmd: string; id: number };
        callback?: { display_id: number; mythictree_groups?: string[] };
    };
    eventgroup?: { name: string; id: number } | null;
    copy_of_file?: FileMeta | null;
    tags?: FileTag[];
}

/** Callback summary for the Files page machine list */
export interface MachineCallback {
    id: number;
    display_id: number;
    host: string;
    user: string;
    ip: string;
    domain: string;
    os: string;
    active: boolean;
    dead: boolean;
    last_checkin: string;
    payload: { payloadtype: { name: string } };
}

/** Machine summary used in the Files page machine list */
export interface MachineInfo {
    host: string;
    domain: string;
    ip: string;
    callbacks: MachineCallback[];
    activeCount: number;
    lastCheckin: string;
    users: string[];
    primaryCallback: MachineCallback | null;
}

/** File browser tree node (used in FileBrowser component) */
export interface FileNodeFilemeta {
    id: number;
    agent_file_id: string;
    filename_text: string;
}

export interface FileNodeTag {
    id: number;
    tagtype: {
        id: number;
        name: string;
        color: string;
    };
}

export interface FileNode {
    id: number;
    name_text: string;
    full_path_text: string;
    parent_path_text: string;
    can_have_children: boolean;
    tree_type: string;
    deleted: boolean;
    metadata: Record<string, unknown> | string;
    host: string;
    has_children?: boolean;
    success?: boolean | null;
    comment?: string;
    task_id?: number;
    tags?: FileNodeTag[];
    filemeta?: FileNodeFilemeta[];
    callback?: { id: number; display_id: number };
}

/** Context menu item (supports nested submenus) */
export interface ContextMenuItemDef {
    action: string;
    label: string;
    icon?: React.ReactNode;
    disabled?: boolean;
    danger?: boolean;
    divider?: boolean;
    children?: ContextMenuItemDef[];
}
