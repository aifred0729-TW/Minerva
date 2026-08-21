// ═══════════════════════════════════════════════
//  User management page types
// ═══════════════════════════════════════════════

import type { Operator } from './operations';

/**
 * What an account IS, as one word.
 *
 * The old page carried `active` and `admin` as two independent badges, which
 * meant a disabled administrator read as "ADMIN" and "INACTIVE" side by side
 * and the operator had to combine them. They are not independent facts to a
 * reader: a disabled account cannot administer anything, so `disabled`
 * outranks `admin` and the three states below are mutually exclusive. That is
 * also what lets them be a ring — three shares of one roster, summing to it.
 */
export type AccountState = 'admin' | 'operator' | 'disabled';

/**
 * An invite link has exactly TWO states, not three.
 *
 * Mythic computes `valid` as `total_used < total_uses` and nothing else
 * (`webserver/controllers/invite_link_utilities.go`) — there is no expiry
 * clock behind it. The previous page rendered VALID / EXHAUSTED / EXPIRED,
 * where EXHAUSTED was `valid && used >= total`: a combination the server can
 * never produce, so a spent link always read as "EXPIRED" — a word implying a
 * deadline that does not exist.
 */
export type InviteState = 'open' | 'spent';

/** One row of `operatoroperation`, as this page selects it. */
export interface OperatorOperationLink {
    id: number;
    view_mode: string;
    /** Null when the caller cannot see that operation (Hasura row filter). */
    operation: { id: number; name: string; deleted: boolean; complete: boolean } | null;
}

/** `operator` plus the memberships this page asks for. */
export interface OperatorRecord extends Operator {
    operatoroperations?: OperatorOperationLink[];
}

/** An operation this account can work in, flattened for display. */
export interface Assignment {
    id: number;
    name: string;
    role: string;
    complete: boolean;
}

/**
 * An account plus everything the page derives from it, computed once per data
 * change rather than inside each row that needs it.
 */
export interface RosterEntry {
    record: OperatorRecord;
    id: number;
    username: string;
    state: AccountState;
    /** The signed-in operator's own account — the one it must not lock out. */
    isSelf: boolean;
    /** Epoch ms, or null when this account has never signed in. */
    lastLoginMs: number | null;
    createdMs: number | null;
    assignments: Assignment[];
}

/** One entry of `getInviteLinks.links` — a JSON scalar, so typed here. */
export interface InviteLinkRecord {
    code: string;
    name: string;
    link: string;
    operator: string;
    created_at: string;
    operation_id: number;
    operation_role: string;
    total: number;
    used: number;
    valid: boolean;
}

/** An invite plus its derived state and remaining seats. */
export interface InviteEntry {
    record: InviteLinkRecord;
    code: string;
    state: InviteState;
    remaining: number;
}
