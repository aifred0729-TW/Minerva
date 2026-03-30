// ═══════════════════════════════════════════════
//  Tag domain types
// ═══════════════════════════════════════════════

export interface Tagtype {
    id: number;
    name: string;
    description: string;
    color: string;
    tags_aggregate: {
        aggregate: {
            count: number;
        };
    };
}
