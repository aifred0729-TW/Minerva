import { gql } from '@apollo/client';

/*
 * Every root selection below is scoped with `operation_id: {_eq: $operation_id}`.
 *
 * Mythic's Hasura permission for operator AND spectator on task / filemeta /
 * credential / payload / keylog / tag / callbackport / taskartifact / token /
 * response is `operation_id: _in: X-Hasura-operations` — every operation the
 * operator is a MEMBER of, not the one they are currently working. Only
 * `callback` is scoped to `_eq: X-Hasura-current-operation-id`, which is why the
 * callback searches need no predicate.
 *
 * Without the predicate, searching credentials on a consultancy team server
 * returned every engagement the operator belongs to — measured at 853 rows
 * across 11 operations against 14 in the current one.
 *
 * NOT scoped: SEARCH_BROWSERS_* (mythictree). That table is not present in this
 * Mythic's tracked Hasura metadata, so its row filter could not be verified;
 * scoping it blind risked breaking file-browser search. Verify and scope it.
 */

export const SEARCH_TASKS_TAG = gql`
  query SearchTasksByTag($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!){
    tag(where: {operation_id:{_eq:$operation_id}, tagtype: {name: {_ilike: $search}}, task_id: {_is_null: false}}, order_by: {id: desc}, offset: $offset, limit: $limit) {
      id
      task_id
      data
      tagtype { name color }
      task {
        id display_id command_name display_params status comment
        timestamp
        operator { username }
        callback { id display_id host }
      }
    }
    tag_aggregate(where: {operation_id:{_eq:$operation_id}, tagtype: {name: {_ilike: $search}}, task_id: {_is_null: false}}) {
      aggregate { count }
    }
  }
`;

export const SEARCH_TASKS_CALLBACK_ID = gql`
  query SearchTasksByCallbackID($search: Int!, $offset: Int!, $limit: Int!, $operation_id: Int!){
    task(where: {operation_id:{_eq:$operation_id}, callback: {display_id: {_eq: $search}}}, order_by: {id: desc}, offset: $offset, limit: $limit) {
      id display_id command_name display_params original_params status comment
      timestamp
      operator { username }
      callback { id display_id host }
    }
    task_aggregate(where: {operation_id:{_eq:$operation_id}, callback: {display_id: {_eq: $search}}}) {
      aggregate { count }
    }
  }
`;

export const SEARCH_TASKS_CALLBACK_GROUP = gql`
  query SearchTasksByCallbackGroup($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!){
    task(where: {operation_id:{_eq:$operation_id}, callback: {mythictree_groups: {_contains: [$search]}}}, order_by: {id: desc}, offset: $offset, limit: $limit) {
      id display_id command_name display_params original_params status comment
      timestamp
      operator { username }
      callback { id display_id host }
    }
    task_aggregate(where: {operation_id:{_eq:$operation_id}, callback: {mythictree_groups: {_contains: [$search]}}}) {
      aggregate { count }
    }
  }
`;

export const SEARCH_CALLBACKS_AGENT = gql`
  query SearchCallbacksByAgent($search: String!, $offset: Int!, $limit: Int!){
    callback(where: {payload: {payloadtype: {name: {_ilike: $search}}}}, order_by: {id: desc}, offset: $offset, limit: $limit) {
      id display_id active host user ip description domain os architecture
      payload { payloadtype { name } }
      last_checkin init_callback pid
    }
    callback_aggregate(where: {payload: {payloadtype: {name: {_ilike: $search}}}}) {
      aggregate { count }
    }
  }
`;

export const SEARCH_CALLBACKS_OS = gql`
  query SearchCallbacksByOS($search: String!, $offset: Int!, $limit: Int!){
    callback(where: {os: {_ilike: $search}}, order_by: {id: desc}, offset: $offset, limit: $limit) {
      id display_id active host user ip description domain os architecture
      payload { payloadtype { name } }
      last_checkin init_callback pid
    }
    callback_aggregate(where: {os: {_ilike: $search}}) {
      aggregate { count }
    }
  }
`;

export const SEARCH_CALLBACKS_ARCH = gql`
  query SearchCallbacksByArch($search: String!, $offset: Int!, $limit: Int!){
    callback(where: {architecture: {_ilike: $search}}, order_by: {id: desc}, offset: $offset, limit: $limit) {
      id display_id active host user ip description domain os architecture
      payload { payloadtype { name } }
      last_checkin init_callback pid
    }
    callback_aggregate(where: {architecture: {_ilike: $search}}) {
      aggregate { count }
    }
  }
`;

// ─── Credential Management from Search ────────────────

// ── Queries from Search.tsx ───────────────────────────────────────────────────

// Tasks
export const SEARCH_TASKS_PARAMS = gql`
query SearchTasksParams($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    task(distinct_on: id, where: {operation_id:{_eq:$operation_id}, _or: [{original_params:{_ilike:$search}},{display_params:{_ilike:$search}},{params:{_ilike:$search}}]}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(distinct_on: id, where: {operation_id:{_eq:$operation_id}, _or: [{original_params:{_ilike:$search}},{display_params:{_ilike:$search}},{params:{_ilike:$search}}]}) { aggregate { count } }
}`;
export const SEARCH_TASKS_RESPONSE = gql`
query SearchTasksResponse($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    task(distinct_on: id, where: {operation_id:{_eq:$operation_id}, responses:{response_escape:{_ilike:$search}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(distinct_on: id, where: {operation_id:{_eq:$operation_id}, responses:{response_escape:{_ilike:$search}}}) { aggregate { count } }
}`;
export const SEARCH_TASKS_COMMAND = gql`
query SearchTasksCommand($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    task(where: {operation_id:{_eq:$operation_id}, command_name:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(where: {operation_id:{_eq:$operation_id}, command_name:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_TASKS_COMMENT = gql`
query SearchTasksComment($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    task(where: {operation_id:{_eq:$operation_id}, comment:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(where: {operation_id:{_eq:$operation_id}, comment:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_TASKS_HOST = gql`
query SearchTasksHost($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    task(where: {operation_id:{_eq:$operation_id}, callback: {host: {_ilike: $search}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(where: {operation_id:{_eq:$operation_id}, callback: {host: {_ilike: $search}}}) { aggregate { count } }
}`;
export const SEARCH_TASKS_STATUS = gql`
query SearchTasksStatus($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    task(where: {operation_id:{_eq:$operation_id}, status: {_ilike: $search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(where: {operation_id:{_eq:$operation_id}, status: {_ilike: $search}}) { aggregate { count } }
}`;
export const SEARCH_TASKS_OPERATOR = gql`
query SearchTasksOperator($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    task(where: {operation_id:{_eq:$operation_id}, operator: {username: {_ilike: $search}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(where: {operation_id:{_eq:$operation_id}, operator: {username: {_ilike: $search}}}) { aggregate { count } }
}`;

// Callbacks
export const SEARCH_CALLBACKS_HOST = gql`
query SearchCallbacksHost($search: String!, $offset: Int!, $limit: Int!) {
    callback(where:{host:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{host:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_CALLBACKS_USER = gql`
query SearchCallbacksUser($search: String!, $offset: Int!, $limit: Int!) {
    callback(where:{user:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{user:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_CALLBACKS_DOMAIN = gql`
query SearchCallbacksDomain($search: String!, $offset: Int!, $limit: Int!) {
    callback(where:{domain:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{domain:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_CALLBACKS_IP = gql`
query SearchCallbacksIP($search: String!, $offset: Int!, $limit: Int!) {
    callback(where:{_or:[{ip:{_ilike:$search}},{external_ip:{_ilike:$search}}]}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{_or:[{ip:{_ilike:$search}},{external_ip:{_ilike:$search}}]}) { aggregate { count } }
}`;
export const SEARCH_CALLBACKS_DESC = gql`
query SearchCallbacksDesc($search: String!, $offset: Int!, $limit: Int!) {
    callback(where:{description:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{description:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_CALLBACKS_PID = gql`
query SearchCallbacksPID($search: Int!, $offset: Int!, $limit: Int!) {
    callback(where:{pid:{_eq:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{pid:{_eq:$search}}) { aggregate { count } }
}`;
export const SEARCH_CALLBACKS_GROUP = gql`
query SearchCallbacksGroup($search: String!, $offset: Int!, $limit: Int!) {
    callback(where:{mythictree_groups:{_contains:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{mythictree_groups:{_contains:$search}}) { aggregate { count } }
}`;
export const SEARCH_CALLBACKS_DISPLAY_ID = gql`
query SearchCallbacksDisplayId($search: Int!, $offset: Int!, $limit: Int!) {
    callback(where:{display_id:{_eq:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{display_id:{_eq:$search}}) { aggregate { count } }
}`;

// Files
export const FILE_FIELDS_FRAGMENT = `
    id agent_file_id filename_text full_remote_path_text comment
    is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host
    task { id callback { display_id } }
`;
export const SEARCH_FILES_DOWNLOADS = gql`
query SearchFilesDownloads($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    filemeta(where:{operation_id:{_eq:$operation_id}, _or:[{filename_text:{_ilike:$search}},{full_remote_path_text:{_ilike:$search}},{comment:{_ilike:$search}}], is_download_from_agent:{_eq:true}, is_screenshot:{_eq:false}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{operation_id:{_eq:$operation_id}, _or:[{filename_text:{_ilike:$search}},{full_remote_path_text:{_ilike:$search}},{comment:{_ilike:$search}}], is_download_from_agent:{_eq:true}, is_screenshot:{_eq:false}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_FILES_UPLOADS = gql`
query SearchFilesUploads($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    filemeta(where:{operation_id:{_eq:$operation_id}, _or:[{filename_text:{_ilike:$search}},{full_remote_path_text:{_ilike:$search}},{comment:{_ilike:$search}}], is_download_from_agent:{_eq:false}, is_screenshot:{_eq:false}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{operation_id:{_eq:$operation_id}, _or:[{filename_text:{_ilike:$search}},{full_remote_path_text:{_ilike:$search}},{comment:{_ilike:$search}}], is_download_from_agent:{_eq:false}, is_screenshot:{_eq:false}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_FILES_SCREENSHOTS = gql`
query SearchFilesScreenshots($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    filemeta(where:{operation_id:{_eq:$operation_id}, _or:[{filename_text:{_ilike:$search}},{full_remote_path_text:{_ilike:$search}},{comment:{_ilike:$search}}], is_screenshot:{_eq:true}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{operation_id:{_eq:$operation_id}, _or:[{filename_text:{_ilike:$search}},{full_remote_path_text:{_ilike:$search}},{comment:{_ilike:$search}}], is_screenshot:{_eq:true}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_FILES_FILENAME = gql`
query SearchFilesFilename($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    filemeta(where:{operation_id:{_eq:$operation_id}, filename_text:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host md5 sha1
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{operation_id:{_eq:$operation_id}, filename_text:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_FILES_HASH = gql`
query SearchFilesHash($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    filemeta(where:{operation_id:{_eq:$operation_id}, _or:[{md5:{_ilike:$search}},{sha1:{_ilike:$search}}], deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host md5 sha1
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{operation_id:{_eq:$operation_id}, _or:[{md5:{_ilike:$search}},{sha1:{_ilike:$search}}], deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_FILES_COMMENT = gql`
query SearchFilesComment($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    filemeta(where:{operation_id:{_eq:$operation_id}, comment:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{operation_id:{_eq:$operation_id}, comment:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_FILES_TAG = gql`
query SearchFilesTag($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    filemeta(where:{operation_id:{_eq:$operation_id}, tags:{tagtype:{name:{_ilike:$search}}}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{operation_id:{_eq:$operation_id}, tags:{tagtype:{name:{_ilike:$search}}}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_FILES_UUID = gql`
query SearchFilesUUID($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    filemeta(where:{operation_id:{_eq:$operation_id}, agent_file_id:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{operation_id:{_eq:$operation_id}, agent_file_id:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_FILES_FILEBROWSER = gql`
query SearchFilesFileBrowser($search: String!, $offset: Int!, $limit: Int!) {
    mythictree(where:{tree_type:{_eq:"file"}, full_path_text:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id name_text full_path_text host comment metadata timestamp can_have_children
        task { id callback { display_id } }
    }
    mythictree_aggregate(where:{tree_type:{_eq:"file"}, full_path_text:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_FILES_EVENTING = gql`
query SearchFilesEventing($search: String!, $offset: Int!, $limit: Int!) {
    eventstepinstance(where:{environment:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id environment action_data created_at
        eventstep { name action }
        eventgroup { name }
    }
    eventstepinstance_aggregate(where:{environment:{_ilike:$search}}) { aggregate { count } }
}`;

// Credentials
export const SEARCH_CREDS_ACCOUNT = gql`
query SearchCredsAccount($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    credential(where:{operation_id:{_eq:$operation_id}, account:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id account realm type credential_text comment timestamp task_id
        operator { username }
    }
    credential_aggregate(where:{operation_id:{_eq:$operation_id}, account:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_CREDS_REALM = gql`
query SearchCredsRealm($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    credential(where:{operation_id:{_eq:$operation_id}, realm:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id account realm type credential_text comment timestamp task_id
        operator { username }
    }
    credential_aggregate(where:{operation_id:{_eq:$operation_id}, realm:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_CREDS_CREDENTIAL = gql`
query SearchCredsCredential($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    credential(where:{operation_id:{_eq:$operation_id}, credential_text:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id account realm type credential_text comment timestamp task_id
        operator { username }
    }
    credential_aggregate(where:{operation_id:{_eq:$operation_id}, credential_text:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_CREDS_COMMENT = gql`
query SearchCredsComment($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    credential(where:{operation_id:{_eq:$operation_id}, comment:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id account realm type credential_text comment timestamp task_id
        operator { username }
    }
    credential_aggregate(where:{operation_id:{_eq:$operation_id}, comment:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_CREDS_TAG = gql`
query SearchCredsTag($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    credential(where:{operation_id:{_eq:$operation_id}, tags:{tagtype:{name:{_ilike:$search}}}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id account realm type credential_text comment timestamp task_id
        operator { username }
    }
    credential_aggregate(where:{operation_id:{_eq:$operation_id}, tags:{tagtype:{name:{_ilike:$search}}}, deleted:{_eq:false}}) { aggregate { count } }
}`;

// Artifacts
export const SEARCH_ARTIFACTS_ARTIFACT = gql`
query SearchArtifactsArtifact($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    taskartifact(where:{operation_id:{_eq:$operation_id}, artifact_text:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id artifact_text host timestamp base_artifact
        task { id command_name callback { display_id } }
    }
    taskartifact_aggregate(where:{operation_id:{_eq:$operation_id}, artifact_text:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_ARTIFACTS_HOST = gql`
query SearchArtifactsHost($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    taskartifact(where:{operation_id:{_eq:$operation_id}, host:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id artifact_text host timestamp base_artifact
        task { id command_name callback { display_id } }
    }
    taskartifact_aggregate(where:{operation_id:{_eq:$operation_id}, host:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_ARTIFACTS_TYPE = gql`
query SearchArtifactsType($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    taskartifact(where:{operation_id:{_eq:$operation_id}, base_artifact:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id artifact_text host timestamp base_artifact
        task { id command_name callback { display_id } }
    }
    taskartifact_aggregate(where:{operation_id:{_eq:$operation_id}, base_artifact:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_ARTIFACTS_COMMAND = gql`
query SearchArtifactsCommand($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    taskartifact(where:{operation_id:{_eq:$operation_id}, task:{command_name:{_ilike:$search}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id artifact_text host timestamp base_artifact
        task { id command_name callback { display_id } operator { username } }
    }
    taskartifact_aggregate(where:{operation_id:{_eq:$operation_id}, task:{command_name:{_ilike:$search}}}) { aggregate { count } }
}`;
export const SEARCH_ARTIFACTS_TASK = gql`
query SearchArtifactsTask($search: Int!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    taskartifact(where:{operation_id:{_eq:$operation_id}, task_id:{_eq:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id artifact_text host timestamp base_artifact
        task { id command_name callback { display_id } operator { username } }
    }
    taskartifact_aggregate(where:{operation_id:{_eq:$operation_id}, task_id:{_eq:$search}}) { aggregate { count } }
}`;
export const SEARCH_ARTIFACTS_CALLBACK = gql`
query SearchArtifactsCallback($search: Int!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    taskartifact(where:{operation_id:{_eq:$operation_id}, task:{callback:{display_id:{_eq:$search}}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id artifact_text host timestamp base_artifact
        task { id command_name callback { display_id } operator { username } }
    }
    taskartifact_aggregate(where:{operation_id:{_eq:$operation_id}, task:{callback:{display_id:{_eq:$search}}}}) { aggregate { count } }
}`;
export const SEARCH_ARTIFACTS_OPERATOR = gql`
query SearchArtifactsOperator($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    taskartifact(where:{operation_id:{_eq:$operation_id}, task:{operator:{username:{_ilike:$search}}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id artifact_text host timestamp base_artifact
        task { id command_name callback { display_id } operator { username } }
    }
    taskartifact_aggregate(where:{operation_id:{_eq:$operation_id}, task:{operator:{username:{_ilike:$search}}}}) { aggregate { count } }
}`;

// Keylogs
export const SEARCH_KEYLOGS_KEYSTROKE = gql`
query SearchKeylogsKeystroke($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    keylog(where:{operation_id:{_eq:$operation_id}, keystrokes_text:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id keystrokes_text window user timestamp
        task { callback { display_id host } }
    }
    keylog_aggregate(where:{operation_id:{_eq:$operation_id}, keystrokes_text:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_KEYLOGS_USER = gql`
query SearchKeylogsUser($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    keylog(where:{operation_id:{_eq:$operation_id}, user:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id keystrokes_text window user timestamp
        task { callback { display_id host } }
    }
    keylog_aggregate(where:{operation_id:{_eq:$operation_id}, user:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_KEYLOGS_PROGRAM = gql`
query SearchKeylogsProgram($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    keylog(where:{operation_id:{_eq:$operation_id}, window:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id keystrokes_text window user timestamp
        task { callback { display_id host } }
    }
    keylog_aggregate(where:{operation_id:{_eq:$operation_id}, window:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_KEYLOGS_HOST = gql`
query SearchKeylogsHost($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    keylog(where:{operation_id:{_eq:$operation_id}, task:{callback:{host:{_ilike:$search}}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id keystrokes_text window user timestamp
        task { callback { display_id host } }
    }
    keylog_aggregate(where:{operation_id:{_eq:$operation_id}, task:{callback:{host:{_ilike:$search}}}}) { aggregate { count } }
}`;
export const SEARCH_KEYLOGS_UNIQUE_USER = gql`
query SearchKeylogsUniqueUser($offset: Int!, $limit: Int!) {
    keylog(distinct_on: user, order_by: [{user: asc}, {id: desc}], limit: $limit, offset: $offset) {
        id keystrokes_text window user timestamp
        task { callback { display_id host } }
    }
    keylog_aggregate(distinct_on: user) { aggregate { count } }
}`;
export const SEARCH_KEYLOGS_UNIQUE_PROGRAM = gql`
query SearchKeylogsUniqueProgram($offset: Int!, $limit: Int!) {
    keylog(distinct_on: window, order_by: [{window: asc}, {id: desc}], limit: $limit, offset: $offset) {
        id keystrokes_text window user timestamp
        task { callback { display_id host } }
    }
    keylog_aggregate(distinct_on: window) { aggregate { count } }
}`;

// Payloads
export const SEARCH_PAYLOADS_FILENAME = gql`
query SearchPayloadsFilename($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    payload(where:{operation_id:{_eq:$operation_id}, filemetum:{filename_text:{_ilike:$search}}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id uuid description build_phase timestamp
        payloadtype { name }
        filemetum { filename_text }
    }
    payload_aggregate(where:{operation_id:{_eq:$operation_id}, filemetum:{filename_text:{_ilike:$search}}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_PAYLOADS_DESC = gql`
query SearchPayloadsDesc($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    payload(where:{operation_id:{_eq:$operation_id}, description:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id uuid description build_phase timestamp
        payloadtype { name }
        filemetum { filename_text }
    }
    payload_aggregate(where:{operation_id:{_eq:$operation_id}, description:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_PAYLOADS_UUID = gql`
query SearchPayloadsUUID($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    payload(where:{operation_id:{_eq:$operation_id}, uuid:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id uuid description build_phase timestamp
        payloadtype { name }
        filemetum { filename_text }
    }
    payload_aggregate(where:{operation_id:{_eq:$operation_id}, uuid:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_PAYLOADS_C2PARAM = gql`
query SearchPayloadsC2Param($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    payload(where:{operation_id:{_eq:$operation_id}, payloadc2profiles:{c2profileparametersinstances:{value:{_ilike:$search}}}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id uuid description build_phase timestamp
        payloadtype { name }
        filemetum { filename_text }
        payloadc2profiles { c2profile { name } c2profileparametersinstances { value } }
    }
    payload_aggregate(where:{operation_id:{_eq:$operation_id}, payloadc2profiles:{c2profileparametersinstances:{value:{_ilike:$search}}}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_PAYLOADS_BUILDPARAM = gql`
query SearchPayloadsBuildParam($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    payload(where:{operation_id:{_eq:$operation_id}, buildparameterinstances:{value:{_ilike:$search}}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id uuid description build_phase timestamp
        payloadtype { name }
        filemetum { filename_text }
        buildparameterinstances { value buildparameter { name } }
    }
    payload_aggregate(where:{operation_id:{_eq:$operation_id}, buildparameterinstances:{value:{_ilike:$search}}, deleted:{_eq:false}}) { aggregate { count } }
}`;

// Tokens
export const SEARCH_TOKENS_USER = gql`
query SearchTokensUser($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    token(where:{task:{callback:{operation_id:{_eq:$operation_id}}}, _or:[{user:{_ilike:$search}},{groups:{_ilike:$search}}], deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id token_id user timestamp
        task { callback { display_id host } }
    }
    token_aggregate(where:{task:{callback:{operation_id:{_eq:$operation_id}}}, _or:[{user:{_ilike:$search}},{groups:{_ilike:$search}}], deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_TOKENS_HOST = gql`
query SearchTokensHost($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    token(where:{task:{callback:{operation_id:{_eq:$operation_id}}}, host:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id token_id user timestamp
        task { callback { display_id host } }
    }
    token_aggregate(where:{task:{callback:{operation_id:{_eq:$operation_id}}}, host:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
export const SEARCH_TOKENS_SID = gql`
query SearchTokensSID($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    token(where:{task:{callback:{operation_id:{_eq:$operation_id}}}, token_id:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id token_id user timestamp
        task { callback { display_id host } }
    }
    token_aggregate(where:{task:{callback:{operation_id:{_eq:$operation_id}}}, token_id:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;

// Processes
export const SEARCH_PROCESSES_NAME = gql`
query SearchProcessesName($search: String!, $offset: Int!, $limit: Int!) {
    mythictree(where:{tree_type:{_eq:"process"}, name_text:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id name_text full_path_text host metadata timestamp
        task { callback { display_id } }
    }
    mythictree_aggregate(where:{tree_type:{_eq:"process"}, name_text:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_PROCESSES_PID = gql`
query SearchProcessesPID($search: String!, $offset: Int!, $limit: Int!) {
    mythictree(where:{tree_type:{_eq:"process"}, full_path_text:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id name_text full_path_text host metadata timestamp
        task { callback { display_id } }
    }
    mythictree_aggregate(where:{tree_type:{_eq:"process"}, full_path_text:{_ilike:$search}}) { aggregate { count } }
}`;

// SOCKS / Proxies
export const SEARCH_SOCKS_IP = gql`
query SearchSocksIP($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    callbackport(where:{operation_id:{_eq:$operation_id}, _or:[{local_port:{_eq:0}},{local_port:{_gt:0}}], callback:{ip:{_ilike:$search}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id local_port port_type bytes_sent bytes_received
        callback { id display_id host ip user }
    }
    callbackport_aggregate(where:{operation_id:{_eq:$operation_id}, _or:[{local_port:{_eq:0}},{local_port:{_gt:0}}], callback:{ip:{_ilike:$search}}}) { aggregate { count } }
}`;
export const SEARCH_SOCKS_PORT = gql`
query SearchSocksPort($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    callbackport(where:{operation_id:{_eq:$operation_id}, local_port:{_eq:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id local_port port_type bytes_sent bytes_received
        callback { id display_id host ip user }
    }
    callbackport_aggregate(where:{operation_id:{_eq:$operation_id}, local_port:{_eq:$search}}) { aggregate { count } }
}`;
export const SUBSCRIBE_SOCKS = gql`
subscription SubscribeSocks($operation_id: Int!) {
    callbackport(where: {operation_id:{_eq:$operation_id}, deleted: {_eq: false}}, order_by: {id: desc}, limit: 100) {
        id local_port port_type bytes_sent bytes_received
        callback { id display_id host ip user }
    }
}`;

// Tags
export const SEARCH_TAGS_TAG = gql`
query SearchTagsTag($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    tag(where:{operation_id:{_eq:$operation_id}, _or:[{data:{_ilike:$search}},{tagtype:{name:{_ilike:$search}}}]}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id data url source
        tagtype { id name color }
    }
    tag_aggregate(where:{operation_id:{_eq:$operation_id}, _or:[{data:{_ilike:$search}},{tagtype:{name:{_ilike:$search}}}]}) { aggregate { count } }
}`;
export const SEARCH_TAGS_SOURCE = gql`
query SearchTagsSource($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    tag(where:{operation_id:{_eq:$operation_id}, source:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id data url source
        tagtype { id name color }
    }
    tag_aggregate(where:{operation_id:{_eq:$operation_id}, source:{_ilike:$search}}) { aggregate { count } }
}`;

// Browsers
export const SEARCH_BROWSERS_PATH = gql`
query SearchBrowsersPath($search: String!, $offset: Int!, $limit: Int!) {
    mythictree(where:{tree_type:{_eq:"file"}, full_path_text:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id name_text full_path_text host comment metadata timestamp
        task { callback { display_id } }
    }
    mythictree_aggregate(where:{tree_type:{_eq:"file"}, full_path_text:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_BROWSERS_HOST = gql`
query SearchBrowsersHost($search: String!, $offset: Int!, $limit: Int!) {
    mythictree(where:{tree_type:{_eq:"file"}, host:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id name_text full_path_text host comment metadata timestamp
        task { callback { display_id } }
    }
    mythictree_aggregate(where:{tree_type:{_eq:"file"}, host:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_BROWSERS_NAME = gql`
query SearchBrowsersName($search: String!, $offset: Int!, $limit: Int!) {
    mythictree(where:{tree_type:{_eq:"file"}, name_text:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id name_text full_path_text host comment metadata timestamp
        task { callback { display_id } }
    }
    mythictree_aggregate(where:{tree_type:{_eq:"file"}, name_text:{_ilike:$search}}) { aggregate { count } }
}`;
export const SEARCH_BROWSERS_COMMENT = gql`
query SearchBrowsersComment($search: String!, $offset: Int!, $limit: Int!) {
    mythictree(where:{tree_type:{_eq:"file"}, comment:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id name_text full_path_text host comment metadata timestamp
        task { callback { display_id } }
    }
    mythictree_aggregate(where:{tree_type:{_eq:"file"}, comment:{_ilike:$search}}) { aggregate { count } }
}`;

// Task responses
export const GET_TASK_RESPONSES = gql`
query GetTaskResponses($task_id: Int!, $operation_id: Int!) {
    response(where: {task:{callback:{operation_id:{_eq:$operation_id}}}, task_id: {_eq: $task_id}}, order_by: {id: asc}, limit: 50) {
        id response_escape timestamp
    }
}`;

// Interactive Tasks
const INTERACTIVE_TASK_FIELDS = `
    id display_id command_name display_params original_params status comment timestamp
    interactive_task_type
    operator { username }
    callback { id display_id host }
`;
export const SEARCH_INTERACTIVE_PARAMS = gql`
query SearchInteractiveParams($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    task(where: {operation_id:{_eq:$operation_id}, is_interactive_task: {_eq: true}, _or: [{original_params: {_ilike: $search}}, {display_params: {_ilike: $search}}]}, order_by: {id: desc}, limit: $limit, offset: $offset) {
        ${INTERACTIVE_TASK_FIELDS}
    }
    task_aggregate(where: {operation_id:{_eq:$operation_id}, is_interactive_task: {_eq: true}, _or: [{original_params: {_ilike: $search}}, {display_params: {_ilike: $search}}]}) { aggregate { count } }
}`;
export const SEARCH_INTERACTIVE_COMMAND = gql`
query SearchInteractiveCommand($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    task(where: {operation_id:{_eq:$operation_id}, is_interactive_task: {_eq: true}, command_name: {_ilike: $search}}, order_by: {id: desc}, limit: $limit, offset: $offset) {
        ${INTERACTIVE_TASK_FIELDS}
    }
    task_aggregate(where: {operation_id:{_eq:$operation_id}, is_interactive_task: {_eq: true}, command_name: {_ilike: $search}}) { aggregate { count } }
}`;
export const SEARCH_INTERACTIVE_HOST = gql`
query SearchInteractiveHost($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    task(where: {operation_id:{_eq:$operation_id}, is_interactive_task: {_eq: true}, callback: {host: {_ilike: $search}}}, order_by: {id: desc}, limit: $limit, offset: $offset) {
        ${INTERACTIVE_TASK_FIELDS}
    }
    task_aggregate(where: {operation_id:{_eq:$operation_id}, is_interactive_task: {_eq: true}, callback: {host: {_ilike: $search}}}) { aggregate { count } }
}`;
export const SEARCH_INTERACTIVE_OPERATOR = gql`
query SearchInteractiveOperator($search: String!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    task(where: {operation_id:{_eq:$operation_id}, is_interactive_task: {_eq: true}, operator: {username: {_ilike: $search}}}, order_by: {id: desc}, limit: $limit, offset: $offset) {
        ${INTERACTIVE_TASK_FIELDS}
    }
    task_aggregate(where: {operation_id:{_eq:$operation_id}, is_interactive_task: {_eq: true}, operator: {username: {_ilike: $search}}}) { aggregate { count } }
}`;
export const SEARCH_INTERACTIVE_TYPE = gql`
query SearchInteractiveType($search: Int!, $offset: Int!, $limit: Int!, $operation_id: Int!) {
    task(where: {operation_id:{_eq:$operation_id}, is_interactive_task: {_eq: true}, interactive_task_type: {_eq: $search}}, order_by: {id: desc}, limit: $limit, offset: $offset) {
        ${INTERACTIVE_TASK_FIELDS}
    }
    task_aggregate(where: {operation_id:{_eq:$operation_id}, is_interactive_task: {_eq: true}, interactive_task_type: {_eq: $search}}) { aggregate { count } }
}`;
