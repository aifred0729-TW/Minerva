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

// ============================================
// Files page GraphQL definitions
// ============================================

export const FILE_FRAGMENT = `
    id agent_file_id filename_text full_remote_path_text
    host size chunk_size complete deleted
    md5 sha1 timestamp comment chunks_received total_chunks
    operator { username }
    task {
        display_id comment
        command { cmd id }
        callback { display_id mythictree_groups }
    }
    eventgroup { name id }
    copy_of_file {
        id agent_file_id filename_text full_remote_path_text
        host size complete deleted md5 sha1 timestamp comment
        chunks_received total_chunks
        task {
            display_id comment
            command { cmd id }
            callback { display_id mythictree_groups }
        }
    }
    tags { id data tagtype { name color } }
`;

export const GET_MYTHIC_FILES = gql`
    query GetMythicFiles($deleted: Boolean!) {
        downloads: filemeta(
            where: {
                is_download_from_agent: { _eq: true },
                is_screenshot: { _eq: false },
                deleted: { _eq: $deleted }
            },
            order_by: { id: desc },
            limit: 2000
        ) { ${FILE_FRAGMENT} }
        uploads: filemeta(
            where: {
                is_download_from_agent: { _eq: false },
                is_screenshot: { _eq: false },
                is_payload: { _eq: false },
                eventgroup_id: { _is_null: true },
                deleted: { _eq: $deleted }
            },
            order_by: { id: desc },
            limit: 2000
        ) { ${FILE_FRAGMENT} }
        screenshots: filemeta(
            where: {
                is_screenshot: { _eq: true },
                deleted: { _eq: $deleted }
            },
            order_by: { id: desc },
            limit: 1000
        ) { ${FILE_FRAGMENT} }
        eventing: filemeta(
            where: {
                eventgroup_id: { _is_null: false },
                deleted: { _eq: $deleted }
            },
            order_by: { id: desc },
            limit: 2000
        ) { ${FILE_FRAGMENT} }
    }
`;

export const DELETE_FILE_MUTATION = gql`
    mutation DeleteFile($file_id: Int) {
        deleteFile(file_id: $file_id) {
            status error file_ids
        }
    }
`;

export const DELETE_FILES_BULK_MUTATION = gql`
    mutation DeleteFilesBulk($file_ids: [Int!]) {
        deleteFile(file_ids: $file_ids) {
            status error file_ids
        }
    }
`;

export const DOWNLOAD_BULK_MUTATION = gql`
    mutation DownloadBulk($files: [String!]!) {
        download_bulk(files: $files) {
            status error file_id
        }
    }
`;

export const UPDATE_FILE_COMMENT = gql`
    mutation UpdateFileComment($file_id: Int!, $comment: String!) {
        update_filemeta_by_pk(pk_columns: { id: $file_id }, _set: { comment: $comment }) {
            id comment
        }
    }
`;

export const GET_FILE_TAGTYPES = gql`
    query GetTagTypes { tagtype(order_by: {name: asc}) { id name color description } }
`;

export const GET_FILE_TAGS = gql`
    query GetFileTags($filemeta_id: Int!) {
        tag(where: {filemeta_id: {_eq: $filemeta_id}}, order_by: {tagtype: {name: asc}}) {
            id source url data
            tagtype { id name color description }
        }
    }
`;

export const CREATE_TAG_MUTATION = gql`
    mutation CreateTag($filemeta_id: Int!, $tagtype_id: Int!, $source: String!, $url: String!, $data: jsonb!) {
        createTag(filemeta_id: $filemeta_id, tagtype_id: $tagtype_id, source: $source, url: $url, data: $data) {
            id status error
        }
    }
`;

export const UPDATE_TAG_MUTATION = gql`
    mutation UpdateTag($tag_id: Int!, $source: String!, $url: String!, $data: jsonb!) {
        update_tag_by_pk(pk_columns: {id: $tag_id}, _set: {source: $source, url: $url, data: $data}) { id }
    }
`;

export const DELETE_TAG_MUTATION = gql`
    mutation DeleteTag($tag_id: Int!) {
        delete_tag_by_pk(id: $tag_id) { id }
    }
`;

export const GET_C2_PROFILES_FOR_HOSTING = gql`
    query GetC2Profiles {
        c2profile(where: {deleted: {_eq: false}, container_running: {_eq: true}, is_p2p: {_eq: false}}, order_by: {name: asc}) {
            id name
        }
    }
`;

export const HOST_FILE_MUTATION = gql`
    mutation HostFile($c2_id: Int!, $file_uuid: String!, $host_url: String!, $alert_on_download: Boolean, $remove: Boolean) {
        c2HostFile(c2_id: $c2_id, file_uuid: $file_uuid, host_url: $host_url, alert_on_download: $alert_on_download, remove: $remove) {
            status error
        }
    }
`;

export const MYTHICTREE_FRAGMENT = `
    id full_path_text host comment deleted metadata can_have_children
    filemeta { id agent_file_id chunks_received complete size total_chunks timestamp }
    task { display_id id }
    callback { id display_id mythictree_groups }
    tags { id data tagtype { name color } }
`;

export const SEARCH_FILEMETA_QUERY = gql`
    query SearchFilemeta($where: filemeta_bool_exp!, $offset: Int!, $limit: Int!) {
        filemeta(where: $where, offset: $offset, limit: $limit, order_by: {id: desc}) {
            ${FILE_FRAGMENT}
        }
        filemeta_aggregate(where: $where) {
            aggregate { count }
        }
    }
`;

export const SEARCH_MYTHICTREE_QUERY = gql`
    query SearchMythictree($where: mythictree_bool_exp!, $offset: Int!, $limit: Int!) {
        mythictree(where: $where, offset: $offset, limit: $limit, order_by: {id: desc}) {
            ${MYTHICTREE_FRAGMENT}
        }
        mythictree_aggregate(where: $where) {
            aggregate { count }
        }
    }
`;

// ─── FileBrowser: Mythic server file queries ────────────────
export const GET_MYTHIC_DOWNLOADS = gql`
    query GetMythicDownloads {
        filemeta(
            where: {
                is_download_from_agent: { _eq: true },
                is_screenshot: { _eq: false },
                deleted: { _eq: false }
            },
            order_by: { id: desc },
            limit: 100
        ) {
            id
            agent_file_id
            filename_text
            full_remote_path_text
            host
            size
            complete
            deleted
            md5
            sha1
            timestamp
            comment
            chunks_received
            total_chunks
            operator { username }
            task {
                display_id
                callback { display_id }
            }
        }
    }
`;

export const GET_MYTHIC_UPLOADS = gql`
    query GetMythicUploads {
        filemeta(
            where: {
                is_download_from_agent: { _eq: false },
                is_screenshot: { _eq: false },
                is_payload: { _eq: false },
                deleted: { _eq: false }
            },
            order_by: { id: desc },
            limit: 100
        ) {
            id
            agent_file_id
            filename_text
            full_remote_path_text
            host
            size
            complete
            deleted
            md5
            sha1
            timestamp
            comment
            chunks_received
            total_chunks
            operator { username }
            task {
                display_id
                callback { display_id }
            }
        }
    }
`;

export const GET_MYTHIC_SCREENSHOTS = gql`
    query GetMythicScreenshots {
        filemeta(
            where: {
                is_screenshot: { _eq: true },
                deleted: { _eq: false }
            },
            order_by: { id: desc },
            limit: 50
        ) {
            id
            agent_file_id
            filename_text
            host
            size
            complete
            timestamp
            task {
                display_id
                callback { display_id }
            }
        }
    }
`;

