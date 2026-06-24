import { gql } from '@apollo/client';

export const REISSUE_TASK_MUTATION = gql`
  mutation reissueTaskMutation($task_id: Int!) {
    reissue_task(task_id: $task_id) {
      status
      error
    }
  }
`;

export const REISSUE_TASK_HANDLER_MUTATION = gql`
  mutation reissueTaskHandlerMutation($task_id: Int!) {
    reissue_task_handler(task_id: $task_id) {
      status
      error
    }
  }
`;

export const GET_ALL_TASK_RESPONSES = gql`
  query getAllTaskResponses($task_id: Int!) {
    response(where: {task_id: {_eq: $task_id}}, order_by: {id: asc}) {
      id
      response: response_text
    }
  }
`;

export const GET_RESPONSES_PAGINATED = gql`
  query getResponsesPaginated($task_id: Int!, $fetchLimit: Int, $offset: Int!, $search: String!) {
    response(where: {task_id: {_eq: $task_id}, response_escape: {_ilike: $search}}, limit: $fetchLimit, offset: $offset, order_by: {id: asc}) {
      id
      response: response_text
      timestamp
      is_error
    }
    response_aggregate(where: {task_id: {_eq: $task_id}, response_escape: {_ilike: $search}}) {
      aggregate { count }
    }
  }
`;

export const GET_RESPONSES_ALL_SEARCH = gql`
  query getAllResponsesSearch($task_id: Int!, $search: String!) {
    response(where: {task_id: {_eq: $task_id}, response_escape: {_ilike: $search}}, order_by: {id: asc}) {
      id
      response: response_text
      timestamp
      is_error
    }
    response_aggregate(where: {task_id: {_eq: $task_id}, response_escape: {_ilike: $search}}) {
      aggregate { count }
    }
  }
`;

export const UPDATE_TASK_COMMENT_MUTATION = gql`
  mutation updateTaskComment($task_id: Int!, $comment: String) {
    update_task_by_pk(pk_columns: {id: $task_id}, _set: {comment: $comment}) {
      id
      comment
    }
  }
`;

export const GET_TASK_COMMENT_QUERY = gql`
  query getTaskComment($task_id: Int!) {
    task_by_pk(id: $task_id) {
      id
      comment
    }
  }
`;

export const GET_TASK_PARAMS_QUERY = gql`
  query getTaskParams($task_id: Int!) {
    task_by_pk(id: $task_id) {
      id
      display_params
      original_params
      mythic_parsed_params
      params
      tasking_location
      parameter_group_name
      command_name
      timestamp
      status_timestamp_preprocessing
      status_timestamp_processing
      status_timestamp_processed
      command {
        cmd
        id
        payloadtype {
          name
          id
        }
      }
    }
  }
`;

export const GET_TASK_STDOUT_STDERR_QUERY = gql`
  query getTaskStdoutStderr($task_id: Int!) {
    task_by_pk(id: $task_id) {
      id
      stdout
      stderr
    }
  }
`;

// ============================================
// Tunnels (SOCKS / Port Forwarding)
// ============================================

export const GET_TASK_BY_DISPLAY_ID = gql`
  query GetTaskByDisplayId($display_id: Int!) {
    task(where: {display_id: {_eq: $display_id}}, limit: 1) {
      id
      display_id
      command_name
      original_params
      display_params
      status
      timestamp
      completed
      comment
      tasking_location
      parameter_group_name
      status_timestamp_submitted
      status_timestamp_preprocessing
      status_timestamp_processing
      status_timestamp_processed
      opsec_pre_blocked
      opsec_post_blocked
      operator { username }
      callback {
        id
        display_id
        host
        user
        domain
        os
        pid
        ip
        integrity_level
        payload { payloadtype { name } }
        operation { name }
      }
      eventstepinstance { eventgroupinstance { eventgroup { id name } } }
      tags { tagtype { name color } }
    }
  }
`;

export const STREAM_TASK_RESPONSES_BY_ID = gql`
  subscription StreamTaskResponsesById($task_id: Int!) {
    response_stream(
      batch_size: 100,
      cursor: {initial_value: {id: 0}},
      where: {task_id: {_eq: $task_id}}
    ) {
      id
      response: response_text
      timestamp
      is_error
    }
  }
`;

export const GET_TASK_ARTIFACTS_BY_ID = gql`
  query GetTaskArtifactsById($task_id: Int!) {
    taskartifact(where: {task_id: {_eq: $task_id}}, order_by: {id: asc}) {
      id
      artifact_text
      base_artifact
      host
      timestamp
    }
  }
`;

// ─── QuickHack: Subscribe to a single task's status by ID ─────

export const SUBSCRIBE_TASK_STATUS_BY_ID = gql`
  subscription SubscribeTaskStatusById($task_id: Int!) {
    task_by_pk(id: $task_id) {
      id
      status
      completed
      status_timestamp_submitted
      status_timestamp_preprocessing
      status_timestamp_processing
      command_name
      display_params
      response_count
      responses(order_by: {id: desc}, limit: 5) {
        id
        response: response_text
        timestamp
        is_error
      }
    }
  }
`;

// ─── Operator Secrets ───────────────────────────────────

export const CREATE_TASK_BULK = gql`
  mutation CreateTaskBulk($callback_ids: [Int], $command: String!, $params: String!, $files: [String], $tasking_location: String, $original_params: String, $parameter_group_name: String, $payload_type: String) {
    createTask(callback_ids: $callback_ids, command: $command, params: $params, files: $files, tasking_location: $tasking_location, original_params: $original_params, parameter_group_name: $parameter_group_name, payload_type: $payload_type) {
      status
      id
      error
    }
  }
`;

// ─── Search: Extra fields queries ────────────────
