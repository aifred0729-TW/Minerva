// ═══════════════════════════════════════════════════════════════════
//  Apollo Client configuration
//
//  Extracted from index.js.  Assembles the link chain (auth → error
//  → retry → split(ws|http)) and exports the singleton client.
//
//  Dependency chain:
//    state → time → websocket → auth → apollo  (no cycles)
// ═══════════════════════════════════════════════════════════════════
import {
    ApolloClient,
    InMemoryCache,
    from,
    split,
    HttpLink,
} from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';
import { setContext } from '@apollo/client/link/context';
import { getMainDefinition } from '@apollo/client/utilities';
import { jwtDecode } from 'jwt-decode';

import { meState } from './state';
import { getSkewedNow } from './time';
import { wsLink, restartWebsockets } from './websocket';
import { snackActions } from './snackbar';
import { dbg } from './utils';
import {
    isJWTValid,
    GetNewToken,
    FailedRefresh,
    isSessionExpiredError,
    handleSessionExpired,
} from './auth';

// ── Links ──────────────────────────────────────────────────────────

const retryLink = new RetryLink({
    delay: { initial: 2, max: 10 },
    attempts: { max: 2, retryIf: (error, _operation) => !!error },
});

const httpLink = new HttpLink({
    uri: window.location.origin + "/graphql/",
    // @ts-ignore – legacy option kept for backward compatibility
    options: {
        reconnect: true,
        connectionParams: {
            headers: {
                Authorization: () => `Bearer ${localStorage.getItem('access_token')}`,
                MythicSource: "web",
            },
        },
    },
});

// Intercept every request and attach / refresh the JWT.
let fetchingNewToken = false;

const authLink = setContext(async (_, { headers }) => {
    // Wait for any in-flight refresh to finish
    while (fetchingNewToken) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    let access_token = localStorage.getItem('access_token');
    if (access_token) {
        const decoded_token: any = jwtDecode(access_token);
        const diff = (decoded_token.exp * 1000) - (getSkewedNow() as any);
        const thirtyMinutes = 30 * 60000;

        if (!isJWTValid()) {
            dbg('apollo', 'token is no longer valid, refreshing');
            fetchingNewToken = true;
            const updated = await GetNewToken();
            fetchingNewToken = false;
            if (updated) {
                return {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem('access_token')}`,
                        MythicSource: "web",
                    },
                };
            }
            dbg('apollo', 'JWT invalid and refresh failed');
            FailedRefresh();
        } else if (diff < thirtyMinutes && diff > 0) {
            dbg('apollo', 'token at half-life, refreshing');
            fetchingNewToken = true;
            const updated = await GetNewToken();
            fetchingNewToken = false;
            if (updated) {
                return {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem('access_token')}`,
                        MythicSource: "web",
                    },
                };
            }
        }
    } else {
        dbg('apollo', 'no access token');
        FailedRefresh();
    }

    return {
        Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        headers: {
            Authorization: `Bearer ${localStorage.getItem('access_token')}`,
            MythicSource: "web",
        },
    };
});

// Global GraphQL / network error handler.
const errorLink = onError(({ graphQLErrors, networkError }) => {
    try {
        if (graphQLErrors) {
            dbg('apollo', 'graphQLErrors', graphQLErrors);
            for (const err of graphQLErrors) {
                const code = (err.extensions as any)?.code as string | undefined;
                if (isSessionExpiredError(code, err.message)) {
                    handleSessionExpired('graphQLError: ' + (code || err.message));
                    return;
                }
                if (code === 'access-denied' && err.message?.toLowerCase().includes('jwt')) {
                    handleSessionExpired('graphQLError: access-denied+jwt');
                    return;
                }
                switch (code) {
                    case 'forbidden':
                        snackActions.error(err.message);
                        break;
                    case 'access-denied':
                        snackActions.error(err.message);
                        break;
                    case 'start-failed':
                        dbg('apollo', 'start-failed in graphql, auth link will handle');
                        break;
                    case 'validation-failed':
                        dbg('apollo', 'validation-failed', err);
                        return;
                    default:
                        dbg('apollo', 'unhandled graphQL error', err);
                        snackActions.error(err.message);
                }
            }
        }
        if (networkError) {
            dbg('apollo', 'networkError', networkError);
            const netExt = (networkError as any).extensions;
            const netCode = netExt?.code as string | undefined;
            const netMsg = networkError.message || '';
            const statusCode = (networkError as any).statusCode;

            if (isSessionExpiredError(netCode, netMsg)) {
                handleSessionExpired('networkError: ' + (netCode || netMsg));
                return;
            }
            if (statusCode === 401 || statusCode === 403) {
                handleSessionExpired('networkError: HTTP ' + statusCode);
                return;
            }
            if (netExt === undefined) {
                meState({ ...meState(), badConnection: true });
                return;
            }
            switch (netCode) {
                case 'access-denied':
                    snackActions.warning("Access Denied");
                    break;
                case 'start-failed':
                    dbg('apollo', 'start-failed in network, logging out');
                    FailedRefresh();
                    window.location.href = "/new/login";
                    break;
                default:
                    dbg('apollo', 'unhandled network error', networkError);
            }
        }
    } catch (error) {
        snackActions.error("Failed to connect to Mythic, please refresh");
        dbg('apollo', 'error handler caught', error);
        restartWebsockets();
        window.location.href = "/new/login";
    }
});

// Split subscriptions (ws) from queries / mutations (http).
const splitLink = split(
    ({ query }) => {
        const definition = getMainDefinition(query);
        return (
            definition.kind === 'OperationDefinition' &&
            definition.operation === 'subscription'
        );
    },
    wsLink,
    httpLink,
);

// ── Exported singleton client ──────────────────────────────────────

export const apolloClient = new ApolloClient({
    link: from([authLink, errorLink, retryLink, authLink.concat(splitLink)]),
    cache: new InMemoryCache(),
});
