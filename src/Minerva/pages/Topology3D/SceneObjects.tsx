import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Text, Line, Billboard } from '@react-three/drei';
import type { TopoNode, SubnetZone } from '../../types/topology';
import { SUBNET_COLOR } from './topology';
import { Info } from 'lucide-react';

export const NodeSphere = React.memo(({
    node, isSelected, onSelect, onContextMenu, onDragStart, onDragEnd, pickingDim, subnetZones,
}: {
    node: TopoNode;
    isSelected: boolean;
    onSelect: (id: string, screenPos?: { x: number; y: number }) => void;
    onContextMenu: (e: ThreeEvent<MouseEvent>, id: string) => void;
    onDragStart: (id: string) => void;
    onDragEnd: (id: string, pos: THREE.Vector3) => void;
    pickingDim?: 'dim' | 'brighten' | null;
    subnetZones?: SubnetZone[];
}) => {
    const meshRef = useRef<THREE.Mesh>(null!);
    const groupRef = useRef<THREE.Group>(null!);
    const [hovered, setHovered] = useState(false);
    const [dragging, setDragging] = useState(false);
    const { camera, raycaster, gl } = useThree();
    const dragPlane = useRef(new THREE.Plane());
    const dragOffset = useRef(new THREE.Vector3());
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
                const mat = meshRef.current.material as THREE.MeshStandardMaterial;
                let base = isSelected ? 3.0 : hovered ? 2.0 : 1.2;
                if (pickingDim === 'dim') base *= 0.25;
                else if (pickingDim === 'brighten') base *= 1.3;
                mat.emissiveIntensity = base + Math.sin(t * 1.5 + node.position.x * 2) * (pickingDim === 'dim' ? 0.1 : 0.4);
            }
            // Dim core node during picking
            if (node.type === 'core' && pickingDim === 'dim') {
                const mat = meshRef.current.material as THREE.MeshStandardMaterial;
                mat.emissiveIntensity = 0.3;
            }
        }
    });

    const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (e.button === 2) return;
        setDragging(true);
        onDragStart(node.id);
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        dragPlane.current.setFromNormalAndCoplanarPoint(camDir, node.position);
        const intersection = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragPlane.current, intersection);
        dragOffset.current.subVectors(node.position, intersection);
        (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
        gl.domElement.style.cursor = 'grabbing';
    }, [camera, raycaster, gl, node.id, node.position, onDragStart]);

    /** Push position out of any subnet zone this node doesn't belong to */
    const enforceSubnetBounds = useCallback((pos: THREE.Vector3): THREE.Vector3 => {
        if (!subnetZones || subnetZones.length === 0) return pos;
        const out = pos.clone();
        for (const zone of subnetZones) {
            // Skip zones this node belongs to
            if (zone.nodeIds.includes(node.id)) continue;
            const c = zone.center;
            const hx = zone.size.x / 2;
            const hy = zone.size.y / 2;
            const hz = zone.size.z / 2;
            // Check if point is inside the AABB
            const dx = out.x - c.x;
            const dy = out.y - c.y;
            const dz = out.z - c.z;
            if (Math.abs(dx) < hx && Math.abs(dy) < hy && Math.abs(dz) < hz) {
                // Find the closest face to push out through
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
                out[min.axis] = c[min.axis] + min.sign * (zone.size[min.axis] / 2 + margin);
            }
        }
        return out;
    }, [subnetZones, node.id, node.radius]);

    const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
        if (!dragging) return;
        e.stopPropagation();
        const intersection = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragPlane.current, intersection);
        if (intersection) {
            const desired = intersection.add(dragOffset.current);
            const newPos = enforceSubnetBounds(desired);
            node.position.copy(newPos);
            if (groupRef.current) groupRef.current.position.copy(newPos);
        }
    }, [dragging, raycaster, node, enforceSubnetBounds]);

    const handlePointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
        if (!dragging) return;
        e.stopPropagation();
        setDragging(false);
        onDragEnd(node.id, node.position.clone());
        gl.domElement.style.cursor = 'auto';
    }, [dragging, gl, node.id, node.position, onDragEnd]);

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
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerOver={() => { setHovered(true); gl.domElement.style.cursor = 'pointer'; }}
                onPointerOut={() => { setHovered(false); if (!dragging) gl.domElement.style.cursor = 'auto'; }}
            >
                {node.type === 'core' ? (
                    <icosahedronGeometry args={[r, 0]} />
                ) : node.type === 'custom' ? (
                    <tetrahedronGeometry args={[r * 1.1, 0]} />
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

            {/* ── Point light — the node illuminates its surroundings ── */}
            <pointLight
                color={color}
                intensity={pickingDim === 'dim' ? 0.1 : isSelected ? 2 : hovered ? 1 : pickingDim === 'brighten' ? 0.6 : 0.4}
                distance={isSelected ? 5 : 3}
                decay={2}
            />

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

/** Animated data-beam edge */
export const DataBeamEdge = React.memo(({
    sourcePos, targetPos, color, isP2P, label,
}: {
    sourcePos: THREE.Vector3;
    targetPos: THREE.Vector3;
    color: THREE.Color;
    isP2P: boolean;
    label: string;
}) => {
    const dashRef = useRef<any>(null);
    const mainLineRef = useRef<any>(null);
    const billboardRef = useRef<THREE.Group>(null);

    // Update line geometry + label every frame so edges follow dragged nodes
    useFrame(({ clock }) => {
        if (dashRef.current) {
            dashRef.current.dashOffset = -clock.getElapsedTime() * 1.5;
        }
        const pts = [sourcePos.toArray(), targetPos.toArray()] as [number[], number[]];
        if (mainLineRef.current?.geometry) {
            mainLineRef.current.geometry.setPositions(pts.flat());
        }
        if (dashRef.current?.geometry) {
            dashRef.current.geometry.setPositions(pts.flat());
        }
        if (billboardRef.current) {
            const mx = (sourcePos.x + targetPos.x) * 0.5;
            const my = (sourcePos.y + targetPos.y) * 0.5 + 0.3;
            const mz = (sourcePos.z + targetPos.z) * 0.5;
            billboardRef.current.position.set(mx, my, mz);
        }
    });

    const points = useMemo(() => [sourcePos, targetPos], [sourcePos, targetPos]);

    const colorHex = useMemo(() => `#${color.getHexString()}`, [color]);

    return (
        <group>
            {/* Main line */}
            <Line
                ref={mainLineRef}
                points={points}
                color={colorHex}
                lineWidth={isP2P ? 1.5 : 1}
                transparent
                opacity={0.4}
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

/** Futuristic subnet zone — translucent volume with glowing scan-line edges */
export const SubnetVolume = React.memo(({ zone }: { zone: SubnetZone }) => {
    const meshRef = useRef<THREE.Mesh>(null!);
    const edgesRef = useRef<THREE.LineSegments>(null!);
    const glowRef = useRef<THREE.LineSegments>(null!);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        if (meshRef.current) {
            (meshRef.current.material as THREE.MeshBasicMaterial).opacity =
                0.015 + Math.sin(t * 0.4) * 0.008;
        }
        // Subtle edge glow pulse
        if (edgesRef.current) {
            (edgesRef.current.material as THREE.LineBasicMaterial).opacity =
                0.35 + Math.sin(t * 0.8) * 0.15;
        }
        if (glowRef.current) {
            (glowRef.current.material as THREE.LineBasicMaterial).opacity =
                0.08 + Math.sin(t * 0.8) * 0.04;
        }
    });

    const edgesGeo = useMemo(() => {
        const box = new THREE.BoxGeometry(zone.size.x, zone.size.y, zone.size.z);
        return new THREE.EdgesGeometry(box);
    }, [zone.size]);

    const subnetHex = SUBNET_COLOR.getHex();
    const subnetStr = `#${SUBNET_COLOR.getHexString()}`;

    return (
        <group position={zone.center}>
            {/* Ultra-thin translucent fill */}
            <mesh ref={meshRef}>
                <boxGeometry args={[zone.size.x, zone.size.y, zone.size.z]} />
                <meshBasicMaterial
                    color={subnetHex}
                    transparent
                    opacity={0.015}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                />
            </mesh>
            {/* Outer glow pass (thicker, very faint) */}
            <lineSegments ref={glowRef} geometry={edgesGeo}>
                <lineBasicMaterial
                    color={subnetHex}
                    transparent
                    opacity={0.1}
                    linewidth={3}
                />
            </lineSegments>
            {/* Inner crisp edge */}
            <lineSegments ref={edgesRef} geometry={edgesGeo}>
                <lineBasicMaterial
                    color={subnetHex}
                    transparent
                    opacity={0.4}
                />
            </lineSegments>
            {/* Corner accent dots — 4 top corners for futuristic mark */}
            {[
                [zone.size.x / 2, zone.size.y / 2, zone.size.z / 2],
                [-zone.size.x / 2, zone.size.y / 2, zone.size.z / 2],
                [zone.size.x / 2, zone.size.y / 2, -zone.size.z / 2],
                [-zone.size.x / 2, zone.size.y / 2, -zone.size.z / 2],
            ].map((pos, i) => (
                <mesh key={i} position={pos as [number, number, number]}>
                    <sphereGeometry args={[0.04, 8, 8]} />
                    <meshBasicMaterial color={subnetHex} toneMapped={false} />
                </mesh>
            ))}
            {/* CIDR Label — minimalist, slightly above */}
            <Billboard position={[0, zone.size.y / 2 + 0.2, 0]}>
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
            <Billboard position={[0, zone.size.y / 2 + 0.02, 0]}>
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

/** Infinite ground grid — fades to horizon using a custom shader on a large plane */
const infiniteGridMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
        uColor1: { value: new THREE.Color('#2a5a6a') },
        uColor2: { value: new THREE.Color('#15303e') },
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
    const particlesRef = useRef<THREE.Points>(null!);
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
