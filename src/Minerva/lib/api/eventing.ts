import { gql } from '@apollo/client';

export const GET_EVENT_GROUP_INSTANCES = gql`
  query GetEventGroupInstances {
    eventgroupinstance(limit: 200, order_by: {id: desc}) {
      id
      created_at
      end_timestamp
      trigger
      status
      updated_at
      operator { username }
      eventgroup { id name description active deleted }
    }
  }
`;

export const SUB_EVENT_GROUP_INSTANCES = gql`
  subscription SubEventGroupInstances {
    eventgroupinstance_stream(
      cursor: {initial_value: {updated_at: "1970-01-01"}, ordering: ASC},
      batch_size: 100,
      where: {}
    ) {
      id
      created_at
      end_timestamp
      trigger
      status
      updated_at
      operator { username }
      eventgroup { id name description active deleted }
    }
  }
`;

export const SUB_EVENTSTEP_INSTANCES = gql`
  subscription SubEventStepInstances($eventgroupinstance_id: Int!) {
    eventstepinstance_stream(
      cursor: {initial_value: {updated_at: "1970-01-01"}, ordering: ASC},
      batch_size: 50,
      where: {eventgroupinstance_id: {_eq: $eventgroupinstance_id}}
    ) {
      id
      status
      order
      stdout
      stderr
      updated_at
      created_at
      eventstep { action name description }
    }
  }
`;

export const CANCEL_EVENT_GROUP_INSTANCE = gql`
  mutation CancelEventGroupInstance($eventgroupinstance_id: Int!) {
    eventingTriggerCancel(eventgroupinstance_id: $eventgroupinstance_id) {
      status
      error
    }
  }
`;

export const RETRY_EVENT_GROUP_INSTANCE = gql`
  mutation RetryEventGroupInstance($eventgroupinstance_id: Int!) {
    eventingTriggerRetry(eventgroupinstance_id: $eventgroupinstance_id) {
      status
      error
    }
  }
`;

export const GET_EVENTGROUPS = gql`
query GetEventGroups {
  eventgroup(limit: 50, order_by: {id: desc}) {
    id
    operator {
        username
    }
    filemetum {
        agent_file_id
        id
        filename_text
    }
    filemeta(where: {deleted: {_eq: false}}) {
        agent_file_id
        id
        filename_text
        deleted
    }
    name
    description
    trigger
    trigger_data
    next_scheduled_run
    keywords
    environment
    active
    deleted
    created_at
    run_as
    approved_to_run
    eventgroupapprovals(order_by: {id: asc}) {
      id
      operator {
        id
        username
      }
      approved
      created_at
      updated_at
    }
    eventgroupconsumingcontainers {
        id
        consuming_container_name
        all_functions_available
        function_names
        consuming_container {
            container_running
            subscriptions
        }
    }
  }
}
`;

export const SUB_EVENTGROUPS = gql`
subscription GetEventGroups {
  eventgroup_stream(cursor: {initial_value: {updated_at: "1970-01-01"}, ordering: ASC}, batch_size: 50, where: {}) {
    id
    operator {
        username
    }
    filemetum {
        agent_file_id
        id
        filename_text
    }
    filemeta(where: {deleted: {_eq: false}}) {
        agent_file_id
        id
        filename_text
        deleted
    }
    name
    description
    trigger
    trigger_data
    next_scheduled_run
    keywords
    environment
    active
    deleted
    created_at
    run_as
    approved_to_run
    eventgroupapprovals(order_by: {id: asc}) {
      id
      operator {
        id
        username
      }
      approved
      created_at
      updated_at
    }
    eventgroupconsumingcontainers {
        id
        consuming_container_name
        all_functions_available
        function_names
        consuming_container {
            container_running
            subscriptions
        }
    }
  }
}
`;

export const TOGGLE_EVENTGROUP_ACTIVE = gql`
mutation ToggleEventGroupActive($id: Int!, $active: Boolean!) {
    update_eventgroup_by_pk(pk_columns: {id: $id}, _set: {active: $active}) {
        id
        active
    }
}
`;

export const DELETE_EVENTGROUP = gql`
mutation DeleteEventGroup($id: Int!) {
    update_eventgroup_by_pk(pk_columns: {id: $id}, _set: {deleted: true}) {
        id
    }
}
`;

export const RESTORE_EVENTGROUP = gql`
mutation RestoreEventGroup($id: Int!) {
    update_eventgroup_by_pk(pk_columns: {id: $id}, _set: {deleted: false}) {
        id
    }
}
`;

export const CREATE_EVENTGROUP = gql`
mutation CreateEventGroupFromFile($file: String!, $filename: String!) {
    uploadEventFile(file: $file, filename: $filename) {
        status
        error
        file_id
    }
}
`;

export const APPROVE_EVENTGROUP = gql`
mutation ApproveEventGroup($eventgroup_id: Int!, $approved: Boolean!) {
    approveEventGroup(eventgroup_id: $eventgroup_id, approved: $approved) {
        status
        error
    }
}
`;

export const TRIGGER_MANUAL = gql`
mutation eventingManualTrigger($eventgroup_id: Int!) {
    eventingTriggerManual(eventgroup_id: $eventgroup_id) {
        status
        error
    }
}
`;

export const TRIGGER_KEYWORD = gql`
mutation triggerKeyword($keyword: String!, $keywordEnvData: jsonb!) {
    eventingTriggerKeyword(keyword: $keyword, keywordEnvData: $keywordEnvData) {
        status
        error
    }
}
`;

export const EXPORT_EVENT_GROUP = gql`
query ExportEventGroup($id: Int!) {
    eventgroup_by_pk(id: $id) {
        id
        name
        description
        trigger
        trigger_data
        keywords
        environment
        run_as
    }
}
`;

// ─── Payload types full (for PayloadTypes page) ──────────
