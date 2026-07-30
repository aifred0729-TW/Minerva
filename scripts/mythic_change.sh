#!/bin/bash
# mythic_change.sh — Apply Minerva-required patches to Mythic source code and rebuild mythic_server
#
# Patch 0 (config, not source) — Mythic .env cross-container reachability:
#   Force NGINX_BIND_LOCALHOST_ONLY="false" and
#   MYTHIC_SERVER_DYNAMIC_PORTS_BIND_LOCALHOST_ONLY="false" so Minerva's nginx
#   container (and agents) can reach Mythic's 7443 + C2 ports 7000-7010 over
#   host.docker.internal. Idempotent; leaves postgres/rabbitmq/hasura/jupyter
#   localhost-only. See the "Patch 0" block below for the full rationale.
#
# Changes made to Mythic source:
#   File: mythic-docker/src/rabbitmq/utils.go
#
#   Patch 1 — GetFinalStringForDatabaseInstanceValueFromUserSuppliedValue (ARRAY case)
#     Problem : When a payload is imported or rebuilt, array-type parameter values may arrive
#               as JSON-encoded strings (e.g. "[\"http\",\"websocket\"]") rather than proper
#               JSON arrays.  Go's json.Unmarshal decodes them as Go strings, which caused
#               "bad type for *_PARAMETER_TYPE_ARRAY: string" because the switch had no
#               case string: handler.
#     Fix     : Add case string: that validates the string is a valid JSON array and returns it.
#
#   Patch 2 — getSyncToDatabaseValueForDefaultValue (ARRAY case)
#     Problem : Same missing case string: handler in the default-value function used during
#               agent sync.  If a C2 profile or payload type sends a JSON-encoded string for
#               an Array-type default value, the same error fires.
#     Fix     : Same case string: handler added.
#
#   Patch 6 — preserve operator-set IP ordering across agent beacons
#     Files   : rabbitmq/util_agent_message_actions_update_info.go (beacon path)
#               rabbitmq/recv_mythic_rpc_callback_update.go        (RPC path)
#     Problem : Every agent check-in overwrites callback.ip with the agent's
#               freshly-enumerated IP list, in interface-enumeration order.
#               That clobbers the "Set Primary IP" reorder operators make in
#               the 2D / 3D Topology UI within seconds of being applied.
#     Fix     : Diff the SET of stored vs incoming IPs. If equal, leave the
#               field untouched (operator order survives). If different, keep
#               surviving operator-ordered IPs first, then append new ones in
#               the agent's reported order.
#
#   Patch 7 — force-close P2P callbackgraphedge on `unlink*` task completion
#     Files   : rabbitmq/util_agent_message_actions_post_response.go
#     Problem : Apollo's `unlink.cs` only emits an EdgeNode `remove` when its
#               PeerManager still has the peer registered. On a stale link
#               (peer died, network drop) PeerManager.Remove returns false →
#               no EdgeNode → callbackgraphedge row keeps end_timestamp NULL
#               forever and the UI shows a phantom P2P link.
#     Fix     : Hook task completion: when a command whose name starts with
#               `unlink` finishes (regardless of status), bidirectionally
#               close every active P2P edge sourced at this callback via
#               RemoveEdgeByIds.
#
#   Patch 8 — don't auto-revive hidden P2P callbacks on relay traffic
#     File    : rabbitmq/util_agent_message.go (UpdateCallbackEdgesAndCheckinTime)
#     Problem : When an operator hides a callback, Mythic sets active=false.
#               The parent agent of a P2P-routed child keeps relaying its
#               heartbeats; each one re-enters UpdateCallbackEdgesAndCheckinTime
#               which auto-flips `active=true`. Operator's hide is undone
#               within seconds — the row reappears, looks like Hide is broken.
#     Fix     : Gate the auto-revive on `!uuidInfo.IsP2P`. P2P callbacks stay
#               hidden until the operator explicitly Show Callback (which
#               flips `active=true, dead=false` via the update mutation).
#               Non-P2P keeps the original behaviour — a real agent beacon
#               legitimately revives the callback.
#
#   Patch 9 — fix SOCKS / RPORTFWD throughput collapse and silent data loss
#     Files   : rabbitmq/utils_proxy_traffic.go
#               rabbitmq/util_agent_message_push_c2.go
#     Problem : SOCKS data path silently drops bytes when per-connection /
#               per-port message channels (cap 1000) are full — three sites
#               use `select { default: }` non-blocking sends. Once a single
#               TCP segment is lost, the SOCKS stream is silently corrupted
#               and the connection stalls. The 20ms hardcoded sleep in the
#               SOCKS-client read loop further caps throughput at ~50 reads/s.
#               Both problems compound in multi-hop TCP P2P chains where
#               added relay latency makes buffers fill faster — leading to
#               "SOCKS slows down then dies" even though every node is alive.
#     Fix     : (a) Raise channel buffers 1000 → 16384 (and the top-level
#                   proxy ingress 2000 → 16384) so normal jitter absorbs.
#               (b) Replace silent-drop selects with try-then-block-10s:
#                   backpressure flows back to the agent POST instead of
#                   corrupting the TCP stream; 10s timeout prevents
#                   permanent goroutine wedging.
#               (c) Delete the 20ms throttle sleep in the read loop.
#
# Running this script a second time is safe (idempotent).

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[*]${NC} $1"; }
ok()    { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[-]${NC} $1"; }
die()   { err "$1"; exit 1; }

MYTHIC_DIR="${MYTHIC_DIR:-/opt/Mythic}"
UTILS_GO="$MYTHIC_DIR/mythic-docker/src/rabbitmq/utils.go"

# ── Preflight ─────────────────────────────────────────────────────────────────
[ -d "$MYTHIC_DIR" ]   || die "Mythic directory not found: $MYTHIC_DIR  (set MYTHIC_DIR env var)"
[ -f "$UTILS_GO" ]     || die "Target file not found: $UTILS_GO"
command -v python3 &>/dev/null || die "python3 is required"
command -v docker  &>/dev/null || die "docker is required"

# ── Backup ────────────────────────────────────────────────────────────────────
BACKUP="${UTILS_GO}.minerva.bak"
if [ ! -f "$BACKUP" ]; then
    cp "$UTILS_GO" "$BACKUP"
    ok "Backup created: $BACKUP"
else
    ok "Backup already exists: $BACKUP"
fi

# ── Patch 0: Mythic .env cross-container reachability ──────────────────────────
# Minerva does NOT share Mythic's docker network. Its nginx container reaches
# Mythic through the host gateway (host.docker.internal → host-gateway IP):
#   • https://host.docker.internal:7443   — Mythic nginx (GraphQL / API / auth)
#   • host.docker.internal:7000-7010      — Mythic C2 dynamic ports (agents)
# A *_BIND_LOCALHOST_ONLY="true" makes the host publish that port on 127.0.0.1
# ONLY, so every container → host.docker.internal:<port> connection is refused.
# That is the single most common "fresh install has a hundred errors" cause.
# We force the two keys Minerva's architecture depends on to "false"; the
# security-sensitive internal services (postgres / rabbitmq / hasura / jupyter)
# are left localhost-only because Minerva reaches Hasura via the /graphql proxy
# through 7443, never directly.
#
# Idempotent: only rewrites a key whose value differs, and reports what changed.
MYTHIC_ENV="$MYTHIC_DIR/.env"

# set_env_kv <file> <KEY> <value> — in-place update or append. Returns 0 if the
# file was changed, 1 if it already held the desired value.
set_env_kv() {
    local file="$1" key="$2" val="$3"
    local desired="${key}=\"${val}\""
    if grep -qE "^${key}=" "$file" 2>/dev/null; then
        [ "$(grep -E "^${key}=" "$file" | head -1)" = "$desired" ] && return 1
        sed -i "s|^${key}=.*|${desired}|" "$file"
        return 0
    fi
    printf '%s\n' "$desired" >> "$file"
    return 0
}

info "Configuring Mythic .env for Minerva cross-container reachability ..."
if [ ! -f "$MYTHIC_ENV" ]; then
    warn "$MYTHIC_ENV not found — creating a stub (mythic-cli fills the rest on first start)"
    touch "$MYTHIC_ENV"
fi
ENV_CHANGED=0
for kv in \
    'NGINX_BIND_LOCALHOST_ONLY=false' \
    'MYTHIC_SERVER_DYNAMIC_PORTS_BIND_LOCALHOST_ONLY=false' ; do
    k="${kv%%=*}"; v="${kv#*=}"
    if set_env_kv "$MYTHIC_ENV" "$k" "$v"; then
        ok "  set ${k}=\"${v}\""
        ENV_CHANGED=1
    else
        ok "  ${k} already \"${v}\""
    fi
done
if [ "$ENV_CHANGED" = "1" ] && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^mythic_nginx$'; then
    warn "Mythic is already running with the old port map."
    warn "Run 'cd $MYTHIC_DIR && sudo ./mythic-cli start' to rebind ports (a plain"
    warn "restart keeps the previous bindings — port publishing is set at create time)."
fi

# ── Apply patches via Python (reliable multi-line replacement) ─────────────────
info "Applying patches to utils.go ..."

export UTILS_GO
export MYTHIC_DOCKER_SRC="$MYTHIC_DIR/mythic-docker/src"
python3 << 'PYEOF'
import os, sys

utils_go = os.environ['UTILS_GO']
mythic_src = os.environ['MYTHIC_DOCKER_SRC']

with open(utils_go, 'r') as f:
    content = f.read()

original = content
patches_applied = 0

# ──────────────────────────────────────────────────────────────────────────────
# Patch 1: GetFinalStringForDatabaseInstanceValueFromUserSuppliedValue
#   Context:  switch v := userSuppliedValue.(type)
#   Identify: the "bad type of value" message (not "default value")
# ──────────────────────────────────────────────────────────────────────────────
P1_MARKER = 'Minerva patch: accept JSON-encoded string arrays (payload export/import)'
if P1_MARKER in content:
    print('[+] Patch 1 already applied  (GetFinalStringForDatabaseInstanceValueFromUserSuppliedValue)')
else:
    OLD1 = (
        '\t\tcase nil:\n'
        '\t\t\treturn "[]", nil\n'
        '\t\tdefault:\n'
        '\t\t\ttmpErr := errors.New(fmt.Sprintf("bad type for *_PARAMETER_TYPE_ARRAY: %T", v))\n'
        '\t\t\tlogging.LogError(tmpErr, "bad type of value for parameter type *_PARAMETER_TYPE_ARRAY", "value", v)\n'
        '\t\t\treturn "", tmpErr\n'
        '\t\t}\n'
        '\tcase BUILD_PARAMETER_TYPE_TYPED_ARRAY:'
    )
    NEW1 = (
        '\t\tcase nil:\n'
        '\t\t\treturn "[]", nil\n'
        '\t\t// Minerva patch: accept JSON-encoded string arrays (payload export/import)\n'
        '\t\tcase string:\n'
        '\t\t\tvar tmp []interface{}\n'
        '\t\t\tif err := json.Unmarshal([]byte(v), &tmp); err != nil {\n'
        '\t\t\t\ttmpErr := errors.New(fmt.Sprintf("bad value for *_PARAMETER_TYPE_ARRAY (not valid JSON array): %s", v))\n'
        '\t\t\t\tlogging.LogError(tmpErr, "bad string value for *_PARAMETER_TYPE_ARRAY", "value", v)\n'
        '\t\t\t\treturn "", tmpErr\n'
        '\t\t\t}\n'
        '\t\t\treturn v, nil\n'
        '\t\tdefault:\n'
        '\t\t\ttmpErr := errors.New(fmt.Sprintf("bad type for *_PARAMETER_TYPE_ARRAY: %T", v))\n'
        '\t\t\tlogging.LogError(tmpErr, "bad type of value for parameter type *_PARAMETER_TYPE_ARRAY", "value", v)\n'
        '\t\t\treturn "", tmpErr\n'
        '\t\t}\n'
        '\tcase BUILD_PARAMETER_TYPE_TYPED_ARRAY:'
    )
    if OLD1 in content:
        content = content.replace(OLD1, NEW1, 1)
        patches_applied += 1
        print('[+] Patch 1 applied  (GetFinalStringForDatabaseInstanceValueFromUserSuppliedValue — ARRAY case string)')
    else:
        # May already have a case string: from a previous partial patch; check for it
        if '"bad type of value for parameter type *_PARAMETER_TYPE_ARRAY"' in content and \
           'case string:' in content:
            print('[+] Patch 1 appears already applied (case string: present)')
        else:
            print('[!] WARNING: Patch 1 — target text not found; utils.go structure may differ')
            print('    Expected text between case nil / default in switch v := userSuppliedValue.(type)')

# ──────────────────────────────────────────────────────────────────────────────
# Patch 2: getSyncToDatabaseValueForDefaultValue
#   Context:  switch v := defaultValue.(type)
#   Identify: the "bad type of default value" message
# ──────────────────────────────────────────────────────────────────────────────
P2_MARKER = 'Minerva patch: accept JSON-encoded array strings supplied by agent sync'
if P2_MARKER in content:
    print('[+] Patch 2 already applied  (getSyncToDatabaseValueForDefaultValue)')
else:
    OLD2 = (
        '\t\tcase nil:\n'
        '\t\t\treturn "[]", nil\n'
        '\t\tdefault:\n'
        '\t\t\ttmpErr := errors.New(fmt.Sprintf("bad type for *_PARAMETER_TYPE_ARRAY: %T", v))\n'
        '\t\t\tlogging.LogError(tmpErr, "bad type of default value for parameter type *_PARAMETER_TYPE_ARRAY", "value", v)\n'
        '\t\t\treturn "", tmpErr\n'
        '\t\t}\n'
        '\tcase BUILD_PARAMETER_TYPE_FILE_MULTIPLE:'
    )
    NEW2 = (
        '\t\tcase nil:\n'
        '\t\t\treturn "[]", nil\n'
        '\t\t// Minerva patch: accept JSON-encoded array strings supplied by agent sync\n'
        '\t\tcase string:\n'
        '\t\t\tvar tmp []interface{}\n'
        '\t\t\tif err := json.Unmarshal([]byte(v), &tmp); err != nil {\n'
        '\t\t\t\ttmpErr := errors.New(fmt.Sprintf("bad value for *_PARAMETER_TYPE_ARRAY default (not valid JSON array): %s", v))\n'
        '\t\t\t\tlogging.LogError(tmpErr, "bad string default value for *_PARAMETER_TYPE_ARRAY", "value", v)\n'
        '\t\t\t\treturn "", tmpErr\n'
        '\t\t\t}\n'
        '\t\t\treturn v, nil\n'
        '\t\tdefault:\n'
        '\t\t\ttmpErr := errors.New(fmt.Sprintf("bad type for *_PARAMETER_TYPE_ARRAY: %T", v))\n'
        '\t\t\tlogging.LogError(tmpErr, "bad type of default value for parameter type *_PARAMETER_TYPE_ARRAY", "value", v)\n'
        '\t\t\treturn "", tmpErr\n'
        '\t\t}\n'
        '\tcase BUILD_PARAMETER_TYPE_FILE_MULTIPLE:'
    )
    if OLD2 in content:
        content = content.replace(OLD2, NEW2, 1)
        patches_applied += 1
        print('[+] Patch 2 applied  (getSyncToDatabaseValueForDefaultValue — ARRAY case string)')
    else:
        if '"bad type of default value for parameter type *_PARAMETER_TYPE_ARRAY"' in content and \
           'case string:' in content:
            print('[+] Patch 2 appears already applied (case string: present)')
        else:
            print('[!] WARNING: Patch 2 — target text not found; utils.go structure may differ')
            print('    Expected text between case nil / default in switch v := defaultValue.(type)')

# Write only if changed
if content != original:
    with open(utils_go, 'w') as f:
        f.write(content)
    print(f'[+] utils.go written ({patches_applied} new patch(es) applied)')
else:
    print('[*] utils.go unchanged — all patches already present')

# ──────────────────────────────────────────────────────────────────────────────
# Patch 3: webserver/controllers/hasura_claims.go
#   Problem: x-hasura-operations and x-hasura-admin-operations were built but
#            never assigned to the hasuraClaims map, causing Hasura to reject
#            requests with "missing session variable: x-hasura-operations".
#            The "strings" import is needed for strings.Join.
#   Fix: ensure "strings" is imported and add the two missing assignments.
# ──────────────────────────────────────────────────────────────────────────────
P3_MARKER = 'x-hasura-operations"] = "{"'
hasura_claims = os.path.join(mythic_src, 'webserver/controllers/hasura_claims.go')
if os.path.exists(hasura_claims):
    with open(hasura_claims, 'r') as f:
        hc = f.read()
    if P3_MARKER in hc:
        print('[+] Patch 3 already applied  (hasura_claims.go — x-hasura-operations assigned)')
    else:
        # 3a: ensure "strings" import is present
        if '\t"strings"\n' not in hc:
            hc = hc.replace('\t"sync"\n', '\t"strings"\n\t"sync"\n', 1)
        # 3b: insert the two missing claim assignments before the admin check
        OLD3 = '\tif user.Admin {\n\t\thasuraClaims["x-hasura-role"] = "mythic_admin"\n\t}'
        NEW3 = (
            '\thasuraClaims["x-hasura-operations"] = "{" + strings.Join(hasuraOperations, ",") + "}"\n'
            '\thasuraClaims["x-hasura-admin-operations"] = "{" + strings.Join(hasuraAdminOperations, ",") + "}"\n'
            '\tif user.Admin {\n\t\thasuraClaims["x-hasura-role"] = "mythic_admin"\n\t}'
        )
        if OLD3 in hc:
            hc = hc.replace(OLD3, NEW3, 1)
            with open(hasura_claims, 'w') as f:
                f.write(hc)
            print('[+] Patch 3 applied  (hasura_claims.go — x-hasura-operations and x-hasura-admin-operations assigned)')
        else:
            print('[!] WARNING: Patch 3 — hasura_claims.go target text not found; may need manual fix')

# ──────────────────────────────────────────────────────────────────────────────
# Patch 4: webserver/controllers/operationeventlog_create_webhook.go
#   Remove unused "strings" import that causes build failure
# ──────────────────────────────────────────────────────────────────────────────
eventlog = os.path.join(mythic_src, 'webserver/controllers/operationeventlog_create_webhook.go')
if os.path.exists(eventlog):
    with open(eventlog, 'r') as f:
        el = f.read()
    if '"strings"' in el and 'strings.' not in el:
        # Remove the line (may have tabs or spaces)
        import re
        el2 = re.sub(r'[ \t]+"strings"\n', '', el, count=1)
        if el2 != el:
            with open(eventlog, 'w') as f:
                f.write(el2)
            print('[+] Patch 4 applied  (operationeventlog_create_webhook.go — removed unused "strings" import)')
        else:
            print('[!] Patch 4 — could not remove "strings" import automatically')
    else:
        print('[+] Patch 4 already applied  (operationeventlog_create_webhook.go)')

# ──────────────────────────────────────────────────────────────────────────────
# Patch 6: preserve operator-set IP ordering on every callback IP write
#   Problem: Every agent beacon (post_response path) overwrites callback.ip
#            with the agent's freshly-enumerated IP list. The same happens on
#            the RPC update path. That clobbers any operator-set primary IP
#            ordering ("Set Primary IP" in the 2D / 3D Topology UI) within
#            seconds of being set.
#   Fix    : Compare the SET of IPs before writing. If the incoming set is
#            identical to what's already stored, leave the field untouched so
#            operator ordering survives. If it differs, rebuild the list by
#            (a) keeping surviving operator-ordered IPs in their existing
#            order, then (b) appending any new IPs in the agent's order.
#   Targets:
#     6a. rabbitmq/util_agent_message_actions_update_info.go   (beacon path)
#     6b. rabbitmq/recv_mythic_rpc_callback_update.go          (RPC path)
# ──────────────────────────────────────────────────────────────────────────────
P6_MARKER = 'Minerva patch: preserve operator-set IP ordering'

# Shared replacement body. Both files use identical Marshal-on-IPs blocks; the
# only difference is indentation depth (2 tabs in update_info, 1 tab in RPC)
# and how IPs is referenced (`agentMessage.IPs` vs `*input.IPs`).
def build_old(indent, ips_expr):
    t = indent
    return (
        f'{t}if ipArrayBytes, err := json.Marshal({ips_expr}); err != nil {{\n'
        f'{t}\tlogging.LogError(err, "Failed to marshal callback ip array")\n'
        f'{t}\tcallback.IP = "[]"\n'
        f'{t}}} else {{\n'
        f'{t}\tcallback.IP = string(ipArrayBytes)\n'
        f'{t}}}\n'
    )

def build_new(indent, ips_expr):
    t = indent
    return (
        f'{t}// Minerva patch: preserve operator-set IP ordering. Agents report\n'
        f'{t}// IPs in interface-enumeration order every check-in; without this\n'
        f'{t}// the operator-chosen primary (first in list) is clobbered within\n'
        f'{t}// seconds. If the incoming SET matches what is stored, leave the\n'
        f'{t}// field alone; otherwise keep operator-ordered survivors first and\n'
        f'{t}// append new IPs after.\n'
        f'{t}incomingIPs := {ips_expr}\n'
        f'{t}var existingIPs []string\n'
        f'{t}_ = json.Unmarshal([]byte(callback.IP), &existingIPs)\n'
        f'{t}incomingSet := make(map[string]struct{{}}, len(incomingIPs))\n'
        f'{t}for _, ip := range incomingIPs {{\n'
        f'{t}\tincomingSet[ip] = struct{{}}{{}}\n'
        f'{t}}}\n'
        f'{t}existingSet := make(map[string]struct{{}}, len(existingIPs))\n'
        f'{t}for _, ip := range existingIPs {{\n'
        f'{t}\texistingSet[ip] = struct{{}}{{}}\n'
        f'{t}}}\n'
        f'{t}setsEqual := len(existingSet) == len(incomingSet)\n'
        f'{t}if setsEqual {{\n'
        f'{t}\tfor ip := range incomingSet {{\n'
        f'{t}\t\tif _, ok := existingSet[ip]; !ok {{\n'
        f'{t}\t\t\tsetsEqual = false\n'
        f'{t}\t\t\tbreak\n'
        f'{t}\t\t}}\n'
        f'{t}\t}}\n'
        f'{t}}}\n'
        f'{t}if !setsEqual {{\n'
        f'{t}\tmerged := make([]string, 0, len(incomingIPs))\n'
        f'{t}\tseenIPs := make(map[string]struct{{}}, len(incomingIPs))\n'
        f'{t}\tfor _, ip := range existingIPs {{\n'
        f'{t}\t\tif _, ok := incomingSet[ip]; !ok {{\n'
        f'{t}\t\t\tcontinue\n'
        f'{t}\t\t}}\n'
        f'{t}\t\tif _, dup := seenIPs[ip]; dup {{\n'
        f'{t}\t\t\tcontinue\n'
        f'{t}\t\t}}\n'
        f'{t}\t\tmerged = append(merged, ip)\n'
        f'{t}\t\tseenIPs[ip] = struct{{}}{{}}\n'
        f'{t}\t}}\n'
        f'{t}\tfor _, ip := range incomingIPs {{\n'
        f'{t}\t\tif _, dup := seenIPs[ip]; dup {{\n'
        f'{t}\t\t\tcontinue\n'
        f'{t}\t\t}}\n'
        f'{t}\t\tmerged = append(merged, ip)\n'
        f'{t}\t\tseenIPs[ip] = struct{{}}{{}}\n'
        f'{t}\t}}\n'
        f'{t}\tif ipArrayBytes, err := json.Marshal(merged); err != nil {{\n'
        f'{t}\t\tlogging.LogError(err, "Failed to marshal callback ip array")\n'
        f'{t}\t\tcallback.IP = "[]"\n'
        f'{t}\t}} else {{\n'
        f'{t}\t\tcallback.IP = string(ipArrayBytes)\n'
        f'{t}\t}}\n'
        f'{t}}}\n'
    )

def apply_ip_patch(path, indent, ips_expr, label):
    if not os.path.exists(path):
        print(f'[!] {label} — target file not found, skipping: {path}')
        return
    with open(path, 'r') as f:
        src = f.read()
    if P6_MARKER in src:
        print(f'[+] {label} already applied')
        return
    old = build_old(indent, ips_expr)
    new = build_new(indent, ips_expr)
    if old not in src:
        print(f'[!] WARNING: {label} — target block not found; file structure may differ')
        return
    src = src.replace(old, new, 1)
    with open(path, 'w') as f:
        f.write(src)
    print(f'[+] {label} applied')

apply_ip_patch(
    os.path.join(mythic_src, 'rabbitmq/util_agent_message_actions_update_info.go'),
    '\t\t\t',                        # 3 tabs — inside `if agentMessage.IPs != nil {`
    'agentMessage.IPs',
    'Patch 6a (util_agent_message_actions_update_info.go — IP ordering preserved on beacon)',
)
apply_ip_patch(
    os.path.join(mythic_src, 'rabbitmq/recv_mythic_rpc_callback_update.go'),
    '\t\t',                          # 2 tabs — inside `if input.IPs != nil {`
    '*input.IPs',
    'Patch 6b (recv_mythic_rpc_callback_update.go — IP ordering preserved on RPC update)',
)

# ─────────────────────────────────────────────────────────────────────────────
# Patch 7 — force-close P2P callbackgraphedge on `unlink*` task completion
#
# Problem : Apollo's `unlink.cs` only emits an EdgeNode `remove` message when
#           its in-memory PeerManager still has the peer registered. After a
#           natural disconnect (peer process died, network drop) PeerManager
#           drops the entry locally — so the next operator-issued unlink hits
#           the silent-failure branch and never tells Mythic to close the
#           edge. The callbackgraphedge row stays with end_timestamp IS NULL
#           forever and the UI shows a stale P2P link.
# Fix     : When ANY task whose command name starts with `unlink` completes
#           (success or error), Mythic scans this callback's open P2P edges
#           and force-closes them via RemoveEdgeByIds — bidirectional so it
#           doesn't depend on which way the agent registered the edge.
# Files   : rabbitmq/util_agent_message_actions_post_response.go
#           (a) inside `if currentTask.Completed` block — fire goroutine
#           (b) at file tail — helper function `forceCloseOutgoingP2PEdges`
# Idempotent — re-running this script is safe (looks for sentinel comment).
# ─────────────────────────────────────────────────────────────────────────────
post_resp = os.path.join(mythic_src, 'rabbitmq/util_agent_message_actions_post_response.go')
if not os.path.exists(post_resp):
    print(f'[!] WARNING: Patch 7 — file not found: {post_resp}')
else:
    with open(post_resp, 'r') as f:
        src = f.read()
    if 'Minerva patch — force-close P2P edges on unlink completion' in src:
        print('[+] Patch 7a (unlink-completion hook) already applied')
    else:
        old_hook = (
            '\t\tif currentTask.Completed {\n'
            '\t\t\t// use updatedToCompleted to try to make sure we only do this once per task\n'
            '\t\t\tgo CheckAndProcessTaskCompletionHandlers(currentTask.ID)\n'
        )
        new_hook = (
            '\t\tif currentTask.Completed {\n'
            '\t\t\t// Minerva patch — force-close P2P edges on unlink completion.\n'
            '\t\t\t// Apollo\'s `unlink.cs` (and similar agents) only emit an\n'
            '\t\t\t// EdgeNode `remove` if their in-memory PeerManager still has\n'
            '\t\t\t// the peer registered. After a natural disconnect (peer\n'
            '\t\t\t// died, network drop) PeerManager.Remove returns false, no\n'
            '\t\t\t// EdgeNode is sent, and the callbackgraphedge row keeps\n'
            '\t\t\t// `end_timestamp IS NULL` forever — the UI shows a stale\n'
            '\t\t\t// link. Hook the agent-side completion: whenever a task\n'
            '\t\t\t// whose command name starts with `unlink` finishes (success\n'
            '\t\t\t// OR error), force-close every active outgoing P2P edge\n'
            '\t\t\t// sourced at this callback. Safe because the operator\'s\n'
            '\t\t\t// explicit intent was to drop the link.\n'
            '\t\t\tif strings.HasPrefix(strings.ToLower(currentTask.CommandName), "unlink") {\n'
            '\t\t\t\tgo forceCloseOutgoingP2PEdges(currentTask.CallbackID)\n'
            '\t\t\t}\n'
            '\t\t\t// use updatedToCompleted to try to make sure we only do this once per task\n'
            '\t\t\tgo CheckAndProcessTaskCompletionHandlers(currentTask.ID)\n'
        )
        if old_hook in src:
            src = src.replace(old_hook, new_hook, 1)
            print('[+] Patch 7a (unlink-completion hook) applied')
        else:
            print('[!] WARNING: Patch 7a target block not found; util_agent_message_actions_post_response.go may have changed shape')

    if 'func forceCloseOutgoingP2PEdges(' in src:
        print('[+] Patch 7b (forceCloseOutgoingP2PEdges helper) already applied')
    else:
        helper = (
            '\n\n'
            '// Minerva patch — close every active outgoing P2P callbackgraphedge\n'
            '// sourced at the given callback. Invoked when an `unlink*` task\n'
            '// finishes regardless of whether the agent emitted an EdgeNode\n'
            '// remove; covers the stale-peer case where Apollo\'s PeerManager has\n'
            '// already dropped the entry so its `unlink.cs` falls through the\n'
            '// silent-failure branch and never tells Mythic. Bidirectional sweep\n'
            '// (source-id and destination-id) so it doesn\'t depend on which way\n'
            '// the agent originally registered the edge.\n'
            'func forceCloseOutgoingP2PEdges(callbackID int) {\n'
            '\ttype edgeRow struct {\n'
            '\t\tID            int    `db:"id"`\n'
            '\t\tSourceID      int    `db:"source_id"`\n'
            '\t\tDestinationID int    `db:"destination_id"`\n'
            '\t\tC2ProfileName string `db:"c2_name"`\n'
            '\t}\n'
            '\trows := []edgeRow{}\n'
            '\terr := database.DB.Select(&rows, `SELECT\n'
            '\t\tcbe.id, cbe.source_id, cbe.destination_id, c2.name AS c2_name\n'
            '\t\tFROM callbackgraphedge cbe\n'
            '\t\tJOIN c2profile c2 ON cbe.c2_profile_id = c2.id\n'
            '\t\tWHERE cbe.end_timestamp IS NULL\n'
            '\t\t  AND c2.is_p2p = true\n'
            '\t\t  AND (cbe.source_id = $1 OR cbe.destination_id = $1)\n'
            '\t\t  AND cbe.source_id <> cbe.destination_id`,\n'
            '\t\tcallbackID)\n'
            '\tif err != nil {\n'
            '\t\tlogging.LogError(err, "Minerva force-close: failed to enumerate P2P edges", "callback_id", callbackID)\n'
            '\t\treturn\n'
            '\t}\n'
            '\tfor _, r := range rows {\n'
            '\t\tif err := RemoveEdgeByIds(r.SourceID, r.DestinationID, r.C2ProfileName); err != nil {\n'
            '\t\t\tlogging.LogError(err, "Minerva force-close: RemoveEdgeByIds failed",\n'
            '\t\t\t\t"edge_id", r.ID, "source_id", r.SourceID, "destination_id", r.DestinationID, "c2", r.C2ProfileName)\n'
            '\t\t}\n'
            '\t}\n'
            '}\n'
        )
        # Append at file tail.
        if not src.endswith('\n'):
            src += '\n'
        src += helper
        print('[+] Patch 7b (forceCloseOutgoingP2PEdges helper) applied')

    with open(post_resp, 'w') as f:
        f.write(src)

# ─────────────────────────────────────────────────────────────────────────────
# Patch 8 — don't auto-revive hidden P2P callbacks on relay traffic
#
# Problem : UpdateCallbackEdgesAndCheckinTime in util_agent_message.go has a
#           block that re-activates an inactive callback whenever a fresh
#           agent message comes in for it. For a P2P-routed child callback,
#           the parent's beacons relay traffic on the child's behalf every
#           few seconds — so each one triggers the auto-revive and undoes
#           the operator's Hide within moments. The Hide button appears to
#           do nothing because the row keeps coming back.
# Fix     : Gate the auto-revive on `!uuidInfo.IsP2P`. Direct-C2 callbacks
#           keep their original behaviour (real beacon legitimately revives
#           the row). P2P callbacks stay hidden until the operator explicitly
#           Show Callback, which flips `active=true, dead=false` via the
#           update mutation directly.
# File    : rabbitmq/util_agent_message.go
# Idempotent — looks for the patched condition before applying.
# ─────────────────────────────────────────────────────────────────────────────
util_agent_msg = os.path.join(mythic_src, 'rabbitmq/util_agent_message.go')
if not os.path.exists(util_agent_msg):
    print(f'[!] WARNING: Patch 8 — file not found: {util_agent_msg}')
else:
    with open(util_agent_msg, 'r') as f:
        src = f.read()
    if '!uuidInfo.Active && !uuidInfo.IsP2P' in src:
        print('[+] Patch 8 (skip auto-revive for P2P callbacks) already applied')
    else:
        old_block = (
            '\t\tif !uuidInfo.Active {\n'
            '\t\t\tuuidInfo.Active = true\n'
            '\t\t\t_, err := database.DB.NamedExec(`UPDATE callback SET\n'
            '\t\t\t\t\tactive=true\n'
            '\t\t\t\t\tWHERE id=:id`, callback)\n'
        )
        new_block = (
            '\t\tif !uuidInfo.Active && !uuidInfo.IsP2P {\n'
            '\t\t\t// Minerva patch — don\'t auto-revive P2P callbacks on relay\n'
            '\t\t\t// traffic. The parent agent forwards the child\'s heartbeat\n'
            '\t\t\t// every few seconds, which would re-flip `active=true`\n'
            '\t\t\t// within moments of an operator hiding the row, making the\n'
            '\t\t\t// Hide action look broken. For P2P, only an explicit\n'
            '\t\t\t// operator Show Callback brings `active` back. Non-P2P\n'
            '\t\t\t// (direct C2) keeps the original behaviour where a real\n'
            '\t\t\t// agent beacon naturally re-activates the callback.\n'
            '\t\t\tuuidInfo.Active = true\n'
            '\t\t\t_, err := database.DB.NamedExec(`UPDATE callback SET\n'
            '\t\t\t\t\tactive=true\n'
            '\t\t\t\t\tWHERE id=:id`, callback)\n'
        )
        if old_block in src:
            src = src.replace(old_block, new_block, 1)
            with open(util_agent_msg, 'w') as f:
                f.write(src)
            print('[+] Patch 8 (skip auto-revive for P2P callbacks) applied')
        else:
            print('[!] WARNING: Patch 8 target block not found; util_agent_message.go may have changed shape')

# ─────────────────────────────────────────────────────────────────────────────
# Patch 9 — fix SOCKS / RPORTFWD throughput collapse and silent data loss
#
# Problem : SOCKS data path drops bytes silently under load. Three sites use
#           `select { case ch <- msg: default: }` to push proxy messages, so
#           when a per-connection / per-port channel (cap 1000) fills, the
#           message is dropped. TCP semantics break: the SOCKS client and
#           remote target both think delivery is reliable, but Mythic has
#           silently lost a segment — connection stalls, eventually appears
#           dead. Symptom compounds with multi-hop TCP P2P chains where added
#           latency makes buffers fill faster.
#
#           Additionally, the SOCKS-client read loop sleeps 20 ms before each
#           read, capping throughput at ~50 reads/sec — that alone makes
#           SOCKS feel slow even before any drops happen.
#
# Files   : rabbitmq/utils_proxy_traffic.go
#           rabbitmq/util_agent_message_push_c2.go
# Fixes   : (a) Raise message-channel buffers 1000 → 16384 and 2000 → 16384
#               so normal jitter / chain latency no longer fills them.
#           (b) Replace silent-drop selects with bounded backpressure: try
#               non-blocking first, then block up to 10 s. Backpressure
#               propagates all the way back to the agent's POST (correct
#               TCP behaviour) instead of corrupting the stream.
#           (c) Remove the 20 ms artificial sleep in the SOCKS-client read
#               loop — with proper backpressure the system self-regulates.
# Idempotent — looks for our marker string before applying.
# ─────────────────────────────────────────────────────────────────────────────
proxy_go = os.path.join(mythic_src, 'rabbitmq/utils_proxy_traffic.go')
push_c2_go = os.path.join(mythic_src, 'rabbitmq/util_agent_message_push_c2.go')

P9_MARKER = 'Minerva patch 9: backpressure-on-full proxy delivery'

if not os.path.exists(proxy_go):
    print(f'[!] WARNING: Patch 9 — file not found: {proxy_go}')
elif not os.path.exists(push_c2_go):
    print(f'[!] WARNING: Patch 9 — file not found: {push_c2_go}')
else:
    with open(proxy_go, 'r') as f:
        src9a = f.read()
    with open(push_c2_go, 'r') as f:
        src9b = f.read()

    if P9_MARKER in src9a and P9_MARKER in src9b:
        print('[+] Patch 9 (SOCKS throughput / no-silent-drop) already applied')
    else:
        # ─── 9a. utils_proxy_traffic.go ───────────────────────────────────────
        changed_a = False

        # (a1) Bump per-port + per-conn buffers 1000 → 16384.
        if 'make(chan proxyFromAgentMessage, 1000)' in src9a:
            src9a = src9a.replace(
                'make(chan proxyFromAgentMessage, 1000)',
                'make(chan proxyFromAgentMessage, 16384)')
            changed_a = True
        if 'make(chan proxyToAgentMessage, 1000)' in src9a:
            src9a = src9a.replace(
                'make(chan proxyToAgentMessage, 1000)',
                'make(chan proxyToAgentMessage, 16384)')
            changed_a = True
        if 'make(chan ProxyFromAgentMessageForMythic, 2000)' in src9a:
            src9a = src9a.replace(
                'make(chan ProxyFromAgentMessageForMythic, 2000)',
                'make(chan ProxyFromAgentMessageForMythic, 16384)')
            changed_a = True

        # (a2) SOCKS dispatcher silent-drop → backpressure-with-timeout.
        old_socks_drop = (
            '\t\t\tcase CALLBACK_PORT_TYPE_SOCKS:\n'
            '\t\t\t\t//logging.LogInfo("got message from agent in p.messagesFromAgent", "chan", newMsg.ServerID)\n'
            '\t\t\t\tif _, ok := connectionMap[newMsg.ServerID]; ok {\n'
            '\t\t\t\t\t//logging.LogInfo("got msg from agent for server mythic still thinks is alive", "serverID", newMsg.ServerID, "exit", newMsg.IsExit)\n'
            '\t\t\t\t\tselect {\n'
            '\t\t\t\t\tcase connectionMap[newMsg.ServerID].messagesFromAgent <- newMsg:\n'
            '\t\t\t\t\tdefault:\n'
            '\t\t\t\t\t}'
        )
        new_socks_drop = (
            '\t\t\tcase CALLBACK_PORT_TYPE_SOCKS:\n'
            '\t\t\t\t// Minerva patch 9: backpressure-on-full proxy delivery.\n'
            '\t\t\t\t// Previously this `select { default: }` silently dropped the\n'
            '\t\t\t\t// message when the per-connection queue was full, corrupting\n'
            '\t\t\t\t// the SOCKS TCP stream. Now we try non-blocking first; if the\n'
            '\t\t\t\t// queue is full we block up to 10 s so backpressure flows back\n'
            '\t\t\t\t// to the agent POST (correct TCP behaviour). After 10 s the\n'
            '\t\t\t\t// connection is treated as wedged and the message is dropped\n'
            '\t\t\t\t// with a log line, preventing permanent loop starvation.\n'
            '\t\t\t\tif _, ok := connectionMap[newMsg.ServerID]; ok {\n'
            '\t\t\t\t\tselect {\n'
            '\t\t\t\t\tcase connectionMap[newMsg.ServerID].messagesFromAgent <- newMsg:\n'
            '\t\t\t\t\tdefault:\n'
            '\t\t\t\t\t\tselect {\n'
            '\t\t\t\t\t\tcase connectionMap[newMsg.ServerID].messagesFromAgent <- newMsg:\n'
            '\t\t\t\t\t\tcase <-time.After(10 * time.Second):\n'
            '\t\t\t\t\t\t\tlogging.LogError(nil, "proxy delivery wedged 10s, dropping (socks)",\n'
            '\t\t\t\t\t\t\t\t"serverID", newMsg.ServerID, "queueLen", len(connectionMap[newMsg.ServerID].messagesFromAgent))\n'
            '\t\t\t\t\t\t}\n'
            '\t\t\t\t\t}'
        )
        if old_socks_drop in src9a:
            src9a = src9a.replace(old_socks_drop, new_socks_drop, 1)
            changed_a = True
            print('[+] Patch 9a-2 (SOCKS dispatch backpressure) applied')

        # (a3) RPORTFWD dispatcher (existing-connection branch) silent-drop fix.
        old_rpfwd_drop = (
            '\t\t\tcase CALLBACK_PORT_TYPE_RPORTFWD:\n'
            '\t\t\t\t//logging.LogInfo("got message from agent in p.messagesFromAgent", "chan", newMsg.ServerID)\n'
            '\t\t\t\tif _, ok := connectionMap[newMsg.ServerID]; ok {\n'
            '\t\t\t\t\t//logging.LogInfo("found supporting connection in connection map", "chan", newMsg.ServerID)\n'
            '\t\t\t\t\t// this means that we\'ve seen this ServerID before, established a remote connection, and are just sending more data\n'
            '\t\t\t\t\tselect {\n'
            '\t\t\t\t\tcase connectionMap[newMsg.ServerID].messagesFromAgent <- newMsg:\n'
            '\t\t\t\t\tdefault:\n'
            '\t\t\t\t\t}'
        )
        new_rpfwd_drop = (
            '\t\t\tcase CALLBACK_PORT_TYPE_RPORTFWD:\n'
            '\t\t\t\t// Minerva patch 9: backpressure-on-full proxy delivery (rpfwd).\n'
            '\t\t\t\t// Same fix as the SOCKS branch above — never silently drop bytes.\n'
            '\t\t\t\tif _, ok := connectionMap[newMsg.ServerID]; ok {\n'
            '\t\t\t\t\tselect {\n'
            '\t\t\t\t\tcase connectionMap[newMsg.ServerID].messagesFromAgent <- newMsg:\n'
            '\t\t\t\t\tdefault:\n'
            '\t\t\t\t\t\tselect {\n'
            '\t\t\t\t\t\tcase connectionMap[newMsg.ServerID].messagesFromAgent <- newMsg:\n'
            '\t\t\t\t\t\tcase <-time.After(10 * time.Second):\n'
            '\t\t\t\t\t\t\tlogging.LogError(nil, "proxy delivery wedged 10s, dropping (rpfwd)",\n'
            '\t\t\t\t\t\t\t\t"serverID", newMsg.ServerID, "queueLen", len(connectionMap[newMsg.ServerID].messagesFromAgent))\n'
            '\t\t\t\t\t\t}\n'
            '\t\t\t\t\t}'
        )
        if old_rpfwd_drop in src9a:
            src9a = src9a.replace(old_rpfwd_drop, new_rpfwd_drop, 1)
            changed_a = True
            print('[+] Patch 9a-3 (RPORTFWD dispatch backpressure) applied')

        # (a4) Remove the 20ms throttling sleep on SOCKS-client read loop.
        old_sleep = (
            '\t\t\t\t\t//logging.LogDebug("looping to read from connection again", "server_id", newConnection.ServerID)\n'
            '\t\t\t\t\t// add some sleep here to keep things from getting overwhelmed\n'
            '\t\t\t\t\ttime.Sleep(time.Duration(20) * time.Millisecond)\n'
        )
        new_sleep = (
            '\t\t\t\t\t//logging.LogDebug("looping to read from connection again", "server_id", newConnection.ServerID)\n'
            '\t\t\t\t\t// Minerva patch 9: removed 20ms throttling sleep. With proper\n'
            '\t\t\t\t\t// backpressure on the agent-bound channel, the read loop self-\n'
            '\t\t\t\t\t// regulates — the artificial sleep capped SOCKS throughput at\n'
            '\t\t\t\t\t// ~50 reads/sec and made multi-hop TCP P2P chains feel slow.\n'
        )
        if old_sleep in src9a:
            src9a = src9a.replace(old_sleep, new_sleep, 1)
            changed_a = True
            print('[+] Patch 9a-4 (removed 20ms read-loop throttle) applied')

        if changed_a:
            with open(proxy_go, 'w') as f:
                f.write(src9a)
            print('[+] Patch 9a (utils_proxy_traffic.go) written')
        else:
            print('[!] WARNING: Patch 9a — no changes applied (file shape may differ)')

        # ─── 9b. util_agent_message_push_c2.go ────────────────────────────────
        changed_b = False

        if 'make(chan interceptProxyToAgentMessage, 2000)' in src9b:
            src9b = src9b.replace(
                'make(chan interceptProxyToAgentMessage, 2000)',
                'make(chan interceptProxyToAgentMessage, 16384)')
            changed_b = True

        # Replace silent-drop on Mythic→agent path with backpressure-with-timeout.
        old_to_agent_drop = (
            '\t\t\tcase CALLBACK_PORT_TYPE_SOCKS:\n'
            '\t\t\t\tfallthrough\n'
            '\t\t\tcase CALLBACK_PORT_TYPE_RPORTFWD:\n'
            '\t\t\t\tselect {\n'
            '\t\t\t\tcase msg.MessagesToAgent <- msg.Message:\n'
            '\t\t\t\tdefault:\n'
            '\t\t\t\t\tlogging.LogError(nil, "dropping message because channel is full", "type", msg.ProxyType, "len(msg.MessagesToAgent)", len(msg.MessagesToAgent))\n'
            '\t\t\t\t}'
        )
        new_to_agent_drop = (
            '\t\t\tcase CALLBACK_PORT_TYPE_SOCKS:\n'
            '\t\t\t\tfallthrough\n'
            '\t\t\tcase CALLBACK_PORT_TYPE_RPORTFWD:\n'
            '\t\t\t\t// Minerva patch 9: backpressure-on-full proxy delivery (to agent).\n'
            '\t\t\t\t// Try non-blocking; on full, block up to 10s so backpressure\n'
            '\t\t\t\t// reaches the SOCKS client (via conn.Read on the listener side)\n'
            '\t\t\t\t// instead of corrupting the TCP stream with a silent drop.\n'
            '\t\t\t\tselect {\n'
            '\t\t\t\tcase msg.MessagesToAgent <- msg.Message:\n'
            '\t\t\t\tdefault:\n'
            '\t\t\t\t\tselect {\n'
            '\t\t\t\t\tcase msg.MessagesToAgent <- msg.Message:\n'
            '\t\t\t\t\tcase <-time.After(10 * time.Second):\n'
            '\t\t\t\t\t\tlogging.LogError(nil, "dropping message after 10s backpressure timeout",\n'
            '\t\t\t\t\t\t\t"type", msg.ProxyType, "len(msg.MessagesToAgent)", len(msg.MessagesToAgent))\n'
            '\t\t\t\t\t}\n'
            '\t\t\t\t}'
        )
        if old_to_agent_drop in src9b:
            src9b = src9b.replace(old_to_agent_drop, new_to_agent_drop, 1)
            changed_b = True
            print('[+] Patch 9b (Mythic→agent dispatch backpressure) applied')

            # Make sure the `time` import is present (it usually is, but be safe)
            if '\n\t"time"\n' not in src9b and '"time"' not in src9b:
                # Insert "time" import alphabetically into the import block.
                import_re_anchor = '\nimport (\n'
                if import_re_anchor in src9b:
                    src9b = src9b.replace(import_re_anchor, import_re_anchor + '\t"time"\n', 1)
                    print('[+] Patch 9b ("time" import added to util_agent_message_push_c2.go)')

        if changed_b:
            with open(push_c2_go, 'w') as f:
                f.write(src9b)
            print('[+] Patch 9b (util_agent_message_push_c2.go) written')
        else:
            print('[!] WARNING: Patch 9b — no changes applied (file shape may differ)')

sys.exit(0)
PYEOF

# ── Patch 5: agentstorage unique index → named constraint ─────────────────────
# The unique index on agentstorage.unique_id must be a named CONSTRAINT for Hasura
# on_conflict upserts to work. Convert index to constraint (no data change, no rebuild).
info "Applying Patch 5: converting agentstorage unique index to named constraint..."
POSTGRES_PASSWORD="$(grep -i POSTGRES_PASSWORD "$MYTHIC_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d '"' | tr -d "'")"
if [ -z "$POSTGRES_PASSWORD" ]; then
    warn "Could not read POSTGRES_PASSWORD from $MYTHIC_DIR/.env — skipping Patch 5"
    warn "Run manually: docker exec mythic_postgres psql ... -c 'ALTER TABLE agentstorage ADD CONSTRAINT agentstorage_unique_id UNIQUE USING INDEX agentstorage_unique_id;'"
else
    PSQL_URL="postgresql://mythic_user:${POSTGRES_PASSWORD}@localhost/mythic_db"
    # Check if it's already a constraint (not just an index)
    IS_CONSTRAINT=$(docker exec mythic_postgres psql "$PSQL_URL" -tAc \
        "SELECT COUNT(*) FROM pg_constraint WHERE conname='agentstorage_unique_id' AND conrelid='agentstorage'::regclass;" 2>/dev/null || echo "0")
    if [ "$IS_CONSTRAINT" = "1" ]; then
        ok "Patch 5 already applied  (agentstorage_unique_id is already a named constraint)"
    else
        docker exec mythic_postgres psql "$PSQL_URL" -c \
            "ALTER TABLE agentstorage ADD CONSTRAINT agentstorage_unique_id UNIQUE USING INDEX agentstorage_unique_id;" 2>&1 && \
        ok "Patch 5 applied  (agentstorage_unique_id converted to named UNIQUE CONSTRAINT)" || \
        warn "Patch 5 — ALTER TABLE failed (constraint may already exist or index name differs)"
    fi
fi

# ── Rebuild mythic_server ─────────────────────────────────────────────────────
# mythic_server uses a pre-built registry image (no build: context in docker-compose.yml).
# We must build the image locally from the Dockerfile and re-tag it to override the
# registry image, then restart the container.
MYTHIC_DOCKER_DIR="$MYTHIC_DIR/mythic-docker"
MYTHIC_IMAGE_TAG="ghcr.io/its-a-feature/mythic_server:v3.4.0.49"

[ -f "$MYTHIC_DOCKER_DIR/Dockerfile" ] || die "Dockerfile not found: $MYTHIC_DOCKER_DIR/Dockerfile"

info "Building mythic_server image from source (this compiles Go — may take a few minutes)..."
sudo docker build --no-cache -t "$MYTHIC_IMAGE_TAG" -f "$MYTHIC_DOCKER_DIR/Dockerfile" "$MYTHIC_DOCKER_DIR"
ok "mythic_server image built and tagged as $MYTHIC_IMAGE_TAG"

info "Restarting mythic_server container to use new image..."
cd "$MYTHIC_DIR"
if [ -f "./mythic-cli" ]; then
    sudo ./mythic-cli restart mythic_server
    ok "mythic_server container restarted"
else
    warn "mythic-cli not found — restart mythic_server manually:"
    warn "  cd $MYTHIC_DIR && sudo docker compose restart mythic_server"
fi

echo ""
ok "====================================================="
ok "  Mythic patches applied and mythic_server rebuilt"
ok "====================================================="
echo ""
info "Patches summary:"
echo "  utils.go Patch 1: GetFinalStringForDatabaseInstanceValueFromUserSuppliedValue"
echo "           — handles JSON-string-encoded array values during payload import/rebuild"
echo "  utils.go Patch 2: getSyncToDatabaseValueForDefaultValue"
echo "           — handles JSON-string-encoded array default values during agent sync"
echo "  Patch 3: hasura_claims.go — adds missing x-hasura-operations / x-hasura-admin-operations"
echo "           assignments (strings.Join) that Hasura requires as session variables"
echo "  Patch 4: operationeventlog_create_webhook.go — removed unused 'strings' import (build error fix)"
echo "  Patch 5: agentstorage — converts unique INDEX to named CONSTRAINT"
echo "           required for Hasura on_conflict upserts (link-to-parent dedup)"
echo "  Patch 6: preserve operator-set callback.ip ordering on beacons / RPC updates"
echo "           — keeps Set Primary IP from being clobbered by the next agent check-in"
echo "  Patch 7: force-close P2P callbackgraphedge on \`unlink*\` task completion"
echo "           — clears phantom P2P links left over when Apollo's PeerManager"
echo "             lost the peer locally and silently skipped the EdgeNode remove"
echo "  Patch 8: don't auto-revive hidden P2P callbacks on relay traffic"
echo "           — operator Hide now sticks for P2P; only explicit Show Callback"
echo "             brings them back. Direct-C2 callbacks unchanged."
echo "  Patch 9: SOCKS / RPORTFWD throughput collapse + silent drop fix"
echo "           — utils_proxy_traffic.go + util_agent_message_push_c2.go"
echo "           — bumps proxy channel buffers 1000→16384 (+ 2000→16384 top-level),"
echo "             converts three silent-drop selects to try-then-block-10s so"
echo "             backpressure flows to the agent POST instead of corrupting"
echo "             the TCP stream, and removes the 20ms read-loop throttle."
