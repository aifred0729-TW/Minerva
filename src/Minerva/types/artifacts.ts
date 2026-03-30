// ═══════════════════════════════════════════════
//  Artifact domain types
// ═══════════════════════════════════════════════

export interface Artifact {
    id: number;
    artifact_text: string;
    host: string;
    timestamp: string;
    base_artifact: string;
    task: {
        id: number;
        command_name: string;
        display_params: string;
        callback: {
            display_id: number;
            host: string;
            user: string;
            payload: {
                payloadtype: {
                    name: string;
                };
            };
        };
        operator: {
            username: string;
        };
    } | null;
}
