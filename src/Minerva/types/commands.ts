// ═══════════════════════════════════════════════
//  Command domain types
// ═══════════════════════════════════════════════

/** A loaded command attached to a callback */
export interface LoadedCommand {
    id: number;
    command: CommandDefinition;
}

/** Full command definition (from payload type) */
export interface CommandDefinition {
    id: number;
    cmd: string;
    description: string;
    help_cmd: string;
    version: number;
    needs_admin: boolean;
    attributes: Record<string, unknown>;
    supported_ui_features: string[];
    payloadtype: {
        name: string;
    };
}

/** Command parameter definition */
export interface CommandParameter {
    id: number;
    name: string;
    type: string;
    /** GraphQL field name (aliased as `type` in some queries) */
    parameter_type: string;
    description: string;
    required: boolean;
    ui_position: number;
    default_value: string;
    choices: string[];
    cli_name: string;
    display_name: string;
    group_name: string;
    parameter_group_name: string;
    dynamic_query_function: string | null;
    choice_filter_by_command_attributes: Record<string, unknown>;
    choices_are_all_commands: boolean;
    choices_are_loaded_commands: boolean;
}

/** Command parameter group */
export interface CommandParameterGroup {
    name: string;
    parameters: CommandParameter[];
}
