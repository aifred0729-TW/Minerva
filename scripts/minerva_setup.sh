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
MINERVA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$MINERVA_DIR/scripts"
MYTHIC_DIR="${MYTHIC_DIR:-/opt/Mythic}"
REACT_UI="$MYTHIC_DIR/MythicReactUI"
REACT_BAK="$MYTHIC_DIR/MythicReactUI.bak"
HASURA_METADATA="$MYTHIC_DIR/hasura-docker/metadata"

# Files/dirs unique to Minerva that need copying
MINERVA_SRC="$MINERVA_DIR/src"
MINERVA_CONFIGS=(
    ".env"
    "tailwind.config.js"
    "postcss.config.js"
    "tsconfig.json"
    "config-overrides.js"
    "package.json"
    "package-lock.json"
    "Dockerfile"
)

# ── Preflight ─────────────────────────────────────────────────────────────────
preflight() {
    [ -d "$MYTHIC_DIR" ]         || die "Mythic not found at $MYTHIC_DIR (set MYTHIC_DIR env var)"
    [ -d "$MINERVA_SRC" ]        || die "Minerva src not found at $MINERVA_SRC"
    command -v docker &>/dev/null || die "Docker not installed"
    command -v python3 &>/dev/null || die "Python3 not installed (needed for Hasura config)"
}

# ══════════════════════════════════════════════════════════════════════════════
# INSTALL
# ══════════════════════════════════════════════════════════════════════════════
do_install() {
    preflight
    info "Installing Minerva into $MYTHIC_DIR ..."

    # 1. Backup original MythicReactUI if not already backed up
    if [ -d "$REACT_UI" ] && [ ! -d "$REACT_BAK" ]; then
        info "Backing up original MythicReactUI -> MythicReactUI.bak"
        cp -a "$REACT_UI" "$REACT_BAK"
        ok "Backup created"
    elif [ -d "$REACT_BAK" ]; then
        ok "Backup already exists at MythicReactUI.bak"
    fi

    # 2. Copy Minerva source tree
    info "Copying Minerva source into MythicReactUI ..."
    # Copy src/ (merge — Minerva adds src/Minerva/ and modifies src/index.js, src/components/App.js)
    rsync -a --delete "$MINERVA_SRC/" "$REACT_UI/src/"
    ok "Source copied"

    # 2b. Copy public/ (audio files, index.html, etc.)
    info "Copying public/ assets ..."
    rsync -a "$MINERVA_DIR/public/" "$REACT_UI/public/"
    ok "Public assets copied"

    # 3. Copy config files
    info "Copying config files ..."
    for f in "${MINERVA_CONFIGS[@]}"; do
        if [ -f "$MINERVA_DIR/$f" ]; then
            cp "$MINERVA_DIR/$f" "$REACT_UI/$f"
        fi
    done
    ok "Config files copied"

    # 4. Copy scripts
    info "Copying helper scripts ..."
    for script in configure-hasura-agentstorage.sh debug-custom-nodes.sh clear-custom-nodes.sh; do
        [ -f "$SCRIPTS_DIR/$script" ] && cp "$SCRIPTS_DIR/$script" "$REACT_UI/$script"
    done
    [ -f "$SCRIPTS_DIR/clear-nodes.sql" ] && cp "$SCRIPTS_DIR/clear-nodes.sql" "$REACT_UI/clear-nodes.sql"
    ok "Scripts copied"

    # 5. Configure Hasura (agentstorage permissions for custom graph nodes)
    info "Configuring Hasura agentstorage permissions ..."
    if [ -f "$REACT_UI/configure-hasura-agentstorage.sh" ] && [ -d "$HASURA_METADATA" ]; then
        bash "$REACT_UI/configure-hasura-agentstorage.sh" || warn "Hasura config had issues (non-fatal)"
    else
        warn "Skipping Hasura config (metadata dir not found or script missing)"
    fi

    # 6. Rebuild mythic_react container
    info "Rebuilding mythic_react container ..."
    cd "$MYTHIC_DIR"
    if [ -f "./mythic-cli" ]; then
        sudo ./mythic-cli build mythic_react
        ok "mythic_react rebuilt and started"
    else
        die "mythic-cli not found at $MYTHIC_DIR/mythic-cli"
    fi

    echo ""
    ok "========================================="
    ok "  Minerva installed successfully!"
    ok "========================================="
    echo ""
    info "Wait ~2 minutes for webpack to compile, then visit:"
    echo "  https://127.0.0.1:7443/new/login"
    echo ""
    info "Run './minerva_setup.sh verify' to check status"
}

# ══════════════════════════════════════════════════════════════════════════════
# VERIFY
# ══════════════════════════════════════════════════════════════════════════════
do_verify() {
    info "Verifying Minerva installation ..."
    local errors=0

    # Check Minerva source in MythicReactUI
    if [ -d "$REACT_UI/src/Minerva" ]; then
        ok "Minerva source found in MythicReactUI"
    else
        err "Minerva source NOT found in MythicReactUI/src/Minerva"
        ((errors++))
    fi

    # Check key files
    for f in tailwind.config.js postcss.config.js tsconfig.json; do
        if [ -f "$REACT_UI/$f" ]; then
            ok "$f present"
        else
            err "$f missing"
            ((errors++))
        fi
    done

    # Check App.js has MinervaApp import
    if grep -q "MinervaApp" "$REACT_UI/src/components/App.js" 2>/dev/null; then
        ok "App.js routes to MinervaApp"
    else
        err "App.js does not reference MinervaApp"
        ((errors++))
    fi

    # Check index.js has MinervaApp import
    if grep -q "MinervaApp" "$REACT_UI/src/index.js" 2>/dev/null; then
        ok "index.js imports MinervaApp"
    else
        err "index.js does not import MinervaApp"
        ((errors++))
    fi

    # Check backup exists
    if [ -d "$REACT_BAK" ]; then
        ok "Original MythicReactUI backup exists"
    else
        warn "No backup found (MythicReactUI.bak)"
    fi

    # Check container
    if sudo docker ps --format '{{.Names}}' 2>/dev/null | grep -q "mythic_react"; then
        ok "mythic_react container is running"

        # Check if webpack compiled
        local last_log
        last_log=$(sudo docker logs mythic_react --tail 3 2>&1)
        if echo "$last_log" | grep -q "webpack compiled"; then
            if echo "$last_log" | grep -q "error"; then
                warn "webpack compiled with errors — run './minerva_setup.sh fix'"
            else
                ok "webpack compiled successfully"
            fi
        else
            info "webpack still compiling (may need a minute)"
        fi
    else
        err "mythic_react container is NOT running"
        ((errors++))
    fi

    # Check HTTP
    local http_code
    http_code=$(curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:7443/new/login 2>/dev/null || echo "000")
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
    info "Attempting to fix Minerva installation ..."

    # Re-sync source
    info "Re-syncing Minerva source ..."
    rsync -a --delete "$MINERVA_SRC/" "$REACT_UI/src/"
    rsync -a "$MINERVA_DIR/public/" "$REACT_UI/public/"
    for f in "${MINERVA_CONFIGS[@]}"; do
        [ -f "$MINERVA_DIR/$f" ] && cp "$MINERVA_DIR/$f" "$REACT_UI/$f"
    done
    ok "Source, public assets, and configs re-synced"

    # Restart container
    info "Restarting mythic_react ..."
    sudo docker restart mythic_react 2>/dev/null || {
        warn "Restart failed, rebuilding ..."
        cd "$MYTHIC_DIR" && sudo ./mythic-cli build mythic_react
    }
    ok "mythic_react restarted"

    echo ""
    info "Wait ~2 minutes for webpack, then run './minerva_setup.sh verify'"
}

# ══════════════════════════════════════════════════════════════════════════════
# STATUS
# ══════════════════════════════════════════════════════════════════════════════
do_status() {
    info "Mythic container status:"
    echo ""
    sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | grep mythic || warn "No Mythic containers found"
    echo ""

    if sudo docker ps --format '{{.Names}}' 2>/dev/null | grep -q "mythic_react"; then
        info "mythic_react recent logs:"
        echo "---"
        sudo docker logs mythic_react --tail 5 2>&1
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
# UNINSTALL (restore original)
# ══════════════════════════════════════════════════════════════════════════════
do_uninstall() {
    info "Restoring original MythicReactUI ..."

    if [ ! -d "$REACT_BAK" ]; then
        die "No backup found at $REACT_BAK — cannot restore"
    fi

    # Swap
    if [ -d "$REACT_UI" ]; then
        mv "$REACT_UI" "${REACT_UI}.minerva"
        info "Current Minerva UI saved as MythicReactUI.minerva"
    fi
    mv "$REACT_BAK" "$REACT_UI"
    ok "Original MythicReactUI restored"

    # Rebuild
    info "Rebuilding mythic_react with original UI ..."
    cd "$MYTHIC_DIR" && sudo ./mythic-cli build mythic_react
    ok "Original Mythic UI restored and running"
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════
usage() {
    echo "Minerva Setup — Advanced Mythic C2 Interface"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  (none)      Full install (backup + copy + build)"
    echo "  verify      Verify installation is correct"
    echo "  fix         Re-sync source and restart container"
    echo "  status      Show container status and logs"
    echo "  clean       Remove custom graph nodes from database"
    echo "  uninstall   Restore original MythicReactUI"
    echo "  help        Show this message"
    echo ""
    echo "Environment:"
    echo "  MYTHIC_DIR  Path to Mythic (default: /home/kali/Mythic)"
}

case "${1:-install}" in
    install|"")   do_install ;;
    verify)       do_verify ;;
    fix)          do_fix ;;
    status)       do_status ;;
    clean)        do_clean ;;
    uninstall)    do_uninstall ;;
    help|--help|-h) usage ;;
    *) err "Unknown command: $1"; usage; exit 1 ;;
esac
