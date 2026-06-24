/**
 * MSF-RPC client for Minerva — talks to msfrpcd via a lightweight proxy
 * or directly from the browser (CORS permitting).
 *
 * All methods return plain JS objects; callers handle UI state.
 */

// Route through Minerva's Nginx reverse proxy to avoid CORS issues.
// Nginx proxies /msf-rpc/ → msfrpcd's /api/ on the host.
function rpcUrl(): string {
    return `${window.location.origin}/msf-rpc/`;
}

// ── Minimal MessagePack encoder/decoder ─────────────────────────────────────
// We only need a tiny subset — strings, ints, maps, arrays, booleans, nil.

function packStr(s: string): number[] {
    const enc = new TextEncoder().encode(s);
    const l = enc.length;
    const out: number[] = [];
    if (l <= 31) { out.push(0xa0 | l); }
    else if (l <= 0xff) { out.push(0xd9, l); }
    else if (l <= 0xffff) { out.push(0xda, (l >> 8) & 0xff, l & 0xff); }
    else { out.push(0xdb, (l >> 24) & 0xff, (l >> 16) & 0xff, (l >> 8) & 0xff, l & 0xff); }
    for (const b of enc) out.push(b);
    return out;
}

function packInt(n: number): number[] {
    if (n >= 0 && n <= 0x7f) return [n];
    if (n >= 0 && n <= 0xff) return [0xcc, n];
    if (n >= 0 && n <= 0xffff) return [0xcd, (n >> 8) & 0xff, n & 0xff];
    if (n >= 0 && n <= 0xffffffff) return [0xce, (n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
    if (n >= -32 && n < 0) return [n & 0xff];
    return [0xd2, (n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function packBool(b: boolean): number[] { return b ? [0xc3] : [0xc2]; }

function packValue(v: unknown): number[] {
    if (v === null || v === undefined) return [0xc0];
    if (typeof v === 'boolean') return packBool(v);
    if (typeof v === 'number') return packInt(v);
    if (typeof v === 'string') return packStr(v);
    if (Array.isArray(v)) {
        const l = v.length;
        const hdr: number[] = l <= 15 ? [0x90 | l] : l <= 0xffff ? [0xdc, (l >> 8) & 0xff, l & 0xff] : [0xdd, (l >> 24) & 0xff, (l >> 16) & 0xff, (l >> 8) & 0xff, l & 0xff];
        const body = v.flatMap(packValue);
        return [...hdr, ...body];
    }
    if (typeof v === 'object') {
        const entries = Object.entries(v as Record<string, unknown>);
        const l = entries.length;
        const hdr: number[] = l <= 15 ? [0x80 | l] : l <= 0xffff ? [0xde, (l >> 8) & 0xff, l & 0xff] : [0xdf, (l >> 24) & 0xff, (l >> 16) & 0xff, (l >> 8) & 0xff, l & 0xff];
        const body = entries.flatMap(([k, val]) => [...packStr(k), ...packValue(val)]);
        return [...hdr, ...body];
    }
    return [0xc0];
}

function pack(arr: unknown[]): Uint8Array {
    return new Uint8Array(packValue(arr));
}

// Decoder
function unpack(buf: Uint8Array): unknown {
    let off = 0;

    function readU8() { return buf[off++]; }
    function readU16() { const v = (buf[off] << 8) | buf[off + 1]; off += 2; return v; }
    function readU32() { const v = ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0; off += 4; return v; }
    function readI32() { const v = (buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]; off += 4; return v; }

    function readStr(l: number): string {
        const slice = buf.slice(off, off + l);
        off += l;
        return new TextDecoder().decode(slice);
    }

    // `bin` is officially the binary type. MSF-RPC uses it for Ruby
    // bytestrings — which covers both ASCII text fields AND raw payload
    // bytes. UTF-8 decoding those bytes destroys binary content: any byte
    // > 0x7F that doesn't form a valid UTF-8 sequence is replaced with
    // U+FFFD, which then collapses to `0xFD` once the caller does
    // `charCodeAt(i) & 0xff`. That's exactly what was corrupting the
    // generated payloads (every non-ASCII byte became 0xFD). Instead,
    // decode each byte as a single Latin-1 code unit so the byte value is
    // preserved verbatim; ASCII text still reads correctly and binary
    // survives intact for the payload-extraction code path.
    function readBin(l: number): string {
        let s = '';
        const end = off + l;
        // Chunk to avoid blowing the JS arg limit on huge payloads.
        const CHUNK = 0x4000;
        while (off + CHUNK < end) {
            s += String.fromCharCode(...buf.subarray(off, off + CHUNK));
            off += CHUNK;
        }
        s += String.fromCharCode(...buf.subarray(off, end));
        off = end;
        return s;
    }

    function read(): unknown {
        const b = readU8();
        if (b <= 0x7f) return b;
        if (b >= 0xe0) return b - 256;
        if (b >= 0xa0 && b <= 0xbf) return readStr(b & 0x1f);
        if (b >= 0x90 && b <= 0x9f) { const l = b & 0x0f; const a: unknown[] = []; for (let i = 0; i < l; i++) a.push(read()); return a; }
        if (b >= 0x80 && b <= 0x8f) { const l = b & 0x0f; const m: Record<string, unknown> = {}; for (let i = 0; i < l; i++) { const k = String(read()); m[k] = read(); } return m; }
        if (b === 0xc0) return null;
        if (b === 0xc2) return false;
        if (b === 0xc3) return true;
        // bin 8/16/32 — byte-preserving decode (see readBin comment)
        if (b === 0xc4) { const l = readU8(); return readBin(l); }
        if (b === 0xc5) { const l = readU16(); return readBin(l); }
        if (b === 0xc6) { const l = readU32(); return readBin(l); }
        // uint
        if (b === 0xcc) return readU8();
        if (b === 0xcd) return readU16();
        if (b === 0xce) return readU32();
        // int
        if (b === 0xd0) { const v = buf[off++]; return v > 127 ? v - 256 : v; }
        if (b === 0xd1) { const v = readU16(); return v > 32767 ? v - 65536 : v; }
        if (b === 0xd2) return readI32();
        // str 8/16/32
        if (b === 0xd9) { const l = readU8(); return readStr(l); }
        if (b === 0xda) { const l = readU16(); return readStr(l); }
        if (b === 0xdb) { const l = readU32(); return readStr(l); }
        // array 16/32
        if (b === 0xdc) { const l = readU16(); const a: unknown[] = []; for (let i = 0; i < l; i++) a.push(read()); return a; }
        if (b === 0xdd) { const l = readU32(); const a: unknown[] = []; for (let i = 0; i < l; i++) a.push(read()); return a; }
        // map 16/32
        if (b === 0xde) { const l = readU16(); const m: Record<string, unknown> = {}; for (let i = 0; i < l; i++) { const k = String(read()); m[k] = read(); } return m; }
        if (b === 0xdf) { const l = readU32(); const m: Record<string, unknown> = {}; for (let i = 0; i < l; i++) { const k = String(read()); m[k] = read(); } return m; }
        return null;
    }

    return read();
}

// ── RPC Transport ───────────────────────────────────────────────────────────

/**
 * Per-call timeout. With no bound, a hung msfrpcd (network blip, daemon
 * stalled on a console, nginx 504, etc.) leaves a fetch pending until the
 * browser's default timeout — which is many minutes. Worse, the polling
 * tick fires a fresh call every 8s on top of it, so within a minute the
 * tab has accumulated ~8 hung connections. Browsers cap concurrent
 * requests per origin at ~6, so GraphQL queries and static asset loads
 * queue behind the hung MSF traffic and the whole UI feels frozen.
 *
 * 12s is generous for the heaviest MSF call we make (module.exploits
 * lists ~2k entries and round-trips in under 1s on localhost) while
 * still freeing the connection slot promptly when the daemon is sick.
 */
const RPC_TIMEOUT_MS = 12_000;

async function rpcCall(method: string, ...args: unknown[]): Promise<Record<string, unknown>> {
    const body = pack([method, ...args]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    try {
        const resp = await fetch(rpcUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'binary/message-pack' },
            body: body as BodyInit,
            signal: controller.signal,
        });
        if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
        const raw = new Uint8Array(await resp.arrayBuffer());
        return unpack(raw) as Record<string, unknown>;
    } catch (e: any) {
        if (e?.name === 'AbortError') {
            throw new Error(`RPC ${method} timed out after ${RPC_TIMEOUT_MS}ms`);
        }
        throw e;
    } finally {
        clearTimeout(timer);
    }
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface MsfVersion {
    version: string;
    ruby: string;
    api: string;
}

export interface MsfModuleStats {
    exploits: number;
    auxiliary: number;
    post: number;
    payloads: number;
    encoders: number;
    nops: number;
    evasion: number;
    [key: string]: number;
}

export interface MsfSession {
    type: string;
    tunnel_local: string;
    tunnel_peer: string;
    via_exploit: string;
    via_payload: string;
    desc: string;
    info: string;
    workspace: string;
    session_host: string;
    session_port: number;
    target_host: string;
    username: string;
    uuid: string;
    exploit_uuid: string;
    routes: string;
    arch: string;
    platform: string;
}

export interface MsfJob {
    id: string;
    name: string;
}

export interface MsfConnectionStatus {
    connected: boolean;
    version?: MsfVersion;
    moduleStats?: MsfModuleStats;
    sessions: Record<string, MsfSession>;
    jobs: Record<string, string>;
    error?: string;
}

let _token: string | null = null;

export function getStoredCredentials() {
    return {
        user: sessionStorage.getItem('msf_rpc_user') || 'msf',
        pass: sessionStorage.getItem('msf_rpc_pass') || 'minerva_msf',
    };
}

export function saveCredentials(user: string, pass: string) {
    sessionStorage.setItem('msf_rpc_user', user);
    sessionStorage.setItem('msf_rpc_pass', pass);
    _token = null; // force re-auth
}

export async function login(user?: string, pass?: string): Promise<string> {
    const creds = getStoredCredentials();
    const u = user || creds.user;
    const p = pass || creds.pass;
    const res = await rpcCall('auth.login', u, p);
    if (res.error) throw new Error(String(res.error));
    _token = String(res.token);
    return _token;
}

async function authed(method: string, ...args: unknown[]): Promise<Record<string, unknown>> {
    if (!_token) await login();
    const res = await rpcCall(method, _token!, ...args);
    // Re-auth on token expiry
    if (res.error && String(res.error_message || '').includes('Invalid Authentication')) {
        _token = null;
        await login();
        return rpcCall(method, _token!, ...args);
    }
    return res;
}

export async function getCoreVersion(): Promise<MsfVersion> {
    const res = await authed('core.version');
    return { version: String(res.version || ''), ruby: String(res.ruby || ''), api: String(res.api || '') };
}

/**
 * Cheap connectivity probe — calls `core.version` (one small RPC) and
 * returns true on success, false on any error. Use this for "is the
 * MSF-RPC daemon reachable right now" UI indicators that need to react
 * within seconds. The full `getFullStatus` call enumerates seven module
 * categories (thousands of names each) and is too heavy to use on a
 * fast cadence.
 */
export async function pingMsfRpc(): Promise<boolean> {
    try {
        await authed('core.version');
        return true;
    } catch {
        return false;
    }
}

/**
 * Workspace name Minerva uses for each Mythic operation. The translation
 * is deterministic so a refresh recovers the same scope. The format
 * stays MSF-safe (alphanumeric + dashes only) to avoid quoting issues
 * when shelled through msfconsole.
 */
export function workspaceForOperation(operationId: number | string): string {
    const n = Number(operationId);
    if (!Number.isFinite(n) || n <= 0) return 'default';
    return `mythic-op-${n}`;
}

/**
 * Filter MSF session map down to only sessions whose `workspace` field
 * matches the given operation's expected MSF workspace name. Used by
 * dashboard panels that read `session.list` directly (vs the ledger-
 * backed `useMsfSyntheticCallbacks`, which does the same filter inside
 * its own hook). Sessions with an empty workspace are hidden — they
 * predate the bootstrap's workspace tagging and would otherwise leak
 * into every op's view.
 */
export function filterSessionsByOperation(
    sessions: Record<string, MsfSession>,
    operationId: number | string,
): Record<string, MsfSession> {
    if (!operationId || operationId === 0 || operationId === '0') return {};
    const expected = workspaceForOperation(operationId);
    const out: Record<string, MsfSession> = {};
    for (const [id, s] of Object.entries(sessions)) {
        if (s?.workspace?.trim() === expected) out[id] = s;
    }
    return out;
}

/**
 * Ensure a workspace exists and is currently active on the MSF RPC
 * daemon. msfrpcd doesn't expose a typed RPC for `workspace -a`, so
 * we drive it through a one-shot console.
 *
 * Idempotent: `workspace -a <name>` is a no-op when the workspace
 * already exists. `workspace <name>` makes it current.
 */
export async function ensureMsfWorkspace(name: string): Promise<void> {
    if (!name) return;
    const c = await consoleCreate();
    try {
        // Drain any banner emitted on console boot before issuing commands.
        await consoleRead(c.id);
        await consoleWrite(c.id, `workspace -a ${name}`);
        // Tiny delay so the add completes before the switch.
        await new Promise(r => setTimeout(r, 150));
        await consoleRead(c.id);
        await consoleWrite(c.id, `workspace ${name}`);
        await new Promise(r => setTimeout(r, 150));
        await consoleRead(c.id);
    } finally {
        try { await consoleDestroy(c.id); } catch { /* ignore */ }
    }
}

export async function getModuleStats(): Promise<MsfModuleStats> {
    const types = ['exploits', 'auxiliary', 'post', 'payloads', 'encoders', 'nops', 'evasion'];
    const results = await Promise.all(
        types.map(t => authed(`module.${t}`).then(r => {
            const mods = r.modules;
            return [t, Array.isArray(mods) ? mods.length : 0] as [string, number];
        }).catch(() => [t, 0] as [string, number]))
    );
    const out: Record<string, number> = {};
    for (const [k, v] of results) out[k] = v;
    return out as unknown as MsfModuleStats;
}

export async function getSessions(): Promise<Record<string, MsfSession>> {
    const res = await authed('session.list');
    return (res || {}) as unknown as Record<string, MsfSession>;
}

export async function getJobs(): Promise<Record<string, string>> {
    const res = await authed('job.list');
    return (res || {}) as unknown as Record<string, string>;
}

export async function getFullStatus(): Promise<MsfConnectionStatus> {
    try {
        const [version, moduleStats, sessions, jobs] = await Promise.all([
            getCoreVersion(),
            getModuleStats(),
            getSessions(),
            getJobs(),
        ]);
        return { connected: true, version, moduleStats, sessions, jobs };
    } catch (e: any) {
        return { connected: false, sessions: {}, jobs: {}, error: e.message || String(e) };
    }
}

export async function searchModules(type: string, query: string): Promise<string[]> {
    const res = await authed('module.search', query);
    if (Array.isArray(res)) return res.map(String);
    return [];
}

export async function stopJob(jobId: string): Promise<boolean> {
    const res = await authed('job.stop', jobId);
    return res.result === 'success';
}

export async function killSession(sessionId: string): Promise<boolean> {
    const res = await authed('session.stop', sessionId);
    return res.result === 'success';
}

// ── Exploit / Module API ────────────────────────────────────────────────────

export async function listModules(type: string): Promise<string[]> {
    const res = await authed(`module.${type}`);
    const mods = res.modules;
    return Array.isArray(mods) ? mods.map(String) : [];
}

export interface MsfModuleInfo {
    name: string;
    fullname: string;
    description: string;
    rank: number;
    rank_name: string;
    authors: string[];
    references: string[];
    targets?: string[];
    arch?: string[];
    platform?: string[];
    [key: string]: unknown;
}

export async function getModuleInfo(type: string, name: string): Promise<MsfModuleInfo> {
    const res = await authed('module.info', type, name);
    if (res.error) throw new Error(String(res.error_message || res.error));
    // Normalize arrays that may be nested objects
    const authors = Array.isArray(res.authors) ? res.authors.map(String) : [];
    const references = Array.isArray(res.references)
        ? res.references.map((r: unknown) => {
            if (Array.isArray(r)) return r.map(String).join('-');
            return String(r);
        })
        : [];
    const targets = Array.isArray(res.targets)
        ? (res.targets as unknown[]).map((t: unknown) => {
            if (Array.isArray(t)) return String(t[1] ?? t[0]);
            if (typeof t === 'object' && t !== null) return String(Object.values(t)[0] ?? '');
            return String(t);
        })
        : undefined;
    return {
        ...res,
        name: String(res.name || ''),
        fullname: String(res.fullname || name),
        description: String(res.description || ''),
        rank: Number(res.rank || 0),
        rank_name: String(res.rank_name || ''),
        authors,
        references,
        targets,
    } as MsfModuleInfo;
}

export interface MsfModuleOption {
    type: string;
    required: boolean;
    advanced: boolean;
    desc: string;
    default: unknown;
    enums?: string[];
}

export async function getModuleOptions(type: string, name: string): Promise<Record<string, MsfModuleOption>> {
    const res = await authed('module.options', type, name);
    if (res.error) throw new Error(String(res.error_message || res.error));
    const out: Record<string, MsfModuleOption> = {};
    for (const [k, v] of Object.entries(res)) {
        if (typeof v === 'object' && v !== null) {
            const opt = v as Record<string, unknown>;
            out[k] = {
                type: String(opt.type || 'string'),
                required: Boolean(opt.required),
                advanced: Boolean(opt.advanced),
                desc: String(opt.desc || ''),
                default: opt.default ?? null,
                enums: Array.isArray(opt.enums) ? opt.enums.map(String) : undefined,
            };
        }
    }
    return out;
}

export async function getCompatiblePayloads(moduleName: string): Promise<string[]> {
    const res = await authed('module.compatible_payloads', moduleName);
    const payloads = res.payloads;
    return Array.isArray(payloads) ? payloads.map(String) : [];
}

export interface MsfExecuteResult {
    job_id?: number;
    uuid?: string;
    error?: string;
    error_message?: string;
}

export async function executeModule(type: string, name: string, options: Record<string, string>): Promise<MsfExecuteResult> {
    const res = await authed('module.execute', type, name, options);
    if (res.error) {
        return { error: String(res.error_class || 'Error'), error_message: String(res.error_message || res.error_string || 'Unknown error') };
    }
    return {
        job_id: res.job_id != null ? Number(res.job_id) : undefined,
        uuid: res.uuid ? String(res.uuid) : undefined,
    };
}

/* ── Payload Generation ──────────────────────────────────────────────────────
 * For payload-type modules, `module.execute` returns the GENERATED bytes (no
 * job/session is started). The RPC server gives us `payload` as a binary
 * string; we wrap it as a Uint8Array so callers can blob/download/upload it
 * uniformly. Includes `payload_format` ('raw' by default — operator picks one
 * via the Format option, e.g. exe/dll/elf/macho/python/c).
 */
export interface MsfGeneratedPayload {
    bytes: Uint8Array;
    size: number;
    format?: string;
    encoder?: string;
    error?: string;
    error_message?: string;
}

export async function generatePayload(name: string, options: Record<string, string>): Promise<MsfGeneratedPayload> {
    const res = await authed('module.execute', 'payload', name, options);
    if (res.error) {
        return {
            bytes: new Uint8Array(),
            size: 0,
            error: String(res.error_class || 'Error'),
            error_message: String(res.error_message || res.error_string || 'Unknown error'),
        };
    }
    // MSF-RPC's MessagePack decoder hands us `payload` as a string-of-bytes.
    // Re-encode each char-code into a byte; can't use TextEncoder because the
    // contents are binary, not UTF-8.
    const raw = res.payload;
    let bytes = new Uint8Array(0);
    if (typeof raw === 'string') {
        bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
    } else if (raw instanceof Uint8Array) {
        bytes = raw;
    }
    return {
        bytes,
        size: bytes.length,
        format: typeof res.payload_format === 'string' ? res.payload_format : undefined,
        encoder: typeof options.Encoder === 'string' ? options.Encoder : undefined,
    };
}

// ── Console API ────────────────────────────────────────────────────────────

export interface MsfConsole {
    id: string;
    prompt: string;
    busy: boolean;
}

export async function consoleCreate(): Promise<MsfConsole> {
    const res = await authed('console.create');
    return { id: String(res.id), prompt: String(res.prompt || ''), busy: Boolean(res.busy) };
}

export async function consoleDestroy(consoleId: string): Promise<boolean> {
    const res = await authed('console.destroy', consoleId);
    return res.result === 'success';
}

export async function consoleWrite(consoleId: string, command: string): Promise<number> {
    const res = await authed('console.write', consoleId, command + '\n');
    return Number(res.wrote || 0);
}

export interface MsfConsoleRead {
    data: string;
    prompt: string;
    busy: boolean;
}

export async function consoleRead(consoleId: string): Promise<MsfConsoleRead> {
    const res = await authed('console.read', consoleId);
    return { data: String(res.data || ''), prompt: String(res.prompt || ''), busy: Boolean(res.busy) };
}

export async function consoleList(): Promise<MsfConsole[]> {
    const res = await authed('console.list');
    const consoles = res.consoles;
    if (Array.isArray(consoles)) {
        return consoles.map((c: any) => ({
            id: String(c.id),
            prompt: String(c.prompt || ''),
            busy: Boolean(c.busy),
        }));
    }
    return [];
}

export async function getJobInfo(jobId: string): Promise<Record<string, unknown>> {
    const res = await authed('job.info', jobId);
    return res;
}

// ── Session Interaction API ────────────────────────────────────────────────
// Shell sessions use `session.shell_read` / `session.shell_write`.
// Meterpreter sessions use `session.meterpreter_read` and
// `session.meterpreter_run_single` for sending commands (write is also OK
// but run_single is more reliable for single-line commands).

export interface MsfSessionRead {
    seq: string;
    data: string;
}

export async function sessionShellRead(sessionId: string, readPointer?: string): Promise<MsfSessionRead> {
    const args: unknown[] = [sessionId];
    if (readPointer !== undefined) args.push(readPointer);
    const res = await authed('session.shell_read', ...args);
    return { seq: String(res.seq || '0'), data: String(res.data || '') };
}

export async function sessionShellWrite(sessionId: string, data: string): Promise<number> {
    const res = await authed('session.shell_write', sessionId, data);
    return Number(res.write_count || 0);
}

export async function sessionMeterpreterRead(sessionId: string): Promise<string> {
    const res = await authed('session.meterpreter_read', sessionId);
    return String(res.data || '');
}

export async function sessionMeterpreterWrite(sessionId: string, data: string): Promise<boolean> {
    const res = await authed('session.meterpreter_write', sessionId, data);
    return res.result === 'success';
}

export async function sessionMeterpreterRunSingle(sessionId: string, command: string): Promise<boolean> {
    const res = await authed('session.meterpreter_run_single', sessionId, command);
    return res.result === 'success';
}

/**
 * Type-aware session read.
 * Returns appended output since the last read.
 */
export async function sessionRead(sessionId: string, type: string): Promise<string> {
    if (type === 'meterpreter') {
        return sessionMeterpreterRead(sessionId);
    }
    const r = await sessionShellRead(sessionId);
    return r.data;
}

/**
 * Type-aware session write.
 * Appends a newline automatically for shell; meterpreter handles it itself.
 */
export async function sessionWrite(sessionId: string, type: string, command: string): Promise<void> {
    if (type === 'meterpreter') {
        await sessionMeterpreterRunSingle(sessionId, command);
        return;
    }
    await sessionShellWrite(sessionId, command.endsWith('\n') ? command : command + '\n');
}
