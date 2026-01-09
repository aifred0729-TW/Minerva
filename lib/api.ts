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

  # All Callbacks (for total count)
  all_callbacks: callback {
    id
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
    creation_time
  }

  # Payload Count (supported aggregate)
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
    operatoroperations {
      operator {
        username
      }
    }
  }

  # All Operations (for count)
  all_operations: operation(where: {deleted: {_eq: false}}) {
    id
  }

  # 4. Recent Tasks / Command Stats
  task(limit: 100, order_by: {id: desc}) {
    id
    command_name
    status
    timestamp
    completed
    opsec_pre_blocked
    opsec_pre_bypassed
    opsec_post_blocked
    opsec_post_bypassed
    operator {
        username
    }
    callback {
      display_id
      host
    }
  }
  
  # 5. Current Operator Info
  operator(where: {id: {_eq: $operator_id}}){
    username
    admin
  }

  # All Operators
  operators: operator(where: {deleted: {_eq: false}, active: {_eq: true}}) {
    id
    username
    last_login
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

  # 7. Credentials count
  credential_aggregate {
    aggregate {
      count
    }
  }

  # 8. Keylogs count
  keylog_aggregate {
    aggregate {
      count
    }
  }

  # 9. Downloaded files (supported aggregate)
  filemeta_aggregate(where: {is_download_from_agent: {_eq: true}, deleted: {_eq: false}}) {
    aggregate {
      count
    }
  }

  # 10. Uploaded files  
  uploaded_files: filemeta_aggregate(where: {is_screenshot: {_eq: false}, is_download_from_agent: {_eq: false}, deleted: {_eq: false}, is_payload: {_eq: false}}) {
    aggregate {
      count
    }
  }

  # 11. Screenshots
  screenshot_aggregate: filemeta_aggregate(where: {is_screenshot: {_eq: true}, deleted: {_eq: false}}) {
    aggregate {
      count
    }
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
    sleep_info
    locked
    payload {
      payloadtype {
        name
      }
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
    payload {
      id
      uuid
      payloadtype {
        name
      }
    }
  }
}
`;

// --- Callback Management ---

export const GET_CALLBACK_GRAPH_EDGES = gql`
query GetCallbackGraphEdges {
  callbackgraphedge(order_by: {id: desc, end_timestamp: desc_nulls_first}) {
    id
    end_timestamp
    destination {
      id
      display_id
      user
      host
      ip
      description
      payload {
        payloadtype {
          name
        }
      }
    }
    source {
      id
      display_id
      user
      host
      ip
      description
      payload {
        payloadtype {
          name
        }
      }
    }
    c2profile {
      id
      name
      is_p2p
    }
  }
}
`;

export const HIDE_CALLBACK_MUTATION = gql`
mutation hideCallback ($callback_display_id: Int!, $active: Boolean){
  updateCallback(input: {callback_display_id: $callback_display_id, active: $active}) {
    status
    error
  }
}
`;

export const LOCK_CALLBACK_MUTATION = gql`
mutation lockCallack($callback_display_id: Int!, $locked: Boolean!){
  updateCallback(input: {callback_display_id: $callback_display_id, locked: $locked}) {
    status
    error
  }
}
`;

export const UPDATE_CALLBACK_DESCRIPTION_MUTATION = gql`
mutation updateDescriptionCallback($callback_display_id: Int!, $description: String!){
  updateCallback(input: {callback_display_id: $callback_display_id, description: $description}) {
    status
    error
  }
}
`;

// --- Tasking ---

export const TASK_FRAGMENT = gql`
  fragment taskData on task {
    id
    display_id
    command_name
    display_params
    status
    timestamp
    completed
    operator {
      username
    }
    responses(order_by: {id: asc}) {
      id
      response: response_text
      timestamp
    }
  }
`;

export const GET_CALLBACK_TASKS = gql`
  ${TASK_FRAGMENT}
  query GetCallbackTasks($callback_display_id: Int!) {
    task(where: {callback: {display_id: {_eq: $callback_display_id}}, parent_task_id: {_is_null: true}}, order_by: {id: asc}) {
      ...taskData
    }
  }
`;

export const CREATE_TASK_MUTATION = gql`
  mutation CreateTask($callback_id: Int!, $command: String!, $params: String!) {
    createTask(callback_id: $callback_id, command: $command, params: $params) {
      status
      error
      id
    }
  }
`;

// --- OpSec Queue ---
export const GET_OPSEC_QUEUE = gql`
  query GetOpsecQueue {
    task(
      where: {
        _or: [
          { opsec_pre_blocked: { _eq: true }, opsec_pre_bypassed: { _neq: true } }
          { opsec_post_blocked: { _eq: true }, opsec_post_bypassed: { _neq: true } }
        ]
      }
      order_by: { id: desc }
      limit: 100
    ) {
      id
      display_id
      command_name
      display_params
      status
      timestamp
      opsec_pre_blocked
      opsec_pre_bypassed
      opsec_pre_message
      opsec_post_blocked
      opsec_post_bypassed
      opsec_post_message
      operator { username }
      callback { display_id host user }
    }
  }
`;

export const REQUEST_OPSEC_BYPASS = gql`
  mutation RequestOpsecBypass($task_id: Int!) {
    requestOpsecBypass(task_id: $task_id) {
      status
      error
    }
  }
`;

// --- C2 Profiles ---
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

// --- File Browser & Process List ---

export const FILE_DATA_FRAGMENT = gql`
    fragment fileObjData on mythictree {
        comment
        deleted
        task_id
        filemeta {
            id
            agent_file_id
            filename_text
        }
        tags {
            tagtype {
                name
                color
                id
            }
        }
        host
        id
        can_have_children
        has_children
        success
        full_path_text
        name_text
        timestamp
        parent_path_text
        tree_type
        metadata
        callback {
            id
            display_id
            mythictree_groups
        }
    }
`;

export const GET_FILE_TREE_ROOT = gql`
    ${FILE_DATA_FRAGMENT}
    query myRootFolderQuery($host: String!) {
        mythictree(where: { parent_path_text: { _eq: "" }, tree_type: {_eq: "file"}, host: {_ilike: $host} }, order_by: {name_text: asc}) {
            ...fileObjData
        }
    }
`;

export const GET_FILE_TREE_FOLDER = gql`
    ${FILE_DATA_FRAGMENT}
    query myFolderQuery($parent_path_text: String!, $host: String!) {
        children: mythictree(
            where: { parent_path_text: { _eq: $parent_path_text }, tree_type: {_eq: "file"}, host: {_ilike: $host} }
            order_by: { can_have_children: asc, name_text: asc }
        ) {
            ...fileObjData
        }
    }
`;

export const PROCESS_DATA_FRAGMENT = gql`
fragment treeObjData on mythictree {
    comment
    deleted
    task_id
    tags {
        tagtype {
            name
            color
            id
        }
        id
    }
    host
    id
    os
    can_have_children
    success
    full_path_text
    name_text
    timestamp
    parent_path_text
    tree_type
    metadata
    callback {
        id
        display_id
        mythictree_groups
    }
}
`;

export const GET_PROCESS_TREE = gql`
    ${PROCESS_DATA_FRAGMENT}
    query processesPerHostQuery($host: String!){
        mythictree(where: {host: {_ilike: $host}, tree_type: {_eq: "process"} }, order_by: {id: asc}) {
            ...treeObjData
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
