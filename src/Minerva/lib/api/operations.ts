import { gql } from '@apollo/client';

export const GET_OPERATIONS = gql`
query GetOperations {
  operation(order_by: {name: asc}) {
    id
    name
    complete
    deleted
    webhook
    channel
    banner_text
    banner_color
    admin {
      id
      username
    }
    operatoroperations {
      id
      view_mode
      operator {
        id
        username
      }
    }
  }
  operator(where: {active: {_eq: true}, deleted: {_eq: false}}) {
    id
    username
  }
}
`;

export const UPDATE_CURRENT_OPERATION_MUTATION = gql`
mutation UpdateCurrentOperation($operator_id: Int!, $operation_id: Int!) {
  updateCurrentOperation(user_id: $operator_id, operation_id: $operation_id) {
    status
    error
    operation_id
    name
    complete
    banner_text
    banner_color
  }
}
`;

export const UPDATE_OPERATION_ADMIN_MUTATION = gql`
mutation UpdateOperationAdmin($operation_id: Int!, $admin_id: Int!) {
  updateOperation(operation_id: $operation_id, admin_id: $admin_id) {
    status
    error
  }
}
`;

export const CREATE_OPERATION_MUTATION = gql`
mutation CreateOperation($name: String!) {
  createOperation(name: $name) {
    status
    error
    operation_id
    operation_name
  }
}
`;

export const UPDATE_OPERATION_MUTATION = gql`
mutation UpdateOperation($operation_id: Int!, $name: String, $complete: Boolean, $channel: String, $webhook: String, $banner_text: String, $banner_color: String) {
  updateOperation(operation_id: $operation_id, name: $name, complete: $complete, channel: $channel, webhook: $webhook, banner_text: $banner_text, banner_color: $banner_color) {
    status
    error
    id
    name
    complete
  }
}
`;

export const UPDATE_OPERATION_MEMBERS_MUTATION = gql`
mutation UpdateOperationMembers($operation_id: Int!, $add_users: [Int], $remove_users: [Int], $view_mode_operators: [Int], $view_mode_spectators: [Int]) {
  updateOperatorOperation(operation_id: $operation_id, add_users: $add_users, remove_users: $remove_users, view_mode_operators: $view_mode_operators, view_mode_spectators: $view_mode_spectators) {
    status
    error
  }
}
`;

export const TOGGLE_OPERATION_DELETE_MUTATION = gql`
mutation ToggleOperationDeleted($operation_id: Int!, $deleted: Boolean!) {
  updateOperation(operation_id: $operation_id, deleted: $deleted) {
    status
    error
  }
}
`;
