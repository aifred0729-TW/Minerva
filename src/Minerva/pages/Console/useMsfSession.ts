/**
 * useMsfSession — single broker per MSF session id.
 *
 * Why a broker (instead of polling inside each component): if the terminal,
 * files panel, and process panel all polled `session.meterpreter_read`
 * independently they'd race for the read buffer and each would only see
 * fragments of the output. The broker owns the one poll loop and routes
 * appended output into whichever task is currently active.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useApolloClient, useReactiveVar } from '@apollo/client/react';
import { meState } from '../../lib/state';
import {
    sessionRead, sessionWrite, sessionMeterpreterWrite,
} from '../Metasploit/msfrpc';
import {
    createTask, appendOutput, markStatus, getActiveTask, getTasks, subscribe,
    type MsfTaskRecord, type MsfTaskOrigin,
} from './msfTaskStore';
import {
    detectBareUploadName,
    getMythicLibraryEntry,
    refreshMythicLibraryIndex,
    resolveMythicLibraryUpload,
} from '../../lib/mythicLibraryIndex';

// Stable empty array — used as the snapshot when no session id is provided.
// Returning `[]` literal would create a fresh reference each render and
// drive useSyncExternalStore into an infinite re-render loop.
const EMPTY_TASKS: MsfTaskRecord[] = [];
const NOOP_UNSUB = () => undefined;

const POLL_INTERVAL_MS = 800;
/** Quiet period after which a task is auto-marked complete. */
const QUIET_COMPLETE_MS = 1_200;

// ── Shell mode tracking ───────────────────────────────────────────────────
// When the operator types `shell`, meterpreter spawns a system shell as a
// child channel and forwards stdin/stdout. From that point input must be
// raw bytes to the channel (via `session.meterpreter_write`) instead of
// meterpreter-command-parser style (`run_single`). Going back is signalled
// by `Channel N closed` in the output stream when the shell exits, or by
// the operator hitting the explicit "Exit Shell" button.
const shellModeBySession = new Map<string, boolean>();
const shellModeListeners = new Map<string, Set<() => void>>();

function setShellModeInternal(sessionId: string, mode: boolean): void {
    if ((shellModeBySession.get(sessionId) || false) === mode) return;
    shellModeBySession.set(sessionId, mode);
    shellModeListeners.get(sessionId)?.forEach(fn => { try { fn(); } catch { /* swallow */ } });
}

function isShellMode(sessionId: string): boolean {
    return shellModeBySession.get(sessionId) || false;
}

function subscribeShellMode(sessionId: string, fn: () => void): () => void {
    let set = shellModeListeners.get(sessionId);
    if (!set) { set = new Set(); shellModeListeners.set(sessionId, set); }
    set.add(fn);
    return () => { shellModeListeners.get(sessionId)?.delete(fn); };
}

/** Output patterns that mean "we're back at the meterpreter prompt." */
const SHELL_EXIT_RE = /(?:Channel\s+\d+\s+closed\b|Process\s+\d+\s+exited\b|terminating channel)/i;

/**
 * Meterpreter command-line preprocessor.
 *
 * Two problems with hand-typed meterpreter commands:
 *
 *  1. **Bare backslashes get eaten.** Meterpreter's `stdapi_fs_*` calls
 *     drop un-quoted backslashes, so `ls C:\Windows\system32` resolves to
 *     `C:Windowssystem32` and errors out. The fix is to wrap the path in
 *     double quotes with every `\` doubled so Ruby's Shellwords parser
 *     emits the literal path the operator typed.
 *  2. **Spaces in paths split the argv.** A naive whitespace tokenizer
 *     splits `cat C:\Hyperv Notes.txt` into two tokens; only the first
 *     gets quoted and meterpreter sees two arguments. The fix is to know
 *     which commands take a *single* path argument and join every
 *     trailing non-flag token into one path before quoting.
 *
 * Existing fully-quoted tokens (e.g. `cat "C:\Hyperv Notes.txt"`) are
 * passed through untouched so operators who already know what they're
 * doing aren't second-guessed.
 */
const SINGLE_PATH_COMMANDS: ReadonlySet<string> = new Set([
    // Filesystem
    'cat', 'cd', 'ls', 'dir', 'type', 'edit',
    'rm', 'del', 'rmdir', 'mkdir', 'md',
    // Local-side meterpreter helpers (host shell, not target)
    'lcd', 'lcat', 'lls', 'lpwd', 'getlwd',
]);

function looksLikeWindowsPath(s: string): boolean {
    return /^([A-Za-z]:|\\\\)/.test(s) || s.includes('\\');
}

/** Wrap a single path in double quotes, escaping backslashes + inner quotes. */
function quoteForMeterpreter(path: string): string {
    const inner = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${inner}"`;
}

/** Strip outer matching quotes from a token, if any. */
function stripOuterQuotes(token: string): string {
    if (token.length >= 2 && token.startsWith('"') && token.endsWith('"')) {
        return token.slice(1, -1);
    }
    return token;
}

// Reuse the shared bare-name detector from mythicLibraryIndex so the
// meterpreter rewriter and the just-in-time refetch agree on what counts
// as a rewriteable line.
const extractBareUploadName = detectBareUploadName;

export function autoQuoteWindowsPaths(line: string): string {
    if (!line) return line;
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Tokenize, respecting quoted runs.
    const parts: string[] = [];
    const tokenRe = /("[^"]*"|\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(trimmed)) !== null) parts.push(m[1]);
    if (parts.length === 0) return line;

    const cmd = parts[0];
    const cmdLower = cmd.toLowerCase();

    // ── Single-path command path: join trailing non-flag tokens ───────────
    if (SINGLE_PATH_COMMANDS.has(cmdLower) && parts.length > 1) {
        const flags: string[] = [];
        const pathTokens: string[] = [];
        // Flags only count while we haven't yet seen a path-shaped token.
        let stillFlags = true;
        for (let i = 1; i < parts.length; i++) {
            const t = parts[i];
            if (stillFlags && t.startsWith('-')) {
                flags.push(t);
            } else {
                stillFlags = false;
                pathTokens.push(t);
            }
        }
        if (pathTokens.length === 0) return line;

        // If the operator already supplied exactly one fully-quoted path,
        // respect their quoting verbatim.
        if (pathTokens.length === 1 && pathTokens[0].startsWith('"') && pathTokens[0].endsWith('"')) {
            return [cmd, ...flags, pathTokens[0]].join(' ');
        }

        // Re-stitch the path — strip any partial per-token quoting first so
        // `cat "C:\Hyperv" Notes.txt` becomes `cat "C:\Hyperv Notes.txt"`.
        const joined = pathTokens.map(stripOuterQuotes).join(' ');
        const needsQuoting = /\s/.test(joined) || joined.includes('\\') || joined.includes('"');
        const final = needsQuoting ? quoteForMeterpreter(joined) : joined;
        return [cmd, ...flags, final].join(' ');
    }

    // ── Other commands: per-token Windows-path quoting (unchanged) ────────
    return line.replace(/("[^"]*"|\S+)/g, (token) => {
        if (token.startsWith('"')) return token;
        if (!looksLikeWindowsPath(token)) return token;
        if (!token.includes('\\')) return token;
        return quoteForMeterpreter(token);
    });
}

interface BrokerState {
    refCount: number;
    timer: ReturnType<typeof setInterval> | null;
    lastDataAt: number;
    sessionType: string;
}

const brokers = new Map<string, BrokerState>();

function ensureBroker(sessionId: string, sessionType: string): void {
    let state = brokers.get(sessionId);
    if (!state) {
        state = { refCount: 0, timer: null, lastDataAt: 0, sessionType };
        brokers.set(sessionId, state);
    } else {
        state.sessionType = sessionType || state.sessionType;
    }
    state.refCount++;

    if (state.timer) return;

    const tick = async () => {
        const st = brokers.get(sessionId);
        if (!st) return;
        try {
            const data = await sessionRead(sessionId, st.sessionType || 'meterpreter');
            if (data) {
                let active = getActiveTask(sessionId);
                if (!active) {
                    // Output arrived after the previous task was force-completed
                    // (e.g. a long-running `mimikatz.exe` cold-load took longer
                    // than the 5s "no output yet" window). Don't drop the bytes:
                    // re-open the most recent task so the output is still
                    // captured under the command that triggered it.
                    const all = getTasks(sessionId);
                    const last = all[all.length - 1];
                    if (last) {
                        markStatus(sessionId, last.id, 'running', 'late-arriving output');
                        active = last;
                    }
                }
                if (active) appendOutput(sessionId, active.id, data);
                st.lastDataAt = Date.now();
                // While in shell mode, watch the output stream for the
                // sentinel that says the shell child has exited; flip back
                // to meterpreter input semantics.
                if (isShellMode(sessionId) && SHELL_EXIT_RE.test(data)) {
                    setShellModeInternal(sessionId, false);
                }
                return;
            }
            // No data this tick — if a task has been quiet long enough, complete it.
            const active = getActiveTask(sessionId);
            if (active) {
                const startedMs = new Date(active.started_at).getTime();
                const sinceData = st.lastDataAt > 0 ? Date.now() - st.lastDataAt : Date.now() - startedMs;
                // Once we've already received some output and quiet period elapsed,
                // or we never got any output and 5s passed (likely no-op command),
                // close out the task.
                if ((active.response_text.length > 0 && sinceData > QUIET_COMPLETE_MS) ||
                    (active.response_text.length === 0 && (Date.now() - startedMs) > 5_000)) {
                    markStatus(sessionId, active.id, 'completed');
                }
            }
        } catch {
            // Session probably died — mark active task with an error.
            const active = getActiveTask(sessionId);
            if (active && active.status !== 'completed') {
                markStatus(sessionId, active.id, 'error', 'MSF-RPC unreachable');
            }
        }
    };
    state.timer = setInterval(tick, POLL_INTERVAL_MS);
    // Run an initial tick promptly.
    void tick();
}

function releaseBroker(sessionId: string): void {
    const state = brokers.get(sessionId);
    if (!state) return;
    state.refCount--;
    if (state.refCount <= 0) {
        if (state.timer) clearInterval(state.timer);
        brokers.delete(sessionId);
    }
}

/**
 * Subscribe to a session's task list. Also keeps the broker alive while
 * the component is mounted so output continues to be attributed correctly.
 *
 * Returns:
 *   tasks      — live array of task records
 *   runCommand — submits a new command and creates a task record
 */
export function useMsfSession(
    sessionId: string,
    sessionType: string,
    enabled: boolean = true,
) {
    const me = useReactiveVar(meState);
    const operator = me?.user?.username || 'operator';
    const apolloClient = useApolloClient();

    // ── Lifecycle: keep the broker alive while mounted ─────────────────────
    useEffect(() => {
        if (!enabled || !sessionId) return;
        ensureBroker(sessionId, sessionType);
        return () => releaseBroker(sessionId);
    }, [sessionId, sessionType, enabled]);

    // ── Reactive task list ────────────────────────────────────────────────
    const tasks = useSyncExternalStore(
        useCallback(
            (cb: () => void) => (enabled && sessionId ? subscribe(sessionId, cb) : NOOP_UNSUB),
            [sessionId, enabled],
        ),
        useCallback(() => (sessionId ? getTasks(sessionId) : EMPTY_TASKS), [sessionId]),
        () => EMPTY_TASKS,
    );

    /**
     * Submit a command. Creates a task record, sends to msfrpc, returns the
     * task so callers (file browser, process list) can poll its `response_text`
     * to know when output is ready.
     */
    const runCommand = useCallback(async (
        command: string,
        opts: { origin?: MsfTaskOrigin; params?: string } = {},
    ): Promise<MsfTaskRecord> => {
        const inShellMode = sessionType === 'meterpreter' && isShellMode(sessionId);
        // Two pre-processors before the bytes hit msfrpc:
        //  1. `upload <bare-name>` → `upload /mythic_files/<uuid> <name>` when
        //     <bare-name> matches an entry in the Mythic file library. Lets
        //     the operator type `upload chisel.exe` straight from the terminal
        //     and have it pull from Mythic's shared file storage rather than
        //     MSF's cwd.
        //  2. Auto-quote Windows paths so operators don't get bitten by the
        //     backslash-eating meterpreter tokenizer.
        // The recorded task carries the post-rewrite string so the audit log
        // matches what was actually sent on the wire.
        //
        // In shell mode we forward the typed bytes verbatim — cmd.exe / sh
        // have their own quoting rules and the Mythic file-library shortcut
        // doesn't apply once the operator is interacting with a target shell.
        // Just-in-time refresh: if the operator typed `upload <bare-name>`
        // and the polled library index hasn't seen <bare-name> yet (common
        // when the payload was built seconds ago), force a network refetch
        // before the rewrite so the freshly-built payload becomes uploadable
        // without a 10s wait.
        let preprocessed = command;
        if (!inShellMode) {
            const bareUploadName = extractBareUploadName(command);
            if (bareUploadName && !getMythicLibraryEntry(bareUploadName)) {
                await refreshMythicLibraryIndex(apolloClient);
            }
            preprocessed = autoQuoteWindowsPaths(resolveMythicLibraryUpload(command));
        }
        const wireCommand = preprocessed;
        // Cleanly close out the previous task (if any) — the operator
        // pressing Enter on a new command is a stronger boundary signal
        // than the broker's quiet-period timer, and prevents
        // mid-stream output from bleeding across two task records.
        const prior = getActiveTask(sessionId);
        if (prior) markStatus(sessionId, prior.id, 'completed');

        const task = createTask({
            sessionId,
            sessionType,
            command: wireCommand,
            params: opts.params,
            operator,
            origin: opts.origin ?? 'console',
        });
        const broker = brokers.get(sessionId);
        if (broker) broker.lastDataAt = Date.now();
        try {
            if (inShellMode) {
                // Raw input to the active meterpreter channel = the target
                // shell's stdin. Newline-terminate so the shell executes it.
                const payload = wireCommand.endsWith('\n') ? wireCommand : wireCommand + '\n';
                await sessionMeterpreterWrite(sessionId, payload);
            } else {
                await sessionWrite(sessionId, sessionType, wireCommand);
                // Bare `shell` → meterpreter spawns a child shell; from now on
                // operator input must go through `meterpreter_write` instead of
                // run_single. Set the mode optimistically; the tick loop will
                // flip it back if it sees "Channel N closed" later.
                if (sessionType === 'meterpreter' && /^shell\b/i.test(wireCommand.trim())) {
                    setShellModeInternal(sessionId, true);
                }
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            appendOutput(sessionId, task.id, `\n[!] Send failed: ${msg}\n`);
            markStatus(sessionId, task.id, 'error', 'Failed to send');
        }
        return task;
    }, [sessionId, sessionType, operator]);

    /**
     * Submit a command and resolve once the task is no longer running.
     * Used by Files / Process panels that need the full output to render.
     */
    const runAndWait = useCallback(async (
        command: string,
        opts: { origin?: MsfTaskOrigin; timeoutMs?: number } = {},
    ): Promise<MsfTaskRecord> => {
        const task = await runCommand(command, { origin: opts.origin });
        const timeoutMs = opts.timeoutMs ?? 15_000;
        const startMs = Date.now();
        return new Promise<MsfTaskRecord>((resolve) => {
            const unsub = subscribe(sessionId, () => {
                const latest = getTasks(sessionId).find(t => t.id === task.id);
                if (!latest) { unsub(); resolve(task); return; }
                if (latest.status === 'completed' || latest.status === 'error') {
                    unsub();
                    resolve(latest);
                    return;
                }
                if (Date.now() - startMs > timeoutMs) {
                    markStatus(sessionId, task.id, 'completed', 'timeout');
                    unsub();
                    resolve({ ...latest, status: 'completed' });
                }
            });
        });
    }, [sessionId, runCommand]);

    // ── Reactive shell-mode flag ──────────────────────────────────────────
    const shellMode = useSyncExternalStore<boolean>(
        useCallback(
            (cb: () => void) => (enabled && sessionId ? subscribeShellMode(sessionId, cb) : NOOP_UNSUB),
            [sessionId, enabled],
        ),
        useCallback(() => (sessionId ? isShellMode(sessionId) : false), [sessionId]),
        () => false,
    );

    /**
     * Bail out of the target shell — sends `exit` as raw input so the
     * spawned shell terminates and meterpreter regains control. The next
     * `Channel N closed` in the output stream will clear shellMode for us,
     * but we flip it locally up-front so the prompt updates instantly.
     */
    const exitShell = useCallback(async () => {
        if (sessionType !== 'meterpreter') return;
        if (!isShellMode(sessionId)) return;
        try {
            await sessionMeterpreterWrite(sessionId, 'exit\n');
        } catch { /* swallow — operator can also Ctrl-Z or kill the channel */ }
        setShellModeInternal(sessionId, false);
    }, [sessionId, sessionType]);

    return { tasks, runCommand, runAndWait, operator, shellMode, exitShell };
}
