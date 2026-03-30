import React, { useState, useMemo } from 'react';
import type { Callback } from '../../types/callbacks';
import { useNavigate } from 'react-router-dom';
import {
    Server,
    Shield,
    Clock,
    Wifi,
    Globe,
    Hash,
    Zap,
    Lock,
    User,
    Activity,
    Network,
    ChevronRight,
    LayoutList,
    GitBranch,
    Skull,
    Cpu,
    Terminal,
    Unlock,
    Info,
}from 'lucide-react';
import { cn, isCallbackAlive } from '../../lib/utils';
import { getOSIcon } from '../../components/OSIcons';
import { parseIP, getIPRange, timeSince } from './utils';

interface InfoRowProps {
    label: string;
    value?: React.ReactNode;
    icon?: React.ComponentType<{ size: number; className?: string }>;
    mono?: boolean;
    color?: string;
}

export const InfoPanel = ({ callback, allCallbacks }: { callback: any, allCallbacks: any[] }) => {
    const navigate = useNavigate();
    const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');

    const InfoRow = ({ label, value, icon: Icon, mono = true, color }: InfoRowProps) => (
        <div className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-b-0">
            <div className="w-5 flex items-center justify-center shrink-0">
                {Icon && <Icon size={14} className={color || "text-signal/70"} />}
            </div>
            <span className="text-[11px] text-gray-500 uppercase w-20 shrink-0">{label}</span>
            <span className={cn("text-[13px] break-all flex-1 min-w-0", mono ? "font-mono" : "", color || "text-white")}>
                {value || <span className="text-gray-600">N/A</span>}
            </span>
        </div>
    );

    let sleepInfo = 'N/A';
    try {
        if (callback.sleep_info) {
            const sleep = JSON.parse(callback.sleep_info);
            if (sleep.interval !== undefined) sleepInfo = `${sleep.interval}s / ${sleep.jitter || 0}% jitter`;
        }
    } catch { }

    const currentDomain = callback?.domain;
    const currentIPRange = getIPRange(callback?.ip);

    // Machine-centric grouping: group all callbacks by host
    const relatedMachines = useMemo(() => {
        if (!allCallbacks || allCallbacks.length === 0) return [];
        
        const hostMap = new Map<string, any[]>();
        allCallbacks.forEach((cb: Callback) => {
            if (cb.display_id === callback.display_id) return;
            
            let isRelated = false;
            if (currentDomain && currentDomain !== '') {
                if (cb.domain === currentDomain) isRelated = true;
            } else {
                if (getIPRange(cb.ip) === currentIPRange) isRelated = true;
            }
            
            if (isRelated) {
                const host = cb.host || 'unknown';
                if (!hostMap.has(host)) hostMap.set(host, []);
                hostMap.get(host)!.push(cb);
            }
        });

        return Array.from(hostMap.entries()).map(([host, callbacks]) => {
            // Sort callbacks: alive first, then by integrity_level desc, then dead last
            callbacks.sort((a: Callback, b: Callback) => {
                const aAlive = isCallbackAlive(a);
                const bAlive = isCallbackAlive(b);
                if (aAlive !== bAlive) return aAlive ? -1 : 1;
                const aActive = a.active;
                const bActive = b.active;
                if (aActive !== bActive) return aActive ? -1 : 1;
                // Higher integrity first
                const aIL = Number(a.integrity_level || 0);
                const bIL = Number(b.integrity_level || 0);
                if (aIL !== bIL) return bIL - aIL;
                return 0;
            });

            const best = callbacks[0]; // Best callback to navigate to
            const hasActive = callbacks.some((c: Callback) => c.active);
            const alive = callbacks.some((c: Callback) => isCallbackAlive(c));
            const highestIL = Math.max(...callbacks.map((c: Callback) => Number(c.integrity_level || 0)));

            return {
                host,
                ip: parseIP(best.ip),
                os: best.os,
                user: best.user,
                domain: best.domain,
                payloadType: best.payload?.payloadtype?.name,
                display_id: best.display_id,
                last_checkin: best.last_checkin,
                integrity_level: highestIL,
                active: hasActive,
                alive,
                callbackCount: callbacks.length,
                callbacks,
            };
        }).sort((a, b) => {
            if (a.alive !== b.alive) return a.alive ? -1 : 1;
            if (a.active !== b.active) return a.active ? -1 : 1;
            // Higher integrity first among same status
            if (a.integrity_level !== b.integrity_level) return b.integrity_level - a.integrity_level;
            return a.host.localeCompare(b.host);
        });
    }, [allCallbacks, callback?.display_id, currentDomain, currentIPRange]);

    if (!callback) return null;

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Callback Details */}
            <div className="shrink-0 overflow-auto max-h-[45%] cyber-scrollbar pr-1">
                <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Shield size={12} className="text-signal" />
                    CALLBACK_DETAILS
                </div>
                <div className="bg-black/30 rounded border border-white/5 p-2 mb-3">
                    <InfoRow label="ID" value={`#${callback.display_id}`} icon={Hash} />
                    <InfoRow label="User" value={callback.user} icon={User} />
                    <InfoRow label="Host" value={callback.host} icon={Server} />
                    <InfoRow label="Domain" value={callback.domain} icon={Globe} />
                    <InfoRow label="IP" value={parseIP(callback.ip)} icon={Wifi} />
                    <InfoRow label="OS" value={`${callback.os || 'N/A'} (${callback.architecture || '?'})`} icon={Cpu} />
                    <InfoRow label="PID" value={callback.pid} icon={Activity} />
                    <InfoRow label="Process" value={callback.process_name} icon={Terminal} />
                    <InfoRow label="Agent" value={callback.payload?.payloadtype?.name} icon={Zap} />
                    <InfoRow label="Sleep" value={sleepInfo} icon={Clock} />
                    <InfoRow label="Locked" value={callback.locked ? "Yes" : "No"} icon={callback.locked ? Lock : Unlock} color={callback.locked ? "text-red-400" : "text-gray-400"} />
                    <InfoRow label="Checkin" value={callback.last_checkin ? timeSince(callback.last_checkin) : 'N/A'} icon={Clock} color="text-signal" />
                    {callback.description && <InfoRow label="Desc" value={callback.description} icon={Info} mono={false} />}
                </div>
            </div>

            {/* Domain / Network Machines */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center justify-between mb-2 shrink-0">
                    <div className="text-[11px] text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <Network size={12} className="text-cyan-400" />
                        {currentDomain ? `DOMAIN: ${currentDomain}` : `NET: ${currentIPRange}`}
                        <span className="text-gray-600 text-[11px]">({relatedMachines.length})</span>
                    </div>
                    <div className="flex gap-1">
                        <button onClick={() => setViewMode('list')}
                            className={cn("p-1.5 rounded transition-colors", viewMode === 'list' ? "bg-signal/20 text-signal" : "text-gray-600 hover:text-white")}
                            title="List View">
                            <LayoutList size={14} />
                        </button>
                        <button onClick={() => setViewMode('graph')}
                            className={cn("p-1.5 rounded transition-colors", viewMode === 'graph' ? "bg-signal/20 text-signal" : "text-gray-600 hover:text-white")}
                            title="Graph View">
                            <GitBranch size={14} />
                        </button>
                    </div>
                </div>

                {relatedMachines.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-gray-600 text-xs font-mono">
                        NO_RELATED_MACHINES_FOUND
                    </div>
                ) : viewMode === 'list' ? (
                    <MachineListView machines={relatedMachines} currentCallback={callback} allCallbacks={allCallbacks} navigate={navigate} />
                ) : (
                    <MachineGraphView machines={relatedMachines} currentCallback={callback} navigate={navigate} />
                )}
            </div>
        </div>
    );
};

// ============================================
// Machine List View
// ============================================
export const MachineListView = ({ machines, currentCallback, allCallbacks, navigate }: {
    machines: any[], currentCallback: any, allCallbacks: any[], navigate: any
}) => {
    const [expandedHost, setExpandedHost] = useState<string | null>(null);

    // Other sessions on the same host as the current callback (excluding current)
    const currentHostSessions = useMemo(() => {
        if (!allCallbacks) return [];
        return allCallbacks
            .filter((cb: Callback) => cb.host === currentCallback.host && cb.display_id !== currentCallback.display_id)
            .sort((a: Callback, b: Callback) => {
                const aAlive = isCallbackAlive(a);
                const bAlive = isCallbackAlive(b);
                if (aAlive !== bAlive) return aAlive ? -1 : 1;
                return (b.integrity_level || 0) - (a.integrity_level || 0);
            });
    }, [allCallbacks, currentCallback.host, currentCallback.display_id]);

    const SessionRow = ({ cb, isCurrent = false }: { cb: any, isCurrent?: boolean }) => {
        const alive = isCallbackAlive(cb);
        const dead = !alive;
        return (
            <button
                onClick={() => !isCurrent && navigate(`/console/${cb.display_id}`)}
                disabled={isCurrent}
                className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors",
                    isCurrent && dead  ? "cursor-default bg-red-600 border border-red-500" :
                    isCurrent          ? "cursor-default bg-signal/10 border border-signal/20" :
                    dead               ? "bg-red-600/25 hover:bg-red-600/35 border border-red-500/50" :
                                         "hover:bg-white/10 border border-transparent"
                )}
            >
                <div className={cn(
                    "w-5 h-5 rounded flex items-center justify-center shrink-0 text-[10px] font-mono font-bold",
                    dead       ? "bg-black/30 text-black" :
                    isCurrent  ? "bg-signal/20 text-signal" :
                                  "bg-white/10 text-gray-300"
                )}>
                    {cb.display_id}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn(
                            "text-[11px] font-mono font-bold",
                            dead      ? "text-black" :
                            isCurrent ? "text-signal" :
                                         "text-white"
                        )}>
                            {cb.user || '?'}
                        </span>
                        {cb.integrity_level >= 3 && (
                            <span className={cn("text-[9px] px-1 rounded font-mono", dead ? "bg-black/20 text-black" : "bg-yellow-500/20 text-yellow-400")}>HIGH</span>
                        )}
                        {isCurrent && (
                            <span className={cn("text-[9px] px-1 rounded font-mono", dead ? "bg-black/20 text-black" : "bg-signal/20 text-signal")}>HERE</span>
                        )}
                    </div>
                    <div className={cn("text-[10px] mt-0.5", dead ? "text-black/60" : "text-gray-500")}>
                        {cb.process_name || cb.payload?.payloadtype?.name || '?'}
                        <span className="mx-1">·</span>
                        {timeSince(cb.last_checkin)}
                    </div>
                </div>
                <div className={cn("w-2 h-2 rounded-full shrink-0",
                    dead ? "bg-black/40" : "bg-signal animate-pulse"
                )} />
            </button>
        );
    };

    return (
        <div className="flex-1 overflow-auto cyber-scrollbar space-y-1.5 pr-1">
            {/* Current machine — always shown, expandable when same host has other sessions */}
            {(() => {
                const curDead = !isCallbackAlive(currentCallback);
                return (
                <div className={cn("rounded border overflow-hidden", curDead ? "bg-red-600 border-red-500" : "bg-signal/10 border-signal/30")}>
                <button
                    onClick={() => currentHostSessions.length > 0 && setExpandedHost(
                        expandedHost === '__current__' ? null : '__current__'
                    )}
                    className={cn(
                        "w-full flex items-center gap-2.5 p-2.5 text-left transition-colors",
                        currentHostSessions.length > 0 ? (curDead ? "hover:bg-black/10 cursor-pointer" : "hover:bg-signal/10 cursor-pointer") : "cursor-default"
                    )}
                >
                    <div className={cn("w-7 h-7 rounded flex items-center justify-center shrink-0", curDead ? "bg-black/20 text-black" : "bg-signal/20 text-signal")}>
                        {getOSIcon(currentCallback.os, currentCallback.payload?.payloadtype?.name, 14)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={cn("text-sm font-mono font-bold truncate", curDead ? "text-black" : "text-signal")}>{currentCallback.host}</span>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-mono", curDead ? "bg-black/20 text-black" : "bg-signal/20 text-signal")}>CURRENT</span>
                            {currentHostSessions.length > 0 && (
                                <span className={cn("text-[10px] px-1 rounded font-mono", curDead ? "bg-black/20 text-black" : "bg-white/10 text-gray-400")}>
                                    +{currentHostSessions.length}
                                </span>
                            )}
                        </div>
                        <div className={cn("flex items-center gap-2 text-[11px] mt-0.5", curDead ? "text-black/70" : "text-gray-500")}>
                            <span>{currentCallback.user}</span>
                            <span>•</span>
                            <span>{parseIP(currentCallback.ip)}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <div className={cn("w-2.5 h-2.5 rounded-full", curDead ? "bg-black/40" : "bg-signal animate-pulse")} />
                        {currentHostSessions.length > 0 && (
                            <ChevronRight size={13} className={cn(
                                curDead ? "text-black/60" : "text-gray-500",
                                "transition-transform",
                                expandedHost === '__current__' ? "rotate-90" : ""
                            )} />
                        )}
                    </div>
                </button>

                {/* Expanded sessions for current host */}
                {expandedHost === '__current__' && (
                    <div className={cn("border-t px-2 py-1.5 space-y-0.5", curDead ? "border-black/20 bg-black/10" : "border-signal/20 bg-black/20")}>
                        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-1 px-2">Sessions on {currentCallback.host}</div>
                        <SessionRow cb={currentCallback} isCurrent={true} />
                        {currentHostSessions.map((cb: Callback) => (
                            <SessionRow key={cb.display_id} cb={cb} />
                        ))}
                    </div>
                )}
            </div>
                ); })()}

            {/* Related machines */}
            {machines.map((m, idx) => {
                const isDead = !m.active || !m.alive;
                const hasMultiple = m.callbackCount > 1;
                const isExpanded = expandedHost === m.host;
                return (
                    <div key={`${m.host}-${idx}`} className={cn(
                        "rounded border overflow-hidden transition-all",
                        isDead ? "bg-red-600 border-red-500" : "border-white/10 hover:border-signal/30"
                    )}>
                        <button
                            onClick={() => {
                                if (hasMultiple) {
                                    setExpandedHost(isExpanded ? null : m.host);
                                } else {
                                    navigate(`/console/${m.display_id}`);
                                }
                            }}
                            className={cn(
                                "w-full flex items-center gap-2.5 p-2.5 text-left transition-colors",
                                isDead ? "hover:bg-black/10" : "bg-black/30 hover:bg-white/5"
                            )}
                        >
                            <div className={cn(
                                "w-7 h-7 rounded flex items-center justify-center shrink-0",
                                isDead ? "bg-black/20 text-black" : "bg-white/10 text-white"
                            )}>
                                {isDead ? <Skull size={14} className="text-black" /> : getOSIcon(m.os, m.payloadType, 14)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={cn(
                                        "text-sm font-mono font-bold truncate",
                                        isDead ? "text-black" : "text-white"
                                    )}>
                                        {m.host}
                                    </span>
                                    {hasMultiple && (
                                        <span className={cn("text-[10px] px-1 py-0 rounded font-mono", isDead ? "bg-black/20 text-black" : "bg-white/10 text-gray-400")}>
                                            ×{m.callbackCount}
                                        </span>
                                    )}
                                    {m.integrity_level >= 3 && (
                                        <span className={cn("text-[10px] px-1 py-0 rounded font-mono", isDead ? "bg-black/20 text-black" : "bg-yellow-500/20 text-yellow-400")}>
                                            HIGH
                                        </span>
                                    )}
                                </div>
                                <div className={cn("flex items-center gap-2 text-[11px] mt-0.5", isDead ? "text-black/70" : "text-gray-500")}>
                                    <span>{m.user}</span>
                                    <span>•</span>
                                    <span>{m.ip}</span>
                                    <span>•</span>
                                    <span className={isDead ? "text-black/80" : "text-signal"}>
                                        {timeSince(m.last_checkin)}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <div className={cn(
                                    "w-2.5 h-2.5 rounded-full",
                                    isDead ? "bg-black/40" : "bg-signal animate-pulse"
                                )} />
                                {hasMultiple && (
                                    <ChevronRight size={13} className={cn(
                                        isDead ? "text-black/60" : "text-gray-500",
                                        "transition-transform",
                                        isExpanded ? "rotate-90" : ""
                                    )} />
                                )}
                            </div>
                        </button>

                        {/* Expanded session list */}
                        {isExpanded && (
                            <div className={cn(
                                "border-t px-2 py-1.5 space-y-0.5",
                                isDead ? "border-black/20 bg-black/10" : "border-white/10 bg-black/20"
                            )}>
                                <div className={cn("text-[9px] uppercase tracking-wider mb-1 px-2", isDead ? "text-black/50" : "text-gray-600")}>Sessions on {m.host}</div>
                                {m.callbacks.map((cb: Callback) => (
                                    <SessionRow key={cb.display_id} cb={cb} />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ============================================
// Machine Graph View (radial from current)
// ============================================
export const MachineGraphView = ({ machines, currentCallback, navigate }: { machines: any[], currentCallback: any, navigate: any }) => {
    const [hoveredNode, setHoveredNode] = useState<number | null>(null);
    
    const graphNodes = useMemo(() => {
        const centerX = 150;
        const centerY = 130;
        const radius = 90;
        
        const nodes: { x: number; y: number; machine: any; isSelf: boolean }[] = [];
        nodes.push({ x: centerX, y: centerY, machine: { ...currentCallback, host: currentCallback.host, alive: true, active: true }, isSelf: true });
        
        const count = machines.length;
        machines.forEach((m, i) => {
            const angle = (2 * Math.PI * i / count) - Math.PI / 2;
            const r = radius + (count > 6 ? (i % 2) * 30 : 0);
            nodes.push({
                x: centerX + r * Math.cos(angle),
                y: centerY + r * Math.sin(angle),
                machine: m,
                isSelf: false,
            });
        });
        return nodes;
    }, [machines, currentCallback]);

    return (
        <div className="flex-1 overflow-hidden relative bg-black/20 rounded border border-white/5">
            <svg width="100%" height="100%" viewBox="0 0 300 260" className="absolute inset-0">
                {graphNodes.slice(1).map((node, i) => (
                    <line key={`line-${i}`}
                        x1={graphNodes[0].x} y1={graphNodes[0].y}
                        x2={node.x} y2={node.y}
                        stroke={node.machine.alive ? "#22c55e" : "#ef4444"}
                        strokeWidth={node.machine.alive ? 1.5 : 0.8}
                        strokeDasharray={node.machine.alive ? "none" : "4 2"}
                        opacity={0.4}
                    />
                ))}
                <circle cx={graphNodes[0]?.x} cy={graphNodes[0]?.y} r="20" fill="none" stroke="#22c55e" strokeWidth="0.5" opacity="0.3">
                    <animate attributeName="r" values="20;35;20" dur="3s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.3;0;0.3" dur="3s" repeatCount="indefinite" />
                </circle>
            </svg>

            {graphNodes.map((node, i) => {
                // Dead = explicitly inactive OR session timed out (not alive)
                const isDead = (!node.machine.active || !node.machine.alive) && !node.isSelf;
                const isHovered = hoveredNode === i;
                return (
                    <div key={i} className="absolute" style={{
                        left: `${(node.x / 300) * 100}%`,
                        top: `${(node.y / 260) * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        zIndex: isHovered ? 50 : 1,
                    }}>
                        <button
                            onClick={() => {
                                if (!node.isSelf && node.machine.display_id) navigate(`/console/${node.machine.display_id}`);
                            }}
                            onMouseEnter={() => setHoveredNode(i)}
                            onMouseLeave={() => setHoveredNode(null)}
                            className={cn(
                                "flex flex-col items-center group transition-transform",
                                node.isSelf ? "cursor-default" : "cursor-pointer hover:scale-110"
                            )}
                            title={`${node.machine.host} (${node.machine.user || '?'}) - ${node.machine.ip || '?'}`}
                        >
                            <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors",
                                node.isSelf 
                                    ? "bg-signal/30 border-signal text-signal shadow-[0_0_10px_rgba(34,197,94,0.5)]"
                                    : isDead
                                        ? "bg-red-500 border-red-400 text-black"
                                        : "bg-black/80 border-signal/50 text-signal group-hover:border-signal"
                            )}>
                                {isDead ? <Skull size={14} className="text-black" /> : getOSIcon(node.machine.os, node.machine.payloadType, 14)}
                            </div>
                            <span className={cn(
                                "text-[10px] font-mono mt-0.5 max-w-[70px] truncate",
                                node.isSelf ? "text-signal font-bold" 
                                    : isDead ? "text-red-400 font-bold"
                                        : "text-gray-300"
                            )}>
                                {node.machine.host}
                            </span>
                        </button>

                        {/* Hover card */}
                        {isHovered && !node.isSelf && (
                            <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-black/95 border border-white/20 rounded p-2 min-w-[140px] z-50 pointer-events-none shadow-lg">
                                <div className={cn("text-xs font-mono font-bold mb-1", isDead ? "text-red-400" : "text-signal")}>
                                    {node.machine.host}
                                </div>
                                <div className="text-[10px] text-gray-400 space-y-0.5 font-mono">
                                    <div>User: <span className="text-white">{node.machine.user || 'N/A'}</span></div>
                                    <div>IP: <span className="text-white">{node.machine.ip || 'N/A'}</span></div>
                                    <div>OS: <span className="text-white">{node.machine.os || 'N/A'}</span></div>
                                    <div>Sessions: <span className="text-white">{node.machine.callbackCount || 1}</span></div>
                                    <div>Status: <span className={isDead ? "text-red-400 font-bold" : "text-signal"}>
                                        {isDead ? "DEAD" : "ALIVE"}
                                    </span></div>
                                    <div>Last: <span className="text-white">{timeSince(node.machine.last_checkin)}</span></div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ============================================
// File Browser — Tree Structure
// ============================================

