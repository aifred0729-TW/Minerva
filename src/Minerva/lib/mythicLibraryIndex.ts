/**
 * Mythic file-library index.
 *
 * Keeps a `filename → agent_file_id` map of everything in Mythic's file
 * manager so the MSF session console can resolve bare-name `upload`
 * commands without forcing the operator to copy/paste UUIDs.
 *
 * Population strategy: a single component (`MythicLibraryIndexRefresher`)
 * mounted at the app shell polls `GET_UPLOADED_FILES` every
 * REFRESH_INTERVAL_MS and feeds the result into a module-level Map. The
 * synchronous `getMythicLibraryEntry(name)` helper is then safe to call
 * from anywhere — including the MSF command preprocessor that runs every
 * time the operator hits Enter.
 *
 * Storage layout in the MSF container:
 *   /mythic_files/<agent_file_id>   (bind-mount of /opt/Mythic/mythic-docker/src/files,
 *                                    see docker-compose.metasploit.yml)
 */
import React from 'react';
import { useQuery, useReactiveVar } from '@apollo/client/react';
import type { ApolloClient } from '@apollo/client';
// Leaf module, not the `lib/api` barrel — App.tsx mounts
// MythicLibraryIndexRefresher eagerly, and the barrel re-exports all 28 api
// modules, so these two documents pulled every gql document in the app into
// the entry bundle and made the browser parse all 423 of them at startup.
import { GET_UPLOADED_FILES, GET_BUILT_PAYLOADS } from './api/files';
import { b64DecodeUnicode } from './utils';
import { meState } from './state';
import { listLocalPayloads, suggestFilename, type MsfPayloadRecord } from './msfPayloads';

export interface MythicLibraryEntry {
    uuid: string;
    name: string;
    size?: number;
    /** Where the entry came from in Mythic — uploaded file vs built payload
     *  vs MSF-wizard payload that's been published to filemeta. */
    kind: 'upload' | 'payload' | 'msf';
}

let indexByName = new Map<string, MythicLibraryEntry>();

/** Synchronous lookup — name is matched case-insensitively. */
export function getMythicLibraryEntry(name: string): MythicLibraryEntry | null {
    if (!name) return null;
    return indexByName.get(name.toLowerCase()) ?? null;
}

/** All known filenames in the index. Used by the console upload error path
 *  to surface "did you mean …" suggestions instead of a blank "not found". */
export function listMythicLibraryNames(): string[] {
    return Array.from(indexByName.values()).map(e => e.name);
}

/** "Best single match" — returns the one library entry that's unambiguously
 *  the intended file, or null if the choice is ambiguous / no close match
 *  exists. Used by the console upload path to silently fix obvious typos
 *  (e.g. `DMZ-zone.exe` when the actual payload is `DEV-zone.exe`) without
 *  forcing the operator to retype. Decision rule:
 *
 *    1. Exact case-insensitive hit → return it.
 *    2. Exactly one entry within Levenshtein distance 2 → return it.
 *    3. Otherwise → null (the caller should surface a suggestion error).
 *
 *  We deliberately don't auto-substitute on prefix / contains matches
 *  because those are too permissive ("BIND" matches half a dozen names);
 *  the 2-distance ceiling keeps it to genuine typos. Unpublished MSF
 *  names are excluded — they're not actually uploadable yet, so picking
 *  one of them would fail downstream. */
export function bestSingleLibraryMatch(query: string): MythicLibraryEntry | null {
    if (!query) return null;
    const q = query.toLowerCase();
    const exact = indexByName.get(q);
    if (exact) return exact;
    let candidate: MythicLibraryEntry | null = null;
    let ambiguous = false;
    for (const entry of indexByName.values()) {
        const d = levenshtein(entry.name.toLowerCase(), q);
        if (d <= 2) {
            if (candidate) { ambiguous = true; break; }
            candidate = entry;
        }
    }
    return ambiguous ? null : candidate;
}

/** Cheap fuzzy-match: prefix/contains/Levenshtein-≤3 against the index AND
 *  the list of MSF-wizard payloads that haven't been published yet. The
 *  unpublished ones are tagged with " (needs Publish)" so the operator knows
 *  to click the link button on the Payloads row before retrying. Returns up
 *  to `limit` suggestions sorted by relevance. */
export function suggestMythicLibraryNames(query: string, limit = 5): string[] {
    if (!query) return [];
    const q = query.toLowerCase();
    type Hit = { name: string; score: number; pending?: boolean };
    const hits: Hit[] = [];
    const score = (name: string): number | null => {
        const lc = name.toLowerCase();
        if (lc === q) return 0;
        if (lc.startsWith(q) || q.startsWith(lc)) return 1;
        if (lc.includes(q) || q.includes(lc))     return 2;
        const d = levenshtein(lc, q);
        return d <= 3 ? 3 + d : null;
    };
    for (const name of listMythicLibraryNames()) {
        const s = score(name);
        if (s != null) hits.push({ name, score: s });
    }
    for (const name of unpublishedMsfNames) {
        const s = score(name);
        if (s != null) hits.push({ name, score: s, pending: true });
    }
    hits.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
    return hits.slice(0, limit).map(h =>
        h.pending ? `${h.name} (MSF, needs Publish)` : h.name,
    );
}

function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const dp = new Array(b.length + 1).fill(0).map((_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = dp[0]; dp[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = dp[j];
            dp[j] = a[i - 1] === b[j - 1]
                ? prev
                : 1 + Math.min(prev, dp[j], dp[j - 1]);
            prev = tmp;
        }
    }
    return dp[b.length];
}

/** Rebuild the in-memory index from the two GraphQL result shapes plus the
 *  per-operation MSF wizard payloads cached in localStorage. */
function ingestLibraryRows(
    filesRows: any[],
    payloadRows: any[],
    msfRecords: MsfPayloadRecord[] = [],
): void {
    const next = new Map<string, MythicLibraryEntry>();

    // filesRows is ordered newest-first (order_by: {id: desc}); with the
    // task_id filter gone, the same filename can legitimately appear many
    // times (re-uploaded for different hosts). Keep the first (= newest)
    // hit per name so `upload <name>` resolves to the latest copy instead
    // of whichever row happens to be processed last.
    for (const f of filesRows) {
        try {
            const name = b64DecodeUnicode(f.filename_text);
            if (!name) continue;
            const key = name.toLowerCase();
            if (next.has(key)) continue;
            next.set(key, {
                uuid: f.agent_file_id,
                name,
                size: f.size,
                kind: 'upload',
            });
        } catch { /* skip malformed row */ }
    }

    // Built payloads. Uploaded files win on name collision — the operator
    // who explicitly uploaded a file with the same name as a payload almost
    // certainly meant that copy.
    for (const p of payloadRows) {
        try {
            const fm = p?.filemetum;
            if (!fm?.agent_file_id || !fm?.filename_text) continue;
            const name = b64DecodeUnicode(fm.filename_text);
            if (!name) continue;
            const key = name.toLowerCase();
            if (next.has(key)) continue;
            next.set(key, {
                uuid: fm.agent_file_id,
                name,
                size: fm.size,
                kind: 'payload',
            });
        } catch { /* skip malformed row */ }
    }

    // MSF-wizard payloads: only the ones the operator has already published
    // (via "Copy public download link" in the Payloads row) have a real
    // Mythic agent_file_id. The unpublished ones aren't yet uploadable from
    // the console — surface them anyway so the error message can hint
    // "did you mean <name>? Click 'Publish' on the Payloads row first."
    for (const r of msfRecords) {
        try {
            const name = suggestFilename(r);
            if (!name) continue;
            const key = name.toLowerCase();
            if (next.has(key)) continue;
            if (r.uploadedFileId) {
                next.set(key, {
                    uuid: r.uploadedFileId,
                    name,
                    size: r.size,
                    kind: 'msf',
                });
            }
            // Note: we intentionally don't insert a "pending" entry when
            // uploadedFileId is missing — getMythicLibraryEntry must always
            // return something the upload path can dispatch on. Suggesting
            // unpublished MSF names is handled by suggestMythicLibraryNames
            // reading from listLocalPayloads directly (see below).
        } catch { /* skip */ }
    }

    indexByName = next;
}

/** Names of MSF-wizard payloads that haven't been published to filemeta yet.
 *  Used by the console upload error path so the operator who types `upload
 *  ws06.exe` and hasn't pushed Publish yet sees a useful hint instead of
 *  "not found". */
let unpublishedMsfNames: string[] = [];

/** Background component — mount once at the app shell to keep the index fresh.
 *  Pulls both uploaded files (`filemeta`) and built payloads (each payload's
 *  `filemetum`) since both live at /files/<agent_file_id> on disk and are
 *  therefore both reachable through the /mythic_files bind-mount inside MSF.
 *  Poll cadence kept tight (10s) so a payload built moments before the
 *  operator types `upload <name>` doesn't slip through the rewriter. */
export function MythicLibraryIndexRefresher() {
    const me = useReactiveVar(meState);
    const opId = me?.user?.current_operation_id ?? 0;
    const { data: filesData } = useQuery<any>(GET_UPLOADED_FILES, {
        fetchPolicy: 'cache-and-network',
        pollInterval: 10_000,
    });
    const { data: payloadsData } = useQuery<any>(GET_BUILT_PAYLOADS, {
        fetchPolicy: 'cache-and-network',
        pollInterval: 10_000,
    });

    React.useEffect(() => {
        // MSF-wizard payloads are per-operation in localStorage. Pull them
        // alongside the GraphQL queries so a payload generated through the
        // Minerva MSF flow is also findable by name from the console.
        const msfRecords = opId ? listLocalPayloads(opId) : [];
        ingestLibraryRows(filesData?.filemeta || [], payloadsData?.payload || [], msfRecords);
        // Cache the names of MSF payloads that haven't been published yet so
        // the error-path suggestion list can surface them with a "needs
        // Publish" hint.
        unpublishedMsfNames = msfRecords
            .filter(r => !r.uploadedFileId)
            .map(r => suggestFilename(r));
    }, [filesData, payloadsData, opId]);

    return null;
}

/** Returns the bare filename if the line is `upload <bare-name> [...]`, with
 *  none of the destination-path detection clauses tripping. Shared between
 *  the meterpreter rewriter, the Apollo Mythic-console rewriter, and the
 *  just-in-time refetch trigger so all three agree on what "bare upload"
 *  means. Quoted bare names (`upload "fscan.exe"`) are also accepted. */
export function detectBareUploadName(line: string): string | null {
    if (!line) return null;
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed[0] === '{') return null;
    const re = /("[^"]*"|\S+)/g;
    const parts: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(trimmed)) !== null) parts.push(m[1]);
    if (parts.length < 2 || parts[0].toLowerCase() !== 'upload') return null;
    const stripQuotes = (s: string) =>
        s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
    const src = stripQuotes(parts[1]);
    if (src.startsWith('/') ||
        /^[A-Za-z]:[\\/]/.test(src) ||
        src.startsWith('\\\\') ||
        src.includes('/') ||
        src.includes('\\')) {
        return null;
    }
    return src;
}

/**
 * Rewrite a Mythic-console `upload <bare-name> [dest]` line into the JSON
 * form Apollo / Poseidon-style commands expect:
 *   `upload {"<FileCliName>":"<uuid>","<PathCliName>":"<dest>"}`
 *
 * Without this rewrite, `upload fscan.exe` ends up filling the File-type
 * parameter with the literal string `"fscan.exe"`, which then trips Apollo's
 * `create_go_tasking` when it forwards the bogus value to
 * `SendMythicRPCFileSearch(AgentFileID=...)` — surfacing as the cryptic
 * "reject_bytes is on" Python error on the backend.
 *
 * Args:
 *   fileCliName  — cli_name of the File-type parameter, e.g. "File" for Apollo.
 *   pathCliName  — cli_name of the optional remote-path parameter, or null
 *                  if the command has none.
 *
 * Returns the rewritten line, or the original line untouched if the input
 * doesn't match the bare-upload shape or the name isn't in the library.
 */
export function resolveMythicConsoleUpload(
    line: string,
    fileCliName: string,
    pathCliName: string | null,
): string {
    const bareName = detectBareUploadName(line);
    if (!bareName) return line;
    const entry = getMythicLibraryEntry(bareName);
    if (!entry) return line;

    const re = /("[^"]*"|\S+)/g;
    const parts: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(line.trim())) !== null) parts.push(m[1]);
    const stripQuotes = (s: string) =>
        s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;

    const args: Record<string, string> = { [fileCliName]: entry.uuid };
    if (parts.length >= 3 && pathCliName) {
        let dest = parts.slice(2).join(' ');
        dest = stripQuotes(dest);
        // Trailing separator means the operator passed a folder — land the
        // file under that folder with its original filename (matches the
        // meterpreter rewriter's behavior).
        if (dest.endsWith('/') || dest.endsWith('\\')) {
            const sep = dest.endsWith('\\') ? '\\' : '/';
            dest = `${dest.slice(0, -1)}${sep}${entry.name}`;
        }
        args[pathCliName] = dest;
    }
    return `upload ${JSON.stringify(args)}`;
}

/** Force-refresh the library index from the network and update the in-memory
 *  map before returning. Used as a just-in-time fallback when the operator
 *  types `upload <name>` and the cached index doesn't yet know about <name>
 *  — typically because the payload was built moments ago. Failures are
 *  swallowed (best-effort): the synchronous rewriter will then just leave
 *  the line untouched and meterpreter will fail with its usual stat error,
 *  which is no worse than the pre-fallback behavior. */
export async function refreshMythicLibraryIndex(
    client: ApolloClient,
): Promise<void> {
    try {
        const [filesRes, payloadsRes] = await Promise.all([
            client.query<any>({ query: GET_UPLOADED_FILES, fetchPolicy: 'network-only' }),
            client.query<any>({ query: GET_BUILT_PAYLOADS, fetchPolicy: 'network-only' }),
        ]);
        const opId = meState()?.user?.current_operation_id ?? 0;
        const msfRecords = opId ? listLocalPayloads(opId) : [];
        ingestLibraryRows(
            filesRes?.data?.filemeta || [],
            payloadsRes?.data?.payload || [],
            msfRecords,
        );
        unpublishedMsfNames = msfRecords
            .filter(r => !r.uploadedFileId)
            .map(r => suggestFilename(r));
    } catch { /* best-effort — leave the existing index in place */ }
}

/**
 * Rewrite an `upload <src> [dest]` command so that, when `<src>` is a bare
 * filename (no path separators, no drive letter, not already a server path)
 * that matches a Mythic library entry, the source becomes
 * `/mythic_files/<uuid>` and the destination falls back to the original
 * filename. Anything that doesn't pattern-match is returned verbatim.
 *
 * Examples:
 *   `upload chisel.exe`                       → `upload /mythic_files/<uuid> chisel.exe`
 *   `upload "chisel.exe" C:\Users\victim\`    → `upload /mythic_files/<uuid> "C:\Users\victim\chisel.exe"`
 *   `upload /tmp/foo /target/foo`             → unchanged (absolute server path)
 *   `upload chisel.exe` (unknown file)        → unchanged (no library entry)
 */
export function resolveMythicLibraryUpload(line: string): string {
    if (!line) return line;
    const trimmed = line.trim();
    // Tokenise so we respect existing quoting.
    const re = /("[^"]*"|\S+)/g;
    const parts: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(trimmed)) !== null) parts.push(m[1]);
    if (parts.length < 2) return line;
    if (parts[0].toLowerCase() !== 'upload') return line;

    const stripQuotes = (s: string) =>
        s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;

    const srcBare = stripQuotes(parts[1]);
    // Already a path — leave alone (POSIX absolute, Windows absolute, UNC,
    // or anything containing a separator).
    if (srcBare.startsWith('/') ||
        /^[A-Za-z]:[\\/]/.test(srcBare) ||
        srcBare.startsWith('\\\\') ||
        srcBare.includes('/') ||
        srcBare.includes('\\')) {
        return line;
    }
    const entry = getMythicLibraryEntry(srcBare);
    if (!entry) return line;

    const newSrc = `/mythic_files/${entry.uuid}`;
    let dest: string;
    if (parts.length >= 3) {
        dest = parts.slice(2).join(' ');
        const destBare = stripQuotes(dest);
        // If the operator gave a folder (trailing separator), append the
        // original filename so meterpreter lands the file with its real
        // name instead of the UUID basename.
        if (destBare.endsWith('/') || destBare.endsWith('\\')) {
            const sep = destBare.endsWith('\\') ? '\\' : '/';
            dest = `${destBare.slice(0, -1)}${sep}${entry.name}`;
        } else {
            dest = destBare;
        }
    } else {
        // No destination given — default to the original filename in the
        // session's current working directory (meterpreter resolves it
        // relative to its cwd).
        dest = entry.name;
    }

    return `upload ${newSrc} ${dest}`;
}
