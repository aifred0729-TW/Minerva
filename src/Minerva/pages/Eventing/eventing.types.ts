export interface EventGroup {
    id: number;
    name: string;
    description: string;
    trigger: string;
    trigger_data: any;
    keywords: string[];
    environment: any;
    active: boolean;
    deleted: boolean;
    created_at: string;
    run_as: string;
    approved_to_run: boolean;
    next_scheduled_run: string | null;
    operator: {
        username: string;
    };
    eventgroupapprovals: Array<{
        id: number;
        operator: { id: number; username: string };
        approved: boolean;
        created_at: string;
        updated_at: string;
    }>;
    eventgroupconsumingcontainers: Array<{
        id: number;
        consuming_container_name: string;
        all_functions_available: boolean;
        function_names: string[];
        consuming_container: {
            container_running: boolean;
            subscriptions: string[];
        };
    }>;
    filemetum?: {
        agent_file_id: string;
        id: number;
        filename_text: string;
    };
}

export const initialWorkflow = `name: "New Eventing Workflow"
description: "automatically do something based on a new callback"
trigger: callback_new
trigger_data:
  payload_types:
    - apollo
keywords:
  - apollo_callback
environment:
steps:
  - name: "run command 1"
    inputs:
      CALLBACK_ID: env.display_id
    action: task_create
    action_data:
      callback_display_id: CALLBACK_ID
      params: string params here
      command_name: shell
  - name: "run command 2"
    description: "do something specific for the second command"
    inputs:
      CALLBACK_ID: env.display_id
    action: task_create
    action_data:
      callback_display_id: CALLBACK_ID
      params_dictionary:
        filename: a named parameter here
        code: another named parameter 
      command_name: command_with_named_params
    depends_on:
      - run command 1
    outputs:
      SCRIPT_TASK_ID: id
`;

export const getTriggerColor = (trigger: string) => {
    switch (trigger) {
        case 'callback_new': return 'text-matrix bg-matrix/20';
        case 'task_new': return 'text-signal bg-signal/20';
        case 'scheduled': return 'text-amber-400 bg-amber-400/20';
        case 'manual': return 'text-purple-400 bg-purple-400/20';
        case 'file_new': return 'text-cyan-400 bg-cyan-400/20';
        case 'response_new': return 'text-pink-400 bg-pink-400/20';
        default: return 'text-ghost bg-ghost/20';
    }
};
