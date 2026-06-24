/* =============================================================================
 *  MSF Payload — local cache + canonical shape
 *
 *  Dual storage strategy (per user direction):
 *    - localStorage  : instant read/write, low latency, single browser
 *    - agentstorage  : cross-operator share, source of truth
 *
 *  The list view merges both, preferring agentstorage when an id exists in
 *  both places (so other operators' updates win over a stale local copy).
 *
 *  All payload byte data is stored base64-encoded on the wire (both stores).
 *  Decode lazily — only when the operator triggers a download.
 * ===========================================================================*/

// localStorage cache key per operation. Embedding the operation id
// stops Op A's local cache from leaking into Op B's view when an
// operator switches engagements in the same browser session.
const lsKeyForOp = (operationId: number | string) => `minerva_msf_payloads_v1_op${operationId}`;
// Pre-op-scoping legacy key — kept for one-time migration on first load.
const LEGACY_LS_KEY = 'minerva_msf_payloads_v1';

export interface MsfPayloadRecord {
    /** Stable id — used as the agentstorage suffix and the row React key. */
    id: string;
    /** Display name set by the operator (defaults to module last segment). */
    name: string;
    /** Full MSF module path, e.g. 'windows/meterpreter/reverse_tcp'. */
    module: string;
    /** Inferred OS bucket: 'windows' | 'linux' | 'osx' | 'android' | 'multi' | 'other'. */
    os: string;
    /** Output format selected at generation time: exe, dll, elf, raw, etc. */
    format: string;
    /** Encoder used (or 'none'). */
    encoder?: string;
    /** Options the user filled in (LHOST, LPORT, etc.) — excludes Format/Encoder
     *  which we surface as first-class fields above. */
    options: Record<string, string>;
    /** ISO-8601 UTC. */
    createdAt: string;
    /** Username from auth context when generated — best-effort, for display. */
    createdBy?: string;
    /** Raw payload bytes, base64-encoded. */
    bytesB64: string;
    /** Byte length of the decoded payload (so list view avoids decoding). */
    size: number;
    /** Mythic file id, populated after first "Copy public download link"
     *  click — see MsfPayloadRow#handleCopyPublicLink. Cached so subsequent
     *  copies don't re-upload the bytes. */
    uploadedFileId?: string;
}

/* ── Base64 helpers (binary-safe) ───────────────────────────────────────── */

export function bytesToB64(bytes: Uint8Array): string {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
}

export function b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/* ── Module path classifier ───────────────────────────────────────────────
 *  Breaks a Metasploit payload path into four orthogonal facets so the UI can
 *  expose them as chips. The parsing is heuristic but covers the vast majority
 *  of stock MSF payloads. Examples:
 *
 *    windows/meterpreter/reverse_tcp        → arch:any  stage:meterpreter  conn:reverse_tcp  staging:staged
 *    windows/x64/meterpreter/reverse_tcp    → arch:x64  stage:meterpreter  conn:reverse_tcp  staging:staged
 *    windows/shell_reverse_tcp              → arch:any  stage:shell        conn:reverse_tcp  staging:inline
 *    windows/exec                           → arch:any  stage:exec         conn:none         staging:single
 *    linux/x64/shell_bind_tcp               → arch:x64  stage:shell        conn:bind_tcp     staging:inline
 *    java/meterpreter/reverse_https         → arch:any  stage:meterpreter  conn:reverse_https staging:staged
 *    multi/handler                          → arch:any  stage:handler      conn:none         staging:single
 */

const KNOWN_ARCHS = new Set([
    'x64', 'x86', 'x86_64',
    'aarch64', 'arm', 'aarch32', 'armle', 'armbe',
    'mipsle', 'mipsbe', 'mips64', 'mips64le',
    'ppc', 'ppc64', 'sparc',
    'riscv32', 'riscv64',
    'powerpc', 'powerpc64',
    'r600',
]);

/** Order matters — longest prefix first so 'bind_named_pipe' beats 'bind'. */
const CONN_KEYWORDS = [
    'reverse_winhttps', 'reverse_winhttp',
    'reverse_https', 'reverse_http',
    'reverse_named_pipe', 'reverse_ipv6_tcp', 'reverse_ipv6',
    'reverse_tcp_allports', 'reverse_tcp_dns', 'reverse_tcp_rc4', 'reverse_tcp_uuid',
    'reverse_tcp',
    'bind_named_pipe', 'bind_hidden_ipknock_tcp', 'bind_hidden_tcp', 'bind_ipv6_tcp', 'bind_ipv6',
    'bind_tcp_rc4', 'bind_tcp_uuid', 'bind_tcp',
    'find_port', 'findport', 'findtag',
];

const STAGE_RENAMES: Record<string, string> = {
    add_user: 'adduser',
    add_admin: 'adduser',
    load_library: 'dllinject',
};

export type MsfPayloadKind = 'meterpreter' | 'shell' | 'special';

/** Coarse connection style — how/where the payload moves data. */
export type MsfConnType = 'reverse' | 'bind' | 'find' | 'exec' | 'other';

/** Coarse transport protocol — what's on the wire. */
export type MsfProtocol = 'tcp' | 'udp' | 'http' | 'https' | 'named_pipe' | 'ipv6' | 'other' | 'none';

export interface MsfModuleFacets {
    /** e.g. 'windows', 'linux', 'osx', 'multi', 'java', 'python'. */
    platform: string;
    /** Architecture segment if present, else 'any'. */
    arch: string;
    /** Stage type: meterpreter / shell / exec / vncinject / dllinject / handler / other / ... */
    stage: string;
    /** Raw connection family: reverse_tcp / bind_tcp / reverse_https / ... or 'none'. */
    conn: string;
    /** Whether the payload is multi-stage (download stager from server) or
     *  inline (single self-contained payload), or 'single' for payloads with
     *  no networking at all (exec, messagebox, adduser, ...). */
    staging: 'staged' | 'inline' | 'single';
    /** Operator-level grouping: full meterpreter session, plain shell, or
     *  "special" (exec, vncinject, dllinject, adduser, handler, ...). Drives
     *  the KIND tab in the wizard. */
    kind: MsfPayloadKind;
    /** Connection style derived from `conn` + `staging` — drives the
     *  CONNECTION TYPE picker on the TRANSPORT step. */
    connType: MsfConnType;
    /** Wire protocol parsed out of `conn` (e.g. tcp/udp/http/https/named_pipe).
     *  Drives the PROTOCOL picker on the TRANSPORT step. */
    protocol: MsfProtocol;
}

/** Map the parsed `stage` field to the operator-friendly KIND bucket. */
export function kindFromStage(stage: string): MsfPayloadKind {
    const s = stage.toLowerCase();
    if (s === 'meterpreter' || s.startsWith('meterpreter/')) return 'meterpreter';
    if (s === 'shell' || s.startsWith('shell/')) return 'shell';
    return 'special';
}

/** Derive operator-level connection style from the raw conn keyword + staging. */
export function connTypeFromConn(conn: string, staging: 'staged' | 'inline' | 'single'): MsfConnType {
    if (conn.startsWith('reverse')) return 'reverse';
    if (conn.startsWith('bind')) return 'bind';
    if (conn.startsWith('find')) return 'find';
    // No conn keyword + single staging → a local-only payload (exec, messagebox,
    // adduser, handler, etc.) — group these as "exec".
    if (conn === 'none' && staging === 'single') return 'exec';
    return 'other';
}

/** Derive wire protocol from the raw conn keyword. */
export function protocolFromConn(conn: string): MsfProtocol {
    if (conn === 'none') return 'none';
    // Order matters — match the longer suffix first.
    if (conn.includes('named_pipe')) return 'named_pipe';
    if (conn.includes('winhttps')) return 'https';
    if (conn.includes('winhttp')) return 'http';
    if (conn.includes('https')) return 'https';
    if (conn.includes('http')) return 'http';
    if (conn.includes('ipv6')) return 'ipv6';
    if (conn.includes('udp')) return 'udp';
    if (conn.includes('tcp')) return 'tcp';
    return 'other';
}

export function classifyMsfModule(module: string): MsfModuleFacets {
    const segs = module.split('/').filter(Boolean);
    const platform = segs[0] ?? 'multi';

    // Locate an architecture segment between platform and stage path
    let archIdx = -1;
    for (let i = 1; i < segs.length; i++) {
        if (KNOWN_ARCHS.has(segs[i])) { archIdx = i; break; }
    }
    const arch = archIdx >= 0 ? segs[archIdx] : 'any';

    const stagePath = segs.slice(archIdx >= 0 ? archIdx + 1 : 1);

    let stage = 'other';
    let conn = 'none';
    let staging: 'staged' | 'inline' | 'single' = 'single';

    if (stagePath.length >= 2) {
        // staged path: meterpreter/reverse_tcp, shell/bind_tcp, vncinject/reverse_https...
        stage = stagePath.slice(0, -1).join('/');
        conn = stagePath[stagePath.length - 1];
        staging = 'staged';
    } else if (stagePath.length === 1) {
        const last = stagePath[0];
        // Try to split inline payloads like 'shell_reverse_tcp' at a known
        // connection keyword. Longest first so multi-word conns win.
        const found = CONN_KEYWORDS.find(k => last.endsWith('_' + k) || last === k);
        if (found && last !== found) {
            stage = last.slice(0, -(found.length + 1));
            conn = found;
            staging = 'inline';
        } else if (found === last) {
            stage = 'other';
            conn = last;
            staging = 'inline';
        } else {
            stage = last;
            conn = 'none';
            staging = 'single';
        }
    }

    stage = STAGE_RENAMES[stage] ?? stage;
    return {
        platform, arch, stage, conn, staging,
        kind: kindFromStage(stage),
        connType: connTypeFromConn(conn, staging),
        protocol: protocolFromConn(conn),
    };
}

/* ── Module path → OS classifier ─────────────────────────────────────────── */

export function osFromModule(module: string): string {
    const first = module.split('/')[0]?.toLowerCase() ?? '';
    if (first === 'windows') return 'windows';
    if (first === 'linux' || first === 'cmd') return 'linux';
    if (first === 'osx' || first === 'mac' || first === 'apple_ios') return 'osx';
    if (first === 'android') return 'android';
    if (first === 'multi' || first === 'java' || first === 'python' || first === 'php' || first === 'ruby' || first === 'nodejs') return 'multi';
    return 'other';
}

/* ── Module path → suggested file extension for the chosen format ───────── */

export function suggestFilename(rec: Pick<MsfPayloadRecord, 'name' | 'format' | 'os'>): string {
    const safe = rec.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64) || 'payload';
    // If the operator-supplied name already carries an extension (any
    // `.<alphanum>` suffix), respect it verbatim — don't double-append a
    // format-derived one. A name typed as `mypayload.exe` should stay
    // exactly that, not become `mypayload.exe.bin`.
    if (/\.[a-zA-Z0-9]+$/.test(safe)) return safe;
    const fmt = (rec.format || 'raw').toLowerCase();
    const extByFormat: Record<string, string> = {
        exe: 'exe', 'exe-only': 'exe', 'exe-service': 'exe', 'exe-small': 'exe',
        dll: 'dll',
        elf: 'elf', 'elf-so': 'so',
        macho: 'macho',
        msi: 'msi', 'msi-nouac': 'msi',
        psh: 'ps1', 'psh-cmd': 'cmd', 'psh-net': 'ps1', 'psh-reflection': 'ps1',
        vba: 'vba', 'vba-exe': 'vba', 'vba-psh': 'vba',
        vbs: 'vbs', 'loop-vbs': 'vbs', asp: 'asp', aspx: 'aspx', 'aspx-exe': 'aspx',
        war: 'war', jar: 'jar', hta: 'hta', 'hta-psh': 'hta',
        python: 'py', perl: 'pl', ruby: 'rb', bash: 'sh', powershell: 'ps1',
        c: 'c', csharp: 'cs', java: 'java', js_le: 'js', js_be: 'js',
        apk: 'apk',
        // raw / unknown formats: emit no extension. The legacy ".bin"
        // default was forcing operators to rename every raw shellcode just
        // to get rid of the unwanted suffix.
    };
    const ext = extByFormat[fmt];
    return ext ? `${safe}.${ext}` : safe;
}

/* ── localStorage CRUD ──────────────────────────────────────────────────── */

function readAll(operationId: number | string): MsfPayloadRecord[] {
    try {
        let raw = localStorage.getItem(lsKeyForOp(operationId));
        // One-time legacy migration: if the per-op key is empty AND the
        // old flat key has content, adopt those records into the current
        // operation (best-effort attribution — operator can delete any
        // that don't belong). Cleared after move so we don't keep
        // re-importing.
        if (!raw) {
            const legacy = localStorage.getItem(LEGACY_LS_KEY);
            if (legacy) {
                try { localStorage.setItem(lsKeyForOp(operationId), legacy); } catch { /* quota */ }
                localStorage.removeItem(LEGACY_LS_KEY);
                raw = legacy;
            }
        }
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeAll(operationId: number | string, records: MsfPayloadRecord[]): void {
    try {
        localStorage.setItem(lsKeyForOp(operationId), JSON.stringify(records));
    } catch (e) {
        // localStorage quota exceeded — large payloads must rely on agentstorage.
        // We still emit a console warning so the operator can see why a row
        // didn't survive a reload, even though agentstorage covers them.
        // eslint-disable-next-line no-console
        console.warn('[msfPayloads] localStorage write failed (quota?):', e);
    }
}

export function listLocalPayloads(operationId: number | string): MsfPayloadRecord[] {
    return readAll(operationId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getLocalPayload(operationId: number | string, id: string): MsfPayloadRecord | undefined {
    return readAll(operationId).find(r => r.id === id);
}

export function saveLocalPayload(operationId: number | string, record: MsfPayloadRecord): void {
    const all = readAll(operationId);
    const idx = all.findIndex(r => r.id === record.id);
    if (idx >= 0) all[idx] = record;
    else all.unshift(record);
    writeAll(operationId, all);
}

export function deleteLocalPayload(operationId: number | string, id: string): void {
    writeAll(operationId, readAll(operationId).filter(r => r.id !== id));
}

/* ── ID generator (sortable, collision-resistant within a single ms) ───── */

export function newMsfPayloadId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${ts}-${rand}`;
}

/* ── agentstorage <-> record (de)serialization ──────────────────────────────
 *  Matches the convention used by customGraphNodeService / quickhacks: send a
 *  base64-encoded JSON string for the `data` bytea column on write; on read,
 *  accept either base64-of-JSON or Postgres's `\x...` hex bytea (so we can
 *  decode rows written by either path). */

const _enc = (str: string): string => btoa(unescape(encodeURIComponent(str)));
const _dec = (str: string): string => {
    try { return decodeURIComponent(escape(atob(str))); } catch { return atob(str); }
};

export function encodeRecordForAgentStorage(rec: MsfPayloadRecord): string {
    return _enc(JSON.stringify(rec));
}

export function decodeRecordFromAgentStorage(data: unknown): MsfPayloadRecord | null {
    if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>;
        if (typeof obj.id === 'string') return obj as unknown as MsfPayloadRecord;
    }
    if (typeof data !== 'string') return null;
    const tryParse = (s: string): MsfPayloadRecord | null => {
        try {
            const parsed = JSON.parse(s);
            if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
                return parsed as MsfPayloadRecord;
            }
        } catch { /* fall through */ }
        return null;
    };
    // Postgres bytea hex form
    if (data.startsWith('\\x')) {
        try {
            const hex = data.slice(2);
            const bytes = hex.match(/.{1,2}/g) ?? [];
            const bin = bytes.map(b => String.fromCharCode(parseInt(b, 16))).join('');
            // The hex may wrap either raw JSON or base64-of-JSON — try both.
            return tryParse(bin) ?? tryParse(_dec(bin));
        } catch { return null; }
    }
    // Base64 of JSON, or already-JSON
    return tryParse(_dec(data)) ?? tryParse(data);
}
