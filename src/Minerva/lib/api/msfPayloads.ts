/* =============================================================================
 *  MSF Payload — Mythic agentstorage sync layer
 *
 *  We piggy-back on the existing Hasura `agentstorage` table so MSF-generated
 *  payloads are shared across operators without requiring any Mythic source
 *  changes. Each row has unique_id = `minerva_msf_payload:<id>` and `data` is
 *  a `bytea` (Postgres bytestring) containing the JSON-serialised metadata +
 *  base64-encoded payload bytes.
 *
 *  Companion: lib/msfPayloads.ts (localStorage cache) — the local cache reads
 *  the same shape, so the two stores stay byte-for-byte interchangeable.
 * ===========================================================================*/
import { gql } from '@apollo/client';

/**
 * Per-operation `unique_id` namespace. Embedding the Mythic operation id
 * in the agentstorage key is what stops Op A's payloads from leaking
 * into Op B's list — Hasura filters by the operation-scoped prefix on
 * read, and every upsert/delete writes/removes the right one.
 *
 * Format: `minerva_msf_payload:<opId>:<payloadId>`.
 *
 * The bare `MSF_PAYLOAD_PREFIX` constant (no opId) is preserved only as
 * a sentinel for **legacy rows** written before this change. The list
 * view migrates those forward at read time — never used to filter for
 * fresh rows.
 */
export const MSF_PAYLOAD_LEGACY_PREFIX = 'minerva_msf_payload:';
export const msfPayloadPrefixForOp = (operationId: number | string) =>
    `${MSF_PAYLOAD_LEGACY_PREFIX}${operationId}:`;
export const msfPayloadUniqueIdFor = (operationId: number | string, payloadId: string) =>
    `${msfPayloadPrefixForOp(operationId)}${payloadId}`;

export const GET_MSF_PAYLOADS = gql`
query GetMsfPayloads($prefix: String!) {
  agentstorage(where: { unique_id: { _like: $prefix } }, order_by: { id: desc }) {
    id
    unique_id
    data
  }
}
`;

export const UPSERT_MSF_PAYLOAD = gql`
mutation UpsertMsfPayload($unique_id: String!, $data: bytea!) {
  insert_agentstorage_one(
    object: { unique_id: $unique_id, data: $data }
    on_conflict: { constraint: agentstorage_unique_id, update_columns: [data] }
  ) {
    id
    unique_id
  }
}
`;

export const DELETE_MSF_PAYLOAD = gql`
mutation DeleteMsfPayload($unique_id: String!) {
  delete_agentstorage(where: { unique_id: { _eq: $unique_id } }) {
    affected_rows
  }
}
`;
