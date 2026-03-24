import { gql } from '@apollo/client';

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
