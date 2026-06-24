// ═══════════════════════════════════════════════
//  Credential domain types
// ═══════════════════════════════════════════════

export interface Credential {
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
        };
    };
    tags?: Array<{
        id: number;
        tagtype: { name: string; color: string; id: number };
    }>;
}
