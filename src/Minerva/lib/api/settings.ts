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

/** How long to wait for /auth before giving the operator control back. */
export const LOGIN_TIMEOUT_MS = 20_000;

/** Distinguishes "the server never answered" from "the server said no". */
export const LOGIN_TIMED_OUT = Symbol('login-timed-out');

/**
 * Returns the auth payload, `null` for a refusal or network error, or
 * LOGIN_TIMED_OUT if /auth did not answer in time.
 *
 * The timeout is not optional. A server that accepts the connection and then
 * never responds leaves this promise pending forever, and the login screen has
 * nothing to fall back to: it sits on VERIFYING_CREDENTIALS with the submit
 * button disabled and no way back to the form short of a reload.
 */
export async function loginUser(username: string, password: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
    try {
        const response = await fetch('/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, scripting_version: "3" }),
            signal: controller.signal,
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        return (e as Error)?.name === 'AbortError' ? LOGIN_TIMED_OUT : null;
    } finally {
        clearTimeout(timer);
    }
}
