import { gql } from '@apollo/client';

export const CREATE_CREDENTIAL = gql`
  mutation CreateCredential($comment: String!, $credential_text: String!, $realm: String!, $type: String!, $account: String!) {
    createCredential(comment: $comment, credential_text: $credential_text, realm: $realm, type: $type, account: $account) {
      status
      error
    }
  }
`;

// ─── C2 Graph Edge Walking (for C2 Path Dialog) ────────────────
