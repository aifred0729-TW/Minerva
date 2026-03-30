// ═══════════════════════════════════════════════
//  Payload domain types
// ═══════════════════════════════════════════════

export interface PayloadTag {
    id: number;
    tagtype: {
        name: string;
        color: string;
        id: number;
    };
}

export interface PayloadBuildStep {
    id: number;
    step_name: string;
    step_number: number;
    step_success: boolean | null;
    step_skip: boolean;
    start_time: string | null;
    end_time: string | null;
    step_stdout: string;
    step_stderr: string;
    step_description?: string;
}

export interface Payload {
    id: number;
    uuid: string;
    description: string;
    deleted: boolean;
    auto_generated: boolean;
    timestamp: string;
    creation_time?: string;
    os: string;
    build_message: string;
    build_phase: string;
    build_stderr: string;
    build_stdout: string;
    callback_alert: boolean;
    callback_allowed: boolean;
    payload_type_semver: string;
    payloadtype: {
        id: number;
        name: string;
        semver: string;
    };
    payload_build_steps: PayloadBuildStep[];
    tags: PayloadTag[];
    filemetum: {
        agent_file_id: string;
        filename_text: string;
        id: number;
        md5: string;
        sha1: string;
        size: number;
        tags: PayloadTag[];
    } | null;
    payloadc2profiles: {
        c2profile: {
            running: boolean;
            name: string;
            is_p2p: boolean;
            container_running: boolean;
        };
    }[];
    operator?: {
        id: number;
        username: string;
    };
    task?: {
        display_id: number;
    };
    buildparameterinstances?: Array<{
        id: number;
        value: string;
        enc_key_base64?: string;
        dec_key_base64?: string;
        buildparameter: {
            id: number;
            name: string;
            description: string;
            parameter_type: string;
        };
    }>;
    payloadcommands?: Array<{
        id: number;
        version: number;
        command: { id: number; cmd: string; version: number };
    }>;
    c2profileparametersinstances?: Array<{
        value: string;
        enc_key_base64?: string;
        dec_key_base64?: string;
        c2profile: { name: string };
        c2profileparameter: { name: string; parameter_type: string };
    }>;
    wrapped_payload_id?: number | null;
    payload?: {
        payloadtype: { name: string };
        payloadc2profiles?: Payload['payloadc2profiles'];
        c2profileparametersinstances?: Payload['c2profileparametersinstances'];
    } | null;
    eventstepinstance?: {
        eventgroupinstance: {
            id: number;
            eventgroup: { id: number; name: string };
        };
        eventstep: { name: string };
    } | null;
}

export type TabType = 'list' | 'create' | 'wrapper';

export interface C2ProfileParameter {
    id: number;
    name: string;
    description: string;
    parameter_type: string;
    default_value: string | number | boolean | string[];
    required: boolean;
    choices: string[];
    format_string?: string;
    randomize?: boolean;
}

export interface C2Profile {
    name: string;
    id: number;
    description: string;
    running: boolean;
    container_running: boolean;
    is_p2p: boolean;
    c2profileparameters: C2ProfileParameter[];
}

export interface C2ProfileInstance {
    profile: C2Profile;
    instance_id: number;
    parameters: Record<string, string | number | boolean | string[]>;
}

export interface PayloadTypeData {
    id: number;
    name: string;
    note: string;
    semver: string;
    author?: string;
    supported_os: string[];
    container_running: boolean;
    buildparameters: Array<{
        id: number;
        name: string;
        description: string;
        parameter_type: string;
        default_value: string | number | boolean | string[];
        required: boolean;
        choices: string[];
        group_name?: string;
        verifier_regex?: string;
    }>;
    payloadtypec2profiles: Array<{
        c2profile: C2Profile;
    }>;
    commands: Array<{
        id: number;
        cmd: string;
        description: string;
        help_cmd: string;
        needs_admin: boolean;
        attributes?: Record<string, unknown>;
    }>;
}
