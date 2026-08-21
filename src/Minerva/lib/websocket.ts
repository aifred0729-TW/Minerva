// ═══════════════════════════════════════════════════════════════════
//  WebSocket client for GraphQL subscriptions
//
//  Extracted from index.js to break the circular dependency chain
//  between cache.js ↔ index.js.
// ═══════════════════════════════════════════════════════════════════
import { createClient, Client } from 'graphql-ws';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { meState } from './state';
import { dbg } from './utils';

const websocketAddress = (): string => {
    return window.location.protocol === "https:"
        ? "wss://" + window.location.host + "/graphql/"
        : "ws://" + window.location.host + "/graphql/";
};

function createWsClient(): Client {
    return createClient({
        url: websocketAddress(),
        lazy: true,
        retryAttempts: Infinity,
        retryWait: async (retries) => {
            // Exponential backoff: 1s, 2s, 4s, 8s, … capped at 30s
            const delay = Math.min(1000 * Math.pow(2, retries), 30000);
            dbg('ws', `reconnecting in ${delay}ms (attempt ${retries + 1})`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        },
        shouldRetry: () => {
            // Only retry if the user is still logged in
            return meState().loggedIn;
        },
        on: {
            error: (err) => {
                dbg('ws', 'connection error', err);
                // Was dbg-only. Nothing set this, and nothing read it, so the
                // only connectivity chrome in the app was navigator.onLine —
                // which reads ONLINE while this socket is dead.
                meState({ ...meState(), badConnection: true });
            },
            connected: (_socket) => {
                dbg('ws', 'connected');
                meState({ ...meState(), badConnection: false });
            },
            closed: (event) => {
                dbg('ws', 'connection closed', event);
                meState({ ...meState(), badConnection: true });
            },
        },
        connectionParams: () => ({
            Authorization: `Bearer ${localStorage.getItem('access_token')}`,
            headers: {
                Authorization: `Bearer ${localStorage.getItem('access_token')}`,
                MythicSource: "web",
            },
        }),
    });
}

export let wsClient = createWsClient();

export const wsLink = new GraphQLWsLink(wsClient);

export function restartWebsockets(): void {
    dbg('ws', 'restarting websockets');
    try {
        wsClient.dispose();
    } catch (_e) {
        // Client may already be disposed — ignore
    }
    wsClient = createWsClient();
    // Update the wsLink's internal client reference
    // readonly bypass: Apollo doesn't expose a public API to replace the ws client
    (wsLink as unknown as { client: Client }).client = wsClient;
}
