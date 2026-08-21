import { gql } from '@apollo/client';

export const GET_C2_PROFILES = gql`
query GetC2Profiles {
  c2profile(order_by: {name: asc}) {
    id
    name
    running
    container_running
    is_p2p
    description
    author
    semver
    deleted
    payloadtypec2profiles(order_by: {payloadtype: {name: asc}}) {
      payloadtype {
        name
        deleted
        id
      }
    }
  }
}
`;

/**
 * The C2 Profiles page feed.
 *
 * It carries more than the profile row itself because the page's job is not
 * "list the containers" but "tell me whether my egress is healthy and what is
 * riding on it". The two nested arrays answer that second half:
 *
 *   callbackc2profiles → agents currently calling home over this channel
 *   payloadc2profiles  → payloads built against it
 *
 * Both are scoped to the operator's current operation by Hasura permissions,
 * and neither table allows aggregations (verified: `allow_aggregations` is
 * absent on `callbackc2profiles` and `payloadc2profiles`), so the ids come
 * down and the page counts them.
 *
 * SCALING CEILING, stated plainly: these arrays are unbounded. One row comes
 * back per (profile, callback) pair on every push, so an operation with
 * thousands of callbacks re-sends thousands of rows to render two integers.
 * It is fine at the scale a C2 fleet actually runs at (tens of profiles, low
 * thousands of callbacks), and the fix if it ever stops being fine is a
 * server-side count — not a `limit` here, which would silently under-report.
 *
 * `last_checkin` / `sleep_info` come along because liveness is computed with
 * `isCallbackAlive`, never with the lagging `dead` column.
 */
export const SUB_C2_PROFILES = gql`
subscription SubC2Profiles {
  c2profile(order_by: {name: asc}) {
    id
    name
    running
    container_running
    is_p2p
    is_server_routed
    description
    author
    semver
    deleted
    creation_time
    payloadtypec2profiles(order_by: {payloadtype: {name: asc}}) {
      payloadtype {
        name
        deleted
        id
      }
    }
    callbackc2profiles {
      callback {
        id
        active
        last_checkin
        sleep_info
      }
    }
    payloadc2profiles {
      payload {
        id
        deleted
      }
    }
  }
}
`;

export const TOGGLE_C2_PROFILE_DELETE = gql`
mutation ToggleC2ProfileDeleteStatus($c2profile_id: Int!, $deleted: Boolean!) {
  update_c2profile_by_pk(pk_columns: {id: $c2profile_id}, _set: {deleted: $deleted}) {
    id
    deleted
  }
}
`;

export const START_STOP_PROFILE_MUTATION = gql`
  mutation StartStopProfile($id: Int!, $action: String!) {
    startStopProfile(id: $id, action: $action) {
      status
      error
      output
    }
  }
`;

export const GET_PROFILE_OUTPUT = gql`
query getProfileOutput($id: Int!) {
  getProfileOutput(id: $id) {
    status
    error
    output
  }
}
`;

export const GET_PROFILE_CONFIG = gql`
query getProfileConfigOutput($container_name: String!, $filename: String!) {
  containerDownloadFile(container_name: $container_name, filename: $filename) {
    status
    error
    filename
    data
  }
}
`;

export const SET_PROFILE_CONFIG = gql`
mutation setProfileConfiguration($container_name: String!, $file_path: String!, $data: String!) {
  containerWriteFile(container_name: $container_name, file_path: $file_path, data: $data) {
    status
    error
    filename
  }
}
`;
