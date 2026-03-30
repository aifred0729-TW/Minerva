// ═══════════════════════════════════════════════
//  Callback domain types
// ═══════════════════════════════════════════════

/** Operator reference (minimal) */
export interface OperatorUsername {
    username: string;
}

/** Tag attached to a callback */
export interface CallbackTag {
    id: number;
    tagtype: { name: string; color: string };
}

/** Callback port forward / socks entry */
export interface CallbackPortEntry {
    id: number;
    local_port: number;
    remote_port: number;
    remote_ip: string;
    port_type: 'socks' | 'rpfwd' | 'interactive';
}

/** C2 profile reference nested in a callback */
export interface CallbackC2Profile {
    c2profile: {
        name: string;
        is_p2p: boolean;
    };
}

/** Payload info nested inside a callback row */
export interface CallbackPayloadInfo {
    payloadtype: {
        name: string;
        agent_type?: string;
    };
}

/** Token associated with a callback */
export interface TokenEntry {
    id: number;
    token_id: number;
    user: string;
    description: string;
    groups: string;
    default_dacl: string;
    privileges: string;
    handle: number;
    thread_id: number;
    session_id: number;
    logon_sid: string;
    app_container_sid: string;
    app_container_number: number;
    deleted: boolean;
    timestamp: string;
}

/**
 * Core Callback entity — matches the shape returned by GET_CALLBACKS
 * and SUBSCRIPTION_CALLBACKS queries.
 */
export interface Callback {
    id: number;
    display_id: number;
    user: string;
    host: string;
    pid: number;
    ip: string;
    external_ip: string;
    domain: string;
    os: string;
    architecture: string;
    integrity_level: number;
    last_checkin: string;
    init_callback: string;
    description: string;
    sleep_info: string;
    locked: boolean;
    locked_operator: OperatorUsername | null;
    active: boolean;
    dead: boolean;
    color: string;
    mythictree_groups: string[];
    process_name: string;
    process_short_name: string;
    agent_callback_id: string;
    extra_info: string;
    trigger_on_checkin_after_time: string | null;
    cwd: string;
    impersonation_context: string;
    callbackports: CallbackPortEntry[];
    payload: CallbackPayloadInfo;
    callbackc2profiles: CallbackC2Profile[];
    tags: CallbackTag[];
}

/**
 * Extended callback with additional detail fields
 * (returned by GET_CALLBACK_FULL_DETAILS)
 */
export interface CallbackFullDetails extends Callback {
    enc_key_base64: string | null;
    dec_key_base64: string | null;
    crypto_type: string;
    operation_id: number;
    registered_payload_id: number;
    payload: CallbackPayloadInfo & {
        uuid: string;
        description: string;
        os: string;
        payloadc2profiles: Array<{
            c2profile: { name: string; is_p2p: boolean };
        }>;
        c2profileparametersinstances: Array<{
            value: string;
            c2profile: { name: string };
            c2profileparameter: { name: string; parameter_type: string };
        }>;
        buildparameterinstances: Array<{
            value: string;
            buildparameter: { name: string; description: string };
        }>;
    };
    loadedcommands: Array<{
        id: number;
        command: {
            id: number;
            cmd: string;
            version: number;
            needs_admin: boolean;
            help_cmd: string;
            description: string;
        };
    }>;
    tokens: TokenEntry[];
}

/** Callback graph edge (GET_CALLBACK_GRAPH_EDGES) */
export interface CallbackGraphEdge {
    id: number;
    source: {
        id: number;
        display_id: number;
        host: string;
        user: string;
        active: boolean;
        dead: boolean;
        integrity_level: number;
        ip: string;
        os: string;
        domain: string;
        description: string;
        payload: CallbackPayloadInfo;
    };
    destination: {
        id: number;
        display_id: number;
        host: string;
        user: string;
        active: boolean;
        dead: boolean;
        integrity_level: number;
        ip: string;
        os: string;
        domain: string;
        description: string;
        payload: CallbackPayloadInfo;
    };
    c2profile: { name: string; is_p2p: boolean };
    end_timestamp: string | null;
}
