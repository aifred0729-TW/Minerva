import { gql } from '@apollo/client';

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

// ─── Tags Page Queries & Mutations ────────────────

export const GET_TAGTYPES = gql`
query getOperationTags {
  tagtype(order_by: {name: asc}) {
    id
    color
    description
    name
    tags_aggregate {
      aggregate {
        count
      }
    }
  }
}
`;

// Mythic's backend exposes the Hasura auto-generated mutations
// (insert_tagtype_one / update_tagtype_by_pk) — there is no
// custom `createTagtype` / `updateTagtype` action.
export const CREATE_TAGTYPE = gql`
mutation createTagtype($name: String!, $description: String!, $color: String!) {
  insert_tagtype_one(object: {name: $name, description: $description, color: $color}) {
    id
    name
    description
    color
  }
}
`;

export const UPDATE_TAGTYPE = gql`
mutation updateTagtype($id: Int!, $name: String!, $description: String!, $color: String!) {
  update_tagtype_by_pk(pk_columns: {id: $id}, _set: {name: $name, description: $description, color: $color}) {
    id
    name
    description
    color
  }
}
`;

export const DELETE_TAGTYPE = gql`
mutation tagtypeDeleteMutation($id: Int!) {
  deleteTagtype(id: $id) {
      status
      error
      tagtype_id
  }
}
`;

export const EXPORT_TAGTYPES = gql`
query getAllTagTypes {
    tagtype(order_by: {name: asc}) {
        color
        description
        name
    }
}
`;

export const IMPORT_TAGTYPES = gql`
mutation importMultipleTagtypes($tagtypes: String!) {
    importTagtypes(tagtypes: $tagtypes) {
        status
        error
    }
}
`;

// ─── Credential Tag Management (Minerva inline tag manager) ────
export const CREATE_CREDENTIAL_TAG = gql`
mutation createCredentialTag($credential_id: Int!, $tagtype_id: Int!, $source: String!, $url: String!, $data: jsonb!) {
    createTag(credential_id: $credential_id, tagtype_id: $tagtype_id, source: $source, url: $url, data: $data) {
        id
        status
        error
    }
}
`;

export const DELETE_TAG = gql`
mutation deleteTag($tag_id: Int!) {
    delete_tag_by_pk(id: $tag_id) {
        id
    }
}
`;

// ─── Callback Context Subscription (Tasking context badges) ────
