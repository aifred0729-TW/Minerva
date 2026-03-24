import React, { useState, useEffect, useCallback } from 'react';
import { useLazyQuery, useSubscription, gql } from '@apollo/client';
import { motion } from 'framer-motion';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    Search as SearchIcon,
    Terminal, FileText, Key, Keyboard,
    Shield, Database, Activity, Box, Layers,
    User, Loader2, AlertCircle, ChevronDown, ExternalLink, Wifi,
} from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { useAppStore } from '../store';
import { cn } from '../lib/utils';
import { snackActions } from '../../components/utilities/Snackbar';
import { toLocalTime } from '../../components/utilities/Time';

// ── Types ─────────────────────────────────────────────────────────────────────
type SearchTab = 'callbacks' | 'tasks' | 'payloads' | 'files' | 'credentials' | 'keylogs' | 'artifacts' | 'tokens' | 'processes' | 'socks' | 'tags' | 'browsers';

// ── Per-tab field options (mirrors OldReactUI) ────────────────────────────────
const TAB_FIELDS: Record<SearchTab, string[]> = {
    callbacks:   ['Host', 'User', 'Domain', 'IP', 'Description', 'Agent', 'OS', 'Architecture', 'PID', 'Group', 'Display ID'],
    tasks:       ['Parameters', 'Response', 'Command', 'Comment', 'Tag', 'Callback ID', 'Callback Group', 'Host', 'Status', 'Operator'],
    payloads:    ['Filename', 'Description', 'UUID', 'C2 Parameter Value', 'Build Parameter'],
    files:       ['Downloads', 'Uploads', 'Screenshots', 'File Browser', 'Filename', 'Hash', 'Comment', 'Tag', 'UUID', 'Eventing Workflows'],
    credentials: ['Account', 'Realm', 'Credential', 'Comment', 'Tag'],
    keylogs:     ['Keystroke', 'User', 'Program', 'Host'],
    artifacts:   ['Artifact', 'Host', 'Type', 'Command', 'Task', 'Callback', 'Operator'],
    tokens:      ['User/Group', 'Host', 'SID'],
    processes:   ['Name', 'PID'],
    socks:       ['IP', 'Port'],
    tags:        ['Tag', 'Source'],
    browsers:    ['Path', 'Host', 'Name', 'Comment'],
};

const TABS: { id: SearchTab; label: string; icon: React.ReactNode }[] = [
    { id: 'callbacks',   label: 'Callbacks',   icon: <Activity  size={15} /> },
    { id: 'tasks',       label: 'Tasks',        icon: <Terminal  size={15} /> },
    { id: 'payloads',    label: 'Payloads',     icon: <Box       size={15} /> },
    { id: 'files',       label: 'Files',        icon: <FileText  size={15} /> },
    { id: 'credentials', label: 'Credentials',  icon: <Key       size={15} /> },
    { id: 'keylogs',     label: 'Keylogs',      icon: <Keyboard  size={15} /> },
    { id: 'artifacts',   label: 'Artifacts',    icon: <Database  size={15} /> },
    { id: 'tokens',      label: 'Tokens',       icon: <Shield    size={15} /> },
    { id: 'processes',   label: 'Processes',    icon: <Layers    size={15} /> },
    { id: 'socks',       label: 'SOCKS',        icon: <Wifi      size={15} /> },
    { id: 'tags',        label: 'Tags',          icon: <Database  size={15} /> },
    { id: 'browsers',    label: 'Browsers',      icon: <ExternalLink size={15} /> },
];

// ── GraphQL Queries ───────────────────────────────────────────────────────────

// Tasks
const SEARCH_TASKS_PARAMS = gql`
query SearchTasksParams($search: String!, $offset: Int!, $limit: Int!) {
    task(distinct_on: id, where: {_or: [{original_params:{_ilike:$search}},{display_params:{_ilike:$search}},{params:{_ilike:$search}}]}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(distinct_on: id, where: {_or: [{original_params:{_ilike:$search}},{display_params:{_ilike:$search}},{params:{_ilike:$search}}]}) { aggregate { count } }
}`;
const SEARCH_TASKS_RESPONSE = gql`
query SearchTasksResponse($search: String!, $offset: Int!, $limit: Int!) {
    task(distinct_on: id, where: {responses:{response_escape:{_ilike:$search}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(distinct_on: id, where: {responses:{response_escape:{_ilike:$search}}}) { aggregate { count } }
}`;
const SEARCH_TASKS_COMMAND = gql`
query SearchTasksCommand($search: String!, $offset: Int!, $limit: Int!) {
    task(where: {command_name:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(where: {command_name:{_ilike:$search}}) { aggregate { count } }
}`;
const SEARCH_TASKS_COMMENT = gql`
query SearchTasksComment($search: String!, $offset: Int!, $limit: Int!) {
    task(where: {comment:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(where: {comment:{_ilike:$search}}) { aggregate { count } }
}`;
const SEARCH_TASKS_TAG = gql`
query SearchTasksTag($search: String!, $offset: Int!, $limit: Int!) {
    task(where: {tags: {tagtype: {name: {_ilike: $search}}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(where: {tags: {tagtype: {name: {_ilike: $search}}}}) { aggregate { count } }
}`;
const SEARCH_TASKS_CALLBACK_ID = gql`
query SearchTasksCallbackId($search: Int!, $offset: Int!, $limit: Int!) {
    task(where: {callback: {display_id: {_eq: $search}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(where: {callback: {display_id: {_eq: $search}}}) { aggregate { count } }
}`;
const SEARCH_TASKS_CALLBACK_GROUP = gql`
query SearchTasksCallbackGroup($search: String!, $offset: Int!, $limit: Int!) {
    task(where: {callback: {mythictree_groups: {_contains: $search}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(where: {callback: {mythictree_groups: {_contains: $search}}}) { aggregate { count } }
}`;

// Callbacks
const SEARCH_CALLBACKS_HOST = gql`
query SearchCallbacksHost($search: String!, $offset: Int!, $limit: Int!) {
    callback(where:{host:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{host:{_ilike:$search}}) { aggregate { count } }
}`;
const SEARCH_CALLBACKS_USER = gql`
query SearchCallbacksUser($search: String!, $offset: Int!, $limit: Int!) {
    callback(where:{user:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{user:{_ilike:$search}}) { aggregate { count } }
}`;
const SEARCH_CALLBACKS_DOMAIN = gql`
query SearchCallbacksDomain($search: String!, $offset: Int!, $limit: Int!) {
    callback(where:{domain:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{domain:{_ilike:$search}}) { aggregate { count } }
}`;
const SEARCH_CALLBACKS_IP = gql`
query SearchCallbacksIP($search: String!, $offset: Int!, $limit: Int!) {
    callback(where:{_or:[{ip:{_ilike:$search}},{external_ip:{_ilike:$search}}]}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{_or:[{ip:{_ilike:$search}},{external_ip:{_ilike:$search}}]}) { aggregate { count } }
}`;
const SEARCH_CALLBACKS_DESC = gql`
query SearchCallbacksDesc($search: String!, $offset: Int!, $limit: Int!) {
    callback(where:{description:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{description:{_ilike:$search}}) { aggregate { count } }
}`;
const SEARCH_CALLBACKS_AGENT = gql`
query SearchCallbacksAgent($search: String!, $offset: Int!, $limit: Int!) {
    callback(where:{payload:{payloadtype:{name:{_ilike:$search}}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{payload:{payloadtype:{name:{_ilike:$search}}}}) { aggregate { count } }
}`;
const SEARCH_CALLBACKS_OS = gql`
query SearchCallbacksOS($search: String!, $offset: Int!, $limit: Int!) {
    callback(where:{os:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback os
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{os:{_ilike:$search}}) { aggregate { count } }
}`;
const SEARCH_CALLBACKS_ARCH = gql`
query SearchCallbacksArch($search: String!, $offset: Int!, $limit: Int!) {
    callback(where:{architecture:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback architecture
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{architecture:{_ilike:$search}}) { aggregate { count } }
}`;

// Files — split by type (OldReactUI pattern)
const FILE_FIELDS_FRAGMENT = `
    id agent_file_id filename_text full_remote_path_text comment
    is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host
    task { id callback { display_id } }
`;
const SEARCH_FILES_DOWNLOADS = gql`
query SearchFilesDownloads($search: String!, $offset: Int!, $limit: Int!) {
    filemeta(where:{_or:[{filename_text:{_ilike:$search}},{full_remote_path_text:{_ilike:$search}},{comment:{_ilike:$search}}], is_download_from_agent:{_eq:true}, is_screenshot:{_eq:false}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{_or:[{filename_text:{_ilike:$search}},{full_remote_path_text:{_ilike:$search}},{comment:{_ilike:$search}}], is_download_from_agent:{_eq:true}, is_screenshot:{_eq:false}, deleted:{_eq:false}}) { aggregate { count } }
}`;
const SEARCH_FILES_UPLOADS = gql`
query SearchFilesUploads($search: String!, $offset: Int!, $limit: Int!) {
    filemeta(where:{_or:[{filename_text:{_ilike:$search}},{full_remote_path_text:{_ilike:$search}},{comment:{_ilike:$search}}], is_download_from_agent:{_eq:false}, is_screenshot:{_eq:false}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{_or:[{filename_text:{_ilike:$search}},{full_remote_path_text:{_ilike:$search}},{comment:{_ilike:$search}}], is_download_from_agent:{_eq:false}, is_screenshot:{_eq:false}, deleted:{_eq:false}}) { aggregate { count } }
}`;
const SEARCH_FILES_SCREENSHOTS = gql`
query SearchFilesScreenshots($search: String!, $offset: Int!, $limit: Int!) {
    filemeta(where:{_or:[{filename_text:{_ilike:$search}},{full_remote_path_text:{_ilike:$search}},{comment:{_ilike:$search}}], is_screenshot:{_eq:true}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{_or:[{filename_text:{_ilike:$search}},{full_remote_path_text:{_ilike:$search}},{comment:{_ilike:$search}}], is_screenshot:{_eq:true}, deleted:{_eq:false}}) { aggregate { count } }
}`;

// Credentials — per-field (OldReactUI pattern)
const SEARCH_CREDS_ACCOUNT = gql`
query SearchCredsAccount($search: String!, $offset: Int!, $limit: Int!) {
    credential(where:{account:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id account realm type credential_text comment timestamp task_id
        operator { username }
    }
    credential_aggregate(where:{account:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
const SEARCH_CREDS_REALM = gql`
query SearchCredsRealm($search: String!, $offset: Int!, $limit: Int!) {
    credential(where:{realm:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id account realm type credential_text comment timestamp task_id
        operator { username }
    }
    credential_aggregate(where:{realm:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
const SEARCH_CREDS_CREDENTIAL = gql`
query SearchCredsCredential($search: String!, $offset: Int!, $limit: Int!) {
    credential(where:{credential_text:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id account realm type credential_text comment timestamp task_id
        operator { username }
    }
    credential_aggregate(where:{credential_text:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
const SEARCH_CREDS_COMMENT = gql`
query SearchCredsComment($search: String!, $offset: Int!, $limit: Int!) {
    credential(where:{comment:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id account realm type credential_text comment timestamp task_id
        operator { username }
    }
    credential_aggregate(where:{comment:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;

// Artifacts
const SEARCH_ARTIFACTS_ARTIFACT = gql`
query SearchArtifactsArtifact($search: String!, $offset: Int!, $limit: Int!) {
    taskartifact(where:{artifact_text:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id artifact_text host timestamp base_artifact
        task { id command_name callback { display_id } }
    }
    taskartifact_aggregate(where:{artifact_text:{_ilike:$search}}) { aggregate { count } }
}`;
const SEARCH_ARTIFACTS_HOST = gql`
query SearchArtifactsHost($search: String!, $offset: Int!, $limit: Int!) {
    taskartifact(where:{host:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id artifact_text host timestamp base_artifact
        task { id command_name callback { display_id } }
    }
    taskartifact_aggregate(where:{host:{_ilike:$search}}) { aggregate { count } }
}`;
const SEARCH_ARTIFACTS_TYPE = gql`
query SearchArtifactsType($search: String!, $offset: Int!, $limit: Int!) {
    taskartifact(where:{base_artifact:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id artifact_text host timestamp base_artifact
        task { id command_name callback { display_id } }
    }
    taskartifact_aggregate(where:{base_artifact:{_ilike:$search}}) { aggregate { count } }
}`;

// Keylogs
const SEARCH_KEYLOGS_KEYSTROKE = gql`
query SearchKeylogsKeystroke($search: String!, $offset: Int!, $limit: Int!) {
    keylog(where:{keystrokes_text:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id keystrokes_text window user timestamp
        task { callback { display_id host } }
    }
    keylog_aggregate(where:{keystrokes_text:{_ilike:$search}}) { aggregate { count } }
}`;
const SEARCH_KEYLOGS_USER = gql`
query SearchKeylogsUser($search: String!, $offset: Int!, $limit: Int!) {
    keylog(where:{user:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id keystrokes_text window user timestamp
        task { callback { display_id host } }
    }
    keylog_aggregate(where:{user:{_ilike:$search}}) { aggregate { count } }
}`;
const SEARCH_KEYLOGS_PROGRAM = gql`
query SearchKeylogsProgram($search: String!, $offset: Int!, $limit: Int!) {
    keylog(where:{window:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id keystrokes_text window user timestamp
        task { callback { display_id host } }
    }
    keylog_aggregate(where:{window:{_ilike:$search}}) { aggregate { count } }
}`;

// Payloads
const SEARCH_PAYLOADS_FILENAME = gql`
query SearchPayloadsFilename($search: String!, $offset: Int!, $limit: Int!) {
    payload(where:{filemetum:{filename_text:{_ilike:$search}}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id uuid description build_phase timestamp
        payloadtype { name }
        filemetum { filename_text }
    }
    payload_aggregate(where:{filemetum:{filename_text:{_ilike:$search}}, deleted:{_eq:false}}) { aggregate { count } }
}`;
const SEARCH_PAYLOADS_DESC = gql`
query SearchPayloadsDesc($search: String!, $offset: Int!, $limit: Int!) {
    payload(where:{description:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id uuid description build_phase timestamp
        payloadtype { name }
        filemetum { filename_text }
    }
    payload_aggregate(where:{description:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
const SEARCH_PAYLOADS_UUID = gql`
query SearchPayloadsUUID($search: String!, $offset: Int!, $limit: Int!) {
    payload(where:{uuid:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id uuid description build_phase timestamp
        payloadtype { name }
        filemetum { filename_text }
    }
    payload_aggregate(where:{uuid:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;

// #6 — Payloads: C2 Parameter Value
const SEARCH_PAYLOADS_C2PARAM = gql`
query SearchPayloadsC2Param($search: String!, $offset: Int!, $limit: Int!) {
    payload(where:{payloadc2profiles:{c2profileparametersinstances:{value:{_ilike:$search}}}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id uuid description build_phase timestamp
        payloadtype { name }
        filemetum { filename_text }
        payloadc2profiles { c2profile { name } c2profileparametersinstances { value } }
    }
    payload_aggregate(where:{payloadc2profiles:{c2profileparametersinstances:{value:{_ilike:$search}}}, deleted:{_eq:false}}) { aggregate { count } }
}`;

// #7 — Payloads: Build Parameter
const SEARCH_PAYLOADS_BUILDPARAM = gql`
query SearchPayloadsBuildParam($search: String!, $offset: Int!, $limit: Int!) {
    payload(where:{buildparameterinstances:{value:{_ilike:$search}}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id uuid description build_phase timestamp
        payloadtype { name }
        filemetum { filename_text }
        buildparameterinstances { value buildparameter { name } }
    }
    payload_aggregate(where:{buildparameterinstances:{value:{_ilike:$search}}, deleted:{_eq:false}}) { aggregate { count } }
}`;

// Tokens — fixed: use user/groups/host (removed non-existent `description` field)
const SEARCH_TOKENS_USER = gql`
query SearchTokensUser($search: String!, $offset: Int!, $limit: Int!) {
    token(where:{_or:[{user:{_ilike:$search}},{groups:{_ilike:$search}}], deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id token_id user timestamp
        task { callback { display_id host } }
    }
    token_aggregate(where:{_or:[{user:{_ilike:$search}},{groups:{_ilike:$search}}], deleted:{_eq:false}}) { aggregate { count } }
}`;
const SEARCH_TOKENS_HOST = gql`
query SearchTokensHost($search: String!, $offset: Int!, $limit: Int!) {
    token(where:{host:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id token_id user timestamp
        task { callback { display_id host } }
    }
    token_aggregate(where:{host:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;

// Processes
const SEARCH_PROCESSES_NAME = gql`
query SearchProcessesName($search: String!, $offset: Int!, $limit: Int!) {
    mythictree(where:{tree_type:{_eq:"process"}, name_text:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id name_text full_path_text host metadata timestamp
        task { callback { display_id } }
    }
    mythictree_aggregate(where:{tree_type:{_eq:"process"}, name_text:{_ilike:$search}}) { aggregate { count } }
}`;
const SEARCH_PROCESSES_PID = gql`
query SearchProcessesPID($search: String!, $offset: Int!, $limit: Int!) {
    mythictree(where:{tree_type:{_eq:"process"}, full_path_text:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id name_text full_path_text host metadata timestamp
        task { callback { display_id } }
    }
    mythictree_aggregate(where:{tree_type:{_eq:"process"}, full_path_text:{_ilike:$search}}) { aggregate { count } }
}`;

// SOCKS / Proxies
const SEARCH_SOCKS_IP = gql`
query SearchSocksIP($search: String!, $offset: Int!, $limit: Int!) {
    callbackport(where:{_or:[{local_port:{_eq:0}},{local_port:{_gt:0}}], callback:{ip:{_ilike:$search}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id local_port port_type bytes_sent bytes_received
        callback { id display_id host ip user }
    }
    callbackport_aggregate(where:{_or:[{local_port:{_eq:0}},{local_port:{_gt:0}}], callback:{ip:{_ilike:$search}}}) { aggregate { count } }
}`;
const SEARCH_SOCKS_PORT = gql`
query SearchSocksPort($search: String!, $offset: Int!, $limit: Int!) {
    callbackport(where:{local_port:{_eq:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id local_port port_type bytes_sent bytes_received
        callback { id display_id host ip user }
    }
    callbackport_aggregate(where:{local_port:{_eq:$search}}) { aggregate { count } }
}`;

// #11 — SOCKS subscription for live updates
const SUBSCRIBE_SOCKS = gql`
subscription SubscribeSocks {
    callbackport(where: {deleted: {_eq: false}}, order_by: {id: desc}, limit: 100) {
        id local_port port_type bytes_sent bytes_received
        callback { id display_id host ip user }
    }
}`;

// Tags
const SEARCH_TAGS_TAG = gql`
query SearchTagsTag($search: String!, $offset: Int!, $limit: Int!) {
    tag(where:{_or:[{data:{_ilike:$search}},{tagtype:{name:{_ilike:$search}}}]}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id data url source
        tagtype { id name color }
    }
    tag_aggregate(where:{_or:[{data:{_ilike:$search}},{tagtype:{name:{_ilike:$search}}}]}) { aggregate { count } }
}`;
const SEARCH_TAGS_SOURCE = gql`
query SearchTagsSource($search: String!, $offset: Int!, $limit: Int!) {
    tag(where:{source:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id data url source
        tagtype { id name color }
    }
    tag_aggregate(where:{source:{_ilike:$search}}) { aggregate { count } }
}`;

// ── NEW: Tasks additional search fields (#17) ─────────────────────────────────
const SEARCH_TASKS_HOST = gql`
query SearchTasksHost($search: String!, $offset: Int!, $limit: Int!) {
    task(where: {callback: {host: {_ilike: $search}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(where: {callback: {host: {_ilike: $search}}}) { aggregate { count } }
}`;
const SEARCH_TASKS_STATUS = gql`
query SearchTasksStatus($search: String!, $offset: Int!, $limit: Int!) {
    task(where: {status: {_ilike: $search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(where: {status: {_ilike: $search}}) { aggregate { count } }
}`;
const SEARCH_TASKS_OPERATOR = gql`
query SearchTasksOperator($search: String!, $offset: Int!, $limit: Int!) {
    task(where: {operator: {username: {_ilike: $search}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_params original_params command_name comment status timestamp
        callback { id display_id host }
        operator { username }
    }
    task_aggregate(where: {operator: {username: {_ilike: $search}}}) { aggregate { count } }
}`;

// ── NEW: Callbacks additional search fields (#18) ─────────────────────────────
const SEARCH_CALLBACKS_PID = gql`
query SearchCallbacksPID($search: Int!, $offset: Int!, $limit: Int!) {
    callback(where:{pid:{_eq:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{pid:{_eq:$search}}) { aggregate { count } }
}`;
const SEARCH_CALLBACKS_GROUP = gql`
query SearchCallbacksGroup($search: String!, $offset: Int!, $limit: Int!) {
    callback(where:{mythictree_groups:{_contains:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{mythictree_groups:{_contains:$search}}) { aggregate { count } }
}`;
const SEARCH_CALLBACKS_DISPLAY_ID = gql`
query SearchCallbacksDisplayId($search: Int!, $offset: Int!, $limit: Int!) {
    callback(where:{display_id:{_eq:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id display_id host user description ip pid process_name integrity_level active last_checkin init_callback
        payload { payloadtype { name } }
    }
    callback_aggregate(where:{display_id:{_eq:$search}}) { aggregate { count } }
}`;

// ── NEW: Artifacts additional search fields (#19) ─────────────────────────────
const SEARCH_ARTIFACTS_COMMAND = gql`
query SearchArtifactsCommand($search: String!, $offset: Int!, $limit: Int!) {
    taskartifact(where:{task:{command_name:{_ilike:$search}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id artifact_text host timestamp base_artifact
        task { id command_name callback { display_id } operator { username } }
    }
    taskartifact_aggregate(where:{task:{command_name:{_ilike:$search}}}) { aggregate { count } }
}`;
const SEARCH_ARTIFACTS_TASK = gql`
query SearchArtifactsTask($search: Int!, $offset: Int!, $limit: Int!) {
    taskartifact(where:{task_id:{_eq:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id artifact_text host timestamp base_artifact
        task { id command_name callback { display_id } operator { username } }
    }
    taskartifact_aggregate(where:{task_id:{_eq:$search}}) { aggregate { count } }
}`;
const SEARCH_ARTIFACTS_CALLBACK = gql`
query SearchArtifactsCallback($search: Int!, $offset: Int!, $limit: Int!) {
    taskartifact(where:{task:{callback:{display_id:{_eq:$search}}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id artifact_text host timestamp base_artifact
        task { id command_name callback { display_id } operator { username } }
    }
    taskartifact_aggregate(where:{task:{callback:{display_id:{_eq:$search}}}}) { aggregate { count } }
}`;
const SEARCH_ARTIFACTS_OPERATOR = gql`
query SearchArtifactsOperator($search: String!, $offset: Int!, $limit: Int!) {
    taskartifact(where:{task:{operator:{username:{_ilike:$search}}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id artifact_text host timestamp base_artifact
        task { id command_name callback { display_id } operator { username } }
    }
    taskartifact_aggregate(where:{task:{operator:{username:{_ilike:$search}}}}) { aggregate { count } }
}`;

// ── NEW: Files individual search fields (#26) ─────────────────────────────────
const SEARCH_FILES_FILENAME = gql`
query SearchFilesFilename($search: String!, $offset: Int!, $limit: Int!) {
    filemeta(where:{filename_text:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host md5 sha1
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{filename_text:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
const SEARCH_FILES_HASH = gql`
query SearchFilesHash($search: String!, $offset: Int!, $limit: Int!) {
    filemeta(where:{_or:[{md5:{_ilike:$search}},{sha1:{_ilike:$search}}], deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host md5 sha1
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{_or:[{md5:{_ilike:$search}},{sha1:{_ilike:$search}}], deleted:{_eq:false}}) { aggregate { count } }
}`;
const SEARCH_FILES_COMMENT = gql`
query SearchFilesComment($search: String!, $offset: Int!, $limit: Int!) {
    filemeta(where:{comment:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{comment:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;
const SEARCH_FILES_TAG = gql`
query SearchFilesTag($search: String!, $offset: Int!, $limit: Int!) {
    filemeta(where:{tags:{tagtype:{name:{_ilike:$search}}}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{tags:{tagtype:{name:{_ilike:$search}}}, deleted:{_eq:false}}) { aggregate { count } }
}`;
const SEARCH_FILES_UUID = gql`
query SearchFilesUUID($search: String!, $offset: Int!, $limit: Int!) {
    filemeta(where:{agent_file_id:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id agent_file_id filename_text full_remote_path_text comment is_download_from_agent is_screenshot complete chunks_received total_chunks timestamp host
        task { id callback { display_id } }
    }
    filemeta_aggregate(where:{agent_file_id:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;

// #4 — Files: File Browser (mythictree file entries)
const SEARCH_FILES_FILEBROWSER = gql`
query SearchFilesFileBrowser($search: String!, $offset: Int!, $limit: Int!) {
    mythictree(where:{tree_type:{_eq:"file"}, full_path_text:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id name_text full_path_text host comment metadata timestamp can_have_children
        task { id callback { display_id } }
    }
    mythictree_aggregate(where:{tree_type:{_eq:"file"}, full_path_text:{_ilike:$search}}) { aggregate { count } }
}`;

// #9 — Files: Eventing Workflows
const SEARCH_FILES_EVENTING = gql`
query SearchFilesEventing($search: String!, $offset: Int!, $limit: Int!) {
    eventstepinstance(where:{environment:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id environment action_data created_at
        eventstep { name action }
        eventgroup { name }
    }
    eventstepinstance_aggregate(where:{environment:{_ilike:$search}}) { aggregate { count } }
}`;

// ── NEW: Credentials Tag search (#27) ─────────────────────────────────────────
const SEARCH_CREDS_TAG = gql`
query SearchCredsTag($search: String!, $offset: Int!, $limit: Int!) {
    credential(where:{tags:{tagtype:{name:{_ilike:$search}}}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id account realm type credential_text comment timestamp task_id
        operator { username }
    }
    credential_aggregate(where:{tags:{tagtype:{name:{_ilike:$search}}}, deleted:{_eq:false}}) { aggregate { count } }
}`;

// #10 — Keylogs unique mode (distinct on user/program for empty searches)
const SEARCH_KEYLOGS_UNIQUE_USER = gql`
query SearchKeylogsUniqueUser($offset: Int!, $limit: Int!) {
    keylog(distinct_on: user, order_by: [{user: asc}, {id: desc}], limit: $limit, offset: $offset) {
        id keystrokes_text window user timestamp
        task { callback { display_id host } }
    }
    keylog_aggregate(distinct_on: user) { aggregate { count } }
}`;
const SEARCH_KEYLOGS_UNIQUE_PROGRAM = gql`
query SearchKeylogsUniqueProgram($offset: Int!, $limit: Int!) {
    keylog(distinct_on: window, order_by: [{window: asc}, {id: desc}], limit: $limit, offset: $offset) {
        id keystrokes_text window user timestamp
        task { callback { display_id host } }
    }
    keylog_aggregate(distinct_on: window) { aggregate { count } }
}`;

// ── NEW: Keylogs Host search (#33) ────────────────────────────────────────────
const SEARCH_KEYLOGS_HOST = gql`
query SearchKeylogsHost($search: String!, $offset: Int!, $limit: Int!) {
    keylog(where:{task:{callback:{host:{_ilike:$search}}}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id keystrokes_text window user timestamp
        task { callback { display_id host } }
    }
    keylog_aggregate(where:{task:{callback:{host:{_ilike:$search}}}}) { aggregate { count } }
}`;

// ── NEW: Tokens SID search (#34) ──────────────────────────────────────────────
const SEARCH_TOKENS_SID = gql`
query SearchTokensSID($search: String!, $offset: Int!, $limit: Int!) {
    token(where:{token_id:{_ilike:$search}, deleted:{_eq:false}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id token_id user timestamp
        task { callback { display_id host } }
    }
    token_aggregate(where:{token_id:{_ilike:$search}, deleted:{_eq:false}}) { aggregate { count } }
}`;

// ── NEW: Browsers search (#16) ────────────────────────────────────────────────
const SEARCH_BROWSERS_PATH = gql`
query SearchBrowsersPath($search: String!, $offset: Int!, $limit: Int!) {
    mythictree(where:{tree_type:{_eq:"file"}, full_path_text:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id name_text full_path_text host comment metadata timestamp
        task { callback { display_id } }
    }
    mythictree_aggregate(where:{tree_type:{_eq:"file"}, full_path_text:{_ilike:$search}}) { aggregate { count } }
}`;
const SEARCH_BROWSERS_HOST = gql`
query SearchBrowsersHost($search: String!, $offset: Int!, $limit: Int!) {
    mythictree(where:{tree_type:{_eq:"file"}, host:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id name_text full_path_text host comment metadata timestamp
        task { callback { display_id } }
    }
    mythictree_aggregate(where:{tree_type:{_eq:"file"}, host:{_ilike:$search}}) { aggregate { count } }
}`;
const SEARCH_BROWSERS_NAME = gql`
query SearchBrowsersName($search: String!, $offset: Int!, $limit: Int!) {
    mythictree(where:{tree_type:{_eq:"file"}, name_text:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id name_text full_path_text host comment metadata timestamp
        task { callback { display_id } }
    }
    mythictree_aggregate(where:{tree_type:{_eq:"file"}, name_text:{_ilike:$search}}) { aggregate { count } }
}`;
const SEARCH_BROWSERS_COMMENT = gql`
query SearchBrowsersComment($search: String!, $offset: Int!, $limit: Int!) {
    mythictree(where:{tree_type:{_eq:"file"}, comment:{_ilike:$search}}, order_by:{id:desc}, limit:$limit, offset:$offset) {
        id name_text full_path_text host comment metadata timestamp
        task { callback { display_id } }
    }
    mythictree_aggregate(where:{tree_type:{_eq:"file"}, comment:{_ilike:$search}}) { aggregate { count } }
}`;

// ── Interactive task response query (#14-15) ──────────────────────────────────
const GET_TASK_RESPONSES = gql`
query GetTaskResponses($task_id: Int!) {
    response(where: {task_id: {_eq: $task_id}}, order_by: {id: asc}, limit: 50) {
        id response_escape timestamp
    }
}`;

// ── Result Components ─────────────────────────────────────────────────────────

const TaskResult = ({ task }: { task: any }) => {
    const navigate = useNavigate();
    const [expanded, setExpanded] = useState(false);
    const [fetchResponses, { data: respData, loading: respLoading }] = useLazyQuery(GET_TASK_RESPONSES, { fetchPolicy: 'no-cache' });

    const handleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!expanded) {
            fetchResponses({ variables: { task_id: task.id } });
        }
        setExpanded(prev => !prev);
    };

    const responses = respData?.response || [];

    return (
    <div className="border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="p-3 cursor-pointer"
            onClick={() => task.callback?.display_id && navigate(`/console/${task.callback.display_id}`)}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-signal font-mono text-sm font-bold">{task.command_name}</span>
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-mono uppercase",
                            task.status === "success" || task.status === "completed" ? "bg-green-500/10 text-green-400" :
                            task.status?.includes("error") ? "bg-red-500/10 text-red-400" :
                            "bg-gray-500/10 text-gray-400"
                        )}>{task.status}</span>
                        <ExternalLink size={10} className="text-gray-600" />
                    </div>
                    <p className="text-gray-300 font-mono text-xs truncate">{task.display_params || task.original_params || '(no parameters)'}</p>
                    {task.comment && <p className="text-gray-500 text-xs mt-1 italic">"{task.comment}"</p>}
                </div>
                <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                    <div className="flex items-center gap-1 justify-end"><User size={11} />{task.operator?.username}</div>
                    <div>Callback #{task.callback?.display_id} · {task.callback?.host}</div>
                    <div>{toLocalTime(task.timestamp, false)}</div>
                </div>
            </div>
        </div>
        {/* Expand toggle for inline response viewer */}
        <div className="border-t border-ghost/10 px-3 py-1 flex items-center gap-2">
            <button onClick={handleExpand}
                className="flex items-center gap-1 text-[10px] font-mono text-gray-500 hover:text-signal transition-colors">
                <ChevronDown size={12} className={cn("transition-transform", expanded && "rotate-180")} />
                {expanded ? 'HIDE' : 'VIEW'} RESPONSE
            </button>
            <span className="text-[10px] text-gray-600 font-mono">Task #{task.id}</span>
        </div>
        {expanded && (
            <div className="border-t border-ghost/10 px-3 py-2 max-h-[400px] overflow-auto bg-black/30">
                {respLoading && (
                    <div className="flex items-center gap-2 py-4 justify-center">
                        <Loader2 size={16} className="text-signal animate-spin" />
                        <span className="text-xs text-gray-500 font-mono">Loading responses...</span>
                    </div>
                )}
                {!respLoading && responses.length === 0 && (
                    <div className="text-xs text-gray-600 font-mono py-2 text-center">No responses</div>
                )}
                {!respLoading && responses.length > 0 && (
                    <div className="space-y-1">
                        {responses.map((r: any) => {
                            let decoded = '';
                            try { decoded = atob(r.response_escape); } catch { decoded = r.response_escape || ''; }
                            return (
                                <pre key={r.id}
                                    className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-gray-300 bg-black/20 rounded px-2 py-1 border border-ghost/10">
                                    {decoded}
                                </pre>
                            );
                        })}
                    </div>
                )}
            </div>
        )}
    </div>
    );
};

const CallbackResult = ({ callback }: { callback: any }) => {
    const navigate = useNavigate();
    return (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20 cursor-pointer"
        onClick={() => navigate(`/console/${callback.display_id}`)}>
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-signal font-bold">#{callback.display_id}</span>
                    <span className={cn("w-2 h-2 rounded-full", callback.active ? "bg-green-400 animate-pulse" : "bg-gray-600")} />
                    <span className="text-xs text-gray-400 font-mono">{callback.payload?.payloadtype?.name}</span>
                    <ExternalLink size={10} className="text-gray-600" />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    <div><span className="text-gray-500">Host:</span><span className="ml-1.5 text-white font-mono">{callback.host}</span></div>
                    <div><span className="text-gray-500">User:</span><span className="ml-1.5 text-white font-mono">{callback.user}</span></div>
                    <div><span className="text-gray-500">IP:</span><span className="ml-1.5 text-white font-mono">{callback.ip}</span></div>
                    <div><span className="text-gray-500">PID:</span><span className="ml-1.5 text-white font-mono">{callback.pid}</span></div>
                </div>
                {callback.description && <p className="text-gray-500 text-xs mt-1 italic">{callback.description}</p>}
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                <div>Last: {toLocalTime(callback.last_checkin, false)}</div>
                <div>Init: {toLocalTime(callback.init_callback, false)}</div>
            </div>
        </div>
    </div>
    );
};

const FileResult = ({ file }: { file: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <FileText size={14} className="text-signal shrink-0" />
                    <span className="text-white font-mono text-sm truncate">{file.filename_text}</span>
                    {file.is_screenshot && <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] rounded shrink-0">Screenshot</span>}
                    {file.is_download_from_agent && <span className="px-1.5 py-0.5 bg-signal/10 text-signal text-[10px] rounded shrink-0">Download</span>}
                    {!file.is_download_from_agent && !file.is_screenshot && <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] rounded shrink-0">Upload</span>}
                </div>
                {file.full_remote_path_text && <p className="text-gray-400 font-mono text-xs truncate">{file.full_remote_path_text}</p>}
                {file.comment && <p className="text-gray-500 text-xs mt-1 italic">"{file.comment}"</p>}
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                <div>Host: {file.host}</div>
                <div>Callback #{file.task?.callback?.display_id}</div>
                <div>{file.complete ? 'Complete' : `${file.chunks_received}/${file.total_chunks}`}</div>
            </div>
        </div>
    </div>
);

const CredentialResult = ({ credential }: { credential: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <Key size={14} className="text-yellow-400" />
                    <span className="text-white font-mono font-bold">{credential.account}</span>
                    <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 text-[10px] rounded">{credential.type}</span>
                </div>
                <div className="text-xs"><span className="text-gray-500">Realm:</span><span className="ml-1.5 text-white font-mono">{credential.realm || 'N/A'}</span></div>
                <div className="text-xs mt-0.5 font-mono text-green-400 truncate">{credential.credential_text}</div>
                {credential.comment && <p className="text-gray-500 text-xs mt-1 italic">"{credential.comment}"</p>}
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                <div>By: {credential.operator?.username}</div>
                <div>{toLocalTime(credential.timestamp, false)}</div>
            </div>
        </div>
    </div>
);

const ArtifactResult = ({ artifact }: { artifact: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <Database size={14} className="text-orange-400" />
                    <span className="px-1.5 py-0.5 bg-orange-500/10 text-orange-400 text-[10px] rounded">{artifact.base_artifact}</span>
                </div>
                <p className="text-white font-mono text-sm">{artifact.artifact_text}</p>
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                <div>Host: {artifact.host}</div>
                <div>Cmd: {artifact.task?.command_name}</div>
                <div>Callback #{artifact.task?.callback?.display_id}</div>
            </div>
        </div>
    </div>
);

const KeylogResult = ({ keylog }: { keylog: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <Keyboard size={14} className="text-purple-400" />
                    <span className="text-white text-sm">{keylog.window}</span>
                </div>
                <p className="text-green-400 font-mono text-sm bg-black/30 p-2 rounded break-all">{keylog.keystrokes_text}</p>
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                <div>User: {keylog.user}</div>
                <div>Host: {keylog.task?.callback?.host}</div>
                <div>{toLocalTime(keylog.timestamp, false)}</div>
            </div>
        </div>
    </div>
);

const PayloadResult = ({ payload }: { payload: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <Box size={14} className="text-signal" />
                    <span className="text-signal font-mono">{payload.payloadtype?.name}</span>
                    <span className={cn("px-1.5 py-0.5 text-[10px] rounded",
                        payload.build_phase === "success" ? "bg-green-500/10 text-green-400" :
                        payload.build_phase === "error" ? "bg-red-500/10 text-red-400" :
                        "bg-gray-500/10 text-gray-400"
                    )}>{payload.build_phase}</span>
                </div>
                <p className="text-white font-mono text-sm">{payload.filemetum?.filename_text || payload.uuid}</p>
                {payload.description && <p className="text-gray-500 text-xs mt-1">{payload.description}</p>}
            </div>
            <div className="text-right text-xs text-gray-500">
                <div>{toLocalTime(payload.timestamp, false)}</div>
            </div>
        </div>
    </div>
);

const TokenResult = ({ token }: { token: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <Shield size={14} className="text-blue-400" />
                    <span className="text-white font-mono font-bold">{token.user}</span>
                    <span className="text-gray-500 text-xs">ID: {token.token_id}</span>
                </div>
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                <div>Host: {token.task?.callback?.host}</div>
                <div>Callback #{token.task?.callback?.display_id}</div>
                <div>{toLocalTime(token.timestamp, false)}</div>
            </div>
        </div>
    </div>
);

const ProcessResult = ({ process }: { process: any }) => {
    let metadata: any = {};
    try { metadata = typeof process.metadata === 'string' ? JSON.parse(process.metadata) : process.metadata || {}; } catch {}
    return (
        <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Layers size={14} className="text-cyan-400" />
                        <span className="text-white font-mono font-bold">{process.name_text}</span>
                        {metadata.process_id && <span className="text-gray-500 text-xs">PID: {metadata.process_id}</span>}
                    </div>
                    <p className="text-gray-400 font-mono text-xs truncate">{process.full_path_text}</p>
                </div>
                <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                    <div>Host: {process.host}</div>
                    <div>Callback #{process.task?.callback?.display_id}</div>
                </div>
            </div>
        </div>
    );
};

const SocksResult = ({ socks }: { socks: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <Wifi size={14} className="text-emerald-400" />
                    <span className="text-white font-mono font-bold">Port {socks.local_port}</span>
                    <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] rounded">{socks.port_type || 'SOCKS'}</span>
                </div>
                <div className="text-xs text-gray-400">
                    <span>Sent: {socks.bytes_sent ?? 0}B</span>
                    <span className="mx-2">·</span>
                    <span>Received: {socks.bytes_received ?? 0}B</span>
                </div>
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                <div>Callback #{socks.callback?.display_id}</div>
                <div>{socks.callback?.host} · {socks.callback?.user}</div>
            </div>
        </div>
    </div>
);

const TagResultItem = ({ tag }: { tag: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <Database size={14} style={{ color: tag.tagtype?.color || '#888' }} />
                    <span className="text-white font-mono font-bold" style={{ color: tag.tagtype?.color }}>{tag.tagtype?.name || 'Tag'}</span>
                    {tag.source && <span className="text-gray-500 text-xs">source: {tag.source}</span>}
                </div>
                {tag.data && <p className="text-gray-300 font-mono text-xs">{typeof tag.data === 'string' ? tag.data : JSON.stringify(tag.data)}</p>}
                {tag.url && <p className="text-xs text-signal hover:underline mt-0.5"><a href={tag.url} target="_blank" rel="noreferrer">{tag.url}</a></p>}
            </div>
        </div>
    </div>
);

const BrowserResult = ({ browser }: { browser: any }) => {
    let metadata: any = {};
    try { metadata = typeof browser.metadata === 'string' ? JSON.parse(browser.metadata) : browser.metadata || {}; } catch {}
    return (
        <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                        <ExternalLink size={14} className="text-teal-400" />
                        <span className="text-white font-mono font-bold">{browser.name_text}</span>
                        {metadata.size !== undefined && <span className="text-gray-500 text-xs">{metadata.size}B</span>}
                    </div>
                    <p className="text-gray-400 font-mono text-xs truncate">{browser.full_path_text}</p>
                    {browser.comment && <p className="text-gray-500 text-xs mt-1 italic">"{browser.comment}"</p>}
                </div>
                <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                    <div>Host: {browser.host}</div>
                    <div>Callback #{browser.task?.callback?.display_id}</div>
                    <div>{toLocalTime(browser.timestamp, false)}</div>
                </div>
            </div>
        </div>
    );
};

// ── Field Selector ────────────────────────────────────────────────────────────
const FieldSelector = ({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) => {
    const [open, setOpen] = useState(false);
    if (options.length === 0) return null;
    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 h-10 px-3 bg-black/40 border border-ghost/30 hover:border-signal/40 text-signal font-mono text-xs transition-colors min-w-[120px] justify-between"
            >
                <span>{value}</span>
                <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-black border border-signal/30 min-w-full shadow-lg shadow-signal/10">
                    {options.map(opt => (
                        <button
                            key={opt}
                            type="button"
                            onClick={() => { onChange(opt); setOpen(false); }}
                            className={cn(
                                "w-full px-3 py-2 text-xs font-mono text-left transition-colors",
                                opt === value ? "bg-signal/10 text-signal" : "text-gray-300 hover:bg-white/5 hover:text-signal"
                            )}
                        >
                            {opt}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────
const Search = () => {
    const { isSidebarCollapsed } = useAppStore();
    const [searchParams, setSearchParams] = useSearchParams();

    const tabParam = (searchParams.get('tab') as SearchTab) || 'callbacks';
    const [activeTab, setActiveTab] = useState<SearchTab>(tabParam);
    const [searchField, setSearchField] = useState<string>(
        searchParams.get('field') || TAB_FIELDS[tabParam]?.[0] || ''
    );
    const [inputValue, setInputValue] = useState(searchParams.get('q') || '');
    const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
    const [results, setResults] = useState<any[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const limit = 25;

    // Tasks
    const [searchTasksParams]   = useLazyQuery(SEARCH_TASKS_PARAMS,   { fetchPolicy: 'no-cache' });
    const [searchTasksResponse] = useLazyQuery(SEARCH_TASKS_RESPONSE, { fetchPolicy: 'no-cache' });
    const [searchTasksCommand]  = useLazyQuery(SEARCH_TASKS_COMMAND,  { fetchPolicy: 'no-cache' });
    const [searchTasksComment]  = useLazyQuery(SEARCH_TASKS_COMMENT,  { fetchPolicy: 'no-cache' });
    const [searchTasksTag]      = useLazyQuery(SEARCH_TASKS_TAG,      { fetchPolicy: 'no-cache' });
    const [searchTasksCbId]     = useLazyQuery(SEARCH_TASKS_CALLBACK_ID, { fetchPolicy: 'no-cache' });
    const [searchTasksCbGroup]  = useLazyQuery(SEARCH_TASKS_CALLBACK_GROUP, { fetchPolicy: 'no-cache' });
    // Callbacks
    const [searchCbHost]   = useLazyQuery(SEARCH_CALLBACKS_HOST,   { fetchPolicy: 'no-cache' });
    const [searchCbUser]   = useLazyQuery(SEARCH_CALLBACKS_USER,   { fetchPolicy: 'no-cache' });
    const [searchCbDomain] = useLazyQuery(SEARCH_CALLBACKS_DOMAIN, { fetchPolicy: 'no-cache' });
    const [searchCbIP]     = useLazyQuery(SEARCH_CALLBACKS_IP,     { fetchPolicy: 'no-cache' });
    const [searchCbDesc]   = useLazyQuery(SEARCH_CALLBACKS_DESC,   { fetchPolicy: 'no-cache' });
    const [searchCbAgent]  = useLazyQuery(SEARCH_CALLBACKS_AGENT,  { fetchPolicy: 'no-cache' });
    const [searchCbOS]     = useLazyQuery(SEARCH_CALLBACKS_OS,     { fetchPolicy: 'no-cache' });
    const [searchCbArch]   = useLazyQuery(SEARCH_CALLBACKS_ARCH,   { fetchPolicy: 'no-cache' });
    // Files
    const [searchFilesDownloads]   = useLazyQuery(SEARCH_FILES_DOWNLOADS,   { fetchPolicy: 'no-cache' });
    const [searchFilesUploads]     = useLazyQuery(SEARCH_FILES_UPLOADS,     { fetchPolicy: 'no-cache' });
    const [searchFilesScreenshots] = useLazyQuery(SEARCH_FILES_SCREENSHOTS, { fetchPolicy: 'no-cache' });
    // Credentials
    const [searchCredsAccount]    = useLazyQuery(SEARCH_CREDS_ACCOUNT,    { fetchPolicy: 'no-cache' });
    const [searchCredsRealm]      = useLazyQuery(SEARCH_CREDS_REALM,      { fetchPolicy: 'no-cache' });
    const [searchCredsCredential] = useLazyQuery(SEARCH_CREDS_CREDENTIAL, { fetchPolicy: 'no-cache' });
    const [searchCredsComment]    = useLazyQuery(SEARCH_CREDS_COMMENT,    { fetchPolicy: 'no-cache' });
    // Artifacts
    const [searchArtifactsArtifact] = useLazyQuery(SEARCH_ARTIFACTS_ARTIFACT, { fetchPolicy: 'no-cache' });
    const [searchArtifactsHost]     = useLazyQuery(SEARCH_ARTIFACTS_HOST,     { fetchPolicy: 'no-cache' });
    const [searchArtifactsType]     = useLazyQuery(SEARCH_ARTIFACTS_TYPE,     { fetchPolicy: 'no-cache' });
    // Keylogs
    const [searchKeylogsKeystroke] = useLazyQuery(SEARCH_KEYLOGS_KEYSTROKE, { fetchPolicy: 'no-cache' });
    const [searchKeylogsUser]      = useLazyQuery(SEARCH_KEYLOGS_USER,      { fetchPolicy: 'no-cache' });
    const [searchKeylogsProgram]   = useLazyQuery(SEARCH_KEYLOGS_PROGRAM,   { fetchPolicy: 'no-cache' });
    // Payloads
    const [searchPayloadsFilename] = useLazyQuery(SEARCH_PAYLOADS_FILENAME, { fetchPolicy: 'no-cache' });
    const [searchPayloadsDesc]     = useLazyQuery(SEARCH_PAYLOADS_DESC,     { fetchPolicy: 'no-cache' });
    const [searchPayloadsUUID]     = useLazyQuery(SEARCH_PAYLOADS_UUID,     { fetchPolicy: 'no-cache' });
    // #6 — Payloads C2 Param
    const [searchPayloadsC2Param]   = useLazyQuery(SEARCH_PAYLOADS_C2PARAM,  { fetchPolicy: 'no-cache' });
    // #7 — Payloads Build Param
    const [searchPayloadsBuildParam] = useLazyQuery(SEARCH_PAYLOADS_BUILDPARAM, { fetchPolicy: 'no-cache' });
    // Tokens
    const [searchTokensUser] = useLazyQuery(SEARCH_TOKENS_USER, { fetchPolicy: 'no-cache' });
    const [searchTokensHost] = useLazyQuery(SEARCH_TOKENS_HOST, { fetchPolicy: 'no-cache' });
    // Processes
    const [searchProcessesName] = useLazyQuery(SEARCH_PROCESSES_NAME, { fetchPolicy: 'no-cache' });
    const [searchProcessesPID]  = useLazyQuery(SEARCH_PROCESSES_PID,  { fetchPolicy: 'no-cache' });
    // SOCKS
    const [searchSocksIP]   = useLazyQuery(SEARCH_SOCKS_IP,   { fetchPolicy: 'no-cache' });
    const [searchSocksPort] = useLazyQuery(SEARCH_SOCKS_PORT, { fetchPolicy: 'no-cache' });
    // Tags
    const [searchTagsTag]    = useLazyQuery(SEARCH_TAGS_TAG,    { fetchPolicy: 'no-cache' });
    const [searchTagsSource] = useLazyQuery(SEARCH_TAGS_SOURCE, { fetchPolicy: 'no-cache' });
    // Tasks — additional fields (#17)
    const [searchTasksHost]     = useLazyQuery(SEARCH_TASKS_HOST,     { fetchPolicy: 'no-cache' });
    const [searchTasksStatus]   = useLazyQuery(SEARCH_TASKS_STATUS,   { fetchPolicy: 'no-cache' });
    const [searchTasksOperator] = useLazyQuery(SEARCH_TASKS_OPERATOR, { fetchPolicy: 'no-cache' });
    // Callbacks — additional fields (#18)
    const [searchCbPID]       = useLazyQuery(SEARCH_CALLBACKS_PID,        { fetchPolicy: 'no-cache' });
    const [searchCbGroup]     = useLazyQuery(SEARCH_CALLBACKS_GROUP,      { fetchPolicy: 'no-cache' });
    const [searchCbDisplayId] = useLazyQuery(SEARCH_CALLBACKS_DISPLAY_ID, { fetchPolicy: 'no-cache' });
    // Artifacts — additional fields (#19)
    const [searchArtifactsCommand]  = useLazyQuery(SEARCH_ARTIFACTS_COMMAND,  { fetchPolicy: 'no-cache' });
    const [searchArtifactsTask]     = useLazyQuery(SEARCH_ARTIFACTS_TASK,     { fetchPolicy: 'no-cache' });
    const [searchArtifactsCallback] = useLazyQuery(SEARCH_ARTIFACTS_CALLBACK, { fetchPolicy: 'no-cache' });
    const [searchArtifactsOperator] = useLazyQuery(SEARCH_ARTIFACTS_OPERATOR, { fetchPolicy: 'no-cache' });
    // Files — individual fields (#26)
    const [searchFilesFilename] = useLazyQuery(SEARCH_FILES_FILENAME, { fetchPolicy: 'no-cache' });
    const [searchFilesHash]     = useLazyQuery(SEARCH_FILES_HASH,     { fetchPolicy: 'no-cache' });
    const [searchFilesComment]  = useLazyQuery(SEARCH_FILES_COMMENT,  { fetchPolicy: 'no-cache' });
    const [searchFilesTag]      = useLazyQuery(SEARCH_FILES_TAG,      { fetchPolicy: 'no-cache' });
    const [searchFilesUUID]     = useLazyQuery(SEARCH_FILES_UUID,     { fetchPolicy: 'no-cache' });
    // #9 — Files Eventing Workflows
    const [searchFilesEventing] = useLazyQuery(SEARCH_FILES_EVENTING, { fetchPolicy: 'no-cache' });
    // #4 — Files File Browser
    const [searchFilesFileBrowser] = useLazyQuery(SEARCH_FILES_FILEBROWSER, { fetchPolicy: 'no-cache' });
    // Credentials — Tag (#27)
    const [searchCredsTag] = useLazyQuery(SEARCH_CREDS_TAG, { fetchPolicy: 'no-cache' });
    // Keylogs — Host (#33)
    const [searchKeylogsHost] = useLazyQuery(SEARCH_KEYLOGS_HOST, { fetchPolicy: 'no-cache' });
    // #10 — Keylogs unique mode
    const [searchKeylogsUniqueUser]    = useLazyQuery(SEARCH_KEYLOGS_UNIQUE_USER,    { fetchPolicy: 'no-cache' });
    const [searchKeylogsUniqueProgram] = useLazyQuery(SEARCH_KEYLOGS_UNIQUE_PROGRAM, { fetchPolicy: 'no-cache' });
    // Tokens — SID (#34)
    const [searchTokensSID] = useLazyQuery(SEARCH_TOKENS_SID, { fetchPolicy: 'no-cache' });
    // Browsers (#16)
    const [searchBrowsersPath]    = useLazyQuery(SEARCH_BROWSERS_PATH,    { fetchPolicy: 'no-cache' });
    const [searchBrowsersHost]    = useLazyQuery(SEARCH_BROWSERS_HOST,    { fetchPolicy: 'no-cache' });
    const [searchBrowsersName]    = useLazyQuery(SEARCH_BROWSERS_NAME,    { fetchPolicy: 'no-cache' });
    const [searchBrowsersComment] = useLazyQuery(SEARCH_BROWSERS_COMMENT, { fetchPolicy: 'no-cache' });

    // #11 — SOCKS live subscription mode
    const [socksLive, setSocksLive] = useState(false);
    const { data: socksSubData } = useSubscription(SUBSCRIBE_SOCKS, { skip: !socksLive || activeTab !== 'socks' });
    useEffect(() => {
        if (socksLive && activeTab === 'socks' && socksSubData?.callbackport) {
            setResults(socksSubData.callbackport);
            setTotalCount(socksSubData.callbackport.length);
        }
    }, [socksSubData, socksLive, activeTab]);

    // #8 — Artifacts needs_cleanup / resolved filter
    const [artifactCleanup, setArtifactCleanup] = useState<'Any' | 'True' | 'False'>('Any');

    const executeSearch = useCallback(async () => {
        // #10 — Keylogs unique mode: allow empty search for User/Program distinct
        const isKeylogUnique = activeTab === 'keylogs' && !searchQuery.trim() && (searchField === 'User' || searchField === 'Program');
        if (!searchQuery.trim() && !isKeylogUnique) { setResults([]); setTotalCount(0); return; }
        setLoading(true);
        const s = `%${searchQuery}%`;
        const vars = { search: s, offset: (page - 1) * limit, limit };
        try {
            let data: any;
            switch (activeTab) {
                case 'tasks':
                    if (searchField === 'Response') data = await searchTasksResponse({ variables: vars });
                    else if (searchField === 'Command') data = await searchTasksCommand({ variables: vars });
                    else if (searchField === 'Comment') data = await searchTasksComment({ variables: vars });
                    else if (searchField === 'Tag') data = await searchTasksTag({ variables: vars });
                    else if (searchField === 'Callback ID') {
                        const cbId = parseInt(searchQuery);
                        if (!isNaN(cbId)) data = await searchTasksCbId({ variables: { search: cbId, offset: (page - 1) * limit, limit } });
                        else { setResults([]); setTotalCount(0); break; }
                    }
                    else if (searchField === 'Callback Group') data = await searchTasksCbGroup({ variables: { search: searchQuery, offset: (page - 1) * limit, limit } });
                    else if (searchField === 'Host') data = await searchTasksHost({ variables: vars });
                    else if (searchField === 'Status') data = await searchTasksStatus({ variables: vars });
                    else if (searchField === 'Operator') data = await searchTasksOperator({ variables: vars });
                    else data = await searchTasksParams({ variables: vars });
                    setResults(data.data?.task || []);
                    setTotalCount(data.data?.task_aggregate?.aggregate?.count || 0);
                    break;
                case 'callbacks':
                    if (searchField === 'User') data = await searchCbUser({ variables: vars });
                    else if (searchField === 'Domain') data = await searchCbDomain({ variables: vars });
                    else if (searchField === 'IP') data = await searchCbIP({ variables: vars });
                    else if (searchField === 'Description') data = await searchCbDesc({ variables: vars });
                    else if (searchField === 'Agent') data = await searchCbAgent({ variables: vars });
                    else if (searchField === 'OS') data = await searchCbOS({ variables: vars });
                    else if (searchField === 'Architecture') data = await searchCbArch({ variables: vars });
                    else if (searchField === 'PID') {
                        const pidNum = parseInt(searchQuery);
                        if (!isNaN(pidNum)) data = await searchCbPID({ variables: { search: pidNum, offset: (page - 1) * limit, limit } });
                        else { setResults([]); setTotalCount(0); break; }
                    }
                    else if (searchField === 'Group') data = await searchCbGroup({ variables: { search: searchQuery, offset: (page - 1) * limit, limit } });
                    else if (searchField === 'Display ID') {
                        const dispId = parseInt(searchQuery);
                        if (!isNaN(dispId)) data = await searchCbDisplayId({ variables: { search: dispId, offset: (page - 1) * limit, limit } });
                        else { setResults([]); setTotalCount(0); break; }
                    }
                    else data = await searchCbHost({ variables: vars });
                    setResults(data.data?.callback || []);
                    setTotalCount(data.data?.callback_aggregate?.aggregate?.count || 0);
                    break;
                case 'files':
                    if (searchField === 'Uploads') data = await searchFilesUploads({ variables: vars });
                    else if (searchField === 'Screenshots') data = await searchFilesScreenshots({ variables: vars });
                    else if (searchField === 'Filename') data = await searchFilesFilename({ variables: vars });
                    else if (searchField === 'Hash') data = await searchFilesHash({ variables: vars });
                    else if (searchField === 'Comment') data = await searchFilesComment({ variables: vars });
                    else if (searchField === 'Tag') data = await searchFilesTag({ variables: vars });
                    else if (searchField === 'UUID') data = await searchFilesUUID({ variables: vars });
                    else if (searchField === 'Eventing Workflows') {
                        data = await searchFilesEventing({ variables: vars });
                        setResults(data.data?.eventstepinstance || []);
                        setTotalCount(data.data?.eventstepinstance_aggregate?.aggregate?.count || 0);
                        break;
                    }
                    else if (searchField === 'File Browser') {
                        data = await searchFilesFileBrowser({ variables: vars });
                        setResults(data.data?.mythictree || []);
                        setTotalCount(data.data?.mythictree_aggregate?.aggregate?.count || 0);
                        break;
                    }
                    else data = await searchFilesDownloads({ variables: vars });
                    setResults(data.data?.filemeta || []);
                    setTotalCount(data.data?.filemeta_aggregate?.aggregate?.count || 0);
                    break;
                case 'credentials':
                    if (searchField === 'Realm') data = await searchCredsRealm({ variables: vars });
                    else if (searchField === 'Credential') data = await searchCredsCredential({ variables: vars });
                    else if (searchField === 'Comment') data = await searchCredsComment({ variables: vars });
                    else if (searchField === 'Tag') data = await searchCredsTag({ variables: vars });
                    else data = await searchCredsAccount({ variables: vars });
                    setResults(data.data?.credential || []);
                    setTotalCount(data.data?.credential_aggregate?.aggregate?.count || 0);
                    break;
                case 'artifacts':
                    if (searchField === 'Host') data = await searchArtifactsHost({ variables: vars });
                    else if (searchField === 'Type') data = await searchArtifactsType({ variables: vars });
                    else if (searchField === 'Command') data = await searchArtifactsCommand({ variables: vars });
                    else if (searchField === 'Task') {
                        const taskId = parseInt(searchQuery);
                        if (!isNaN(taskId)) data = await searchArtifactsTask({ variables: { search: taskId, offset: (page - 1) * limit, limit } });
                        else { setResults([]); setTotalCount(0); break; }
                    }
                    else if (searchField === 'Callback') {
                        const cbId = parseInt(searchQuery);
                        if (!isNaN(cbId)) data = await searchArtifactsCallback({ variables: { search: cbId, offset: (page - 1) * limit, limit } });
                        else { setResults([]); setTotalCount(0); break; }
                    }
                    else if (searchField === 'Operator') data = await searchArtifactsOperator({ variables: vars });
                    else data = await searchArtifactsArtifact({ variables: vars });
                    setResults(data.data?.taskartifact || []);
                    setTotalCount(data.data?.taskartifact_aggregate?.aggregate?.count || 0);
                    break;
                case 'keylogs':
                    // #10 — unique mode for empty searches
                    if (!searchQuery.trim() && searchField === 'User') {
                        data = await searchKeylogsUniqueUser({ variables: { offset: (page - 1) * limit, limit } });
                    } else if (!searchQuery.trim() && searchField === 'Program') {
                        data = await searchKeylogsUniqueProgram({ variables: { offset: (page - 1) * limit, limit } });
                    } else if (searchField === 'User') data = await searchKeylogsUser({ variables: vars });
                    else if (searchField === 'Program') data = await searchKeylogsProgram({ variables: vars });
                    else if (searchField === 'Host') data = await searchKeylogsHost({ variables: vars });
                    else data = await searchKeylogsKeystroke({ variables: vars });
                    setResults(data.data?.keylog || []);
                    setTotalCount(data.data?.keylog_aggregate?.aggregate?.count || 0);
                    break;
                case 'payloads':
                    if (searchField === 'Description') data = await searchPayloadsDesc({ variables: vars });
                    else if (searchField === 'UUID') data = await searchPayloadsUUID({ variables: vars });
                    else if (searchField === 'C2 Parameter Value') data = await searchPayloadsC2Param({ variables: vars });
                    else if (searchField === 'Build Parameter') data = await searchPayloadsBuildParam({ variables: vars });
                    else data = await searchPayloadsFilename({ variables: vars });
                    setResults(data.data?.payload || []);
                    setTotalCount(data.data?.payload_aggregate?.aggregate?.count || 0);
                    break;
                case 'tokens':
                    if (searchField === 'Host') data = await searchTokensHost({ variables: vars });
                    else if (searchField === 'SID') data = await searchTokensSID({ variables: vars });
                    else data = await searchTokensUser({ variables: vars });
                    setResults(data.data?.token || []);
                    setTotalCount(data.data?.token_aggregate?.aggregate?.count || 0);
                    break;
                case 'processes':
                    if (searchField === 'PID') data = await searchProcessesPID({ variables: vars });
                    else data = await searchProcessesName({ variables: vars });
                    setResults(data.data?.mythictree || []);
                    setTotalCount(data.data?.mythictree_aggregate?.aggregate?.count || 0);
                    break;
                case 'socks':
                    if (searchField === 'Port') {
                        const portNum = parseInt(searchQuery);
                        if (!isNaN(portNum)) data = await searchSocksPort({ variables: { search: portNum, offset: (page - 1) * limit, limit } });
                        else { setResults([]); setTotalCount(0); break; }
                    } else data = await searchSocksIP({ variables: vars });
                    setResults(data?.data?.callbackport || []);
                    setTotalCount(data?.data?.callbackport_aggregate?.aggregate?.count || 0);
                    break;
                case 'tags':
                    if (searchField === 'Source') data = await searchTagsSource({ variables: vars });
                    else data = await searchTagsTag({ variables: vars });
                    setResults(data?.data?.tag || []);
                    setTotalCount(data?.data?.tag_aggregate?.aggregate?.count || 0);
                    break;
                case 'browsers':
                    if (searchField === 'Host') data = await searchBrowsersHost({ variables: vars });
                    else if (searchField === 'Name') data = await searchBrowsersName({ variables: vars });
                    else if (searchField === 'Comment') data = await searchBrowsersComment({ variables: vars });
                    else data = await searchBrowsersPath({ variables: vars });
                    setResults(data?.data?.mythictree || []);
                    setTotalCount(data?.data?.mythictree_aggregate?.aggregate?.count || 0);
                    break;
                default:
                    setResults([]); setTotalCount(0);
            }
        } catch (error: any) {
            console.error('Search error:', error);
            snackActions.error('Search failed: ' + (error?.message || 'Unknown error'));
            setResults([]); setTotalCount(0);
        } finally {
            setLoading(false);
        }
    }, [
        searchQuery, activeTab, searchField, page,
        searchTasksParams, searchTasksResponse, searchTasksCommand, searchTasksComment,
        searchTasksTag, searchTasksCbId, searchTasksCbGroup,
        searchTasksHost, searchTasksStatus, searchTasksOperator,
        searchCbHost, searchCbUser, searchCbDomain, searchCbIP, searchCbDesc,
        searchCbAgent, searchCbOS, searchCbArch, searchCbPID, searchCbGroup, searchCbDisplayId,
        searchFilesDownloads, searchFilesUploads, searchFilesScreenshots, searchFilesFileBrowser,
        searchFilesFilename, searchFilesHash, searchFilesComment, searchFilesTag, searchFilesUUID,
        searchCredsAccount, searchCredsRealm, searchCredsCredential, searchCredsComment, searchCredsTag,
        searchArtifactsArtifact, searchArtifactsHost, searchArtifactsType,
        searchArtifactsCommand, searchArtifactsTask, searchArtifactsCallback, searchArtifactsOperator,
        searchKeylogsKeystroke, searchKeylogsUser, searchKeylogsProgram, searchKeylogsHost,
        searchKeylogsUniqueUser, searchKeylogsUniqueProgram,
        searchPayloadsFilename, searchPayloadsDesc, searchPayloadsUUID,
        searchPayloadsC2Param, searchPayloadsBuildParam,
        searchTokensUser, searchTokensHost, searchTokensSID,
        searchProcessesName, searchProcessesPID,
        searchSocksIP, searchSocksPort,
        searchTagsTag, searchTagsSource,
        searchBrowsersPath, searchBrowsersHost, searchBrowsersName, searchBrowsersComment,
        searchFilesEventing,
    ]);

    useEffect(() => { executeSearch(); }, [executeSearch]);

    const handleTabChange = (tab: SearchTab) => {
        const firstField = TAB_FIELDS[tab]?.[0] || '';
        setActiveTab(tab);
        setSearchField(firstField);
        setPage(1);
        setResults([]);
        setTotalCount(0);
        setSearchParams({ tab, field: firstField, q: searchQuery });
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchQuery(inputValue);
        setPage(1);
        setSearchParams({ tab: activeTab, field: searchField, q: inputValue });
    };

    const handleFieldChange = (field: string) => {
        setSearchField(field);
        setPage(1);
        setSearchParams({ tab: activeTab, field, q: searchQuery });
    };

    const renderResults = () => {
        if (loading) return (
            <div className="flex items-center justify-center h-48">
                <Loader2 size={28} className="text-signal animate-spin" />
            </div>
        );
        if (!searchQuery && !(activeTab === 'keylogs' && (searchField === 'User' || searchField === 'Program'))) return (
            <div className="flex flex-col items-center justify-center h-48 text-gray-600">
                <SearchIcon size={40} className="mb-3 opacity-30" />
                <p className="font-mono text-sm tracking-widest">ENTER_QUERY_TO_SEARCH</p>
                <p className="text-xs mt-1.5 opacity-60">Searching {activeTab} by {searchField}</p>
                {activeTab === 'keylogs' && (searchField === 'User' || searchField === 'Program') && (
                    <p className="text-xs mt-2 opacity-80 text-signal/60">Leave empty to see one entry for each unique {searchField.toLowerCase()}</p>
                )}
            </div>
        );
        if (results.length === 0) return (
            <div className="flex flex-col items-center justify-center h-48 text-gray-600">
                <AlertCircle size={40} className="mb-3 opacity-30" />
                <p className="font-mono text-sm tracking-widest">NO_RESULTS</p>
                <p className="text-xs mt-1.5 opacity-60">Try a different term or field</p>
            </div>
        );
        return (
            <div className="space-y-2">
                {results.map((item, idx) => {
                    switch (activeTab) {
                        case 'tasks':       return <TaskResult       key={item.id ?? idx} task={item} />;
                        case 'callbacks':   return <CallbackResult   key={item.id ?? idx} callback={item} />;
                        case 'files':       return <FileResult       key={item.id ?? idx} file={item} />;
                        case 'credentials': return <CredentialResult key={item.id ?? idx} credential={item} />;
                        case 'artifacts':   return <ArtifactResult   key={item.id ?? idx} artifact={item} />;
                        case 'keylogs':     return <KeylogResult     key={item.id ?? idx} keylog={item} />;
                        case 'payloads':    return <PayloadResult    key={item.id ?? idx} payload={item} />;
                        case 'tokens':      return <TokenResult      key={item.id ?? idx} token={item} />;
                        case 'processes':   return <ProcessResult    key={item.id ?? idx} process={item} />;
                        case 'socks':       return <SocksResult      key={item.id ?? idx} socks={item} />;
                        case 'tags':        return <TagResultItem    key={item.id ?? idx} tag={item} />;
                        case 'browsers':    return <BrowserResult    key={item.id ?? idx} browser={item} />;
                        default: return null;
                    }
                })}
            </div>
        );
    };

    const totalPages = Math.ceil(totalCount / limit);

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <Sidebar />

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={cn(
                    "transition-all duration-300 p-6 lg:p-12 h-screen flex flex-col overflow-hidden",
                    isSidebarCollapsed ? "ml-16" : "ml-64"
                )}
            >
                {/* Header */}
                <header className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded">
                            <SearchIcon size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">SEARCH</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                GLOBAL SEARCH
                            </p>
                        </div>
                    </div>
                </header>

                {/* Search Controls */}
                <div className="shrink-0 mb-6">
                    <div className="py-3">
                        <form onSubmit={handleSearch} className="flex items-center gap-2">
                            {/* Field selector */}
                            <FieldSelector
                                options={TAB_FIELDS[activeTab] || []}
                                value={searchField}
                                onChange={handleFieldChange}
                            />
                            {/* Search input */}
                            <div className="flex-1 relative">
                                <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={e => setInputValue(e.target.value)}
                                    placeholder={`Search ${activeTab} by ${searchField}...`}
                                    className="w-full h-10 pl-9 pr-4 bg-black/50 border border-ghost/30 text-white placeholder-gray-600 focus:border-signal/50 focus:outline-none font-mono text-sm"
                                />
                            </div>
                            <button
                                type="submit"
                                className="h-10 px-5 bg-signal hover:bg-signal/80 text-void font-bold font-mono text-xs transition-colors flex items-center gap-2 shrink-0"
                            >
                                <SearchIcon size={14} /> SEARCH
                            </button>
                            {/* #11 — SOCKS live toggle */}
                            {activeTab === 'socks' && (
                                <button type="button" onClick={() => setSocksLive(prev => !prev)}
                                    className={cn("h-10 px-3 font-mono text-[10px] font-bold border transition-colors shrink-0",
                                        socksLive ? "border-green-400/50 bg-green-400/10 text-green-400" : "border-ghost/30 text-gray-500 hover:text-gray-300"
                                    )}>
                                    {socksLive ? '● LIVE' : '○ LIVE'}
                                </button>
                            )}
                            {/* #8 — Artifacts cleanup filter */}
                            {activeTab === 'artifacts' && (
                                <select value={artifactCleanup} onChange={e => setArtifactCleanup(e.target.value as any)}
                                    className="h-10 px-2 bg-black/50 border border-ghost/30 text-gray-300 font-mono text-[10px] focus:border-signal/50 focus:outline-none">
                                    <option value="Any">Cleanup: Any</option>
                                    <option value="True">Needs Cleanup</option>
                                    <option value="False">Resolved</option>
                                </select>
                            )}
                        </form>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-0.5 overflow-x-auto pb-0 cyber-scrollbar">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-2.5 text-xs font-mono font-bold whitespace-nowrap transition-colors border-b-2",
                                    activeTab === tab.id
                                        ? "border-signal text-signal"
                                        : "border-transparent text-gray-500 hover:text-gray-200 hover:border-gray-500/40"
                                )}
                            >
                                {tab.icon}
                                {tab.label.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Results */}
                <div className="flex-1 overflow-y-auto cyber-scrollbar">
                    {searchQuery && !loading && (
                        <div className="mb-3 text-xs text-gray-500 font-mono flex items-center gap-2">
                            <span className="text-signal">{totalCount}</span> results for
                            "<span className="text-white">{searchQuery}</span>"
                            <span className="text-gray-600">in</span>
                            <span className="text-signal">{activeTab} / {searchField}</span>
                        </div>
                    )}
                    {renderResults()}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="border-t border-ghost/30 py-3 flex items-center justify-center gap-2 shrink-0">
                        {[
                            { label: '«', action: () => setPage(1),            disabled: page === 1 },
                            { label: '‹', action: () => setPage(p => p - 1),   disabled: page === 1 },
                            { label: '›', action: () => setPage(p => p + 1),   disabled: page === totalPages },
                            { label: '»', action: () => setPage(totalPages),   disabled: page === totalPages },
                        ].map(({ label, action, disabled }) => (
                            <button
                                key={label}
                                onClick={action}
                                disabled={disabled}
                                className="w-8 h-8 flex items-center justify-center border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-sm"
                            >
                                {label}
                            </button>
                        ))}
                        <span className="px-3 text-gray-500 font-mono text-xs">
                            {page} / {totalPages}
                        </span>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default Search;
