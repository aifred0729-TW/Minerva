import { gql } from '@apollo/client';

export const GET_OPERATOR_SECRETS = gql`
  query GetOperatorSecrets($operator_id: Int) {
    getOperatorSecrets(operator_id: $operator_id) {
      status
      error
      secrets
    }
  }
`;

export const UPDATE_OPERATOR_SECRETS = gql`
  mutation UpdateOperatorSecrets($secrets: jsonb!, $operator_id: Int) {
    updateOperatorSecrets(secrets: $secrets, operator_id: $operator_id) {
      status
      error
    }
  }
`;

// ─── API Tokens ──────────────────────────────────────────

export const GET_API_TOKENS = gql`
  query GetAPITokens($operator_id: Int!) {
    apitokens(where: {operator_id: {_eq: $operator_id}}, order_by: {id: desc}) {
      token_value
      token_type
      creation_time
      active
      name
      deleted
      id
      created_by_operator {
        username
        id
      }
    }
  }
`;

export const CREATE_API_TOKEN = gql`
  mutation CreateAPIToken($operator_id: Int, $name: String) {
    createAPIToken(token_type: "User", operator_id: $operator_id, name: $name) {
      id
      token_value
      token_type
      status
      error
      operator_id
      name
      created_by
      creation_time
    }
  }
`;

export const DELETE_API_TOKEN = gql`
  mutation DeleteAPIToken($id: Int!) {
    deleteAPIToken(apitokens_id: $id) {
      status
      error
      id
      operator_id
    }
  }
`;

export const TOGGLE_API_TOKEN_ACTIVE = gql`
  mutation ToggleAPITokenActive($id: Int!, $active: Boolean!) {
    update_apitokens_by_pk(pk_columns: {id: $id}, _set: {active: $active}) {
      id
      operator_id
      active
    }
  }
`;

// ─── Command Block Lists ─────────────────────────────────

export const GET_BLOCK_LISTS = gql`
  query GetBlockLists {
    disabledcommandsprofile(order_by: {name: asc}) {
      id
      name
      command {
        id
        cmd
        payloadtype {
          name
        }
      }
    }
  }
`;

export const CREATE_BLOCK_LIST_ENTRIES = gql`
  mutation CreateBlockListEntries($entries: [disabledcommandsprofile_insert_input!]!) {
    insert_disabledcommandsprofile(objects: $entries) {
      returning {
        id
        name
        command {
          id
          cmd
          payloadtype {
            name
          }
        }
      }
    }
  }
`;

export const DELETE_ENTIRE_BLOCK_LIST = gql`
  mutation DeleteEntireBlockList($name: String!) {
    deleteBlockList(name: $name) {
      status
      error
      name
    }
  }
`;

export const DELETE_BLOCK_LIST_ENTRIES = gql`
  mutation DeleteBlockListEntries($name: String!, $entries: [Int!]!) {
    deleteBlockListEntry(name: $name, entries: $entries) {
      status
      error
      name
      deleted_ids
    }
  }
`;

// ─── Detailed Callback Info ──────────────────────────────
