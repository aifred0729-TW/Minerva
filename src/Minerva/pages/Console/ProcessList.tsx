import React, { useState } from 'react';
import { useQuery } from "@apollo/client/react";
import { Activity, RefreshCw, ChevronDown, Globe, ChevronUp } from 'lucide-react';
import { GET_PROCESS_HOSTS, GET_PROCESS_TREE } from '../../lib/api';
import { cn } from '../../lib/utils';
import { usePageVisible } from '../../lib/usePageVisible';
import type { ProcessNode } from '../../types/console';

export const parseProcessMetadata = (proc: any) => {
    let details: any = {};
    try {
        if (typeof proc.metadata === 'string') details = JSON.parse(proc.metadata);
        else if (typeof proc.metadata === 'object' && proc.metadata !== null) details = proc.metadata;
    } catch { /* best-effort parse – metadata may be malformed */ }
    return {
        pid: details.process_id ?? details.pid ?? 0,
        ppid: details.parent_process_id ?? details.ppid ?? 0,
        user: details.user || "Unknown",
        arch: details.architecture || details.arch || "",
        integrityLevel: details.integrity_level,
        sessionId: details.session_id ?? "-",
        binPath: details.bin_path || details.path || "-",
        cmdLine: details.command_line || details.cmd || "-",
        description: details.description || "",
        signer: details.signer || "",
        companyName: details.company_name || "",
        windowTitle: details.window_title || "",
        path: details.bin_path || details.path || "-",
        startTime: details.start_time || "",
    };
};

export const buildProcessTree = (processes: any[]): ProcessNode[] => {
    const pidMap = new Map<number, ProcessNode>();
    const allNodes: ProcessNode[] = [];
    processes.forEach(proc => {
        const details = parseProcessMetadata(proc);
        const node: ProcessNode = { proc, details, children: [], depth: 0 };
        pidMap.set(details.pid, node);
        allNodes.push(node);
    });
    const rootNodes: ProcessNode[] = [];
    allNodes.forEach(node => {
        const parentNode = pidMap.get(node.details.ppid);
        if (parentNode && parentNode !== node) parentNode.children.push(node);
        else rootNodes.push(node);
    });
    const sortAndSetDepth = (nodes: ProcessNode[], depth: number) => {
        nodes.sort((a, b) => (a.details.pid ?? 0) - (b.details.pid ?? 0));
        nodes.forEach(node => { node.depth = depth; sortAndSetDepth(node.children, depth + 1); });
    };
    sortAndSetDepth(rootNodes, 0);
    const flattenTree = (nodes: ProcessNode[]): ProcessNode[] => {
        const result: ProcessNode[] = [];
        nodes.forEach(node => { result.push(node); result.push(...flattenTree(node.children)); });
        return result;
    };
    return flattenTree(rootNodes);
};

export const ProcessList = ({ host }: { host: string }) => {
    const pageVisible = usePageVisible();
    const [expandedPids, setExpandedPids] = useState<Set<number>>(new Set());
    const [selectedHost, setSelectedHost] = useState(host);
    const [, setAllExpanded] = useState(false);

    // Fetch all available process hosts
    const { data: hostsData } = useQuery<any>(GET_PROCESS_HOSTS, { fetchPolicy: 'cache-and-network' });
    const allHosts: string[] = React.useMemo(() => {
        const hosts = (hostsData?.mythictree || []).map((h: any) => h.host).filter(Boolean);
        // Ensure current callback host is always in list
        if (host && !hosts.includes(host)) hosts.unshift(host);
        return [...new Set(hosts)] as string[];
    }, [hostsData, host]);

    const { data, loading, error, refetch } = useQuery<any>(GET_PROCESS_TREE, {
        variables: { host: selectedHost }, pollInterval: pageVisible ? 10000 : 0
    });

    const rawProcesses = data?.mythictree || [];
    const processMap = new Map<string, any>();
    rawProcesses.forEach((proc: any) => {
        const key = proc.full_path_text || proc.name_text || proc.id;
        if (!processMap.has(key)) processMap.set(key, proc);
    });
    const processTree = buildProcessTree(Array.from(processMap.values()));

    const toggleExpand = (pid: number) => {
        setExpandedPids(prev => {
            const next = new Set(prev);
            if (next.has(pid)) next.delete(pid); else next.add(pid);
            return next;
        });
    };

    const handleExpandAll = () => {
        const allPids = new Set(processTree.map(n => n.details.pid ?? 0));
        setExpandedPids(allPids);
        setAllExpanded(true);
    };
    const handleCollapseAll = () => {
        setExpandedPids(new Set());
        setAllExpanded(false);
    };

    if (loading && processTree.length === 0) return <div className="p-4 text-gray-500 animate-pulse font-mono text-sm flex items-center justify-center h-full">SCANNING_PROCESS_MEMORY...</div>;
    if (error) return <div className="p-4 text-red-500 font-mono text-sm">PROC_ERROR: {error.message}</div>;

    if (processTree.length === 0) {
        return (
            <div className="h-full p-4 text-gray-400 font-mono text-sm flex flex-col items-center justify-center">
                <Activity size={28} className="mb-2 opacity-50 text-red-500" />
                <p className="text-base text-signal">NO_PROCESS_DATA</p>
                <p className="text-xs text-gray-500 mt-2 text-center">
                    Execute <span className="text-white font-bold">ps</span> to capture processes
                </p>
                <button onClick={() => refetch()} className="mt-4 px-3 py-1.5 bg-signal/10 hover:bg-signal/20 border border-signal/30 text-signal rounded transition-all flex items-center gap-2 text-sm">
                    <Activity size={14} /> REFRESH
                </button>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Host selector + actions bar */}
            <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-white/10 bg-black/30">
                <Globe size={12} className="text-gray-500 shrink-0" />
                <select
                    value={selectedHost}
                    onChange={e => setSelectedHost(e.target.value)}
                    className="flex-1 bg-transparent text-xs font-mono text-white border border-white/15 rounded px-1.5 py-1 appearance-none cursor-pointer hover:border-signal/40 transition-colors min-w-0"
                    title="Select host to browse processes"
                >
                    {allHosts.map(h => (
                        <option key={h} value={h} className="bg-gray-900 text-white">{h}{h === host ? ' (current)' : ''}</option>
                    ))}
                </select>
                <button onClick={handleExpandAll} title="Expand All" className="p-1 text-gray-500 hover:text-signal transition-colors"><ChevronDown size={12} /></button>
                <button onClick={handleCollapseAll} title="Collapse All" className="p-1 text-gray-500 hover:text-signal transition-colors"><ChevronUp size={12} /></button>
                <button onClick={() => refetch()} title="Refresh" className="p-1 text-gray-500 hover:text-signal transition-colors"><RefreshCw size={12} /></button>
                <span className="text-[10px] text-gray-600 font-mono shrink-0">{processTree.length}</span>
            </div>
            {/* Process table */}
            <div className="flex-1 overflow-auto cyber-scrollbar">
                <table className="w-full text-[13px] font-mono text-left border-collapse">
                    <thead className="bg-black/40 text-gray-500 sticky top-0 z-10 backdrop-blur-sm">
                        <tr>
                            <th className="p-2 font-normal border-b border-white/10 w-16">PID</th>
                            <th className="p-2 font-normal border-b border-white/10">NAME</th>
                            <th className="p-2 font-normal border-b border-white/10 w-20">USER</th>
                            <th className="p-2 font-normal border-b border-white/10 w-12">ARCH</th>
                            <th className="p-2 font-normal border-b border-white/10 w-10">IL</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {processTree.map((node) => {
                            const { proc, details, children, depth } = node;
                            const { pid, ppid, user, arch, integrityLevel, binPath, cmdLine, sessionId, description, signer } = details;
                            const isExpanded = expandedPids.has(pid ?? 0);
                            const indent = depth * 14;
                            
                            return (
                                <React.Fragment key={proc.id}>
                                    <tr className={cn("hover:bg-white/5 transition-colors group cursor-pointer", isExpanded ? "bg-white/10" : "")} onClick={() => toggleExpand(pid ?? 0)}>
                                        <td className="p-2 text-signal font-bold">{pid || "---"}</td>
                                        <td className="p-2">
                                            <div className="flex items-center" style={{ paddingLeft: `${indent}px` }}>
                                                {depth > 0 && <span className="text-gray-600 mr-1">└</span>}
                                                {children.length > 0 && <span className="text-signal mr-1">{isExpanded ? '▼' : '▶'}</span>}
                                                <span className="text-white group-hover:text-yellow-400 transition-colors truncate" title={String(proc.name_text ?? '')}>{String(proc.name_text ?? '')}</span>
                                            </div>
                                        </td>
                                        <td className="p-2 text-gray-400 truncate max-w-[90px]" title={user}>{user}</td>
                                        <td className="p-2 text-gray-500 text-[11px]">{arch}</td>
                                        <td className="p-2 text-gray-500 text-[11px]">{integrityLevel != null ? integrityLevel : ''}</td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className="bg-black/50">
                                            <td colSpan={5} className="p-2.5">
                                                <div className="text-xs text-gray-200 space-y-1 break-all" style={{ marginLeft: `${indent + 14}px` }}>
                                                    <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px]">
                                                        <div><span className="text-gray-500">PID:</span> <span className="text-signal">{pid}</span></div>
                                                        <div><span className="text-gray-500">PPID:</span> <span className="text-gray-300">{ppid}</span></div>
                                                        <div><span className="text-gray-500">Session:</span> <span className="text-gray-300">{sessionId}</span></div>
                                                        <div><span className="text-gray-500">Arch:</span> <span className="text-gray-300">{arch}</span></div>
                                                        <div><span className="text-gray-500">IL:</span> <span className="text-gray-300">{integrityLevel}</span></div>
                                                        {signer && <div><span className="text-gray-500">Signed:</span> <span className="text-gray-300">{signer}</span></div>}
                                                    </div>
                                                    {binPath !== '-' && <div className="text-[11px]"><span className="text-gray-500">Bin:</span> <span className="text-gray-300 select-all">{binPath}</span></div>}
                                                    {cmdLine !== '-' && <div className="text-[11px]"><span className="text-gray-500">Cmd:</span> <span className="text-gray-300 select-all">{cmdLine}</span></div>}
                                                    {description && <div className="text-[11px]"><span className="text-gray-500">Desc:</span> <span className="text-gray-300">{description}</span></div>}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ============================================
// Main Console Page
// ============================================
