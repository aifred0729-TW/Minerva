// ═══════════════════════════════════════════════
//  Task domain types
// ═══════════════════════════════════════════════

import type { OperatorUsername } from './callbacks';

/** Callback row used in SingleTaskView */
export interface CbRow {
    id: number;
    display_id: number;
    host: string;
    user: string;
    ip: string;
    domain: string;
    active: boolean;
    payload: { payloadtype: { name: string } };
}

export type StatusTier = 'ok' | 'error' | 'running' | 'pending' | 'idle';

/** Task status values */
export type TaskStatus =
    | 'preprocessing'
    | 'submitted'
    | 'processing'
    | 'processed'
    | 'completed'
    | 'error'
    | 'cleared';

/** Command reference nested in a task */
export interface TaskCommand {
    id: number;
    cmd: string;
    supported_ui_features: string[];
    payloadtype: {
        name: string;
    };
}

/** Opsec bypass user reference */
export interface OpsecBypassUser {
    id: number;
    username: string;
}

/**
 * Core Task entity — matches the TASK_FRAGMENT shape from
 * task queries/subscriptions.
 */
export interface Task {
    id: number;
    display_id: number;
    agent_task_id: string;
    command_name: string;
    display_params: string;
    original_params: string;
    tasking_location: string;
    status: TaskStatus;
    timestamp: string;
    status_timestamp_processing: string | null;
    status_timestamp_submitted: string | null;
    status_timestamp_preprocessing: string | null;
    completed: boolean;
    comment: string;
    has_intercepted_response: boolean;
    opsec_pre_blocked: boolean | null;
    opsec_pre_bypassed: boolean | null;
    opsec_post_blocked: boolean | null;
    opsec_post_bypassed: boolean | null;
    token: { id: number } | null;
    operator: OperatorUsername;
    commentOperator: OperatorUsername | null;
    opsec_pre_bypass_user: OpsecBypassUser | null;
    opsec_post_bypass_user: OpsecBypassUser | null;
    response_count: number;
    is_interactive_task: boolean;
    interactive_task_type: number | null;
    command: TaskCommand | null;
    eventstepinstance: {
        eventgroupinstance: {
            eventgroup: { id: number };
            id: number;
        };
        eventstep: { name: string };
    } | null;
    tags: Array<{
        tagtype: { name: string; color: string; id: number };
    }>;
    /** Only present on streamed subtask queries */
    parent_task_id?: number | null;
    /** response rows, may be populated by some queries */
    responses?: TaskResponse[];
    /** Callback info, present in some expanded queries */
    callback?: {
        id: number;
        display_id: number;
        host: string;
        mythictree_groups: string[];
    };
}

/** A single response row for a task */
export interface TaskResponse {
    id: number;
    response: string;        // base64-encoded
    timestamp: string;
    is_error: boolean;
    sequence_number?: number;
}

/** Interactive task input message */
export interface InteractiveTaskInput {
    task_id: string;
    data: string;            // base64-encoded
    message_type: number;
}
