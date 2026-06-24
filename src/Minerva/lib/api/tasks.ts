import { gql } from '@apollo/client';

export const TASK_FRAGMENT = gql`
  fragment taskData on task {
    id
    display_id
    agent_task_id
    command_name
    display_params
    original_params
    tasking_location
    status
    timestamp
    status_timestamp_processing
    completed
    comment
    has_intercepted_response
    opsec_pre_blocked
    opsec_pre_bypassed
    opsec_post_blocked
    opsec_post_bypassed
    token {
      id
    }
    operator {
      username
    }
    commentOperator {
      username
    }
    opsec_pre_bypass_user {
      id
      username
    }
    opsec_post_bypass_user {
      id
      username
    }
    response_count
    is_interactive_task
    interactive_task_type
    status_timestamp_submitted
    status_timestamp_preprocessing
    command {
      cmd
      id
      supported_ui_features
      payloadtype {
        name
      }
    }
    eventstepinstance {
      eventgroupinstance {
        eventgroup { id }
        id
      }
      eventstep { name }
    }
    tags {
      tagtype {
        name
        color
        id
      }
      id
    }
    callback {
      id
      display_id
      host
      integrity_level
      ip
      domain
      mythictree_groups
    }
    responses(order_by: {id: asc}) {
      id
      response: response_text
      timestamp
      is_error
    }
    credentials {
      id
      account
      realm
      type
      credential_text
      comment
    }
  }
`;

export const STREAM_SUBTASKS = gql`
  ${TASK_FRAGMENT}
  subscription StreamSubTasks($parent_task_id: Int!) {
    task_stream(
      batch_size: 10,
      cursor: {initial_value: {timestamp: "1970-01-01T00:00:00Z"}},
      where: {parent_task_id: {_eq: $parent_task_id}, is_interactive_task: {_eq: false}}
    ) {
      ...taskData
    }
  }
`;

export const STREAM_INTERACTIVE_SUBTASKS = gql`
  subscription StreamInteractiveSubTasks($parent_task_id: Int!) {
    task_stream(
      batch_size: 50,
      cursor: {initial_value: {timestamp: "1970-01-01T00:00:00Z"}},
      where: {parent_task_id: {_eq: $parent_task_id}, is_interactive_task: {_eq: true}}
    ) {
      id
      timestamp
      status_timestamp_preprocessing
      display_params
      original_params
      interactive_task_type
      status
    }
  }
`;

export const CREATE_INTERACTIVE_TASK_MUTATION = gql`
  mutation CreateInteractiveTask(
    $callback_id: Int!, $command: String!, $params: String!,
    $original_params: String, $tasking_location: String, $parameter_group_name: String,
    $parent_task_id: Int!, $interactive_task_type: Int!
  ) {
    createTask(
      callback_id: $callback_id,
      command: $command,
      params: $params,
      original_params: $original_params,
      tasking_location: $tasking_location,
      parameter_group_name: $parameter_group_name,
      parent_task_id: $parent_task_id,
      is_interactive_task: true,
      interactive_task_type: $interactive_task_type
    ) {
      status
      error
      id
    }
  }
`;

export const STREAM_TASK_RESPONSES = gql`
  subscription StreamTaskResponses($task_id: Int!) {
    response_stream(
      batch_size: 50,
      cursor: {initial_value: {timestamp: "1970-01-01"}},
      where: {task_id: {_eq: $task_id}}
    ) {
      id
      response: response_text
      timestamp
      is_error
    }
  }
`;

export const GET_BROWSERSCRIPT = gql`
  query GetBrowserScript($command_id: Int!) {
    browserscript(where: {active: {_eq: true}, command_id: {_eq: $command_id}, for_new_ui: {_eq: true}}) {
      script
      id
    }
  }
`;

export const GET_KILL_COMMAND = gql`
  query GetKillTaskCommand($callback_id: Int!) {
    callback_by_pk(id: $callback_id) {
      loadedcommands(where: {command: {supported_ui_features: {_contains: "task:job_kill"}}}) {
        command {
          cmd
          payloadtype { name }
        }
      }
    }
  }
`;

export const STREAM_CALLBACK_TASKS = gql`
  ${TASK_FRAGMENT}
  subscription StreamCallbackTasks($callback_display_id: Int!) {
    task_stream(
      batch_size: 20,
      cursor: {initial_value: {timestamp: "1970-01-01T00:00:00Z"}},
      where: {callback: {display_id: {_eq: $callback_display_id}}, parent_task_id: {_is_null: true}}
    ) {
      ...taskData
    }
  }
`;

export const CREATE_TASK_MUTATION = gql`
  mutation CreateTask($callback_id: Int!, $command: String!, $params: String!, $files: [String], $tasking_location: String, $original_params: String, $parameter_group_name: String, $payload_type: String, $token_id: Int) {
    createTask(callback_id: $callback_id, command: $command, params: $params, files: $files, tasking_location: $tasking_location, original_params: $original_params, parameter_group_name: $parameter_group_name, payload_type: $payload_type, token_id: $token_id) {
      status
      error
      id
    }
  }
`;

export const SUBSCRIPTION_CALLBACK_TOKENS = gql`
subscription SubscriptionCallbackTokens($callback_id: Int!) {
  callbacktoken(where: {deleted: {_eq: false}, callback_id: {_eq: $callback_id}}) {
    token {
      token_id
      id
      user
      description
    }
    id
  }
}
`;

export const GET_OPERATORS_IN_OPERATION = gql`
query GetOperatorsInOperation($operation_id: Int!) {
  operation_by_pk(id: $operation_id) {
    operators {
      username
      id
    }
  }
}
`;

export const GET_LOADED_COMMANDS_SUBSCRIPTION = gql`
subscription GetLoadedCommandsSubscription($callback_id: Int!) {
  loadedcommands(where: {callback_id: {_eq: $callback_id}}) {
    id
    command {
      cmd
      id
      attributes
      description
      help_cmd
      author
      version
      payloadtype {
        name
        id
      }
      commandparameters {
        id
        parameter_type: type
        choices
        dynamic_query_function
        required
        name
        description
        default_value
        ui_position
        parameter_group_name
        cli_name
        display_name
      }
    }
  }
}
`;
