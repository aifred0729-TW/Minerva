import { gql } from '@apollo/client';

export const GET_ARTIFACTS = gql`
query GetArtifacts($offset: Int!, $limit: Int!, $search: String!) {
    taskartifact(
        where: {
            _or: [
                {artifact_text: {_ilike: $search}},
                {host: {_ilike: $search}}
            ]
        },
        order_by: {id: desc},
        limit: $limit,
        offset: $offset
    ) {
        id
        artifact_text
        host
        timestamp
        base_artifact
        task {
            id
            command_name
            display_params
            callback {
                display_id
                host
                user
                payload {
                    payloadtype {
                        name
                    }
                }
            }
            operator {
                username
            }
        }
    }
    taskartifact_aggregate(
        where: {
            _or: [
                {artifact_text: {_ilike: $search}},
                {host: {_ilike: $search}}
            ]
        }
    ) {
        aggregate {
            count
        }
    }
}
`;

export const GET_ARTIFACT_TYPES = gql`
query GetArtifactTypes {
    taskartifact(distinct_on: base_artifact) {
        base_artifact
    }
}
`;

export const CREATE_ARTIFACT = gql`
mutation CreateArtifact($artifact_text: String!, $base_artifact: String!, $host: String!) {
    insert_taskartifact_one(object: {
        artifact_text: $artifact_text,
        base_artifact: $base_artifact,
        host: $host
    }) {
        id
        artifact_text
        base_artifact
        host
        timestamp
    }
}
`;
