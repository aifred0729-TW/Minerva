// ═══════════════════════════════════════════════════════════════════
//  Application entry point
//
//  All heavy logic has been extracted to Minerva/lib/*:
//    - lib/state.ts       → reactive variables, config defaults
//    - lib/time.ts        → time utilities
//    - lib/websocket.ts   → GraphQL WS client
//    - lib/auth.ts        → JWT validation, login/refresh/logout
//    - lib/apollo.ts      → Apollo Client & link chain
//
//  This file only: (1) suppresses ResizeObserver noise,
//  (2) restores session from localStorage, (3) renders the app.
// ═══════════════════════════════════════════════════════════════════
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import { ApolloProvider } from "@apollo/client/react";

import MinervaApp from './Minerva/App';
import { apolloClient } from './Minerva/lib/apollo';
import { meState } from './Minerva/lib/state';
import { isJWTValid, FailedRefresh } from './Minerva/lib/auth';

// ── Re-exports for backward compatibility with old components/ ────
// Old code does: import { mythicUIVersion } from '../index';
export { mythicUIVersion, isJWTValid, JWTTimeLeft, GetNewToken } from './Minerva/lib/auth';
export { restartWebsockets } from './Minerva/lib/websocket';
export { apolloClient } from './Minerva/lib/apollo';

// ── Suppress ResizeObserver loop error globally ───────────────────
if (typeof window !== 'undefined') {
    window.addEventListener('error', function (e) {
        if (e && e.message && e.message.includes('ResizeObserver loop')) {
            e.stopImmediatePropagation();
            e.stopPropagation();
            e.preventDefault();
        }
    }, true);

    const _origOnError = window.onerror;
    window.onerror = function (message) {
        if (typeof message === 'string' && message.includes('ResizeObserver loop')) {
            return true;
        }
        if (_origOnError) return _origOnError.apply(this, arguments);
        return false;
    };
}

// ── Restore session from localStorage on page refresh ─────────────
if (localStorage.getItem("access_token") !== null) {
    if (isJWTValid()) {
        if (localStorage.getItem("user") !== null) {
            try {
                const userData = JSON.parse(localStorage.getItem("user"));
                if (userData.user_id !== undefined && userData.user_id > 0) {
                    meState({
                        loggedIn: true,
                        access_token: localStorage.getItem("access_token"),
                        refresh_token: localStorage.getItem("refresh_token"),
                        user: { ...userData },
                    });
                } else {
                    FailedRefresh();
                }
            } catch (_error) {
                FailedRefresh();
            }
        } else {
            FailedRefresh();
        }
    } else {
        FailedRefresh();
    }
}

// ── Render ─────────────────────────────────────────────────────────
const container = document.getElementById('root');
const root = createRoot(container);

root.render(
    <ApolloProvider client={apolloClient}>
        <Router basename="/new">
            <MinervaApp key="MinervaApp" />
        </Router>
    </ApolloProvider>
);
