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
