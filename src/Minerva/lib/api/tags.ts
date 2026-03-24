import { gql } from '@apollo/client';

export const GET_TAG_TYPES_EXPORT = gql`
  query GetTagTypesExport {
    tagtype(order_by: {name: asc}) {
      id
      name
      color
      description
    }
  }
`;

export const IMPORT_TAG_TYPES = gql`
  mutation ImportTagTypes($tagtypes: [tagtype_insert_input!]!) {
    insert_tagtype(objects: $tagtypes, on_conflict: {constraint: tagtype_name_operation_id_key, update_columns: [color, description]}) {
      returning {
        id
        name
        color
        description
      }
    }
  }
`;

// ─── All commands for block list selection ────────────────

export const GET_ALL_COMMANDS = gql`
  query GetAllCommands {
    command(where: {deleted: {_eq: false}}, order_by: {payloadtype: {name: asc}, cmd: asc}) {
      id
      cmd
      payloadtype {
        name
      }
    }
  }
`;

// ─── Dynamic Query Params (Tab Completion) ────────────────

export const GET_DYNAMIC_QUERY_PARAMS = gql`
  mutation getDynamicParamsMutation($callback: Int!, $command: String!, $payload_type: String!, $parameter_name: String!, $other_parameters: jsonb){
    dynamic_query_function(callback: $callback, command: $command, payload_type: $payload_type, parameter_name: $parameter_name, other_parameters: $other_parameters){
      status
      error
      choices
      parameter_name
    }
  }
`;

// ─── Callback Context Subscription (Tasking context badges) ────
