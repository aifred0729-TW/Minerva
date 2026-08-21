import { gql } from '@apollo/client';

/**
 * SOCKS port ledger, stored in Mythic's `agentstorage` — one row per PORT.
 *
 * One row per port rather than one JSON blob for the whole map, because the
 * blob form cannot be claimed safely: two operators both read `{}`, both pick
 * 7100, and the second write silently wins. With a row per port,
 * `on_conflict … update_columns: []` compiles to Postgres `ON CONFLICT DO
 * NOTHING`, which returns NO row when the port is already held — an atomic
 * test-and-set. A non-null result means we own the port; null means someone
 * else got there first and we try the next one.
 *
 * `agentstorage_unique_id` (verified present as a UNIQUE constraint) is what
 * makes that work.
 */
export const MSF_SOCKS_ALLOC_PREFIX = 'minerva_msf_socks_port:';
export const msfSocksAllocUniqueId = (port: number) => `${MSF_SOCKS_ALLOC_PREFIX}${port}`;

export const GET_MSF_SOCKS_ALLOCATIONS = gql`
query GetMsfSocksAllocations($prefix: String!) {
  agentstorage(where: { unique_id: { _like: $prefix } }, order_by: { unique_id: asc }) {
    id
    unique_id
    data
  }
}
`;

/** Atomic claim. Returns null (no row) when the port is already held. */
export const CLAIM_MSF_SOCKS_PORT = gql`
mutation ClaimMsfSocksPort($unique_id: String!, $data: bytea!) {
  insert_agentstorage_one(
    object: { unique_id: $unique_id, data: $data }
    on_conflict: { constraint: agentstorage_unique_id, update_columns: [] }
  ) {
    id
    unique_id
    data
  }
}
`;

export const RELEASE_MSF_SOCKS_PORT = gql`
mutation ReleaseMsfSocksPort($unique_id: String!) {
  delete_agentstorage(where: { unique_id: { _eq: $unique_id } }) {
    affected_rows
  }
}
`;
