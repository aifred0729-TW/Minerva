#!/bin/bash

# Clear Custom Nodes from Database
# This script removes all custom nodes from agentstorage

echo "🗑️  Clearing custom nodes from database..."

# Execute GraphQL mutation to delete all custom nodes
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-hasura-admin-secret: ${HASURA_GRAPHQL_ADMIN_SECRET:-mythic_admin_secret}" \
  --data '{"query":"mutation { delete_agentstorage(where: {unique_id: {_like: \"minerva_customnode_%\"}}) { affected_rows } }"}' \
  http://127.0.0.1:3000/v1/graphql 2>/dev/null | python3 -c "
import sys, json
try:
    result = json.load(sys.stdin)
    if 'data' in result and 'delete_agentstorage' in result['data']:
        rows = result['data']['delete_agentstorage']['affected_rows']
        print(f'✅ Deleted {rows} custom node(s)')
    elif 'errors' in result:
        print(f'❌ Error: {result[\"errors\"][0][\"message\"]}')
    else:
        print('❌ Unexpected response')
except:
    print('❌ Failed to parse response')
"

echo ""
echo "Done! Please refresh your browser and try creating a new custom node."
