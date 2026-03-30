// ═══════════════════════════════════════════════
//  Operations & Users domain types
// ═══════════════════════════════════════════════

/** Full operator record (Users page) */
export interface Operator {
    id: number;
    username: string;
    active: boolean;
    admin: boolean;
    last_login: string;
    creation_time: string;
    email: string;
    deleted: boolean;
}

/** Minimal operator ref (used in Operations page) */
export interface OperatorRef {
    id: number;
    username: string;
}

export interface OperatorOperation {
    id: number;
    view_mode: string;
    operator: OperatorRef;
}

export interface Operation {
    id: number;
    name: string;
    complete: boolean;
    deleted: boolean;
    webhook: string;
    channel: string;
    banner_text: string;
    banner_color: string;
    admin: OperatorRef;
    operatoroperations: OperatorOperation[];
}

export interface MemberEntry {
    id: number;
    username: string;
    checked: boolean;
    view_mode: 'operator' | 'spectator' | 'lead';
}
