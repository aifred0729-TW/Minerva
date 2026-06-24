// ============================================
// Mimikatz output parsing utilities
// Used by Console MimikatzBlock (live task output) and
// Credentials vault PasteMimikatzDialog (manual paste).
//
// Coverage:
//   sekurlsa::logonpasswords  → all provider sub-blocks (msv/tspkg/
//                               wdigest/kerberos/ssp/credman/cloudap)
//   lsadump::sam              → modern `NTLM :` and legacy `Hash NTLM:`
//   lsadump::secrets          → cur and old sections kept separate
//   lsadump::cache            → splits DOMAIN\user into account+realm
// ============================================
import type { MzExtractedCred } from '../types/console';

export interface MzSection { cmd: string; body: string }

const NTLM_HEX_LEN = 32;
const SHA1_MIN_LEN = 40;

/**
 * True when the value is a space-separated hex byte array (≥ 4 tokens, all
 * exactly two hex digits). Mimikatz emits this form for `* Password :` and
 * `cur/text :` when it cannot decrypt to plaintext (e.g. the bytes are still
 * the encrypted ciphertext / a raw blob), so we must NOT treat it as a
 * recoverable plaintext credential.
 */
const isHexBytesArray = (s: string): boolean =>
    /^(?:[0-9a-fA-F]{2}\s+){3,}[0-9a-fA-F]{2}\s*$/.test(s.trim());

// ─── Section splitting ────────────────────────────────────────────
/** Split raw mimikatz output into per-command sections.
 *  Anchored to start-of-line so command-prompt strings inside a body
 *  (e.g. an error message echoing the prompt) cannot cause false splits.
 *  Accepts all observed prompt variants:
 *      mimikatz #
 *      mimikatz(commandline) #
 *      mimikatz(local) #
 *      mimikatz_x64 #
 */
export const mzSplitSections = (content: string): { header: string; sections: MzSection[]; version: string | null } => {
    // Normalize CRLF so all downstream regexes can rely on \n
    const normalized = content.replace(/\r\n?/g, '\n');
    const split = normalized.split(/^mimikatz(?:\([^)]*\)|_[A-Za-z0-9]+)?\s*#\s*/m);
    const header = split[0];
    const sections: MzSection[] = split.slice(1).map(pt => {
        const nl = pt.indexOf('\n');
        return {
            cmd:  nl >= 0 ? pt.substring(0, nl).trim() : pt.trim(),
            body: nl >= 0 ? pt.substring(nl + 1)       : '',
        };
    });
    const verM = header.match(/mimikatz\s+(\d+\.\d+\.\d+\S*)/);
    return { header, sections, version: verM ? verM[1] : null };
};

// ─── lsadump::sam ─────────────────────────────────────────────────
export const mzParseSam = (body: string) => {
    const users: { rid: string; name: string; ntlm: string; ntlmHist: string[] }[] = [];
    body.split(/(?=^\s*RID\s+:)/m).forEach(block => {
        const rM = block.match(/^\s*RID\s+:\s+\S+\s+\((\d+)\)/m);
        const nM = block.match(/^\s*User\s+:\s+(\S.*?)\s*$/m);
        if (!rM || !nM) return;
        // Modern format: `NTLM : <hash>` on its own line.
        // Legacy format: `Hash NTLM: <hash>`
        const ntlm =
            block.match(/^\s*NTLM\s+:\s*([a-f0-9]{32})\b/im)?.[1] ||
            block.match(/Hash NTLM:\s*([a-f0-9]{32})\b/i)?.[1] ||
            '';
        // Historical hashes: `ntlm- 0: <hash>` or `ntlm- 0  <hash>` (some builds drop the colon)
        const hist = [...block.matchAll(/ntlm-\s*\d+\s*:?\s*([a-f0-9]{32})\b/gi)].map(m => m[1]);
        users.push({ rid: rM[1], name: nM[1].trim(), ntlm, ntlmHist: hist });
    });
    return users;
};

// ─── lsadump::secrets ─────────────────────────────────────────────
export const mzParseSecrets = (body: string) =>
    body.split(/^Secret\s*:/m).slice(1).map(block => {
        const nl = block.indexOf('\n');
        const name = (nl >= 0 ? block.substring(0, nl) : block).trim();

        // Split each Secret block at the `old/...` boundary so cur/* and old/*
        // values cannot bleed into each other. The old section may be absent.
        const oldStart = block.search(/^\s*old\/(?:text|hex)\s*:/m);
        const curBody  = oldStart >= 0 ? block.substring(0, oldStart) : block;
        const oldBody  = oldStart >= 0 ? block.substring(oldStart)    : '';

        const grabText = (s: string) => {
            const v = s.match(/^\s*(?:cur|old)\/text\s*:\s*(.+?)\s*$/m)?.[1];
            // Skip raw hex byte arrays — same reasoning as the password capture above.
            if (!v || isHexBytesArray(v)) return undefined;
            return v;
        };
        const grabNtlm = (s: string) => s.match(/^\s*NTLM\s*:\s*([a-f0-9]{32})\b/im)?.[1];
        const grabSha1 = (s: string) => s.match(/^\s*SHA1\s*:\s*([a-f0-9]{40,})\b/im)?.[1];

        return {
            name,
            curText: grabText(curBody),
            curNtlm: grabNtlm(curBody),
            curSha1: grabSha1(curBody),
            oldText: grabText(oldBody),
            oldNtlm: grabNtlm(oldBody),
            oldSha1: grabSha1(oldBody),
            error:   block.match(/ERROR\s+kuhl[^\n]*/i)?.[0]?.trim(),
        };
    });

// ─── lsadump::cache ───────────────────────────────────────────────
export const mzParseCache = (body: string) =>
    body.split(/(?=^\s*\[NL\$)/m).flatMap(block => {
        const sM = block.match(/^\s*\[(NL\$\d+)\s+-\s+([^\]]+)\]/m);
        const uM = block.match(/^\s*User\s+:\s*([^\n]+)/m);
        const hM = block.match(/MsCacheV2\s*:\s*([a-f0-9]+)\b/i);
        if (!sM || !uM || !hM) return [];
        // User is typically `DOMAIN\username`; split into account + domain.
        const userRaw = uM[1].trim();
        const slashIdx = userRaw.indexOf('\\');
        const account  = slashIdx >= 0 ? userRaw.substring(slashIdx + 1) : userRaw;
        const domain   = slashIdx >= 0 ? userRaw.substring(0, slashIdx)  : '';
        return [{
            slot: sM[1],
            date: sM[2].trim(),
            user: userRaw,   // preserved for display
            account,
            domain,
            hash: hM[1].trim(),
        }];
    });

// ─── sekurlsa::logonpasswords ─────────────────────────────────────
export interface MzLogonProvider {
    provider: string;
    user: string;
    domain: string;
    ntlm?: string;
    sha1?: string;
    plaintext?: string;
}

export interface MzLogonSession {
    /** Top-level User Name on the Authentication Id record */
    sessionUser: string;
    /** Top-level Domain on the Authentication Id record */
    sessionDomain: string;
    /** Session field text e.g. "Interactive from 1" */
    sessionType: string;
    /** Logon Server text */
    logonServer: string;
    /** Per-provider records — each msv/tspkg/wdigest/kerberos/ssp/credman/cloudap
     *  block that yielded at least one of: NTLM, SHA1, plaintext password. */
    providers: MzLogonProvider[];
}

const PROVIDER_HEADER_RE = /^\s+([a-z]+)\s*:\s*$/gm;

const parseProviderBody = (
    provBody: string,
    provider: string,
    defaultUser: string,
    defaultDomain: string,
): MzLogonProvider[] => {
    const records: MzLogonProvider[] = [];
    const lines = provBody.split('\n');
    let curUser   = defaultUser;
    let curDomain = defaultDomain;
    let pNtlm: string | undefined;
    let pSha1: string | undefined;
    let pPlain: string | undefined;
    const flush = () => {
        const hasData = pNtlm || pSha1 || (pPlain && pPlain !== '(null)');
        if (hasData && curUser && curUser !== '(null)') {
            records.push({
                provider,
                user:   curUser,
                domain: (curDomain && curDomain !== '(null)') ? curDomain : '',
                ntlm:   pNtlm,
                sha1:   pSha1,
                plaintext: pPlain && pPlain !== '(null)' ? pPlain : undefined,
            });
        }
        pNtlm = pSha1 = pPlain = undefined;
    };
    for (const line of lines) {
        // A new "* Username" begins a new record within the same provider
        const userM = line.match(/\*\s*Username\s*:\s*(.*)/i);
        if (userM) { flush(); curUser = userM[1].trim(); continue; }
        const domM  = line.match(/\*\s*Domain\s*:\s*(.*)/i);
        if (domM)  { curDomain = domM[1].trim(); continue; }
        const ntM  = line.match(/\*\s*NTLM\s*:\s*([a-f0-9]{32})\b/i);
        if (ntM)   { pNtlm  = ntM[1]; continue; }
        const shM  = line.match(/\*\s*SHA1\s*:\s*([a-f0-9]{40,})\b/i);
        if (shM)   { pSha1  = shM[1]; continue; }
        const pwM  = line.match(/\*\s*Password\s*:\s*(.*)/i);
        if (pwM)   {
            const val = pwM[1].trim();
            // Skip raw hex byte arrays — they are not recoverable plaintext.
            if (val && !isHexBytesArray(val)) pPlain = val;
            continue;
        }
    }
    flush();
    return records;
};

export const mzParseLogon = (body: string): MzLogonSession[] => {
    const sessions = body.split(/^Authentication Id\s*:/m).slice(1);
    const out: MzLogonSession[] = [];
    for (const sess of sessions) {
        const userM   = sess.match(/^User Name\s+:\s*(.+)$/m);
        const domainM = sess.match(/^Domain\s+:\s*(.+)$/m);
        const typeM   = sess.match(/^Session\s+:\s*(.+)$/m);
        const lsM     = sess.match(/^Logon Server\s+:\s*(.+)$/m);
        if (!userM) continue;
        const sessionUser = userM[1].trim();
        if (sessionUser === '(null)') continue;
        const sessionDomain = (domainM?.[1]?.trim() && domainM[1].trim() !== '(null)') ? domainM[1].trim() : '';
        const sessionType   = typeM?.[1]?.trim() || '';
        const logonServer   = lsM?.[1]?.trim() || '';

        // Find every provider sub-block via the "<indent>name :" header pattern,
        // then slice the session text between successive headers.
        const headers: { name: string; start: number; end: number }[] = [];
        PROVIDER_HEADER_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = PROVIDER_HEADER_RE.exec(sess)) !== null) {
            headers.push({ name: m[1], start: m.index, end: PROVIDER_HEADER_RE.lastIndex });
        }
        const providers: MzLogonProvider[] = [];
        for (let i = 0; i < headers.length; i++) {
            const h        = headers[i];
            const nextStart = i + 1 < headers.length ? headers[i + 1].start : sess.length;
            const provBody  = sess.substring(h.end, nextStart);
            providers.push(...parseProviderBody(provBody, h.name, sessionUser, sessionDomain));
        }

        out.push({ sessionUser, sessionDomain, sessionType, logonServer, providers });
    }
    return out;
};

// ─── sekurlsa::ekeys ──────────────────────────────────────────────
//
// Output is a series of "Authentication Id : …" sessions; inside each session
// you may have multiple "* Username / * Domain" blocks each followed by a
// "* Key List :" sub-block of indented "<keyType> <hex>" rows:
//
//     * Username : alice
//     * Domain   : CORP
//     * Password : (null)
//     * Key List :
//       aes256_hmac       0123abcd…
//       aes128_hmac       0123abcd…
//       rc4_hmac_nt       0123abcd…
export interface MzEkeyEntry {
    sessionUser: string;
    sessionDomain: string;
    user: string;
    domain: string;
    keys: { keyType: string; value: string }[];
}

const KEY_LINE_RE = /^\s+(\S+)\s+([0-9a-f]{16,})\s*$/i;

export const mzParseEkeys = (body: string): MzEkeyEntry[] => {
    const sessions = body.split(/^Authentication Id\s*:/m).slice(1);
    const out: MzEkeyEntry[] = [];
    for (const sess of sessions) {
        const sessUserM = sess.match(/^User Name\s+:\s*(.+)$/m);
        const sessDomM  = sess.match(/^Domain\s+:\s*(.+)$/m);
        if (!sessUserM) continue;
        const sessionUser = sessUserM[1].trim();
        if (sessionUser === '(null)') continue;
        const sessionDomain = (sessDomM?.[1]?.trim() && sessDomM[1].trim() !== '(null)') ? sessDomM[1].trim() : '';

        const lines = sess.split('\n');
        let curUser   = sessionUser;
        let curDomain = sessionDomain;
        let inKeyList = false;
        let keys: { keyType: string; value: string }[] = [];
        const flush = () => {
            if (keys.length > 0 && curUser && curUser !== '(null)') {
                out.push({
                    sessionUser, sessionDomain,
                    user:   curUser,
                    domain: (curDomain && curDomain !== '(null)') ? curDomain : sessionDomain,
                    keys,
                });
            }
            keys = [];
        };
        for (const line of lines) {
            const userM = line.match(/\*\s*Username\s*:\s*(.*)/i);
            if (userM) { flush(); curUser = userM[1].trim(); inKeyList = false; continue; }
            const domM = line.match(/\*\s*Domain\s*:\s*(.*)/i);
            if (domM)  { curDomain = domM[1].trim(); continue; }
            if (/^\s*\*\s*Key List\s*:/i.test(line)) { inKeyList = true; continue; }
            if (inKeyList) {
                const keyM = line.match(KEY_LINE_RE);
                if (keyM) { keys.push({ keyType: keyM[1], value: keyM[2] }); continue; }
                // a `* …` line ends the key list (next field of the same record)
                if (/^\s*\*/.test(line)) inKeyList = false;
            }
        }
        flush();
    }
    return out;
};

// ─── vault::cred ───────────────────────────────────────────────────
//
// Splits on "TargetName :" and harvests the (UserName, * Authenticator | Credential)
// triple. Authenticator is used for Web Credentials; Credential is used for
// generic / domain credman entries. The hex-byte-array guard reused below
// silently drops the encrypted form mimikatz emits when /patch fails to
// decrypt.
export interface MzVaultCred {
    target: string;
    resource: string;
    user: string;
    password: string;
}

export const mzParseVaultCreds = (body: string): MzVaultCred[] => {
    const out: MzVaultCred[] = [];
    const blocks = body.split(/^TargetName\s*:/m).slice(1);
    for (const blk of blocks) {
        const targetLine = (blk.split('\n')[0] || '').trim();
        // Prefer the canonical `target=…` resource embedded in TargetName.
        // Stop at " - " (mimikatz's own separator between two halves of the
        // TargetName) instead of any "-", so URLs with dashes survive intact.
        const resourceM = targetLine.match(/target=(\S+?)(?:\s+-\s+|$)/i);
        const resource  = resourceM
            ? resourceM[1]
            : (targetLine.split(/\s+-\s+/)[0]?.trim() || targetLine);

        // The actual user can show up under several labels depending on the
        // vault subtype: "UserName" (credman), "User Name" with a space (some
        // Mimikatz forks), or "* Identity" (Web Credentials when UserName is
        // blank). Try them in order.
        const tryMatch = (re: RegExp): string => {
            const m = blk.match(re);
            const v = m?.[1]?.trim() ?? '';
            return (v && v !== '(null)') ? v : '';
        };
        const user =
            tryMatch(/^\s*User\s*Name\s*:\s*(.+)$/im) ||
            tryMatch(/^\s*\*\s*Identity\s*:\s*(.+)$/im) ||
            tryMatch(/^\s*User\s*:\s*(.+)$/im);
        if (!user) continue;

        // Web Credentials use `* Authenticator :`; credman uses `Credential :`.
        const password =
            tryMatch(/^\s*\*\s*Authenticator\s*:\s*(.+)$/im) ||
            tryMatch(/^\s*Credential\s*:\s*(.+)$/im);
        if (!password) continue;
        if (isHexBytesArray(password)) continue;

        out.push({ target: targetLine, resource, user, password });
    }
    return out;
};

// ─── lsadump::dcsync ──────────────────────────────────────────────
//
// dcsync /user:<user> output structure:
//
//     [DC] 'CORP.LOCAL' will be the domain
//     [DC] 'DC01.CORP.LOCAL' will be the DC server
//     [DC] 'CORP\\Administrator' will be the user account
//
//     Object RDN           : Administrator
//     ** SAM ACCOUNT **
//     SAM Username         : Administrator
//     Object Security ID   : S-1-5-21-…
//     Object Relative ID   : 500
//     ...
//     Credentials:
//       Hash NTLM: <32 hex>
//         ntlm- 0: <32 hex>
//         ntlm- 1: <32 hex>
//         lm  - 0: <32 hex>
//
//     Supplemental Credentials:
//     * Primary:Kerberos-Newer-Keys *
//         Default Salt : CORP.LOCALAdministrator
//         Default Iterations : 4096
//         Credentials
//           aes256_hmac       (4096) : <hex>
//           aes128_hmac       (4096) : <hex>
//           des_cbc_md5       (4096) : <hex>
//         OldCredentials
//           aes256_hmac       (4096) : <hex>
//           …
//
// A single dcsync invocation usually targets one user, but multi-user
// outputs concatenated together split cleanly on "Object RDN".
export interface MzDCSyncEntry {
    user: string;
    domain: string;
    sid?: string;
    rid?: string;
    ntlm: string;
    ntlmHistory: string[];
    lmHistory:   string[];
    kerberosKeys: { keyType: string; value: string; old?: boolean }[];
}

const DCSYNC_KEY_RE =
    /^\s+(aes\d+_hmac|des_cbc_md5|des_cbc_crc|rc4_hmac_nt|rc4_md4)(?:\s*\([^)]+\))?\s*:\s*([0-9a-f]+)\s*$/igm;

/**
 * Match a `dcsync /all /csv` row.
 * Format: `<RID>\t<username>\t<NT hash>[:<LM hash>]\t<UAC flags>`
 *  - RID is decimal, typically 500+
 *  - username may contain backslashes (DOMAIN\user) but no whitespace
 *  - hash field is 32 hex chars, optionally followed by `:` + 32 more hex
 *    chars for the legacy LM half
 *  - UAC trailing field is decimal; mimikatz appends it but some builds
 *    omit it on rows for disabled accounts, so we allow it to be absent
 *
 * The line anchor is intentional — mimikatz can sandwich CSV rows between
 * the same `[DC] '…' will be …` preamble that the verbose path emits, so we
 * have to require a real BOL match instead of letting a partial regex
 * collide with a stray hex string in the header.
 */
const DCSYNC_CSV_ROW_RE =
    /^(\d{2,10})\t([^\t\r\n]+)\t([0-9a-fA-F]{32})(?::([0-9a-fA-F]{32}))?(?:\t(\d+))?\s*$/gm;

/** CSV variant of dcsync output (`lsadump::dcsync /all /csv` and friends).
 *  No `Object RDN` markers, no Kerberos keys, no SIDs — just RID + user +
 *  NTLM hash per row. We surface them as MzDCSyncEntry so the downstream
 *  credential extractor handles them with zero special-casing. */
const mzParseDCSyncCsv = (body: string, domainHint: string): MzDCSyncEntry[] => {
    DCSYNC_CSV_ROW_RE.lastIndex = 0;
    const out: MzDCSyncEntry[] = [];
    let m: RegExpExecArray | null;
    while ((m = DCSYNC_CSV_ROW_RE.exec(body)) !== null) {
        const [, rid, rawUser, nt, /*lm*/, /*uac*/] = m;
        // Skip the all-zero "no NT hash set" sentinel rows that
        // mimikatz emits for disabled / passwordless accounts.
        if (/^0+$/.test(nt)) continue;
        // DOMAIN\user format is common in CSV mode; split it so the
        // credential extractor's per-realm grouping still works. If no
        // backslash, fall back to the domain-from-header hint.
        let user = rawUser.trim();
        let domain = domainHint;
        const slash = user.indexOf('\\');
        if (slash >= 0) {
            domain = user.substring(0, slash) || domain;
            user = user.substring(slash + 1);
        }
        out.push({
            user, domain, rid,
            ntlm: nt.toLowerCase(),
            ntlmHistory: [],
            lmHistory:   [],
            kerberosKeys: [],
        });
    }
    return out;
};

export const mzParseDCSync = (body: string): MzDCSyncEntry[] => {
    // Domain is announced once at the top in the `[DC] '…' will be the domain` line.
    const domain = body.match(/^\s*\[DC\]\s+'([^']+)'\s+will\s+be\s+the\s+domain/m)?.[1]?.trim() || '';
    // /all /csv mode emits tab-separated rows without the verbose Object
    // RDN block. Detect that variant up front — much cheaper than walking
    // the verbose splitter only to find empty results. The check is
    // anchored to BOL so we don't trip on hex bytes inside another block.
    if (!/^\s*Object RDN\s*:/m.test(body) && /^\d{2,10}\t/m.test(body)) {
        return mzParseDCSyncCsv(body, domain);
    }
    // Each user record starts at "Object RDN :"; the chunk before the first
    // RDN is the [DC] header and is discarded by .slice(1).
    const blocks = body.split(/(?=^\s*Object RDN\s*:)/m);
    const out: MzDCSyncEntry[] = [];
    for (const blk of blocks) {
        if (!/^\s*Object RDN\s*:/m.test(blk)) continue;
        // Prefer SAM Username; fall back to Object RDN.
        const user =
            blk.match(/^\s*SAM Username\s*:\s*(.+)$/m)?.[1]?.trim() ||
            blk.match(/^\s*Object RDN\s*:\s*(.+)$/m)?.[1]?.trim() ||
            '';
        if (!user) continue;
        const sid = blk.match(/^\s*Object Security ID\s*:\s*(\S+)/m)?.[1];
        const rid = blk.match(/^\s*Object Relative ID\s*:\s*(\d+)/m)?.[1];

        // Current NTLM
        const ntlm = blk.match(/^\s*Hash NTLM\s*:\s*([a-f0-9]{32})\b/im)?.[1] ?? '';
        // Historical NTLM / LM (mimikatz emits "ntlm- 0:" and "lm  - 0:" with variable spacing)
        const ntlmHistory = [...blk.matchAll(/^\s*ntlm\s*-\s*\d+\s*:\s*([a-f0-9]{32})\b/gim)].map(m => m[1]);
        const lmHistory   = [...blk.matchAll(/^\s*lm\s*-\s*\d+\s*:\s*([a-f0-9]{32})\b/gim)].map(m => m[1]);

        // Kerberos-Newer-Keys block: split into Credentials (current) and
        // OldCredentials (rotated). The block ends at the next "* Primary:" or
        // "* Packages *" header.
        const kerbStart = blk.search(/^\*\s*Primary:Kerberos-Newer-Keys\s*\*/m);
        const kerberosKeys: { keyType: string; value: string; old?: boolean }[] = [];
        if (kerbStart >= 0) {
            const after = blk.substring(kerbStart);
            const nextSection = after.search(/^\*\s+(?:Primary:|Packages)/m);
            const kerbBody = nextSection > 0
                ? after.substring(after.indexOf('\n') + 1, nextSection)
                : after.substring(after.indexOf('\n') + 1);
            const oldIdx = kerbBody.search(/^\s*OldCredentials\s*$/m);
            const curBody = oldIdx >= 0 ? kerbBody.substring(0, oldIdx) : kerbBody;
            const oldBody = oldIdx >= 0 ? kerbBody.substring(oldIdx)    : '';
            DCSYNC_KEY_RE.lastIndex = 0;
            for (const m of curBody.matchAll(DCSYNC_KEY_RE)) {
                kerberosKeys.push({ keyType: m[1], value: m[2] });
            }
            DCSYNC_KEY_RE.lastIndex = 0;
            for (const m of oldBody.matchAll(DCSYNC_KEY_RE)) {
                kerberosKeys.push({ keyType: m[1], value: m[2], old: true });
            }
        }

        out.push({ user, domain, sid, rid, ntlm, ntlmHistory, lmHistory, kerberosKeys });
    }
    return out;
};

// ─── Helpers ──────────────────────────────────────────────────────
export const mzIsSensitiveSecret = (n: string) =>
    !n.startsWith('$MACHINE') && !n.startsWith('DPAPI') && !n.startsWith('NL$') && !n.includes('TELEMETRY');

// ─── Credential extraction (used by Credentials vault) ────────────
export const mzExtractAllCreds = (sections: MzSection[]): MzExtractedCred[] => {
    const out: MzExtractedCred[] = [];
    const seen = new Set<string>();
    const push = (c: MzExtractedCred) => {
        // Deduplicate identical (account, realm, credential, type) pairs
        // even if they came from multiple providers/sessions.
        const key = `${c.account}\x00${c.realm}\x00${c.credential}\x00${c.credType}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(c);
    };

    sections.forEach(sec => {
        // Some mimikatz commands are invoked with flags (`vault::cred /patch`,
        // `lsadump::sam /system:hive`, `sekurlsa::logonpasswords full`) — match
        // on the command base so flag variants still dispatch.
        const baseCmd = sec.cmd.split(/\s+/)[0];
        if (baseCmd === 'lsadump::sam') {
            const domain = sec.body.match(/^Domain\s+:\s*([^\n]+)/m)?.[1]?.trim() || '';
            mzParseSam(sec.body).forEach(u => {
                if (u.ntlm) push({ account: u.name, realm: domain, credential: u.ntlm, credType: 'hash', source: 'lsadump::sam' });
            });
        } else if (baseCmd === 'sekurlsa::logonpasswords') {
            mzParseLogon(sec.body).forEach(s => {
                s.providers.forEach(p => {
                    const account = p.user || s.sessionUser;
                    const realm   = p.domain || s.sessionDomain || '';
                    const tag     = `sekurlsa::logonpasswords (${p.provider})`;
                    if (p.ntlm)      push({ account, realm, credential: p.ntlm,      credType: 'hash',      source: tag });
                    if (p.plaintext) push({ account, realm, credential: p.plaintext, credType: 'plaintext', source: tag });
                });
            });
        } else if (baseCmd === 'lsadump::secrets') {
            const domain = sec.body.match(/^Domain\s+:\s*([^\n]+)/m)?.[1]?.trim() || '';
            mzParseSecrets(sec.body).forEach(s => {
                if (s.curNtlm)                                push({ account: s.name, realm: domain, credential: s.curNtlm, credType: 'hash',      source: 'lsadump::secrets' });
                if (s.curText && mzIsSensitiveSecret(s.name)) push({ account: s.name, realm: domain, credential: s.curText, credType: 'plaintext', source: 'lsadump::secrets' });
            });
        } else if (baseCmd === 'lsadump::cache') {
            const domain = sec.body.match(/^Domain\s+:\s*([^\n]+)/m)?.[1]?.trim() || '';
            mzParseCache(sec.body).forEach(c => {
                push({ account: c.account, realm: c.domain || domain, credential: c.hash, credType: 'hash', source: 'lsadump::cache (MsCacheV2)' });
            });
        } else if (baseCmd === 'sekurlsa::ekeys') {
            mzParseEkeys(sec.body).forEach(e => {
                e.keys.forEach(k => {
                    // rc4_hmac_nt and rc4_md4 are literally the NTLM hash
                    // (RC4 key in Kerberos = NT-Password MD4 = NTLM). Classify
                    // them as 'hash' so they dedupe against the same NTLM
                    // pulled from lsadump::sam / sekurlsa::logonpasswords;
                    // everything else (aes128/256_hmac, rc4_hmac_old, *_exp,
                    // des_cbc_*, …) is a Kerberos key proper.
                    const lcType = k.keyType.toLowerCase();
                    const credType: MzExtractedCred['credType'] =
                        (lcType === 'rc4_hmac_nt' || lcType === 'rc4_md4') ? 'hash' : 'key';
                    push({
                        account: e.user,
                        realm:   e.domain,
                        credential: k.value,
                        credType,
                        source: `sekurlsa::ekeys (${k.keyType})`,
                    });
                });
            });
        } else if (baseCmd === 'vault::cred') {
            mzParseVaultCreds(sec.body).forEach(v => {
                push({
                    account: v.user,
                    realm:   v.resource,
                    credential: v.password,
                    credType:   'plaintext',
                    source: 'vault::cred',
                });
            });
        } else if (baseCmd === 'lsadump::dcsync') {
            mzParseDCSync(sec.body).forEach(e => {
                if (e.ntlm) push({
                    account: e.user,
                    realm:   e.domain,
                    credential: e.ntlm,
                    credType:   'hash',
                    source: 'lsadump::dcsync (NTLM)',
                });
                // Skip ntlm-0 if it equals the current NTLM (mimikatz repeats it).
                e.ntlmHistory.forEach((h, i) => {
                    if (h === e.ntlm) return;
                    push({
                        account: e.user,
                        realm:   e.domain,
                        credential: h,
                        credType:   'hash',
                        source: `lsadump::dcsync (NTLM history ${i})`,
                    });
                });
                e.lmHistory.forEach((h, i) => push({
                    account: e.user,
                    realm:   e.domain,
                    credential: h,
                    credType:   'hash',
                    source: `lsadump::dcsync (LM history ${i})`,
                }));
                e.kerberosKeys.forEach(k => {
                    // Same hash-vs-key logic as sekurlsa::ekeys: rc4_hmac_nt /
                    // rc4_md4 are the NTLM hash, everything else is a true key.
                    const lcType = k.keyType.toLowerCase();
                    const credType: MzExtractedCred['credType'] =
                        (lcType === 'rc4_hmac_nt' || lcType === 'rc4_md4') ? 'hash' : 'key';
                    push({
                        account: e.user,
                        realm:   e.domain,
                        credential: k.value,
                        credType,
                        source: `lsadump::dcsync (${k.keyType}${k.old ? ' OLD' : ''})`,
                    });
                });
            });
        }
        // token::elevate emits no harvestable credentials (privilege op only) —
        // recognised here so the dispatcher doesn't fall through with a warning.
    });
    return out;
};
