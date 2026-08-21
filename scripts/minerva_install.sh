#!/bin/bash
# Minerva Setup Script — Install, verify, fix, and manage Minerva UI for Mythic C2
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[*]${NC} $1"; }
ok()    { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[-]${NC} $1"; }
die()   { err "$1"; exit 1; }

# ── Paths ─────────────────────────────────────────────────────────────────────
# Minerva runs as its OWN docker stack, fully separate from Mythic. We only ever
# touch Mythic's backend (idempotent Go patches, .env reachability, Hasura perms)
# — never its UI container or MythicReactUI directory.
MINERVA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$MINERVA_DIR/scripts"
MYTHIC_DIR="${MYTHIC_DIR:-/opt/Mythic}"
MSF_COMPOSE="$MINERVA_DIR/docker-compose.metasploit.yml"
MSF_ENV="$MINERVA_DIR/.env.msf"
HASURA_METADATA="$MYTHIC_DIR/hasura-docker/metadata"
MINERVA_SRC="$MINERVA_DIR/src"

# ── Preflight ─────────────────────────────────────────────────────────────────
preflight() {
    [ -d "$MYTHIC_DIR" ]         || die "Mythic not found at $MYTHIC_DIR (set MYTHIC_DIR env var)"
    [ -d "$MINERVA_SRC" ]        || die "Minerva src not found at $MINERVA_SRC"
    command -v docker &>/dev/null || die "Docker not installed"
    command -v python3 &>/dev/null || die "Python3 not installed (needed for Hasura config)"
}

# ── Shared Mythic-side preparation (needed by BOTH deployment models) ──────────
# .env cross-container reachability + Go source patches + agent patches + Hasura
# agentstorage permissions. All steps are idempotent.
prepare_mythic() {
    # 1. Mythic .env reachability config + Go source patches + rebuild mythic_server.
    #    mythic_change.sh is the single idempotent record of every Mythic-side
    #    mutation (per the workspace rules). It configures the .env FIRST so a
    #    fresh Mythic comes up with the right port bindings.
    info "Configuring Mythic .env + applying source patches ..."
    if [ -f "$SCRIPTS_DIR/mythic_change.sh" ]; then
        MYTHIC_DIR="$MYTHIC_DIR" bash "$SCRIPTS_DIR/mythic_change.sh"
        ok "Mythic .env configured, source patched, mythic_server rebuilt"
    else
        warn "mythic_change.sh not found — Mythic .env NOT configured and patches skipped!"
        warn "Manually run: bash $SCRIPTS_DIR/mythic_change.sh"
    fi

    # 2. Mythic-agent source patches (Apollo SOCKS/TCP fixes, IPC buffers)
    info "Applying Mythic agent patches ..."
    if [ -f "$SCRIPTS_DIR/MythicAgentPatch.sh" ]; then
        MYTHIC_DIR="$MYTHIC_DIR" bash "$SCRIPTS_DIR/MythicAgentPatch.sh"
        ok "Agent patches applied (rebuild payloads to deploy)"
    else
        warn "MythicAgentPatch.sh not found — skipping agent source patches"
        warn "Manually run: bash $SCRIPTS_DIR/MythicAgentPatch.sh"
    fi

    # 3. Hasura agentstorage permissions (custom graph nodes). Runs straight from
    #    scripts/ — the script now honors MYTHIC_DIR to locate the metadata dir.
    info "Configuring Hasura agentstorage permissions ..."
    if [ -f "$SCRIPTS_DIR/configure-hasura-agentstorage.sh" ] && [ -d "$HASURA_METADATA" ]; then
        MYTHIC_DIR="$MYTHIC_DIR" bash "$SCRIPTS_DIR/configure-hasura-agentstorage.sh" \
            || warn "Hasura config had issues (non-fatal)"
    else
        warn "Skipping Hasura config (metadata dir not found or script missing)"
    fi
}

# ── Record the host's machine name for /server-info (idempotent) ──────────────
# nginx cannot discover this itself: inside the container $hostname is just the
# container ID. The file is mounted into nginx, so rewriting it and reloading is
# enough — no image rebuild.
# ── Should /server-info name this machine? ────────────────────────────────────
# ON by default: the login screen names the node an operator is pointed at,
# which is the whole point of the endpoint.
#
# Turn it OFF on an exposed C2. /server-info answers before authentication, so
# with it on, anyone who can reach the login page learns the internal machine
# name — an opsec disclosure, and a fingerprint that says "Minerva" rather than
# stock Mythic. With it off the endpoint still answers, with an empty name, and
# the login screen falls back to the address the browser dialled.
#
#   MINERVA_EXPOSE_HOSTNAME=false ./scripts/minerva_install.sh server-info
expose_hostname() {
    local v="${MINERVA_EXPOSE_HOSTNAME:-}"
    # Fall back to the project .env so the choice survives re-runs.
    if [ -z "$v" ] && [ -f "$MINERVA_DIR/.env" ]; then
        v="$(grep -E '^MINERVA_EXPOSE_HOSTNAME=' "$MINERVA_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2-)"
    fi
    case "$(printf '%s' "$v" | tr '[:upper:]' '[:lower:]')" in
        false|0|no|off) return 1 ;;
        *)              return 0 ;;
    esac
}

write_server_info() {
    local f="$MINERVA_DIR/nginx/runtime/server-info.json"
    mkdir -p "$(dirname "$f")"

    local host=""
    if expose_hostname; then host="$(hostname)"; fi

    # Encoded, never interpolated. A hostname containing a quote or a newline
    # would otherwise produce invalid JSON — and one shaped like
    #   a","role":"admin
    # would inject extra keys into the document nginx serves unauthenticated.
    if command -v python3 >/dev/null 2>&1; then
        python3 -c 'import json,sys; print(json.dumps({"hostname": sys.argv[1]}))' "$host" > "$f"
    else
        # Fallback: strip anything that cannot appear unescaped in a JSON string.
        local safe; safe="$(printf '%s' "$host" | tr -d '"\\' | tr -cd '[:print:]')"
        printf '{"hostname":"%s"}\n' "$safe" > "$f"
    fi

    if [ -n "$host" ]; then
        ok "server-info.json names this node: ${host}"
    else
        ok "server-info.json left empty (MINERVA_EXPOSE_HOSTNAME=false); login shows the dialled address"
    fi
}

# ── Bring the Minerva standalone stack up / down ───────────────────────────────
compose_up() {
    info "Building & starting the Minerva standalone stack (nginx :443 + minerva-dev) ..."
    cd "$MINERVA_DIR"
    write_server_info
    docker compose build
    docker compose up -d
    ok "minerva + minerva-dev started"
}

compose_down() {
    info "Stopping the Minerva standalone stack ..."
    cd "$MINERVA_DIR"
    docker compose down
    ok "minerva + minerva-dev stopped"
}

# ══════════════════════════════════════════════════════════════════════════════
# INSTALL — default: Standalone Docker deployment (the official runtime).
# Minerva runs as its own two containers and proxies the Mythic API over
# host.docker.internal. Mythic's own UI (mythic_react) is left untouched.
# ══════════════════════════════════════════════════════════════════════════════
do_install() {
    preflight
    info "Installing Minerva — Standalone Docker deployment"
    info "Mythic dir: $MYTHIC_DIR"

    prepare_mythic
    compose_up

    echo ""
    ok "========================================="
    ok "  Minerva installed (Standalone Docker)!"
    ok "========================================="
    echo ""
    info "First webpack compile takes ~1-2 min. Watch: docker logs -f minerva-dev"
    info "Then browse to  https://<host>/  (redirects to /new/login)."
    info "API is proxied to: https://host.docker.internal:7443 (override via MYTHIC_ADDRESS in docker-compose.yml)"
    echo ""
    info "Run './minerva_install.sh verify' to check status"
}

# ══════════════════════════════════════════════════════════════════════════════
# VERIFY
# ══════════════════════════════════════════════════════════════════════════════
do_verify() {
    info "Verifying Minerva (Standalone Docker) installation ..."
    local errors=0

    # 1. Mythic .env cross-container reachability keys (the fresh-install killer)
    local env="$MYTHIC_DIR/.env"
    if [ -f "$env" ]; then
        for key in NGINX_BIND_LOCALHOST_ONLY MYTHIC_SERVER_DYNAMIC_PORTS_BIND_LOCALHOST_ONLY; do
            if grep -qE "^${key}=\"?false\"?$" "$env"; then
                ok "$key = false"
            else
                err "$key is not false in .env — containers can't reach host.docker.internal ports"
                err "  Fix: bash $SCRIPTS_DIR/mythic_change.sh  (then 'cd $MYTHIC_DIR && sudo ./mythic-cli start')"
                errors=$((errors+1))
            fi
        done
    else
        warn "$env not found — is Mythic initialized? (run its install first)"
    fi

    # 2. Minerva containers
    for c in minerva minerva-dev; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${c}$"; then
            ok "$c container is running"
        else
            err "$c container is NOT running — run './minerva_install.sh up'"
            errors=$((errors+1))
        fi
    done

    # 3. Mythic backend present
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^mythic_nginx$'; then
        ok "mythic_nginx is running (proxy backend)"
    else
        warn "mythic_nginx not running — Minerva has no Mythic backend to proxy to"
    fi

    # 4. webpack compiled?
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^minerva-dev$"; then
        local last_log
        last_log=$(docker logs minerva-dev --tail 5 2>&1)
        if echo "$last_log" | grep -q "webpack compiled"; then
            if echo "$last_log" | grep -qi "error"; then
                warn "webpack compiled with errors — check 'docker logs minerva-dev'"
            else
                ok "webpack compiled successfully"
            fi
        else
            info "webpack still compiling (may need a minute)"
        fi
    fi

    # 5. UI responding on 443
    local http_code
    http_code=$(curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1/new/login 2>/dev/null || echo "000")
    if [ "$http_code" = "200" ]; then
        ok "UI responding (HTTP 200)"
    else
        warn "UI not responding yet (HTTP $http_code) — may still be compiling"
    fi

    echo ""
    if [ "$errors" -eq 0 ]; then
        ok "All checks passed!"
    else
        err "$errors check(s) failed"
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
# FIX
# ══════════════════════════════════════════════════════════════════════════════
do_fix() {
    preflight
    info "Re-applying Minerva standalone stack ..."

    # Re-assert Mythic .env reachability (idempotent; source patches already built)
    if [ -f "$SCRIPTS_DIR/mythic_change.sh" ]; then
        info "Re-checking Mythic .env reachability keys ..."
        # Only the .env portion is cheap; the full script also rebuilds the Go
        # server (skip that here — 'install' owns the rebuild). We re-run the
        # whole script only if the reachability keys are wrong.
        local env="$MYTHIC_DIR/.env"
        if ! grep -qE '^NGINX_BIND_LOCALHOST_ONLY="?false"?$' "$env" 2>/dev/null \
           || ! grep -qE '^MYTHIC_SERVER_DYNAMIC_PORTS_BIND_LOCALHOST_ONLY="?false"?$' "$env" 2>/dev/null; then
            warn ".env reachability keys wrong — running mythic_change.sh to fix"
            MYTHIC_DIR="$MYTHIC_DIR" bash "$SCRIPTS_DIR/mythic_change.sh" || warn "mythic_change.sh reported issues"
        else
            ok ".env reachability keys already correct"
        fi
    fi

    # Rebuild & restart the standalone stack. Source is volume-mounted, so a
    # restart of minerva-dev forces a fresh webpack compile.
    cd "$MINERVA_DIR"
    docker compose up -d --build
    docker restart minerva-dev >/dev/null 2>&1 || true
    ok "Standalone stack rebuilt and restarted"

    echo ""
    info "Wait ~1-2 minutes for webpack, then run './minerva_install.sh verify'"
}

# ══════════════════════════════════════════════════════════════════════════════
# STATUS
# ══════════════════════════════════════════════════════════════════════════════
do_status() {
    info "Minerva + Mythic container status:"
    echo ""
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null \
        | grep -E 'minerva|mythic|NAMES' || warn "No Minerva/Mythic containers found"
    echo ""

    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^minerva-dev$"; then
        info "minerva-dev recent logs:"
        echo "---"
        docker logs minerva-dev --tail 6 2>&1
        echo "---"
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
# CLEAN
# ══════════════════════════════════════════════════════════════════════════════
do_clean() {
    info "Cleaning custom graph nodes from database ..."
    if [ -f "$SCRIPTS_DIR/clear-custom-nodes.sh" ]; then
        bash "$SCRIPTS_DIR/clear-custom-nodes.sh"
    else
        # Inline cleanup
        local secret="${HASURA_SECRET:-$(grep '^HASURA_SECRET=' "$MYTHIC_DIR/.env" 2>/dev/null | cut -d= -f2 || echo 'mythic_admin_secret')}"
        local graphql_port="${HASURA_PORT:-8080}"
        curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "x-hasura-admin-secret: $secret" \
            --data '{"query":"mutation { delete_agentstorage(where: {unique_id: {_like: \"minerva_customnode_%\"}}) { affected_rows } }"}' \
            "http://127.0.0.1:$graphql_port/v1/graphql" 2>/dev/null | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    if 'data' in r: print(f'Deleted {r[\"data\"][\"delete_agentstorage\"][\"affected_rows\"]} node(s)')
    else: print(f'Error: {r}')
except: print('Failed to parse response')
"
    fi
    ok "Done — refresh your browser"
}

# ══════════════════════════════════════════════════════════════════════════════
# UNINSTALL — tear down Minerva's own stack. Mythic is never touched at the UI
# level, so there is nothing to "restore" there. The idempotent backend patches
# in mythic_change.sh keep their own .minerva.bak files if you want to revert
# Mythic itself (see that script).
# ══════════════════════════════════════════════════════════════════════════════
do_uninstall() {
    info "Stopping & removing the Minerva standalone stack ..."
    ( cd "$MINERVA_DIR" && docker compose down 2>/dev/null ) && ok "Standalone stack stopped" || warn "Nothing to stop"
    ok "Minerva removed. Mythic (its containers, UI, and network) is untouched."
}

# ══════════════════════════════════════════════════════════════════════════════
# MSF-START — Deploy & start Metasploit RPC container
# ══════════════════════════════════════════════════════════════════════════════
do_msf_start() {
    info "Starting Metasploit RPC container (minerva_msf) ..."
    [ -f "$MSF_COMPOSE" ] || die "Compose file not found: $MSF_COMPOSE"
    # Verify Mythic's file storage is present so the MSF container can
    # bind-mount it (`/mythic_files`). Without this the MSF library upload
    # picker won't be able to push files Mythic's file manager holds.
    local mythic_files_dir="$MYTHIC_DIR/mythic-docker/src/files"
    if [ ! -d "$mythic_files_dir" ]; then
        warn "Mythic file dir not found: $mythic_files_dir (file-library upload will be unavailable until Mythic creates it)"
        mkdir -p "$mythic_files_dir" 2>/dev/null || true
    fi
    # Point the compose bind-mount at THIS Mythic (respects a non-default MYTHIC_DIR)
    export MINERVA_MYTHIC_FILES="$mythic_files_dir"

    # ── msfrpcd credential ───────────────────────────────────────────────────
    # docker-compose.metasploit.yml now declares MSFRPC_PASS as REQUIRED (:?), so
    # there is no shipped default to fall back to. Generate one per deployment,
    # keep it in an untracked .env.msf, and publish it to the UI through
    # nginx/runtime/msf-config.json — which nginx only serves to a caller holding
    # a valid Mythic JWT. Idempotent: an existing .env.msf is reused, never
    # regenerated, so restarting does not orphan live sessions.
    if [ ! -f "$MSF_ENV" ]; then
        local gen_pass
        gen_pass="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | cut -c1-24)"
        umask 077
        cat > "$MSF_ENV" <<EOF
# Generated by minerva_install.sh — untracked (see .gitignore), do not commit.
MSFRPC_USER=msf
MSFRPC_PASS=$gen_pass
MSFRPC_PORT=55553
EOF
        ok "Generated msfrpcd credential → $MSF_ENV"
    else
        info "Reusing existing msfrpcd credential from $MSF_ENV"
    fi
    set -a; . "$MSF_ENV"; set +a

    # Hand the credential to the UI via the runtime dir nginx already mounts.
    mkdir -p "$MINERVA_DIR/nginx/runtime"
    printf '{"user":"%s","pass":"%s"}\n' "$MSFRPC_USER" "$MSFRPC_PASS" \
        > "$MINERVA_DIR/nginx/runtime/msf-config.json"
    # 644, not 640: nginx's worker runs unprivileged inside the container and
    # the bind mount preserves host ownership, so 640 made every read fail with
    # EACCES — which nginx reports to the browser as 403. The control that
    # actually protects this file is the auth_request gate in front of
    # /msf-config, not its mode; .env.msf keeps the restrictive perms.
    chmod 644 "$MINERVA_DIR/nginx/runtime/msf-config.json" 2>/dev/null || true

    docker compose --env-file "$MSF_ENV" -f "$MSF_COMPOSE" up -d
    ok "minerva_msf container started (mythic files mounted RO at /mythic_files)"
    ok "MSF SOCKS tunnel range exposed: host 7100-7131 → container 7100-7131"
    ok "msfrpcd RPC bound to 127.0.0.1 only; UI reaches it through the authenticated /msf-rpc/ gate"
    info "Waiting for msfrpcd to initialize (this may take 30-60s on first run) ..."
    local attempts=0
    while [ $attempts -lt 30 ]; do
        if docker logs minerva_msf 2>&1 | grep -q "MSGRPC starting"; then
            ok "msfrpcd is ready!"
            return
        fi
        sleep 2
        attempts=$((attempts+1))
    done
    warn "Timed out waiting for msfrpcd — check 'docker logs minerva_msf'"
}

# ══════════════════════════════════════════════════════════════════════════════
# MSF-STOP — Stop Metasploit RPC container
# ══════════════════════════════════════════════════════════════════════════════
do_msf_stop() {
    info "Stopping Metasploit RPC container ..."
    docker compose --env-file "$MSF_ENV" -f "$MSF_COMPOSE" down
    ok "minerva_msf stopped"
}

# ══════════════════════════════════════════════════════════════════════════════
# MSF-STATUS — Show Metasploit container status & recent logs
# ══════════════════════════════════════════════════════════════════════════════
do_msf_status() {
    info "Metasploit container status:"
    echo ""
    docker ps --filter "name=minerva_msf" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || warn "Container not found"
    echo ""
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "minerva_msf"; then
        info "Recent logs:"
        echo "---"
        docker logs minerva_msf --tail 10 2>&1
        echo "---"
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
# MSF-VERIFY — Run Python script to verify RPC connectivity
# ══════════════════════════════════════════════════════════════════════════════
do_msf_verify() {
    info "Verifying MSF-RPC connectivity ..."
    local script="$SCRIPTS_DIR/msfrpc_verify.py"
    [ -f "$script" ] || die "Verification script not found: $script"
    python3 "$script"
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════
usage() {
    echo "Minerva Setup — Advanced Mythic C2 Interface"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Minerva runs as its own Docker stack, fully separate from Mythic."
    echo ""
    echo "Commands:"
    echo "  (none)      Full install: Mythic .env config + backend patches + Hasura,"
    echo "              then bring up the minerva + minerva-dev containers (nginx :443)."
    echo "  up          Build & start the Minerva stack"
    echo "  down        Stop the Minerva stack"
    echo "  verify      Verify the installation is correct"
    echo "  fix         Re-assert .env + rebuild/restart the stack"
    echo "  status      Show Minerva + Mythic container status and logs"
    echo "  clean       Remove custom graph nodes from database"
    echo "  uninstall   Stop & remove the Minerva stack (Mythic left untouched)"
    echo "  server-info Rewrite the pre-auth /server-info document"
    echo ""
    echo "Node name on the login screen (/server-info, answered pre-auth):"
    echo "  On by default. To stop naming this machine to unauthenticated"
    echo "  visitors, set MINERVA_EXPOSE_HOSTNAME=false in Minerva/.env (or in"
    echo "  the environment) and run:  $0 server-info"
    echo ""
    echo "Metasploit:"
    echo "  msf-start   Deploy & start Metasploit RPC container"
    echo "  msf-stop    Stop Metasploit RPC container"
    echo "  msf-status  Show Metasploit container status & logs"
    echo "  msf-verify  Verify MSF-RPC connectivity (Python)"
    echo ""
    echo "  help        Show this message"
    echo ""
    echo "Environment:"
    echo "  MYTHIC_DIR    Path to Mythic (default: /opt/Mythic)"
    echo "  MYTHIC_ADDRESS  Nginx upstream for Mythic API (set in docker-compose.yml;"
    echo "                  default: https://host.docker.internal:7443)"
}

case "${1:-install}" in
    install|"")   do_install ;;
    server-info)  write_server_info
                  info "Reload nginx to serve it: docker compose exec minerva nginx -s reload" ;;
    up)           preflight; compose_up ;;
    down)         compose_down ;;
    verify)       do_verify ;;
    fix)          do_fix ;;
    status)       do_status ;;
    clean)        do_clean ;;
    uninstall)    do_uninstall ;;
    msf-start)    do_msf_start ;;
    msf-stop)     do_msf_stop ;;
    msf-status)   do_msf_status ;;
    msf-verify)   do_msf_verify ;;
    help|--help|-h) usage ;;
    *) err "Unknown command: $1"; usage; exit 1 ;;
esac
