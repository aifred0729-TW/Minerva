// ═══════════════════════════════════════════════════════════════════
//  Global reactive state & operator-setting defaults
//
//  This module is the SINGLE SOURCE OF TRUTH for shared reactive
//  variables that were previously scattered across cache.js and
//  index.js.  It intentionally has ZERO internal project imports
//  so it can never participate in a circular-dependency chain.
// ═══════════════════════════════════════════════════════════════════
import { makeVar } from '@apollo/client';

// ── Auth state ─────────────────────────────────────────────────────

/** Properties set on the user object during login. */
export interface MythicUser {
    id: number;
    user_id: number;
    username: string;
    admin: boolean;
    current_operation_id: number;
    current_operation?: string;
    view_utc_time?: boolean;
    server_skew: number;
    login_time: Date;
    [key: string]: unknown;       // allow additional server-provided fields
}

export interface MeState {
    loggedIn: boolean;
    access_token: string | null;
    refresh_token: string | null;
    user: MythicUser | null;
    badConnection?: boolean;
}

export const meState = makeVar<MeState>({
    loggedIn: false,
    user: null,
    access_token: null,
    refresh_token: null,
});

// ── Task timestamp display options ─────────────────────────────────
export const taskTimestampDisplayFieldOptions = [
    {
        name: "timestamp",
        display: "Latest Timestamp for anything task related",
    },
    {
        name: "status_timestamp_preprocessing",
        display: "When Operator Submitted Task",
    },
    {
        name: "status_timestamp_processing",
        display: "When Agent Picked up Task",
    },
];

// ── Tasking context fields ─────────────────────────────────────────
export const taskingContextFieldsOptions = [
    "impersonation_context",
    "cwd",
    "user",
    "host",
    "ip",
    "pid",
    "process_short_name",
    "extra_info",
    "architecture",
].sort();

// ── Operator setting defaults ──────────────────────────────────────
export const operatorSettingDefaults: Record<string, any> = {
    fontSize: 12,
    navBarOpen: false,
    fontFamily: "Verdana, Arial, sans-serif",
    showMedia: true,
    hideUsernames: false,
    showIP: false,
    showHostname: false,
    showOPSECBypassUsername: false,
    showCallbackGroups: false,
    useDisplayParamsForCLIHistory: false,
    interactType: "interactSplit",
    taskTimestampDisplayField: "timestamp",
    callbacks_table_columns: [
        "Interact", "Host", "Domain", "User", "Description",
        "Last Checkin", "Agent", "IP", "PID",
    ],
    callbacks_table_filters: {},
    autoTaskLsOnEmptyDirectories: false,
    hideBrowserTasking: false,
    hideTaskingContext: false,
    taskingContextFields: ["impersonation_context", "cwd"],
    "experiment-responseStreamLimit": 50,
    palette: {
        primary:           { dark: "#75859b", light: "#75859b" },
        error:             { dark: '#bd5142', light: '#c42c32' },
        success:           { dark: '#85b089', light: '#0e7004' },
        secondary:         { dark: '#bebebe', light: '#a6a5a5' },
        info:              { dark: '#84b4dc', light: '#4990b2' },
        warning:           { dark: "#dc8455", light: "#ffb74d" },
        background:        { dark: '#282828', light: '#f6f6f6' },
        paper:             { dark: '#282828', light: '#ececec' },
        tableHeader:       { dark: '#484848', light: '#c4c4c4' },
        tableHover:        { dark: "#3c3c3c", light: "#e8e8e8" },
        pageHeader:        { dark: '#1b2025', light: '#706c6e' },
        text:              { dark: "#e4e4e4", light: "#000000" },
        selectedCallbackColor:          { dark: '#26456e', light: '#c6e5f6' },
        selectedCallbackHierarchyColor: { dark: '#273e5d', light: '#deeff8' },
        backgroundImage:   { dark: null, light: null },
        navBarIcons:       { dark: '#ffffff', light: '#ffffff' },
        navBarText:        { dark: '#ffffff', light: '#ffffff' },
        navBarColor:       { dark: "#194573", light: "#3b606d" },
        navBarBottomColor: { dark: "#330814", light: "#283581" },
        taskPromptTextColor:        { dark: '#bebebe', light: '#a6a5a5' },
        taskPromptCommandTextColor: { dark: "#e4e4e4", light: "#000000" },
        taskContextColor:               { dark: "#122848", light: "#acc0da" },
        taskContextImpersonationColor:  { dark: "#641616", light: "#dec0c0" },
        taskContextExtraColor:          { dark: "#2a5953", light: "#a7ce9d" },
        emptyFolderColor:  { dark: '#bebebe', light: '#a6a5a5' },
    },
};

// ── Default sidebar shortcuts ──────────────────────────────────────
export const defaultShortcuts = [
    "ActiveCallbacks", "Payloads", "PayloadTypesAndC2",
    "Operations", "SearchFiles", "SearchProxies",
    "Reporting", "Eventing",
].sort();

// ── Operator preferences (reactive) ───────────────────────────────
export const mePreferences = makeVar(operatorSettingDefaults);
