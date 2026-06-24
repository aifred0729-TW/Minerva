import { gql } from '@apollo/client';

// QuickHacks are persisted as agentstorage rows with unique_id
//   `minerva_quickhack_{operationId}_{hackId}`
// so the data is scoped to a single Mythic operation and shared across all
// operators in that operation. The `data` column carries a base64-encoded
// JSON blob of the QuickHackDef (including the author).

export const SUBSCRIBE_QUICKHACKS = gql`
subscription SubscribeQuickHacks($prefix: String!) {
  agentstorage(where: { unique_id: { _like: $prefix } }, order_by: { id: asc }) {
    id
    unique_id
    data
  }
}
`;

export const GET_QUICKHACKS = gql`
query GetQuickHacks($prefix: String!) {
  agentstorage(where: { unique_id: { _like: $prefix } }, order_by: { id: asc }) {
    id
    unique_id
    data
  }
}
`;

export const UPSERT_QUICKHACK = gql`
mutation UpsertQuickHack($unique_id: String!, $data: bytea!) {
  insert_agentstorage_one(
    object: { unique_id: $unique_id, data: $data }
    on_conflict: { constraint: agentstorage_unique_id, update_columns: [data] }
  ) {
    id
    unique_id
  }
}
`;

export const DELETE_QUICKHACK = gql`
mutation DeleteQuickHack($unique_id: String!) {
  delete_agentstorage(where: { unique_id: { _eq: $unique_id } }) {
    affected_rows
  }
}
`;
