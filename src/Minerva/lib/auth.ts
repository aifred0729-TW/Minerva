// ═══════════════════════════════════════════════════════════════════
//  Authentication & JWT helpers
//
//  Consolidates logic that was split between index.js (JWT helpers)
//  and cache.js (login / refresh / logout actions).
//
//  Dependency chain:  state → time → websocket → auth  (no cycles)
// ═══════════════════════════════════════════════════════════════════
import { jwtDecode } from 'jwt-decode';
import { meState, mePreferences, operatorSettingDefaults } from './state';
import { getSkewedNow } from './time';
import { restartWebsockets } from './websocket';
import { snackActions } from './snackbar';
import { dbg } from './utils';

// ── Version tag ────────────────────────────────────────────────────
export const mythicUIVersion = "0.3.106";

// ── JWT helpers ────────────────────────────────────────────────────

export const isJWTValid = (): boolean => {
    let access_token = localStorage.getItem("access_token");
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
                            access_token = localStorage.getItem("access_token");
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
        const decoded_token: any = jwtDecode(access_token);
        if (getSkewedNow().getTime() > decoded_token.exp * 1000) {
            dbg('auth', 'token expired', decoded_token.exp * 1000, getSkewedNow().getTime());
            return false;
        }
        return true;
    }
    return false;
};

export const JWTTimeLeft = (): number => {
    const access_token = localStorage.getItem("access_token");
    if (access_token) {
        const decoded_token: any = jwtDecode(access_token);
        return (decoded_token.exp * 1000) - (getSkewedNow() as any);
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
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
            'MythicSource': "web",
        },
        body: JSON.stringify({
            refresh_token: localStorage.getItem("refresh_token"),
            access_token: localStorage.getItem("access_token"),
        }),
    };
    try {
        const response = await fetch('/refresh', requestOptions);
        if (response.ok) {
            return response.json().then((data) => {
                if ("access_token" in data) {
                    successfulRefresh(data);
                    dbg('auth', 'successfully got new access_token');
                    fetchingNewToken = false;
                    return true;
                }
                dbg('auth', 'FailedRefresh from GetNewToken');
                FailedRefresh();
                fetchingNewToken = false;
                return false;
            }).catch((error) => {
                dbg('auth', 'GetNewToken JSON parse error', error);
                FailedRefresh();
                fetchingNewToken = false;
                return false;
            });
        } else if (response.status === 403) {
            FailedRefresh();
            fetchingNewToken = false;
            return false;
        } else {
            fetchingNewToken = false;
            return true;
        }
    } catch (error) {
        dbg('auth', 'GetNewToken fetch error', error);
        FailedRefresh();
        fetchingNewToken = false;
        return false;
    }
};

/** Whether a token refresh is currently in-flight (used by authLink). */
export const isFetchingNewToken = () => fetchingNewToken;
export const setFetchingNewToken = (v: boolean) => { fetchingNewToken = v; };

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

export const successfulLogin = (data: any): void => {
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    const now = new Date();
    const serverNow = new Date(data.user.current_utc_time);
    const difference = serverNow.getTime() - now.getTime();
    const me = { ...data.user, server_skew: difference, login_time: now };
    meState({
        loggedIn: true,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: { ...me },
    });
    localStorage.setItem("user", JSON.stringify(me));
    restartWebsockets();
};

export const successfulRefresh = (data: any): void => {
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    const now = new Date();
    const serverNow = new Date(data.user.current_utc_time);
    const difference = serverNow.getTime() - now.getTime();
    const me = { ...meState().user, server_skew: difference, login_time: now };
    meState({
        loggedIn: true,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: { ...me },
    });
    localStorage.setItem("user", JSON.stringify(me));
};

export const FailedRefresh = (restart_websockets?: boolean): void => {
    dbg('auth', 'failed refresh');
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
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
