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

// ─── Payload types full (for PayloadTypes page) ──────────
