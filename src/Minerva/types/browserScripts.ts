// ═══════════════════════════════════════════════
//  Browser Script domain types
// ═══════════════════════════════════════════════

export interface BrowserScript {
    id: number;
    active: boolean;
    author: string;
    user_modified: boolean;
    script: string;
    payloadtype: {
        name: string;
        id: number;
    };
    command: {
        cmd: string;
        id: number;
    };
    container_version: string;
    container_version_author: string;
    creation_time: string;
}

export interface BrowserScriptPayloadType {
    id: number;
    name: string;
    commands: { id: number; cmd: string }[];
}
