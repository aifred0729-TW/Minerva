import { gql } from '@apollo/client';

// ============================================
// Fragment
// ============================================
export const CREDENTIAL_FRAGMENT = gql`
    fragment CredentialData on credential {
        id account realm type credential_text comment deleted timestamp
        operator { username }
        task {
            display_id id
            callback { id host display_id mythictree_groups }
        }
        tags { id tagtype { name color id } }
    }
`;

// ============================================
// Queries
// ============================================
export const ACCOUNT_SEARCH = gql`
    ${CREDENTIAL_FRAGMENT}
    query accountQuery($operation_id: Int!, $account: String!, $offset: Int!, $fetchLimit: Int!, $deleted: Boolean!) {
        credential_aggregate(distinct_on: id, where: {account: {_ilike: $account}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            aggregate { count }
        }
        credential(limit: $fetchLimit, distinct_on: id, offset: $offset, order_by: {id: desc}, where: {account: {_ilike: $account}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            ...CredentialData
        }
    }
`;
export const REALM_SEARCH = gql`
    ${CREDENTIAL_FRAGMENT}
    query realmQuery($operation_id: Int!, $realm: String!, $offset: Int!, $fetchLimit: Int!, $deleted: Boolean!) {
        credential_aggregate(distinct_on: id, where: {realm: {_ilike: $realm}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            aggregate { count }
        }
        credential(limit: $fetchLimit, distinct_on: id, offset: $offset, order_by: {id: desc}, where: {realm: {_ilike: $realm}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            ...CredentialData
        }
    }
`;
export const CREDENTIAL_SEARCH = gql`
    ${CREDENTIAL_FRAGMENT}
    query credQuery($operation_id: Int!, $credential: String!, $offset: Int!, $fetchLimit: Int!, $deleted: Boolean!) {
        credential_aggregate(distinct_on: id, where: {credential_text: {_ilike: $credential}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            aggregate { count }
        }
        credential(limit: $fetchLimit, distinct_on: id, offset: $offset, order_by: {id: desc}, where: {credential_text: {_ilike: $credential}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            ...CredentialData
        }
    }
`;
export const COMMENT_SEARCH = gql`
    ${CREDENTIAL_FRAGMENT}
    query commentQuery($operation_id: Int!, $comment: String!, $offset: Int!, $fetchLimit: Int!, $deleted: Boolean!) {
        credential_aggregate(distinct_on: id, where: {comment: {_ilike: $comment}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            aggregate { count }
        }
        credential(limit: $fetchLimit, distinct_on: id, offset: $offset, order_by: {id: desc}, where: {comment: {_ilike: $comment}, operation_id: {_eq: $operation_id}, deleted: {_eq: $deleted}}) {
            ...CredentialData
        }
    }
`;
export const TAG_SEARCH = gql`
    ${CREDENTIAL_FRAGMENT}
    query tagQuery($tag: String!, $offset: Int!, $fetchLimit: Int!) {
        tag_aggregate(distinct_on: credential_id, where: {credential_id: {_is_null: false}, _or: [{data: {_cast: {String: {_ilike: $tag}}}}, {tagtype: {name: {_ilike: $tag}}}]}) {
            aggregate { count }
        }
        tag(limit: $fetchLimit, distinct_on: credential_id, offset: $offset, order_by: {credential_id: desc}, where: {credential_id: {_is_null: false}, _or: [{data: {_cast: {String: {_ilike: $tag}}}}, {tagtype: {name: {_ilike: $tag}}}]}) {
            credential { ...CredentialData }
        }
    }
`;

// ============================================
// Mutations
// ============================================
export const CREATE_CREDENTIAL = gql`
    mutation CreateCredential($account: String!, $realm: String!, $credential: String!, $type: String!, $comment: String!) {
        createCredential(account: $account, realm: $realm, credential: $credential, credential_type: $type, comment: $comment) {
            status error id
        }
    }
`;
export const UPDATE_CREDENTIAL_COMMENT = gql`
    mutation UpdateCredentialComment($credential_id: Int!, $comment: String!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { comment: $comment }) {
            id comment operator { username }
        }
    }
`;
export const UPDATE_CREDENTIAL_ACCOUNT = gql`
    mutation UpdateCredentialAccount($credential_id: Int!, $account: String!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { account: $account }) {
            id account operator { username }
        }
    }
`;
export const UPDATE_CREDENTIAL_REALM = gql`
    mutation UpdateCredentialRealm($credential_id: Int!, $realm: String!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { realm: $realm }) {
            id realm operator { username }
        }
    }
`;
export const UPDATE_CREDENTIAL_TYPE = gql`
    mutation UpdateCredentialType($credential_id: Int!, $type: String!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { type: $type }) {
            id type operator { username }
        }
    }
`;
// FIX: credential_text is a generated/virtual column — write to credential_raw (bytea) instead
export const UPDATE_CREDENTIAL_VALUE = gql`
    mutation UpdateCredentialValue($credential_id: Int!, $credential: bytea!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { credential_raw: $credential }) {
            id credential_text operator { username }
        }
    }
`;
export const UPDATE_CREDENTIAL_DELETED = gql`
    mutation UpdateCredentialDeleted($credential_id: Int!, $deleted: Boolean!) {
        update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { deleted: $deleted }) {
            id deleted operator { username }
        }
    }
`;
export const BULK_DELETE_HARVESTED = gql`
    mutation BulkDeleteHarvested($operation_id: Int!) {
        update_credential(
            where: {
                operation_id: { _eq: $operation_id }
                deleted: { _eq: false }
                _or: [
                    { task_id: { _is_null: false } }
                    { comment: { _ilike: "[AUTO:%" } }
                ]
            }
            _set: { deleted: true }
        ) { affected_rows }
    }
`;
// Fetch ALL non-deleted harvested credentials for client-side dedup
export const FETCH_ALL_HARVESTED = gql`
    query FetchAllHarvested($operation_id: Int!) {
        credential(
            where: {
                operation_id: { _eq: $operation_id }
                deleted: { _eq: false }
                _or: [
                    { task_id: { _is_null: false } }
                    { comment: { _ilike: "[AUTO:%" } }
                ]
            }
            order_by: { id: desc }
        ) {
            id account realm type credential_text
        }
    }
`;
export const BULK_DELETE_BY_IDS = gql`
    mutation BulkDeleteByIds($ids: [Int!]!) {
        update_credential(where: { id: { _in: $ids } }, _set: { deleted: true }) {
            affected_rows
        }
    }
`;
export const BULK_DELETE_VERIFIED = gql`
    mutation BulkDeleteVerified($operation_id: Int!) {
        update_credential(
            where: {
                operation_id: { _eq: $operation_id }
                deleted: { _eq: false }
                task_id: { _is_null: true }
                _not: { comment: { _ilike: "[AUTO:%" } }
            }
            _set: { deleted: true }
        ) { affected_rows }
    }
`;

// ─── Console: credential check & auto-harvest ────────────────
export const CHECK_EXISTING_CREDENTIAL = gql`
    query CheckExistingCredential($account: String!, $realm: String!, $credential: String!, $type: String!) {
        credential(
            limit: 1
            where: {
                account: { _eq: $account }
                realm: { _eq: $realm }
                credential_text: { _eq: $credential }
                type: { _eq: $type }
                deleted: { _eq: false }
            }
        ) { id }
    }
`;
export const CREATE_CREDENTIAL_MUT = gql`
    mutation AutoHarvestCredential($account: String!, $realm: String!, $credential: String!, $type: String!, $comment: String!) {
        createCredential(account: $account, realm: $realm, credential: $credential, credential_type: $type, comment: $comment) {
            status error id
        }
    }
`;

// ─── C2 Graph Edge Walking (for C2 Path Dialog) ────────────────
