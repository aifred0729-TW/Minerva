import React from 'react';
import {
    Handle,
    Position,
    Node,
    Edge,
    EdgeProps,
    getStraightPath,
} from '@xyflow/react';
import { motion } from 'framer-motion';
import { Globe, Skull } from 'lucide-react';
import type { CallbackPort } from '../../types/tunnels';
import { fmtBytes } from './tunnels.utils';

// ============================================================
// TunnelGraph — inline flow-map embedded in the right panel
// ============================================================

export const TN_COLOR: Record<string, string> = {
    socks:       '#22c55e',
    rpfwd:       '#60a5fa',
    interactive: '#a78bfa',
    rpfwd_src:   '#60a5fa',
    rpfwd_out:   '#34d399',
};
export const TN_LABEL: Record<string, string> = {
    socks:       'SOCKS5',
    rpfwd:       'RPFWD',
    interactive: 'INTERACTIVE',
    rpfwd_src:   'RPFWD SRC',
    rpfwd_out:   'LOCAL FWD',
};

// ── invisible centered handles — edges always connect to node center ──
const CENTER: React.CSSProperties = {
    left: '50%', top: '50%', bottom: 'auto', right: 'auto',
    transform: 'translate(-50%,-50%)',
    opacity: 0, pointerEvents: 'none',
};
const TnHandles = () => (
    <>
        {(['top','bottom','left','right'] as const).map(p => (
            <React.Fragment key={p}>
                <Handle type="source" position={p as Position} id={`s-${p}`} style={CENTER} />
                <Handle type="target" position={p as Position} id={`t-${p}`} style={CENTER} />
            </React.Fragment>
        ))}
    </>
);

// ── Node data type definitions ──────────────────────────────────────────────
interface TnZoneNodeData {
    zoneIndex?: number; w: number; h: number; color: string;
    label: string; segment?: string;
    [key: string]: unknown;
}
interface TnMythicNodeData { activePorts: number; [key: string]: unknown; }
interface TnAgentNodeData {
    display_id: number; host: string; ip: string;
    user?: string; active: boolean; idx?: number;
    tunnels?: Array<{ type: string; port: number }>;
    [key: string]: unknown;
}
interface TnPortNodeData {
    portType: string; localPort: number; sublabel?: string;
    bytesRx: number; bytesTx: number; idx?: number;
    [key: string]: unknown;
}

/** Zone background strip — minimal CP2077 info panel */
const TnZoneNode = ({ data }: { data: TnZoneNodeData }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: 0.08 + (data.zoneIndex ?? 0) * 0.04 }}
        style={{ position: 'relative', width: data.w, height: data.h, pointerEvents: 'none' }}
    >
        {/* background fill */}
        <div style={{ position: 'absolute', inset: 0, background: `${data.color}0b` }} />

        {/* top edge */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `${data.color}cc` }} />
        {/* bottom edge */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: `${data.color}55` }} />

        {/* left accent bar */}
        <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
            background: data.color,
            boxShadow: `0 0 10px ${data.color}cc, 0 0 24px ${data.color}55`,
        }} />

        {/* top-right corner bracket */}
        <div style={{
            position: 'absolute', top: 0, right: 0, width: 18, height: 18,
            borderTop: `1px solid ${data.color}80`,
            borderRight: `1px solid ${data.color}80`,
        }} />
        {/* bottom-left corner bracket */}
        <div style={{
            position: 'absolute', bottom: 0, left: 3, width: 14, height: 14,
            borderBottom: `1px solid ${data.color}50`,
            borderLeft: `1px solid ${data.color}50`,
        }} />

        <TnHandles />

        {/* zone index dot + label — top-left */}
        <div style={{
            position: 'absolute', top: 10, left: 16,
            display: 'flex', alignItems: 'center', gap: 7,
        }}>
            <div style={{
                width: 4, height: 4, background: data.color,
                boxShadow: `0 0 6px ${data.color}`,
                flexShrink: 0,
            }} />
            <span style={{
                fontFamily: 'monospace', fontSize: 9, fontWeight: 800,
                color: `${data.color}dd`, letterSpacing: '0.3em',
                textTransform: 'uppercase',
                textShadow: `0 0 10px ${data.color}80`,
            }}>{data.label}</span>
        </div>

        {/* segment — bottom-right */}
        {data.segment && (
            <div style={{
                position: 'absolute', bottom: 9, right: 16,
                display: 'flex', alignItems: 'center', gap: 5,
            }}>
                <div style={{ width: 16, height: 1, background: `${data.color}60` }} />
                <span style={{
                    fontFamily: 'monospace', fontSize: 8, fontWeight: 600,
                    color: `${data.color}99`, letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                }}>{data.segment}</span>
            </div>
        )}
    </motion.div>
);

/** MYTHIC — CP2077 minimal cyberpunk C2 node */
const TnMythicNode = ({ data }: { data: TnMythicNodeData }) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'relative' }}
    >
        <TnHandles />
        {/* glow backdrop */}
        <div style={{
            position: 'absolute', inset: -12,
            background: 'radial-gradient(ellipse 80% 60%, #22c55e22 0%, transparent 70%)',
            pointerEvents: 'none',
        }} />
        {/* main body */}
        <div style={{
            width: 148, fontFamily: 'monospace',
            background: 'linear-gradient(135deg, #071a0d 0%, #040d07 100%)',
            border: '1px solid #22c55e70',
            boxShadow: '0 0 0 1px #22c55e18, 0 0 20px #22c55e28, inset 0 1px 0 #22c55e30',
            clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))',
            padding: '10px 12px 8px',
            position: 'relative',
        }}>
            {/* diagonal cut accent */}
            <div style={{
                position: 'absolute', top: 0, right: 0,
                width: 0, height: 0,
                borderStyle: 'solid',
                borderWidth: '0 14px 14px 0',
                borderColor: 'transparent #22c55e70 transparent transparent',
            }} />
            {/* top row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <div style={{
                    width: 6, height: 20, background: '#22c55e',
                    boxShadow: '0 0 8px #22c55e, 0 0 16px #22c55e60',
                    flexShrink: 0,
                }} />
                <div>
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#4ade80', letterSpacing: '0.18em' }}>MYTHIC</div>
                    <div style={{ fontSize: 8, color: '#22c55e70', letterSpacing: '0.3em', marginTop: 1 }}>C2 CORE</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div style={{ width: 6, height: 6, background: '#22c55e', borderRadius: '50%', boxShadow: '0 0 6px #22c55e, 0 0 12px #22c55e80', animation: 'pulse 2s ease-in-out infinite' }} />
                    <div style={{ width: 2, height: 8, background: 'linear-gradient(180deg, #22c55e60, transparent)' }} />
                </div>
            </div>
            {/* divider */}
            <div style={{ height: 1, background: 'linear-gradient(90deg, #22c55e60, #22c55e10)', marginBottom: 6 }} />
            {/* stats */}
            <div style={{ fontSize: 10, color: data.activePorts > 0 ? '#4ade80' : '#22c55e30', fontWeight: 700, letterSpacing: '0.08em' }}>
                {data.activePorts > 0 ? `${data.activePorts} TUNNEL${data.activePorts !== 1 ? 'S' : ''} ACTIVE` : 'STANDBY'}
            </div>
        </div>
    </motion.div>
);

/** Agent / callback */
const TnAgentNode = ({ data }: { data: TnAgentNodeData }) => {
    const dead = !data.active;
    const c    = dead ? '#ef4444' : '#22c55e';
    return (
        <motion.div className="relative"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1], delay: 0.18 + (data.idx ?? 0) * 0.04 }}
        >
            <TnHandles />
            {dead ? (
                /* — DEAD node: red card with skull — */
                <div style={{
                    width: 100, fontFamily: 'monospace',
                    background: '#c00000',
                    border: '1px solid #ff2222',
                    boxShadow: '0 0 12px #ff000060',
                    padding: '6px 8px 5px',
                    position: 'relative',
                }}>
                    <div style={{ position: 'absolute', top: -1, right: -1, width: 0, height: 0,
                        borderStyle: 'solid', borderWidth: '0 10px 10px 0',
                        borderColor: 'transparent #000 transparent transparent' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Skull size={20} color="#000" strokeWidth={2.5} />
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 900, color: '#000', letterSpacing: '0.1em' }}>C-{data.display_id}</div>
                            <div style={{ fontSize: 8, color: '#00000099', letterSpacing: '0.2em' }}>OFFLINE</div>
                        </div>
                    </div>
                    <div style={{ height: 1, background: '#00000030', margin: '4px 0 3px' }} />
                    <div style={{ fontSize: 8, color: '#000000bb', fontWeight: 700, letterSpacing: '0.08em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={data.host}>
                        {(data.host || data.ip || '?').slice(0, 14)}
                    </div>
                </div>
            ) : (
                /* — ACTIVE node — */
                <div style={{
                    width: 116, fontFamily: 'monospace',
                    background: '#020c04',
                    border: `1px solid ${c}`,
                    boxShadow: `0 0 10px ${c}30`,
                    padding: '7px 10px 6px',
                    position: 'relative',
                }}>
                    <div style={{ position: 'absolute', top: -1, right: -1, width: 0, height: 0,
                        borderStyle: 'solid', borderWidth: '0 10px 10px 0',
                        borderColor: `transparent ${c} transparent transparent` }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                        <div style={{ width: 3, height: 14, background: c, flexShrink: 0, boxShadow: `0 0 5px ${c}` }} />
                        <span style={{ fontSize: 11, fontWeight: 900, color: c, letterSpacing: '0.15em' }}>
                            C-{data.display_id}
                        </span>
                        <div style={{ marginLeft: 'auto', width: 5, height: 5, background: c,
                            boxShadow: `0 0 6px ${c}`, animation: 'pulse 1.8s ease-in-out infinite' }} />
                    </div>
                    <div style={{ height: 1, background: `linear-gradient(90deg, ${c}60, transparent)`, marginBottom: 4 }} />
                    <div style={{ fontSize: 9, color: '#ffffffcc', fontWeight: 600,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={data.host}>
                        {data.host || data.ip || '?'}
                    </div>
                    {data.user && (
                        <div style={{ fontSize: 8, color: '#ffffff50', marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {data.user}
                        </div>
                    )}
                    {(data.tunnels?.length ?? 0) > 0 && (
                        <div style={{ display: 'flex', gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
                            {data.tunnels!.map((t: any, i: number) => {
                                const tc = TN_COLOR[t.type] || '#9ca3af';
                                return (
                                    <span key={i} style={{
                                        color: tc, border: `1px solid ${tc}50`,
                                        background: `${tc}15`, fontSize: 7,
                                        padding: '0 2px', fontWeight: 700, letterSpacing: '0.05em',
                                    }}>:{t.port}</span>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
};

/** Port endpoint — CLIENT / OPERATOR / RPFWD SRC / LOCAL FWD */
const TnPortNode = ({ data }: { data: TnPortNodeData }) => {
    const c   = TN_COLOR[data.portType] || '#94a3b8';
    const lbl = TN_LABEL[data.portType] || (data.portType as string).toUpperCase();
    return (
        <motion.div className="relative"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.12 + (data.idx ?? 0) * 0.04, ease: [0.22, 1, 0.36, 1] }}
        >
            <TnHandles />
            <div style={{
                width: 100, fontFamily: 'monospace',
                background: '#05050a',
                border: `1px solid ${c}`,
                boxShadow: `0 0 8px ${c}25`,
                padding: '6px 9px 5px',
                position: 'relative',
            }}>
                <div style={{ position: 'absolute', top: -1, right: -1, width: 0, height: 0,
                    borderStyle: 'solid', borderWidth: '0 9px 9px 0',
                    borderColor: `transparent ${c} transparent transparent` }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                    <div style={{ width: 3, height: 12, background: c, flexShrink: 0 }} />
                    <span style={{ fontSize: 8, fontWeight: 800, color: c, letterSpacing: '0.22em' }}>{lbl}</span>
                </div>
                <div style={{ height: 1, background: `linear-gradient(90deg, ${c}60, transparent)`, marginBottom: 3 }} />
                <span style={{ fontFamily: 'monospace', color: '#fff', fontSize: 12, fontWeight: 700 }}>:{data.localPort}</span>
                {data.sublabel && (
                    <div style={{ fontSize: 8, color: '#ffffff40', marginTop: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={data.sublabel}>{data.sublabel}</div>
                )}
                {(data.bytesRx > 0 || data.bytesTx > 0) && (
                    <div style={{ display: 'flex', gap: 5, marginTop: 3, fontSize: 8, fontFamily: 'monospace' }}>
                        <span style={{ color: '#4ade80' }}>↓{fmtBytes(data.bytesRx)}</span>
                        <span style={{ color: '#60a5fa' }}>↑{fmtBytes(data.bytesTx)}</span>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

/** SVG edge with animated particle stream */
const TnFlowEdge = ({ sourceX, sourceY, targetX, targetY, data }: EdgeProps) => {
    const [path, lx, ly] = getStraightPath({ sourceX, sourceY, targetX, targetY });
    const color  = (data?.color  as string)  || '#22c55e';
    const active = (data?.active as boolean);
    const plabel = data?.portLabel as string;
    const traffic = ((data?.bytesRx as number) || 0) + ((data?.bytesTx as number) || 0);
    return (
        <>
            <path d={path} fill="none"
                stroke={active ? `${color}2e` : '#1f2937'}
                strokeWidth={active ? 2.5 : 1.5}
                strokeDasharray={active ? undefined : '4 5'}
            />
            {active && (
                <path d={path} fill="none"
                    stroke={color}
                    strokeWidth={2.5}
                    strokeDasharray="8 20"
                    strokeLinecap="round"
                    style={{ animation: 'tunnelDash 1.2s linear infinite' }}
                />
            )}
            {plabel && (
                <foreignObject x={lx - 27} y={ly - 11} width={54} height={14}
                    style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                    <div style={{
                        fontFamily: 'monospace', fontSize: 9, color,
                        background: '#050505ec', border: `1px solid ${color}40`,
                        padding: '1px 4px', textAlign: 'center',
                        whiteSpace: 'nowrap', letterSpacing: '0.05em',
                    }}>{plabel}</div>
                </foreignObject>
            )}
            {traffic > 0 && (
                <foreignObject x={lx - 29} y={ly + (plabel ? 6 : -8)} width={58} height={13}
                    style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                    <div style={{
                        fontFamily: 'monospace', fontSize: 9, color: '#6b7280',
                        background: '#050505a0', padding: '0 3px',
                        textAlign: 'center', whiteSpace: 'nowrap',
                    }}>{fmtBytes(traffic)}</div>
                </foreignObject>
            )}
        </>
    );
};

export const tnNodeTypes = { mythic: TnMythicNode, agent: TnAgentNode, port: TnPortNode, zone: TnZoneNode };
export const tnEdgeTypes = { flow: TnFlowEdge };

// ── graph layout builder ────────────────────────────────────────────────
export function buildTunnelGraph(ports: CallbackPort[]): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const MX  = 320;    // mythic center-x
    const MY  = 240;    // mythic y
    const AY  = 420;    // agent row y
    const PY  = 60;     // port-source row y
    const HS  = 180;    // horizontal spacing
    const NHW = 74;     // half mythic node-width (148/2)

    // Dynamic zone width: sized to fit nodes + padding, centered on MX
    const cbCount = [...new Set(ports.map(p => p.callback.display_id))].length;
    const contentSpread = Math.max(cbCount - 1, 0) * HS;
    const ZW  = Math.max(contentSpread + 500, 600);  // enough padding on each side
    const ZX  = MX - ZW / 2;

    // Derive network segments from callback IPs
    const parseAllIps = (raw: string): string[] => {
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.map((s: string) => s.trim()).filter(Boolean);
        } catch { /* not JSON — fallback */ }
        return raw.replace(/^\[|\]$/g, '').split(',')
            .map(s => s.replace(/"/g, '').trim()).filter(Boolean);
    };
    const isIPv4 = (ip: string) => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);
    const toSubnet = (ip: string) => {
        const parts = ip.split('.');
        return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : ip;
    };

    // Collect all IPv4 addresses per callback (keyed by display_id)
    const cbIPv4Map = new Map<number, string[]>();
    ports.forEach(p => {
        const allIps = parseAllIps(p.callback.ip);
        const ipv4s = allIps.filter(isIPv4);
        if (!cbIPv4Map.has(p.callback.display_id)) {
            cbIPv4Map.set(p.callback.display_id, ipv4s);
        }
    });

    // Group callbacks by their /24 subnets
    const subnetToCbIds = new Map<string, Set<number>>();
    cbIPv4Map.forEach((ipv4s, cbId) => {
        const subnets = [...new Set(ipv4s.map(toSubnet))];
        if (subnets.length === 0) subnets.push('UNKNOWN');
        subnets.forEach(sn => {
            if (!subnetToCbIds.has(sn)) subnetToCbIds.set(sn, new Set());
            subnetToCbIds.get(sn)!.add(cbId);
        });
    });
    const endpointSubnets = [...subnetToCbIds.keys()].filter(s => s !== 'UNKNOWN').sort();

    // Zone background strips
    const ZONE_H = 165;
    const ZONE_GAP = 10;

    const epZones: { id: string; y: number; h: number; color: string; label: string; segment: string }[] = [];
    if (endpointSubnets.length <= 1) {
        epZones.push({
            id: 'z-agent', y: AY - 32, h: ZONE_H, color: '#f59e0b',
            label: 'ENDPOINTS', segment: endpointSubnets[0] || 'TARGET NETWORK',
        });
    } else {
        endpointSubnets.forEach((sn, si) => {
            epZones.push({
                id: `z-agent-${si}`, y: AY - 32 + si * (ZONE_H + ZONE_GAP), h: ZONE_H,
                color: '#f59e0b', label: `ENDPOINTS #${si + 1}`, segment: sn,
            });
        });
    }

    const zones = [
        { id: 'z-port',   y: PY  - 32, h: 135, color: '#60a5fa', label: 'OPERATOR SIDE',  segment: 'LOCAL NETWORK' },
        { id: 'z-mythic', y: MY  - 32, h: 155, color: '#22c55e', label: 'C2 SERVER',       segment: 'C2 INFRASTRUCTURE' },
        ...epZones,
    ];
    zones.forEach((z, zi) => nodes.push({
        id: z.id, type: 'zone',
        position: { x: ZX, y: z.y },
        data: { w: ZW, h: z.h, color: z.color, label: z.label, segment: z.segment, zoneIndex: zi },
        selectable: false, draggable: false,
        style: { zIndex: -1 },
    }));

    const activePorts = ports.filter(p => !p.deleted);
    nodes.push({
        id: 'mythic', type: 'mythic',
        position: { x: MX - NHW, y: MY },
        data: { activePorts: activePorts.length },
    });

    const cbIds = [...new Set(ports.map(p => p.callback.display_id))];
    const cbPlacedX = new Map<number, number>();

    if (endpointSubnets.length <= 1) {
        const agCX = (i: number) => MX - ((cbIds.length - 1) / 2) * HS + i * HS;
        cbIds.forEach((cbId, i) => {
            const rep = ports.find(p => p.callback.display_id === cbId)!;
            const cb  = rep.callback;
            const cx  = agCX(i);
            cbPlacedX.set(cbId, cx);
            nodes.push({
                id: `a-${cbId}`, type: 'agent',
                position: { x: cx - NHW, y: AY },
                data: {
                    display_id: cb.display_id, host: cb.host,
                    ip: parseAllIps(cb.ip).filter(isIPv4).join(', ') || cb.ip,
                    user: cb.user, domain: cb.domain, active: cb.active,
                    idx: i,
                    tunnels: ports.filter(p => p.callback.display_id === cbId && !p.deleted)
                        .map(p => ({ type: p.port_type, port: p.local_port })),
                },
            });
            edges.push({
                id: `c2-${cbId}`, source: 'mythic', target: `a-${cbId}`, type: 'flow',
                data: { active: cb.active, color: cb.active ? '#22c55e' : '#374151' },
            });
        });
    } else {
        const placed = new Set<number>();
        endpointSubnets.forEach((sn, si) => {
            const zoneCbIds = cbIds.filter(id => subnetToCbIds.get(sn)?.has(id));
            const zoneY = AY + si * (ZONE_H + ZONE_GAP);
            const zoneCX = (i: number) => MX - ((zoneCbIds.length - 1) / 2) * HS + i * HS;
            zoneCbIds.forEach((cbId, i) => {
                if (placed.has(cbId)) return;
                placed.add(cbId);
                const rep = ports.find(p => p.callback.display_id === cbId)!;
                const cb  = rep.callback;
                const cx  = zoneCX(i);
                cbPlacedX.set(cbId, cx);
                nodes.push({
                    id: `a-${cbId}`, type: 'agent',
                    position: { x: cx - NHW, y: zoneY },
                    data: {
                        display_id: cb.display_id, host: cb.host,
                        ip: parseAllIps(cb.ip).filter(isIPv4).join(', ') || cb.ip,
                        user: cb.user, domain: cb.domain, active: cb.active,
                        idx: i,
                        tunnels: ports.filter(p => p.callback.display_id === cbId && !p.deleted)
                            .map(p => ({ type: p.port_type, port: p.local_port })),
                    },
                });
                edges.push({
                    id: `c2-${cbId}`, source: 'mythic', target: `a-${cbId}`, type: 'flow',
                    data: { active: cb.active, color: cb.active ? '#22c55e' : '#374151' },
                });
            });
        });
    }

    const agCX = (cbId: number) => cbPlacedX.get(cbId) ?? MX;

    let pSlot = 0;
    let oSlot = 0;
    let pNodeIdx = 0;

    ports.forEach(port => {
        const active = !port.deleted;
        const color  = TN_COLOR[port.port_type] || '#94a3b8';
        const agX    = agCX(port.callback.display_id);

        if (port.port_type === 'socks' || port.port_type === 'interactive') {
            const srcCount = ports.filter(p => p.port_type === 'socks' || p.port_type === 'interactive').length;
            const px = MX - ((srcCount - 1) / 2) * 140 + pSlot * 140;
            pSlot++;
            const srcId = `ps-${port.id}`;
            nodes.push({
                id: srcId, type: 'port',
                position: { x: px - 53, y: PY },
                data: {
                    portType: port.port_type, localPort: port.local_port,
                    username: port.username || undefined,
                    bytesRx: port.bytes_received, bytesTx: port.bytes_sent,
                    idx: pNodeIdx++,
                },
            });
            edges.push({
                id: `e-src-${port.id}`, source: srcId, target: 'mythic', type: 'flow',
                data: { active, color, portLabel: `:${port.local_port}`, bytesRx: port.bytes_sent, bytesTx: port.bytes_received },
            });

        } else if (port.port_type === 'rpfwd') {
            const srcId = `rs-${port.id}`;
            nodes.push({
                id: srcId, type: 'port',
                position: { x: agX - NHW, y: PY + 15 },
                data: {
                    portType: 'rpfwd_src', localPort: port.remote_port,
                    sublabel: port.remote_ip || '*',
                    bytesRx: port.bytes_received, bytesTx: port.bytes_sent,
                    idx: pNodeIdx++,
                },
            });
            edges.push({
                id: `e-rs-${port.id}`, source: srcId, target: `a-${port.callback.display_id}`, type: 'flow',
                data: {
                    active, color,
                    portLabel: `*:${port.remote_port}`,
                    bytesRx: port.bytes_received, bytesTx: port.bytes_sent,
                },
            });
            const outId = `ro-${port.id}`;
            nodes.push({
                id: outId, type: 'port',
                position: { x: MX + NHW + 20 + oSlot * 130, y: MY + 10 },
                data: {
                    portType: 'rpfwd_out', localPort: port.local_port,
                    bytesRx: port.bytes_received, bytesTx: port.bytes_sent,
                    idx: pNodeIdx++,
                },
            });
            oSlot++;
            edges.push({
                id: `e-ro-${port.id}`, source: 'mythic', target: outId, type: 'flow',
                data: { active, color, portLabel: `:${port.local_port}`, bytesRx: port.bytes_sent, bytesTx: port.bytes_received },
            });
        }
    });
    return { nodes, edges };
}

/** Graph legend */
export const TnLegend = () => (
    <div className="flex flex-col gap-1.5 bg-black/90 border border-white/15 px-3 py-2.5 font-mono text-[10px] backdrop-blur-sm">
        <span className="text-gray-300 tracking-widest font-bold mb-0.5">LEGEND</span>
        {(['socks','rpfwd','interactive'] as const).map(t => (
            <div key={t} className="flex items-center gap-2">
                <span className="w-5 h-0.5 rounded shrink-0" style={{ background: TN_COLOR[t] }} />
                <span style={{ color: TN_COLOR[t], fontWeight: 700 }}>{TN_LABEL[t]}</span>
            </div>
        ))}
        <div className="flex items-center gap-2 mt-1">
            <span className="w-5 h-0.5 bg-signal shrink-0" />
            <span className="text-signal font-bold">C2 ACTIVE</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="w-5 border-t border-dashed border-gray-500 shrink-0" />
            <span className="text-gray-400 font-bold">C2 INACTIVE</span>
        </div>
    </div>
);
