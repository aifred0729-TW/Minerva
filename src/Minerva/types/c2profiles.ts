// ═══════════════════════════════════════════════
//  C2 Profile page types
// ═══════════════════════════════════════════════

/**
 * A channel's state, derived from the two subsystems Mythic reports
 * (`container_running` and `running`) plus the archive flag.
 *
 * The old three-lane model ('active' | 'degraded' | 'offline') folded deleted
 * profiles into "offline", which made a shelved channel look like a broken one.
 * They are different facts and now read differently.
 */
export type ChannelState = 'online' | 'degraded' | 'stopped' | 'archived';

/**
 * The workbench's sections. Shared rather than declared twice so the page
 * cannot deep-link to a tab the modal does not have.
 */
export type WorkbenchTab = 'overview' | 'config' | 'console';

export interface C2AgentLink {
    payloadtype: { id: number; name: string; deleted: boolean };
}

export interface C2CallbackLink {
    callback: {
        id: number;
        active: boolean;
        last_checkin?: string;
        sleep_info?: string;
    } | null;
}

export interface C2PayloadLink {
    payload: { id: number; deleted: boolean } | null;
}

/** One row of `c2profile`, as this page subscribes to it. */
export interface C2ProfileRecord {
    id: number;
    name: string;
    running: boolean;
    container_running: boolean;
    is_p2p: boolean;
    is_server_routed: boolean;
    description: string;
    author: string;
    semver: string;
    deleted: boolean;
    creation_time?: string;
    payloadtypec2profiles?: C2AgentLink[];
    /** Scoped to the current operation by Hasura permissions. */
    callbackc2profiles?: C2CallbackLink[];
    /** Scoped to the current operation by Hasura permissions. */
    payloadc2profiles?: C2PayloadLink[];
}

/**
 * A profile plus everything the page derives from it, computed once per data
 * change instead of inside every row that needs a count.
 */
export interface C2Channel {
    profile: C2ProfileRecord;
    id: number;
    name: string;
    state: ChannelState;
    /** Callbacks in this operation whose last check-in is inside their own
     *  sleep-derived threshold — never Mythic's lagging `dead` column. */
    liveCallbacks: number;
    totalCallbacks: number;
    payloads: number;
    agents: string[];
}
