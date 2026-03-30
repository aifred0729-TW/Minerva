// ═══════════════════════════════════════════════
//  Event Feed / Operation Log domain types
// ═══════════════════════════════════════════════

/** Event log level values */
export type EventLevel = 'info' | 'warning' | 'error' | 'debug';

/**
 * Operation event log entry — returned by event feed queries
 * and subscriptions.
 */
export interface OperationEventLog {
    id: number;
    level: EventLevel;
    message: string;
    resolved: boolean;
    timestamp: string;
    count: number;
    source: string;
    warning: boolean;
    operator: {
        username: string;
    } | null;
    /** Present on some queries */
    deleted?: boolean;
}

/** Eventing step instance (referenced by tasks and payloads) */
export interface EventStepInstance {
    eventgroupinstance: {
        id: number;
        eventgroup: { id: number; name: string };
    };
    eventstep: { name: string };
}

/** Event group (workflow definition) */
export interface EventGroup {
    id: number;
    name: string;
    description: string;
    trigger: string;
    keywords: string;
    deleted: boolean;
    active: boolean;
    operator: { username: string };
    filemetum: { agent_file_id: string; filename_text: string } | null;
    eventsteps: EventStep[];
}

/** Event step within an event group */
export interface EventStep {
    id: number;
    name: string;
    order: number;
    action: string;
    action_data: Record<string, unknown>;
    depends_on: number[];
    environment: Record<string, unknown>;
}
