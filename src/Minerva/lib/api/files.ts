import { gql } from '@apollo/client';

export const FILE_DATA_FRAGMENT = gql`
    fragment fileObjData on mythictree {
        comment
        deleted
        task_id
        filemeta {
            id
            agent_file_id
            filename_text
        }
        tags {
            tagtype {
                name
                color
                id
            }
        }
        host
        id
        can_have_children
        has_children
        success
        full_path_text
        name_text
        timestamp
        parent_path_text
        tree_type
        metadata
        callback {
            id
            display_id
            mythictree_groups
        }
    }
`;

export const GET_FILE_TREE_ROOT = gql`
    ${FILE_DATA_FRAGMENT}
    query myRootFolderQuery($host: String!) {
        mythictree(where: { parent_path_text: { _eq: "" }, tree_type: {_eq: "file"}, host: {_ilike: $host} }, order_by: {name_text: asc}) {
            ...fileObjData
        }
    }
`;

export const GET_FILE_TREE_FOLDER = gql`
    ${FILE_DATA_FRAGMENT}
    query myFolderQuery($parent_path_text: String!, $host: String!) {
        children: mythictree(
            where: { parent_path_text: { _eq: $parent_path_text }, tree_type: {_eq: "file"}, host: {_ilike: $host} }
            order_by: { can_have_children: asc, name_text: asc }
        ) {
            ...fileObjData
        }
    }
`;

// Extended folder query that also fetches parent nodes + the folder itself.
// Used by the upgraded FileBrowser's in-memory adjacency-matrix architecture.
export const GET_FILE_TREE_FOLDER_WITH_PARENTS = gql`
    ${FILE_DATA_FRAGMENT}
    query myFolderQueryWithParents($parent_path_text: String!, $host: String!, $parents: [String!]) {
        children: mythictree(
            where: { parent_path_text: { _eq: $parent_path_text }, tree_type: {_eq: "file"}, host: {_ilike: $host} }
            order_by: { can_have_children: asc, name_text: asc }
        ) {
            ...fileObjData
        }
        parents: mythictree(
            where: { full_path_text: { _in: $parents }, tree_type: {_eq: "file"}, host: {_ilike: $host} }
            order_by: { can_have_children: asc, name_text: asc }
        ) {
            ...fileObjData
        }
        self: mythictree(
            where: { full_path_text: { _eq: $parent_path_text }, tree_type: {_eq: "file"}, host: {_ilike: $host} }
        ) {
            ...fileObjData
        }
    }
`;

// Real-time subscription — pushes incremental mythictree updates for a given host.
export const MYTHICTREE_FILE_SUBSCRIPTION = gql`
    ${FILE_DATA_FRAGMENT}
    subscription liveFileData($now: timestamp!, $host: String!) {
        mythictree_stream(
            batch_size: 1000,
            cursor: { initial_value: { timestamp: $now } },
            where: { tree_type: { _eq: "file" }, host: { _ilike: $host } }
        ) {
            ...fileObjData
        }
    }
`;

// Mutation to edit the comment on a mythictree node.
export const UPDATE_MYTHICTREE_COMMENT = gql`
    mutation UpdateMythictreeComment($id: Int!, $comment: String!) {
        update_mythictree_by_pk(pk_columns: { id: $id }, _set: { comment: $comment }) {
            id
            comment
        }
    }
`;

// Query to check which commands are loaded for a callback (used to show dynamic action names).
export const GET_LOADED_COMMANDS_FOR_UI = gql`
    query GetLoadedCommandsForUI($callback_id: Int!) {
        loadedcommands(where: { callback_id: { _eq: $callback_id } }) {
            id
            callback_id
            command {
                id
                cmd
                supported_ui_features
            }
        }
    }
`;

// Subscribe to file-browser task status so errors surface as notifications.
export const FILEBROWSER_TASK_SUBSCRIPTION = gql`
    subscription FileBrowserTaskSub($now: timestamp!, $callback_id: Int!) {
        task_stream(
            batch_size: 100,
            cursor: { initial_value: { timestamp: $now } },
            where: {
                callback_id: { _eq: $callback_id },
                tasking_location: { _eq: "file_browser" }
            }
        ) {
            id
            display_id
            status
            command_name
            opsec_pre_blocked
            opsec_post_blocked
        }
    }
`;

export const PROCESS_DATA_FRAGMENT = gql`
fragment treeObjData on mythictree {
    comment
    deleted
    task_id
    tags {
        tagtype {
            name
            color
            id
        }
        id
    }
    host
    id
    os
    can_have_children
    success
    full_path_text
    name_text
    timestamp
    parent_path_text
    tree_type
    metadata
    callback {
        id
        display_id
        mythictree_groups
    }
}
`;

export const GET_UPLOADED_FILES = gql`
    query GetUploadedFiles {
        filemeta(
            where: {
                is_download_from_agent: {_eq: false}
                is_screenshot: {_eq: false}
                is_payload: {_eq: false}
                deleted: {_eq: false}
                complete: {_eq: true}
                task_id: {_is_null: true}
            }
            order_by: {id: desc}
            limit: 300
        ) {
            agent_file_id
            filename_text
            size
            comment
            timestamp
            operator { username }
        }
    }
`;

export const GET_BUILT_PAYLOADS = gql`
    query GetBuiltPayloads {
        payload(
            where: {
                build_phase: {_eq: "success"}
                deleted: {_eq: false}
                auto_generated: {_eq: false}
            }
            order_by: {id: desc}
            limit: 200
        ) {
            id
            uuid
            description
            creation_time
            payloadtype { name }
            filemetum {
                agent_file_id
                filename_text
                size
            }
        }
    }
`;

export const GET_PROCESS_TREE = gql`
    ${PROCESS_DATA_FRAGMENT}
    query processesPerHostQuery($host: String!){
        mythictree(where: {host: {_ilike: $host}, tree_type: {_eq: "process"} }, order_by: {id: asc}) {
            ...treeObjData
        }
    }
`;

export const GET_PROCESS_HOSTS = gql`
    query getProcessHosts {
        mythictree(where: {tree_type: {_eq: "process"}}, distinct_on: host) {
            host
        }
    }
`;

