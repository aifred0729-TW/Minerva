// ═══════════════════════════════════════════════
//  GraphQL operation result & variable types
//
//  These map the shape of data returned by our
//  Apollo queries, mutations, and subscriptions.
// ═══════════════════════════════════════════════

import type { Callback, CallbackFullDetails, CallbackGraphEdge } from './callbacks';
import type { Task, TaskResponse } from './tasks';
import type { Payload } from './payloads';
import type { OperationEventLog } from './events';
import type { FileMeta, MythicTreeNode } from './files';
import type { Credential } from './credentials';
import type { CallbackPort } from './tunnels';

// ───────── Callback Queries ─────────

export interface GetCallbacksData {
    callback: Callback[];
}

export interface GetCallbacksVars {
    limit?: number;
    offset?: number;
}

export interface SubscriptionCallbacksData {
    callback_stream: Callback[];
}

export interface GetCallbackFullDetailsData {
    callback_by_pk: CallbackFullDetails | null;
}

export interface GetCallbackFullDetailsVars {
    callback_id: number;
}

export interface GetCallbackGraphEdgesData {
    callbackgraphedge: CallbackGraphEdge[];
}

// ───────── Task Queries ─────────

export interface StreamCallbackTasksData {
    task_stream: Task[];
}

export interface StreamCallbackTasksVars {
    callback_id: number;
}

export interface GetAllTaskResponsesData {
    response: TaskResponse[];
}

export interface GetAllTaskResponsesVars {
    task_id: number;
}

export interface CreateTaskData {
    createTask: {
        id: number;
        status: string;
        error: string;
        display_id: number;
    };
}

export interface CreateTaskVars {
    callback_id: number;
    command: string;
    params: string;
    token_id?: number;
    tasking_location?: string;
    parameter_group_name?: string;
    original_params?: string;
}

// ───────── Payload Queries ─────────

export interface GetPayloadsListData {
    payload: Payload[];
}

export interface CreatePayloadData {
    createPayload: {
        status: string;
        error: string;
        id: number;
        uuid: string;
    };
}

// ───────── Event Queries ─────────

export interface GetEventsData {
    operationeventlog: OperationEventLog[];
    operationeventlog_aggregate: {
        aggregate: { count: number };
    };
}

export interface GetEventsVars {
    search?: string;
    level?: string;
    limit?: number;
    offset?: number;
}

export interface SubscribeEventsData {
    operationeventlog_stream: OperationEventLog[];
}

// ───────── File Queries ─────────

export interface GetMythicFilesData {
    filemeta: FileMeta[];
}

export interface GetFileTreeRootData {
    mythictree: MythicTreeNode[];
}

// ───────── Credential Queries ─────────

export interface GetCredentialsData {
    credential: Credential[];
}

// ───────── Tunnel/Port Queries ─────────

export interface GetCallbackPortsData {
    callbackport: CallbackPort[];
}

// ───────── Generic Mutation Responses ─────────

export interface MythicMutationResponse {
    status: string;
    error: string;
}

export interface HideCallbackData {
    updateCallback: MythicMutationResponse;
}

export interface LockCallbackData {
    updateCallback: MythicMutationResponse;
}

export interface UpdateDescriptionData {
    update_callback_by_pk: {
        id: number;
        description: string;
    } | null;
}
