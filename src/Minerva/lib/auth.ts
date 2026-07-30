// ═══════════════════════════════════════════════════════════════════
//  Authentication & JWT helpers
//
//  Consolidates logic that was split between index.js (JWT helpers)
//  and cache.js (login / refresh / logout actions).
//
//  Dependency chain:  state → time → websocket → auth  (no cycles)
// ═══════════════════════════════════════════════════════════════════
import { jwtDecode } from 'jwt-decode';
import { meState, mePreferences, operatorSettingDefaults, type MythicUser } from './state';
import { getSkewedNow } from './time';
import { restartWebsockets } from './websocket';
import { snackActions } from './snackbar';
import { dbg } from './utils';

// ── Version tag ────────────────────────────────────────────────────
export const mythicUIVersion = "0.3.106";

// ── Auth header utilities ──────────────────────────────────────────

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user';

/** Read the current access token from localStorage. */
export const getAccessToken = (): string | null =>
    localStorage.getItem(ACCESS_TOKEN_KEY);

/** Build Authorization headers used by fetch calls and Apollo. */
export const getAuthHeaders = (): Record<string, string> => ({
    Authorization: `Bearer ${getAccessToken()}`,
    MythicSource: 'web',
});

// ── JWT helpers ────────────────────────────────────────────────────

export const isJWTValid = (): boolean => {
    let access_token = getAccessToken();
    if (!access_token) {
        const cookie = document.cookie;
        if (cookie && cookie !== "") {
            const cookies = cookie.split(";");
            for (let i = 0; i < cookies.length; i++) {
                const cookiePieces = cookies[i].split("=");
                if (cookiePieces.length !== 2) {
                    dbg('auth', 'bad number of cookie pieces', cookies[i]);
                } else if (cookiePieces[0].trim() !== "user") {
                    dbg('auth', 'unknown cookie name', cookiePieces[0].trim());
                } else {
                    try {
                        dbg('auth', 'user cookie found, trying to parse');
                        const cookieString = decodeURIComponent(cookiePieces[1].trim());
                        const cookieJSON = JSON.parse(atob(cookieString));
                        if ("access_token" in cookieJSON) {
                            successfulLogin(cookieJSON);
                            restartWebsockets();
                            access_token = getAccessToken();
                        } else {
                            snackActions.warning("Invalid Authentication");
                            dbg('auth', 'invalid cookie JSON', cookieJSON);
                        }
                    } catch (error) {
                        dbg('auth', 'error processing cookie value', error);
                    }
                }
            }
        }
    }
    if (access_token) {
        const decoded: { exp: number } = jwtDecode(access_token);
        if (getSkewedNow().getTime() > decoded.exp * 1000) {
            dbg('auth', 'token expired', decoded.exp * 1000, getSkewedNow().getTime());
            return false;
        }
        return true;
    }
    return false;
};

export const JWTTimeLeft = (): number => {
    const access_token = getAccessToken();
    if (access_token) {
        const decoded: { exp: number } = jwtDecode(access_token);
        return (decoded.exp * 1000) - getSkewedNow().getTime();
    }
    return 0;
};

// ── Token refresh ──────────────────────────────────────────────────

let fetchingNewToken = false;

export const GetNewToken = async (): Promise<boolean> => {
    fetchingNewToken = true;
    const requestOptions: RequestInit = {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
        },
        body: JSON.stringify({
            refresh_token: localStorage.getItem(REFRESH_TOKEN_KEY),
            access_token: getAccessToken(),
        }),
    };
    try {
        const response = await fetch('/refresh', requestOptions);
        if (response.ok) {
            return response.json().then((data) => {
                if ("access_token" in data) {
                    successfulRefresh(data);
                    dbg('auth', 'successfully got new access_token');
                    return true;
                }
                dbg('auth', 'FailedRefresh from GetNewToken');
                FailedRefresh();
                return false;
            }).catch((error) => {
                dbg('auth', 'GetNewToken JSON parse error', error);
                FailedRefresh();
                return false;
            });
        } else if (response.status === 403) {
            FailedRefresh();
            return false;
        } else {
            dbg('auth', `GetNewToken server error (HTTP ${response.status})`);
            return false;
        }
    } catch (error) {
        dbg('auth', 'GetNewToken fetch error', error);
        FailedRefresh();
        return false;
    } finally {
        fetchingNewToken = false;
    }
};

/** Whether a token refresh is currently in-flight (used by authLink). */
export const isFetchingNewToken = () => fetchingNewToken;
export const setFetchingNewToken = (v: boolean) => { fetchingNewToken = v; };

// ── Single-flight token refresh ────────────────────────────────────
//
// Concurrent GraphQL operations that all observe an expired / half-life
// token would otherwise each fire their own POST /refresh (a TOCTOU race
// producing duplicate refreshes). Sharing one in-flight promise collapses
// them into a single network round-trip, and lets callers `await` the
// result directly instead of polling `isFetchingNewToken()` on a timer.
let refreshInFlight: Promise<boolean> | null = null;

export const refreshTokenSingleFlight = (): Promise<boolean> => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = GetNewToken().finally(() => { refreshInFlight = null; });
    return refreshInFlight;
};

// ── Session expiration detection ───────────────────────────────────

export const isSessionExpiredError = (code?: string, message?: string): boolean => {
    if (!code && !message) return false;
    const expiredCodes = ['invalid-jwt', 'jwt-invalid', 'jwt-missing', 'invalid-headers'];
    if (code && expiredCodes.includes(code)) return true;
    if (typeof message === 'string') {
        const lower = message.toLowerCase();
        if (lower.includes('jwt') && (lower.includes('expired') || lower.includes('invalid') || lower.includes('malformed'))) return true;
        if (lower.includes('could not verify jwt') || lower.includes('jwtexpired') || lower.includes('jwterror')) return true;
        if (lower.includes('authentication hook unauthorized')) return true;
    }
    return false;
};

let _sessionExpiredTriggered = false;

export const handleSessionExpired = (source: string): void => {
    if (_sessionExpiredTriggered) return;
    _sessionExpiredTriggered = true;
    dbg('auth', `session expired via ${source}, logging out`);
    snackActions.warning('Session expired — logging out');
    FailedRefresh(true);
    setTimeout(() => {
        _sessionExpiredTriggered = false;
        window.location.href = '/new/login';
    }, 800);
};

// ── Login / Refresh / Logout actions ───────────────────────────────

interface AuthResponse {
    access_token: string;
    refresh_token: string;
    user: Omit<MythicUser, 'server_skew' | 'login_time'> & { current_utc_time: string };
}

const applyAuthResponse = (data: AuthResponse, existingUser?: MythicUser | null): void => {
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
    const now = new Date();
    const serverNow = new Date(data.user.current_utc_time);
    const difference = serverNow.getTime() - now.getTime();
    const me: MythicUser = { ...(existingUser ?? data.user), ...data.user, server_skew: difference, login_time: now } as MythicUser;
    meState({
        loggedIn: true,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: me,
    });
    localStorage.setItem(USER_KEY, JSON.stringify(me));
};

export const successfulLogin = (data: AuthResponse): void => {
    applyAuthResponse(data);
    restartWebsockets();
};

export const successfulRefresh = (data: AuthResponse): void => {
    applyAuthResponse(data, meState().user);
};

export const FailedRefresh = (restart_websockets?: boolean): void => {
    dbg('auth', 'failed refresh');
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // Clear all cookies
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        document.cookie = cookies[i] + "=; expires=" + new Date(0).toUTCString();
    }
    meState({
        loggedIn: false,
        access_token: null,
        refresh_token: null,
        user: null,
    });
    mePreferences(operatorSettingDefaults);
    snackActions.clearAll();
    if (restart_websockets) {
        restartWebsockets();
    }
};
