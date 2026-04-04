import { gql } from '@apollo/client';

// ============================================
// Subscriptions
// ============================================
export const SUB_BrowserScripts = gql`
subscription SubscribeBrowserScripts($operator_id: Int!) {
  browserscript(where: {operator_id: {_eq: $operator_id}, for_new_ui: {_eq: true}}, order_by: {payloadtype: {name: asc}}) {
    active
    author
    user_modified
    script
    payloadtype {
      name
      id
    }
    id
    creation_time
    container_version_author
    container_version
    command {
      cmd
      id
    }
  }
}
`;

// ============================================
// Mutations
// ============================================
export const UPDATE_SCRIPT_ACTIVE = gql`
mutation updateBrowserScriptActive($browserscript_id: Int!, $active: Boolean!) {
  update_browserscript_by_pk(pk_columns: {id: $browserscript_id}, _set: {active: $active}) {
    id
  }
}
`;

export const UPDATE_SCRIPT = gql`
mutation updateBrowserScriptScript($browserscript_id: Int!, $script: String!, $command_id: Int!, $payload_type_id: Int!) {
  update_browserscript_by_pk(pk_columns: {id: $browserscript_id}, _set: {script: $script, user_modified: true, command_id: $command_id, payload_type_id: $payload_type_id}) {
    id
  }
}
`;

export const REVERT_SCRIPT = gql`
mutation updateBrowserScriptRevert($browserscript_id: Int!, $script: String!) {
  update_browserscript_by_pk(pk_columns: {id: $browserscript_id}, _set: {script: $script, user_modified: false}) {
    id
  }
}
`;

export const CREATE_SCRIPT = gql`
mutation insertNewBrowserScript($script: String!, $payload_type_id: Int!, $command_id: Int!, $author: String!){
  insert_browserscript_one(object: {script: $script, payload_type_id: $payload_type_id, command_id: $command_id, author: $author}){
    id
  }
}
`;
