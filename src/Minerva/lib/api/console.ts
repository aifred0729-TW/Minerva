import { gql } from '@apollo/client';

export const GET_ALL_CALLBACKS_BY_DOMAIN = gql`
query GetAllCallbacksByDomain {
  callback(order_by: {display_id: asc}) {
    id
    display_id
    user
    host
    pid
    ip
    domain
    os
    architecture
    integrity_level
    last_checkin
    init_callback
    active
    description
    process_name
    payload {
      payloadtype {
        name
      }
    }
  }
}
`;

export const GET_CONSOLE_CALLBACKS = gql`
query GetConsoleCallbacks {
  callback(order_by: {display_id: asc}) {
    id
    display_id
    active
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
    payload {
      payloadtype {
        name
      }
    }
  }
}
`;

export const SUBSCRIPTION_CONSOLE_CALLBACKS = gql`
subscription SubscribeConsoleCallbacks {
  callback(order_by: {display_id: asc}) {
    id
    display_id
    active
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
    payload {
      payloadtype { name }
    }
  }
}
`;
