import { gql } from '@apollo/client';

export const CALLBACKPORT_STREAM = gql`
  subscription CallbackPortStream {
    callbackport_stream(
      cursor: { initial_value: { updated_at: "1970-01-01" }, ordering: ASC }
      batch_size: 100
      where: {}
    ) {
      id
      deleted
      port_type
      local_port
      remote_port
      remote_ip
      bytes_received
      bytes_sent
      username
      password
      updated_at
      task {
        display_id
      }
      callback {
        id
        display_id
        host
        ip
        user
        description
        domain
        process_name
        integrity_level
        active
        sleep_info
        init_callback
        last_checkin
        payload {
          uuid
          payloadtype {
            name
          }
          payloadc2profiles {
            c2profile {
              name
              is_p2p
            }
          }
          c2profileparametersinstances(order_by: { c2profile: { name: asc } }) {
            value
            c2profile {
              name
            }
            c2profileparameter {
              name
            }
          }
        }
      }
    }
  }
`;

export const TOGGLE_PROXY_MUTATION = gql`
  mutation ToggleProxy($callbackport_id: Int!, $action: String!) {
    toggleProxy(callbackport_id: $callbackport_id, action: $action) {
      status
      error
    }
  }
`;

export const TEST_PROXY_MUTATION = gql`
  mutation TestProxy($callbackport_id: Int!) {
    testProxy(callbackport_id: $callbackport_id) {
      status
      error
    }
  }
`;

// ─── Callback color ──────────────────────────────────────
