import { gql } from '@apollo/client';

export const GET_DASHBOARD_DATA = gql`
# NOTE: $operator_id is gone. It existed only to feed a 'operator(where: {id})'
# selection nothing read — and because 'userId' starts at 0 and flips to a real
# id once meState populates, that unused variable was causing Apollo to
# reobserve and re-run this entire query one extra time on every mount.
query GetMinervaDashboard($operation_id: Int!, $since: timestamp!) {
  # ── WHY EVERY TABLE BELOW CARRIES AN EXPLICIT operation_id FILTER ────
  #
  # Hasura scopes these tables for us, but NOT to the same thing. Checked
  # against the live metadata: 'callback' and 'attacktask' filter on
  #   operation_id: {_eq: X-Hasura-current-operation-id}
  # while 264 other permissions filter on
  #   operation_id: {_in: X-Hasura-operations}
  # — every operation the operator belongs to, not the one they are looking at.
  #
  # Left alone that puts a callback count from ONE operation on the same panel
  # as task counts, credentials, artifacts and alerts summed across ALL of
  # them. Measured on this instance: the newest 500 tasks span four operations
  # (302/129/60/9), credentials three, artifacts four. The success rate and the
  # tempo chart were being computed over a different population than the node
  # count sitting beside them.
  #
  # So every table that has an operation_id is filtered explicitly here.
  # c2profile, attacktask and operator have no such column: c2 profiles are
  # server-wide, and attacktask is already narrowly scoped by Hasura.

  # 1. Active Callbacks
  # Capped like every sibling list in this document.
  callback(order_by: {id: asc}, limit: 500, where: {active: {_eq: true}, operation_id: {_eq: $operation_id}}) {
    id
    display_id
    user
    host
    ip
    integrity_level
    last_checkin
    # isCallbackAlive() needs sleep_info to know what "late" means for this
    # agent — a 4h sleep is not a dead callback. Never use the 'dead' column:
    # it lags by up to a minute and is container-dependent, so live nodes show
    # as DEAD. (Project rule, see docs.)
    sleep_info
    os
    architecture
    domain
    # When this foothold first landed. Without it the console can count
    # callbacks but cannot say when they were won, so "is the operation
    # progressing" has no answer beyond the current total.
    init_callback
    description
    payload {
        payloadtype {
            name
        }
    }
  }

  # All Callbacks (for total count)
  # Bounded: this is only ever counted, and an operation can hold thousands.
  all_callbacks: callback(limit: 1000, where: {operation_id: {_eq: $operation_id}}) {
    id
  }
  
  # 2. Recent Payloads
  payload(order_by: {id: desc}, limit: 5, where: {deleted: {_eq: false}, auto_generated: {_eq: false}, operation_id: {_eq: $operation_id}}) {
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


  # 3. Operations Status
  operation(where: {complete: {_eq: false}, deleted: {_eq: false}}) {
    id
    name
    complete
    # Server-computed, and the same number the sidebar badge shows. Deriving it
    # client-side from the event log would let the two disagree.
    alert_count
    banner_text
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
  #
  # A REAL TIME WINDOW, not a row limit wearing a time label.
  #
  # 'limit: N' returns the newest N rows covering an unknown span — on one
  # operation 500 rows spanned 90 days, on a busy one it can be minutes. An
  # axis reading "last 24h" over 20 minutes of data is worse than no chart.
  # So the window is bounded by $since and the axis can state it truthfully.
  #
  # The limit that remains is a safety valve, not the window: it stops a
  # pathological operation from pulling 50k rows every 10 seconds. It is 2000 —
  # stated here because three comments elsewhere used to claim 500, and a
  # comment that lies about query size is worse than no comment.
  task(limit: 2000, order_by: {id: desc},
       where: {operation_id: {_eq: $operation_id},
               status_timestamp_preprocessing: {_gte: $since}}) {
    id
    command_name
    status
    # THREE clocks, and they do not mean what their names suggest.
    #
    # Verified against the live schema and 500 real rows: the real order is
    #   preprocessing -> submitted -> processing -> processed ~= timestamp
    # so 'timestamp' is the row's LAST-UPDATED time, landing within microseconds
    # of 'processed'. It is NOT when the task was issued. Bucketing a "tasks
    # issued over time" chart by 'timestamp' therefore plots completions while
    # claiming to plot submissions, and 'processed - timestamp' came out
    # negative for 100% of paired rows.
    #
    # 'status_timestamp_preprocessing' is the true issue time. Measured against
    # 'processed' over the same 500 rows: 0 negatives, p50 2.45s, p90 9.83s.
    #
    # Both status clocks are NULLABLE — an outstanding task has no 'processed',
    # and every consumer must read that as "still running", never as zero.
    timestamp
    status_timestamp_preprocessing
    status_timestamp_processed
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
  
  # Newest tasks regardless of the analysis window — the activity feed answers
  # "what just happened", which must not go blank because $since is narrow.
  recentTasks: task(limit: 20, order_by: {id: desc}, where: {operation_id: {_eq: $operation_id}}) {
    id
    command_name
    status
    completed
    timestamp
    status_timestamp_preprocessing
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

  # Newest credentials, for the activity feed's "collected" events.
  recentCredentials: credential(limit: 10, order_by: {id: desc},
      where: {deleted: {_eq: false}, operation_id: {_eq: $operation_id}}) {
    id
    account
    realm
    timestamp
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
  credential_aggregate(where: {operation_id: {_eq: $operation_id}}) {
    aggregate {
      count
    }
  }

  # 8. Keylogs count
  keylog_aggregate(where: {operation_id: {_eq: $operation_id}}) {
    aggregate {
      count
    }
  }

  # 9. Downloaded files (supported aggregate)
  filemeta_aggregate(where: {is_download_from_agent: {_eq: true}, deleted: {_eq: false}, operation_id: {_eq: $operation_id}}) {
    aggregate {
      count
    }
  }

  # 10. Uploaded files  
  uploaded_files: filemeta_aggregate(where: {is_screenshot: {_eq: false}, is_download_from_agent: {_eq: false}, deleted: {_eq: false}, is_payload: {_eq: false}, operation_id: {_eq: $operation_id}}) {
    aggregate {
      count
    }
  }

  # ── 12. Mythic's own event log ──────────────────────────────────────
  # The console had no alert surface at all: 5.5k events sat in Mythic with
  # nothing on the dashboard reading them.
  #
  # SCOPED TO warning:true ON PURPOSE. 'resolved' alone is not a triage state
  # here — nobody ever resolves a login record, so counting every unresolved
  # row gives 3,950 on this instance, of which 2,774 are 'auth' and 626 are
  # 'debug'. Filtering to warnings gives 86, which is the number that means
  # something. This matches what EventFeed.tsx already treats as an alert.
  operationeventlog(limit: 40, order_by: {id: desc},
                    where: {deleted: {_eq: false}, warning: {_eq: true}, operation_id: {_eq: $operation_id}}) {
    id
    level
    source
    message
    resolved
    count
    timestamp
  }

  open_alerts: operationeventlog_aggregate(
      where: {deleted: {_eq: false}, warning: {_eq: true}, resolved: {_eq: false}, operation_id: {_eq: $operation_id}}) {
    aggregate {
      count
    }
  }

  # ── 13. What we have left behind ────────────────────────────────────
  # OPSEC footprint. 'needs_cleanup' is the actionable half: artifacts still
  # sitting on someone else's disk.
  taskartifact(limit: 60, order_by: {id: desc}, where: {operation_id: {_eq: $operation_id}}) {
    id
    base_artifact
    artifact_text
    host
    needs_cleanup
    resolved
    timestamp
  }

  taskartifact_aggregate(where: {operation_id: {_eq: $operation_id}}) {
    aggregate {
      count
    }
  }

  cleanup_pending: taskartifact_aggregate(where: {needs_cleanup: {_eq: true}, operation_id: {_eq: $operation_id}}) {
    aggregate {
      count
    }
  }

  # Payloads dropped onto hosts. Nothing in Minerva has ever queried this
  # table, so "what did we leave on disk, and where" had no answer anywhere.
  payloadonhost(limit: 60, order_by: {id: desc}, where: {deleted: {_eq: false}, operation_id: {_eq: $operation_id}}) {
    id
    host
    timestamp
    payload {
      uuid
      payloadtype {
        name
      }
    }
  }

  # NO payloadonhost_aggregate HERE, deliberately.
  #
  # Hasura does not enable aggregations on this table for the 'operator' role,
  # so asking for it makes the WHOLE query fail validation — the dashboard goes
  # blank and reports "Gateway offline". It validates fine against the admin
  # secret, which bypasses permissions, so this is only catchable by testing as
  # the role the app actually uses:
  #   X-Hasura-Role: operator + X-Hasura-current-operation-id
  # The panel counts the rows it fetched and says "recent" rather than implying
  # it knows the total.

  # ── 14. Credential detail ───────────────────────────────────────────
  # There was only a count before, which cannot answer "whose, and when".
  # Bounded slice: the growth line labels the span these rows actually cover.
  credential(limit: 200, order_by: {id: desc}, where: {deleted: {_eq: false}, operation_id: {_eq: $operation_id}}) {
    id
    account
    realm
    type
    timestamp
  }

  # ── 15. How traffic actually moves ──────────────────────────────────
  # P2P edges, with the window each link was alive for.
  callbackgraphedge(limit: 500, order_by: {id: desc}, where: {operation_id: {_eq: $operation_id}}) {
    id
    source_id
    destination_id
    start_timestamp
    end_timestamp
    c2profile {
      name
    }
  }

  # Tunnels, with real byte counters rather than just "a SOCKS exists".
  callbackport(limit: 200, where: {deleted: {_eq: false}, operation_id: {_eq: $operation_id}}) {
    id
    callback_id
    port_type
    local_port
    remote_port
    remote_ip
    bytes_sent
    bytes_received
  }

  # ── 16. MITRE coverage ──────────────────────────────────────────────
  # Which techniques this operation has actually exercised.
  attacktask(limit: 300, order_by: {id: desc}) {
    id
    attack {
      t_num
      name
      tactic
    }
  }

  # 11. Screenshots
  screenshot_aggregate: filemeta_aggregate(where: {is_screenshot: {_eq: true}, deleted: {_eq: false}, operation_id: {_eq: $operation_id}}) {
    aggregate {
      count
    }
  }
}
`;

/**
 * Deep analysis — the whole operation, on demand.
 *
 * The live dashboard polls every 10s, which forces `task(limit: 500)`: an
 * unbounded task query is fine once, and ruinous six times a minute. The cost
 * is that the tempo chart only ever covers whatever those newest 500 rows
 * happen to span, which on a busy operation is a fraction of it.
 *
 * Mythic solves this by not polling at all — its dashboard is a manual
 * "Analyze Operation Data Again" button behind an unbounded query. This is the
 * same idea kept alongside the live view rather than instead of it: the panels
 * stay live, and this fires only when the operator asks for the full history.
 *
 * The projection is deliberately lean — no operator, no callback, no command
 * arguments — because the only thing this feeds is time bucketing. Fetching
 * every task in an operation is affordable exactly and only at this width.
 */
export const GET_DASHBOARD_HISTORY = gql`
query GetMinervaDashboardHistory($operation_id: Int!) {
  task(order_by: {id: asc}, where: {operation_id: {_eq: $operation_id}}) {
    id
    status
    completed
    opsec_pre_blocked
    opsec_pre_bypassed
    opsec_post_blocked
    opsec_post_bypassed
    status_timestamp_preprocessing
    status_timestamp_processed
  }
}
`;
