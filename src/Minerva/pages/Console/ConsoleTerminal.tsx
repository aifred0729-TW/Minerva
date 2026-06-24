import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useApolloClient, useMutation, useSubscription, useReactiveVar } from "@apollo/client/react";
import { useQueryCompat as useQuery } from "../../lib/useQueryCompat";
import type { Task } from '../../types/tasks';
import type { CommandDefinition, CommandParameter } from '../../types/commands';
import { validate as uuidValidate } from 'uuid';
import { parseCommandLine, determineCommandGroupName, simplifyGroupNameChoices, fillOutPositionalArguments } from './commandParser';
import type { LoadedCmd } from './commandParser';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowRight,
    ChevronDown,
    ChevronUp,
    Command,
    EyeOff,
    File,
    Filter,
    Key,
    ListTree,
    MessageSquare,
    Rows3,
    Search,
    Skull,
    SlidersHorizontal,
    Users,
    X,
    XCircle,
}from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CALLBACK_CONTEXT_SUBSCRIPTION, CREATE_TASK_MUTATION,
    GET_DYNAMIC_QUERY_PARAMS, GET_LOADED_COMMANDS_SUBSCRIPTION,
    GET_OPERATORS_IN_OPERATION, STREAM_CALLBACK_TASKS,
    SUBSCRIPTION_CALLBACK_TOKENS,
} from '../../lib/api';
import { MythicDialog } from '../../components/MythicDialog';
import { TaskParametersDialog } from '../../components/TaskParametersDialog';
import { useGetMythicSetting } from '../../components/MythicSavedUserSetting';
import { cn, isCallbackAlive, parseFirstIP } from '../../lib/utils';
import { meState, operatorSettingDefaults } from '../../lib/state';
import { snackActions } from '../../lib/snackbar';
import { OutputCallbackContext } from '../../components/OutputRenderer';
import { applyFilterToTask, isFilterActive, defaultFilterOptions, normalizeUnixPath, getOSIcon } from './utils';
import { TaskBlock } from './TaskBlock';
import type { FilterOptions, CallbackToken } from '../../types/console';
import { UploadToAgentModal } from './FileBrowserPanel';
import { useMsfSession } from './useMsfSession';
import { msfRecordsToTasks } from './msfToMythicTask';
import {
    detectBareUploadName,
    getMythicLibraryEntry,
    refreshMythicLibraryIndex,
    suggestMythicLibraryNames,
    listMythicLibraryNames,
    bestSingleLibraryMatch,
} from '../../lib/mythicLibraryIndex';
import { HelpPanel, type LoadedCmd as HelpLoadedCmd } from './HelpPanel';

/** Static command catalog used for tab completion in MSF mode. */
const MSF_BUILTIN_COMMANDS: Array<{ cmd: string; description: string; supports: 'meterpreter' | 'shell' | 'both' }> = [
    { cmd: 'sysinfo',     description: 'Host fingerprint',              supports: 'meterpreter' },
    { cmd: 'getuid',      description: 'Effective user',                supports: 'meterpreter' },
    { cmd: 'getpid',      description: 'Current process id',            supports: 'meterpreter' },
    { cmd: 'ps',          description: 'Process list',                  supports: 'meterpreter' },
    { cmd: 'kill',        description: 'Kill <pid>',                    supports: 'meterpreter' },
    { cmd: 'ls',          description: 'List directory',                supports: 'both' },
    { cmd: 'pwd',         description: 'Working directory',             supports: 'both' },
    { cmd: 'cd',          description: 'Change directory',              supports: 'both' },
    { cmd: 'cat',         description: 'Print file',                    supports: 'both' },
    { cmd: 'download',    description: 'Pull file to MSF loot',         supports: 'meterpreter' },
    { cmd: 'upload',      description: 'Push file to host',             supports: 'meterpreter' },
    { cmd: 'shell',       description: 'Drop to native shell',          supports: 'meterpreter' },
    { cmd: 'background',  description: 'Return to msfconsole',          supports: 'meterpreter' },
    { cmd: 'screenshot',  description: 'Capture desktop screenshot',    supports: 'meterpreter' },
    { cmd: 'hashdump',    description: 'Dump SAM hashes',               supports: 'meterpreter' },
    { cmd: 'route',       description: 'Routing table / pivot setup',   supports: 'meterpreter' },
    { cmd: 'portfwd',     description: 'Port forwarding',               supports: 'meterpreter' },
    { cmd: 'help',        description: 'Show built-in command help',    supports: 'both' },
    { cmd: 'whoami',      description: 'Current user',                  supports: 'shell' },
    { cmd: 'id',          description: 'Effective user id',             supports: 'shell' },
    { cmd: 'uname',       description: 'Kernel info',                   supports: 'shell' },
];

const SCROLL_BOTTOM_THRESHOLD = 80;

export const ConsoleTerminal = ({
    callbackId, callbackDbId, callbackUUID, payloadtypeName, payloadtypeId, callbackOs, operationId, callbackHost,
    callbackActive, callbackLastCheckin, callbackSleepInfo,
    // ── MSF-mode props ────────────────────────────────────────────────────
    // When `agentMode === 'msf'`, the terminal drives a Metasploit session
    // via msfTaskStore / sessionRead / sessionWrite instead of Mythic's
    // Apollo subscriptions + tasking mutation. All visual chrome stays the
    // same; the only differences are the data source and the submit path.
    agentMode = 'mythic',
    msfSessionId,
    msfSessionType,
    msfConnectionLost = false,
}: {
    callbackId: number;
    callbackDbId: number;
    callbackUUID: string;
    payloadtypeName: string;
    payloadtypeId: number;
    callbackOs: string;
    operationId: number;
    callbackHost: string;
    callbackActive: boolean;
    callbackLastCheckin: string | null;
    callbackSleepInfo: string | null;
    agentMode?: 'mythic' | 'msf';
    msfSessionId?: string;
    msfSessionType?: string;
    msfConnectionLost?: boolean;
}) => {
    const isMsfMode = agentMode === 'msf';
    const me = useReactiveVar(meState);
    const apolloClient = useApolloClient();
    const isDead = !isCallbackAlive({ active: callbackActive, last_checkin: callbackLastCheckin ?? undefined, sleep_info: callbackSleepInfo ?? undefined });
    const [collapseAllEpoch, setCollapseAllEpoch] = useState(0);
    // #8 — Expand All Tasks
    const [expandAllEpoch, setExpandAllEpoch] = useState(0);
    // #14 — Task view mode: 'expanded' = all open (console-like), 'compact' = collapsed by default (accordion-like)
    const [taskViewMode, setTaskViewMode] = useState<'expanded' | 'compact'>(() => {
        try { return (localStorage.getItem('minerva-taskViewMode') as 'expanded' | 'compact') || 'expanded'; } catch { return 'expanded'; }
    });
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [input, setInput] = useState('');
    const [commandPayloadType, setCommandPayloadType] = useState('');
    const [commandInfo, setCommandInfo] = useState<unknown>({});
    const [openParametersDialog, setOpenParametersDialog] = useState(false);
    // Parsed help overlay state — `help` and `help <cmd>` are intercepted in
    // `handleSend` and never reach Mythic; they open this panel instead.
    const [helpPanel, setHelpPanel] = useState<{ mode: 'index' | 'detail'; target?: HelpLoadedCmd } | null>(null);
    const loadedOptions = useRef<any[]>([]);
    const taskOptionsIndex = useRef(-1);

    // ---- Local CLI input history (per-callback, localStorage-backed) ----
    // Records literal typed lines so ↑/↓ recall exactly what the user typed,
    // not Mythic's post-parse form (e.g. `shell …` instead of expanded `run -Executable … -Arguments …`).
    const inputHistoryKey = `minerva.consoleInputHistory.${callbackId}`;
    const [localInputHistory, setLocalInputHistory] = useState<string[]>(() => {
        try {
            const raw = localStorage.getItem(inputHistoryKey);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
    });
    useEffect(() => {
        try {
            const raw = localStorage.getItem(inputHistoryKey);
            const parsed = raw ? JSON.parse(raw) : [];
            setLocalInputHistory(Array.isArray(parsed) ? parsed : []);
        } catch { setLocalInputHistory([]); }
    }, [inputHistoryKey]);
    const pushInputHistory = useCallback((line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        setLocalInputHistory(prev => {
            if (prev[prev.length - 1] === trimmed) return prev;
            const next = [...prev, trimmed];
            if (next.length > 500) next.splice(0, next.length - 500);
            try { localStorage.setItem(inputHistoryKey, JSON.stringify(next)); } catch {}
            return next;
        });
    }, [inputHistoryKey]);

    // ---- Filter state ----
    const [filterOptions, setFilterOptions] = useState<FilterOptions>(defaultFilterOptions);
    const [showFilterPanel, setShowFilterPanel] = useState(false);

    // ---- Token (impersonation) state ----
    const [selectedToken, setSelectedToken] = useState<CallbackToken | null>(null);
    const [availableTokens, setAvailableTokens] = useState<CallbackToken[]>([]);
    const [showTokenMenu, setShowTokenMenu] = useState(false);
    const tokenMenuRef = useRef<HTMLDivElement>(null);

    // ---- Operator list for filter UI ----
    const [operatorUsernames, setOperatorUsernames] = useState<string[]>([]);

    // ---- Tab Completion state ----
    const tabCompletionIndex = useRef(-1);
    const tabCompletionOptions = useRef<string[]>([]);
    const tabCompletionBase = useRef('');
    const tabCompletionMode = useRef<'command' | 'param_name' | 'param_value'>('command');
    const [tabLoading, setTabLoading] = useState(false);

    // ---- Reverse Search (Ctrl+R) state ----
    const [reverseSearchActive, setReverseSearchActive] = useState(false);
    const [reverseSearchText, setReverseSearchText] = useState('');
    const reverseSearchIndex = useRef(0);
    const reverseSearchRef = useRef<HTMLInputElement>(null);

    // ---- Tasking Context state ----
    const [callbackContext, setCallbackContext] = useState<Record<string, unknown>>({});
    const hideTaskingContext: boolean = useGetMythicSetting({setting_name: 'hideTaskingContext', default_value: operatorSettingDefaults.hideTaskingContext ?? false});
    const taskingContextFields: string[] = useGetMythicSetting({setting_name: 'taskingContextFields', default_value: operatorSettingDefaults.taskingContextFields ?? ['impersonation_context', 'cwd']});
    const useDisplayParamsForCLIHistory: boolean = useGetMythicSetting({setting_name: 'useDisplayParamsForCLIHistory', default_value: operatorSettingDefaults.useDisplayParamsForCLIHistory ?? false});

    // ---- Command Disambiguation state ----
    const [disambiguationOptions, setDisambiguationOptions] = useState<any[]>([]);
    const [showDisambiguation, setShowDisambiguation] = useState(false);
    const pendingDisambiguationInput = useRef('');

    // ---- Dynamic Query Params mutation (for tab completion) ----
    const [getDynamicParams] = useMutation<any>(GET_DYNAMIC_QUERY_PARAMS);

    // ---- Callback Context subscription ----
    useSubscription<any>(CALLBACK_CONTEXT_SUBSCRIPTION, {
        variables: { callback_id: callbackDbId },
        fetchPolicy: "network-only",
        shouldResubscribe: true,
        skip: isMsfMode,
        onData: ({ data: subData }: any) => {
            const ctx = subData?.data?.callback_stream?.[0];
            if (ctx) {
                const newCtx = { ...ctx };
                newCtx.ip = parseFirstIP(newCtx.ip);
                setCallbackContext(newCtx);
            }
        },
    });

    const [createTask, { loading: mythicTasking }] = useMutation<any>(CREATE_TASK_MUTATION, {
        onCompleted: (data: any) => {
            if (data?.createTask?.status === 'error') {
                snackActions.error(data.createTask.error || 'Task creation failed');
            }
        },
        onError: (err: Error) => {
            console.error('Tasking failed:', err);
            snackActions.error('Failed to create task: ' + (err?.message || 'Unknown error'));
        }
    });
    // In MSF mode we drive the busy indicator from local state.
    const [msfTasking, setMsfTasking] = useState(false);
    const tasking = isMsfMode ? msfTasking : mythicTasking;

    // Use task_stream subscription for real-time task + response updates.
    // The task timestamp is bumped by a DB trigger whenever a new response row is inserted,
    // so the stream naturally re-fires and delivers fresh inline responses.
    const [taskMap, setTaskMap] = useState<Map<number, any>>(new Map());
    const { loading: taskStreamLoading } = useSubscription<any>(STREAM_CALLBACK_TASKS, {
        variables: { callback_display_id: callbackId },
        fetchPolicy: "network-only",
        shouldResubscribe: true,
        skip: isMsfMode,
        onData: ({ data: streamData }: any) => {
            const incoming: Task[] = streamData?.data?.task_stream;
            if (!incoming?.length) return;
            setTaskMap(prev => {
                const next = new Map(prev);
                incoming.forEach((t: Task) => next.set(t.id, t));
                return next;
            });
        },
        onError: (err) => { console.error('[STREAM_CALLBACK_TASKS] subscription error:', err); },
    });

    // ── MSF task source ─────────────────────────────────────────────────────
    // When in MSF mode we drive a parallel data path: msfTaskStore → adapter
    // → Mythic-shaped Task array, then funnel through the same UI pipeline.
    const msfSession = useMsfSession(
        msfSessionId || '',
        msfSessionType || 'meterpreter',
        isMsfMode && !msfConnectionLost && !!msfSessionId,
    );
    const msfTasks = useMemo(
        () => isMsfMode ? msfRecordsToTasks(msfSession.tasks) as Task[] : [],
        [isMsfMode, msfSession.tasks],
    );
    const loading = isMsfMode ? false : taskStreamLoading;

    const tasks = useMemo(
        () => {
            const all = isMsfMode
                ? msfTasks
                : [...taskMap.values()].sort((a, b) => a.id - b.id);
            if (!isFilterActive(filterOptions)) return all;
            return all.filter(t => applyFilterToTask(t, filterOptions, me.user?.username as string | undefined));
        },
        [isMsfMode, msfTasks, taskMap, filterOptions, me.user?.username]
    );

    // Track whether the user is pinned to the bottom.
    // Starts true so the initial task batches always auto-scroll.
    const isAtBottom = useRef(true);
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const onScroll = () => {
            isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD;
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    const scrollToBottom = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        // scrollTo with the latest scrollHeight — called after DOM mutations via useLayoutEffect
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
        isAtBottom.current = true;
    }, []);

    // Called by TaskBlock via useLayoutEffect AFTER the output DOM has grown.
    // Only re-pins if the user was already at the bottom.
    const handleTaskReveal = useCallback(() => {
        if (isAtBottom.current) scrollToBottom();
    }, [scrollToBottom]);

    // Scroll to bottom once when the first batch of tasks arrives on initial load.
    // Never auto-scrolls again when the user submits new commands.
    const hasInitialScrolled = useRef(false);
    useLayoutEffect(() => {
        if (tasks.length === 0 || hasInitialScrolled.current) return;
        scrollToBottom();
        hasInitialScrolled.current = true;
    }, [tasks, scrollToBottom]);

    useEffect(() => { inputRef.current?.focus(); }, []);
    // Re-focus input whenever the mutation finishes (tasking goes false → true → false)
    useEffect(() => { if (!tasking) inputRef.current?.focus(); }, [tasking]);

    // Subscribe to loaded commands for this callback
    useSubscription<any>(GET_LOADED_COMMANDS_SUBSCRIPTION, {
        variables: { callback_id: callbackDbId },
        fetchPolicy: "network-only",
        shouldResubscribe: true,
        skip: isMsfMode,
        onData: ({ data: subData }: any) => {
            if (!subData?.data?.loadedcommands) return;
            const cmds = subData.data.loadedcommands.map((c: any) => {
                const cmdData = { ...c.command };
                cmdData.commandparameters = [...(cmdData.commandparameters || [])].sort(
                    (a: CommandParameter, b: CommandParameter) => a.ui_position > b.ui_position ? 1 : -1
                );
                return cmdData;
            });
            cmds.push({ cmd: "help", description: "Get help for a command or info about loaded commands", commandparameters: [], attributes: { supported_os: [] } });
            cmds.push({ cmd: "clear", description: "Clear 'submitted' jobs from being pulled down by an agent", commandparameters: [], attributes: { supported_os: [] } });
            cmds.sort((a: CommandDefinition, b: CommandDefinition) => a.cmd > b.cmd ? 1 : -1);
            loadedOptions.current = cmds;
        },
        onError: (err) => { console.error('[GET_LOADED_COMMANDS_SUBSCRIPTION] subscription error:', err); },
    });

    // Subscribe to callback tokens (for impersonation)
    useSubscription<any>(SUBSCRIPTION_CALLBACK_TOKENS, {
        variables: { callback_id: callbackDbId },
        fetchPolicy: "network-only",
        shouldResubscribe: true,
        skip: isMsfMode,
        onData: ({ data: subData }: any) => {
            const tokens: CallbackToken[] = (subData?.data?.callbacktoken || []).map((ct: any) => ct.token).filter(Boolean);
            setAvailableTokens(tokens);
            if (tokens.length === 0) setSelectedToken(null);
        },
        onError: (err) => { console.error('[SUBSCRIPTION_CALLBACK_TOKENS] subscription error:', err); },
    });

    // Load operators for filter panel (Mythic only — MSF uses local operator name)
    useQuery<any>(GET_OPERATORS_IN_OPERATION, {
        variables: { operation_id: operationId },
        skip: !operationId || isMsfMode,
        onCompleted: (data: any) => {
            setOperatorUsernames((data?.operation_by_pk?.operators || []).map((op: any) => op.username));
        }
    });

    // In MSF mode, seed loadedOptions with a static catalog so tab completion
    // and the "cmds loaded" indicator behave the same as for Mythic.
    useEffect(() => {
        if (!isMsfMode) return;
        const wantsMeterpreter = (msfSessionType || 'meterpreter') === 'meterpreter';
        const compatible = MSF_BUILTIN_COMMANDS.filter(c =>
            c.supports === 'both' ||
            (wantsMeterpreter && c.supports === 'meterpreter') ||
            (!wantsMeterpreter && c.supports === 'shell'),
        );
        loadedOptions.current = compatible.map(c => ({
            cmd: c.cmd,
            description: c.description,
            commandparameters: [],
            attributes: { supported_os: [] },
        })) as any[];
        // Operator name surfaces in the filter panel.
        const opName = me.user?.username || msfSession.operator || 'operator';
        setOperatorUsernames(prev => prev.includes(opName) ? prev : [...prev, opName]);
    }, [isMsfMode, msfSessionType, me.user?.username, msfSession.operator]);

    // Synthesise callbackContext from MSF session metadata so tasking-context
    // badges still appear (host, user, cwd if known).
    useEffect(() => {
        if (!isMsfMode || !msfSession) return;
        // We don't have a real-time `cwd` for MSF; the file-browser owns cwd
        // and we surface it via msfFsCache by reading the same key here later.
        setCallbackContext({
            user: msfSession.operator,
            host: callbackHost,
        } as Record<string, unknown>);
    }, [isMsfMode, callbackHost, msfSession.operator]);

    // Close token dropdown on outside click
    useEffect(() => {
        if (!showTokenMenu) return;
        const handler = (e: MouseEvent) => {
            if (tokenMenuRef.current && !tokenMenuRef.current.contains(e.target as Node)) setShowTokenMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showTokenMenu]);

    // Esc closes the help overlay
    useEffect(() => {
        if (!helpPanel) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setHelpPanel(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [helpPanel]);

    // ---- Parsing helpers — extracted to ./commandParser.ts ----




    const onCreateTask = (params: Record<string, unknown>) => {
        createTask({ variables: {
            callback_id: params.callback_id,
            command: params.command,
            params: params.params,
            files: params.files,
            tasking_location: params.tasking_location,
            original_params: params.original_params,
            parameter_group_name: params.parameter_group_name,
            payload_type: params.payload_type,
            ...(selectedToken ? { token_id: selectedToken.token_id } : {}),
        }});
    };

    const submitParametersDialog = (cmd: string, parameters: string, files: string[], selectedParameterGroup: string, payload_type: string) => {
        setOpenParametersDialog(false);
        onCreateTask({
            callback_id: callbackId,
            command: cmd,
            params: parameters,
            files,
            tasking_location: "modal",
            parameter_group_name: selectedParameterGroup,
            payload_type,
        });
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const processCommandAndCommandLine = (cmd: CommandDefinition & { commandparameters: CommandParameter[] }, currentInput: string) => {
        const splitMessage = currentInput.trim().split(" ");
        const paramsStr = splitMessage.slice(1).join(" ");
        let cmdGroupName: string[] = ["Default"];
        let parsedWithPositionalParameters: Record<string, any> = {};
        let failed_json_parse = true;
        try {
            parsedWithPositionalParameters = JSON.parse(paramsStr);
            if (['string', 'number', 'boolean', null].includes(typeof parsedWithPositionalParameters)) throw new Error("not a dict");
            const groups = determineCommandGroupName(cmd, parsedWithPositionalParameters);
            if (groups === undefined) { snackActions.warning("Two or more of the specified parameters can't be used together"); return; }
            cmdGroupName = groups; cmdGroupName.sort();
            failed_json_parse = false;
        } catch { failed_json_parse = true; }

        if (failed_json_parse) {
            let parsed: Record<string, any> | undefined = parseCommandLine(paramsStr, cmd) as Record<string, any> | undefined;
            if (parsed === undefined) return;
            parsed = { ...parsed };
            const groups = determineCommandGroupName(cmd, parsed);
            if (groups === undefined) { snackActions.warning("Two or more of the specified parameters can't be used together"); return; }
            cmdGroupName = groups; cmdGroupName.sort();
            if (cmd.commandparameters.length > 0) {
                parsed["_"].unshift(cmd);
                parsedWithPositionalParameters = (fillOutPositionalArguments(cmd, parsed, cmdGroupName, currentInput) as Record<string, any> | undefined) ?? {};
                if (parsedWithPositionalParameters === undefined) return;
                if (parsedWithPositionalParameters["_"].length > 0) {
                    snackActions.warning("Too many positional arguments given. Did you mean to quote some of them?"); return;
                }
            } else {
                parsedWithPositionalParameters = parsed;
            }
        }

        const originalParams = paramsStr;

        // Check if a popup dialog is needed (file param missing OR present
        // but not a UUID — the previous version only opened the dialog when
        // the File param was absent, which let `upload fscan.exe` send the
        // literal name through to Apollo and trip the backend RPC).
        if (cmd.commandparameters.length > 0) {
            const fileParamExists = cmd.commandparameters.find((param: any) => {
                if (param.parameter_type === "File" && cmdGroupName.includes(param.parameter_group_name)) {
                    const candidates = [param.cli_name, param.name, param.display_name];
                    const presentKey = candidates.find(k => k && k in parsedWithPositionalParameters);
                    if (!presentKey) return true; // not supplied at all
                    return !uuidValidate(parsedWithPositionalParameters[presentKey]); // supplied but not a UUID
                }
                return false;
            });
            // ConnectionInfo params (e.g. Apollo's `link` / `link_webshell`)
            // need a full `{host, c2_profile:{name, parameters}, callback_uuid}`
            // object. Operators almost always type a shorter shape like
            // `link {"host":"...","port":...}`, which then fails server-side
            // with the cryptic "Required arg connection_info has no value"
            // error because no key matched the ConnectionInfo cli_name.
            // Pop the parameters dialog so Mythic's built-in connection picker
            // assembles a valid connection_info — pre-filled with whatever
            // host/port the operator already typed.
            const connectionParamMalformed = cmd.commandparameters.find((param: any) => {
                if (param.parameter_type === "ConnectionInfo" && cmdGroupName.includes(param.parameter_group_name)) {
                    const candidates = [param.cli_name, param.name, param.display_name];
                    const presentKey = candidates.find(k => k && k in parsedWithPositionalParameters);
                    if (!presentKey) return true; // operator didn't even attempt the right key
                    const v = parsedWithPositionalParameters[presentKey];
                    // A valid ConnectionInfo is an object with at minimum a
                    // c2_profile sub-object. Anything else (string, number,
                    // bare `{host, port}` shape) is malformed.
                    if (!v || typeof v !== 'object' || Array.isArray(v)) return true;
                    if (!v.c2_profile || typeof v.c2_profile !== 'object') return true;
                    return false;
                }
                return false;
            });
            let missingRequiredParams = false;
            if (cmdGroupName.length === 1) {
                const missingParams = cmd.commandparameters.filter((param: CommandParameter) =>
                    param.required && param.parameter_group_name === cmdGroupName[0] &&
                    !(param.cli_name in parsedWithPositionalParameters || param.name in parsedWithPositionalParameters || param.display_name in parsedWithPositionalParameters)
                );
                if (missingParams.length > 0) missingRequiredParams = true;
            }
            if (fileParamExists || connectionParamMalformed || missingRequiredParams) {
                // For ConnectionInfo we surface a one-line snack so the
                // operator understands *why* the dialog opened — they typed
                // a valid-looking JSON and would otherwise blame the UI.
                if (connectionParamMalformed && !fileParamExists && !missingRequiredParams) {
                    snackActions.info(
                        `${cmd.cmd} needs a full connection_info — opening picker (your host/port are pre-filled if recognised)`,
                    );
                }
                setCommandInfo({ ...cmd, "parsedParameters": parsedWithPositionalParameters, groupName: cmdGroupName[0] || "Default" });
                setOpenParametersDialog(true);
                return;
            }
        }

        // Resolve ambiguous group names
        let finalGroupName = cmdGroupName;
        if (finalGroupName.length > 1) {
            if (finalGroupName.includes("Default")) {
                finalGroupName = ["Default"];
            } else {
                const simplified = simplifyGroupNameChoices(finalGroupName, cmd, parsedWithPositionalParameters);
                if (simplified === "") {
                    setCommandInfo({ ...cmd, "parsedParameters": parsedWithPositionalParameters, groupName: cmdGroupName[0] || "Default" });
                    setOpenParametersDialog(true);
                    return;
                }
                finalGroupName = [simplified];
            }
        }

        const cleanParsed = { ...parsedWithPositionalParameters };
        delete cleanParsed["_"];

        onCreateTask({
            callback_id: callbackId,
            command: cmd.cmd,
            params: cmd.commandparameters.length > 0 ? JSON.stringify(cleanParsed) : originalParams,
            tasking_location: "parsed_cli",
            original_params: originalParams,
            parameter_group_name: finalGroupName[0] || "Default",
            payload_type: cmd.payloadtype?.name,
        });
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleSend = (currentInput: string) => {
        if (!currentInput.trim() || tasking) return;
        const trimmed = currentInput.trim();
        // Record literal typed line for ↑/↓ recall, even if it later fails parsing —
        // user can fix typos without retyping the whole line.
        pushInputHistory(trimmed);

        // ── MSF submit path ─────────────────────────────────────────────────
        // Free-form: no command catalog validation, no param dialog. The
        // record is created on the spot via msfTaskStore + sessionWrite;
        // the broker poller streams response chunks back into it.
        if (isMsfMode) {
            if (!msfSessionId || msfConnectionLost) {
                snackActions.warning(msfConnectionLost ? 'MSF session disconnected' : 'No MSF session bound');
                return;
            }
            setMsfTasking(true);
            msfSession.runCommand(trimmed, { origin: 'console' })
                .catch((e) => snackActions.error(e?.message || 'MSF send failed'))
                .finally(() => {
                    setMsfTasking(false);
                    inputRef.current?.focus();
                });
            setInput('');
            taskOptionsIndex.current = -1;
            return;
        }

        const cmdName = trimmed.split(" ")[0];
        // ── `help` intercept ────────────────────────────────────────────
        // `help` alone opens the parsed command index; `help <cmd>` opens
        // that command's detail page. Both stay client-side — no task is
        // created on the agent — so the operator gets a Minerva-styled,
        // documentation-linked view instead of whatever flat text the
        // agent's help_cmd would have produced.
        if (cmdName === 'help') {
            const argName = trimmed.split(/\s+/)[1];
            if (argName) {
                const target = loadedOptions.current.find(
                    (c: LoadedCmd) => c.cmd?.toLowerCase() === argName.toLowerCase(),
                );
                if (target) {
                    setHelpPanel({ mode: 'detail', target: target as HelpLoadedCmd });
                } else {
                    snackActions.warning(`No loaded command named '${argName}'`);
                    setHelpPanel({ mode: 'index' });
                }
            } else {
                setHelpPanel({ mode: 'index' });
            }
            setInput('');
            setCommandPayloadType('');
            taskOptionsIndex.current = -1;
            inputRef.current?.focus();
            return;
        }
        const cmds = loadedOptions.current.filter((l: LoadedCmd) => l.cmd === cmdName);
        if (!cmds || cmds.length === 0) {
            snackActions.warning("Unknown (or not loaded) command: " + cmdName);
            return;
        }
        let cmd = cmds[0];
        if (cmds.length > 1 && commandPayloadType !== "") {
            const byType = cmds.find((c: LoadedCmd) => c?.payloadtype?.name === commandPayloadType);
            if (byType) cmd = byType;
        } else if (cmds.length > 1) {
            const byType = cmds.find((c: LoadedCmd) => c?.payloadtype?.name === payloadtypeName);
            if (byType) cmd = byType;
            else {
                // Multiple commands with same name from different payload types — disambiguation
                pendingDisambiguationInput.current = trimmed;
                setDisambiguationOptions(cmds);
                setShowDisambiguation(true);
                return;
            }
        }
        // ── Mythic `upload <bare-name>` auto-resolve ─────────────────────
        // `<bare-name>` may refer to either a Mythic uploaded file (Files
        // page) or a built payload (Payloads page) — both live at
        // `/mythic_files/<uuid>` on disk and both are tracked by the
        // shared library index. The operator's intent when typing
        // `upload fscan.exe` is "pick the matching file and upload it",
        // never "open a dialog so I can hunt for it again", so we resolve
        // here and submit straight through:
        //
        //   1. UUID typed verbatim    → rewrite directly, no lookup.
        //   2. Bare name in index     → rewrite to `{File:<uuid>}` form.
        //   3. Bare name NOT in index → force a network-only refetch (a
        //                               payload built seconds ago hasn't
        //                               hit the 10s poll yet) and retry.
        //   4. Still not found        → error toast naming what we tried,
        //                               NOT the param-picker dialog.
        //
        // Without this Apollo's `create_go_tasking` would either accept
        // the literal string and crash on `SendMythicRPCFileSearch`
        // ("reject_bytes is on" Python error), or — with the dialog gate
        // — force the operator through an extra modal click for a name
        // they already typed correctly.
        if (cmd.cmd === 'upload' && detectBareUploadName(trimmed)) {
            const fileParam = (cmd.commandparameters || []).find(
                (p: CommandParameter) => p.parameter_type === 'File',
            );
            if (fileParam) {
                const pathParam = (cmd.commandparameters || []).find(
                    (p: CommandParameter) => p.parameter_type === 'String'
                        && /path/i.test(p.cli_name || p.name || ''),
                );
                const bareName = detectBareUploadName(trimmed) as string;
                const focusReset = () => {
                    setInput('');
                    setCommandPayloadType('');
                    taskOptionsIndex.current = -1;
                    inputRef.current?.focus();
                };
                /** Build `upload {<FileCliName>:"<uuid>", <PathCliName>:"<dest>"?}`. */
                const buildRewrite = (uuid: string): string => {
                    const re = /("[^"]*"|\S+)/g;
                    const parts: string[] = [];
                    let m: RegExpExecArray | null;
                    while ((m = re.exec(trimmed.trim())) !== null) parts.push(m[1]);
                    const stripQuotes = (s: string) =>
                        s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
                    const args: Record<string, string> = { [fileParam.cli_name]: uuid };
                    if (parts.length >= 3 && pathParam) {
                        let dest = parts.slice(2).join(' ');
                        dest = stripQuotes(dest);
                        if (dest.endsWith('/') || dest.endsWith('\\')) {
                            const sep = dest.endsWith('\\') ? '\\' : '/';
                            // bareName carries the original filename so a
                            // trailing-separator destination becomes
                            // `dest/<bare-name>`, matching the meterpreter
                            // rewriter's folder semantics.
                            dest = `${dest.slice(0, -1)}${sep}${bareName}`;
                        }
                        args[pathParam.cli_name] = dest;
                    }
                    return `upload ${JSON.stringify(args)}`;
                };
                const submitWithUuid = (uuid: string) => {
                    processCommandAndCommandLine(cmd, buildRewrite(uuid));
                    focusReset();
                };
                // Path 1: operator pasted a literal agent_file_id — trust it.
                if (uuidValidate(bareName)) {
                    submitWithUuid(bareName);
                    return;
                }
                // Path 2: cached library hit (payload OR uploaded file).
                const cached = getMythicLibraryEntry(bareName);
                if (cached) {
                    submitWithUuid(cached.uuid);
                    return;
                }
                // Path 3, 4, 5: refetch → exact retry → unambiguous typo
                // auto-fix → actionable error.
                refreshMythicLibraryIndex(apolloClient).finally(() => {
                    const fresh = getMythicLibraryEntry(bareName);
                    if (fresh) {
                        submitWithUuid(fresh.uuid);
                        return;
                    }
                    // If the typed name is one obvious typo away from
                    // exactly one library entry, silently substitute it
                    // (e.g. `DMZ-zone.exe` → `DEV-zone.exe`). Re-typing
                    // the right name after seeing "Did you mean …" was
                    // pointless friction — the system has all the
                    // information it needs to just do the right thing.
                    const auto = bestSingleLibraryMatch(bareName);
                    if (auto && auto.name.toLowerCase() !== bareName.toLowerCase()) {
                        snackActions.info(`Upload: substituted '${bareName}' → '${auto.name}'`);
                        submitWithUuid(auto.uuid);
                        return;
                    }
                    // Ambiguous or no near-match: surface every close hit
                    // so the operator can tell whether they typo'd, the
                    // build saved under a different name, or the payload
                    // lives in a different operation.
                    const suggestions = suggestMythicLibraryNames(bareName, 5);
                    const total = listMythicLibraryNames().length;
                    let msg = `Upload: '${bareName}' not found in payloads or uploaded files`;
                    if (suggestions.length > 0) {
                        msg += `. Did you mean: ${suggestions.join(', ')}?`;
                    } else if (total === 0) {
                        msg += '. The library index is empty — check that you are in the right operation.';
                    } else {
                        msg += `. (${total} files indexed; check the exact name on the Payloads page.)`;
                    }
                    snackActions.error(msg);
                    focusReset();
                });
                return;
            }
        }
        processCommandAndCommandLine(cmd, trimmed);
        setInput('');
        setCommandPayloadType('');
        taskOptionsIndex.current = -1;
        inputRef.current?.focus();
    };

    const handleSendRef = useRef(handleSend);
    handleSendRef.current = handleSend;

    const handleDisambiguationSelect = (cmd: any) => {
        setShowDisambiguation(false);
        setDisambiguationOptions([]);
        setCommandPayloadType(cmd?.payloadtype?.name || '');
        processCommandAndCommandLine(cmd, pendingDisambiguationInput.current);
        setInput('');
        pendingDisambiguationInput.current = '';
        taskOptionsIndex.current = -1;
        inputRef.current?.focus();
    };

    const [uploadTarget, setUploadTarget] = useState<string | null>(null);

    const onFileAction = useCallback((action: string, path: string, name: string, isDir: boolean) => {
        const p = normalizeUnixPath(path);
        if (action === 'ls') {
            handleSendRef.current(`ls ${p}`);
        } else if (action === 'cat') {
            handleSendRef.current(`cat ${p}`);
        } else if (action === 'download') {
            handleSendRef.current(`download ${p}`);
        } else if (action === 'upload') {
            setUploadTarget(p);
        } else if (action === 'copy') {
            navigator.clipboard.writeText(p);
            snackActions.success('Path copied');
        }
    }, []);

    const tasksHistory = useMemo(() => [...tasks].reverse(), [tasks]);

    // ---- Tab Completion helpers ----
    const getTabCompletionForCommands = (partial: string, reverse: boolean) => {
        const cmds = loadedOptions.current;
        if (cmds.length === 0) return;
        // Build matched list: startsWith first, then includes
        const starts = cmds.filter((c: CommandDefinition & { commandparameters?: CommandParameter[] }) => c.cmd.startsWith(partial)).map((c: CommandDefinition & { commandparameters?: CommandParameter[] }) => c.cmd);
        const includes = cmds.filter((c: LoadedCmd) => !c.cmd.startsWith(partial) && c.cmd.includes(partial)).map((c: CommandDefinition & { commandparameters?: CommandParameter[] }) => c.cmd);
        const allMatches = [...new Set([...starts, ...includes])];
        if (allMatches.length === 0) return;
        if (tabCompletionOptions.current.length === 0 || tabCompletionBase.current !== partial) {
            tabCompletionOptions.current = allMatches;
            tabCompletionBase.current = partial;
            tabCompletionIndex.current = -1;
            tabCompletionMode.current = 'command';
        }
        const opts = tabCompletionOptions.current;
        if (reverse) {
            tabCompletionIndex.current = tabCompletionIndex.current <= 0 ? opts.length - 1 : tabCompletionIndex.current - 1;
        } else {
            tabCompletionIndex.current = tabCompletionIndex.current >= opts.length - 1 ? 0 : tabCompletionIndex.current + 1;
        }
        setInput(opts[tabCompletionIndex.current] + ' ');
    };

    const getTabCompletionForParams = (cmdName: string, currentParams: string, reverse: boolean) => {
        const cmd = loadedOptions.current.find((c: CommandDefinition & { commandparameters?: CommandParameter[] }) => c.cmd === cmdName);
        if (!cmd || !cmd.commandparameters || cmd.commandparameters.length === 0) return;

        // Parse what's already been specified
        let parsed: Record<string, unknown> = {};
        try { parsed = parseCommandLine(currentParams, cmd) || {}; } catch { /* ignore */ }
        const specifiedKeys = Object.keys(parsed).filter(k => k !== '_');

        // Get all possible groups and determine active groups based on what's specified
        let possibleGroups = cmd.commandparameters.reduce((acc: string[], p: CommandParameter) => {
            if (!acc.includes(p.parameter_group_name)) acc.push(p.parameter_group_name);
            return acc;
        }, []);

        // Filter groups by specified params
        for (const key of specifiedKeys) {
            const paramGroups = cmd.commandparameters
                .filter((p: CommandParameter) => p.cli_name === key || p.name === key || p.display_name === key)
                .map((p: CommandParameter) => p.parameter_group_name);
            if (paramGroups.length > 0) {
                possibleGroups = possibleGroups.filter((g: string) => paramGroups.includes(g));
            }
        }
        const activeGroup = possibleGroups.length > 0 ? possibleGroups[0] : 'Default';

        // Get params for this group, required first then optional
        const groupParams = cmd.commandparameters
            .filter((p: CommandParameter) => p.parameter_group_name === activeGroup)
            .sort((a: CommandParameter, b: CommandParameter) => (b.required ? 1 : 0) - (a.required ? 1 : 0) || a.ui_position - b.ui_position);

        // Filter out already specified params
        const available = groupParams.filter((p: CommandParameter) =>
            !specifiedKeys.includes(p.cli_name) && !specifiedKeys.includes(p.name) && !specifiedKeys.includes(p.display_name)
        );

        const cliNames = available.map((p: CommandParameter) => '-' + p.cli_name);
        if (cliNames.length === 0) return;

        if (tabCompletionOptions.current.length === 0 || tabCompletionMode.current !== 'param_name') {
            tabCompletionOptions.current = cliNames;
            tabCompletionIndex.current = -1;
            tabCompletionMode.current = 'param_name';
        }
        const opts = tabCompletionOptions.current;
        if (reverse) {
            tabCompletionIndex.current = tabCompletionIndex.current <= 0 ? opts.length - 1 : tabCompletionIndex.current - 1;
        } else {
            tabCompletionIndex.current = tabCompletionIndex.current >= opts.length - 1 ? 0 : tabCompletionIndex.current + 1;
        }
        // Append the param name to the end of current input
        const parts = input.trimEnd().split(/\s+/);
        const lastPart = parts[parts.length - 1];
        if (lastPart.startsWith('-')) parts.pop();
        setInput(parts.join(' ') + ' ' + opts[tabCompletionIndex.current] + ' ');
    };

    const getTabCompletionForParamValues = async (cmdName: string, paramCliName: string, partial: string, reverse: boolean) => {
        if (isMsfMode) return; // No dynamic params for MSF
        const cmd = loadedOptions.current.find((c: CommandDefinition & { commandparameters?: CommandParameter[] }) => c.cmd === cmdName);
        if (!cmd) return;
        const param = cmd.commandparameters.find((p: CommandParameter) => p.cli_name === paramCliName);
        if (!param) return;

        // If param has static choices
        if (param.choices && param.choices.length > 0) {
            const matches = param.choices.filter((c: string) => c.toLowerCase().includes(partial.toLowerCase()));
            if (matches.length === 0) return;
            if (tabCompletionOptions.current.length === 0 || tabCompletionMode.current !== 'param_value') {
                tabCompletionOptions.current = matches;
                tabCompletionIndex.current = -1;
                tabCompletionMode.current = 'param_value';
            }
            const opts = tabCompletionOptions.current;
            if (reverse) {
                tabCompletionIndex.current = tabCompletionIndex.current <= 0 ? opts.length - 1 : tabCompletionIndex.current - 1;
            } else {
                tabCompletionIndex.current = tabCompletionIndex.current >= opts.length - 1 ? 0 : tabCompletionIndex.current + 1;
            }
            const parts = input.trimEnd().split(/\s+/);
            parts.pop(); // remove partial value
            setInput(parts.join(' ') + ' ' + opts[tabCompletionIndex.current] + ' ');
            return;
        }

        // If param has dynamic_query_function
        if (param.dynamic_query_function) {
            setTabLoading(true);
            try {
                const result = await getDynamicParams({
                    variables: {
                        callback: callbackId,
                        command: cmdName,
                        payload_type: payloadtypeName,
                        parameter_name: param.name,
                        other_parameters: {},
                    }
                });
                const choices = result?.data?.dynamic_query_function?.choices || [];
                if (choices.length > 0) {
                    const matches = choices.filter((c: string) => c.toLowerCase().includes(partial.toLowerCase()));
                    tabCompletionOptions.current = matches.length > 0 ? matches : choices;
                    tabCompletionIndex.current = -1;
                    tabCompletionMode.current = 'param_value';
                    tabCompletionIndex.current = 0;
                    const parts = input.trimEnd().split(/\s+/);
                    if (partial) parts.pop();
                    setInput(parts.join(' ') + ' ' + tabCompletionOptions.current[0] + ' ');
                }
            } catch (err) {
                console.error('Dynamic query failed:', err);
            } finally {
                setTabLoading(false);
            }
            return;
        }
    };

    const handleTab = (reverse: boolean) => {
        const trimmed = input.trimStart();
        const parts = trimmed.split(/\s+/);
        if (parts.length <= 1 && !trimmed.includes(' ')) {
            // Tab on partial command name (or empty)
            getTabCompletionForCommands(trimmed, reverse);
        } else {
            // Tab after first word — check if we're naming a param or giving a value
            const cmdName = parts[0];
            const lastPart = parts[parts.length - 1];
            if (lastPart.startsWith('-') || trimmed.endsWith(' ')) {
                // We're trying to complete a parameter name
                const currentParams = parts.slice(1).join(' ');
                getTabCompletionForParams(cmdName, currentParams, reverse);
            } else {
                // We might be completing a parameter value — find which param
                // Walk backwards to find the last -paramName
                let paramName = '';
                for (let i = parts.length - 2; i >= 1; i--) {
                    if (parts[i].startsWith('-')) { paramName = parts[i].slice(1); break; }
                }
                if (paramName) {
                    getTabCompletionForParamValues(cmdName, paramName, lastPart, reverse);
                } else {
                    // Positional arg — try param names
                    const currentParams = parts.slice(1).join(' ');
                    getTabCompletionForParams(cmdName, currentParams, reverse);
                }
            }
        }
    };

    // ---- Reverse Search helpers ----
    const reverseSearchResults = useMemo(() => {
        if (!reverseSearchText.trim()) return [];
        const query = reverseSearchText.toLowerCase();
        return tasksHistory.filter(t => {
            const str = ((t.command_name || '') + ' ' + (t.display_params || t.original_params || '') + ' ' + (t.original_params || '')).toLowerCase();
            return str.includes(query);
        });
    }, [reverseSearchText, tasksHistory]);

    const handleReverseSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape' || (e.key === 'r' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            setReverseSearchActive(false);
            setReverseSearchText('');
            inputRef.current?.focus();
        } else if (e.key === 'Tab') {
            e.preventDefault();
            // Accept current match and exit
            if (reverseSearchResults.length > 0) {
                const task = reverseSearchResults[reverseSearchIndex.current] || reverseSearchResults[0];
                const histP = (task.command_name || '') + ' ' + (task.display_params || task.original_params || '');
                setInput(histP.trim());
            }
            setReverseSearchActive(false);
            setReverseSearchText('');
            inputRef.current?.focus();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            // Submit the matched command
            if (reverseSearchResults.length > 0) {
                const task = reverseSearchResults[reverseSearchIndex.current] || reverseSearchResults[0];
                const histP = (task.command_name || '') + ' ' + (task.display_params || task.original_params || '');
                handleSend(histP.trim());
            }
            setReverseSearchActive(false);
            setReverseSearchText('');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (reverseSearchResults.length > 0) {
                reverseSearchIndex.current = Math.min(reverseSearchIndex.current + 1, reverseSearchResults.length - 1);
                const task = reverseSearchResults[reverseSearchIndex.current];
                const histP = (task.command_name || '') + ' ' + (task.display_params || task.original_params || '');
                setInput(histP.trim());
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (reverseSearchResults.length > 0) {
                reverseSearchIndex.current = Math.max(reverseSearchIndex.current - 1, 0);
                const task = reverseSearchResults[reverseSearchIndex.current];
                const histP = (task.command_name || '') + ' ' + (task.display_params || task.original_params || '');
                setInput(histP.trim());
            }
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Tab Completion
        if (e.key === 'Tab') {
            e.preventDefault();
            handleTab(e.shiftKey);
            return;
        }
        // Reverse Search toggle
        if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (reverseSearchActive) {
                setReverseSearchActive(false);
                setReverseSearchText('');
            } else {
                setReverseSearchActive(true);
                setReverseSearchText('');
                reverseSearchIndex.current = 0;
                setTimeout(() => reverseSearchRef.current?.focus(), 0);
            }
            return;
        }
        // Shift+Enter — force popup dialog (Mythic only; MSF treats it as a normal submit)
        if (e.key === 'Enter' && e.shiftKey && !isMsfMode) {
            e.preventDefault();
            const trimmed = input.trim();
            if (!trimmed) return;
            const cmdName = trimmed.split(' ')[0];
            const cmds = loadedOptions.current.filter((l: LoadedCmd) => l.cmd === cmdName);
            if (cmds.length === 0) { snackActions.warning("Unknown command: " + cmdName); return; }
            const cmd = cmds.length > 1 ? (cmds.find((c: LoadedCmd) => c?.payloadtype?.name === payloadtypeName) || cmds[0]) : cmds[0];
            setCommandInfo({ ...cmd, parsedParameters: {}, groupName: 'Default' });
            setOpenParametersDialog(true);
            return;
        }
        // Ctrl+Enter / Meta+Enter — insert newline
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            setInput(prev => prev + '\n');
            return;
        }
        // Regular Enter — submit
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSend(input);
            // Reset tab completion state
            tabCompletionOptions.current = [];
            tabCompletionIndex.current = -1;
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            // Prefer literal local history (what user typed) over tasksHistory (Mythic's parsed/expanded form).
            if (localInputHistory.length > 0) {
                const newIndex = Math.min(taskOptionsIndex.current + 1, localInputHistory.length - 1);
                taskOptionsIndex.current = newIndex;
                setInput(localInputHistory[localInputHistory.length - 1 - newIndex]);
            } else if (tasksHistory.length > 0) {
                const newIndex = Math.min(taskOptionsIndex.current + 1, tasksHistory.length - 1);
                taskOptionsIndex.current = newIndex;
                const task = tasksHistory[newIndex];
                const histParams_up = useDisplayParamsForCLIHistory
                    ? (task.display_params || task.original_params || '')
                    : (task.original_params || task.display_params || '');
                const trimmedParams = (histParams_up || '').trim();
                const historyStr = ((task.command_name || '') + (trimmedParams ? ' ' + trimmedParams : '')).trim();
                setInput(historyStr);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (localInputHistory.length > 0) {
                if (taskOptionsIndex.current <= 0) { taskOptionsIndex.current = -1; setInput(''); return; }
                const newIndex = taskOptionsIndex.current - 1;
                taskOptionsIndex.current = newIndex;
                setInput(localInputHistory[localInputHistory.length - 1 - newIndex]);
            } else if (tasksHistory.length > 0) {
                if (taskOptionsIndex.current <= 0) { taskOptionsIndex.current = -1; setInput(''); return; }
                const newIndex = taskOptionsIndex.current - 1;
                taskOptionsIndex.current = newIndex;
                const task = tasksHistory[newIndex];
                const histParams_dn = useDisplayParamsForCLIHistory
                    ? (task.display_params || task.original_params || '')
                    : (task.original_params || task.display_params || '');
                const trimmedParams = (histParams_dn || '').trim();
                const historyStr = ((task.command_name || '') + (trimmedParams ? ' ' + trimmedParams : '')).trim();
                setInput(historyStr);
            }
        } else {
            if (taskOptionsIndex.current !== -1) taskOptionsIndex.current = -1;
            // Reset tab completion when typing anything else
            tabCompletionOptions.current = [];
            tabCompletionIndex.current = -1;
        }
    };

    return (
        <OutputCallbackContext.Provider value={callbackId}>
            <div className="flex flex-col h-full font-mono text-sm relative overflow-hidden bg-black/80 border border-signal/30 shadow-[0_0_20px_rgba(34,197,94,0.1)]">
            <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[length:100%_4px]"></div>
            {/* Terminal header */}
            <div className={cn(
                "p-2.5 border-b flex items-center justify-between z-10 shrink-0",
                isDead
                    ? "bg-red-600 border-red-500"
                    : "bg-signal/10 border-signal/20"
            )}>
                <div className="flex items-center gap-2">
                    {isDead
                        ? <Skull size={16} className="text-black" />
                        : getOSIcon(callbackOs, payloadtypeName, 16)
                    }
                    <span className={cn("font-bold tracking-wider text-sm", isDead ? "text-black" : "text-signal")}>
                        {isDead ? 'SESSION_DEAD' : 'TERMINAL_UPLINK'}
                    </span>
                    {/* Active filter indicator */}
                    {isFilterActive(filterOptions) && (
                        <span className={cn(
                            "flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 border rounded",
                            isDead ? "border-black/30 bg-black/20 text-black" : "border-yellow-500/50 bg-yellow-900/30 text-yellow-300"
                        )}>
                            <Filter size={10} /> Filtered
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {loadedOptions.current.length > 2 && (
                        <span className={cn("text-[10px] font-mono", isDead ? "text-black/60" : "text-signal/50")}>{loadedOptions.current.length - 2} cmds loaded</span>
                    )}
                    {/* Collapse-all button */}
                    <button
                        title="Collapse All Tasks"
                        onClick={() => setCollapseAllEpoch(e => e + 1)}
                        className={cn("p-1.5 rounded transition-colors", isDead ? "text-black/60 hover:bg-black/20" : "text-gray-500 hover:text-signal hover:bg-signal/10")}
                    >
                        <ChevronUp size={14} />
                    </button>
                    {/* #8 — Expand-all button */}
                    <button
                        title="Expand All Tasks"
                        onClick={() => setExpandAllEpoch(e => e + 1)}
                        className={cn("p-1.5 rounded transition-colors", isDead ? "text-black/60 hover:bg-black/20" : "text-gray-500 hover:text-signal hover:bg-signal/10")}
                    >
                        <ChevronDown size={14} />
                    </button>
                    {/* #14 — View mode toggle: expanded (console) vs compact (accordion) */}
                    <button
                        title={taskViewMode === 'expanded' ? 'Switch to Compact View (accordion)' : 'Switch to Expanded View (console)'}
                        onClick={() => {
                            const next = taskViewMode === 'expanded' ? 'compact' : 'expanded';
                            setTaskViewMode(next);
                            try { localStorage.setItem('minerva-taskViewMode', next); } catch {}
                            // When switching to compact, collapse all; when switching to expanded, expand all
                            if (next === 'compact') setCollapseAllEpoch(e => e + 1);
                            else setExpandAllEpoch(e => e + 1);
                        }}
                        className={cn("p-1.5 rounded transition-colors", isDead ? "text-black/60 hover:bg-black/20" : taskViewMode === 'compact' ? "text-signal bg-signal/10" : "text-gray-500 hover:text-signal hover:bg-signal/10")}
                    >
                        {taskViewMode === 'compact' ? <ListTree size={14} /> : <Rows3 size={14} />}
                    </button>
                    {/* Filter toggle */}
                    <button
                        title="Toggle Task Filters"
                        onClick={() => setShowFilterPanel(s => !s)}
                        className={cn(
                            "p-1.5 rounded transition-colors",
                            isDead
                                ? (showFilterPanel || isFilterActive(filterOptions) ? "text-black bg-black/20" : "text-black/60 hover:bg-black/20")
                                : (showFilterPanel || isFilterActive(filterOptions)
                                    ? "text-yellow-400 bg-yellow-500/15 hover:bg-yellow-500/25"
                                    : "text-gray-500 hover:text-signal hover:bg-signal/10")
                        )}
                    >
                        <SlidersHorizontal size={14} />
                    </button>
                    <div className={cn("w-2.5 h-2.5 rounded-full", isDead ? "bg-black/40" : "bg-signal animate-pulse")}></div>
                </div>
            </div>

            {/* ── Filter Panel ─────────────────────────────────────────────── */}
            <AnimatePresence>
            {showFilterPanel && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden z-10 shrink-0"
                >
                    <div className="bg-[#0a0f0a] border-b border-yellow-500/25 px-4 py-3 space-y-3">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-yellow-400 flex items-center gap-2">
                                <Filter size={12} />
                                Task Filters
                                {isFilterActive(filterOptions) && (
                                    <span className="text-[11px] text-yellow-400/60 font-normal">
                                        — {tasks.length} / {taskMap.size} shown
                                    </span>
                                )}
                            </span>
                            <button
                                onClick={() => setFilterOptions(defaultFilterOptions)}
                                className="text-xs text-gray-500 hover:text-yellow-400 transition-colors"
                            >
                                Clear all
                            </button>
                        </div>

                        {/* Quick toggles */}
                        <div className="flex items-center flex-wrap gap-2">
                            {[
                                { key: 'hideErrors',        label: 'Hide errors',         activeClass: 'border-red-500/60 bg-red-950 text-red-300',    icon: <AlertCircle size={12}/> },
                                { key: 'commentsFlag',      label: 'Has comment',         activeClass: 'border-blue-500/60 bg-blue-950 text-blue-300',  icon: <MessageSquare size={12}/> },
                                { key: 'hideBrowserScripts',label: 'Hide browser tasks',  activeClass: 'border-orange-500/60 bg-orange-950 text-orange-300', icon: <EyeOff size={12}/> },
                            ].map(({ key, label, activeClass, icon }) => {
                                const active = (filterOptions as any)[key];
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setFilterOptions(f => ({ ...f, [key]: !active }))}
                                        className={cn(
                                            'flex items-center gap-1.5 px-3 py-1.5 border rounded text-xs font-medium transition-colors',
                                            active ? activeClass : 'border-white/10 text-gray-400 hover:text-white hover:border-white/30 bg-white/3'
                                        )}
                                    >
                                        {icon}{label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Parameter search */}
                        <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                            <input
                                type="text"
                                value={filterOptions.parameterString}
                                onChange={e => setFilterOptions(f => ({ ...f, parameterString: e.target.value }))}
                                placeholder="Filter by parameters (supports regex)…"
                                className="w-full bg-black/50 border border-white/10 focus:border-yellow-500/50 rounded px-3 py-1.5 pl-8 text-sm text-white placeholder-gray-600 font-mono outline-none transition-colors"
                            />
                            {filterOptions.parameterString && (
                                <button onClick={() => setFilterOptions(f => ({ ...f, parameterString: '' }))}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                                    <XCircle size={13} />
                                </button>
                            )}
                        </div>

                        {/* Operators */}
                        {operatorUsernames.length > 0 && (
                            <div>
                                <p className="text-xs text-gray-400 font-medium mb-1.5 flex items-center gap-1.5">
                                    <Users size={12} /> Operators
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {operatorUsernames.map(op => {
                                        const active = filterOptions.operatorsList.includes(op);
                                        return (
                                            <button key={op}
                                                onClick={() => setFilterOptions(f => ({
                                                    ...f,
                                                    operatorsList: active ? f.operatorsList.filter(o => o !== op) : [...f.operatorsList, op]
                                                }))}
                                                className={cn(
                                                    'text-xs px-2.5 py-1 border rounded transition-colors font-mono',
                                                    active ? 'border-signal/50 bg-signal/10 text-signal' : 'border-white/10 text-gray-400 hover:text-white hover:border-white/30'
                                                )}
                                            >
                                                {op}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Command filters */}
                        {loadedOptions.current.length > 2 && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-xs text-gray-400 font-medium mb-1.5">Show only</p>
                                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto cyber-scrollbar">
                                        {loadedOptions.current.filter((c: CommandDefinition & { commandparameters?: CommandParameter[] }) => c.cmd !== 'help' && c.cmd !== 'clear').map((c: LoadedCmd) => {
                                            const active = filterOptions.commandsList.includes(c.cmd);
                                            return (
                                                <button key={c.cmd}
                                                    onClick={() => setFilterOptions(f => ({
                                                        ...f,
                                                        commandsList: active ? f.commandsList.filter(x => x !== c.cmd) : [...f.commandsList, c.cmd],
                                                        everythingButList: active ? f.everythingButList : f.everythingButList.filter(x => x !== c.cmd),
                                                    }))}
                                                    className={cn(
                                                        'text-xs px-2 py-0.5 border rounded transition-colors font-mono',
                                                        active ? 'border-signal/50 bg-signal/10 text-signal' : 'border-white/10 text-gray-400 hover:text-white hover:border-white/25'
                                                    )}
                                                >
                                                    {c.cmd}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 font-medium mb-1.5">Exclude</p>
                                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto cyber-scrollbar">
                                        {loadedOptions.current.filter((c: CommandDefinition & { commandparameters?: CommandParameter[] }) => c.cmd !== 'help' && c.cmd !== 'clear').map((c: LoadedCmd) => {
                                            const active = filterOptions.everythingButList.includes(c.cmd);
                                            return (
                                                <button key={c.cmd}
                                                    onClick={() => setFilterOptions(f => ({
                                                        ...f,
                                                        everythingButList: active ? f.everythingButList.filter(x => x !== c.cmd) : [...f.everythingButList, c.cmd],
                                                        commandsList: active ? f.commandsList : f.commandsList.filter(x => x !== c.cmd),
                                                    }))}
                                                    className={cn(
                                                        'text-xs px-2 py-0.5 border rounded transition-colors font-mono',
                                                        active ? 'border-red-500/50 bg-red-950 text-red-300' : 'border-white/10 text-gray-400 hover:text-white hover:border-white/25'
                                                    )}
                                                >
                                                    {c.cmd}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
            </AnimatePresence>

            <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4 space-y-4 cyber-scrollbar z-10">
                {tasks.map((task: Task) => <TaskBlock key={task.id} task={task} callbackHost={callbackHost} onFileAction={onFileAction} scrollRoot={scrollContainerRef} onReveal={handleTaskReveal} myUsername={me.user?.username as string | undefined} collapseAllEpoch={collapseAllEpoch} expandAllEpoch={expandAllEpoch} defaultCollapsed={taskViewMode === 'compact'} />)}
                {tasks.length === 0 && !loading && (
                    <div className="text-gray-500 italic opacity-50 text-center mt-10 text-sm">
                        {isFilterActive(filterOptions)
                            ? 'No tasks match the current filters.'
                            : 'Session initialized. Ready for input.'}
                    </div>
                )}
                <div ref={endRef} />
            </div>

            {/* ── Tasking Context Badges ─────────────────────── */}
            {!hideTaskingContext && Object.keys(callbackContext).length > 0 && (
                <div className="px-3 py-1.5 bg-black/60 border-t border-white/5 flex flex-wrap gap-1.5 z-10 shrink-0"
                     style={{ borderLeftColor: callbackContext.color as any || undefined, borderLeftWidth: callbackContext.color ? 3 : 0 }}>
                    {(Array.isArray(taskingContextFields) ? taskingContextFields : ['impersonation_context', 'cwd']).map((field: string) => {
                        let val = callbackContext[field];
                        if (val === undefined || val === null || val === '') return null;
                        let label = field;
                        let color = 'text-gray-400 border-gray-700 bg-gray-900/40';
                        switch(field) {
                            case 'impersonation_context':
                                if (!val) return null;
                                label = 'User'; color = 'text-purple-300 border-purple-500/40 bg-purple-900/20';
                                break;
                            case 'cwd': label = 'Dir'; color = 'text-blue-300 border-blue-500/40 bg-blue-900/20'; break;
                            case 'user':
                                label = 'User';
                                if (((callbackContext.integrity_level as number) || 0) > 2) val = val + '*';
                                color = 'text-cyan-300 border-cyan-500/40 bg-cyan-900/20';
                                break;
                            case 'host': label = 'Host'; color = 'text-green-300 border-green-500/40 bg-green-900/20'; break;
                            case 'ip': label = 'IP'; color = 'text-yellow-300 border-yellow-500/40 bg-yellow-900/20'; break;
                            case 'pid': label = 'PID'; color = 'text-orange-300 border-orange-500/40 bg-orange-900/20'; break;
                            case 'architecture': label = 'Arch'; color = 'text-indigo-300 border-indigo-500/40 bg-indigo-900/20'; break;
                            case 'process_short_name': label = 'Proc'; color = 'text-pink-300 border-pink-500/40 bg-pink-900/20'; break;
                            case 'extra_info': label = ''; color = 'text-amber-300 border-amber-500/40 bg-amber-900/20'; break;
                        }
                        return (
                            <span key={field} className={cn('text-[10px] font-mono px-1.5 py-0.5 border rounded-sm', color)}>
                                {label ? `${label}: ` : ''}{String(val)}
                            </span>
                        );
                    })}
                </div>
            )}

            {/* ── Reverse Search Bar ─────────────────────── */}
            <AnimatePresence>
            {reverseSearchActive && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="overflow-hidden z-10 shrink-0"
                >
                    <div className="px-3 py-2 bg-[#0a0d14] border-t border-blue-500/25 flex items-center gap-2">
                        <span className="text-[10px] font-mono text-blue-400 shrink-0 tracking-wider">reverse-i-search:</span>
                        <input
                            ref={reverseSearchRef}
                            type="text"
                            value={reverseSearchText}
                            onChange={e => { setReverseSearchText(e.target.value); reverseSearchIndex.current = 0; }}
                            onKeyDown={handleReverseSearchKeyDown}
                            className="flex-1 bg-transparent border-none outline-none text-blue-200 placeholder-blue-800 font-mono text-sm"
                            placeholder="type to search history..."
                            autoFocus
                        />
                        <span className="text-[10px] text-gray-600 font-mono shrink-0">
                            {reverseSearchResults.length > 0 ? `${reverseSearchIndex.current + 1}/${reverseSearchResults.length}` : '0 matches'}
                        </span>
                        <button onClick={() => { setReverseSearchActive(false); setReverseSearchText(''); inputRef.current?.focus(); }}
                            className="text-gray-500 hover:text-white transition-colors p-0.5"><X size={12} /></button>
                    </div>
                </motion.div>
            )}
            </AnimatePresence>

            {/* ── Tab loading indicator ─────────────────────── */}
            {tabLoading && (
                <div className="px-3 py-1 bg-black/60 border-t border-signal/10 flex items-center gap-2 z-10 shrink-0">
                    <Activity size={12} className="animate-spin text-signal" />
                    <span className="text-[10px] font-mono text-signal/60">Fetching dynamic parameters...</span>
                </div>
            )}

            {/* Input bar */}
            <div className="p-3 bg-black border-t border-signal/20 flex items-center gap-2 z-10 shrink-0">
                {/* Token selector pill — only shown when tokens are available */}
                {availableTokens.length > 0 && (
                    <div className="relative shrink-0" ref={tokenMenuRef}>
                        <button
                            title={selectedToken ? `Impersonating: ${selectedToken.user}` : 'Select Token for Impersonation'}
                            onClick={() => setShowTokenMenu(m => !m)}
                            className={cn(
                                "flex items-center gap-1 px-2 py-1 border rounded-sm text-[10px] font-mono transition-colors",
                                selectedToken
                                    ? "border-orange-500/60 bg-orange-900/20 text-orange-300"
                                    : "border-gray-700 text-gray-500 hover:text-white hover:border-gray-500"
                            )}
                        >
                            <Key size={10} />
                            {selectedToken ? selectedToken.user.split('\\').pop() || selectedToken.user : 'TOKEN'}
                        </button>
                        {showTokenMenu && (
                            <div className="absolute bottom-full mb-1 left-0 w-52 bg-black/97 border border-orange-500/30 shadow-lg z-50 py-1 font-mono text-xs">
                                <div className="px-3 py-1.5 text-[10px] text-gray-600 uppercase tracking-widest border-b border-white/10 mb-1">
                                    TOKEN_IMPERSONATION
                                </div>
                                <button
                                    className={cn("w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors",
                                        !selectedToken ? "text-signal bg-signal/10" : "text-gray-400 hover:text-white hover:bg-white/5"
                                    )}
                                    onClick={() => { setSelectedToken(null); setShowTokenMenu(false); }}
                                >
                                    <Key size={11} className="shrink-0" /> Default Token
                                </button>
                                {availableTokens.map(tok => (
                                    <button
                                        key={tok.token_id}
                                        className={cn("w-full text-left px-3 py-1.5 flex items-start gap-2 transition-colors",
                                            selectedToken?.token_id === tok.token_id
                                                ? "text-orange-300 bg-orange-900/25"
                                                : "text-gray-300 hover:text-white hover:bg-white/5"
                                        )}
                                        onClick={() => { setSelectedToken(tok); setShowTokenMenu(false); }}
                                    >
                                        <Key size={11} className="shrink-0 mt-0.5 text-orange-400" />
                                        <div className="min-w-0">
                                            <div className="truncate font-bold">{tok.user}</div>
                                            {tok.description && <div className="text-[10px] text-gray-600 truncate">{tok.description}</div>}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {/* Prompt — flips to a shell-style indicator when an MSF
                    meterpreter session has dropped into raw `shell` mode.
                    The "Exit Shell" button next to it sends `exit\n` so the
                    operator can pop back to the meterpreter prompt without
                    knowing the channel's escape sequence. */}
                {isMsfMode && msfSession.shellMode ? (
                    <>
                        <button
                            onClick={() => msfSession.exitShell()}
                            className="text-amber-400 hover:text-red-500 border border-amber-400/40 rounded-sm px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em] transition-colors"
                            title="Exit the target shell — returns to meterpreter prompt"
                        >
                            EXIT SHELL
                        </button>
                        <span className="text-amber-400 animate-pulse font-bold text-base ml-1" title="Interactive shell mode — input is forwarded raw">$</span>
                    </>
                ) : (
                    <span className="text-signal animate-pulse font-bold text-base">$</span>
                )}
                <input
                    ref={inputRef} type="text" value={input}
                    onChange={(e) => {
                        setInput(e.target.value);
                        if (taskOptionsIndex.current !== -1) taskOptionsIndex.current = -1;
                        // Reset tab completion on manual typing
                        tabCompletionOptions.current = [];
                        tabCompletionIndex.current = -1;
                    }}
                    onKeyDown={onKeyDown}
                    disabled={tasking}
                    className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-600 font-mono text-sm disabled:opacity-50"
                    placeholder={
                        tasking ? "Transmitting..." :
                        (isMsfMode && msfSession.shellMode) ? "Interactive shell — input is forwarded raw (`exit` to return)" :
                        selectedToken ? `[${selectedToken.user}] Enter command...` :
                        "Enter command... (Tab=autocomplete, Ctrl+R=search)"
                    }
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                />
                <div className="flex items-center gap-1 shrink-0">
                    {/* Payload type SVG icon */}
                    {commandPayloadType !== '' && (
                        <img
                            src={`/static/${commandPayloadType}_dark.svg`}
                            title={commandPayloadType}
                            alt={commandPayloadType}
                            className="w-6 h-6 shrink-0 opacity-70"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    )}
                    <span className="text-[9px] text-gray-700 font-mono hidden lg:inline">Tab ↹ | Ctrl+R</span>
                    <button onClick={() => handleSend(input)} disabled={tasking} className="p-1.5 hover:bg-white/10 rounded text-signal transition-colors disabled:opacity-50">
                        {tasking ? <Activity size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                    </button>
                </div>
            </div>

            {/* ── Command Disambiguation Dialog ─────────────── */}
            {!isMsfMode && showDisambiguation && disambiguationOptions.length > 0 && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={() => setShowDisambiguation(false)}>
                    <div className="bg-[#0a0f0a] border border-signal/40 p-5 max-w-md w-full mx-4 shadow-[0_0_40px_rgba(34,197,94,0.15)]"
                         onClick={e => e.stopPropagation()}
                         style={{ clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)' }}>
                        <div className="flex items-center gap-2 mb-3">
                            <AlertTriangle size={16} className="text-yellow-400" />
                            <span className="font-mono text-sm text-yellow-400 font-bold tracking-wider">COMMAND DISAMBIGUATION</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-4">Multiple payload types have a command with this name. Select which one to use:</p>
                        <div className="space-y-2">
                            {disambiguationOptions.map((cmd: CommandDefinition, idx: number) => (
                                <button key={idx}
                                    onClick={() => handleDisambiguationSelect(cmd)}
                                    className="w-full flex items-center gap-3 px-4 py-3 border border-white/10 hover:border-signal/50 hover:bg-signal/5 transition-colors text-left"
                                >
                                    <Command size={14} className="text-signal shrink-0" />
                                    <div>
                                        <div className="font-mono text-sm text-white">{cmd.cmd}</div>
                                        <div className="text-[10px] text-gray-500">
                                            {cmd?.payloadtype?.name || 'unknown'} • {cmd.description?.slice(0, 80) || 'No description'}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setShowDisambiguation(false)} className="mt-3 w-full py-2 text-xs font-mono text-gray-500 hover:text-white border border-white/10 hover:border-white/25 transition-colors">CANCEL</button>
                    </div>
                </div>
            )}

            {!isMsfMode && openParametersDialog && (
                <MythicDialog fullWidth={true} maxWidth="lg" open={openParametersDialog}
                    onClose={() => setOpenParametersDialog(false)}
                    innerDialog={
                        <TaskParametersDialog
                            command={commandInfo}
                            callback_id={callbackDbId}
                            payloadtype_id={payloadtypeId}
                            operation_id={operationId}
                            onSubmit={submitParametersDialog}
                            onClose={() => setOpenParametersDialog(false)}
                        />
                    }
                />
            )}
            {!isMsfMode && uploadTarget !== null && (
                <UploadToAgentModal
                    targetPath={uploadTarget}
                    callbackId={callbackId}
                    onClose={() => setUploadTarget(null)}
                />
            )}
            <HelpPanel
                open={!isMsfMode && helpPanel !== null}
                mode={helpPanel?.mode ?? 'index'}
                target={helpPanel?.target}
                commands={loadedOptions.current as HelpLoadedCmd[]}
                onClose={() => setHelpPanel(null)}
                onOpenDetail={cmd => setHelpPanel({ mode: 'detail', target: cmd })}
                onOpenIndex={() => setHelpPanel({ mode: 'index' })}
            />
            </div>
        </OutputCallbackContext.Provider>
    );
};

// ============================================
// Enhanced Info Panel
// ============================================
