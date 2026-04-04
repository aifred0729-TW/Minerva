import type { CallbackPort, C2ParamInstance } from '../../types/tunnels';
import { formatBytes, SENSITIVE_PARAM_NAMES } from '../../lib/utils';
import { timeAgo } from '../../lib/time';

export const loadingSound = process.env.PUBLIC_URL + '/audio/tunnel.mp3';

// ============================================
// Helpers — re-export from shared libs
// ============================================
export { formatBytes as fmtBytes } from '../../lib/utils';

export const fmtAbsoluteTime = (isoStr: string): string => {
    if (!isoStr) return '—';
    const d = new Date(isoStr.endsWith('Z') ? isoStr : isoStr + 'Z');
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const fmtRelativeTime = (isoStr: string): string => {
    if (!isoStr) return '—';
    return timeAgo(isoStr);
};

export const PORT_TYPE_LABELS: Record<string, string> = {
    socks: 'SOCKS5',
    rpfwd: 'RPFWD',
    interactive: 'INTERACTIVE',
};

export const PORT_TYPE_COLORS: Record<string, string> = {
    socks: 'text-signal border-signal/40 bg-signal/10',
    rpfwd: 'text-blue-400 border-blue-400/40 bg-blue-400/10',
    interactive: 'text-purple-400 border-purple-400/40 bg-purple-400/10',
};

// Friendly label for known C2 parameter names
export const C2_PARAM_LABELS: Record<string, string> = {
    callback_host: 'Host',
    callback_port: 'Port',
    host: 'Host',
    port: 'Port',
    callback_interval: 'Interval',
    callback_jitter: 'Jitter',
    killdate: 'Kill Date',
    encrypted_exchange_check: 'Encrypted',
    AESPSK: 'AES PSK',
    aespsk: 'AES PSK',
    proxyHost: 'Proxy Host',
    proxyPort: 'Proxy Port',
    proxyUser: 'Proxy User',
    proxyPass: 'Proxy Pass',
    domains: 'Domains',
    USER_AGENT: 'User Agent',
    HEADERS: 'Headers',
};

// Re-export shared SENSITIVE_PARAM_NAMES for local use
export const SENSITIVE_PARAMS = SENSITIVE_PARAM_NAMES;

export const maskValue = (name: string, value: string): string => {
    if (SENSITIVE_PARAM_NAMES.has(name) && value.length > 8) {
        return value.slice(0, 6) + '••••';
    }
    return value;
};

// Get the primary C2 host and port across all instances on a payload
export const getC2HostPort = (port: CallbackPort): { host?: string; port?: string; profileName?: string } => {
    const instances = port.callback?.payload?.c2profileparametersinstances;
    if (!instances?.length) return {};
    const hostInst = instances.find(p =>
        p.c2profileparameter.name === 'callback_host' || p.c2profileparameter.name === 'host'
    );
    const portInst = instances.find(p =>
        p.c2profileparameter.name === 'callback_port' || p.c2profileparameter.name === 'port'
    );
    return {
        host: hostInst?.value,
        port: portInst?.value,
        profileName: hostInst?.c2profile.name ?? portInst?.c2profile.name,
    };
};
