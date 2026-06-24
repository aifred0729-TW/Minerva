import React, { useRef, useMemo, useState } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Line, Html, Text, Billboard } from '@react-three/drei';
import {
    Vector3, Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, Quaternion,
} from 'three';
import type { CallbackPort } from '../../types/tunnels';
import type { TopoNode } from '../../types/topology';
import { fmtBytes } from '../Tunnels/tunnels.utils';

// ════════════════════════════════════════════════════════════════
//  Tunnel-flow overlay for the 3D Cyber Topology.
//
//  Visual model
//  ────────────
//  · SOCKS5 / INTERACTIVE
//      A small operator-side cube floats above the core for each
//      open listener port. Flow: operator-cube → core → agent.
//      The agent gets a coloured wireframe halo (green for SOCKS,
//      purple for INTERACTIVE) that surrounds its sphere.
//
//  · RPFWD
//      No operator-side cube — RPFWD's salient relationship is the
//      port-forward to a remote service. The agent gets a *blue*
//      wireframe halo, and a flow line is drawn from that agent
//      directly to the destination. If the destination IP matches
//      another callback in the topology, the line connects to that
//      node (so the cross-host route is obvious). Otherwise we
//      render a "remote target" tetrahedron just outside the agent
//      and route the line there.
//
//  Particle count + speed encode log10(rx + tx) so heavier tunnels
//  visibly stream more particles, faster.
// ════════════════════════════════════════════════════════════════

const COLOR = {
    socks:       '#22c55e',
    rpfwd:       '#60a5fa',
    interactive: '#a78bfa',
    rpfwdSrc:    '#34d399',
};
const TUNNEL_LABEL: Record<string, string> = {
    socks: 'SOCKS5', rpfwd: 'RPFWD', interactive: 'INTERACT',
};
// Operator-cube offset from the Mythic core. Originally the cube sat
// directly above the core (Y_OPERATOR=5.5, Z=0) — pure vertical — which
// stacked it on top of Minerva and blocked the view of the C2 lines
// underneath. Now the cube is lifted at a 45° back-and-up vector so it
// floats behind the core relative to the default camera (positioned at
// +Z=20, looking toward origin). Same overall distance from core,
// just rotated so the operator can see the core sphere unobstructed.
const _OP_DIST   =  5.5;            // distance from core along the 45° vector
const Y_OPERATOR =  _OP_DIST * 0.707;   // ≈ 3.89, up component (cos 45°)
const Z_OPERATOR = -_OP_DIST * 0.707;   // ≈ -3.89, back component (−sin 45°)
const OP_GAP     =  1.3;
const TARGET_OUT =  2.6;

// Order matters — concentric halos render outermost-first by index.
const FRAME_ORDER = ['socks', 'interactive', 'rpfwd'] as const;
type FrameType = typeof FRAME_ORDER[number];

type FlowSegment =
    | 'op->core'
    | 'core->agent'
    | 'agent->target'         // → external rpfwd remote sentinel
    | 'agent->node';          // → another known callback node
const SegmentLabel: Record<FlowSegment, string> = {
    'op->core':      'OPERATOR  →  MYTHIC',
    'core->agent':   'MYTHIC  →  AGENT',
    'agent->target': 'AGENT  →  REMOTE',
    'agent->node':   'AGENT  →  TARGET NODE',
};

// ────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────
const parseIps = (raw: string): string[] => {
    if (!raw) return [];
    try { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map((s: string) => s.trim()).filter(Boolean); } catch {}
    return raw.replace(/^\[|\]$/g, '').split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
};
const isIPv4 = (ip: string) => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);

/** Find the topology machine node containing a callback by display_id. */
function findNodeForCallback(nodes: TopoNode[], displayId: number): TopoNode | null {
    for (const n of nodes) {
        if (n.callbackIds?.includes(displayId)) return n;
        if (n.allCallbacks?.some(c => c.display_id === displayId)) return n;
    }
    return null;
}

/** Find any topology node (callback or custom) whose IP matches `remoteIp`. */
function findNodeByIp(remoteIp: string, sourceNodeId: string, nodes: TopoNode[]): TopoNode | null {
    if (!remoteIp || remoteIp === '*' || remoteIp === '0.0.0.0') return null;
    for (const n of nodes) {
        if (n.id === sourceNodeId || n.type === 'core') continue;
        if (n.type === 'callback') {
            if (n.ipAddress === remoteIp) return n;
            if (n.allCallbacks?.some(cb => parseIps(String(cb.ip || '')).includes(remoteIp))) return n;
        } else if (n.type === 'custom') {
            // Custom nodes store IP in data.ip_address (and mirror it on sublabel).
            // Both fields can be a single IP or a comma/JSON list — parse both.
            const candidates = [
                String(n.data?.ip_address || ''),
                String(n.data?.ip || ''),
                String(n.sublabel || ''),
            ].filter(Boolean);
            for (const raw of candidates) {
                if (raw === remoteIp) return n;
                if (parseIps(raw).includes(remoteIp)) return n;
            }
        }
    }
    return null;
}

// ────────────────────────────────────────────────────
//  Per-type wireframe halo around the agent node.
//  Octahedron mirrors the node body's silhouette and
//  hugs it closely; multi-type hosts stack as snug
//  concentric shells with minimal animation.
// ────────────────────────────────────────────────────
const HALO_BASE = 0.42;     // ~1.05 × NODE_RADIUS — sits just outside the body
const HALO_STEP = 0.05;     // tighter stagger so multi-type stacks stay compact

const FrameShell = React.memo(({
    color, radius, idx, focused,
}: { color: string; radius: number; idx: number; focused: boolean }) => {
    const meshRef = useRef<Mesh>(null!);
    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        if (meshRef.current) {
            // Y-axis spin matched to NodeSphere's callback rotation (t * 0.1) so the
            // halo turns in lockstep with the node it wraps. Phase offset per layer
            // keeps stacked shells visually distinguishable.
            meshRef.current.rotation.y = t * 0.1 + idx * 0.7;
            const m = meshRef.current.material as MeshBasicMaterial;
            m.opacity = (focused ? 0.6 : 0.32) + Math.sin(t * 1.2 + idx * 1.4) * 0.05;
        }
    });
    return (
        <mesh ref={meshRef}>
            {/* Octahedron — same silhouette as the node body, only 8 faces / 12 edges */}
            <octahedronGeometry args={[radius, 0]} />
            <meshBasicMaterial
                color={color}
                wireframe
                transparent
                opacity={focused ? 0.55 : 0.3}
                depthWrite={false}
            />
        </mesh>
    );
});
FrameShell.displayName = 'FrameShell';

const NodeFrameHalo = ({
    position, types, focused,
}: { position: Vector3; types: Set<FrameType>; focused: boolean }) => {
    const groupRef = useRef<Group>(null!);
    // The `position` prop is the topology node's *live* Vector3 — NodeSphere
    // mutates it in place during drag (`node.position.copy(newPos)`), but
    // React doesn't re-render on in-place mutation. Sync the group transform
    // every frame so the halo tracks the cursor instead of waiting for the
    // next topology rebuild (~10s) to catch up.
    useFrame(() => {
        if (groupRef.current) groupRef.current.position.copy(position);
    });
    const layers = FRAME_ORDER.filter(t => types.has(t));
    if (layers.length === 0) return null;
    return (
        <group ref={groupRef} position={position}>
            {layers.map((t, i) => (
                <FrameShell
                    key={t}
                    color={t === 'socks' ? COLOR.socks
                         : t === 'rpfwd' ? COLOR.rpfwd
                         : COLOR.interactive}
                    radius={HALO_BASE + i * HALO_STEP}
                    idx={i}
                    focused={focused}
                />
            ))}
        </group>
    );
};

// ────────────────────────────────────────────────────
//  Operator-side port listener (small cube above core)
//  Rendered for SOCKS + INTERACTIVE only — these are
//  the operator-facing listening ports on Minerva.
// ────────────────────────────────────────────────────
const OperatorPortNode = ({
    position, portType, localPort, focused, dim,
}: { position: Vector3; portType: string; localPort: number; focused: boolean; dim: boolean }) => {
    const groupRef = useRef<Group>(null!);
    const meshRef = useRef<Mesh>(null!);
    const c = portType === 'socks' ? COLOR.socks : COLOR.interactive;
    useFrame(({ clock }) => {
        // Track the live world-position Vector3 (TunnelLayer mutates it each
        // frame so the cube stays anchored to the core even while it drifts).
        if (groupRef.current) groupRef.current.position.copy(position);
        const t = clock.getElapsedTime();
        if (meshRef.current) {
            meshRef.current.rotation.y = t * 0.45 + localPort * 0.01;
            const m = meshRef.current.material as MeshStandardMaterial;
            const base = focused ? 1.8 : 0.85;
            m.emissiveIntensity = (dim ? 0.3 : 1) * (base + Math.sin(t * 2.2 + localPort) * 0.25);
        }
    });
    return (
        <group ref={groupRef} position={position}>
            <mesh ref={meshRef}>
                <boxGeometry args={[0.36, 0.36, 0.36]} />
                <meshStandardMaterial
                    color="#0a0e15"
                    emissive={c}
                    emissiveIntensity={0.85}
                    metalness={0.5}
                    roughness={0.4}
                    transparent
                    opacity={dim ? 0.45 : 1}
                />
            </mesh>
            <mesh>
                <boxGeometry args={[0.44, 0.44, 0.44]} />
                <meshBasicMaterial color={c} wireframe transparent opacity={dim ? 0.15 : 0.5} />
            </mesh>
            <Billboard position={[0, 0.45, 0]}>
                <Text fontSize={0.07} color={c} outlineWidth={0.005} outlineColor="#000" anchorX="center" anchorY="bottom">
                    {TUNNEL_LABEL[portType] || portType.toUpperCase()}
                </Text>
                <Text fontSize={0.11} color="#fff" outlineWidth={0.008} outlineColor="#000" anchorX="center" anchorY="top" position={[0, -0.02, 0]}>
                    :{localPort}
                </Text>
            </Billboard>
        </group>
    );
};

// ────────────────────────────────────────────────────
//  RPFWD external remote target sentinel (only used
//  when remote_ip doesn't match any known callback).
// ────────────────────────────────────────────────────
const RemoteTargetNode = ({
    position, remoteIp, remotePort, focused, dim,
}: { position: Vector3; remoteIp: string; remotePort: number; focused: boolean; dim: boolean }) => {
    const groupRef = useRef<Group>(null!);
    const meshRef = useRef<Mesh>(null!);
    useFrame(({ clock }) => {
        if (groupRef.current) groupRef.current.position.copy(position);
        const t = clock.getElapsedTime();
        if (meshRef.current) {
            meshRef.current.rotation.x = t * 0.3;
            meshRef.current.rotation.y = t * 0.22;
            const m = meshRef.current.material as MeshStandardMaterial;
            const base = focused ? 1.5 : 0.75;
            m.emissiveIntensity = (dim ? 0.3 : 1) * (base + Math.sin(t * 1.8) * 0.2);
        }
    });
    return (
        <group ref={groupRef} position={position}>
            <mesh ref={meshRef}>
                <tetrahedronGeometry args={[0.34, 0]} />
                <meshStandardMaterial
                    color="#06141a"
                    emissive={COLOR.rpfwdSrc}
                    emissiveIntensity={0.8}
                    metalness={0.5}
                    roughness={0.4}
                    transparent
                    opacity={dim ? 0.45 : 1}
                />
            </mesh>
            <Billboard position={[0, 0.5, 0]}>
                <Text fontSize={0.07} color={COLOR.rpfwdSrc} outlineWidth={0.005} outlineColor="#000" anchorX="center" anchorY="bottom">
                    EXTERNAL
                </Text>
                <Text fontSize={0.09} color="#fff" outlineWidth={0.007} outlineColor="#000" anchorX="center" anchorY="top" position={[0, -0.02, 0]}>
                    {remoteIp || '*'}:{remotePort}
                </Text>
            </Billboard>
        </group>
    );
};

// ────────────────────────────────────────────────────
//  Traffic flow: glow line + dashed line + travelling
//  particles + invisible hit cylinder for hover/click.
// ────────────────────────────────────────────────────
interface HoverInfo {
    port: CallbackPort;
    segment: FlowSegment;
    color: string;
    midpoint: Vector3;
    /** Optional: when the segment lands on a known callback node, its label. */
    targetNodeLabel?: string;
}

interface TunnelFlowProps {
    source: Vector3;
    target: Vector3;
    color: string;
    active: boolean;
    port: CallbackPort;
    segment: FlowSegment;
    focused: boolean;
    dim: boolean;
    targetNodeLabel?: string;
    onSelect: (id: number) => void;
    onHoverChange: (info: HoverInfo | null) => void;
}

// Module-level scratch values reused by every TunnelFlow useFrame to avoid
// per-frame allocation. Three.js animation hot loops should never `new` Vector3.
const _UP = new Vector3(0, 1, 0);

const TunnelFlow = ({
    source, target, color, active, port, segment, focused, dim, targetNodeLabel,
    onSelect, onHoverChange,
}: TunnelFlowProps) => {
    const lineRef     = useRef<any>(null);
    const dashRef     = useRef<any>(null);
    const partsRef    = useRef<Group>(null!);
    const cylinderRef = useRef<Mesh>(null!);
    const [hovered, setHovered] = useState(false);

    // Per-instance scratch — kept around to avoid `new Vector3/Quaternion`
    // allocations every frame.
    const tmpDir  = useRef(new Vector3()).current;
    const tmpQuat = useRef(new Quaternion()).current;

    const total = (port.bytes_received || 0) + (port.bytes_sent || 0);
    const mag   = total > 0 ? Math.log10(total + 1) : 0;
    const particleCount = active && total > 0
        ? Math.min(7, Math.max(2, Math.floor(mag * 0.9)))
        : (active ? 1 : 0);
    const speed = 0.45 + Math.min(1.2, mag * 0.14);

    // Everything geometric is recomputed every frame from the *live* source
    // and target Vector3s, so the line, hit cylinder, and particles all
    // track endpoint movement (e.g. when a node is dragged) without waiting
    // for a topology rebuild.
    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dz = target.z - source.z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Refresh both Line2 geometries with the current endpoints.
        const lGeom = lineRef.current?.geometry;
        if (lGeom?.setPositions) {
            lGeom.setPositions([source.x, source.y, source.z, target.x, target.y, target.z]);
        }
        const dGeom = dashRef.current?.geometry;
        if (dGeom?.setPositions) {
            dGeom.setPositions([source.x, source.y, source.z, target.x, target.y, target.z]);
        }

        // Animate dash offsets.
        const lMat = lineRef.current?.material;
        if (lMat && 'dashOffset' in lMat) lMat.dashOffset = -t * speed;
        const dMat = dashRef.current?.material;
        if (dMat && 'dashOffset' in dMat) dMat.dashOffset = -t * speed * 1.4;

        // Hit-test cylinder: position at midpoint, orient along the segment,
        // scale Y to the live segment length. The geometry itself is unit-
        // length so a single mesh handles any distance without re-allocation.
        if (cylinderRef.current) {
            cylinderRef.current.position.set(
                (source.x + target.x) * 0.5,
                (source.y + target.y) * 0.5,
                (source.z + target.z) * 0.5,
            );
            if (len > 1e-4) {
                tmpDir.set(dx / len, dy / len, dz / len);
                tmpQuat.setFromUnitVectors(_UP, tmpDir);
                cylinderRef.current.quaternion.copy(tmpQuat);
                cylinderRef.current.scale.set(1, len, 1);
                cylinderRef.current.visible = true;
            } else {
                cylinderRef.current.visible = false;
            }
        }

        // Travelling particles — interpolate live source→target each frame.
        if (partsRef.current && particleCount > 0) {
            const kids = partsRef.current.children;
            for (let i = 0; i < kids.length; i++) {
                const phase = ((t * speed * 0.4 + i / particleCount) % 1);
                kids[i].position.set(
                    source.x + dx * phase,
                    source.y + dy * phase,
                    source.z + dz * phase,
                );
                const fade = Math.sin(phase * Math.PI);
                const obj = kids[i] as Mesh;
                const m = obj.material as MeshBasicMaterial;
                if (m) m.opacity = (dim ? 0.25 : (focused ? 1 : 0.85)) * fade;
                const s = 1 + Math.sin(t * 4 + i) * 0.15;
                obj.scale.setScalar(s);
            }
        }
    });

    const lineWidth   = focused ? 2.4 : (active ? 1.4 : 0.9);
    const lineOpacity = dim ? 0.12 : (active ? (focused ? 0.95 : 0.55) : 0.25);
    const dashOpacity = dim ? 0.18 : (active ? (focused ? 1.0  : 0.85) : 0.35);

    const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
        // Compute midpoint from current live coords so the tooltip anchors
        // to the visually-correct spot even after the endpoints move.
        const mid = new Vector3(
            (source.x + target.x) * 0.5,
            (source.y + target.y) * 0.5,
            (source.z + target.z) * 0.5,
        );
        onHoverChange({ port, segment, color, midpoint: mid, targetNodeLabel });
    };
    const onPointerOut = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(false);
        onHoverChange(null);
    };

    return (
        <group>
            {/* glow — disable frustumCulled because Line2's bounding sphere
                doesn't refresh when setPositions() runs every frame */}
            <Line
                ref={lineRef}
                points={[source, target]}
                color={color}
                lineWidth={lineWidth + 1.6}
                transparent
                opacity={lineOpacity * 0.35}
                frustumCulled={false}
            />
            {/* animated dashes */}
            <Line
                ref={dashRef}
                points={[source, target]}
                color={color}
                lineWidth={lineWidth}
                dashed
                dashSize={0.22}
                dashScale={1}
                gapSize={0.42}
                transparent
                opacity={dashOpacity}
                frustumCulled={false}
            />
            {/* travelling particles */}
            <group ref={partsRef}>
                {Array.from({ length: particleCount }).map((_, i) => (
                    <mesh key={i} frustumCulled={false}>
                        <sphereGeometry args={[focused ? 0.085 : 0.06, 10, 10]} />
                        <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
                    </mesh>
                ))}
            </group>
            {/* Invisible hit cylinder — unit length, scaled by useFrame to
                match the live segment so dragging an endpoint keeps the
                hover area aligned with the line. */}
            <mesh
                ref={cylinderRef}
                onPointerOver={onPointerOver}
                onPointerOut={onPointerOut}
                onClick={(e) => { e.stopPropagation(); onSelect(port.id); }}
                frustumCulled={false}
                renderOrder={-1}
            >
                <cylinderGeometry args={[hovered ? 0.28 : 0.18, hovered ? 0.28 : 0.18, 1, 8, 1, true]} />
                <meshBasicMaterial
                    transparent
                    opacity={0}
                    side={2}
                    depthWrite={false}
                    depthTest={false}
                    colorWrite={false}
                />
            </mesh>
        </group>
    );
};

// ────────────────────────────────────────────────────
//  HUD hover tooltip (rendered as drei Html in scene)
// ────────────────────────────────────────────────────
const HoverTooltip = ({ info }: { info: HoverInfo | null }) => {
    if (!info) return null;
    const { port, segment, color, midpoint, targetNodeLabel } = info;
    const total = (port.bytes_received || 0) + (port.bytes_sent || 0);
    const ips = parseIps(port.callback.ip).filter(isIPv4);
    return (
        <Html position={midpoint} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
            <div
                style={{
                    fontFamily: 'monospace',
                    background: '#020203ee',
                    border: `1px solid ${color}aa`,
                    boxShadow: `0 0 0 1px ${color}22, 0 0 22px ${color}55`,
                    padding: '9px 12px',
                    minWidth: 240,
                    color: '#e5e7eb',
                    transform: 'translate(-50%, calc(-100% - 14px))',
                    clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                    <span style={{ width: 4, height: 12, background: color, boxShadow: `0 0 6px ${color}` }} />
                    <span style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: '0.25em' }}>
                        {TUNNEL_LABEL[port.port_type] || port.port_type.toUpperCase()}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 9, color: '#71717a', letterSpacing: '0.18em' }}>{SegmentLabel[segment]}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '0.02em', marginBottom: 5 }}>
                    :{port.local_port}
                    {port.port_type === 'rpfwd' && (
                        <span style={{ fontSize: 11, color: '#a3a3a3', marginLeft: 6 }}>
                            → {port.remote_ip}:{port.remote_port}
                        </span>
                    )}
                </div>
                {targetNodeLabel && (
                    <div style={{ marginBottom: 5, fontSize: 10 }}>
                        <span style={{ color: '#71717a', fontSize: 9, letterSpacing: '0.2em' }}>FORWARDS TO </span>
                        <span style={{ color: '#fff', fontWeight: 700 }}>{targetNodeLabel}</span>
                    </div>
                )}
                <div style={{ height: 1, background: `linear-gradient(90deg, ${color}80, transparent)`, marginBottom: 6 }} />
                <div style={{ display: 'flex', gap: 12, fontSize: 11, marginBottom: 5 }}>
                    <span><span style={{ color: '#71717a', fontSize: 9, letterSpacing: '0.2em' }}>RX </span><span style={{ color: '#34d399', fontWeight: 700 }}>{fmtBytes(port.bytes_received || 0)}</span></span>
                    <span><span style={{ color: '#71717a', fontSize: 9, letterSpacing: '0.2em' }}>TX </span><span style={{ color: '#38bdf8', fontWeight: 700 }}>{fmtBytes(port.bytes_sent || 0)}</span></span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: '#a3a3a3' }}>Σ {fmtBytes(total)}</span>
                </div>
                <div style={{ fontSize: 10, color: '#cbd5e1', marginBottom: 3 }}>
                    <span style={{ color: '#22c55e', fontWeight: 700 }}>C-{port.callback.display_id}</span>
                    <span style={{ color: '#52525b' }}> · </span>
                    <span style={{ color: '#fff', fontWeight: 600 }}>{port.callback.host || '?'}</span>
                    {ips.length > 0 && (
                        <span style={{ color: '#71717a', marginLeft: 4 }}>({ips.join(', ')})</span>
                    )}
                </div>
                <div style={{ fontSize: 10, color: '#cbd5e1' }}>
                    {port.callback.user || '—'}
                    {port.callback.domain && <span style={{ color: '#71717a' }}>@{port.callback.domain}</span>}
                </div>
                {port.username && (
                    <div style={{ marginTop: 4, fontSize: 10, color: '#facc15' }}>
                        <span style={{ color: '#71717a', fontSize: 9, letterSpacing: '0.2em' }}>AUTH </span>{port.username}
                    </div>
                )}
                <div style={{ marginTop: 4, fontSize: 9, letterSpacing: '0.2em' }}>
                    <span style={{ color: port.deleted ? '#71717a' : '#22c55e' }}>
                        {port.deleted ? '○ STOPPED' : '● LIVE'}
                    </span>
                    <span style={{ color: '#52525b', margin: '0 6px' }}>·</span>
                    <span style={{ color: port.callback.active ? '#22c55e' : '#ef4444' }}>
                        {port.callback.active ? 'CB ALIVE' : 'CB DEAD'}
                    </span>
                </div>
            </div>
        </Html>
    );
};

// ════════════════════════════════════════════════════════════════
//  Main TunnelLayer — drop into <Canvas> alongside the topology.
// ════════════════════════════════════════════════════════════════
export const TunnelLayer = ({
    ports, nodes, corePos, selectedPortId, onSelectPort,
}: {
    ports: CallbackPort[];
    nodes: TopoNode[];
    corePos: Vector3;
    selectedPortId: number | null;
    onSelectPort: (id: number) => void;
}) => {
    const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

    // Resolve every port into the geometric pieces we need to render.
    //
    // Key invariant for live drag tracking: the Vector3s stored in `operator`
    // and in `rpfwdTarget(kind: 'external').world` are MUTABLE references —
    // they get updated each frame by the useFrame below. Children (Lines /
    // hit cylinders / particles / cube meshes) all read those same Vector3s
    // via useFrame so dragging the core or an agent immediately moves
    // everything anchored to it.
    const layout = useMemo(() => {
        const sourceNode = new Map<number, TopoNode>();
        // Live world position of each operator cube (mutated each frame)
        const operator = new Map<number, Vector3>();
        // Constant local offset of each cube relative to the core
        const operatorOffset = new Map<number, Vector3>();

        type RpfwdTarget =
            | { kind: 'node'; node: TopoNode }
            | { kind: 'external'; world: Vector3 };
        const rpfwdTarget = new Map<number, RpfwdTarget>();

        const haloTypes = new Map<string, Set<FrameType>>();

        // Skip ports whose callback isn't on the rendered topology
        const visiblePorts = ports.filter(p => {
            const node = findNodeForCallback(nodes, p.callback.display_id);
            if (node) sourceNode.set(p.id, node);
            return node != null;
        });

        // Operator cubes — only SOCKS + INTERACTIVE get a listener cube.
        const cubePorts = [...visiblePorts]
            .filter(p => p.port_type === 'socks' || p.port_type === 'interactive')
            .sort((a, b) => a.local_port - b.local_port);
        cubePorts.forEach((p, i) => {
            const x = (i - (cubePorts.length - 1) / 2) * OP_GAP;
            operatorOffset.set(p.id, new Vector3(x, Y_OPERATOR, Z_OPERATOR));
            // Initial value is overwritten by useFrame on the very next tick.
            operator.set(p.id, new Vector3(
                corePos.x + x,
                corePos.y + Y_OPERATOR,
                corePos.z + Z_OPERATOR,
            ));
        });

        // RPFWD resolution.
        visiblePorts.filter(p => p.port_type === 'rpfwd').forEach(p => {
            const src = sourceNode.get(p.id);
            if (!src) return;
            const tgtNode = findNodeByIp(p.remote_ip || '', src.id, nodes);
            if (tgtNode) {
                rpfwdTarget.set(p.id, { kind: 'node', node: tgtNode });
                return;
            }
            // Initial sentinel position — recomputed each frame from the
            // source agent's live position.
            const outward = src.position.clone().sub(corePos);
            outward.y = 0;
            if (outward.lengthSq() < 1e-6) outward.set(1, 0, 0);
            outward.normalize();
            const world = src.position.clone()
                .add(outward.multiplyScalar(TARGET_OUT))
                .add(new Vector3(0, -0.6, 0));
            rpfwdTarget.set(p.id, { kind: 'external', world });
        });

        // Halo types per host node.
        const addHalo = (nodeId: string, t: FrameType) => {
            if (!haloTypes.has(nodeId)) haloTypes.set(nodeId, new Set());
            haloTypes.get(nodeId)!.add(t);
        };
        visiblePorts.filter(p => !p.deleted).forEach(p => {
            const src = sourceNode.get(p.id);
            if (!src) return;
            if (p.port_type === 'socks')        addHalo(src.id, 'socks');
            else if (p.port_type === 'interactive') addHalo(src.id, 'interactive');
            else if (p.port_type === 'rpfwd') {
                addHalo(src.id, 'rpfwd');
                const r = rpfwdTarget.get(p.id);
                if (r?.kind === 'node') addHalo(r.node.id, 'rpfwd');
            }
        });

        return { visiblePorts, sourceNode, operator, operatorOffset, rpfwdTarget, haloTypes };
    }, [ports, nodes, corePos]);

    // Per-frame: keep operator-cube world positions and external sentinel
    // positions in sync with their anchors (core + agent respectively).
    // Runs before any child useFrame because R3F traverses parents first.
    const _outward = useRef(new Vector3()).current;
    useFrame(() => {
        // Operator cubes anchored to the (possibly-dragged) core.
        layout.operatorOffset.forEach((offset, portId) => {
            const world = layout.operator.get(portId);
            if (world) {
                world.set(
                    corePos.x + offset.x,
                    corePos.y + offset.y,
                    corePos.z + offset.z,
                );
            }
        });
        // External sentinels anchored to their source agent's live position.
        layout.rpfwdTarget.forEach((entry, portId) => {
            if (entry.kind !== 'external') return;
            const src = layout.sourceNode.get(portId);
            if (!src) return;
            _outward.set(src.position.x - corePos.x, 0, src.position.z - corePos.z);
            if (_outward.lengthSq() < 1e-6) _outward.set(1, 0, 0);
            _outward.normalize();
            entry.world.set(
                src.position.x + _outward.x * TARGET_OUT,
                src.position.y - 0.6,
                src.position.z + _outward.z * TARGET_OUT,
            );
        });
    });

    const selectedPort = selectedPortId == null ? null : ports.find(p => p.id === selectedPortId) || null;
    const focusActive  = !!selectedPort;
    const portFocused  = (p: CallbackPort) => focusActive && p.id === selectedPort!.id;
    const portDim      = (p: CallbackPort) => focusActive && p.id !== selectedPort!.id;

    // Halo focus state — true if any tunnel through this node is selected
    const focusedHostIds = useMemo(() => {
        if (!selectedPort) return new Set<string>();
        const out = new Set<string>();
        const src = layout.sourceNode.get(selectedPort.id);
        if (src) out.add(src.id);
        if (selectedPort.port_type === 'rpfwd') {
            const r = layout.rpfwdTarget.get(selectedPort.id);
            if (r?.kind === 'node') out.add(r.node.id);
        }
        return out;
    }, [selectedPort, layout]);

    return (
        <>
            {/* Per-host halos — colored wireframe shells around agent nodes */}
            {Array.from(layout.haloTypes.entries()).map(([nodeId, typeSet]) => {
                const node = nodes.find(n => n.id === nodeId);
                if (!node) return null;
                return (
                    <NodeFrameHalo
                        key={`halo-${nodeId}`}
                        position={node.position}
                        types={typeSet}
                        focused={focusedHostIds.has(nodeId)}
                    />
                );
            })}

            {/* Operator listener cubes — SOCKS + INTERACTIVE only */}
            {layout.visiblePorts
                .filter(p => p.port_type === 'socks' || p.port_type === 'interactive')
                .map(p => {
                    const opPos = layout.operator.get(p.id);
                    if (!opPos) return null;
                    return (
                        <OperatorPortNode
                            key={`op-${p.id}`}
                            position={opPos}
                            portType={p.port_type}
                            localPort={p.local_port}
                            focused={portFocused(p)}
                            dim={portDim(p)}
                        />
                    );
                })}

            {/* RPFWD external remote sentinels (only when no matching node) */}
            {layout.visiblePorts.filter(p => p.port_type === 'rpfwd').map(p => {
                const r = layout.rpfwdTarget.get(p.id);
                if (!r || r.kind !== 'external') return null;
                return (
                    <RemoteTargetNode
                        key={`tg-${p.id}`}
                        position={r.world}
                        remoteIp={p.remote_ip || ''}
                        remotePort={p.remote_port}
                        focused={portFocused(p)}
                        dim={portDim(p)}
                    />
                );
            })}

            {/* Traffic flows */}
            {layout.visiblePorts.flatMap(p => {
                const src = layout.sourceNode.get(p.id);
                if (!src) return [];
                const focused = portFocused(p);
                const dim     = portDim(p);
                const active  = !p.deleted;
                const flows: React.ReactNode[] = [];

                if (p.port_type === 'socks' || p.port_type === 'interactive') {
                    const opPos = layout.operator.get(p.id);
                    if (!opPos) return [];
                    const c = p.port_type === 'socks' ? COLOR.socks : COLOR.interactive;
                    flows.push(
                        <TunnelFlow
                            key={`f1-${p.id}`} source={opPos} target={corePos}
                            color={c} active={active} port={p}
                            segment="op->core" focused={focused} dim={dim}
                            onSelect={onSelectPort} onHoverChange={setHoverInfo}
                        />
                    );
                    flows.push(
                        <TunnelFlow
                            key={`f2-${p.id}`} source={corePos} target={src.position}
                            color={c} active={active} port={p}
                            segment="core->agent" focused={focused} dim={dim}
                            onSelect={onSelectPort} onHoverChange={setHoverInfo}
                        />
                    );
                } else if (p.port_type === 'rpfwd') {
                    // RPFWD: single line from source agent → target (node or external)
                    const r = layout.rpfwdTarget.get(p.id);
                    if (!r) return [];
                    const tgtPos = r.kind === 'node' ? r.node.position : r.world;
                    const segment: FlowSegment = r.kind === 'node' ? 'agent->node' : 'agent->target';
                    // Custom nodes carry IP in `sublabel`/`data.ip_address`,
                    // not on `ipAddress` — fall back through both.
                    const targetIp = r.kind === 'node'
                        ? (r.node.ipAddress
                            || String(r.node.data?.ip_address || '')
                            || (r.node.type === 'custom' ? r.node.sublabel : ''))
                        : '';
                    const targetNodeLabel = r.kind === 'node'
                        ? `${r.node.label}${targetIp ? ` (${targetIp})` : ''}`
                        : undefined;
                    flows.push(
                        <TunnelFlow
                            key={`f3-${p.id}`} source={src.position} target={tgtPos}
                            color={COLOR.rpfwd} active={active} port={p}
                            segment={segment} focused={focused} dim={dim}
                            targetNodeLabel={targetNodeLabel}
                            onSelect={onSelectPort} onHoverChange={setHoverInfo}
                        />
                    );
                }
                return flows;
            })}

            <HoverTooltip info={hoverInfo} />
        </>
    );
};

// ════════════════════════════════════════════════════════════════
//  HUD legend (rendered next to canvas, not inside)
// ════════════════════════════════════════════════════════════════
export const TunnelLayerLegend = () => (
    <div
        className="font-mono text-[10px] bg-black/85 border border-white/15 px-3 py-2.5 backdrop-blur-sm"
        style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
    >
        <div className="text-signal tracking-[0.25em] font-bold mb-1.5">TUNNEL HALOS</div>
        <div className="flex items-center gap-2 mb-0.5">
            <span className="w-3 h-3 rounded-full border border-current" style={{ color: COLOR.socks, boxShadow: `0 0 4px ${COLOR.socks}` }} />
            <span style={{ color: COLOR.socks, fontWeight: 700 }}>SOCKS5</span>
        </div>
        <div className="flex items-center gap-2 mb-0.5">
            <span className="w-3 h-3 rounded-full border border-current" style={{ color: COLOR.interactive, boxShadow: `0 0 4px ${COLOR.interactive}` }} />
            <span style={{ color: COLOR.interactive, fontWeight: 700 }}>INTERACTIVE</span>
        </div>
        <div className="flex items-center gap-2 mb-0.5">
            <span className="w-3 h-3 rounded-full border border-current" style={{ color: COLOR.rpfwd, boxShadow: `0 0 4px ${COLOR.rpfwd}` }} />
            <span style={{ color: COLOR.rpfwd, fontWeight: 700 }}>RPFWD</span>
        </div>
        <div className="h-px bg-white/10 my-1.5" />
        <div className="text-signal tracking-[0.25em] font-bold mb-1">FLOW LINES</div>
        <div className="text-signal leading-snug">
            <span className="font-bold">SOCKS / INTER</span>: cube → mythic → agent<br />
            <span className="font-bold">RPFWD</span>: agent → target node
        </div>
        <div className="h-px bg-white/10 my-1.5" />
        <div className="text-signal leading-snug">
            particles + speed scale<br />with traffic volume<br />
            <span className="font-bold">HOVER</span> a flow for details
        </div>
    </div>
);
