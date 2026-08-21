import { gql } from '@apollo/client';

export const GET_OPERATORS = gql`
query GetOperators {
  operator(order_by: {username: asc}, where: {deleted: {_eq: false}}) {
    id
    username
    active
    admin
    last_login
    creation_time
    deleted
    email
    # Which operations this account can work in, and as what.
    #
    # Hasura scopes the nested operation by id _in X-Hasura-operations for
    # EVERY role, mythic_admin included -- so a membership in an operation the
    # caller is not in comes back as null and is skipped. The count this feeds
    # is therefore "operations you can see", not the account's true
    # membership, which is why the column is footnoted as scoped rather than
    # presented as a total.
    operatoroperations {
      id
      view_mode
      operation {
        id
        name
        deleted
        complete
      }
    }
  }
}
`;

export const CREATE_OPERATOR_MUTATION = gql`
mutation CreateOperator($username: String!, $password: String!, $email: String, $bot: Boolean) {
  createOperator(input: {username: $username, password: $password, email: $email, bot: $bot}) {
    status
    error
    id
    username
  }
}
`;

export const UPDATE_OPERATOR_STATUS_MUTATION = gql`
mutation UpdateOperatorStatus($operator_id: Int!, $active: Boolean, $admin: Boolean, $deleted: Boolean) {
  updateOperatorStatus(operator_id: $operator_id, active: $active, admin: $admin, deleted: $deleted) {
    status
    error
    id
    active
    admin
    deleted
  }
}
`;

export const UPDATE_OPERATOR_PASSWORD_MUTATION = gql`
mutation UpdateOperatorPassword($user_id: Int!, $new_password: String!, $email: String) {
  updatePasswordAndEmail(user_id: $user_id, new_password: $new_password, email: $email) {
    status
    error
    operator_id
  }
}
`;

export const UPDATE_OPERATOR_USERNAME_MUTATION = gql`
mutation UpdateOperatorUsername($id: Int!, $username: String!) {
  update_operator_by_pk(pk_columns: {id: $id}, _set: {username: $username}) {
    id
    username
  }
}
`;
