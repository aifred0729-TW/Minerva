import type { Callback } from '../../types/callbacks';
import type { Node, Edge } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { isCallbackAlive, parseFirstIP } from '../../lib/utils';

export interface BuildGraphDataParams {
    callbacksData: any;
    edgesData: any;
    allEdgesData: any;
    showAllEdges: boolean;
    packetFlowView: boolean;
    nodeLabels: string[];
    groupBy: string;
    filterCallbackIds: number[] | undefined;
    handleContextMenu: (e: React.MouseEvent, callback: Callback, nodeRect: DOMRect | undefined) => void;
    isInitialRender: boolean;
    customNodes: any[];
    showHiddenNodes: boolean;
    customEdges: any[];
    mergeByHost: boolean;
    seenNodeIds: Set<string>;
    prevGraphData: { nodes: Node[]; edges: Edge[] };
}

export function buildGraphData(params: BuildGraphDataParams): { nodes: Node[]; edges: Edge[] } {
    const {
        callbacksData, edgesData, allEdgesData, showAllEdges, packetFlowView,
        nodeLabels, groupBy, filterCallbackIds, handleContextMenu, isInitialRender,
        customNodes, showHiddenNodes, customEdges, mergeByHost, seenNodeIds, prevGraphData,
    } = params;

    const callbacks = callbacksData?.callback || [];

    if (callbacks.length === 0 && customNodes.length === 0) {
        if (prevGraphData.nodes.length > 0) {
            return prevGraphData;
        }
        return { nodes: [], edges: [] };
    }

    let visibleCallbacks = showHiddenNodes
        ? [...callbacks]
        : callbacks.filter((c: Callback) => c.active !== false);

    if (filterCallbackIds && filterCallbackIds.length > 0) {
        const filterSet = new Set(filterCallbackIds.map(String));
        visibleCallbacks = visibleCallbacks.filter((c: Callback) => filterSet.has(String(c.display_id)));
    }

    if (groupBy !== 'None') {
        visibleCallbacks = [...visibleCallbacks].sort((a: Callback, b: Callback) => {
            const av = String(a[groupBy] ?? '');
            const bv = String(b[groupBy] ?? '');
            return av.localeCompare(bv);
        });
    }

    let mergedCallbacks = visibleCallbacks;
    const mergedIdMap = new Map<string, string[]>();
    if (mergeByHost && visibleCallbacks.length > 0) {
        const privLevel = (c: Callback) => {
            const il = Number(c.integrity_level ?? 0);
            if (il >= 4) return 4;
            if (il === 3) return 3;
            if (il === 2) return 2;
            return 1;
        };
        const byHost = new Map<string, any[]>();
        for (const c of visibleCallbacks) {
            const key = (c.host || '').toLowerCase();
            if (!byHost.has(key)) byHost.set(key, []);
            byHost.get(key)!.push(c);
        }
        mergedCallbacks = [];
        for (const [, group] of byHost) {
            // isCallbackAlive parses sleep_info; precompute once per callback
            // so the comparator does Map lookups instead of re-parsing.
            const aliveById = new Map<unknown, boolean>();
            for (const c of group) aliveById.set(c.id, isCallbackAlive(c));
            group.sort((a: Callback, b: Callback) => {
                const aAlive = aliveById.get(a.id) ? 1 : 0;
                const bAlive = aliveById.get(b.id) ? 1 : 0;
                if (bAlive !== aAlive) return bAlive - aAlive;
                const ap = privLevel(a), bp = privLevel(b);
                if (bp !== ap) return bp - ap;
                return Number(b.display_id ?? 0) - Number(a.display_id ?? 0);
            });
            const rep = { ...group[0], _hostSessions: group };
            mergedCallbacks.push(rep);
            mergedIdMap.set(String(rep.id), group.map((c: Callback) => String(c.id)));
        }
    }

    const allCallbacks = [...mergedCallbacks, ...customNodes];

    const flowNodes: Node[] = allCallbacks.map((c: Callback, index: number) => {
        const nodeId = String(c.id);
        const isNewNode = !seenNodeIds.has(nodeId);

        let animationDelay = 0;
        if (isInitialRender) {
            animationDelay = 0.3 + (index * 0.08);
        } else if (isNewNode) {
            animationDelay = 0.1;
        }

        seenNodeIds.add(nodeId);

        return {
            id: nodeId,
            type: 'custom',
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            position: { x: 0, y: 0 },
            data: {
                callback_id: c.id,
                display_id: c.display_id,
                db_id: c.db_id,
                user: c.user,
                host: c.host,
                ip: c.isCustom ? c.ip : parseFirstIP(c.ip),
                integrity_level: c.integrity_level,
                payloadType: c.payloadType || c.payload?.payloadtype?.name || '',
                os: c.os,
                last_checkin: c.last_checkin,
                pid: c.pid,
                architecture: c.architecture,
                domain: c.domain,
                description: c.description,
                locked: c.locked,
                sleep_info: c.sleep_info,
                animationDelay,
                isNewNode: isNewNode || isInitialRender,
                label: `${c.isCustom ? 'Custom Node' : 'Callback'} ${c.display_id}`,
                onContextMenu: handleContextMenu,
                isCustom: c.isCustom || false,
                process_name: c.process_name || '',
                c2profiles: c.callbackc2profiles?.map((cp: { c2profile: { name: string; is_p2p: boolean } }) => cp.c2profile?.name).filter(Boolean) || [],
                nodeLabels,
                hostSessions: c._hostSessions || null,
            },
        };
    });

    flowNodes.push({
        id: 'root',
        type: 'root',
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: { label: 'Minerva C2' },
        position: { x: 400, y: 50 },
    });

    const flowEdges: Edge[] = [];

    const activeEdgesSource = showAllEdges ? allEdgesData : edgesData;
    if (activeEdgesSource?.callbackgraphedge) {
        activeEdgesSource.callbackgraphedge.forEach((e: any) => {
            const isActive = !e.end_timestamp;
            if ((!showAllEdges && !isActive) || !e.source || !e.destination) return;
            const [edgeSrc, edgeTgt] = packetFlowView
                ? [String(e.source.id), String(e.destination.id)]
                : [String(e.destination.id), String(e.source.id)];
            flowEdges.push({
                id: `e${e.destination.id}-${e.source.id}`,
                source: edgeSrc,
                target: edgeTgt,
                type: 'c2label',
                animated: isActive,
                style: {
                    stroke: isActive ? '#22c55e' : '#ef4444',
                    strokeWidth: 2,
                    strokeDasharray: isActive ? undefined : '6,4',
                    opacity: isActive ? 1 : 0.6,
                },
                label: e.c2profile?.name || 'Linked',
                data: {
                    origStyle: {
                        stroke: isActive ? '#22c55e' : '#ef4444',
                        strokeWidth: 2,
                        strokeDasharray: isActive ? undefined : '6,4',
                        opacity: isActive ? 1 : 0.6,
                    },
                    origAnimated: isActive,
                }
            });
        });
    }

    customEdges.forEach((e: any) => {
        flowEdges.push({
            id: e.id,
            source: String(e.target),
            target: String(e.source),
            animated: false,
            style: { stroke: '#ffffff', strokeWidth: 2 },
            label: e.c2profile || 'Custom',
            data: {
                origStyle: { stroke: '#ffffff', strokeWidth: 2 },
                origAnimated: false,
            }
        });
    });

    if (mergeByHost && mergedIdMap.size > 0) {
        const childToRep = new Map<string, string>();
        for (const [repId, childIds] of mergedIdMap) {
            for (const cid of childIds) {
                if (cid !== repId) childToRep.set(cid, repId);
            }
        }
        const seen = new Set<string>();
        for (let i = flowEdges.length - 1; i >= 0; i--) {
            const e = flowEdges[i];
            if (childToRep.has(e.source)) e.source = childToRep.get(e.source)!;
            if (childToRep.has(e.target)) e.target = childToRep.get(e.target)!;
            const key = `${e.source}->${e.target}`;
            if (e.source === e.target || seen.has(key)) {
                flowEdges.splice(i, 1);
            } else {
                seen.add(key);
            }
        }
    }

    const visibleNodeIds = new Set(flowNodes.filter(n => n.id !== 'root').map(n => n.id));

    const nodesWithParent = new Set(
        flowEdges
            .filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target) && e.source !== e.target)
            .map(e => e.target)
    );

    flowNodes
        .filter(n => n.id !== 'root')
        .forEach((n) => {
            if (nodesWithParent.has(n.id)) {
                return;
            }

            let isRecent = false;
            let timestamp = '';
            if (n.data?.last_checkin) {
                try {
                    const lastCheckin = String(n.data.last_checkin);
                    const timeStr = lastCheckin.endsWith('Z') ? lastCheckin : `${lastCheckin}Z`;
                    timestamp = timeStr;
                    const last = new Date(timeStr).getTime();
                    const now = new Date().getTime();
                    const diff = (now - last) / 1000;
                    if (diff < 5) isRecent = true;
                } catch {}
            }

            const c2Profiles = Array.isArray(n.data?.c2profiles) ? n.data.c2profiles : [];
            const c2Label = c2Profiles.length > 0 ? c2Profiles.join(', ') : '';

            flowEdges.push({
                id: `root-${n.id}`,
                source: 'root',
                target: n.id,
                type: 'pulse',
                animated: false,
                style: { stroke: '#ffffff', strokeWidth: 2 },
                label: c2Label,
                labelStyle: { fill: '#a0aec0', fontSize: 11, fontWeight: 500 },
                labelBgStyle: { fill: 'rgba(0, 0, 0, 0.6)', fillOpacity: 0.8 },
                labelBgPadding: [5, 3] as [number, number],
                data: { active: isRecent, timestamp, highIntegrity: Number(n.data?.integrity_level || 0) > 2, origStyle: { stroke: '#ffffff', strokeWidth: 2 }, origAnimated: false }
            });
        });

    return { nodes: flowNodes, edges: flowEdges };
}
