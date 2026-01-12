#!/bin/bash
# Debug script to check Custom Graph Nodes data
# Run this to see what's in the database and test GraphQL queries

set -e

echo "🔍 Debugging Custom Graph Nodes"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get Mythic root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MYTHIC_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${BLUE}📁 Mythic Root: $MYTHIC_ROOT${NC}"
echo ""

# Check if containers are running
echo -e "${YELLOW}1️⃣ Checking Docker containers...${NC}"
if ! sudo docker ps | grep -q mythic_postgres; then
    echo -e "${RED}❌ mythic_postgres not running${NC}"
    exit 1
fi
if ! sudo docker ps | grep -q mythic_graphql; then
    echo -e "${RED}❌ mythic_graphql not running${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Containers are running${NC}"
echo ""

# Check database directly
echo -e "${YELLOW}2️⃣ Checking PostgreSQL database...${NC}"
echo -e "${BLUE}Query: SELECT * FROM agentstorage WHERE unique_id LIKE 'minerva_customnode_%'${NC}"
echo ""

DB_RESULT=$(sudo docker exec mythic_postgres psql -U mythic_user mythic_db -t -c "SELECT COUNT(*) FROM agentstorage WHERE unique_id LIKE 'minerva_customnode_%';" 2>/dev/null || echo "0")
NODE_COUNT=$(echo "$DB_RESULT" | tr -d ' ')

if [ "$NODE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ Found $NODE_COUNT custom node(s) in database${NC}"
    echo ""
    echo -e "${BLUE}Node details:${NC}"
    sudo docker exec mythic_postgres psql -U mythic_user mythic_db -c "SELECT id, unique_id, substring(encode(data, 'escape'), 1, 100) as data_preview FROM agentstorage WHERE unique_id LIKE 'minerva_customnode_%' ORDER BY id;"
else
    echo -e "${YELLOW}⚠️ No custom nodes found in database${NC}"
    echo -e "${YELLOW}This means nodes are not being saved to the database.${NC}"
fi
echo ""

# Test GraphQL query
echo -e "${YELLOW}3️⃣ Testing GraphQL query...${NC}"
echo -e "${BLUE}Query: agentstorage(where: {unique_id: {_like: \"minerva_customnode_%\"}})${NC}"
echo ""

# Get Hasura endpoint and admin secret
HASURA_ENDPOINT="http://localhost:8080/v1/graphql"
HASURA_SECRET=$(grep HASURA_GRAPHQL_ADMIN_SECRET "$MYTHIC_ROOT/.env" 2>/dev/null | cut -d'=' -f2 || echo "mythic_password")

# Prepare GraphQL query
GRAPHQL_QUERY='{
  "query": "query { agentstorage(where: {unique_id: {_like: \"minerva_customnode_%\"}}) { id unique_id data } }"
}'

echo -e "${BLUE}Endpoint: $HASURA_ENDPOINT${NC}"

# Execute GraphQL query
GRAPHQL_RESULT=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "x-hasura-admin-secret: $HASURA_SECRET" \
  -d "$GRAPHQL_QUERY" \
  "$HASURA_ENDPOINT")

echo "$GRAPHQL_RESULT" | python3 -m json.tool 2>/dev/null || echo "$GRAPHQL_RESULT"
echo ""

# Check if GraphQL returned data
if echo "$GRAPHQL_RESULT" | grep -q '"agentstorage"'; then
    GRAPHQL_COUNT=$(echo "$GRAPHQL_RESULT" | grep -o '"unique_id"' | wc -l)
    if [ "$GRAPHQL_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✅ GraphQL returned $GRAPHQL_COUNT node(s)${NC}"
    else
        echo -e "${YELLOW}⚠️ GraphQL query succeeded but returned 0 nodes${NC}"
    fi
else
    echo -e "${RED}❌ GraphQL query failed or returned no data${NC}"
fi
echo ""

# Test insert permission
echo -e "${YELLOW}4️⃣ Checking Hasura permissions...${NC}"
PERMISSIONS=$(sudo docker exec mythic_postgres psql -U mythic_user mythic_db -t -c "SELECT COUNT(*) FROM information_schema.table_privileges WHERE table_name='agentstorage';" 2>/dev/null || echo "0")
echo -e "${BLUE}Database permissions: $PERMISSIONS${NC}"

# Check Hasura metadata
if [ -f "$MYTHIC_ROOT/hasura-docker/metadata/tables.yaml" ]; then
    if grep -A 50 "name: agentstorage" "$MYTHIC_ROOT/hasura-docker/metadata/tables.yaml" | grep -q "insert_permissions"; then
        echo -e "${GREEN}✅ Hasura insert permissions configured${NC}"
    else
        echo -e "${RED}❌ Hasura insert permissions NOT configured${NC}"
        echo -e "${YELLOW}💡 Run: ./configure-hasura-agentstorage.sh${NC}"
    fi
else
    echo -e "${RED}❌ tables.yaml not found${NC}"
fi
echo ""

# Test data format
if [ "$NODE_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}5️⃣ Testing data format...${NC}"
    
    # Get one sample node
    SAMPLE_DATA=$(sudo docker exec mythic_postgres psql -U mythic_user mythic_db -t -A -c "SELECT encode(data, 'escape') FROM agentstorage WHERE unique_id LIKE 'minerva_customnode_%' LIMIT 1;" 2>/dev/null)
    
    echo -e "${BLUE}Raw data (first 200 chars):${NC}"
    echo "$SAMPLE_DATA" | cut -c1-200
    echo ""
    
    # Try to parse as JSON
    if echo "$SAMPLE_DATA" | python3 -m json.tool &>/dev/null; then
        echo -e "${GREEN}✅ Data is valid JSON${NC}"
        echo -e "${BLUE}Parsed:${NC}"
        echo "$SAMPLE_DATA" | python3 -m json.tool | head -20
    else
        echo -e "${YELLOW}⚠️ Data is not plain JSON (might be base64 or hex)${NC}"
        
        # Try base64 decode
        if echo "$SAMPLE_DATA" | base64 -d 2>/dev/null | python3 -m json.tool &>/dev/null; then
            echo -e "${GREEN}✅ Data is base64-encoded JSON${NC}"
            echo -e "${BLUE}Decoded:${NC}"
            echo "$SAMPLE_DATA" | base64 -d | python3 -m json.tool | head -20
        else
            echo -e "${RED}❌ Could not decode data${NC}"
        fi
    fi
fi
echo ""

# Summary
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}📊 Summary${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "Nodes in database: ${GREEN}$NODE_COUNT${NC}"
echo -e "GraphQL working: $(echo "$GRAPHQL_RESULT" | grep -q '"agentstorage"' && echo -e "${GREEN}YES${NC}" || echo -e "${RED}NO${NC}")"
echo ""

if [ "$NODE_COUNT" -eq 0 ]; then
    echo -e "${RED}🔴 Problem: No data in database${NC}"
    echo -e "${YELLOW}Possible causes:${NC}"
    echo "  1. Insert mutation is failing silently"
    echo "  2. Data is not being serialized correctly"
    echo "  3. Hasura permissions not configured"
    echo ""
    echo -e "${YELLOW}💡 Next steps:${NC}"
    echo "  1. Check browser console for errors"
    echo "  2. Verify Hasura permissions: ./configure-hasura-agentstorage.sh"
    echo "  3. Try creating a node and check Hasura logs:"
    echo "     sudo docker logs mythic_graphql --tail 50"
elif ! echo "$GRAPHQL_RESULT" | grep -q '"agenstorage"'; then
    echo -e "${RED}🔴 Problem: Data exists but GraphQL not returning it${NC}"
    echo -e "${YELLOW}Possible causes:${NC}"
    echo "  1. Query syntax incorrect"
    echo "  2. Hasura select permissions not configured"
    echo "  3. Frontend using wrong query"
    echo ""
    echo -e "${YELLOW}💡 Next steps:${NC}"
    echo "  1. Check Hasura Console: http://localhost:8080"
    echo "  2. Verify select permissions"
    echo "  3. Test query in GraphiQL"
else
    echo -e "${GREEN}✅ Everything looks good!${NC}"
    echo -e "${YELLOW}If nodes still don't show in GUI:${NC}"
    echo "  1. Check browser console (F12) for JavaScript errors"
    echo "  2. Verify data format is being parsed correctly"
    echo "  3. Check if customNodes state is being set"
fi
echo ""
