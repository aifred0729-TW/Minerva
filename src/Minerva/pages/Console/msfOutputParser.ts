/**
 * Meterpreter output → Mythic JSON shapes.
 *
 * Mythic's TaskBlock already has rich renderers for several agent output
 * shapes (file browser, process list, ifconfig, netstat, mimikatz). It
 * picks the right one by JSON-parsing the response and matching on shape:
 *
 *   { files: [...] }                    → file browser
 *   [{ process_id, ... }]               → process list
 *   [{ AdapterName, ... }]              → ifconfig
 *   [{ local_port, protocol, ... }]     → netstat
 *
 * Meterpreter prints plain text. By converting its output into the same
 * JSON shapes that Mythic agents emit, every existing renderer "just
 * works" for MSF tasks — zero new UI code, zero per-command branching in
 * TaskBlock.
 *
 * Parsers below are tolerant: if the raw text doesn't match the expected
 * meterpreter format they return `null` and the caller falls back to
 * showing the raw text. Each parser only runs against completed task
 * output (running tasks may still be receiving chunks).
 */

function stripAnsi(s: string): string {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/** Convert "2026-01-01 12:00:00 +0000" into a unix timestamp (seconds). */
function parseMeterpreterDate(s: string): number {
    if (!s) return 0;
    const cleaned = s.replace(/\s+\+\d{4}$/, 'Z').replace(' ', 'T');
    const ms = Date.parse(cleaned);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

function isWindowsPath(p: string): boolean {
    return /^[A-Za-z]:[\\/]/.test(p) || p.includes('\\');
}

function joinPath(base: string, child: string): string {
    if (!base) return child;
    const win = isWindowsPath(base);
    const sep = win ? '\\' : '/';
    const trimmed = base.endsWith(sep) ? base.slice(0, -1) : base;
    return `${trimmed}${sep}${child}`;
}

// ── ps ────────────────────────────────────────────────────────────────────
// Output:
//   Process List
//   ============
//
//    PID    PPID   Name        Arch   Session   User                  Path
//    ---    ----   ----        ----   -------   ----                  ----
//    0      0      [System Process]
//    4      0      System      x64    0
//    528    4      smss.exe    x64    0         NT AUTHORITY\SYSTEM   C:\Windows\System32\smss.exe

export interface MythicProcessRecord {
    process_id: number;
    parent_process_id: number;
    name: string;
    architecture?: string;
    user?: string;
    bin_path?: string;
    session_id?: string;
}

export function parseMsfPs(raw: string): MythicProcessRecord[] | null {
    const text = stripAnsi(raw);
    const lines = text.split('\n');
    let dashLine: string | null = null;
    let dataStart = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*PID\s+PPID\s+Name/i.test(lines[i])) {
            for (let j = i + 1; j < lines.length; j++) {
                if (/^[\s-]+$/.test(lines[j]) && lines[j].includes('---')) {
                    dashLine = lines[j];
                    dataStart = j + 1;
                    break;
                }
            }
            break;
        }
    }
    if (!dashLine || dataStart < 0) return null;

    const colStarts: number[] = [];
    let inDash = false;
    for (let i = 0; i < dashLine.length; i++) {
        const ch = dashLine[i];
        if (ch === '-' && !inDash) { colStarts.push(i); inDash = true; }
        else if (ch !== '-') { inDash = false; }
    }
    if (colStarts.length < 3) return null;

    const slice = (line: string, idx: number): string => {
        const s = colStarts[idx];
        const e = idx + 1 < colStarts.length ? colStarts[idx + 1] : line.length;
        return line.slice(s, e).trim();
    };

    const out: MythicProcessRecord[] = [];
    for (let i = dataStart; i < lines.length; i++) {
        const l = lines[i];
        if (!l.trim()) continue;
        if (/^Process List/i.test(l)) continue;
        const pid = parseInt(slice(l, 0), 10);
        if (isNaN(pid)) continue;
        const ppid = parseInt(slice(l, 1), 10);
        out.push({
            process_id: pid,
            parent_process_id: isNaN(ppid) ? 0 : ppid,
            name: (colStarts.length > 2 ? slice(l, 2) : '') || '(unknown)',
            architecture: colStarts.length > 3 ? slice(l, 3) || undefined : undefined,
            session_id: colStarts.length > 4 ? slice(l, 4) || undefined : undefined,
            user: colStarts.length > 5 ? slice(l, 5) || undefined : undefined,
            bin_path: colStarts.length > 6 ? slice(l, 6) || undefined : undefined,
        });
    }
    return out.length ? out : null;
}

// ── ls ────────────────────────────────────────────────────────────────────
// Output:
//   Listing: C:\Users\victim
//   =======================
//
//   Mode              Size   Type  Last modified              Name
//   ----              ----   ----  -------------              ----
//   40555/r-xr-xr-x   0      dir   2026-01-01 12:00:00 +0000  Desktop
//   100666/rw-rw-rw-  1234   fil   2026-04-02 09:15:23 +0000  notes.txt

export interface MythicFileRecord {
    name: string;
    full_name: string;
    size: number;
    is_file: boolean;
    modify_time: number;
    permissions: {
        permissions: string;
        user: string;
        group: string;
        uid: string;
        gid: string;
        symlink: string;
    };
}
export interface MythicFileListing {
    /** Optional — omitted for meterpreter ls because we already have the
     *  absolute path in `directory`. TaskBlock branches on
     *  `parent_path !== undefined`. */
    parent_path?: string;
    name?: string;
    directory: string;
    host?: string;
    files: MythicFileRecord[];
}

export function parseMsfLs(raw: string, host?: string): MythicFileListing | null {
    const text = stripAnsi(raw);
    const lines = text.split('\n');
    let listingPath: string | null = null;
    let inTable = false;
    let columnsOk = false;
    const files: MythicFileRecord[] = [];

    for (const lineRaw of lines) {
        const line = lineRaw.replace(/\r$/, '');
        if (!listingPath) {
            const m = /^Listing:\s+(.+)$/.exec(line.trim());
            if (m) { listingPath = m[1].trim(); continue; }
        }
        if (!inTable && /^Mode\s+Size\s+Type/i.test(line)) { inTable = true; continue; }
        if (inTable && /^----+\s+/.test(line)) { columnsOk = true; continue; }
        if (!inTable || !columnsOk) continue;

        const trimmed = line.trim();
        if (!trimmed) continue;
        const tok = trimmed.split(/\s+/);
        if (tok.length < 6) continue;
        const modeRaw = tok[0]; // e.g. 40555/r-xr-xr-x
        const sizeStr = tok[1];
        const type = tok[2];
        const dateStr = tok.slice(3, 6).join(' ');
        const name = tok.slice(6).join(' ').trim();
        if (!name || name === '.') continue;

        const permPart = modeRaw.includes('/') ? modeRaw.split('/')[1] : modeRaw;
        const isDir = /^dir/i.test(type);
        const size = isNaN(Number(sizeStr)) ? 0 : Number(sizeStr);
        const fullName = listingPath ? joinPath(listingPath, name) : name;
        files.push({
            name,
            full_name: fullName,
            size,
            is_file: !isDir,
            modify_time: parseMeterpreterDate(dateStr),
            permissions: {
                permissions: permPart,
                user: '', group: '', uid: '', gid: '', symlink: '',
            },
        });
    }

    if (!listingPath || files.length === 0) return null;
    // Intentionally omit `parent_path` + `name`: TaskBlock joins those when
    // present (Mythic agents send the parent/leaf split), but meterpreter
    // already gives us the absolute `Listing:` path. We pass it through
    // `directory` so TaskBlock's `parsed.directory || ...` fallback uses it.
    return {
        directory: listingPath,
        host,
        files,
    };
}

// ── ifconfig ──────────────────────────────────────────────────────────────
// Output (meterpreter):
//   Interface  1
//   ============
//   Name         : Software Loopback Interface 1
//   Hardware MAC : 00:00:00:00:00:00
//   MTU          : 1500
//   IPv4 Address : 127.0.0.1
//   IPv4 Netmask : 255.0.0.0
//   IPv6 Address : ::1
//   IPv6 Netmask : ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff

export interface MythicAdapterRecord {
    AdapterName: string;
    Status: 'Up' | 'Down';
    Description: string;
    AdressesV4: string[];
    AdressesV6: string[];
    Gateways: string[];
    DnsServers: string[];
    DhcpAddresses: string[];
}

export function parseMsfIfconfig(raw: string): MythicAdapterRecord[] | null {
    const text = stripAnsi(raw);
    const lines = text.split('\n');
    const adapters: MythicAdapterRecord[] = [];
    let cur: MythicAdapterRecord | null = null;
    const flush = () => {
        if (cur) {
            // Status heuristic: if any IPv4 is set and not 0.0.0.0, treat as Up.
            const upish = cur.AdressesV4.some(a => a && a !== '0.0.0.0');
            cur.Status = upish ? 'Up' : 'Down';
            adapters.push(cur);
        }
        cur = null;
    };
    for (const l of lines) {
        const line = l.replace(/\r$/, '');
        if (/^Interface\s+\d+/i.test(line.trim())) {
            flush();
            cur = {
                AdapterName: line.trim(),
                Status: 'Down',
                Description: '',
                AdressesV4: [],
                AdressesV6: [],
                Gateways: [],
                DnsServers: [],
                DhcpAddresses: [],
            };
            continue;
        }
        if (!cur) continue;
        const m = /^\s*([A-Za-z0-9 ()/]+?)\s*:\s*(.*?)\s*$/.exec(line);
        if (!m) continue;
        const k = m[1].toLowerCase();
        const v = m[2];
        if (!v) continue;
        if (k === 'name') cur.AdapterName = v;
        else if (k === 'hardware mac') cur.Description = `MAC ${v}` + (cur.Description ? ` · ${cur.Description}` : '');
        else if (k === 'mtu') cur.Description = (cur.Description ? `${cur.Description} · ` : '') + `MTU ${v}`;
        else if (k === 'ipv4 address') cur.AdressesV4.push(v);
        else if (k === 'ipv6 address') cur.AdressesV6.push(v);
    }
    flush();
    return adapters.length > 0 ? adapters : null;
}

// ── netstat ───────────────────────────────────────────────────────────────
// Output (Windows meterpreter):
//   Connection list
//   ===============
//   Proto   Local address          Remote address       State        User    Inode   PID/Program name
//   -----   -------------          --------------       -----        ----    -----   ----------------
//   tcp     0.0.0.0:445            0.0.0.0:0            LISTEN

export interface MythicNetstatRecord {
    protocol: string;
    local_port: number;
    local_address: string;
    remote_port: number;
    remote_address: string;
    state: string;
    pid?: number;
    process_name?: string;
}

export function parseMsfNetstat(raw: string): MythicNetstatRecord[] | null {
    const text = stripAnsi(raw);
    const lines = text.split('\n');
    let headerIdx = -1;
    let dashLine: string | null = null;
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*Proto\s+Local address/i.test(lines[i])) {
            headerIdx = i;
            for (let j = i + 1; j < lines.length; j++) {
                if (/^[\s-]+$/.test(lines[j]) && lines[j].includes('---')) {
                    dashLine = lines[j];
                    break;
                }
            }
            break;
        }
    }
    if (headerIdx < 0 || !dashLine) return null;

    const colStarts: number[] = [];
    let inDash = false;
    for (let i = 0; i < dashLine.length; i++) {
        const ch = dashLine[i];
        if (ch === '-' && !inDash) { colStarts.push(i); inDash = true; }
        else if (ch !== '-') { inDash = false; }
    }
    if (colStarts.length < 4) return null;
    const slice = (line: string, idx: number) => {
        const s = colStarts[idx];
        const e = idx + 1 < colStarts.length ? colStarts[idx + 1] : line.length;
        return line.slice(s, e).trim();
    };

    const parseEndpoint = (ep: string): { addr: string; port: number } => {
        // Handle "0.0.0.0:445", "[::]:445", "*:445"
        const idx = ep.lastIndexOf(':');
        if (idx < 0) return { addr: ep, port: 0 };
        const addr = ep.slice(0, idx);
        const port = parseInt(ep.slice(idx + 1), 10);
        return { addr, port: Number.isFinite(port) ? port : 0 };
    };

    // Mythic's netstat renderer in TaskBlock matches on strict casing:
    //   `row.protocol === 'TCP'` (uppercase)
    //   `row.state === 'Listen' / 'Established' / 'CloseWait' …` (CamelCase)
    // We have to mirror exactly or rows fall through every filter and the
    // panel disappears entirely. The helper normalises shouty SCREAMING_CASE
    // like CLOSE_WAIT → CloseWait.
    const normaliseState = (raw: string): string => {
        if (!raw) return '';
        return raw.toLowerCase()
            .split(/[_\s]+/)
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');
    };
    const out: MythicNetstatRecord[] = [];
    for (let i = headerIdx + 2; i < lines.length; i++) {
        const l = lines[i];
        if (!l.trim()) continue;
        const proto = slice(l, 0);
        if (!/^(tcp|udp)/i.test(proto)) continue;
        const local = parseEndpoint(slice(l, 1));
        const remote = parseEndpoint(slice(l, 2));
        const state = slice(l, 3);
        const procField = colStarts.length > 6 ? slice(l, 6) : '';
        let pid: number | undefined;
        let process_name: string | undefined;
        const pidProcMatch = /^(\d+)\/(.+)$/.exec(procField);
        if (pidProcMatch) {
            pid = parseInt(pidProcMatch[1], 10);
            process_name = pidProcMatch[2];
        }
        out.push({
            protocol: proto.toUpperCase(),
            local_port: local.port,
            local_address: local.addr,
            remote_port: remote.port,
            remote_address: remote.addr,
            state: normaliseState(state) || 'Listen',
            pid,
            process_name,
        });
    }
    return out.length ? out : null;
}

// ── sysinfo / getuid / hashdump (key-value style) ────────────────────────
// These don't have a dedicated Mythic renderer but the raw text is already
// readable. We just strip ANSI and trim — the plain-text path renders cleanly.

// ── Dispatcher ────────────────────────────────────────────────────────────

export type MsfStructuredOutput =
    | { kind: 'process'; data: MythicProcessRecord[] }
    | { kind: 'files'; data: MythicFileListing }
    | { kind: 'ifconfig'; data: MythicAdapterRecord[] }
    | { kind: 'netstat'; data: MythicNetstatRecord[] };

const COMMAND_ALIASES: Record<string, 'ps' | 'ls' | 'ifconfig' | 'netstat'> = {
    'ps': 'ps',
    'pgrep': 'ps',
    'ls': 'ls',
    'dir': 'ls',
    'ifconfig': 'ifconfig',
    'ipconfig': 'ifconfig',
    'netstat': 'netstat',
};

/**
 * Try to parse meterpreter output for a given command into a Mythic-shaped
 * JSON object that TaskBlock will render as a panel. Returns null when the
 * command isn't recognised or the output doesn't parse cleanly.
 */
export function tryMsfStructuredResponse(
    commandLine: string,
    output: string,
    host?: string,
): MsfStructuredOutput | null {
    if (!output) return null;
    const cmdName = (commandLine || '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const aliased = COMMAND_ALIASES[cmdName];
    if (!aliased) return null;

    if (aliased === 'ps') {
        const data = parseMsfPs(output);
        return data ? { kind: 'process', data } : null;
    }
    if (aliased === 'ls') {
        const data = parseMsfLs(output, host);
        return data ? { kind: 'files', data } : null;
    }
    if (aliased === 'ifconfig') {
        const data = parseMsfIfconfig(output);
        return data ? { kind: 'ifconfig', data } : null;
    }
    if (aliased === 'netstat') {
        const data = parseMsfNetstat(output);
        return data ? { kind: 'netstat', data } : null;
    }
    return null;
}

/**
 * Encode a parsed output as a JSON string suitable for embedding as the
 * `response` payload of a synthetic TaskResponse. TaskBlock will JSON-parse
 * it on the receiving end and dispatch to the matching renderer.
 */
export function structuredToJsonPayload(out: MsfStructuredOutput): string {
    switch (out.kind) {
        case 'process':   return JSON.stringify(out.data);
        case 'files':     return JSON.stringify(out.data);
        case 'ifconfig':  return JSON.stringify(out.data);
        case 'netstat':   return JSON.stringify(out.data);
    }
}
