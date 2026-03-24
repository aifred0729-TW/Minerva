import { gql } from '@apollo/client';

export const GET_GLOBAL_SETTINGS = gql`
query getGlobalSettings {
  getGlobalSettings {
    settings
  }
}
`;

export const UPDATE_GLOBAL_SETTINGS = gql`
mutation updateGlobalSettings($settings: jsonb!) {
    updateGlobalSettings(settings: $settings){
        status
        error
    }
}
`;

export const GET_INVITE_LINKS = gql`
query getOutstandingInviteLinks {
  getInviteLinks {
    status
    error
    links
  }
}
`;

export const CREATE_INVITE_LINK = gql`
mutation CreateInviteLink($operation_id: Int, $operation_role: String, $name: String, $short_code: String, $total: Int) {
    createInviteLink(total: $total, operation_role: $operation_role, operation_id: $operation_id, name: $name, short_code: $short_code){
        status
        error
        link
    }
}
`;

export const UPDATE_INVITE_LINK = gql`
mutation UpdateInviteLink($code: String!, $total: Int!) {
    updateInviteLink(code: $code, total: $total){
        status
        error
    }
}
`;

export const GET_OPERATIONS_LIST = gql`
query getOperations {
    operation {
        name
        deleted
        complete
        id
    }
}
`;

export async function loginUser(username: string, password: string) {
    try {
        const response = await fetch('/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, scripting_version: "3" })
        });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}
