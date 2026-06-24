// ═══════════════════════════════════════════════
//  Console – pure utility helpers
// ═══════════════════════════════════════════════
import type { FilterOptions, ConsoleFileNode } from '../../types/console';
import { parseIPString } from '../../lib/utils';
import { TASK_UPLOAD_URL } from '../../lib/urls';
import { getAuthHeaders } from '../../lib/auth';

export { formatBytes, b64DecodeUnicode, parseIPString } from '../../lib/utils';
export { getOSIcon, WindowsIcon, LinuxIcon, MacOSIcon } from '../../components/OSIcons';
export { timeAgo as timeSince, RelativeTime } from '../../lib/time';

export const parseIP = (ip: string): string => parseIPString(ip)[0] || ip || 'N/A';

export const getIPRange = (ip: string): string => {
    const parsed = parseIP(ip);
    const parts = parsed.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    return parsed;
};

// ============================================
// Filter Options
// ============================================
export const defaultFilterOptions: FilterOptions = {
    operatorsList: [],
    commentsFlag: false,
    commandsList: [],
    everythingButList: [],
    parameterString: '',
    hideErrors: false,
    hideBrowserScripts: false,
};
export const isFilterActive = (f: FilterOptions): boolean =>
    f.operatorsList.length > 0 ||
    f.commentsFlag ||
    f.commandsList.length > 0 ||
    f.everythingButList.length > 0 ||
    f.parameterString.trim() !== '' ||
    f.hideErrors ||
    f.hideBrowserScripts;

export const applyFilterToTask = (task: any, f: FilterOptions, myUsername?: string): boolean => {
    // Hide "help" tasks issued by other operators (OldReactUI parity)
    if (myUsername && (task.display_params || '').includes('help') && task.operator?.username !== myUsername) {
        return false;
    }
    if (f.hideBrowserScripts) {
        if ((task.tasking_location || '').includes('browser')) return false;
    }
    if (f.operatorsList.length > 0) {
        if (!f.operatorsList.includes(task.operator?.username || '')) return false;
    }
    if (f.commentsFlag) {
        if (!task.comment) return false;
    }
    if (f.commandsList.length > 0) {
        if (!f.commandsList.includes(task.command_name || '')) return false;
    }
    if (f.everythingButList.length > 0) {
        if (f.everythingButList.includes(task.command_name || '')) return false;
    }
    if (f.parameterString.trim()) {
        try {
            const re = new RegExp(f.parameterString, 'i');
            if (!re.test(task.display_params || '')) return false;
        } catch {
            if (!(task.display_params || '').toLowerCase().includes(f.parameterString.toLowerCase())) return false;
        }
    }
    if (f.hideErrors) {
        if ((task.status || '').toLowerCase().includes('error')) return false;
    }
    return true;
};

export const normalizeUnixPath = (path: string): string => {
    if (!path || path === '.' || path === '..') return path;
    // Windows absolute path (has backslash or starts with drive letter + slash)
    if (path.includes('\\') || /^[A-Za-z]:[\\/]/.test(path)) return path;
    // Windows drive root without trailing slash (e.g. "C:") → "C:\"
    if (/^[A-Za-z]:$/.test(path)) return path + '\\';
    return path.startsWith('/') ? path : '/' + path;
};

// Filter BrowserScript output by search text (OldReactUI filterOutput parity)
export const filterBrowserScriptOutput = (scriptData: any, search: string): any => {
    if (!search) return scriptData;
    const s = search.toLowerCase();
    const copied: any = { ...scriptData };
    if (scriptData.plaintext !== undefined) {
        copied.plaintext = scriptData.plaintext.toLowerCase().includes(s) ? scriptData.plaintext : '';
    }
    if (Array.isArray(scriptData.table)) {
        copied.table = scriptData.table.map((t: any) => ({
            ...t,
            rows: (t.rows || []).filter((row: any) =>
                Object.values(row).some((cell: any) =>
                    (cell?.plaintext !== undefined && String(cell.plaintext).toLowerCase().includes(s)) ||
                    (cell?.button?.value !== undefined && JSON.stringify(cell.button.value).toLowerCase().includes(s))
                )
            ),
        }));
    }
    return copied;
};

export const getMetadata = (node: ConsoleFileNode) => {
    try { return JSON.parse(node.metadata); } catch { return {}; }
};

export const deduplicateNodes = (nodes: ConsoleFileNode[]): ConsoleFileNode[] => {
    if (!nodes || nodes.length === 0) return [];
    const seen = new Map<string, ConsoleFileNode>();
    nodes.forEach(node => {
        const key = node.full_path_text;
        if (!seen.has(key)) seen.set(key, node);
    });
    return Array.from(seen.values());
};

// ============================================
// Upload to Agent Modal
// ============================================
// ── helper: push local file to Mythic file store, return agent_file_id ──────
export const uploadFileToMythic = async (file: File, comment: string): Promise<string> => {
    const form = new FormData();
    form.append('file', file);
    form.append('comment', comment);
    const res = await fetch(TASK_UPLOAD_URL, {
        method: 'POST',
        body: form,
        headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.status === 'error') throw new Error(json.error || 'Upload rejected');
    if (!json.agent_file_id) throw new Error('No file ID returned');
    return json.agent_file_id as string;
};
