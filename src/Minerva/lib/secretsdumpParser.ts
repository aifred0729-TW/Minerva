// ============================================
// secretsdump.py (Impacket) output parsing utilities
// Used by the Credentials vault paste-import flow alongside the
// mimikatz parser. Produces the same MzExtractedCred shape so the
// dialog's preview / save path needs zero special-casing.
//
// Coverage (everything the tool emits EXCEPT raw hex-byte dumps):
//   • local SAM hashes           uid:rid:lmhash:nthash:::
//   • NTDS.DIT / DRSUAPI hashes   domain\user:rid:lm:nt:::
//   • cached domain logons (DCC2) DOMAIN/user:$DCC2$...#user#hash: (date)
//   • LSA Secrets $MACHINE.ACC    NTLM hash + Kerberos keys (+ _history)
//   • Kerberos keys grabbed       user:<enctype>:<hex>
//   • DefaultPassword             domain\user:<plaintext>
//   • DPAPI_SYSTEM / NL$KM / gMSA single-line consolidated secrets
//
// Deliberately skipped (the "hex bytes" the operator asked us to ignore):
//   • the ` 0000  07 E9 F2 …  ...?.IF` hexdump grid rows
//   • `plain_password_hex:<blob>` machine-account password blobs
// ============================================
import type { MzExtractedCred } from '../types/console';

/** Empty-password LM half that secretsdump emits for every account on a
 *  modern host (`aad3b435…`). Never a real credential, so it's dropped. */
const EMPTY_LM = 'aad3b435b51404eeaad3b435b51404ee';

// A hexdump grid row, e.g. " 0000   07 E9 F2 3F 08 49 …   ...?.IF". These are
// the only "hex bytes" we intentionally discard.
const BYTE_GRID_RE = /^\s*[0-9A-Fa-f]{4}\s+(?:[0-9A-Fa-f]{2}\s+){2,}[0-9A-Fa-f]{2}\b/;

// user[:rid]:lmhash:nthash:::  (SAM, NTDS, and the $MACHINE.ACC NTLM line,
// which omits the RID). The RID group is optional to cover all three.
const NTLM_ROW_RE = /^(.+?):(?:(\d+):)?([0-9a-fA-F]{32}):([0-9a-fA-F]{32}):::\s*$/;

// user:<enctype>:<hex>  Kerberos key rows (LSA $MACHINE.ACC + "keys grabbed").
const KERB_ROW_RE =
    /^(.+?):(aes256-cts-hmac-sha1-96|aes128-cts-hmac-sha1-96|des-cbc-md5|des-cbc-crc|rc4_hmac(?:_nt)?|rc4_md4):([0-9a-fA-F]{16,})\s*$/;

// DOMAIN/user:$DCC2$<iter>#<user>#<hash>[: (timestamp)]
const DCC2_ROW_RE = /^(.+?):(\$DCC2\$\d+#[^#\r\n]*#[0-9a-fA-F]{32})(?::\s*\(.*\))?\s*$/;

// dpapi_machinekey:0x… / dpapi_userkey:0x…
const DPAPI_ROW_RE = /^(dpapi_(?:machine|user)key):0x([0-9a-fA-F]+)\s*$/;

// Consolidated single-line cache key:  NL$KM:<hex>  /  NL$KM_history:<hex>
const NLKM_ROW_RE = /^(NL\$KM(?:_history)?):([0-9a-fA-F]+)\s*$/;

// gMSA managed-password blob, consolidated:  _SC_GMSA…{guid}…:<hex>
const GMSA_ROW_RE = /^(_SC_GMSA\S+):([0-9a-fA-F]+)\s*$/;

// `[*] <header>` progress/section marker.
const SECTION_RE = /^\s*\[\*\]\s*(.+?)\s*$/;

type Section =
    | 'SAM' | 'CACHE' | 'LSA' | 'MACHINE' | 'MACHINE_HIST'
    | 'DEFAULTPW' | 'DPAPI' | 'NLKM' | 'GMSA' | 'NTDS' | 'KERB' | 'OTHER';

const sectionFromHeader = (h: string): Section => {
    if (/Dumping local SAM/i.test(h))                  return 'SAM';
    if (/cached domain logon/i.test(h))                return 'CACHE';
    if (/\$MACHINE\.ACC_history/i.test(h))             return 'MACHINE_HIST';
    if (/\$MACHINE\.ACC/i.test(h))                     return 'MACHINE';
    if (/DefaultPassword/i.test(h))                    return 'DEFAULTPW';
    if (/DPAPI_SYSTEM/i.test(h))                       return 'DPAPI';
    if (/NL\$KM/i.test(h))                             return 'NLKM';
    if (/_SC_GMSA/i.test(h))                           return 'GMSA';
    if (/Dumping Domain Credentials|DRSUAPI|NTDS/i.test(h)) return 'NTDS';
    if (/Kerberos keys grabbed/i.test(h))              return 'KERB';
    if (/Dumping LSA Secrets/i.test(h))                return 'LSA';
    return 'OTHER';
};

/** Split a `DOMAIN\user` (or bare `user`) into account + realm. */
const splitBackslash = (raw: string): { account: string; realm: string } => {
    const i = raw.indexOf('\\');
    return i >= 0
        ? { realm: raw.slice(0, i), account: raw.slice(i + 1) }
        : { realm: '', account: raw };
};

/** Split a `DOMAIN/user` (DCC2 form) into account + realm. */
const splitSlash = (raw: string): { account: string; realm: string } => {
    const i = raw.indexOf('/');
    return i >= 0
        ? { realm: raw.slice(0, i), account: raw.slice(i + 1) }
        : { realm: '', account: raw };
};

const ntlmSource = (section: Section): string => {
    switch (section) {
        case 'SAM':          return 'secretsdump (SAM)';
        case 'NTDS':         return 'secretsdump (NTDS)';
        case 'MACHINE':      return 'secretsdump ($MACHINE.ACC)';
        case 'MACHINE_HIST': return 'secretsdump ($MACHINE.ACC_history)';
        default:             return 'secretsdump (NTLM)';
    }
};

const kerbSource = (section: Section, enctype: string): string => {
    if (section === 'MACHINE')      return `secretsdump ($MACHINE.ACC ${enctype})`;
    if (section === 'MACHINE_HIST') return `secretsdump ($MACHINE.ACC_history ${enctype})`;
    return `secretsdump (${enctype})`;
};

/**
 * Quick heuristic: does this text look like secretsdump.py output at all?
 * Used by the paste dialog to choose the secretsdump path once it's ruled
 * out a mimikatz session.
 */
export const looksLikeSecretsdump = (text: string): boolean =>
    /:[0-9a-f]{32}:[0-9a-f]{32}:::/i.test(text) ||
    /\$DCC2\$/.test(text) ||
    /Dumping (?:local SAM hashes|Domain Credentials|LSA Secrets)/i.test(text) ||
    /Impacket v[\d.]+/i.test(text) ||
    /Using the DRSUAPI method/i.test(text);

export const secretsdumpExtractAllCreds = (content: string): MzExtractedCred[] => {
    const out: MzExtractedCred[] = [];
    const seen = new Set<string>();
    const push = (c: MzExtractedCred) => {
        if (!c.account || !c.credential) return;
        const key = `${c.account}\x00${c.realm}\x00${c.credential}\x00${c.credType}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(c);
    };

    let section: Section = 'OTHER';
    const lines = content.replace(/\r\n?/g, '\n').split('\n');

    for (const rawLine of lines) {
        const line = rawLine.replace(/\s+$/, '');
        if (!line.trim()) continue;

        // Section / progress markers steer the few format-ambiguous cases
        // (DefaultPassword plaintext, history labelling). Hash/key rows below
        // are self-identifying, so headerless dump blocks still parse fine.
        const secM = line.match(SECTION_RE);
        if (secM) { section = sectionFromHeader(secM[1]); continue; }

        // ── Skip the "hex bytes" the operator asked us to ignore ──────────
        if (BYTE_GRID_RE.test(line)) continue;
        if (/:plain_password_hex:/i.test(line)) continue;

        // ── Cached domain logons (DCC2) ──────────────────────────────────
        let m = line.match(DCC2_ROW_RE);
        if (m) {
            const { account, realm } = splitSlash(m[1].trim());
            push({ account, realm, credential: m[2], credType: 'hash', source: 'secretsdump (DCC2)' });
            continue;
        }

        // ── NTLM rows (SAM / NTDS / $MACHINE.ACC) ────────────────────────
        m = line.match(NTLM_ROW_RE);
        if (m) {
            const { account, realm } = splitBackslash(m[1].trim());
            const lm = m[3].toLowerCase();
            const nt = m[4].toLowerCase();
            const src = ntlmSource(section);
            push({ account, realm, credential: nt, credType: 'hash', source: src });
            // Real (non-blank) LM halves are rare but worth keeping.
            if (lm && lm !== EMPTY_LM && !/^0+$/.test(lm)) {
                push({ account, realm, credential: lm, credType: 'hash', source: `${src} LM` });
            }
            continue;
        }

        // ── Kerberos keys (LSA $MACHINE.ACC + "Kerberos keys grabbed") ───
        m = line.match(KERB_ROW_RE);
        if (m) {
            const { account, realm } = splitBackslash(m[1].trim());
            const enctype = m[2].toLowerCase();
            // rc4_hmac(_nt)/rc4_md4 ARE the NTLM hash; classify as hash so they
            // dedupe against the SAM/NTDS NT hash. Everything else is a key.
            const credType: MzExtractedCred['credType'] =
                enctype.startsWith('rc4') ? 'hash' : 'key';
            push({ account, realm, credential: m[3].toLowerCase(), credType, source: kerbSource(section, m[2]) });
            continue;
        }

        // ── DPAPI_SYSTEM machine/user keys ───────────────────────────────
        m = line.match(DPAPI_ROW_RE);
        if (m) {
            push({ account: m[1], realm: '', credential: m[2].toLowerCase(), credType: 'key', source: 'secretsdump (DPAPI_SYSTEM)' });
            continue;
        }

        // ── NL$KM cache key (consolidated single line) ───────────────────
        m = line.match(NLKM_ROW_RE);
        if (m) {
            push({ account: m[1], realm: '', credential: m[2].toLowerCase(), credType: 'key', source: 'secretsdump (NL$KM)' });
            continue;
        }

        // ── gMSA managed-password blob (consolidated single line) ────────
        m = line.match(GMSA_ROW_RE);
        if (m) {
            push({ account: m[1], realm: '', credential: m[2].toLowerCase(), credType: 'key', source: 'secretsdump (gMSA)' });
            continue;
        }

        // ── DefaultPassword plaintext (only inside its LSA sub-section) ──
        if (section === 'DEFAULTPW') {
            const idx = line.indexOf(':');
            if (idx > 0) {
                const userRaw = line.slice(0, idx).trim();
                const pw = line.slice(idx + 1).trim();
                if (pw && !/^0x[0-9a-fA-F]+$/.test(pw)) {
                    const { account, realm } = splitBackslash(userRaw);
                    push({ account, realm, credential: pw, credType: 'plaintext', source: 'secretsdump (DefaultPassword)' });
                }
            }
        }
    }

    return out;
};
