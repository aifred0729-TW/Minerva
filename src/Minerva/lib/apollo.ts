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
    isFetchingNewToken,
    setFetchingNewToken,
    getAccessToken,
    getAuthHeaders,
} from './auth';

// ── Links ──────────────────────────────────────────────────────────

const retryLink = new RetryLink({
    delay: { initial: 2, max: 10 },
    attempts: { max: 2, retryIf: (error, _operation) => !!error },
});

const httpLink = new HttpLink({
    uri: window.location.origin + "/graphql/",
});

// Intercept every request and attach / refresh the JWT.
// Uses the single fetchingNewToken flag exported by auth.ts
// to prevent duplicate concurrent refresh requests.

const authLink = setContext(async (_, { headers }) => {
    // Wait for any in-flight refresh to finish
    while (isFetchingNewToken()) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    let access_token = getAccessToken();
    if (access_token) {
        const decoded: { exp: number } = jwtDecode(access_token);
        const diff = (decoded.exp * 1000) - getSkewedNow().getTime();
        const thirtyMinutes = 30 * 60000;

        if (!isJWTValid()) {
            dbg('apollo', 'token is no longer valid, refreshing');
            setFetchingNewToken(true);
            const updated = await GetNewToken();
            setFetchingNewToken(false);
            if (updated) {
                return { headers: getAuthHeaders() };
            }
            dbg('apollo', 'JWT invalid and refresh failed');
            FailedRefresh();
        } else if (diff < thirtyMinutes && diff > 0) {
            dbg('apollo', 'token at half-life, refreshing');
            setFetchingNewToken(true);
            const updated = await GetNewToken();
            setFetchingNewToken(false);
            if (updated) {
                return { headers: getAuthHeaders() };
            }
        }
    } else {
        dbg('apollo', 'no access token');
        FailedRefresh();
    }

    return { headers: getAuthHeaders() };
});

// Global GraphQL / network error handler.
const errorLink = onError(({ graphQLErrors, networkError }: any) => {
    try {
        if (graphQLErrors) {
            dbg('apollo', 'graphQLErrors', graphQLErrors);
            for (const err of graphQLErrors) {
                const code = (err.extensions?.code ?? undefined) as string | undefined;
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
            const netErr = networkError as Record<string, unknown>;
            const netExt = netErr.extensions as Record<string, unknown> | undefined;
            const netCode = (netExt?.code ?? undefined) as string | undefined;
            const netMsg = networkError.message || '';
            const statusCode = netErr.statusCode as number | undefined;

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
    link: from([authLink, errorLink, retryLink, splitLink]),
    cache: new InMemoryCache(),
    defaultOptions: {
        watchQuery: {
            // AC4 changed default to true; preserve v3 behavior to avoid extra re-renders
            notifyOnNetworkStatusChange: false,
        },
    },
});
