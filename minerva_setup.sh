#!/bin/bash
###############################################################################
# Minerva Custom Graph Nodes - Unified Setup Script (v2.0 Optimized)
# 
# One script to rule them all - setup, test, fix, and deploy
###############################################################################

set -e

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# Logging
log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_error()   { echo -e "${RED}[✗]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
log_step()    { echo -e "\n${CYAN}${BOLD}=== $1 ===${NC}"; }

# Check if in correct directory
check_environment() {
    if [ ! -f "docker-compose.yml" ]; then
        log_error "Please run from Mythic root directory"
        exit 1
    fi
}

# Get Hasura admin secret
get_hasura_secret() {
    if [ -f ".env" ]; then
        grep -E "^HASURA_SECRET=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'"
    else
        echo "mythic"
    fi
}

# Configure Hasura to track agentstorage table
configure_hasura() {
    log_step "Configuring Hasura"
    
    if ! docker ps | grep -q "mythic_graphql"; then
        log_error "Hasura not running"
        return 1
    fi
    
    local HASURA_SECRET=$(get_hasura_secret)
    local HASURA_URL="http://localhost:8080"
    
    # Check if we can reach Hasura from host
    if ! curl -s --connect-timeout 2 "$HASURA_URL/healthz" > /dev/null 2>&1; then
        # Try through docker network
        HASURA_URL="http://mythic_graphql:8080"
        log_info "Using docker network for Hasura"
    fi
    
    log_info "Tracking agentstorage table..."
    
    # Track the table using Hasura metadata API
    local TRACK_RESULT=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "x-hasura-admin-secret: $HASURA_SECRET" \
        --data '{
            "type": "pg_track_table",
            "args": {
                "source": "default",
                "table": {
                    "schema": "public",
                    "name": "agentstorage"
                }
            }
        }' \
        "$HASURA_URL/v1/metadata" 2>/dev/null || echo '{"error":"connection failed"}')
    
    if echo "$TRACK_RESULT" | grep -q '"message":"success"'; then
        log_success "agentstorage table tracked"
    elif echo "$TRACK_RESULT" | grep -q "already tracked"; then
        log_success "agentstorage already tracked"
    elif echo "$TRACK_RESULT" | grep -q "connection failed"; then
        # Try via docker exec
        log_info "Trying via docker exec..."
        TRACK_RESULT=$(docker exec mythic_graphql curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "x-hasura-admin-secret: $HASURA_SECRET" \
            --data '{
                "type": "pg_track_table",
                "args": {
                    "source": "default",
                    "table": {
                        "schema": "public",
                        "name": "agentstorage"
                    }
                }
            }' \
            http://localhost:8080/v1/metadata 2>/dev/null || echo '{"error":"failed"}')
        
        if echo "$TRACK_RESULT" | grep -q '"message":"success"\|already tracked'; then
            log_success "agentstorage table configured"
        else
            log_warn "Could not auto-track table. Manual setup may be needed."
            log_info "Response: $TRACK_RESULT"
        fi
    else
        log_warn "Table tracking response: $TRACK_RESULT"
    fi
    
    # Set permissions for all roles
    log_info "Setting permissions..."
    
    for role in "mythic_admin" "operator" "spectator"; do
        # Select permission
        curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "x-hasura-admin-secret: $HASURA_SECRET" \
            --data "{
                \"type\": \"pg_create_select_permission\",
                \"args\": {
                    \"source\": \"default\",
                    \"table\": {\"schema\": \"public\", \"name\": \"agentstorage\"},
                    \"role\": \"$role\",
                    \"permission\": {
                        \"columns\": \"*\",
                        \"filter\": {}
                    }
                }
            }" \
            "$HASURA_URL/v1/metadata" > /dev/null 2>&1 || true
        
        # Insert permission
        curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "x-hasura-admin-secret: $HASURA_SECRET" \
            --data "{
                \"type\": \"pg_create_insert_permission\",
                \"args\": {
                    \"source\": \"default\",
                    \"table\": {\"schema\": \"public\", \"name\": \"agentstorage\"},
                    \"role\": \"$role\",
                    \"permission\": {
                        \"check\": {},
                        \"columns\": \"*\"
                    }
                }
            }" \
            "$HASURA_URL/v1/metadata" > /dev/null 2>&1 || true
        
        # Update permission
        curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "x-hasura-admin-secret: $HASURA_SECRET" \
            --data "{
                \"type\": \"pg_create_update_permission\",
                \"args\": {
                    \"source\": \"default\",
                    \"table\": {\"schema\": \"public\", \"name\": \"agentstorage\"},
                    \"role\": \"$role\",
                    \"permission\": {
                        \"filter\": {},
                        \"columns\": \"*\"
                    }
                }
            }" \
            "$HASURA_URL/v1/metadata" > /dev/null 2>&1 || true
        
        # Delete permission
        curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "x-hasura-admin-secret: $HASURA_SECRET" \
            --data "{
                \"type\": \"pg_create_delete_permission\",
                \"args\": {
                    \"source\": \"default\",
                    \"table\": {\"schema\": \"public\", \"name\": \"agentstorage\"},
                    \"role\": \"$role\",
                    \"permission\": {
                        \"filter\": {}
                    }
                }
            }" \
            "$HASURA_URL/v1/metadata" > /dev/null 2>&1 || true
    done
    
    log_success "Permissions configured for all roles"
    
    # Verify by testing a query
    log_info "Verifying configuration..."
    local TEST_RESULT=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "x-hasura-admin-secret: $HASURA_SECRET" \
        --data '{"query":"query { agentstorage(limit: 1) { unique_id } }"}' \
        "$HASURA_URL/v1/graphql" 2>/dev/null || \
        docker exec mythic_graphql curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "x-hasura-admin-secret: $HASURA_SECRET" \
            --data '{"query":"query { agentstorage(limit: 1) { unique_id } }"}' \
            http://localhost:8080/v1/graphql 2>/dev/null)
    
    if echo "$TEST_RESULT" | grep -q '"data"'; then
        log_success "Hasura configuration verified!"
        return 0
    else
        log_error "Verification failed: $TEST_RESULT"
        return 1
    fi
}

# Check Docker containers
check_containers() {
    local all_running=true
    for container in mythic_postgres mythic_graphql mythic_react; do
        if docker ps | grep -q "$container"; then
            log_success "$container running"
        else
            log_warn "$container not running"
            all_running=false
        fi
    done
    $all_running
}

# Verify file exists
verify_file() {
    if [ -f "$1" ]; then
        log_success "Found: $(basename $1)"
        return 0
    else
        log_error "Missing: $1"
        return 1
    fi
}

# Main verification
verify_installation() {
    log_step "Verifying Installation"
    local errors=0
    
    MINERVA="MythicReactUI/src/Minerva"
    
    verify_file "${MINERVA}/types/customGraphNode.ts" || ((errors++))
    verify_file "${MINERVA}/lib/customGraphNodeService.ts" || ((errors++))
    verify_file "${MINERVA}/lib/api.ts" || ((errors++))
    verify_file "${MINERVA}/components/CallbackGraph.tsx" || ((errors++))
    
    # Check for key exports
    if grep -q "GET_CUSTOM_GRAPH_NODES" "${MINERVA}/lib/api.ts" 2>/dev/null; then
        log_success "GraphQL queries defined"
    else
        log_error "GraphQL queries missing"
        ((errors++))
    fi
    
    if grep -q "parseAgentStorageResults" "${MINERVA}/lib/customGraphNodeService.ts" 2>/dev/null; then
        log_success "Service functions defined"
    else
        log_error "Service functions missing"
        ((errors++))
    fi
    
    return $errors
}

# Test database connectivity
test_database() {
    log_step "Testing Database"
    
    if ! docker ps | grep -q "mythic_graphql"; then
        log_warn "Hasura not running, skipping DB tests"
        return 1
    fi
    
    # Try to query agentstorage
    local result=$(docker exec mythic_graphql curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "x-hasura-admin-secret: \$HASURA_GRAPHQL_ADMIN_SECRET" \
        --data '{"query":"query { agentstorage(where: {unique_id: {_like: \"minerva_%\"}}, limit: 1) { unique_id } }"}' \
        http://localhost:8080/v1/graphql 2>/dev/null || echo '{"errors":[]}')
    
    if echo "$result" | grep -q '"data"'; then
        log_success "Database accessible"
        
        # Count nodes and edges
        local node_count=$(echo "$result" | grep -o 'minerva_customnode_' | wc -l || echo "0")
        local edge_count=$(echo "$result" | grep -o 'minerva_graphedge_' | wc -l || echo "0")
        log_info "Found $node_count nodes, $edge_count edges"
        return 0
    else
        log_error "Database query failed"
        return 1
    fi
}

# Quick fix common issues
quick_fix() {
    log_step "Quick Fix"
    
    local CALLBACK_GRAPH="MythicReactUI/src/Minerva/components/CallbackGraph.tsx"
    
    # Fix typo: agenstorage -> agentstorage
    if grep -q "agenstorage" "$CALLBACK_GRAPH" 2>/dev/null; then
        log_warn "Found typo: agenstorage"
        sed -i 's/agenstorage/agentstorage/g' "$CALLBACK_GRAPH"
        log_success "Fixed typo"
    else
        log_success "No typos found"
    fi
    
    # Check DEBUG mode
    if grep -q "DEBUG_GRAPH = true" "$CALLBACK_GRAPH" 2>/dev/null; then
        log_warn "Debug mode is enabled (may affect performance)"
    else
        log_success "Debug mode disabled"
    fi
}

# Clean database
clean_database() {
    log_step "Database Cleanup"
    
    if ! docker ps | grep -q "mythic_graphql"; then
        log_warn "Hasura not running, cannot clean"
        return 1
    fi
    
    echo -n "Delete all custom nodes and edges? (y/N): "
    read -r confirm
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        log_info "Skipped"
        return 0
    fi
    
    # Delete edges
    docker exec mythic_graphql curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "x-hasura-admin-secret: \$HASURA_GRAPHQL_ADMIN_SECRET" \
        --data '{"query":"mutation { delete_agentstorage(where: {unique_id: {_like: \"minerva_graphedge_%\"}}) { affected_rows } }"}' \
        http://localhost:8080/v1/graphql > /dev/null 2>&1
    log_success "Cleared edges"
    
    # Delete nodes
    docker exec mythic_graphql curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "x-hasura-admin-secret: \$HASURA_GRAPHQL_ADMIN_SECRET" \
        --data '{"query":"mutation { delete_agentstorage(where: {unique_id: {_like: \"minerva_customnode_%\"}}) { affected_rows } }"}' \
        http://localhost:8080/v1/graphql > /dev/null 2>&1
    log_success "Cleared nodes"
}

# Restart container
restart_container() {
    log_step "Container Management"
    
    echo -n "Restart mythic_react container? (y/N): "
    read -r confirm
    if [[ $confirm =~ ^[Yy]$ ]]; then
        docker-compose restart mythic_react > /dev/null 2>&1
        log_success "Container restarted"
        log_info "Wait ~10s for startup, then refresh browser (Ctrl+Shift+R)"
    else
        log_info "Skipped"
    fi
}

# Print usage
usage() {
    echo -e "${BOLD}Minerva Setup Script v2.1${NC}"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  setup    - Full setup and verification (default)"
    echo "  hasura   - Configure Hasura only (track table + permissions)"
    echo "  verify   - Verify installation only"
    echo "  fix      - Apply quick fixes"
    echo "  clean    - Clean database"
    echo "  restart  - Restart container"
    echo "  status   - Show status overview"
    echo "  help     - Show this help"
    echo ""
}

# Status overview
show_status() {
    log_step "Minerva Status"
    
    check_containers
    echo ""
    verify_installation > /dev/null 2>&1 && log_success "Files verified" || log_error "Files missing"
    test_database > /dev/null 2>&1 && log_success "Database OK" || log_warn "Database unavailable"
}

# Full setup
full_setup() {
    clear
    echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Minerva Custom Nodes Setup v2.1     ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
    echo ""
    
    check_environment
    
    log_step "Checking Environment"
    check_containers || log_warn "Some containers not running"
    
    verify_installation
    configure_hasura
    quick_fix
    test_database || true
    restart_container
    
    echo ""
    log_step "Complete!"
    echo ""
    echo -e "${BOLD}Next Steps:${NC}"
    echo "  1. Refresh browser with Ctrl+Shift+R"
    echo "  2. Navigate to Callbacks graph view"
    echo "  3. Right-click to create custom nodes"
    echo ""
}

# Main
main() {
    case "${1:-setup}" in
        setup)   full_setup ;;
        hasura)  check_environment && configure_hasura ;;
        verify)  check_environment && verify_installation ;;
        fix)     check_environment && quick_fix ;;
        clean)   check_environment && clean_database ;;
        restart) check_environment && restart_container ;;
        status)  check_environment && show_status ;;
        help|--help|-h) usage ;;
        *)       log_error "Unknown command: $1"; usage; exit 1 ;;
    esac
}

main "$@"
