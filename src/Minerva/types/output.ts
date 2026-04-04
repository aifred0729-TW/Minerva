// ═══════════════════════════════════════════════
//  Output Renderer / Browser Script data types
// ═══════════════════════════════════════════════

export interface MythicCell {
    plaintext?: string;
    button?: { name?: string; type?: string; ui_feature?: string; [k: string]: unknown };
    [k: string]: unknown;
}

export interface MythicTableRow {
    [header: string]: MythicCell | string | number | boolean | null | undefined;
}

export interface MythicTableDef {
    title?: string;
    headers: (string | { plaintext: string; width?: number; type?: string; disableSort?: boolean; [k: string]: unknown })[];
    rows: MythicTableRow[];
}

export interface MythicScreenshot {
    agent_file_id: string;
    plaintext?: string;
}

export interface MythicDownload {
    agent_file_id: string;
    name?: string;
    plaintext?: string;
}

/** Process entry from browser script output */
export interface BrowserScriptProcess {
    process_id: number;
    name: string;
    parent_process_id: number;
    architecture: string;
    bin_path: string;
    user: string;
    command_line: string;
    integrity_level: number;
    [key: string]: unknown;
}

/** File entry from browser script output */
export interface BrowserScriptFile {
    full_name: string;
    name: string;
    is_file: boolean;
    size: number;
    permissions: Record<string, unknown>;
    access_time: string;
    modify_time: string;
    [key: string]: unknown;
}

export interface MythicBrowserScriptData {
    plaintext?: string;
    table?: MythicTableDef[];
    screenshot?: MythicScreenshot[];
    download?: MythicDownload[];
    process_list?: BrowserScriptProcess[];
    files?: BrowserScriptFile[];
    file_browser?: { files?: BrowserScriptFile[] };
    [k: string]: unknown;
}

export interface DecodedResponse {
    id: number;
    text: string;
    is_error?: boolean;
    timestamp?: string;
}

export interface ParsedOutputProps {
    text?: string;
    data?: unknown;
    isError?: boolean;
}
