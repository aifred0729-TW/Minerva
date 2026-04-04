/**
 * MSF Output Parser — parses raw Metasploit console output into structured segments.
 * Strips ANSI escape codes, separates banner/params/log lines, and classifies log severity.
 */

// ── ANSI Stripping ──────────────────────────────────────────────────────────

/** Strip all ANSI escape codes from a string */
export function stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

// ── Types ───────────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'success' | 'error' | 'warning' | 'debug' | 'plain';

export interface MsfLogLine {
    level: LogLevel;
    timestamp?: string;      // e.g. "192.168.50.6:445"
    message: string;
    raw: string;
}

export interface MsfParam {
    key: string;
    value: string;
}

export interface ParsedOutput {
    banner: string;          // ASCII art + version info (raw, with ANSI stripped)
    params: MsfParam[];      // KEY => value lines
    logLines: MsfLogLine[];  // [*] / [+] / [-] prefixed lines
    otherLines: string[];    // anything that doesn't fit above
    hasBanner: boolean;
    hasParams: boolean;
}

// ── Matchers ────────────────────────────────────────────────────────────────

const BANNER_END_MARKERS = [
    /^\s*=\[\s*metasploit\s/i,
    /^\+ -- --=\[/,
];

const MSF_VERSION_LINE = /^(?:\s*=\[|\+ -- --=\[)/;
const PARAM_LINE = /^([A-Za-z][A-Za-z0-9_:]+(?:::[A-Za-z0-9_]+)*)\s+=>\s+(.*)$/;
const LOG_LINE = /^\[([*+\-!])\]\s*(?:(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\s[+-]\d{4})\s+)?(.*)$/;
const LOG_LINE_WITH_TARGET = /^\[([*+\-!])\]\s+([\d.]+:\d+)\s+-\s+(.*)$/;
const JOB_LINE = /^\[([*+\-!])\]\s+(.*)$/;

function classifyLogPrefix(prefix: string): LogLevel {
    switch (prefix) {
        case '+': return 'success';
        case '-': return 'error';
        case '!': return 'warning';
        case '*': return 'info';
        default: return 'plain';
    }
}

// ── Parser ──────────────────────────────────────────────────────────────────

export function parseMsfOutput(raw: string): ParsedOutput {
    const clean = stripAnsi(raw);
    const lines = clean.split('\n');

    const result: ParsedOutput = {
        banner: '',
        params: [],
        logLines: [],
        otherLines: [],
        hasBanner: false,
        hasParams: false,
    };

    let inBanner = true;
    let bannerLines: string[] = [];
    let bannerEndFound = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // ── Phase 1: Detect banner region ───────────────────────
        if (inBanner && !bannerEndFound) {
            // Check if we hit the metasploit version header
            if (BANNER_END_MARKERS.some(re => re.test(trimmed))) {
                bannerEndFound = true;
                // Continue accumulating banner lines through the version block
                bannerLines.push(line);
                continue;
            }
            // Still in banner (ASCII art region)
            bannerLines.push(line);
            continue;
        }

        // Still inside the version info block after "=[ metasploit"
        if (inBanner && bannerEndFound) {
            if (MSF_VERSION_LINE.test(trimmed) || trimmed === '' || /^Metasploit\s/i.test(trimmed)) {
                bannerLines.push(line);
                continue;
            }
            // Banner is over
            inBanner = false;
            result.banner = bannerLines.join('\n');
            result.hasBanner = bannerLines.some(l => l.trim().length > 0);
        }

        // ── Phase 2: Parse params (KEY => value) ────────────────
        const paramMatch = trimmed.match(PARAM_LINE);
        if (paramMatch) {
            result.params.push({ key: paramMatch[1], value: paramMatch[2] });
            result.hasParams = true;
            continue;
        }

        // ── Phase 3: Parse log lines ([*], [+], [-], [!]) ───────
        const targetLogMatch = trimmed.match(LOG_LINE_WITH_TARGET);
        if (targetLogMatch) {
            result.logLines.push({
                level: classifyLogPrefix(targetLogMatch[1]),
                timestamp: targetLogMatch[2],
                message: targetLogMatch[3],
                raw: line,
            });
            continue;
        }

        const logMatch = trimmed.match(JOB_LINE);
        if (logMatch) {
            result.logLines.push({
                level: classifyLogPrefix(logMatch[1]),
                message: logMatch[2],
                raw: line,
            });
            continue;
        }

        // ── Phase 4: Other lines ────────────────────────────────
        if (trimmed.length > 0) {
            result.otherLines.push(line);
        }
    }

    // If banner region never closed (no version markers found), treat first lines as banner
    if (inBanner) {
        result.banner = bannerLines.join('\n');
        result.hasBanner = bannerLines.some(l => l.trim().length > 0);
    }

    return result;
}

// ── Param Grouping ──────────────────────────────────────────────────────────

export interface ParamGroup {
    label: string;
    params: MsfParam[];
}

/** Group parameters by their namespace prefix (e.g., SMB::, DCERPC::, Powershell::) */
export function groupParams(params: MsfParam[]): ParamGroup[] {
    const groups: Record<string, MsfParam[]> = {};
    const topLevel: MsfParam[] = [];

    for (const p of params) {
        const nsMatch = p.key.match(/^([A-Za-z]+)::/);
        if (nsMatch) {
            const ns = nsMatch[1];
            if (!groups[ns]) groups[ns] = [];
            groups[ns].push(p);
        } else {
            topLevel.push(p);
        }
    }

    const result: ParamGroup[] = [];
    if (topLevel.length > 0) {
        result.push({ label: 'Module Options', params: topLevel });
    }
    for (const [ns, gp] of Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))) {
        result.push({ label: ns, params: gp });
    }
    return result;
}
