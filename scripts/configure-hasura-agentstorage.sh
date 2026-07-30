#!/bin/bash
# Configure Hasura metadata for agentstorage table to enable Custom Graph Nodes
# This script adds necessary permissions and configurations for CRUD operations
# Run from MythicReactUI directory

set -e

echo "🔧 Configuring Hasura for Custom Graph Nodes..."

# Define colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the Mythic root directory. Honor an explicit MYTHIC_DIR (set by
# minerva_install.sh so this can run straight from scripts/) and otherwise fall
# back to the parent dir — the legacy behavior when copied into MythicReactUI/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MYTHIC_ROOT="${MYTHIC_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
HASURA_METADATA_DIR="$MYTHIC_ROOT/hasura-docker/metadata"

echo -e "${YELLOW}📁 Mythic Root: $MYTHIC_ROOT${NC}"
echo -e "${YELLOW}📁 Hasura Metadata: $HASURA_METADATA_DIR${NC}"

# Check if metadata directory exists
if [ ! -d "$HASURA_METADATA_DIR" ]; then
    echo -e "${RED}❌ Error: Hasura metadata directory not found at $HASURA_METADATA_DIR${NC}"
    exit 1
fi

# Backup existing tables.yaml
BACKUP_FILE="$HASURA_METADATA_DIR/tables.yaml.backup.$(date +%Y%m%d_%H%M%S)"
echo -e "${YELLOW}📦 Creating backup: $BACKUP_FILE${NC}"
cp "$HASURA_METADATA_DIR/tables.yaml" "$BACKUP_FILE"

# Create temporary Python script to update tables.yaml
TEMP_SCRIPT=$(mktemp)
cat > "$TEMP_SCRIPT" << 'PYTHON_EOF'
import yaml
import sys

tables_file = sys.argv[1]

# Read existing tables.yaml
with open(tables_file, 'r') as f:
    tables = yaml.safe_load(f)

# Find agentstorage table
agentstorage_config = None
for i, table in enumerate(tables):
    if isinstance(table, dict) and 'table' in table:
        if table['table'].get('name') == 'agentstorage':
            agentstorage_config = table
            table_index = i
            break

if not agentstorage_config:
    print("❌ agentstorage table not found in tables.yaml")
    sys.exit(1)

# Update agentstorage configuration with permissions
agentstorage_config['insert_permissions'] = [
    {
        'role': 'operator',
        'permission': {
            'check': {},
            'columns': ['unique_id', 'data']
        }
    },
    {
        'role': 'operation_admin',
        'permission': {
            'check': {},
            'columns': ['unique_id', 'data']
        }
    },
    {
        'role': 'mythic_admin',
        'permission': {
            'check': {},
            'columns': ['unique_id', 'data']
        }
    },
    {
        'role': 'developer',
        'permission': {
            'check': {},
            'columns': ['unique_id', 'data']
        }
    }
]

agentstorage_config['select_permissions'] = [
    {
        'role': 'spectator',
        'permission': {
            'columns': ['id', 'unique_id', 'data'],
            'filter': {}
        }
    },
    {
        'role': 'operator',
        'permission': {
            'columns': ['id', 'unique_id', 'data'],
            'filter': {}
        }
    },
    {
        'role': 'operation_admin',
        'permission': {
            'columns': ['id', 'unique_id', 'data'],
            'filter': {}
        }
    },
    {
        'role': 'mythic_admin',
        'permission': {
            'columns': ['id', 'unique_id', 'data'],
            'filter': {}
        }
    },
    {
        'role': 'developer',
        'permission': {
            'columns': ['id', 'unique_id', 'data'],
            'filter': {}
        }
    }
]

agentstorage_config['update_permissions'] = [
    {
        'role': 'operator',
        'permission': {
            'columns': ['data'],
            'filter': {},
            'check': {}
        }
    },
    {
        'role': 'operation_admin',
        'permission': {
            'columns': ['data'],
            'filter': {},
            'check': {}
        }
    },
    {
        'role': 'mythic_admin',
        'permission': {
            'columns': ['data'],
            'filter': {},
            'check': {}
        }
    },
    {
        'role': 'developer',
        'permission': {
            'columns': ['data'],
            'filter': {},
            'check': {}
        }
    }
]

agentstorage_config['delete_permissions'] = [
    {
        'role': 'operator',
        'permission': {
            'filter': {}
        }
    },
    {
        'role': 'operation_admin',
        'permission': {
            'filter': {}
        }
    },
    {
        'role': 'mythic_admin',
        'permission': {
            'filter': {}
        }
    },
    {
        'role': 'developer',
        'permission': {
            'filter': {}
        }
    }
]

# Update the table in the list
tables[table_index] = agentstorage_config

# Write back to file
with open(tables_file, 'w') as f:
    yaml.dump(tables, f, default_flow_style=False, sort_keys=False)

print("✅ Successfully updated agentstorage permissions")
PYTHON_EOF

# Run the Python script to update tables.yaml
echo -e "${YELLOW}🔄 Updating agentstorage permissions in tables.yaml...${NC}"
if command -v python3 &> /dev/null; then
    python3 "$TEMP_SCRIPT" "$HASURA_METADATA_DIR/tables.yaml"
elif command -v python &> /dev/null; then
    python "$TEMP_SCRIPT" "$HASURA_METADATA_DIR/tables.yaml"
else
    echo -e "${RED}❌ Error: Python not found. Please install Python 3.${NC}"
    rm "$TEMP_SCRIPT"
    exit 1
fi

# Clean up temp script
rm "$TEMP_SCRIPT"

# Apply metadata to Hasura
echo -e "${YELLOW}🚀 Applying metadata to Hasura...${NC}"

# Check if Hasura CLI is available
if command -v hasura &> /dev/null; then
    echo -e "${GREEN}✅ Hasura CLI found${NC}"
    cd "$MYTHIC_ROOT/hasura-docker"
    hasura metadata apply --skip-update-check
    echo -e "${GREEN}✅ Metadata applied successfully!${NC}"
elif [ -f "$MYTHIC_ROOT/mythic-cli" ]; then
    echo -e "${YELLOW}📋 Using Docker to apply metadata...${NC}"
    
    # Get Hasura container name
    HASURA_CONTAINER=$(sudo docker ps --format '{{.Names}}' | grep -E 'hasura|graphql' | head -1)
    
    if [ -z "$HASURA_CONTAINER" ]; then
        echo -e "${RED}❌ Hasura container not found. Is Mythic running?${NC}"
        echo -e "${YELLOW}💡 Run './mythic-cli start' first${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Found Hasura container: $HASURA_CONTAINER${NC}"
    
    # Reload Hasura metadata
    sudo docker exec "$HASURA_CONTAINER" hasura-cli metadata reload --skip-update-check 2>/dev/null || \
    sudo docker restart "$HASURA_CONTAINER"
    
    echo -e "${GREEN}✅ Metadata reloaded successfully!${NC}"
else
    echo -e "${RED}❌ Neither Hasura CLI nor mythic-cli found${NC}"
    echo -e "${YELLOW}💡 Please reload Hasura metadata manually:${NC}"
    echo -e "   1. Go to Hasura Console (usually http://localhost:8080)"
    echo -e "   2. Click 'Settings' → 'Reload Metadata'"
    exit 1
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Configuration Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📋 What was done:${NC}"
echo "  ✓ Backed up tables.yaml to: $BACKUP_FILE"
echo "  ✓ Added insert permissions for agentstorage"
echo "  ✓ Added select permissions for agentstorage"
echo "  ✓ Added update permissions for agentstorage"
echo "  ✓ Added delete permissions for agentstorage"
echo "  ✓ Applied metadata to Hasura"
echo ""
echo -e "${GREEN}🎉 Custom Graph Nodes should now work!${NC}"
echo ""
echo -e "${YELLOW}🧪 Test it:${NC}"
echo "  1. Refresh your browser"
echo "  2. Try creating a custom node"
echo "  3. Check for success message"
echo ""
echo -e "${YELLOW}🔄 If issues persist:${NC}"
echo "  • Check Hasura logs: docker logs \$(docker ps | grep hasura | awk '{print \$1}')"
echo "  • Verify permissions in Hasura Console"
echo "  • Restore backup if needed: cp $BACKUP_FILE $HASURA_METADATA_DIR/tables.yaml"
echo ""
