# Minerva Dashboard — Data Source Reference

Written for planning work on the Minerva C2 dashboard. Everything here was
introspected from a **live Mythic instance** and, where a number appears, counted
rather than estimated. Field names are exact and safe to paste into a query.

- **Backend:** Mythic, exposed as Hasura GraphQL at `/graphql/` (72 queryable tables).
- **Client:** React 19 + Apollo + Tailwind + framer-motion.
- **Dashboard query:** `src/Minerva/lib/api/dashboard.ts`
  (`GET_DASHBOARD_DATA`, polled; `GET_DASHBOARD_HISTORY`, on demand).
- **Panels:** `src/Minerva/components/DashboardCards.tsx`, built on the primitives
  in `src/Minerva/components/Instrument.tsx`.

---

## 1. Read this first — four traps that produce plausible, wrong dashboards

Each of these was hit for real while building the current dashboard. They are
not hypothetical, and none of them announce themselves: every one produces a
chart that looks fine.

### 1.1 `task.timestamp` is NOT when the task was issued

The real order, verified over 500 live rows:

```
status_timestamp_preprocessing  →  submitted  →  processing  →  processed  ≈  timestamp
    13:23:21.583                  .613           23.344         25.885        25.885
```

`timestamp` is the row's **last-updated** time and lands within microseconds of
completion.

- Bucketing a "tasks issued over time" chart by `timestamp` silently plots
  *completions*.
- `processed - timestamp` was **negative for 100%** of paired rows (min −2.9 h).
- Use **`status_timestamp_preprocessing`** for issue time.
  Latency = `status_timestamp_processed - status_timestamp_preprocessing`
  → 0 negatives, p50 2.45 s, p90 9.83 s, p99 193 s.
- Both status clocks are **nullable**. A task with no `processed` is still
  running; it is not a zero-duration task. 83 of 500 were outstanding.

### 1.2 Hasura scopes different tables to *different* operations

Checked against the live metadata:

| Filter | Applies to |
|---|---|
| `operation_id: {_eq: X-Hasura-current-operation-id}` | `callback`, `attacktask`, `disabledcommandsprofile` |
| `operation_id: {_in: X-Hasura-operations}` | **264 other permissions** — every operation the operator belongs to |

Left alone, a dashboard shows callbacks from **one** operation beside tasks,
credentials, artifacts and alerts summed across **all** of them. Measured: the
newest 500 tasks spanned 4 operations (302/129/60/9), credentials 3, artifacts 4.

**Always pass `$operation_id` and filter explicitly** on every table that has the
column. `c2profile`, `attacktask` and `operator` do not have one — c2 profiles
are server-wide, and `attacktask` is already narrowly scoped.

### 1.3 `resolved` is not a triage state for every log level

`operationeventlog` counts, live:

| level | total | unresolved |
|---|---:|---:|
| auth | 2774 | **2774** |
| debug | 626 | **626** |
| agent | 1267 | 48 |
| info | 800 | 454 |
| api | 48 | 48 |

Nobody ever resolves a login record. "Unresolved events" = 3,950, of which ~70%
is login noise — a badge guaranteed to cause alarm fatigue.

**An alert is `warning: true` AND `resolved: false`** → 86. That is the
definition `EventFeed.tsx` already uses. Better still, read
**`operation.alert_count`** — server-computed, and what the sidebar badge shows,
so the two can never disagree.

### 1.4 Row limits are not time windows

`task(limit: N)` returns the newest N rows, which cover an *unknown* span. On one
operation 500 rows spanned 90 days; on a busy one it can be minutes. A chart
axis labelled "24h" over 20 minutes of data is worse than no chart.

Either measure the span the rows actually cover and label that, or bound the
query by time (`where: {status_timestamp_preprocessing: {_gte: $since}}`).

---

## 2. Currently on the dashboard

13 panels. Live query polls every 10 s (`pollInterval`, paused when the page is
hidden); a second on-demand query loads full history.

| Panel | Question | Sources |
|---|---|---|
| Headline numbers | The four figures | `callback`, `task` |
| Operation tempo | Is work flowing, is it healthy | `task` (line chart) |
| Task pipeline | Queue state, latency, contents | `task` (donut + p50/p90 + ranked) |
| Operation | Phase, countdown, who is on it | `operation`, `operator` |
| C2 infrastructure | What is up | `c2profile` |
| Callback surface | How footholds grew, where, as whom | `callback` (`init_callback`) |
| Activity stream | What just happened | `task` |
| Alerts | What needs handling | `operationeventlog`, `operation.alert_count` |
| Footprint | What we left on disk | `taskartifact`, `payloadonhost` |
| Reach | How traffic moves | `callbackgraphedge`, `callbackport` |
| Tradecraft | How it looks to a defender | `attacktask` → `attack` |
| Asset collection | What we have taken | aggregates + `credential` detail |
| Recent payloads | Build state | `payload` |

**Cost, measured:** scoped to one operation, ~180–400 ms and 118–243 KB per poll.
The on-demand history query is 341 tasks / 141 ms / 91 KB and covers 90 days.

---

## 3. Available and unused — ranked by what it would unlock

Row counts are live from one instance; treat them as order-of-magnitude.

| Table | Rows | What it unlocks | Has `operation_id` |
|---|---:|---|:--:|
| `loadedcommands` | 14,810 | Which commands each callback can actually run — capability coverage, and "we cannot do X here" | no |
| `response` | 2,192 | Task output volume, `is_error` detail, `sequence_number` | yes |
| `mythictree` | 2,058 | File and process browser trees per host | yes |
| `filemeta` **detail** | 222 | In-flight transfer progress (`chunks_received` / `total_chunks`), full remote paths, `agent_file_id` for **media previews** | yes |
| `tag` / `tagtype` | 68 / 14 | Operator tagging — Mythic's own dashboard has a Top-10-Tags chart | yes |
| `credential` **text** | 1,248 | Currently only realm/type are shown; `credential_text`, `account`, `comment` are there | yes |
| `attack` | 637 | Technique names, `tactic`, `os` — joins from `attacktask` | no |
| `callbackc2profiles` | 205 | Which callback rides which C2 profile — links infrastructure to nodes | no |
| `operatoroperation` | 41 | Operator ↔ operation assignment and view mode | yes |
| `payload_build_step` | 246 | Per-step build progress with `start_time` / `end_time` | no |

**Empty on this instance (table exists, no data):** `keylog`, `token`,
`callbacktoken`, `eventgroup*` (Eventing workflows), `custombrowser`,
`consuming_container`, `disabledcommandsprofile`, `translationcontainer`.
Plan for them, but do not assume data.

### Gaps with no current answer

- **Collection over time.** `credential`, `filemeta` and `keylog` all *have*
  `timestamp`, but the dashboard only takes `_aggregate.count` for most of them.
  Charting "loot accumulating" needs detail rows, which makes the poll heavier.
- **Callback death.** `callback.dead` and `last_checkin` exist; nothing charts
  attrition. Note the project rule: liveness must use `isCallbackAlive(+active)`,
  never the stale `dead` column.
- **Per-host rollup.** Everything is keyed by callback; there is no host-centric
  view joining callbacks + artifacts + payloads-on-host + files per machine.

---

## 4. What Mythic's own dashboard does differently

Mythic's stock Home page (`MythicReactUI.bak/.../Home/CallbacksCard.js`) is a
useful reference and a useful contrast.

**It has, and Minerva does not:** unbounded task history (no `limit` at all —
affordable because it is a manual "Analyze Operation Data Again" button, not a
poll); all callbacks including dead ones; tags; workflow executions; screenshot
and file **previews**; credential plaintext with copy-to-clipboard; an installed-
services health gauge; layout persisted server-side in operator preferences.

**Minerva has, and it does not** — verified, these tables appear **zero** times
in its dashboard query: `c2profile`, `operationeventlog`, `attacktask`,
`callbackgraphedge`, `payloadonhost`. Plus task latency, threat index, and the
operation countdown.

Independent corroboration worth noting: Mythic also uses
`status_timestamp_preprocessing` rather than `timestamp` for its time bucketing.

---

## 5. Constraints to plan within

1. **Poll cost.** The live query runs every 10 s. Every added detail row is paid
   6×/minute. Prefer `_aggregate` for counts; put anything unbounded behind the
   on-demand query.
2. **Operation scoping is the planner's job**, not Hasura's — see 1.2.
3. **Palette is locked** to `docs/DESIGN_LANGUAGE.md`. `hud-*` tokens are login
   only. Status colour is reserved and must never double as a chart series.
4. **Status is never colour alone.** Measured: accent green vs amber separate by
   ΔE 6.2 under protanopia, and green vs red by **ΔE 1.1** — indistinguishable.
   Every state ships with a word; multi-series charts are told apart by mark
   (fill vs stroke), not hue.
5. **Timestamps are naive UTC strings.** Append `Z` before parsing.
6. **Respect `operator.view_utc_time`** for any displayed clock.

---

## 6. Field reference

Exact names, from live introspection. Scalars only unless noted.

### Currently queried by the dashboard

**`callback`** — 205 rows
- scalars: active, agent_callback_id, architecture, color, crypto_type, current_time, cwd, dead, dec_key_base64, description, display_id, domain, enc_key_base64, eventstepinstance_id, external_ip, extra_info, host, id, impersonation_context, init_callback, integrity_level, ip, last_checkin, locked, locked_operator_id, mythictree_groups_string, operation_id, operator_id, os, pid, process_name, process_short_name, registered_payload_id, sleep_info, timestamp, trigger_on_checkin_after_time, user
- relations: apitokens, c2profileparametersinstances, callbackc2profiles, callbackgraphedges, callbackgraphedgesByDestinationId, callbackports, callbacktokens, dec_key, enc_key, eventstepinstance, loadedcommands, locked_operator

**`task`** — 1017 rows
- scalars: agent_task_id, apitokens_id, callback_id, command_id, command_name, command_payload_type, comment, comment_operator_id, completed, completed_callback_function, completed_callback_function_completed, display_id, display_params, eventstepinstance_id, group_callback_function, group_callback_function_completed, has_intercepted_response, id, interactive_task_type, is_interactive_task, mythic_parsed_params, operation_id, operator_id, opsec_post_blocked, opsec_post_bypass_role, opsec_post_bypass_user_id, opsec_post_bypassed, opsec_post_message, opsec_pre_blocked, opsec_pre_bypass_role, opsec_pre_bypass_user_id, opsec_pre_bypassed, opsec_pre_message, original_params, parameter_group_name, params, parent_task_id, process_at_original_command, response_count, status, status_timestamp_preprocessing, status_timestamp_processed, status_timestamp_processing, status_timestamp_submitted, stderr, stdout, subtask_callback_function, subtask_callback_function_completed, subtask_group_name, tasking_location, timestamp, token_id
- relations: apitoken, apitokens, attacktasks, callback, callbackports, callbacktokens, command, commentOperator, credentials, eventstepinstance, filemeta, keylogs

**`operation`** — 15 rows
- scalars: admin_id, alert_count, apitokens_id, banner_color, banner_text, channel, complete, deleted, id, name, updated_at, webhook
- relations: admin, apitoken, browserscriptoperations, c2profileparametersinstances, callbackgraphedges, callbackports, callbacks, credentials, disabledcommandsprofiles, eventgroupapprovals, eventgroupinstances, eventgroups

**`operator`** — 21 rows
- scalars: account_type, active, admin, apitokens_id, creation_time, current_operation_id, deleted, email, failed_login_count, id, last_failed_login_timestamp, last_login, preferences, salt, secrets, username, view_utc_time
- relations: apitoken, apitokens, apitokensByCreatedBy, browserscripts, callbacks, callbacksByLockedOperatorId, credentials, eventgroupapprovals, eventgroupinstances, eventgroupinstancesByCancelledBy, eventgroups, eventstepinstances

**`c2profile`** — 7 rows
- scalars: author, container_running, creation_time, deleted, description, has_logo, id, is_p2p, is_server_routed, name, running, semver
- relations: c2profileparameters, c2profileparametersinstances, callbackc2profiles, callbackgraphedges, payloadc2profiles, payloadtypec2profiles

**`payload`** — 71 rows
- scalars: apitokens_id, auto_generated, build_container, build_message, build_phase, build_stderr, build_stdout, callback_alert, callback_allowed, creation_time, deleted, description, eventstepinstance_id, file_id, id, operation_id, operator_id, os, payload_type_id, payload_type_semver, task_id, timestamp, uuid, wrapped_payload_id
- relations: apitoken, apitokens, buildparameterinstances, c2profileparametersinstances, callbacks, eventstepinstance, filemetum, operation, operator, payload, payload_build_steps, payloadc2profiles

**`operationeventlog`** — 5515 rows
- scalars: apitokens_id, count, deleted, id, level, message, operation_id, operator_id, resolved, source, timestamp, warning
- relations: apitoken, operation, operator

**`taskartifact`** — 391 rows
- scalars: apitokens_id, artifact_text, base_artifact, eventstepinstance_id, host, id, needs_cleanup, operation_id, resolved, task_id, timestamp, updated_at
- relations: apitoken, artifact_raw, eventstepinstance, operation, tags, task

**`payloadonhost`** — 218 rows
- scalars: deleted, host, id, operation_id, payload_id, task_id, timestamp
- relations: operation, payload, task

**`credential`** — 1248 rows
- scalars: account, apitokens_id, comment, credential_text, deleted, id, metadata, operation_id, operator_id, realm, task_id, timestamp, type
- relations: apitoken, credential_raw, operation, operator, tags, task

**`callbackgraphedge`** — 242 rows
- scalars: apitokens_id, c2_profile_id, destination_id, end_timestamp, id, metadata, operation_id, source_id, start_timestamp, updated_at
- relations: apitoken, c2profile, destination, operation, source

**`callbackport`** — 68 rows
- scalars: bytes_received, bytes_sent, callback_id, deleted, id, local_port, operation_id, password, port_type, remote_ip, remote_port, task_id, updated_at, username
- relations: callback, operation, task

**`attacktask`** — 1556 rows
- scalars: attack_id, id, task_id
- relations: attack, task


### Available, not on the dashboard

**`loadedcommands`** — 14810 rows
- scalars: apitokens_id, callback_id, command_id, id, operator_id, timestamp, version
- relations: apitoken, callback, command, operator

**`response`** — 2192 rows
- scalars: apitokens_id, eventstepinstance_id, id, is_error, operation_id, response_escape, response_text, sequence_number, task_id, timestamp
- relations: apitoken, eventstepinstance, operation, response_raw, tags, task

**`mythictree`** — 2058 rows
- scalars: apitokens_id, callback_id, can_have_children, comment, deleted, display_path_text, full_path_text, has_children, host, id, metadata, name_text, operation_id, os, parent_path_text, success, task_id, timestamp, tree_type
- relations: apitoken, callback, display_path, filemeta, full_path, name, operation, parent_path, tags, task

**`filemeta`** — 222 rows
- scalars: agent_file_id, apitokens_id, chunk_size, chunks_received, comment, complete, copy_of_file_id, delete_after_fetch, deleted, eventgroup_id, eventstepinstance_id, filename_text, filename_utf8, full_remote_path_text, full_remote_path_utf8, host, id, is_download_from_agent, is_payload, is_screenshot, md5, mythictree_id, operation_id, operator_id, path, received_chunk_ids, sha1, size, task_id, timestamp, total_chunks
- relations: apitoken, copies_of_file, copy_of_file, eventgroup, eventgroups, eventstepinstance, filename, full_remote_path, mythictree, operation, operator, payloads

**`tag`** — 68 rows
- scalars: apitokens_id, callback_id, credential_id, data, eventstepinstance_id, filemeta_id, id, keylog_id, mythictree_id, operation_id, payload_id, response_id, source, tagtype_id, task_id, taskartifact_id, url
- relations: apitoken, callback, credential, eventstepinstance, filemetum, keylog, mythictree, operation, payload, response, tagtype, task

**`tagtype`** — 14 rows
- scalars: apitokens_id, color, description, eventstepinstance_id, id, name, operation_id
- relations: apitoken, eventstepinstance, operation, tags

**`attack`** — 637 rows
- scalars: id, name, os, t_num, tactic
- relations: attackcommands, attacktasks

**`callbackc2profiles`** — 205 rows
- scalars: c2_profile_id, callback_id, id
- relations: c2profile, callback

**`operatoroperation`** — 41 rows
- scalars: apitokens_id, base_disabled_commands_id, id, operation_id, operator_id, timestamp, view_mode
- relations: apitoken, disabledcommandsprofile, operation, operator

**`command`** — 155 rows
- scalars: attributes, author, cmd, creation_time, deleted, description, help_cmd, id, needs_admin, payload_type_id, script_only, supported_ui_features, version
- relations: attackcommands, browserscripts, commandparameters, disabledcommandsprofiles, loadedcommands, payloadcommands, payloadtype, tasks

**`browserscript`** — 240 rows
- scalars: active, author, command_id, container_version, container_version_author, creation_time, for_new_ui, id, operator_id, payload_type_id, script, user_modified
- relations: browserscriptoperations, command, operator, payloadtype

