/**
 * Adapter: MsfTaskRecord → Mythic Task shape.
 *
 * Lets us render Metasploit-session tasks through the existing Mythic
 * ConsoleTerminal + TaskBlock. The synthetic Task carries an
 * `is_msf_task` flag (and `msf_origin`) so TaskBlock can skip its
 * Mythic-only subscriptions / mutations.
 *
 * Why we b64-encode the full response text into a single response row:
 * TaskBlock's `liveResponses` state expects items shaped like
 * `{ id, response: <b64>, timestamp, is_error }`. By producing a one-row
 * synthetic response we reuse all of TaskBlock's rendering, search, and
 * pagination machinery without any extra branching.
 */
import type { Task, TaskResponse, TaskStatus } from '../../types/tasks';
import type { MsfTaskRecord } from './msfTaskStore';
import { tryMsfStructuredResponse, structuredToJsonPayload } from './msfOutputParser';

/** Browser-safe UTF-8 → base64 (matches b64DecodeUnicode's inverse). */
function b64EncodeUnicode(str: string): string {
    try {
        // encodeURIComponent → %XX bytes → raw bytes → btoa
        const utf8 = unescape(encodeURIComponent(str));
        return btoa(utf8);
    } catch {
        try { return btoa(str); } catch { return ''; }
    }
}

function statusToMythic(s: MsfTaskRecord['status']): TaskStatus {
    switch (s) {
        case 'submitted':  return 'submitted'   as TaskStatus;
        case 'running':    return 'processing'  as TaskStatus;
        case 'completed':  return 'success'     as TaskStatus;
        case 'error':      return 'error'       as TaskStatus;
        default:           return 'submitted'   as TaskStatus;
    }
}

/**
 * Mythic Task uses numeric `id` keys. MSF task ids are UUID strings, so we
 * derive a stable numeric handle from the display_id (1-based per session)
 * — sufficient since we render a single session per ConsoleTerminal mount.
 */
function numericIdFor(record: MsfTaskRecord, fallback: number): number {
    return record.display_id || fallback;
}

export interface SyntheticMsfTask extends Task {
    /** Marker — gates TaskBlock's Mythic-only paths. */
    is_msf_task: true;
    /** Surface origin (console / file-browser / process-list / sidekick). */
    msf_origin: string;
    /** Original UUID so callers can still index back to msfTaskStore. */
    msf_task_uuid: string;
    /** Backing MSF session id. */
    msf_session_id: string;
}

export function msfRecordToTask(record: MsfTaskRecord, idx: number): SyntheticMsfTask {
    const [commandName, ...rest] = (record.command || '').split(' ');
    const params = rest.join(' ');

    // Convert meterpreter's plain text into one of Mythic's structured JSON
    // shapes (ps → process[], ls → files, ifconfig → adapters, netstat →
    // connections). TaskBlock JSON-parses the response and dispatches by
    // shape — emitting the Mythic-shaped payload lights up its existing
    // rich renderers automatically.
    //
    // We try on every snapshot, not only on completion: the parsers tolerate
    // partial output (they hunt for the dashed header row, then read rows
    // until EOF). The moment that header appears the structured panel
    // replaces the raw text, eliminating the 1.2s "raw → parsed" flicker
    // that operators were seeing while the task waited for the quiet-period
    // completion timer.
    let payloadText = record.response_text || '';
    if (payloadText) {
        const structured = tryMsfStructuredResponse(record.command || '', payloadText);
        if (structured) payloadText = structuredToJsonPayload(structured);
    }

    const response: TaskResponse = {
        id: 1,
        response: b64EncodeUnicode(payloadText),
        timestamp: record.completed_at || record.started_at,
        is_error: record.status === 'error',
        sequence_number: 0,
    };
    return {
        // Mythic-shaped scalars
        id: numericIdFor(record, idx + 1),
        display_id: record.display_id,
        agent_task_id: record.id,
        command_name: commandName || '',
        display_params: params,
        original_params: params,
        tasking_location: record.origin === 'console' ? 'command_line' : record.origin,
        status: statusToMythic(record.status),
        timestamp: record.started_at,
        status_timestamp_processing: record.status === 'running' ? record.started_at : null,
        status_timestamp_submitted: record.started_at,
        status_timestamp_preprocessing: null,
        completed: record.status === 'completed' || record.status === 'error',
        comment: record.note || '',
        has_intercepted_response: false,
        opsec_pre_blocked: null,
        opsec_pre_bypassed: null,
        opsec_post_blocked: null,
        opsec_post_bypassed: null,
        token: null,
        operator: { username: record.operator_username },
        commentOperator: null,
        opsec_pre_bypass_user: null,
        opsec_post_bypass_user: null,
        response_count: response.response ? 1 : 0,
        is_interactive_task: false,
        interactive_task_type: null,
        command: null,
        eventstepinstance: null,
        tags: [],
        responses: response.response ? [response] : [],
        // MSF markers
        is_msf_task: true,
        msf_origin: record.origin,
        msf_task_uuid: record.id,
        msf_session_id: record.session_id,
    } as SyntheticMsfTask;
}

export function msfRecordsToTasks(records: MsfTaskRecord[]): SyntheticMsfTask[] {
    return records.map(msfRecordToTask);
}
