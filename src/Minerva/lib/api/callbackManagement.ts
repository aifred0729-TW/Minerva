import { gql } from '@apollo/client';

export const GET_CALLBACK_GRAPH_EDGES = gql`
query GetCallbackGraphEdges {
  callbackgraphedge(order_by: {id: desc, end_timestamp: desc_nulls_first}) {
    id
    end_timestamp
    destination {
      id
      display_id
      active
      user
      host
      ip
      last_checkin
      integrity_level
      description
      payload {
        payloadtype {
          name
        }
      }
    }
    source {
      id
      display_id
      active
      user
      host
      ip
      last_checkin
      integrity_level
      description
      payload {
        payloadtype {
          name
        }
      }
    }
    c2profile {
      id
      name
      is_p2p
    }
  }
}
`;

export const GET_CALLBACK_GRAPH_EDGES_ALL = gql`
query GetCallbackGraphEdgesAll {
  callbackgraphedge(order_by: {id: desc, end_timestamp: desc_nulls_first}) {
    id
    end_timestamp
    destination {
      id display_id active user host ip description
      payload { payloadtype { name } }
    }
    source {
      id display_id active user host ip description
      payload { payloadtype { name } }
    }
    c2profile { id name is_p2p }
  }
}
`;

export const GET_LINK_COMMANDS_FOR_CALLBACK = gql`
  query GetLinkCommandsForCallback($callback_id: Int!) {
    loadedcommands(where: {
      callback_id: { _eq: $callback_id }
      command: { supported_ui_features: { _contains: "graph_view:link" } }
    }) {
      command {
        id
        cmd
        description
        supported_ui_features
        commandparameters {
          name
          type
          required
          parameter_group_name
          default_value
        }
      }
    }
  }
`;

export const HIDE_CALLBACK_MUTATION = gql`
mutation hideCallback ($callback_display_id: Int!, $active: Boolean){
  updateCallback(input: {callback_display_id: $callback_display_id, active: $active}) {
    status
    error
  }
}
`;

export const LOCK_CALLBACK_MUTATION = gql`
mutation lockCallack($callback_display_id: Int!, $locked: Boolean!){
  updateCallback(input: {callback_display_id: $callback_display_id, locked: $locked}) {
    status
    error
  }
}
`;

export const UPDATE_CALLBACK_DESCRIPTION_MUTATION = gql`
mutation updateDescriptionCallback($callback_display_id: Int!, $description: String!){
  updateCallback(input: {callback_display_id: $callback_display_id, description: $description}) {
    status
    error
  }
}
`;

export const UPDATE_DESCRIPTION_AND_COLOR_MUTATION = gql`
mutation updateDescriptionAndColor($callback_display_id: Int!, $description: String!, $color: String!){
  updateCallback(input: {callback_display_id: $callback_display_id, description: $description, color: $color}) {
    status
    error
  }
}
`;

export const GET_CUSTOM_BROWSERS = gql`
query GetCustomBrowsers {
  custombrowser(where: {deleted: {_eq: false}}, order_by: {name: asc}) {
    id
    name
    type
  }
}
`;

export const ADD_EDGE_MUTATION = gql`
mutation addEdgeMutation($source_id: Int!, $destination_id: Int!, $c2profile: String!){
  callbackgraphedge_add(c2profile: $c2profile, destination_id: $destination_id, source_id: $source_id) {
    status
    error
  }
}
`;

export const REMOVE_EDGE_MUTATION = gql`
mutation removeEdgeMutation($edge_id: Int!){
  callbackgraphedge_remove(edge_id: $edge_id) {
    status
    error
  }
}
`;

// Custom Nodes for Callback Graph - Using agentstorage table for multi-user collaboration
// unique_id format: "minerva_customnode_{id}"
export const GET_CUSTOM_GRAPH_NODES = gql`
query GetCustomGraphNodes {
  agentstorage(
    where: { unique_id: { _like: "minerva_customnode_%" } }
    order_by: { id: asc }
  ) {
    id
    unique_id
    data
  }
}
`;

export const CREATE_CUSTOM_GRAPH_NODE = gql`
mutation CreateCustomGraphNode(
  $unique_id: String!
  $data: bytea!
) {
  insert_agentstorage_one(
    object: {
      unique_id: $unique_id
      data: $data
    }
  ) {
    id
    unique_id
  }
}
`;

export const UPDATE_CUSTOM_GRAPH_NODE = gql`
mutation UpdateCustomGraphNode(
  $unique_id: String!
  $data: bytea!
) {
  update_agentstorage(
    where: { unique_id: { _eq: $unique_id } }
    _set: { data: $data }
  ) {
    affected_rows
    returning {
      id
      unique_id
      data
    }
  }
}
`;

export const DELETE_CUSTOM_GRAPH_NODE = gql`
mutation DeleteCustomGraphNode($unique_id: String!) {
  delete_agentstorage(
    where: { unique_id: { _eq: $unique_id } }
  ) {
    affected_rows
  }
}
`;

// Custom Graph Edge operations (stored in agentstorage with prefix minerva_graphedge_)
export const GET_CUSTOM_GRAPH_EDGES = gql`
query GetCustomGraphEdges {
  agentstorage(where: { unique_id: { _like: "minerva_graphedge_%" } }) {
    id
    unique_id
    data
  }
}
`;

export const CREATE_CUSTOM_GRAPH_EDGE = gql`
mutation CreateCustomGraphEdge(
  $unique_id: String!
  $data: bytea!
) {
  insert_agentstorage_one(
    object: {
      unique_id: $unique_id
      data: $data
    }
  ) {
    id
    unique_id
  }
}
`;

export const DELETE_CUSTOM_GRAPH_EDGE = gql`
mutation DeleteCustomGraphEdge($unique_id: String!) {
  delete_agentstorage(
    where: { unique_id: { _eq: $unique_id } }
  ) {
    affected_rows
  }
}
`;

export const GET_P2P_PROFILES_AND_CALLBACKS = gql`
query getP2PProfilesAndCallbacks{
  c2profile(where: {is_p2p: {_eq: true}, deleted: {_eq: false}}) {
    callbackc2profiles(where: {callback: {active: {_eq: true}}}) {
      id
      callback {
        id
        display_id
        description
        host
        user
      }
    }
    name
    id
  }
}
`;
