import { gql } from "@apollo/client";

export const GET_WRAPPER_PAYLOAD_TYPES = gql`
query GetWrapperPayloadTypes {
    payloadtype(where: {deleted: {_eq: false}, wrapper: {_eq: true}}) {
        id name supported_os note author semver file_extension container_running
        buildparameters(where: {deleted: {_eq: false}}, order_by: {ui_position: asc}) {
            id name description parameter_type default_value required choices
            group_name verifier_regex randomize format_string supported_os ui_position
            hide_conditions
        }
        wrap_these_payload_types { wrapped { id name } }
        c2_parameter_deviations
        agent_type
    }
}
`;

export const GET_WRAPPABLE_BY_TYPE = gql`
query GetWrappableByType($payloadTypeId: Int!) {
    payloadtype_by_pk(id: $payloadTypeId) {
        wrap_these_payload_types {
            wrapped {
                name
                payloads(where: {_and: [{_or: [{auto_generated: {_eq: false}}, {auto_generated: {_is_null: true}}]}, {build_phase: {_eq: "success"}}, {deleted: {_eq: false}}]}, order_by: {id: desc}) {
                    id uuid description build_phase creation_time
                    payloadtype { id name supported_os }
                    filemetum { filename_text agent_file_id }
                    c2profileparametersinstances { c2profile { name } }
                    buildparameterinstances { build_parameter_id value }
                    payload_build_steps(order_by: {step_number: asc}) {
                        step_number step_name step_success step_skip
                    }
                }
            }
        }
    }
}
`;

export const GET_EXISTING_WRAPPERS = gql`
query GetExistingWrapperPayloads {
    payload(
        where: {deleted: {_eq: false}, _or: [{auto_generated: {_eq: false}}, {auto_generated: {_is_null: true}}], payloadtype: {wrapper: {_eq: true}}}
        order_by: {id: desc}
        limit: 30
    ) {
        id uuid description
        payloadtype { id name }
        filemetum { filename_text }
        buildparameterinstances { build_parameter_id value }
    }
}
`;

export const CREATE_WRAPPER = gql`
mutation createPayload($payload: String!) {
    createPayload(payloadDefinition: $payload) {
        error status uuid
    }
}
`;

export const EXPORT_PAYLOAD_CONFIG = gql`
query ExportPayloadConfig($uuid: String!) {
    exportPayloadConfig(uuid: $uuid) {
        status error config
    }
}
`;

export const SUBSCRIBE_PAYLOAD_BUILD = gql`
subscription SubscribePayloadBuild($uuid: String!, $fromNow: timestamp!) {
    payload_stream(
        batch_size: 1
        cursor: { initial_value: { timestamp: $fromNow }, ordering: ASC }
        where: { uuid: { _eq: $uuid }, deleted: { _eq: false } }
    ) {
        uuid build_phase build_message build_stderr build_stdout
        filemetum { agent_file_id }
        payload_build_steps(order_by: { step_number: asc }) {
            step_number step_name step_success step_skip
            start_time end_time step_stdout step_stderr
        }
    }
}
`;
