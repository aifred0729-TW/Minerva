import React from 'react';
import { Activity, Box, Terminal, Layers, Cpu, Server, Database } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface CardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function DashboardCard({ title, icon, children, className, delay = 0 }: CardProps) {
  return (
    <div className={cn(
        "border border-ghost/50 bg-void/50 p-6 relative group overflow-hidden hover:border-signal/50 transition-colors duration-500 h-full", 
        className
    )}>
      {/* Decorative Corner */}
      <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-ghost group-hover:border-signal transition-colors duration-500" />
      
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 text-gray-400 group-hover:text-signal transition-colors duration-300">
        {icon}
        <h3 className="font-mono text-sm tracking-widest uppercase">{title}</h3>
      </div>

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>

      {/* Background Noise/Scanline */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 pointer-events-none"></div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SPECIFIC CARDS
// -----------------------------------------------------------------------------

export function ActiveCallbacksCard({ count = 0 }: { count?: number }) {
  return (
    <DashboardCard title="Active Callbacks" icon={<Activity size={18} />}>
      <div className="flex items-end gap-2">
        <span className="text-5xl font-bold text-signal font-mono">{count}</span>
        <span className="text-gray-400 font-mono mb-2">ONLINE</span>
      </div>
      <div className="mt-4 h-1 w-full bg-ghost/20">
        <div className="h-full bg-signal transition-all duration-1000" style={{ width: `${Math.min(count * 10, 100)}%` }}></div>
      </div>
      <div className="mt-2 text-xs text-gray-400 font-mono flex justify-between">
        <span>SIGNAL_STRENGTH</span>
        <span>{count > 0 ? "STRONG" : "NO_SIGNAL"}</span>
      </div>
    </DashboardCard>
  );
}

export function PayloadStatsCard({ count = 0 }: { count?: number }) {
    return (
      <DashboardCard title="Total Payloads" icon={<Database size={18} />}>
        <div className="flex items-end gap-2">
          <span className="text-5xl font-bold text-signal font-mono">{count}</span>
          <span className="text-gray-400 font-mono mb-2">GENERATED</span>
        </div>
        <div className="mt-4 h-1 w-full bg-ghost/20">
          <div className="h-full bg-signal transition-all duration-1000" style={{ width: `${Math.min(count * 2, 100)}%` }}></div>
        </div>
        <div className="mt-2 text-xs text-gray-400 font-mono flex justify-between">
          <span>REPOSITORY</span>
          <span>{count > 0 ? "POPULATED" : "EMPTY"}</span>
        </div>
      </DashboardCard>
    );
  }

export function RecentPayloadsCard({ payloads = [] }: { payloads?: any[] }) {
  return (
    <DashboardCard title="Recent Payloads" icon={<Box size={18} />}>
      <div className="space-y-3">
        {payloads.map((p, i) => (
            <div key={p.id || i} className="flex items-center justify-between text-sm font-mono border-b border-ghost/20 pb-2 last:border-0 group/item">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-signal rounded-full group-hover/item:bg-white/80 transition-colors"></div>
                    <span className="text-signal/80 truncate max-w-[150px]">{p.filemetum?.filename_text || "Unknown"}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-400 text-xs">
                    <span className="uppercase">{p.payloadtype?.name}</span>
                    <span className="hidden sm:inline-block opacity-50">{p.build_phase}</span>
                </div>
            </div>
        ))}
        {payloads.length === 0 && <div className="text-gray-400 text-xs">NO PAYLOADS DETECTED</div>}
      </div>
    </DashboardCard>
  );
}

export function OngoingOperationsCard({ operations = [], currentOpId }: { operations?: any[], currentOpId?: number }) {
  // Find current operation details or default to first
  const currentOp = operations.find(op => op.id === currentOpId) || operations[0];

  return (
    <DashboardCard title="Operation Status" icon={<Layers size={18} />}>
       {currentOp ? (
           <>
               <div className="flex justify-between items-center mb-4">
                  <div className="text-lg text-signal font-mono">{currentOp.name}</div>
                  <div className="px-2 py-0.5 border border-green-500 text-green-500 text-[10px] font-mono uppercase">Active</div>
               </div>
               <div className="grid grid-cols-2 gap-4 text-xs font-mono text-gray-400">
                  <div>
                    <div className="mb-1">OPERATORS</div>
                    <div className="text-signal text-lg">{currentOp.members?.length || 0}</div>
                  </div>
                   <div>
                    <div className="mb-1">STATUS</div>
                    <div className="text-signal text-lg">HEALTHY</div>
                  </div>
               </div>
           </>
       ) : (
           <div className="text-gray-400 text-xs font-mono">NO ACTIVE OPERATIONS</div>
       )}
    </DashboardCard>
  );
}

export function SystemHealthCard() {
    return (
        <DashboardCard title="System Health" icon={<Cpu size={18} />}>
            <div className="space-y-4">
                <div>
                    <div className="flex justify-between text-xs font-mono text-gray-400 mb-1">
                        <span>CPU_LOAD</span>
                        <span>12%</span>
                    </div>
                    <div className="h-1 bg-ghost/20 w-full overflow-hidden">
                        <div className="h-full bg-signal w-[12%] animate-pulse"></div>
                    </div>
                </div>
                <div>
                    <div className="flex justify-between text-xs font-mono text-gray-400 mb-1">
                        <span>MEMORY</span>
                        <span>4.2GB / 16GB</span>
                    </div>
                    <div className="h-1 bg-ghost/20 w-full overflow-hidden">
                        <div className="h-full bg-signal w-[26%]"></div>
                    </div>
                </div>
            </div>
        </DashboardCard>
    )
}

export function CommandStatsCard() {
    return (
        <DashboardCard title="Command Frequency" icon={<Terminal size={18} />}>
             <div className="flex items-center justify-center h-[100px] text-gray-400 text-xs font-mono border border-dashed border-ghost/30 opacity-50">
                [AWAITING_DATA_STREAM]
             </div>
        </DashboardCard>
    )
}

export function C2StatusCard({ profiles = [] }: { profiles?: any[] }) {
    const runningCount = profiles.filter(p => p.running).length;
    const totalCount = profiles.length;

    return (
        <DashboardCard title="C2 Infrastructure" icon={<Server size={18} />}>
            <div className="flex items-end gap-2 mb-4">
                <span className={cn(
                    "text-4xl font-bold font-mono",
                    totalCount > 0 ? "text-signal" : "text-gray-500"
                )}>{totalCount}</span>
                <span className="text-gray-400 font-mono mb-1 text-xs">INSTALLED / {runningCount} RUNNING</span>
            </div>
            
            <div className="space-y-2 max-h-[120px] overflow-y-auto custom-scrollbar pr-1">
                {profiles.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-xs font-mono border-b border-ghost/20 pb-1 last:border-0">
                        <span className={cn(
                            "truncate max-w-[120px]",
                            p.running ? "text-signal" : "text-gray-500"
                        )}>{p.name}</span>
                        <div className="flex items-center gap-2">
                            <div className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                p.running ? "bg-green-500 animate-pulse" : "bg-red-500"
                            )} />
                            <span className={p.running ? "text-green-500" : "text-red-500"}>
                                {p.running ? "UP" : "DOWN"}
                            </span>
                        </div>
                    </div>
                ))}
                {profiles.length === 0 && <div className="text-gray-500 text-xs italic">NO PROFILES FOUND</div>}
            </div>
        </DashboardCard>
    );
}
