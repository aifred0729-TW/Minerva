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
    echo -e "${BOLD}Minerva Setup Script v2.0${NC}"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  setup    - Full setup and verification (default)"
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
    echo -e "${BOLD}║  Minerva Custom Nodes Setup v2.0     ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
    echo ""
    
    check_environment
    
    log_step "Checking Environment"
    check_containers || log_warn "Some containers not running"
    
    verify_installation
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
