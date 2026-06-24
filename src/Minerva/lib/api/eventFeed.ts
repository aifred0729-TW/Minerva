import { gql } from '@apollo/client';

export const GET_EVENT_FEED = gql`
    query GetEventFeed($offset: Int!, $limit: Int!, $search: String!, $level: String!) {
        operationeventlog(
            where: {
                deleted: {_eq: false},
                message: {_ilike: $search},
                level: {_ilike: $level}
            },
            order_by: {id: desc},
            limit: $limit,
            offset: $offset
        ) {
            id
            level
            message
            resolved
            timestamp
            count
            source
            warning
            operator {
                username
            }
        }
        operationeventlog_aggregate(
            where: {
                deleted: {_eq: false},
                message: {_ilike: $search},
                level: {_ilike: $level}
            }
        ) {
            aggregate {
                count
            }
        }
    }
`;

export const GET_EVENT_FEED_WITH_RESOLVED = gql`
    query GetEventFeedWithResolved($offset: Int!, $limit: Int!, $search: String!, $level: String!, $resolved: Boolean!) {
        operationeventlog(
            where: {
                deleted: {_eq: false},
                message: {_ilike: $search},
                level: {_like: $level},
                resolved: {_eq: $resolved},
                warning: {_eq: true}
            },
            order_by: {id: desc},
            limit: $limit,
            offset: $offset
        ) {
            id
            level
            message
            resolved
            timestamp
            count
            source
            warning
            operator {
                username
            }
        }
        operationeventlog_aggregate(
            where: {
                deleted: {_eq: false},
                message: {_ilike: $search},
                level: {_like: $level},
                resolved: {_eq: $resolved},
                warning: {_eq: true}
            }
        ) {
            aggregate {
                count
            }
        }
    }
`;

export const CREATE_OPERATION_EVENT_LOG = gql`
    mutation CreateOperationEventLog($level: String!, $message: String!, $source: String, $warning: Boolean) {
        createOperationEventLog(level: $level, message: $message, source: $source, warning: $warning) {
            status
            error
        }
    }
`;

export const GET_MY_OPERATION_ROLE = gql`
    query GetMyOperationRole($user_id: Int!, $op_id: Int!) {
        operatoroperation(where: {operator_id: {_eq: $user_id}, operation_id: {_eq: $op_id}}) {
            view_mode
        }
    }
`;

export const SUBSCRIBE_EVENTS = gql`
    subscription SubscribeEventFeed($fromNow: timestamp!) {
        operationeventlog_stream(
            cursor: {initial_value: {timestamp: $fromNow}, ordering: ASC},
            batch_size: 10,
            where: {deleted: {_eq: false}}
        ) {
            id
            level
            message
            resolved
            timestamp
            count
            source
            warning
            operator {
                username
            }
        }
    }
`;

export const UPDATE_RESOLUTION = gql`
    mutation UpdateResolution($id: Int!, $resolved: Boolean!) {
        update_operationeventlog_by_pk(pk_columns: {id: $id}, _set: {resolved: $resolved}) {
            id
            resolved
        }
    }
`;

export const UPDATE_TO_WARNING = gql`
    mutation UpdateToWarning($id: Int!) {
        update_operationeventlog_by_pk(pk_columns: {id: $id}, _set: {warning: true, resolved: false}) {
            id
            warning
            resolved
        }
    }
`;

export const RESOLVE_ALL_VIEWABLE = gql`
    mutation ResolveAllViewable($ids: [Int]!) {
        update_operationeventlog(where: {id: {_in: $ids}, warning: {_eq: true}}, _set: {resolved: true}) {
            returning {
                id
                resolved
            }
        }
    }
`;

export const RESOLVE_ALL_ERRORS = gql`
    mutation ResolveAllErrors {
        update_operationeventlog(where: {resolved: {_eq: false}, warning: {_eq: true}}, _set: {resolved: true}) {
            returning {
                id
                resolved
            }
        }
    }
`;
