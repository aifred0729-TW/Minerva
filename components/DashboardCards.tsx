import React, { useMemo } from 'react';
import { Activity, Box, Terminal, Layers, Cpu, Server, Database, Key, Download, Upload, Image, Shield, Users, Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
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

export function ActiveCallbacksCard({ count = 0, totalCount = 0 }: { count?: number; totalCount?: number }) {
  return (
    <DashboardCard title="Active Callbacks" icon={<Activity size={18} />}>
      <div className="flex items-end gap-2">
        <span className="text-5xl font-bold text-signal font-mono">{count}</span>
        <span className="text-gray-400 font-mono mb-2">/ {totalCount} TOTAL</span>
      </div>
      <div className="mt-4 h-1 w-full bg-ghost/20">
        <div className="h-full bg-signal transition-all duration-1000" style={{ width: totalCount > 0 ? `${(count / totalCount) * 100}%` : '0%' }}></div>
      </div>
      <div className="mt-2 text-xs text-gray-400 font-mono flex justify-between">
        <span>SIGNAL_STRENGTH</span>
        <span className={count > 0 ? "text-signal" : ""}>{count > 0 ? "STRONG" : "NO_SIGNAL"}</span>
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
          <span className={count > 0 ? "text-signal" : ""}>{count > 0 ? "POPULATED" : "EMPTY"}</span>
      </div>
    </DashboardCard>
  );
}

// Helper to decode Base64 filename
function decodeFilename(filename: string | undefined): string {
  if (!filename) return "Unknown";
  try {
    // Check if it looks like Base64
    if (/^[A-Za-z0-9+/=]+$/.test(filename) && filename.length > 10) {
      const decoded = atob(filename);
      // Check if decoded result is printable
      if (/^[\x20-\x7E]+$/.test(decoded)) {
        return decoded;
      }
    }
    return filename;
  } catch {
    return filename;
  }
}

export function RecentPayloadsCard({ payloads = [] }: { payloads?: any[] }) {
  return (
    <DashboardCard title="Recent Payloads" icon={<Box size={18} />}>
      <div className="space-y-3">
        {payloads.map((p, i) => {
            const filename = decodeFilename(p.filemetum?.filename_text);
            return (
              <div key={p.id || i} className="flex items-center justify-between text-sm font-mono border-b border-ghost/20 pb-2 last:border-0 group/item">
                  <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-signal rounded-full group-hover/item:bg-white/80 transition-colors"></div>
                      <span className="text-signal/80 truncate max-w-[180px]" title={filename}>{filename}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400 text-xs">
                      <span className="uppercase">{p.payloadtype?.name}</span>
                      <span className={cn(
                        "hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px]",
                        p.build_phase === "success" ? "bg-green-500/20 text-green-400" :
                        p.build_phase === "building" ? "bg-yellow-500/20 text-yellow-400 animate-pulse" :
                        "bg-gray-500/20 text-gray-400"
                      )}>{p.build_phase}</span>
                  </div>
              </div>
            );
        })}
        {payloads.length === 0 && <div className="text-gray-400 text-xs">NO PAYLOADS DETECTED</div>}
      </div>
    </DashboardCard>
  );
}

export function OngoingOperationsCard({ operations = [], currentOpId, totalOperations = 0 }: { operations?: any[], currentOpId?: number, totalOperations?: number }) {
  const currentOp = operations.find(op => op.id === currentOpId) || operations[0];
  // Count members from operatoroperations array
  const memberCount = currentOp?.operatoroperations?.length || 0;

  return (
    <DashboardCard title="Operation Status" icon={<Layers size={18} />}>
       {currentOp ? (
           <>
               <div className="flex justify-between items-center mb-4 gap-2">
                  <div className="text-lg text-signal font-mono break-all" title={currentOp.name}>{currentOp.name}</div>
                  <div className="px-2 py-0.5 border border-signal text-signal text-[10px] font-mono uppercase flex-shrink-0">Active</div>
               </div>
               <div className="grid grid-cols-2 gap-4 text-xs font-mono text-gray-400">
                  <div>
                    <div className="mb-1">OPERATORS</div>
                    <div className="text-signal text-lg">{memberCount}</div>
                  </div>
                   <div>
                    <div className="mb-1">TOTAL OPS</div>
                    <div className="text-signal text-lg">{totalOperations}</div>
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

interface CommandStatsProps {
  tasks?: any[];
  totalTasks?: number;
  completedTasks?: number;
  errorTasks?: number;
  opsecTasks?: number;
}

export function CommandStatsCard({ tasks = [], totalTasks = 0, completedTasks = 0, errorTasks = 0, opsecTasks = 0 }: CommandStatsProps) {
    // Calculate command frequency from recent tasks
    const commandFrequency = useMemo(() => {
      const freq: Record<string, number> = {};
      tasks.forEach(t => {
        if (t.command_name) {
          freq[t.command_name] = (freq[t.command_name] || 0) + 1;
        }
      });
      return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
    }, [tasks]);

    const maxFreq = commandFrequency.length > 0 ? Math.max(...commandFrequency.map(c => c[1])) : 1;

    return (
        <DashboardCard title="Command Statistics" icon={<Terminal size={18} />}>
          <div className="space-y-4">
            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-2 text-center border-b border-ghost/20 pb-4">
              <div>
                <div className="text-2xl font-mono text-signal font-bold">{totalTasks}</div>
                <div className="text-[10px] text-gray-500 font-mono">TOTAL</div>
              </div>
              <div>
                <div className="text-2xl font-mono text-green-400 font-bold">{completedTasks}</div>
                <div className="text-[10px] text-gray-500 font-mono">DONE</div>
              </div>
              <div>
                <div className="text-2xl font-mono text-red-400 font-bold">{errorTasks}</div>
                <div className="text-[10px] text-gray-500 font-mono">ERROR</div>
              </div>
              <div>
                <div className="text-2xl font-mono text-yellow-400 font-bold">{opsecTasks}</div>
                <div className="text-[10px] text-gray-500 font-mono">OPSEC</div>
              </div>
            </div>

            {/* Command Frequency */}
            <div className="space-y-2">
              <div className="text-[10px] text-gray-500 font-mono mb-2">RECENT COMMAND FREQUENCY</div>
              {commandFrequency.length > 0 ? (
                commandFrequency.map(([cmd, count]) => (
                  <div key={cmd} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-signal/80 w-20 truncate">{cmd}</span>
                    <div className="flex-1 h-1.5 bg-ghost/20 overflow-hidden">
                      <div 
                        className="h-full bg-signal/60 transition-all duration-500"
                        style={{ width: `${(count / maxFreq) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-gray-500 w-6 text-right">{count}</span>
                  </div>
                ))
              ) : (
                <div className="text-gray-500 text-xs font-mono text-center py-4">NO COMMANDS EXECUTED</div>
              )}
            </div>
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
                )}>{runningCount}</span>
                <span className="text-gray-400 font-mono mb-1 text-xs">/ {totalCount} RUNNING</span>
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
                                p.running ? "bg-signal animate-pulse" : "bg-red-500"
                            )} />
                            <span className={p.running ? "text-signal" : "text-red-500"}>
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

// New Cards for additional stats

interface QuickStatsCardProps {
  credentials?: number;
  keylogs?: number;
  downloads?: number;
  uploads?: number;
  screenshots?: number;
}

export function QuickStatsCard({ credentials = 0, keylogs = 0, downloads = 0, uploads = 0, screenshots = 0 }: QuickStatsCardProps) {
  const stats = [
    { label: "CREDENTIALS", value: credentials, icon: Key, color: "text-yellow-400" },
    { label: "DOWNLOADS", value: downloads, icon: Download, color: "text-blue-400" },
    { label: "UPLOADS", value: uploads, icon: Upload, color: "text-purple-400" },
    { label: "SCREENSHOTS", value: screenshots, icon: Image, color: "text-cyan-400" },
  ];

  return (
    <DashboardCard title="Asset Collection" icon={<Shield size={18} />}>
      <div className="grid grid-cols-2 gap-4">
        {stats.map(s => (
          <div key={s.label} className="flex items-center gap-2">
            <s.icon size={16} className={cn("opacity-70", s.color)} />
            <div>
              <div className={cn("text-xl font-mono font-bold", s.value > 0 ? s.color : "text-gray-600")}>{s.value}</div>
              <div className="text-[9px] text-gray-500 font-mono">{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}

interface ActiveOperatorsCardProps {
  operators?: any[];
}

export function ActiveOperatorsCard({ operators = [] }: ActiveOperatorsCardProps) {
  return (
    <DashboardCard title="Active Operators" icon={<Users size={18} />}>
      <div className="flex items-end gap-2 mb-4">
        <span className="text-4xl font-bold text-signal font-mono">{operators.length}</span>
        <span className="text-gray-400 font-mono mb-1 text-xs">ONLINE</span>
      </div>
      <div className="space-y-2 max-h-[100px] overflow-y-auto custom-scrollbar">
        {operators.slice(0, 5).map(op => (
          <div key={op.id} className="flex items-center justify-between text-xs font-mono border-b border-ghost/20 pb-1 last:border-0">
            <span className="text-signal">{op.username}</span>
            {op.last_login && (
              <span className="text-gray-500 text-[10px]">
                {new Date(op.last_login).toLocaleDateString()}
              </span>
            )}
          </div>
        ))}
        {operators.length === 0 && <div className="text-gray-500 text-xs">NO OPERATORS ONLINE</div>}
      </div>
    </DashboardCard>
  );
}

interface RecentActivityCardProps {
  tasks?: any[];
}

export function RecentActivityCard({ tasks = [] }: RecentActivityCardProps) {
  const recentTasks = tasks.slice(0, 8);

  return (
    <DashboardCard title="Recent Activity" icon={<Clock size={18} />}>
      <div className="space-y-2 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
        {recentTasks.map(task => (
          <div key={task.id} className="flex items-center gap-2 text-xs font-mono border-b border-ghost/10 pb-1.5 last:border-0">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full flex-shrink-0",
              task.status === "completed" ? "bg-green-500" :
              task.status === "error" ? "bg-red-500" :
              task.status === "processing" ? "bg-blue-500 animate-pulse" :
              "bg-yellow-500 animate-pulse"
            )} />
            <span className="text-signal truncate flex-1">{task.command_name}</span>
            <span className="text-gray-500 text-[10px] flex-shrink-0">
              {task.callback?.host?.substring(0, 10) || "—"}
            </span>
          </div>
        ))}
        {recentTasks.length === 0 && <div className="text-gray-500 text-xs text-center py-4">NO RECENT ACTIVITY</div>}
      </div>
    </DashboardCard>
  );
}
