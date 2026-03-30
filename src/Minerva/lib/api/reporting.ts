import { gql } from '@apollo/client';

export const GENERATE_REPORT = gql`
mutation generateReportMutation(
    $outputFormat: String!,
    $includeMITREPerTask: Boolean!,
    $includeMITREOverall: Boolean!,
    $excludedUsers: String!,
    $excludedHosts: String!,
    $excludedIDs: String!,
    $includeOutput: Boolean!
){
    generateReport(
        outputFormat: $outputFormat,
        includeMITREPerTask: $includeMITREPerTask,
        includeMITREOverall: $includeMITREOverall,
        excludedUsers: $excludedUsers,
        excludedHosts: $excludedHosts,
        excludedIDs: $excludedIDs,
        includeOutput: $includeOutput
    ){
        status
        error
    }
}
`;

export const REPORT_SUBSCRIPTION = gql`
subscription generatedReportEventSubscription($fromNow: timestamp!){
    operationeventlog_stream(
        batch_size: 1,
        where: {source: {_eq: "generated_report"}},
        cursor: {initial_value: {timestamp: $fromNow}}
    ) {
        message
    }
}
`;
