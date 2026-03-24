import { gql } from '@apollo/client';

export const GET_CALLBACKS = gql`
query GetCallbacks($limit: Int = 50, $offset: Int = 0) {
  callback(order_by: {id: desc}, limit: $limit, offset: $offset) {
    id
    display_id
    user
    host
    pid
    ip
    external_ip
    domain
    os
    architecture
    integrity_level
    last_checkin
    init_callback
    description
    sleep_info
    locked
    locked_operator { username }
    active
    dead
    color
    mythictree_groups
    process_name
    process_short_name
    agent_callback_id
    extra_info
    trigger_on_checkin_after_time
    cwd
    impersonation_context
    callbackports {
      id local_port remote_port remote_ip port_type
    }
    payload {
      payloadtype {
        name
        agent_type
      }
    }
    callbackc2profiles {
      c2profile {
        name
        is_p2p
      }
    }
    tags {
      id
      tagtype { name color }
    }
  }
}
`;

export const SUBSCRIPTION_CALLBACKS = gql`
subscription SubscribeCallbacks {
  callback(order_by: {id: desc}) {
    id
    display_id
    user
    host
    pid
    ip
    external_ip
    domain
    os
    architecture
    integrity_level
    last_checkin
    init_callback
    description
    sleep_info
    locked
    locked_operator { username }
    active
    dead
    color
    mythictree_groups
    process_name
    process_short_name
    agent_callback_id
    extra_info
    trigger_on_checkin_after_time
    cwd
    impersonation_context
    callbackports {
      id local_port remote_port remote_ip port_type
    }
    payload {
      payloadtype { name agent_type }
    }
    callbackc2profiles {
      c2profile { name is_p2p }
    }
    tags {
      id
      tagtype { name color }
    }
  }
}
`;

export const GET_CALLBACK_DETAILS = gql`
query GetCallbackDetails($display_id: Int!) {
  callback(where: {display_id: {_eq: $display_id}}) {
    id
    display_id
    agent_callback_id
    user
    host
    pid
    ip
    domain
    os
    architecture
    integrity_level
    last_checkin
    description
    sleep_info
    process_name
    operation_id
    active
    locked
    locked_operator { username }
    extra_info
    color
    dead
    cwd
    impersonation_context
    process_short_name
    mythictree_groups
    trigger_on_checkin_after_time
    callbackports {
      id local_port port_type bytes_sent bytes_received
    }
    payload {
      id
      uuid
      payloadtype {
        id
        name
      }
    }
  }
}
`;
