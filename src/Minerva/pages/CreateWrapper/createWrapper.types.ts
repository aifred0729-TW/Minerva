// ============================================================
// hide_conditions operand constants (mirrors OldReactUI)
// ============================================================
export const HC_EQ  = 'eq';
export const HC_NEQ = 'neq';
export const HC_IN  = 'in';
export const HC_NIN = 'nin';
export const HC_LT  = 'lt';
export const HC_GT  = 'gt';
export const HC_LTE = 'lte';
export const HC_GTE = 'gte';
export const HC_SW  = 'sw';
export const HC_EW  = 'ew';
export const HC_CO  = 'co';
export const HC_NCO = 'nco';

// ============================================================
// Interfaces
// ============================================================
export interface HideCondition {
    name: string;
    operand: string;
    value?: string;
    choices?: string[];
}

export interface BuildParam {
    id: number;
    name: string;
    description: string;
    parameter_type: string;
    default_value: any;
    required: boolean;
    choices: string[];
    group_name?: string;
    verifier_regex?: string;
    randomize?: boolean;
    format_string?: string;
    supported_os?: string[] | null;
    ui_position?: number;
    hide_conditions?: HideCondition[] | null;
}

export interface PayloadType {
    id: number;
    name: string;
    supported_os: string[];
    note: string;
    author: string;
    semver: string;
    container_running: boolean;
    file_extension: string;
    buildparameters: BuildParam[];
    wrap_these_payload_types: Array<{ wrapped: { id: number; name: string } }>;
}

export interface MiniStep {
    step_number: number;
    step_name: string;
    step_success: boolean | null;
    step_skip: boolean;
}

export interface Payload {
    id: number;
    uuid: string;
    description: string;
    build_phase: string;
    creation_time: string;
    payloadtype: { id: number; name: string; supported_os: string[] };
    filemetum: { filename_text: string; agent_file_id: string };
    c2profileparametersinstances: Array<{ c2profile: { name: string } }>;
    buildparameterinstances: Array<{ build_parameter_id: number; value: string }>;
    payload_build_steps?: MiniStep[];
}

export interface BuildStepFull extends MiniStep {
    step_stdout: string;
    step_stderr: string;
}

export interface ExistingWrapper {
    id: number;
    uuid: string;
    description: string;
    payloadtype: { id: number; name: string };
    filemetum?: { filename_text: string };
    buildparameterinstances: Array<{ build_parameter_id: number; value: string }>;
}
