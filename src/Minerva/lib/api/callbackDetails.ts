import { gql } from '@apollo/client';

export const UPDATE_CALLBACK_COLOR_MUTATION = gql`
  mutation UpdateCallbackColor($callback_display_id: Int!, $color: String!) {
    updateCallback(input: {callback_display_id: $callback_display_id, color: $color}) {
      status
      error
    }
  }
`;

// ─── Exit callback command lookup ────────────────────────

export const GET_EXIT_CALLBACK_COMMAND = gql`
  query GetExitCallbackCommand($callback_id: Int!) {
    callback_by_pk(id: $callback_id) {
      id
      loadedcommands(where: {command: {supported_ui_features: {_contains: "callback_table:exit"}}}) {
        command { cmd }
      }
    }
  }
`;

// ─── Event group instances ────────────────────────────────

export const GET_CALLBACK_FULL_DETAILS = gql`
  query GetCallbackFullDetails($callback_id: Int!) {
    callback_by_pk(id: $callback_id) {
      tags {
        tagtype { name color id }
        id
      }
      payload {
        uuid
        id
        creation_time
        callback_allowed
        payloadtype { name agent_type id }
        filemetum { filename_text agent_file_id id md5 sha1 }
        operator { username }
        payload_build_steps(order_by: {step_number: asc}) {
          step_name step_number step_success step_stdout step_stderr
          step_skip step_description start_time end_time id
        }
        buildparameterinstances {
          value id enc_key_base64 dec_key_base64
          buildparameter { description parameter_type id }
        }
        os
      }
      c2profileparametersinstances(order_by: {c2profile: {name: asc}}) {
        value
        c2profileparameter { description parameter_type }
        c2profile { name }
        enc_key_base64
        dec_key_base64
      }
      loadedcommands {
        id
        version
        command { cmd id version payloadtype { name } }
      }
      architecture enc_key_base64 dec_key_base64 crypto_type
      description domain external_ip host id display_id
      integrity_level last_checkin current_time ip
      locked
      extra_info sleep_info pid os user agent_callback_id
      operation_id process_name init_callback mythictree_groups
      cwd impersonation_context
      callbackports { id local_port remote_port remote_ip port_type }
      callbackc2profiles { c2profile { name is_p2p } }
    }
  }
`;

export const ADD_LOADED_COMMAND = gql`
  mutation AddLoadedCommand($command_id: Int!, $callback_id: Int!) {
    insert_loadedcommands_one(object: {callback_id: $callback_id, command_id: $command_id}) {
      id
      command { cmd }
    }
  }
`;

export const REMOVE_LOADED_COMMAND = gql`
  mutation RemoveLoadedCommand($id: Int!) {
    delete_loadedcommands_by_pk(id: $id) {
      id
      command { cmd }
    }
  }
`;

export const GET_CALLBACK_COMMANDS_FOR_TRANSFER = gql`
  query GetCallbackCommandsForTransfer($callback_id: Int!) {
    callback_by_pk(id: $callback_id) {
      loadedcommands {
        command { cmd id payloadtype { name } }
        id
      }
      payload {
        payloadtype {
          name
          commands(where: {deleted: {_eq: false}}) {
            cmd
            id
          }
        }
      }
    }
    command(where: {deleted: {_eq: false}, payloadtype: {agent_type: {_eq: "command_augment"}}}) {
      cmd
      id
      payloadtype { name }
    }
  }
`;

export const EXPORT_CALLBACK_CONFIG = gql`
  query ExportCallbackConfig($agent_callback_id: String!) {
    exportCallbackConfig(agent_callback_id: $agent_callback_id) {
      status
      error
      config
    }
  }
`;

export const IMPORT_CALLBACK_CONFIG = gql`
  mutation importCallbackConfig($config: jsonb!) {
    importCallbackConfig(config: $config) {
      error
      status
    }
  }
`;

// ─── Bulk Callback Mutations ─────────────────────────────

export const HIDE_CALLBACKS_BULK = gql`
  mutation HideCallbacksBulk($callback_display_ids: [Int]!) {
    updateCallback(input: {callback_display_ids: $callback_display_ids, active: false}) {
      status
      error
    }
  }
`;

export const GET_CALLBACKS_FOR_BULK_TASK = gql`
  query GetCallbacksForBulkTask($payloadtype_id: Int!) {
    callback(where: {active: {_eq: true}, payload: {payloadtype: {id: {_eq: $payloadtype_id}}}}, order_by: {id: asc}) {
      id
      host
      user
      process_name
      description
      integrity_level
      pid
      display_id
      last_checkin
      ip
      payload { payloadtype { agent_type } }
    }
  }
`;

export const CALLBACK_CONTEXT_SUBSCRIPTION = gql`
  subscription CallbackMetadataForTasking($callback_id: Int!){
    callback_stream(batch_size: 1, cursor: {initial_value: {timestamp: "1970-01-01"}}, where: {id: {_eq: $callback_id} }){
      cwd
      impersonation_context
      extra_info
      host
      pid
      process_short_name
      user
      ip
      color
      integrity_level
      architecture
    }
  }
`;

// ─── Update Callback Sleep Info ────────────────

export const UPDATE_SLEEP_INFO_MUTATION = gql`
  mutation updateSleepInfo($callback_display_id: Int!, $sleep_info: String!){
    updateCallback(input: {callback_display_id: $callback_display_id, sleep_info: $sleep_info}) {
      status
      error
    }
  }
`;

// ─── Update Callback Trigger on Checkin ────────────────

export const UPDATE_CALLBACK_TRIGGER_MUTATION = gql`
  mutation updateCallbackTrigger($callback_display_id: Int!, $trigger_on_checkin_after_time: Int!){
    updateCallback(input: {callback_display_id: $callback_display_id, trigger_on_checkin_after_time: $trigger_on_checkin_after_time}) {
      status
      error
    }
  }
`;

// ─── Update Callback IPs (reorder) ────────────────

export const UPDATE_IPS_MUTATION = gql`
  mutation updateCallbackIPs($callback_display_id: Int!, $ip: [String]!){
    updateCallback(input: {callback_display_id: $callback_display_id, ips: $ip}) {
      status
      error
    }
  }
`;

// ─── Modify Callback Groups ────────────────

export const UPDATE_CALLBACK_GROUPS_MUTATION = gql`
  mutation updateCallbackGroups($callback_display_id: Int!, $mythictree_groups: [String!]!){
    updateCallback(input: {callback_display_id: $callback_display_id, mythictree_groups: $mythictree_groups}) {
      status
      error
    }
  }
`;

// ─── Task Multiple Callbacks (same command) ────────────────

export const GET_CALLBACK_C2_PATHS = gql`
  query GetCallbackC2Paths($callback_id: Int!) {
    callbackgraphedge(where: {_or: [{source_id: {_eq: $callback_id}}, {destination_id: {_eq: $callback_id}}], end_timestamp: {_is_null: true}}) {
      id
      source {
        id display_id host user ip
        payload { payloadtype { name } }
        active
      }
      destination {
        id display_id host user ip
        payload { payloadtype { name } }
        active
      }
      c2profile { name is_p2p }
    }
  }
`;

export const GET_ALL_C2_PATHS = gql`
  query GetAllC2Paths {
    callbackgraphedge(where: {end_timestamp: {_is_null: true}}) {
      id
      source_id
      destination_id
      c2profile { name is_p2p }
      source { id display_id host active }
      destination { id display_id host active }
    }
  }
`;

// ─── Payload callback_allowed toggle ────────────────────────────

export const PAYLOAD_CALLBACK_ALLOWED_MUTATION = gql`
  mutation PayloadCallbackAllowedMutation($payload_uuid: String!, $callback_allowed: Boolean!) {
    updatePayload(callback_allowed: $callback_allowed, payload_uuid: $payload_uuid) {
      status
      error
      callback_allowed
    }
  }
`;

// ─── Host file through C2 ────────────────────────────────────────

export const HOST_FILE_MUTATION = gql`
  mutation HostFileMutation($c2_id: Int!, $file_uuid: String!, $host_url: String!, $alert_on_download: Boolean, $remove: Boolean) {
    c2HostFile(c2_id: $c2_id, file_uuid: $file_uuid, host_url: $host_url, alert_on_download: $alert_on_download, remove: $remove) {
      status
      error
    }
  }
`;

export const GET_RUNNING_EGRESS_C2_PROFILES = gql`
  query GetRunningEgressC2Profiles {
    c2profile(where: {deleted: {_eq: false}, container_running: {_eq: true}, is_p2p: {_eq: false}}, order_by: {name: asc}) {
      id
      name
    }
  }
`;

// ─── Browserscript-to-callback relationship graph ───────────────

export const GET_CALLBACKS_WITH_BROWSERSCRIPTS = gql`
  query GetCallbacksWithBrowserscripts {
    callback(where: {active: {_eq: true}}) {
      id
      display_id
      host
      user
      ip
      os
      payload {
        payloadtype { name }
      }
      loadedcommands {
        id
        command {
          id
          cmd
          browserscripts {
            id
            name
            script
            author
            command { cmd id }
          }
        }
      }
    }
  }
`;

// ── Link Focus (global persistent, stored in agentstorage) ───────────────────
// Stored at unique_id = "minerva_link_focus"
// data = base64-encoded JSON: { nodeId: string, label: string }

export const GET_LINK_FOCUS = gql`
query GetLinkFocus {
  agentstorage(where: { unique_id: { _eq: "minerva_link_focus" } }) {
    id
    unique_id
    data
  }
}
`;

// Upsert: delete existing then insert new (both in one mutation call → one tx)

export const SET_LINK_FOCUS = gql`
mutation SetLinkFocus($data: bytea!) {
  deletePrev: delete_agentstorage(where: { unique_id: { _eq: "minerva_link_focus" } }) {
    affected_rows
  }
  insertNext: insert_agentstorage_one(
    object: { unique_id: "minerva_link_focus", data: $data }
  ) {
    id
    unique_id
  }
}
`;

export const CLEAR_LINK_FOCUS = gql`
mutation ClearLinkFocus {
  delete_agentstorage(where: { unique_id: { _eq: "minerva_link_focus" } }) {
    affected_rows
  }
}
`;
