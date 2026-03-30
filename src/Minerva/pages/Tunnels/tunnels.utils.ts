import type { CallbackPort, C2ParamInstance } from '../../types/tunnels';

export const loadingSound = process.env.PUBLIC_URL + '/audio/tunnel.mp3';

// ============================================
// Helpers
// ============================================
export const fmtBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

export const fmtAbsoluteTime = (isoStr: string): string => {
    if (!isoStr) return '—';
    const d = new Date(isoStr.endsWith('Z') ? isoStr : isoStr + 'Z');
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const fmtRelativeTime = (isoStr: string): string => {
    if (!isoStr) return '—';
    const d = new Date(isoStr.endsWith('Z') ? isoStr : isoStr + 'Z');
    const diff = Date.now() - d.getTime();
    if (diff < 0) return 'just now';
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
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

// Params that contain sensitive data (partially masked)
export const SENSITIVE_PARAMS = new Set(['AESPSK', 'aespsk', 'proxyPass']);

export const maskValue = (name: string, value: string): string => {
    if (SENSITIVE_PARAMS.has(name) && value.length > 8) {
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
