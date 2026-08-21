import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import {
    BoxGeometry, Color, DoubleSide, EdgesGeometry, Group,
    LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
    MeshStandardMaterial, Plane, Points, ShaderMaterial, Vector2, Vector3,
} from 'three';
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Text, Line, Billboard } from '@react-three/drei';
import type { TopoNode, SubnetZone } from '../../types/topology';
import { SUBNET_COLOR, SUBNET_PADDING, ipToSubnet } from './topology';
import { extractAllIPs } from '../../lib/quickhacks';
import { Info } from 'lucide-react';

// Forward-declared above the NodeSphere props because TS can't see it yet
// when used inline. The actual type comes from later in this file via the
// `SubnetRegistry` export — we accept `any` here to avoid a circular type
// reference.
type SubnetRegistryLike = {
    aabbs: Map<string, { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }>;
    colors: Map<string, number>;
};

export const NodeSphere = React.memo(({
    node, isSelected, onSelect, onContextMenu, onDragStart, onDragMove, onDragEnd, pickingDim, subnetZones, subnetRegistry,
}: {
    node: TopoNode;
    isSelected: boolean;
    onSelect: (id: string, screenPos?: { x: number; y: number }) => void;
    onContextMenu: (e: ThreeEvent<MouseEvent>, id: string) => void;
    onDragStart: (id: string) => void;
    onDragMove?: (id: string, pos: Vector3) => void;
    onDragEnd: (id: string, pos: Vector3) => void;
    pickingDim?: 'dim' | 'brighten' | null;
    subnetZones?: SubnetZone[];
    /** Live AABBs published by SubnetSystem each frame. When present we
     *  prefer this over the build-time zone.center/size since drags
     *  mutate the actual rendered bounds in real time. */
    subnetRegistry?: SubnetRegistryLike;
}) => {
    const meshRef = useRef<Mesh>(null!);
    const groupRef = useRef<Group>(null!);
    const [hovered, setHovered] = useState(false);
    const [dragging, setDragging] = useState(false);
    const { camera, raycaster, gl, invalidate } = useThree();
    const dragPlane = useRef(new Plane());
    const dragOffset = useRef(new Vector3());
    // Double-click detection refs
    const clickCountRef = useRef(0);
    const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const DOUBLE_CLICK_THRESHOLD = 400; // ms window for double-click

    useEffect(() => {
        return () => { if (clickTimerRef.current) clearTimeout(clickTimerRef.current); };
    }, []);

    const r = node.radius;

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        if (meshRef.current) {
            if (node.type === 'core') {
                meshRef.current.rotation.y = t * 0.2;
                meshRef.current.rotation.x = t * 0.15;
            } else {
                meshRef.current.rotation.y = t * 0.1;
            }
            // Breathing emissive pulse for alive nodes
            if (node.alive && node.type !== 'core') {
                const mat = meshRef.current.material as MeshStandardMaterial;
                let base = isSelected ? 3.0 : hovered ? 2.0 : 1.2;
                if (pickingDim === 'dim') base *= 0.25;
                else if (pickingDim === 'brighten') base *= 1.3;
                mat.emissiveIntensity = base + Math.sin(t * 1.5 + node.position.x * 2) * (pickingDim === 'dim' ? 0.1 : 0.4);
            }
            // Dim core node during picking
            if (node.type === 'core' && pickingDim === 'dim') {
                const mat = meshRef.current.material as MeshStandardMaterial;
                mat.emissiveIntensity = 0.3;
            }
        }
    });

    const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (e.button === 2) return;
        // Build the drag plane through the node, perpendicular to the camera,
        // and stash the offset between the cursor's projection on that plane
        // and the node's actual centre. After this, the window-level handlers
        // (see useEffect below) take over so dragging keeps tracking the
        // pointer even when the cursor leaves the mesh.
        const camDir = new Vector3();
        camera.getWorldDirection(camDir);
        dragPlane.current.setFromNormalAndCoplanarPoint(camDir, node.position);
        const intersection = new Vector3();
        raycaster.ray.intersectPlane(dragPlane.current, intersection);
        dragOffset.current.subVectors(node.position, intersection);
        gl.domElement.style.cursor = 'grabbing';
        onDragStart(node.id);
        setDragging(true);
    }, [camera, raycaster, gl, node.id, node.position, onDragStart]);

    // Every cidr this node has ANY observed IP in — including non-primary
    // interfaces and IPs reported by sibling callbacks on the same machine
    // (`node.allCallbacks` is populated for grouped-by-host nodes). Used by
    // enforceSubnetBounds: a node may freely enter any zone whose cidr is
    // in this set; foreign zones push it out.
    const eligibleCidrs = useMemo(() => {
        const set = new Set<string>();
        const harvest = (ipField: unknown) => {
            for (const ip of extractAllIPs(ipField)) {
                const cidr = ipToSubnet(ip);
                if (cidr) set.add(cidr);
            }
        };
        // Primary callback's IPs
        if (node.data) harvest((node.data as any).ip);
        // Other callbacks bundled under this host node (grouped-by-host)
        const all = (node as any).allCallbacks as Array<{ ip?: unknown }> | undefined;
        if (Array.isArray(all)) for (const cb of all) harvest(cb?.ip);
        // Custom node IP / hardcoded subnet from build-time
        const customIp = (node.data as any)?.ip_address;
        if (customIp) harvest(customIp);
        if (node.subnet) set.add(node.subnet);
        return set;
    }, [node]);

    /**
     * Block the node from entering subnet zones it doesn't belong to.
     *
     * Membership rule (per the operator's spec):
     *   • A zone whose cidr is in this node's eligibleCidrs → allowed.
     *     Any reported IP qualifies — not just the primary. So a host
     *     with NICs in two subnets can be parked in either zone freely.
     *   • A zone whose cidr is NOT in eligibleCidrs → forbidden. Even if
     *     the operator drags the node toward an empty corner of that
     *     zone, the position is clamped back to just outside the AABB.
     *
     * Live AABBs come from the SubnetSystem registry when available;
     * we fall back to build-time `zone.center/size` for the brief window
     * before the first frame's recompute settles.
     */
    const enforceSubnetBounds = useCallback((pos: Vector3): Vector3 => {
        if (!subnetZones || subnetZones.length === 0) return pos;
        const out = pos.clone();
        for (const zone of subnetZones) {
            // Allowed: this node has at least one IP matching the zone's cidr.
            if (eligibleCidrs.has(zone.cidr)) continue;

            // Get current AABB — prefer live values from the registry,
            // fall back to the stale build-time ones if not published yet.
            const live = subnetRegistry?.aabbs.get(zone.cidr);
            let cx: number, cy: number, cz: number, hx: number, hy: number, hz: number;
            if (live) {
                cx = (live.minX + live.maxX) / 2; cy = (live.minY + live.maxY) / 2; cz = (live.minZ + live.maxZ) / 2;
                hx = (live.maxX - live.minX) / 2; hy = (live.maxY - live.minY) / 2; hz = (live.maxZ - live.minZ) / 2;
            } else {
                cx = zone.center.x; cy = zone.center.y; cz = zone.center.z;
                hx = zone.size.x / 2; hy = zone.size.y / 2; hz = zone.size.z / 2;
            }
            const dx = out.x - cx, dy = out.y - cy, dz = out.z - cz;
            if (Math.abs(dx) < hx && Math.abs(dy) < hy && Math.abs(dz) < hz) {
                // Push out through the closest face.
                const penetrations = [
                    { axis: 'x' as const, sign:  1, depth: hx - dx },
                    { axis: 'x' as const, sign: -1, depth: hx + dx },
                    { axis: 'y' as const, sign:  1, depth: hy - dy },
                    { axis: 'y' as const, sign: -1, depth: hy + dy },
                    { axis: 'z' as const, sign:  1, depth: hz - dz },
                    { axis: 'z' as const, sign: -1, depth: hz + dz },
                ];
                const min = penetrations.reduce((a, b) => a.depth < b.depth ? a : b);
                const margin = node.radius + 0.1;
                const centerOnAxis = min.axis === 'x' ? cx : min.axis === 'y' ? cy : cz;
                const halfOnAxis   = min.axis === 'x' ? hx : min.axis === 'y' ? hy : hz;
                out[min.axis] = centerOnAxis + min.sign * (halfOnAxis + margin);
            }
        }
        return out;
    }, [subnetZones, subnetRegistry, eligibleCidrs, node.radius]);

    /** While a drag is in progress, listen on the window so the node keeps
     *  tracking the cursor even when it flies past the mesh's silhouette.
     *  R3F's mesh-level onPointerMove is gated by raycasting and stops firing
     *  the moment the cursor leaves the geometry, which used to make fast
     *  drags freeze and then teleport on release. */
    useEffect(() => {
        if (!dragging) return;
        const canvas = gl.domElement;
        const ndc = new Vector2();
        const intersection = new Vector3();

        const handleMove = (ev: PointerEvent) => {
            ev.preventDefault();
            const rect = canvas.getBoundingClientRect();
            ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
            ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(ndc, camera);
            if (raycaster.ray.intersectPlane(dragPlane.current, intersection)) {
                const desired = intersection.clone().add(dragOffset.current);
                const newPos = enforceSubnetBounds(desired);
                node.position.copy(newPos);
                if (groupRef.current) groupRef.current.position.copy(newPos);
                // Sync the live drag position upward every frame so that any
                // mid-drag topology rebuild (the parent useMemo reruns whenever
                // a subscription tick arrives) restores the dragged node to
                // where the cursor actually is — otherwise the node snaps back
                // to its previously committed position and looks frozen until
                // pointerup teleports it.
                onDragMove?.(node.id, node.position);
                // Canvas runs in frameloop="demand", so direct ref mutations
                // above don't trigger a re-render on their own — request one
                // explicitly so the node visibly tracks the cursor.
                invalidate();
            }
        };

        const handleUp = () => {
            setDragging(false);
            onDragEnd(node.id, node.position.clone());
            canvas.style.cursor = 'auto';
            invalidate();
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        window.addEventListener('pointercancel', handleUp);
        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
            window.removeEventListener('pointercancel', handleUp);
        };
    }, [dragging, camera, raycaster, gl, node, onDragMove, onDragEnd, enforceSubnetBounds, invalidate]);

    const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const nativeEvent = e.nativeEvent || (e as unknown as MouseEvent);
        onSelect(node.id, { x: nativeEvent.clientX ?? 0, y: nativeEvent.clientY ?? 0 });

        // Double-click detection: open context menu on 2nd rapid click
        clickCountRef.current += 1;
        if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
        if (clickCountRef.current >= 2) {
            clickCountRef.current = 0;
            onContextMenu(e, node.id);
        } else {
            clickTimerRef.current = setTimeout(() => {
                clickCountRef.current = 0;
            }, DOUBLE_CLICK_THRESHOLD);
        }
    }, [node.id, onSelect, onContextMenu]);

    const handleRightClick = useCallback((e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onContextMenu(e, node.id);
    }, [node.id, onContextMenu]);

    const color = useMemo(() => node.color.getHex(), [node.color]);
    const colorStr = useMemo(() => `#${node.color.getHexString()}`, [node.color]);

    return (
        <group ref={groupRef} position={node.position}>
            {/* ── Main geometric body (self-emitting) ── */}
            <mesh
                ref={meshRef}
                onClick={handleClick}
                onContextMenu={handleRightClick}
                onPointerDown={handlePointerDown}
                onPointerOver={() => { if (!dragging) { setHovered(true); gl.domElement.style.cursor = 'pointer'; } }}
                onPointerOut={() => { setHovered(false); if (!dragging) gl.domElement.style.cursor = 'auto'; }}
            >
                {node.type === 'core' ? (
                    <icosahedronGeometry args={[r, 0]} />
                ) : (
                    <octahedronGeometry args={[r * 0.85, 0]} />
                )}
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={pickingDim === 'dim' ? 0.3 : isSelected ? 3.0 : hovered ? 2.0 : pickingDim === 'brighten' ? 1.5 : 1.2}
                    toneMapped={false}
                />
            </mesh>

            {/* ── Point light — only while selected/hovered ──
                numPointLights is part of three.js's shader program cache key, so
                one light PER NODE meant any change in host count forced a full
                MeshStandardMaterial recompile (a synchronous stall on the 10s
                poll), and the program stopped linking entirely around 250-340
                nodes — the topology went black. The node body is already
                emissive + toneMapped={false}, so the light buys almost nothing
                when the node is neither selected nor hovered. */}
            {(isSelected || hovered) && <pointLight
                color={color}
                intensity={pickingDim === 'dim' ? 0.1 : isSelected ? 2 : hovered ? 1 : pickingDim === 'brighten' ? 0.6 : 0.4}
                distance={isSelected ? 5 : 3}
                decay={2}
            />}

            {/* ── Label ── */}
            <Billboard position={[0, -r - 0.35, 0]}>
                <Text
                    fontSize={0.22}
                    color={isSelected ? '#ffffff' : colorStr}
                    anchorX="center"
                    anchorY="top"
                    outlineWidth={0.02}
                    outlineColor="#000000"
                    font={undefined}
                    fontWeight="bold"
                >
                    {node.label}
                </Text>
            </Billboard>
            {/* ── Info lines: IP, OS, Privilege ── */}
            {node.type === 'callback' && (
                <>
                    <Billboard position={[0, -r - 0.6, 0]}>
                        <Text
                            fontSize={0.14}
                            color="#8ec8f8"
                            anchorX="center"
                            anchorY="top"
                            outlineWidth={0.01}
                            outlineColor="#000000"
                            font={undefined}
                        >
                            {node.ipAddress || '?.?.?.?'}
                        </Text>
                    </Billboard>
                    <Billboard position={[0, -r - 0.78, 0]}>
                        <Text
                            fontSize={0.12}
                            color="#aaa"
                            anchorX="center"
                            anchorY="top"
                            outlineWidth={0.01}
                            outlineColor="#000000"
                            font={undefined}
                        >
                            {[node.osLabel, node.privilege].filter(Boolean).join(' · ')}
                        </Text>
                    </Billboard>
                    {(node.callbackCount ?? 0) > 1 && (
                        <Billboard position={[0, -r - 0.94, 0]}>
                            <Text
                                fontSize={0.11}
                                color="#888"
                                anchorX="center"
                                anchorY="top"
                                outlineWidth={0.01}
                                outlineColor="#000000"
                                font={undefined}
                            >
                                {`${node.callbackCount} callbacks`}
                            </Text>
                        </Billboard>
                    )}
                </>
            )}
            {node.type !== 'callback' && (
                <Billboard position={[0, -r - 0.6, 0]}>
                    <Text
                        fontSize={0.12}
                        color="#666666"
                        anchorX="center"
                        anchorY="top"
                        outlineWidth={0.01}
                        outlineColor="#000000"
                        font={undefined}
                    >
                        {node.sublabel}
                    </Text>
                </Billboard>
            )}
        </group>
    );
});
NodeSphere.displayName = 'NodeSphere';

// Vertical step between stacked labels in a bundle (world units).
// 0.22 keeps three labels readable without crowding nor stretching too
// far above the line.
const BUNDLE_LABEL_Y_STEP = 0.22;
// Base vertical offset of a single (unbundled) label above the line midpoint.
const BUNDLE_LABEL_Y_BASE = 0.3;

/** Animated data-beam edge — always straight. When this edge is part of a
 *  bundle (multiple TopoEdges between the same node pair, e.g. http + tcp
 *  on the same host), the line itself overlaps with its siblings but each
 *  label is stacked vertically at the line midpoint so they don't
 *  collide. */
export const DataBeamEdge = React.memo(({
    sourcePos, targetPos, color, isP2P, label, bundleIndex, bundleCount,
}: {
    sourcePos: Vector3;
    targetPos: Vector3;
    color: Color;
    isP2P: boolean;
    label: string;
    bundleIndex?: number;
    bundleCount?: number;
}) => {
    const dashRef = useRef<any>(null);
    const mainLineRef = useRef<any>(null);
    const billboardRef = useRef<Group>(null);

    const bIdx = bundleIndex ?? 0;
    const bCount = bundleCount ?? 1;

    // Scratch buffer + last-written endpoints, per edge instance. `setPositions`
    // rebuilds a Line2's InstancedInterleavedBuffer and flags it for re-upload,
    // so calling it unconditionally meant two gl.bufferData per edge per frame
    // — 24,000/sec at 200 edges on a frameloop="always" canvas — for endpoints
    // that only move while a node is actually being dragged. The old code also
    // allocated four arrays a frame (two toArray + two flat) purely as GC feed.
    const posScratch = useRef<number[]>([0, 0, 0, 0, 0, 0]);
    const lastPos = useRef<number[]>([NaN, NaN, NaN, NaN, NaN, NaN]);

    // Update geometry + label position every frame so edges follow dragged nodes.
    useFrame(({ clock }) => {
        if (dashRef.current) {
            dashRef.current.dashOffset = -clock.getElapsedTime() * 1.5;
        }
        const last = lastPos.current;
        const moved =
            last[0] !== sourcePos.x || last[1] !== sourcePos.y || last[2] !== sourcePos.z ||
            last[3] !== targetPos.x || last[4] !== targetPos.y || last[5] !== targetPos.z;
        if (moved && mainLineRef.current?.geometry && dashRef.current?.geometry) {
            // Latched only once both geometries exist, so a frame that runs
            // before the refs attach doesn't record the move as already applied.
            const pts = posScratch.current;
            pts[0] = last[0] = sourcePos.x;
            pts[1] = last[1] = sourcePos.y;
            pts[2] = last[2] = sourcePos.z;
            pts[3] = last[3] = targetPos.x;
            pts[4] = last[4] = targetPos.y;
            pts[5] = last[5] = targetPos.z;
            mainLineRef.current.geometry.setPositions(pts);
            dashRef.current.geometry.setPositions(pts);
        }
        // Not gated on `moved`: the billboard also tracks bundleIndex/bundleCount,
        // which change by prop, and position.set costs nothing on the GPU.
        if (billboardRef.current) {
            // Straight line midpoint — labels for all bundle members
            // sit horizontally above the same midpoint, with each one
            // vertically stepped so http/tcp/smb stack neatly instead
            // of overprinting. Stack is centred around the base offset
            // so the single-edge case keeps its original visual.
            const mx = (sourcePos.x + targetPos.x) * 0.5;
            const my = (sourcePos.y + targetPos.y) * 0.5;
            const mz = (sourcePos.z + targetPos.z) * 0.5;
            const yStep = bCount > 1
                ? (bIdx - (bCount - 1) / 2) * BUNDLE_LABEL_Y_STEP
                : 0;
            billboardRef.current.position.set(mx, my + BUNDLE_LABEL_Y_BASE + yStep, mz);
        }
    });

    const points = useMemo(() => [sourcePos, targetPos], [sourcePos, targetPos]);

    const colorHex = useMemo(() => `#${color.getHexString()}`, [color]);

    return (
        <group>
            {/* Main line.
                frustumCulled=false because positions are mutated every frame
                via setPositions() — Line2's bounding sphere doesn't refresh
                automatically, so the renderer would cull from some angles. */}
            <Line
                ref={mainLineRef}
                points={points}
                color={colorHex}
                lineWidth={isP2P ? 1.5 : 1}
                transparent
                opacity={0.4}
                frustumCulled={false}
            />
            {/* Flowing dashes */}
            <Line
                ref={dashRef}
                points={points}
                color={colorHex}
                lineWidth={isP2P ? 2 : 1.5}
                dashed
                dashSize={0.3}
                dashScale={1}
                gapSize={0.6}
                transparent
                opacity={0.8}
                frustumCulled={false}
            />
            {/* Label at midpoint — always faces camera */}
            {label && (
                <Billboard ref={billboardRef}>
                    <Text
                        fontSize={0.12}
                        color={colorHex}
                        anchorX="center"
                        anchorY="bottom"
                        outlineWidth={0.01}
                        outlineColor="#000000"
                        font={undefined}
                    >
                        {label}
                    </Text>
                </Billboard>
            )}
        </group>
    );
});
DataBeamEdge.displayName = 'DataBeamEdge';

/**
 * Subnet-zone colour palette. Index 0 is the default SUBNET_COLOR used
 * when zones don't overlap (preserves Minerva's existing visual). Higher
 * indices kick in only when the SubnetSystem coordinator detects an
 * overlap with another zone and needs to give the operator visual
 * separation between them.
 */
export const SUBNET_COLOR_PALETTE: Color[] = [
    SUBNET_COLOR,                  // default green
    new Color('#fbbf24'),          // amber
    new Color('#22d3ee'),          // cyan
    new Color('#a855f7'),          // purple
    new Color('#fb7185'),          // rose
    new Color('#60a5fa'),          // blue
    new Color('#34d399'),          // teal
];

/** Per-zone AABB + color-index registry. SubnetVolume writes its current
 *  AABB on each tick; SubnetSystem reads them, computes overlap, and
 *  writes back the colour index each zone should use. */
export interface SubnetRegistry {
    aabbs: Map<string, { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }>;
    colors: Map<string, number>;
}
export function createSubnetRegistry(): SubnetRegistry {
    return { aabbs: new Map(), colors: new Map() };
}

/**
 * Futuristic subnet zone — translucent volume with glowing scan-line edges.
 *
 * The AABB is recomputed every frame from the LIVE positions of the member
 * nodes (looked up via `nodes` prop), so dragging a member around makes the
 * zone follow and reshape itself to stay wrapped around the nodes. The
 * box geometry itself is a unit cube; we use the outer group's scale to
 * stretch it to the live size, and re-position corner accents / billboards
 * each frame from the same scaled bounds.
 *
 * Colour comes from the SubnetSystem coordinator: this component writes
 * its live AABB into the shared registry; the coordinator (registered
 * with a higher useFrame priority so it runs *after* every SubnetVolume)
 * detects overlaps with other zones and writes a colour index back into
 * the registry. We re-apply it to our materials every frame.
 */
const UNIT_BOX_GEO = new BoxGeometry(1, 1, 1);
const UNIT_EDGES_GEO = new EdgesGeometry(UNIT_BOX_GEO);

export const SubnetVolume = React.memo(({
    zone, nodes, registry, onContextMenu,
}: {
    zone: SubnetZone;
    nodes: TopoNode[];
    /** Shared registry written/read across all zones. When omitted the
     *  zone renders with the default colour and does no overlap logic. */
    registry?: SubnetRegistry;
    /** Right-click on the volume — used by the operator to hide a specific
     *  network space. The handler receives the volume's CIDR plus the
     *  screen-space coordinates of the click so the menu can anchor
     *  there. */
    onContextMenu?: (e: ThreeEvent<MouseEvent>, cidr: string) => void;
}) => {
    const groupRef = useRef<Group>(null!);
    const boxGroupRef = useRef<Group>(null!);
    const meshRef = useRef<Mesh>(null!);
    const edgesRef = useRef<LineSegments>(null!);
    const glowRef = useRef<LineSegments>(null!);
    const cornerRefs = useRef<Array<Mesh | null>>([null, null, null, null]);
    const topLabelRef = useRef<any>(null);
    const countLabelRef = useRef<any>(null);

    // Member node lookup — refreshed when membership changes (rare).
    // Positions themselves are mutated in place by the drag handler, so we
    // don't need to re-derive on every frame; we just read them.
    const members = useMemo(() => {
        const want = new Set(zone.nodeIds);
        return nodes.filter(n => want.has(n.id));
    }, [zone.nodeIds, nodes]);

    // Re-usable buffers to avoid GC churn each frame.
    const minBuf = useRef(new Vector3());
    const maxBuf = useRef(new Vector3());
    const centerBuf = useRef(new Vector3());
    const sizeBuf = useRef(new Vector3());

    // Refs to corner mesh materials so we can recolour them imperatively
    // each frame without re-rendering.
    const cornerMaterialRefs = useRef<Array<MeshBasicMaterial | null>>([null, null, null, null]);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        // Animate opacity (independent of geometry).
        if (meshRef.current) {
            (meshRef.current.material as MeshBasicMaterial).opacity =
                0.015 + Math.sin(t * 0.4) * 0.008;
        }
        if (edgesRef.current) {
            (edgesRef.current.material as LineBasicMaterial).opacity =
                0.35 + Math.sin(t * 0.8) * 0.15;
        }
        if (glowRef.current) {
            (glowRef.current.material as LineBasicMaterial).opacity =
                0.08 + Math.sin(t * 0.8) * 0.04;
        }

        // Apply current colour assignment from the registry.
        if (registry) {
            const idx = registry.colors.get(zone.cidr) ?? 0;
            const c = SUBNET_COLOR_PALETTE[idx % SUBNET_COLOR_PALETTE.length];
            if (meshRef.current)  (meshRef.current.material as MeshBasicMaterial).color.copy(c);
            if (edgesRef.current) (edgesRef.current.material as LineBasicMaterial).color.copy(c);
            if (glowRef.current)  (glowRef.current.material as LineBasicMaterial).color.copy(c);
            for (const m of cornerMaterialRefs.current) m?.color.copy(c);
        }

        if (members.length === 0) return;

        // Recompute AABB from current member positions.
        const min = minBuf.current.set(Infinity, Infinity, Infinity);
        const max = maxBuf.current.set(-Infinity, -Infinity, -Infinity);
        for (const m of members) {
            const p = m.position;
            if (p.x < min.x) min.x = p.x;
            if (p.y < min.y) min.y = p.y;
            if (p.z < min.z) min.z = p.z;
            if (p.x > max.x) max.x = p.x;
            if (p.y > max.y) max.y = p.y;
            if (p.z > max.z) max.z = p.z;
        }
        const PAD_XY = SUBNET_PADDING;
        const PAD_Z = SUBNET_PADDING * 0.25;
        min.x -= PAD_XY; min.y -= PAD_XY; min.z -= PAD_Z;
        max.x += PAD_XY; max.y += PAD_XY; max.z += PAD_Z;
        centerBuf.current.set(
            (min.x + max.x) / 2,
            (min.y + max.y) / 2,
            (min.z + max.z) / 2,
        );
        // Floor to a minimum thickness so degenerate AABBs (single node,
        // collinear nodes) still render a visible box.
        sizeBuf.current.set(
            Math.max(max.x - min.x, PAD_XY),
            Math.max(max.y - min.y, PAD_XY),
            Math.max(max.z - min.z, PAD_Z * 2),
        );
        if (groupRef.current) groupRef.current.position.copy(centerBuf.current);
        if (boxGroupRef.current) {
            boxGroupRef.current.scale.set(sizeBuf.current.x, sizeBuf.current.y, sizeBuf.current.z);
        }
        // Corner dots — local coords inside the live group.
        const hx = sizeBuf.current.x / 2;
        const hy = sizeBuf.current.y / 2;
        const hz = sizeBuf.current.z / 2;
        const cornerOffsets: Array<[number, number, number]> = [
            [hx,  hy,  hz], [-hx, hy,  hz],
            [hx,  hy, -hz], [-hx, hy, -hz],
        ];
        for (let i = 0; i < cornerRefs.current.length; i++) {
            const m = cornerRefs.current[i];
            if (m) m.position.set(...cornerOffsets[i]);
        }
        // Labels — keep just above the top face.
        if (topLabelRef.current)   topLabelRef.current.position.set(0, hy + 0.2,  0);
        if (countLabelRef.current) countLabelRef.current.position.set(0, hy + 0.02, 0);

        // Publish the live AABB so the SubnetSystem coordinator can compute
        // overlap and reassign colours. We write the absolute bounds (in
        // world space) so the coordinator doesn't need to know per-zone
        // centres / scales separately.
        if (registry) {
            registry.aabbs.set(zone.cidr, {
                minX: centerBuf.current.x - hx,
                minY: centerBuf.current.y - hy,
                minZ: centerBuf.current.z - hz,
                maxX: centerBuf.current.x + hx,
                maxY: centerBuf.current.y + hy,
                maxZ: centerBuf.current.z + hz,
            });
        }
    });

    const subnetHex = SUBNET_COLOR.getHex();
    const subnetStr = `#${SUBNET_COLOR.getHexString()}`;

    return (
        <group ref={groupRef}>
            {/* Box geometry lives in an inner group so we can scale it
                independently of the outer group's position (and so corner
                dots / labels — which use absolute local coords — aren't
                stretched). */}
            <group ref={boxGroupRef}>
                {/*  Ultra-thin translucent fill. The right-click handler lives
                     on this mesh so the operator can target the network-
                     space volume itself without needing a separate hit
                     proxy. We stopPropagation to keep the click from
                     bubbling to the empty-scene background handler that
                     otherwise opens the global "Topology" menu. */}
                <mesh
                    ref={meshRef}
                    geometry={UNIT_BOX_GEO}
                    onContextMenu={(e) => {
                        if (!onContextMenu) return;
                        e.stopPropagation();
                        e.nativeEvent?.preventDefault?.();
                        onContextMenu(e, zone.cidr);
                    }}
                >
                    <meshBasicMaterial
                        color={subnetHex}
                        transparent
                        opacity={0.015}
                        depthWrite={false}
                        side={DoubleSide}
                    />
                </mesh>
                {/* Outer glow pass (thicker, very faint) */}
                <lineSegments ref={glowRef} geometry={UNIT_EDGES_GEO}>
                    <lineBasicMaterial
                        color={subnetHex}
                        transparent
                        opacity={0.1}
                        linewidth={3}
                    />
                </lineSegments>
                {/* Inner crisp edge */}
                <lineSegments ref={edgesRef} geometry={UNIT_EDGES_GEO}>
                    <lineBasicMaterial
                        color={subnetHex}
                        transparent
                        opacity={0.4}
                    />
                </lineSegments>
            </group>
            {/* Corner accent dots — position is mutated in useFrame to track the live size */}
            {[0, 1, 2, 3].map(i => (
                <mesh key={i} ref={(el) => { cornerRefs.current[i] = el; }}>
                    <sphereGeometry args={[0.04, 8, 8]} />
                    <meshBasicMaterial
                        ref={(el) => { cornerMaterialRefs.current[i] = el as MeshBasicMaterial | null; }}
                        color={subnetHex}
                        toneMapped={false}
                    />
                </mesh>
            ))}
            {/* CIDR Label — minimalist, slightly above */}
            <Billboard ref={topLabelRef}>
                <Text
                    fontSize={0.22}
                    color={subnetStr}
                    anchorX="center"
                    anchorY="bottom"
                    outlineWidth={0.015}
                    outlineColor="#000000"
                    font={undefined}
                    letterSpacing={0.08}
                >
                    {`◇ ${zone.cidr}`}
                </Text>
            </Billboard>
            {/* Node count micro-label */}
            <Billboard ref={countLabelRef}>
                <Text
                    fontSize={0.12}
                    color="#555"
                    anchorX="center"
                    anchorY="bottom"
                    outlineWidth={0.01}
                    outlineColor="#000000"
                    font={undefined}
                    letterSpacing={0.05}
                >
                    {`${zone.nodeIds.length} nodes`}
                </Text>
            </Billboard>
        </group>
    );
});
SubnetVolume.displayName = 'SubnetVolume';

/**
 * SubnetSystem — fuses same-cidr zones into one volume each, and runs a
 * tiny per-frame coordinator that detects overlaps between volumes and
 * assigns colour indices via greedy graph colouring.
 *
 * `useFrame` callback order matters: SubnetVolume runs at default priority
 * (0) and writes its AABB into `registry.aabbs`. We register the
 * coordinator with priority `1` so it runs AFTER every zone has published
 * its current bounds for the frame. On a frame where zones overlap, the
 * coordinator picks the lowest palette index not used by any overlapping
 * neighbour for each zone (sorted by cidr for deterministic assignment),
 * then individual SubnetVolume frames pick up the new index next tick.
 */
export const SubnetSystem = React.memo(({ subnets, nodes, registry: externalRegistry, onContextMenu }: {
    subnets: SubnetZone[];
    nodes: TopoNode[];
    /** Optional external registry — pass one in to share live AABBs +
     *  colour assignments with sibling components (e.g. NodeSphere's
     *  drag clamp). When omitted, a private registry is allocated. */
    registry?: SubnetRegistry;
    /** Forwarded to every SubnetVolume — fires when the operator right-
     *  clicks a specific network space, so the host page can show a
     *  per-CIDR context menu (hide / open / etc.). */
    onContextMenu?: (e: ThreeEvent<MouseEvent>, cidr: string) => void;
}) => {
    // 1. Fuse zones that share the same cidr. `buildTopology` may emit
    //    several per cidr when a subnet's members span non-contiguous
    //    subtrees, but with our live AABB tracking we want exactly one
    //    bounding volume per cidr covering all its members.
    const fusedZones: SubnetZone[] = useMemo(() => {
        const byCidr = new Map<string, Set<string>>();
        for (const z of subnets) {
            let s = byCidr.get(z.cidr);
            if (!s) { s = new Set(); byCidr.set(z.cidr, s); }
            for (const id of z.nodeIds) s.add(id);
        }
        return [...byCidr.entries()].map(([cidr, ids], idx) => ({
            // center/size are placeholders — SubnetVolume recomputes them
            // every frame from the live member positions.
            cidr,
            center: subnets[idx]?.center ?? new Vector3(),
            size: subnets[idx]?.size ?? new Vector3(1, 1, 1),
            nodeIds: [...ids],
        }));
    }, [subnets]);

    // 2. Shared registry, recreated when the zone set changes so dead
    //    entries don't linger. If an external registry was passed in, we
    //    reuse it (and clear any obsolete cidrs so colours don't lag the
    //    fused-zone set).
    const ownRegistry = useMemo(() => createSubnetRegistry(), [fusedZones]);
    const registry = externalRegistry ?? ownRegistry;
    useEffect(() => {
        if (!externalRegistry) return;
        const want = new Set(fusedZones.map(z => z.cidr));
        for (const k of [...externalRegistry.aabbs.keys()]) if (!want.has(k)) externalRegistry.aabbs.delete(k);
        for (const k of [...externalRegistry.colors.keys()]) if (!want.has(k)) externalRegistry.colors.delete(k);
    }, [externalRegistry, fusedZones]);

    // 3. Coordinator — greedy graph colouring against the registry.
    //    IMPORTANT: we use the default useFrame priority. Passing any
    //    non-zero priority to useFrame opts INTO R3F's manual render
    //    mode (you'd have to call gl.render yourself) which silently
    //    blacks out the entire scene.
    //
    //    The coordinator therefore reads AABBs that SubnetVolume wrote
    //    last frame; one frame of lag (~16 ms at 60 fps) is invisible to
    //    the operator and totally fine for overlap colouring.
    useFrame(() => {
        if (fusedZones.length <= 1) {
            // No possible overlap with <=1 zone; everyone defaults to 0.
            for (const z of fusedZones) registry.colors.set(z.cidr, 0);
            return;
        }
        const sorted = fusedZones.slice().sort((a, b) => a.cidr.localeCompare(b.cidr));
        const overlap = (a: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number },
                         b: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }): boolean => (
            a.minX <= b.maxX && a.maxX >= b.minX &&
            a.minY <= b.maxY && a.maxY >= b.minY &&
            a.minZ <= b.maxZ && a.maxZ >= b.minZ
        );
        const assigned = new Map<string, number>();
        for (const z of sorted) {
            const myAabb = registry.aabbs.get(z.cidr);
            if (!myAabb) { assigned.set(z.cidr, 0); continue; }
            const used = new Set<number>();
            for (const other of sorted) {
                if (other.cidr === z.cidr) continue;
                const o = registry.aabbs.get(other.cidr);
                if (!o) continue;
                if (overlap(myAabb, o)) {
                    const oc = assigned.get(other.cidr);
                    if (oc !== undefined) used.add(oc);
                }
            }
            let idx = 0;
            while (used.has(idx)) idx++;
            assigned.set(z.cidr, idx);
        }
        registry.colors = assigned;
    });

    return (
        <>
            {fusedZones.map(zone => (
                <SubnetVolume
                    key={zone.cidr}
                    zone={zone}
                    nodes={nodes}
                    registry={registry}
                    onContextMenu={onContextMenu}
                />
            ))}
        </>
    );
});
SubnetSystem.displayName = 'SubnetSystem';

/** Infinite ground grid — fades to horizon using a custom shader on a large plane */
const infiniteGridMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
        uColor1: { value: new Color('#2a5a6a') },
        uColor2: { value: new Color('#15303e') },
    },
    vertexShader: `
        varying vec3 vWorldPos;
        void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
        }
    `,
    fragmentShader: `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        varying vec3 vWorldPos;
        void main() {
            vec2 coord = vWorldPos.xz;
            // Major grid lines every 2 units
            vec2 grid1 = abs(fract(coord / 2.0 - 0.5) - 0.5) / fwidth(coord / 2.0);
            float lineMajor = min(grid1.x, grid1.y);
            // Minor grid lines every 0.5 units
            vec2 grid2 = abs(fract(coord / 0.5 - 0.5) - 0.5) / fwidth(coord / 0.5);
            float lineMinor = min(grid2.x, grid2.y);
            // Distance fade
            float dist = length(coord);
            float fade = 1.0 - smoothstep(40.0, 200.0, dist);
            // Combine
            float major = 1.0 - min(lineMajor, 1.0);
            float minor = 1.0 - min(lineMinor, 1.0);
            vec3 color = mix(uColor2, uColor1, major);
            float alpha = (major * 0.9 + minor * 0.25) * fade;
            gl_FragColor = vec4(color, alpha);
        }
    `,
});

export const InfiniteGrid = ({ y = -8 }: { y?: number }) => {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -30, 0]} material={infiniteGridMaterial}>
            <planeGeometry args={[600, 600, 1, 1]} />
        </mesh>
    );
};

/** Ambient environment — grid, particles, lighting */
export const CyberEnvironment = () => {
    const particlesRef = useRef<Points>(null!);
    const particleCount = 500;

    const particlePositions = useMemo(() => {
        const arr = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
            arr[i * 3]     = (Math.random() - 0.5) * 60;
            arr[i * 3 + 1] = (Math.random() - 0.5) * 40;
            arr[i * 3 + 2] = (Math.random() - 0.5) * 60;
        }
        return arr;
    }, []);

    useFrame(({ clock }) => {
        if (particlesRef.current) {
            particlesRef.current.rotation.y = clock.getElapsedTime() * 0.01;
        }
    });

    return (
        <>
            <ambientLight intensity={0.15} />
            <pointLight position={[0, 10, 0]} intensity={0.8} color="#22d3ee" distance={50} />
            <pointLight position={[-10, -5, 10]} intensity={0.3} color="#a855f7" distance={30} />

            {/* Infinite ground grid */}
            <InfiniteGrid y={-8} />

            {/* Floating particles */}
            <points ref={particlesRef}>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        args={[particlePositions, 3]}
                        count={particleCount}
                        array={particlePositions}
                        itemSize={3}
                    />
                </bufferGeometry>
                <pointsMaterial
                    size={0.04}
                    color="#22d3ee"
                    transparent
                    opacity={0.3}
                    sizeAttenuation
                    depthWrite={false}
                />
            </points>
        </>
    );
};

/** Controls wrapper — disables orbit while dragging a node */
export const SmartOrbitControls = ({ dragActive }: { dragActive: boolean }) => {
    const controlsRef = useRef<any>(null);
    useEffect(() => {
        if (controlsRef.current) {
            controlsRef.current.enabled = !dragActive;
        }
    }, [dragActive]);
    return (
        <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.08}
            minDistance={3}
            maxDistance={80}
            makeDefault
        />
    );
};

// ═══════════════════════════════════════════════
//  HUD (2D overlay) Components
// ═══════════════════════════════════════════════

// ── Glitch keyframes (injected once) ──
