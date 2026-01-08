import { gql } from '@apollo/client';

export const GET_DASHBOARD_DATA = gql`
query GetMinervaDashboard($operator_id: Int!) {
  # 1. Active Callbacks
  callback(order_by: {id: asc}, where: {active: {_eq: true}}) {
    id
    display_id
    user
    host
    ip
    integrity_level
    last_checkin
    description
    payload {
        payloadtype {
            name
        }
    }
  }
  
  # 2. Recent Payloads
  payload(order_by: {id: desc}, limit: 5, where: {deleted: {_eq: false}, auto_generated: {_eq: false}}) {
    id
    uuid
    build_phase
    filemetum {
      filename_text
    }
    payloadtype {
      name
    }
  }

  # Payload Count
  payload_aggregate(where: {deleted: {_eq: false}, auto_generated: {_eq: false}}) {
    aggregate {
      count
    }
  }

  # 3. Operations Status
  operation(where: {complete: {_eq: false}, deleted: {_eq: false}}) {
    id
    name
    complete
    members {
        username
    }
  }

  # 4. Recent Tasks / Command Stats (Simplified)
  task(limit: 20, order_by: {id: desc}) {
    id
    command_name
    status
    status_timestamp_preprocessing 
    operator {
        username
    }
  }
  
  # 5. Current Operator Info
  operator(where: {id: {_eq: $operator_id}}){ 
    username
    admin
  }

  # 6. C2 Profiles Status
  c2profile(where: {deleted: {_eq: false}}, order_by: {name: asc}) {
    id
    name
    running
    container_running
    is_p2p
    description
    author
    semver
  }
}
`;

export const GET_CALLBACKS = gql`
query GetCallbacks($limit: Int = 50, $offset: Int = 0) {
  callback(order_by: {id: desc}, limit: $limit, offset: $offset, where: {active: {_eq: true}}) {
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
    description
    payload {
      payloadtype {
        name
      }
    }
  }
}
`;

export const GET_C2_PROFILES = gql`
query GetC2Profiles {
  c2profile(where: {deleted: {_eq: false}}, order_by: {name: asc}) {
    id
    name
    running
    container_running
    is_p2p
    description
    author
    semver
    payloadtypec2profiles {
      payloadtype {
        name
      }
    }
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

// --- Operations Management ---

export const GET_OPERATIONS = gql`
query GetOperations {
  operation(order_by: {name: asc}, where: {deleted: {_eq: false}}) {
    id
    name
    complete
    webhook
    channel
    banner_text
    banner_color
    admin {
      id
      username
    }
    operatoroperations {
      id
      view_mode
      operator {
        id
        username
      }
    }
  }
  operator(where: {active: {_eq: true}, deleted: {_eq: false}}) {
    id
    username
  }
}
`;

export const CREATE_OPERATION_MUTATION = gql`
mutation CreateOperation($name: String!) {
  createOperation(name: $name) {
    status
    error
    operation_id
    operation_name
  }
}
`;

export const UPDATE_OPERATION_MUTATION = gql`
mutation UpdateOperation($operation_id: Int!, $name: String, $complete: Boolean, $channel: String, $webhook: String, $banner_text: String, $banner_color: String) {
  updateOperation(operation_id: $operation_id, name: $name, complete: $complete, channel: $channel, webhook: $webhook, banner_text: $banner_text, banner_color: $banner_color) {
    status
    error
    id
    name
    complete
  }
}
`;

export const UPDATE_OPERATION_MEMBERS_MUTATION = gql`
mutation UpdateOperationMembers($operation_id: Int!, $add_users: [Int], $remove_users: [Int], $view_mode_operators: [Int], $view_mode_spectators: [Int]) {
  updateOperatorOperation(operation_id: $operation_id, add_users: $add_users, remove_users: $remove_users, view_mode_operators: $view_mode_operators, view_mode_spectators: $view_mode_spectators) {
    status
    error
  }
}
`;

export const TOGGLE_OPERATION_DELETE_MUTATION = gql`
mutation ToggleOperationDeleted($operation_id: Int!, $deleted: Boolean!) {
  updateOperation(operation_id: $operation_id, deleted: $deleted) {
    status
    error
  }
}
`;

// --- User Management ---

export const GET_OPERATORS = gql`
query GetOperators {
  operator(order_by: {username: asc}, where: {deleted: {_eq: false}}) {
    id
    username
    active
    admin
    last_login
    creation_time
    deleted
    email
  }
}
`;

export const CREATE_OPERATOR_MUTATION = gql`
mutation CreateOperator($username: String!, $password: String!, $email: String, $bot: Boolean) {
  createOperator(input: {username: $username, password: $password, email: $email, bot: $bot}) {
    status
    error
    id
    username
  }
}
`;

export const UPDATE_OPERATOR_STATUS_MUTATION = gql`
mutation UpdateOperatorStatus($operator_id: Int!, $active: Boolean, $admin: Boolean, $deleted: Boolean) {
  updateOperatorStatus(operator_id: $operator_id, active: $active, admin: $admin, deleted: $deleted) {
    status
    error
    id
    active
    admin
    deleted
  }
}
`;

export const UPDATE_OPERATOR_PASSWORD_MUTATION = gql`
mutation UpdateOperatorPassword($user_id: Int!, $new_password: String!, $email: String) {
  updatePasswordAndEmail(user_id: $user_id, new_password: $new_password, email: $email) {
    status
    error
    operator_id
  }
}
`;

export const UPDATE_OPERATOR_USERNAME_MUTATION = gql`
mutation UpdateOperatorUsername($id: Int!, $username: String!) {
  update_operator_by_pk(pk_columns: {id: $id}, _set: {username: $username}) {
    id
    username
  }
}
`;

export async function loginUser(username, password) {
    const response = await fetch('/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, scripting_version: "3" })
    });
    if (!response.ok) throw new Error("Login failed");
    return await response.json();
}
