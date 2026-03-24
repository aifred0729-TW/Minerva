import { gql } from '@apollo/client';

export const GET_C2_PROFILES = gql`
query GetC2Profiles {
  c2profile(order_by: {name: asc}) {
    id
    name
    running
    container_running
    is_p2p
    description
    author
    semver
    deleted
    payloadtypec2profiles(order_by: {payloadtype: {name: asc}}) {
      payloadtype {
        name
        deleted
        id
      }
    }
  }
}
`;

export const SUB_C2_PROFILES = gql`
subscription SubC2Profiles {
  c2profile(order_by: {name: asc}) {
    id
    name
    running
    container_running
    is_p2p
    description
    author
    semver
    deleted
    payloadtypec2profiles(order_by: {payloadtype: {name: asc}}) {
      payloadtype {
        name
        deleted
        id
      }
    }
  }
}
`;

export const TOGGLE_C2_PROFILE_DELETE = gql`
mutation ToggleC2ProfileDeleteStatus($c2profile_id: Int!, $deleted: Boolean!) {
  update_c2profile_by_pk(pk_columns: {id: $c2profile_id}, _set: {deleted: $deleted}) {
    id
    deleted
  }
}
`;

export const START_STOP_PROFILE_MUTATION = gql`
  mutation StartStopProfile($id: Int!, $action: String!) {
    startStopProfile(id: $id, action: $action) {
      status
      error
      output
    }
  }
`;

export const GET_PROFILE_OUTPUT = gql`
query getProfileOutput($id: Int!) {
  getProfileOutput(id: $id) {
    status
    error
    output
  }
}
`;

export const GET_PROFILE_CONFIG = gql`
query getProfileConfigOutput($container_name: String!, $filename: String!) {
  containerDownloadFile(container_name: $container_name, filename: $filename) {
    status
    error
    filename
    data
  }
}
`;

export const SET_PROFILE_CONFIG = gql`
mutation setProfileConfiguration($container_name: String!, $file_path: String!, $data: String!) {
  containerWriteFile(container_name: $container_name, file_path: $file_path, data: $data) {
    status
    error
    filename
  }
}
`;
