import { gql } from '@apollo/client';

// Subscription for new callbacks
export const SUBSCRIBE_NEW_CALLBACKS = gql`
    subscription NewCallbackStream($fromNow: timestamp!) {
        callback_stream(
            cursor: {initial_value: {init_callback: $fromNow}, ordering: ASC},
            batch_size: 1
        ) {
            id
            host
            user
        }
    }
`;

// Subscription for alert count badge
export const SUBSCRIBE_ALERT_COUNT = gql`
    subscription OperationAlertCounts {
        operation_stream(
            cursor: {initial_value: {updated_at: "1970-01-01"}, ordering: ASC},
            batch_size: 1
        ) {
            id
            alert_count
        }
    }
`;
