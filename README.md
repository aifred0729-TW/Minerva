# Minerva

Advanced Mythic C2 Interface with collaborative graph visualization.

## Setup

```bash
./minerva_setup.sh        # Full setup
./minerva_setup.sh verify # Verify installation
./minerva_setup.sh fix    # Fix issues
```

## Custom Graph Nodes

Create custom nodes in Callbacks → Graph View:

| Action | How |
|--------|-----|
| Create node | Right-click empty space → "Create Custom Node" |
| Connect nodes | Right-click node → "Set Parent" |
| Edit/Delete | Right-click node → Edit/Delete |

Data syncs across all users (5s polling).

## File Structure

```
src/Minerva/
├── components/CallbackGraph.tsx  # Graph UI
├── lib/api.ts                    # GraphQL
├── lib/customGraphNodeService.ts # Serialization
└── types/customGraphNode.ts      # Types
```

## Debug

Set `DEBUG_GRAPH = true` in `CallbackGraph.tsx` to enable logging.

## Troubleshooting

```bash
./minerva_setup.sh status  # Check status
./minerva_setup.sh clean   # Reset database
docker-compose restart mythic_react
```
