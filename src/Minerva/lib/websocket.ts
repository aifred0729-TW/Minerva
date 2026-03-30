// ═══════════════════════════════════════════════════════════════════
//  WebSocket client for GraphQL subscriptions
//
//  Extracted from index.js to break the circular dependency chain
//  between cache.js ↔ index.js.
// ═══════════════════════════════════════════════════════════════════
import { createClient } from 'graphql-ws';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { meState } from './state';

const websocketAddress = (): string => {
    return window.location.protocol === "https:"
        ? "wss://" + window.location.host + "/graphql/"
        : "ws://" + window.location.host + "/graphql/";
};

export const wsClient = createClient({
    url: websocketAddress(),
    reconnectionAttempts: 0,
    lazy: true,
    on: {
        error: (_err) => {
            // intentionally empty — badConnection is handled in the error link
        },
        connected: (_socket) => {
            meState({ ...meState(), badConnection: false });
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

export const wsLink = new GraphQLWsLink(wsClient);

export function restartWebsockets(): void {
    wsClient.dispose();
}
