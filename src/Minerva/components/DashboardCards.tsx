import React, { useMemo, useEffect, useState } from 'react';
import { Activity, Box, Terminal, Layers, Cpu, Server, Database, Key, Download, Upload, Image, Shield, Users, Clock, CheckCircle, PieChart as PieChartIcon, AlertTriangle, Gauge, Radio, Zap, TrendingUp, TrendingDown, Minus, Wifi, Signal as SignalIcon, Hexagon, Timer, Calendar } from 'lucide-react';
import { tDelta } from '../lib/operationSchedule';
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
      "border border-ghost/30 bg-black/40 backdrop-blur-md rounded p-6 relative group overflow-hidden hover:border-signal/60 transition-colors duration-500 h-full",
      className
    )}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 text-gray-100 group-hover:text-signal transition-colors duration-300">
        {icon}
        <h3 className="font-mono text-base tracking-widest uppercase font-semibold">{title}</h3>
      </div>

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>

      {/* Background Noise/Scanline */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22300%22%20height%3D%22300%22%3E%3Cfilter%20id%3D%22n%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.65%22%20numOctaves%3D%223%22%20stitchTiles%3D%22stitch%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23n)%22%2F%3E%3C%2Fsvg%3E')] opacity-[0.03] pointer-events-none"></div>
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
        <span className="text-gray-200 font-mono mb-2 text-sm">/ {totalCount} TOTAL</span>
      </div>
      <div className="mt-4 h-1.5 w-full bg-ghost/30">
        <div className="h-full bg-signal transition-all duration-1000" style={{ width: totalCount > 0 ? `${(count / totalCount) * 100}%` : '0%' }}></div>
      </div>
      <div className="mt-2 text-sm text-gray-200 font-mono flex justify-between">
        <span>SIGNAL_STRENGTH</span>
        <span className={count > 0 ? "text-signal font-semibold" : ""}>{count > 0 ? "STRONG" : "NO_SIGNAL"}</span>
      </div>
    </DashboardCard>
  );
}

export function PayloadStatsCard({ count = 0 }: { count?: number }) {
  return (
    <DashboardCard title="Total Payloads" icon={<Database size={18} />}>
      <div className="flex items-end gap-2">
        <span className="text-5xl font-bold text-signal font-mono">{count}</span>
        <span className="text-gray-200 font-mono mb-2 text-sm">GENERATED</span>
      </div>
      <div className="mt-4 h-1.5 w-full bg-ghost/30">
        <div className="h-full bg-signal transition-all duration-1000" style={{ width: `${Math.min(count * 2, 100)}%` }}></div>
      </div>
      <div className="mt-2 text-sm text-gray-200 font-mono flex justify-between">
        <span>REPOSITORY</span>
        <span className={count > 0 ? "text-signal font-semibold" : ""}>{count > 0 ? "POPULATED" : "EMPTY"}</span>
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
      <div className="space-y-2.5">
        {payloads.map((p, i) => {
          const filename = decodeFilename(p.filemetum?.filename_text);
          return (
            <div key={p.id || i} className="flex items-center justify-between text-sm font-mono border-b border-ghost/30 pb-2 last:border-0 group/item">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-2 h-2 bg-signal rounded-full group-hover/item:bg-white transition-colors flex-shrink-0"></div>
                <span className="text-signal truncate max-w-[200px]" title={filename}>{filename}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-200 text-xs">
                <span className="uppercase">{p.payloadtype?.name}</span>
                <span className={cn(
                  "hidden sm:inline-block px-2 py-0.5 rounded text-xs font-semibold",
                  p.build_phase === "success" ? "bg-green-500/25 text-green-300" :
                    p.build_phase === "building" ? "bg-yellow-500/25 text-yellow-300 animate-pulse" :
                      "bg-gray-500/30 text-gray-200"
                )}>{p.build_phase}</span>
              </div>
            </div>
          );
        })}
        {payloads.length === 0 && <div className="text-gray-300 text-sm">NO PAYLOADS DETECTED</div>}
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
            <div className="text-xl text-signal font-mono break-all font-semibold" title={currentOp.name}>{currentOp.name}</div>
            <div className="px-2.5 py-1 border border-signal text-signal text-xs font-mono uppercase flex-shrink-0 font-semibold">Active</div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm font-mono text-gray-200">
            <div>
              <div className="mb-1 text-xs uppercase tracking-widest">OPERATORS</div>
              <div className="text-signal text-2xl font-bold">{memberCount}</div>
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-widest">TOTAL OPS</div>
              <div className="text-signal text-2xl font-bold">{totalOperations}</div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-gray-300 text-sm font-mono">NO ACTIVE OPERATIONS</div>
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
        <div className="grid grid-cols-4 gap-2 text-center border-b border-ghost/30 pb-4">
          <div>
            <div className="text-3xl font-mono text-signal font-bold">{totalTasks}</div>
            <div className="text-xs text-gray-300 font-mono uppercase tracking-widest mt-1">TOTAL</div>
          </div>
          <div>
            <div className="text-3xl font-mono text-green-400 font-bold">{completedTasks}</div>
            <div className="text-xs text-gray-300 font-mono uppercase tracking-widest mt-1">DONE</div>
          </div>
          <div>
            <div className="text-3xl font-mono text-red-400 font-bold">{errorTasks}</div>
            <div className="text-xs text-gray-300 font-mono uppercase tracking-widest mt-1">ERROR</div>
          </div>
          <div>
            <div className="text-3xl font-mono text-yellow-400 font-bold">{opsecTasks}</div>
            <div className="text-xs text-gray-300 font-mono uppercase tracking-widest mt-1">OPSEC</div>
          </div>
        </div>

        {/* Command Frequency */}
        <div className="space-y-2.5">
          <div className="text-xs text-gray-300 font-mono mb-3 uppercase tracking-widest">RECENT COMMAND FREQUENCY</div>
          {commandFrequency.length > 0 ? (
            commandFrequency.map(([cmd, count]) => (
              <div key={cmd} className="flex items-center gap-3">
                <span className="text-sm font-mono text-signal w-24 truncate">{cmd}</span>
                <div className="flex-1 h-2 bg-ghost/30 overflow-hidden rounded-sm">
                  <div
                    className="h-full bg-signal/80 transition-all duration-500"
                    style={{ width: `${(count / maxFreq) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-mono text-gray-100 w-8 text-right tabular-nums">{count}</span>
              </div>
            ))
          ) : (
            <div className="text-gray-300 text-sm font-mono text-center py-4">NO COMMANDS EXECUTED</div>
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
          totalCount > 0 ? "text-signal" : "text-gray-300"
        )}>{runningCount}</span>
        <span className="text-gray-200 font-mono mb-1 text-sm">/ {totalCount} RUNNING</span>
      </div>

      <div className="space-y-2 max-h-[140px] overflow-y-auto cyber-scrollbar pr-1">
        {profiles.map(p => (
          <div key={p.id} className="flex items-center justify-between text-sm font-mono border-b border-ghost/30 pb-1.5 last:border-0">
            <span className={cn(
              "truncate max-w-[140px]",
              p.running ? "text-signal" : "text-gray-300"
            )}>{p.name}</span>
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                p.running ? "bg-signal animate-pulse" : "bg-red-500"
              )} />
              <span className={cn("text-xs font-semibold", p.running ? "text-signal" : "text-red-400")}>
                {p.running ? "UP" : "DOWN"}
              </span>
            </div>
          </div>
        ))}
        {profiles.length === 0 && <div className="text-gray-300 text-sm italic">NO PROFILES FOUND</div>}
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
          <div key={s.label} className="flex items-center gap-2.5">
            <s.icon size={20} className={cn("opacity-90", s.color)} />
            <div>
              <div className={cn("text-2xl font-mono font-bold leading-none", s.value > 0 ? s.color : "text-gray-400")}>{s.value}</div>
              <div className="text-xs text-gray-300 font-mono mt-1 uppercase tracking-widest">{s.label}</div>
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
        <span className="text-gray-200 font-mono mb-1 text-sm uppercase tracking-widest">ONLINE</span>
      </div>
      <div className="space-y-1.5 max-h-[120px] overflow-y-auto cyber-scrollbar">
        {operators.slice(0, 5).map(op => (
          <div key={op.id} className="flex items-center justify-between text-sm font-mono border-b border-ghost/30 pb-1.5 last:border-0">
            <span className="text-signal">{op.username}</span>
            {op.last_login && (
              <span className="text-gray-300 text-xs">
                {new Date(op.last_login).toLocaleDateString()}
              </span>
            )}
          </div>
        ))}
        {operators.length === 0 && <div className="text-gray-300 text-sm">NO OPERATORS ONLINE</div>}
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
      <div className="space-y-1.5 max-h-[200px] overflow-y-auto cyber-scrollbar pr-1">
        {recentTasks.map(task => (
          <div key={task.id} className="flex items-center gap-2.5 text-sm font-mono border-b border-ghost/30 pb-1.5 last:border-0">
            <div className={cn(
              "w-2 h-2 rounded-full flex-shrink-0",
              task.status === "completed" ? "bg-green-500" :
                task.status === "error" ? "bg-red-500" :
                  task.status === "processing" ? "bg-blue-500 animate-pulse" :
                    "bg-yellow-500 animate-pulse"
            )} />
            <span className="text-signal truncate flex-1">{task.command_name}</span>
            <span className="text-gray-300 text-xs flex-shrink-0">
              {task.callback?.host?.substring(0, 12) || "—"}
            </span>
          </div>
        ))}
        {recentTasks.length === 0 && <div className="text-gray-300 text-sm text-center py-4">NO RECENT ACTIVITY</div>}
      </div>
    </DashboardCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG DONUT CHART (pure CSS/SVG — no charting library)
// ─────────────────────────────────────────────────────────────────────────────

const DONUT_COLORS = ['#00ffd1', '#ff5555', '#ffaa44', '#aa66ff', '#44aaff', '#ff66aa', '#66ff88', '#ffdd44', '#44ffcc', '#ff8844'];

interface PieSlice { label: string; value: number; color?: string; }

function CyberDonutChart({ slices, size = 120 }: { slices: PieSlice[]; size?: number }) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="flex items-center justify-center text-gray-300 text-sm font-mono" style={{ width: size, height: size }}>NO DATA</div>;

  const r = size / 2;
  const stroke = size * 0.2;
  const innerR = r - stroke;
  const cx = r, cy = r;
  let cumAngle = -90; // start from top

  const arcs = slices.filter(s => s.value > 0).map((s, i) => {
    const angle = (s.value / total) * 360;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;

    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const x1 = cx + innerR * Math.cos(toRad(startAngle));
    const y1 = cy + innerR * Math.sin(toRad(startAngle));
    const x2 = cx + innerR * Math.cos(toRad(endAngle));
    const y2 = cy + innerR * Math.sin(toRad(endAngle));
    const ox1 = cx + r * Math.cos(toRad(startAngle));
    const oy1 = cy + r * Math.sin(toRad(startAngle));
    const ox2 = cx + r * Math.cos(toRad(endAngle));
    const oy2 = cy + r * Math.sin(toRad(endAngle));

    const largeArc = angle > 180 ? 1 : 0;
    const color = s.color || DONUT_COLORS[i % DONUT_COLORS.length];

    const d = [
      `M ${ox1} ${oy1}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${ox2} ${oy2}`,
      `L ${x2} ${y2}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1} ${y1}`,
      'Z'
    ].join(' ');

    return <path key={i} d={d} fill={color} opacity={0.85} className="transition-opacity hover:opacity-100" />;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs}
      <text x={cx} y={cy - 2} textAnchor="middle" fill="white" fontSize={size * 0.22} fontFamily="JetBrains Mono, monospace" fontWeight="bold">{total}</text>
      <text x={cx} y={cy + size * 0.16} textAnchor="middle" fill="#d1d5db" fontSize={size * 0.10} fontFamily="JetBrains Mono, monospace" fontWeight="600" letterSpacing="2">TOTAL</text>
    </svg>
  );
}

function DonutLegend({ slices }: { slices: PieSlice[] }) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  return (
    <div className="space-y-1.5 overflow-auto cyber-scrollbar max-h-[160px]">
      {slices.filter(s => s.value > 0).map((s, i) => (
        <div key={s.label} className="flex items-center gap-2 text-sm font-mono">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color || DONUT_COLORS[i % DONUT_COLORS.length] }} />
          <span className="text-gray-100 truncate flex-1" title={s.label}>{s.label}</span>
          <span className="text-white font-semibold">{s.value}</span>
          {total > 0 && <span className="text-gray-300 w-10 text-right">{Math.round((s.value / total) * 100)}%</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Chart-Based Widgets ─────────────────────────────────────────────────────

export function TopCommandsPieCard({ tasks = [] }: { tasks?: any[] }) {
  const slices = useMemo(() => {
    const freq: Record<string, number> = {};
    tasks.forEach(t => { if (t.command_name) freq[t.command_name] = (freq[t.command_name] || 0) + 1; });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value], i) => ({ label, value, color: DONUT_COLORS[i % DONUT_COLORS.length] }));
  }, [tasks]);

  return (
    <DashboardCard title="Top Commands" icon={<PieChartIcon size={18} />}>
      <div className="flex items-start gap-4">
        <CyberDonutChart slices={slices} size={110} />
        <div className="flex-1 min-w-0"><DonutLegend slices={slices} /></div>
      </div>
    </DashboardCard>
  );
}

export function TaskStatusPieCard({ tasks = [] }: { tasks?: any[] }) {
  const slices = useMemo(() => {
    let completed = 0, error = 0, processing = 0, submitted = 0, other = 0;
    tasks.forEach(t => {
      if (t.status === 'completed' || t.completed) completed++;
      else if (t.status === 'error') error++;
      else if (t.status === 'processing' || t.status === 'delegating' || t.status === 'processed') processing++;
      else if (t.status === 'submitted' || t.status === 'preprocessing') submitted++;
      else other++;
    });
    return [
      { label: 'Completed', value: completed, color: '#22c55e' },
      { label: 'Error', value: error, color: '#ef4444' },
      { label: 'Processing', value: processing, color: '#3b82f6' },
      { label: 'Submitted', value: submitted, color: '#eab308' },
      { label: 'Other', value: other, color: '#6b7280' },
    ].filter(s => s.value > 0);
  }, [tasks]);

  return (
    <DashboardCard title="Task Status" icon={<CheckCircle size={18} />}>
      <div className="flex items-start gap-4">
        <CyberDonutChart slices={slices} size={110} />
        <div className="flex-1 min-w-0"><DonutLegend slices={slices} /></div>
      </div>
    </DashboardCard>
  );
}

export function HostContextPieCard({ callbacks = [] }: { callbacks?: any[] }) {
  const slices = useMemo(() => {
    const freq: Record<string, number> = {};
    callbacks.forEach(c => {
      const host = c.host || 'Unknown';
      freq[host] = (freq[host] || 0) + 1;
    });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value], i) => ({ label, value, color: DONUT_COLORS[i % DONUT_COLORS.length] }));
  }, [callbacks]);

  return (
    <DashboardCard title="Callbacks by Host" icon={<Activity size={18} />}>
      <div className="flex items-start gap-4">
        <CyberDonutChart slices={slices} size={110} />
        <div className="flex-1 min-w-0"><DonutLegend slices={slices} /></div>
      </div>
    </DashboardCard>
  );
}

export function UserContextPieCard({ callbacks = [] }: { callbacks?: any[] }) {
  const slices = useMemo(() => {
    const freq: Record<string, number> = {};
    callbacks.forEach(c => {
      const user = c.user || 'Unknown';
      freq[user] = (freq[user] || 0) + 1;
    });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value], i) => ({ label, value, color: DONUT_COLORS[i % DONUT_COLORS.length] }));
  }, [callbacks]);

  return (
    <DashboardCard title="Callbacks by User" icon={<Users size={18} />}>
      <div className="flex items-start gap-4">
        <CyberDonutChart slices={slices} size={110} />
        <div className="flex-1 min-w-0"><DonutLegend slices={slices} /></div>
      </div>
    </DashboardCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REDESIGNED DASHBOARD — Mission Control widgets
// ─────────────────────────────────────────────────────────────────────────────

function parseTaskTime(t: any): number {
  if (!t?.timestamp) return 0;
  const s = typeof t.timestamp === 'string' && !t.timestamp.endsWith('Z') ? `${t.timestamp}Z` : t.timestamp;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function bucketByMinute(tasks: any[], buckets = 30, windowMs = 30 * 60 * 1000): number[] {
  const now = Date.now();
  const arr = new Array(buckets).fill(0);
  tasks.forEach(t => {
    const ts = parseTaskTime(t);
    if (!ts) return;
    const age = now - ts;
    if (age < 0 || age > windowMs) return;
    const idx = Math.min(buckets - 1, Math.floor((windowMs - age) / (windowMs / buckets)));
    arr[idx]++;
  });
  return arr;
}

function bucketByHour24(tasks: any[]): number[] {
  const now = Date.now();
  const arr = new Array(24).fill(0);
  const windowMs = 24 * 60 * 60 * 1000;
  tasks.forEach(t => {
    const ts = parseTaskTime(t);
    if (!ts) return;
    const age = now - ts;
    if (age < 0 || age > windowMs) return;
    const idx = Math.min(23, Math.floor((windowMs - age) / (60 * 60 * 1000)));
    arr[idx]++;
  });
  return arr;
}

// ── Sparkline ────────────────────────────────────────────────────────────────

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  className?: string;
}

export function Sparkline({ values, width = 120, height = 32, color, fill = true, className }: SparklineProps) {
  if (!values || values.length === 0) {
    return <svg width={width} height={height} className={className} />;
  }
  const max = Math.max(1, ...values);
  const stepX = width / Math.max(1, values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - 2 - (v / max) * (height - 4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;
  const stroke = color || 'rgb(var(--color-signal))';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} preserveAspectRatio="none">
      {fill && <path d={areaPath} fill={stroke} opacity={0.12} />}
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
      {values.length > 0 && (() => {
        const last = values[values.length - 1];
        const lx = (values.length - 1) * stepX;
        const ly = height - 2 - (last / max) * (height - 4);
        return <circle cx={lx} cy={ly} r={2} fill={stroke} />;
      })()}
    </svg>
  );
}

// ── KPI Tile (hero KPIs with sparkline + delta) ─────────────────────────────

interface KpiTileProps {
  label: string;
  value: number | string;
  unit?: string;
  icon?: React.ReactNode;
  spark?: number[];
  delta?: number; // % change
  tone?: 'signal' | 'green' | 'yellow' | 'red' | 'blue';
  hint?: string;
  onClick?: () => void;
}

const TONE_FG: Record<string, string> = {
  signal: 'text-signal',
  green: 'text-green-400',
  yellow: 'text-yellow-400',
  red: 'text-red-400',
  blue: 'text-blue-400',
};
const TONE_HEX: Record<string, string> = {
  signal: 'rgb(var(--color-signal))',
  green: '#4ade80',
  yellow: '#facc15',
  red: '#f87171',
  blue: '#60a5fa',
};

export function KpiTile({ label, value, unit, icon, spark, delta, tone = 'signal', hint, onClick }: KpiTileProps) {
  const fg = TONE_FG[tone];
  const hex = TONE_HEX[tone];
  const TrendIcon = typeof delta === 'number' ? (delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus) : null;
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative border border-ghost/30 bg-black/40 backdrop-blur-md rounded px-5 py-4 group overflow-hidden transition-all duration-300',
        onClick && 'cursor-pointer hover:border-signal/60 hover:bg-black/60'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-xs font-mono tracking-widest uppercase text-gray-300">
          {icon && <span className={cn('opacity-90', fg)}>{icon}</span>}
          {label}
        </div>
        {TrendIcon && (
          <div className={cn('flex items-center gap-1 text-xs font-mono', delta! > 0 ? 'text-green-400' : delta! < 0 ? 'text-red-400' : 'text-gray-300')}>
            <TrendIcon size={12} />
            {Math.abs(delta!).toFixed(0)}%
          </div>
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className={cn('text-4xl font-mono font-bold leading-none', fg)}>{value}</span>
          {unit && <span className="text-xs font-mono text-gray-300 tracking-widest uppercase">{unit}</span>}
        </div>
        {spark && spark.length > 0 && (
          <Sparkline values={spark} color={hex} width={96} height={32} />
        )}
      </div>
      {hint && <div className="mt-2 text-xs font-mono text-gray-300 tracking-wide">{hint}</div>}
    </div>
  );
}

// ── Live Clock ───────────────────────────────────────────────────────────────

function useLiveClock(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }

// ── Threat Level Gauge ───────────────────────────────────────────────────────

interface ThreatGaugeProps {
  score: number; // 0-100
  size?: number;
}

export function ThreatGauge({ score, size = 120 }: ThreatGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const r = size / 2;
  const stroke = size * 0.11;
  const innerR = r - stroke / 2 - 2;
  const cx = r, cy = r;
  // Half-circle gauge (180°), starting bottom-left at angle 180°, ending bottom-right at 360°
  const startAngle = 180;
  const endAngle = 360;
  const span = endAngle - startAngle;
  const valueAngle = startAngle + (clamped / 100) * span;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arc = (a1: number, a2: number) => {
    const x1 = cx + innerR * Math.cos(toRad(a1));
    const y1 = cy + innerR * Math.sin(toRad(a1));
    const x2 = cx + innerR * Math.cos(toRad(a2));
    const y2 = cy + innerR * Math.sin(toRad(a2));
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${innerR} ${innerR} 0 ${large} 1 ${x2} ${y2}`;
  };

  const tone = clamped < 25 ? '#22c55e' : clamped < 60 ? '#facc15' : clamped < 85 ? '#fb923c' : '#ef4444';
  const label = clamped < 25 ? 'NOMINAL' : clamped < 60 ? 'ELEVATED' : clamped < 85 ? 'HIGH' : 'CRITICAL';

  // Tick marks every 10%
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = startAngle + (i / 10) * span;
    const xo = cx + (innerR + stroke / 2 + 2) * Math.cos(toRad(a));
    const yo = cy + (innerR + stroke / 2 + 2) * Math.sin(toRad(a));
    const xi = cx + (innerR - stroke / 2 - 2) * Math.cos(toRad(a));
    const yi = cy + (innerR - stroke / 2 - 2) * Math.sin(toRad(a));
    return <line key={i} x1={xo} y1={yo} x2={xi} y2={yi} stroke="rgb(255 255 255 / 0.30)" strokeWidth={1} />;
  });

  return (
    <svg width={size} height={size * 0.62} viewBox={`0 ${size * 0.38} ${size} ${size * 0.62}`}>
      <path d={arc(startAngle, endAngle)} fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth={stroke} strokeLinecap="butt" />
      <path d={arc(startAngle, valueAngle)} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="butt" style={{ transition: 'all 600ms ease' }} />
      {ticks}
      <text x={cx} y={cy + size * 0.05} textAnchor="middle" fill={tone} fontSize={size * 0.22} fontFamily="JetBrains Mono, monospace" fontWeight="bold">{Math.round(clamped)}</text>
      <text x={cx} y={cy + size * 0.18} textAnchor="middle" fill="#e5e7eb" fontSize={size * 0.10} fontFamily="JetBrains Mono, monospace" letterSpacing="2" fontWeight="600">{label}</text>
    </svg>
  );
}

// ── Mission Hero Banner ──────────────────────────────────────────────────────

interface MissionHeroProps {
  operationName: string;
  operatorName: string;
  callbackCount: number;
  totalCallbacks: number;
  c2Running: number;
  c2Total: number;
  threatScore: number;
  loading?: boolean;
  error?: boolean;
}

export function MissionHeroBanner({ operationName, operatorName, callbackCount, totalCallbacks, c2Running, c2Total, threatScore, loading, error }: MissionHeroProps) {
  const now = useLiveClock(1000);
  const utc = `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}:${pad2(now.getUTCSeconds())}`;
  const local = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  const dateStr = now.toISOString().slice(0, 10);

  return (
    <div className="relative border border-ghost/30 bg-black/40 backdrop-blur-md rounded overflow-hidden">
      {/* scanline overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.05]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.4) 0, rgba(255,255,255,0.4) 1px, transparent 1px, transparent 3px)' }} />

      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 p-7">
        {/* left — mission identity */}
        <div className="flex flex-col justify-between min-w-0">
          <div>
            <div className="text-xs font-mono text-gray-300 tracking-[0.3em] uppercase mb-3">MISSION CONTROL</div>
            <div className="text-4xl font-bold text-signal font-mono tracking-tight truncate" title={operationName}>{operationName}</div>
            <div className="mt-2 text-sm font-mono text-gray-200 truncate">OPERATOR :: <span className="text-signal">{operatorName}</span></div>
          </div>
          <div className="mt-5 flex items-center gap-2">
            <span className={cn('w-2.5 h-2.5 rounded-full', loading ? 'bg-yellow-500 animate-pulse' : error ? 'bg-red-500' : 'bg-signal animate-pulse')} />
            <span className="text-sm font-mono text-gray-200 tracking-widest uppercase">
              {error ? 'GATEWAY OFFLINE' : loading ? 'SYNCING…' : 'GATEWAY ONLINE'}
            </span>
          </div>
        </div>

        {/* middle — clock + counters */}
        <div className="flex flex-col justify-center items-center text-center border-x border-ghost/30 px-4">
          <div className="text-xs font-mono text-gray-300 tracking-[0.3em] uppercase">UTC // {dateStr}</div>
          <div className="text-5xl font-mono font-bold text-signal tracking-wider tabular-nums leading-none my-3">{utc}</div>
          <div className="text-sm font-mono text-gray-200 tracking-widest">LOCAL {local}</div>
          <div className="grid grid-cols-2 gap-6 mt-5 w-full max-w-[280px]">
            <div>
              <div className="text-3xl font-mono font-bold text-signal">{callbackCount}<span className="text-sm text-gray-300">/{totalCallbacks}</span></div>
              <div className="text-xs font-mono text-gray-300 tracking-widest uppercase mt-0.5">CALLBACKS</div>
            </div>
            <div>
              <div className="text-3xl font-mono font-bold text-signal">{c2Running}<span className="text-sm text-gray-300">/{c2Total}</span></div>
              <div className="text-xs font-mono text-gray-300 tracking-widest uppercase mt-0.5">C2 ONLINE</div>
            </div>
          </div>
        </div>

        {/* right — threat gauge */}
        <div className="flex flex-col items-center justify-center">
          <div className="text-xs font-mono text-gray-300 tracking-[0.3em] uppercase mb-2">THREAT POSTURE</div>
          <ThreatGauge score={threatScore} size={190} />
          <div className="mt-2 flex items-center gap-2 text-xs font-mono text-gray-300 tracking-widest uppercase">
            <AlertTriangle size={13} className="text-yellow-400" /> COMPOSITE_RISK_INDEX
          </div>
        </div>
      </div>
    </div>
  );
}

// ── KPI Strip — 4 hero KPIs derived from data ──────────────────────────────

interface KpiStripProps {
  callbacks: any[];
  totalCallbacks: number;
  tasks: any[];
  totalTasks: number;
  completedTasks: number;
  errorTasks: number;
  opsecTasks: number;
  onCallbacks?: () => void;
  onOpsec?: () => void;
}

export function KpiStrip({ callbacks, totalCallbacks, tasks, totalTasks, completedTasks, errorTasks, opsecTasks, onCallbacks, onOpsec }: KpiStripProps) {
  const m30 = useMemo(() => bucketByMinute(tasks, 30, 30 * 60 * 1000), [tasks]);
  const last5min = useMemo(() => m30.slice(-5).reduce((a, b) => a + b, 0), [m30]);
  const prev5min = useMemo(() => m30.slice(-10, -5).reduce((a, b) => a + b, 0), [m30]);
  const tasksPerMinute = (last5min / 5).toFixed(1);
  const throughputDelta = prev5min === 0 ? (last5min > 0 ? 100 : 0) : ((last5min - prev5min) / prev5min) * 100;

  const successRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const successSpark = useMemo(() => {
    // Build 12-point "rolling" success rate over last 60 min in 5-min windows
    const buckets = bucketByMinute(tasks, 12, 60 * 60 * 1000);
    return buckets;
  }, [tasks]);

  const callbackSpark = useMemo(() => {
    // Use task buckets as proxy of callback activity if no creation_time
    return bucketByMinute(tasks, 24, 60 * 60 * 1000);
  }, [tasks]);

  const opsecTone = opsecTasks > 0 ? 'red' : 'signal';
  const errorRate = totalTasks > 0 ? (errorTasks / totalTasks) * 100 : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiTile
        label="Active Callbacks"
        value={callbacks.length}
        unit={`/ ${totalCallbacks}`}
        icon={<Radio size={11} />}
        spark={callbackSpark}
        tone="signal"
        hint={callbacks.length > 0 ? 'BEACONS LIVE' : 'NO CONTACT'}
        onClick={onCallbacks}
      />
      <KpiTile
        label="Task Throughput"
        value={tasksPerMinute}
        unit="t/min · 5m"
        icon={<Zap size={11} />}
        spark={m30}
        delta={throughputDelta}
        tone="blue"
        hint={`${last5min} tasks · 5m window`}
      />
      <KpiTile
        label="Success Rate"
        value={`${successRate.toFixed(0)}%`}
        icon={<CheckCircle size={11} />}
        spark={successSpark}
        tone={successRate >= 80 ? 'green' : successRate >= 50 ? 'yellow' : 'red'}
        hint={`${completedTasks}/${totalTasks} completed · err ${errorRate.toFixed(0)}%`}
      />
      <KpiTile
        label="OPSEC Pending"
        value={opsecTasks}
        unit={opsecTasks > 0 ? 'REVIEW' : 'CLEAR'}
        icon={<AlertTriangle size={11} />}
        tone={opsecTone}
        hint={opsecTasks > 0 ? 'AWAITING APPROVAL' : 'NO BLOCKED TASKS'}
        onClick={onOpsec}
      />
    </div>
  );
}

// ── 24h Activity Heatmap ─────────────────────────────────────────────────────

export function ActivityHeatmapCard({ tasks = [] }: { tasks?: any[] }) {
  const buckets = useMemo(() => bucketByHour24(tasks), [tasks]);
  const max = Math.max(1, ...buckets);
  const peak = buckets.indexOf(Math.max(...buckets));
  const total24 = buckets.reduce((a, b) => a + b, 0);
  const now = useLiveClock(60_000);
  const currentHourLabel = pad2(now.getHours());

  return (
    <DashboardCard title="24h Task Activity" icon={<Activity size={18} />}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4 pb-3 border-b border-ghost/30">
          <div>
            <div className="text-3xl font-mono font-bold text-signal">{total24}</div>
            <div className="text-xs font-mono text-gray-300 uppercase tracking-widest mt-0.5">TASKS · 24H</div>
          </div>
          <div>
            <div className="text-3xl font-mono font-bold text-signal">{buckets[peak]}</div>
            <div className="text-xs font-mono text-gray-300 uppercase tracking-widest mt-0.5">PEAK HOUR</div>
          </div>
        </div>
        <div className="flex items-end gap-[3px] h-[100px]">
          {buckets.map((v, i) => {
            const h = max > 0 ? Math.max(3, (v / max) * 90) : 3;
            const intensity = max > 0 ? v / max : 0;
            const opacity = 0.4 + intensity * 0.6;
            const isCurrent = i === buckets.length - 1;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group/bar relative">
                <div
                  className={cn('w-full transition-all duration-500', isCurrent ? 'ring-1 ring-signal/60' : '')}
                  style={{
                    height: `${h}px`,
                    backgroundColor: 'rgb(var(--color-signal))',
                    opacity,
                  }}
                />
                <div className="absolute -top-7 hidden group-hover/bar:block bg-black border border-signal/60 px-2 py-1 text-xs font-mono whitespace-nowrap z-10 text-gray-100">
                  {v} tasks · {24 - 1 - i}h ago
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-xs font-mono text-gray-300 tracking-widest pt-1">
          <span>-24h</span>
          <span>-12h</span>
          <span>NOW · {currentHourLabel}:00</span>
        </div>
      </div>
    </DashboardCard>
  );
}

// ── Live Activity Ticker ─────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  if (!ts) return '—';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function LiveActivityFeedCard({ tasks = [] }: { tasks?: any[] }) {
  // Re-render every 15s so timeAgo stays fresh
  useLiveClock(15_000);
  const recent = useMemo(() => tasks.slice(0, 14), [tasks]);

  return (
    <DashboardCard title="Live Task Stream" icon={<Clock size={18} />}>
      <div className="space-y-1 max-h-[300px] overflow-y-auto cyber-scrollbar pr-1">
        {recent.map((task, idx) => {
          const ts = parseTaskTime(task);
          const ago = timeAgo(ts);
          const status = task.status as string | undefined;
          const isOpsec = (task.opsec_pre_blocked && !task.opsec_pre_bypassed) || (task.opsec_post_blocked && !task.opsec_post_bypassed);
          const dotClass =
            isOpsec ? 'bg-yellow-500 animate-pulse' :
            task.completed ? 'bg-green-500' :
            status === 'error' ? 'bg-red-500' :
            status === 'processing' || status === 'delegating' || status === 'processed' ? 'bg-blue-500 animate-pulse' :
            'bg-gray-400 animate-pulse';
          return (
            <div key={task.id || idx} className="flex items-center gap-2.5 text-sm font-mono py-1.5 border-b border-ghost/20 last:border-0 hover:bg-signal/5 px-1.5 -mx-1.5 transition-colors">
              <div className={cn('w-2 h-2 rounded-full flex-shrink-0', dotClass)} />
              <span className="text-gray-300 tabular-nums w-10 flex-shrink-0">{ago}</span>
              <span className="text-signal truncate flex-1" title={task.command_name}>{task.command_name || '—'}</span>
              <span className="text-gray-300 truncate max-w-[100px]" title={task.callback?.host || task.operator?.username}>
                {task.operator?.username ? `@${task.operator.username}` : (task.callback?.host || '—')}
              </span>
              <span className="text-gray-400 text-xs flex-shrink-0">{task.callback?.display_id ? `#${task.callback.display_id}` : ''}</span>
            </div>
          );
        })}
        {recent.length === 0 && <div className="text-gray-300 text-sm text-center py-6 font-mono">NO TASK STREAM</div>}
      </div>
    </DashboardCard>
  );
}

// ── Improved C2 Health Matrix ────────────────────────────────────────────────

export function C2MatrixCard({ profiles = [] }: { profiles?: any[] }) {
  const running = profiles.filter(p => p.running).length;
  const total = profiles.length;
  const containers = profiles.filter(p => p.container_running).length;
  const healthPct = total > 0 ? (running / total) * 100 : 0;
  const healthTone = healthPct >= 80 ? 'text-green-400' : healthPct >= 50 ? 'text-yellow-400' : 'text-red-400';

  return (
    <DashboardCard title="C2 Infrastructure" icon={<Server size={18} />}>
      <div className="grid grid-cols-3 gap-2 pb-3 border-b border-ghost/30 mb-3">
        <div>
          <div className={cn('text-3xl font-mono font-bold', healthTone)}>{running}</div>
          <div className="text-xs font-mono text-gray-300 uppercase tracking-widest mt-0.5">RUNNING</div>
        </div>
        <div>
          <div className="text-3xl font-mono font-bold text-gray-100">{containers}</div>
          <div className="text-xs font-mono text-gray-300 uppercase tracking-widest mt-0.5">CONTAINERS</div>
        </div>
        <div>
          <div className="text-3xl font-mono font-bold text-gray-100">{total}</div>
          <div className="text-xs font-mono text-gray-300 uppercase tracking-widest mt-0.5">TOTAL</div>
        </div>
      </div>
      <div className="space-y-1 max-h-[200px] overflow-y-auto cyber-scrollbar pr-1">
        {profiles.length === 0 && <div className="text-gray-300 text-sm italic font-mono">NO PROFILES FOUND</div>}
        {profiles.map(p => (
          <div key={p.id} className="flex items-center gap-2 text-sm font-mono border-b border-ghost/20 last:border-0 py-1.5">
            <Hexagon size={12} className={cn(p.is_p2p ? 'text-purple-300' : 'text-blue-300', 'flex-shrink-0')} />
            <span className={cn('truncate flex-1', p.running ? 'text-signal' : 'text-gray-300')}>{p.name}</span>
            {p.semver && <span className="text-gray-300 text-xs flex-shrink-0">v{p.semver}</span>}
            <span className={cn('text-xs uppercase tracking-widest flex-shrink-0 font-semibold', p.is_p2p ? 'text-purple-300' : 'text-blue-300')}>
              {p.is_p2p ? 'P2P' : 'EGRESS'}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className={cn('w-2 h-2 rounded-full', p.running ? 'bg-signal animate-pulse' : 'bg-red-500')} />
              <span className={cn('text-xs font-semibold', p.running ? 'text-signal' : 'text-red-400')}>{p.running ? 'UP' : 'DOWN'}</span>
            </div>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}

// ── Operation Briefing (replaces OngoingOperations with richer detail) ───────

export function OperationBriefingCard({ operations = [], currentOpId, totalOperations = 0 }: { operations?: any[]; currentOpId?: number; totalOperations?: number }) {
  const currentOp = operations.find(op => op.id === currentOpId) || operations[0];
  const memberCount = currentOp?.operatoroperations?.length || 0;
  const otherOps = operations.filter(op => op.id !== currentOp?.id).slice(0, 4);

  return (
    <DashboardCard title="Operation Briefing" icon={<Layers size={18} />}>
      {currentOp ? (
        <>
          <div className="flex justify-between items-start mb-3 gap-2">
            <div className="min-w-0">
              <div className="text-xs font-mono text-gray-300 tracking-widest uppercase">ACTIVE</div>
              <div className="text-xl text-signal font-mono break-all font-semibold" title={currentOp.name}>{currentOp.name}</div>
            </div>
            <div className="px-2.5 py-1 border border-signal/70 text-signal text-xs font-mono uppercase flex-shrink-0 animate-pulse font-semibold">LIVE</div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm font-mono pb-3 border-b border-ghost/30">
            <div>
              <div className="text-signal text-2xl font-bold">{memberCount}</div>
              <div className="text-xs text-gray-300 uppercase tracking-widest mt-0.5">OPERATORS</div>
            </div>
            <div>
              <div className="text-signal text-2xl font-bold">{operations.length}</div>
              <div className="text-xs text-gray-300 uppercase tracking-widest mt-0.5">RUNNING</div>
            </div>
            <div>
              <div className="text-signal text-2xl font-bold">{totalOperations}</div>
              <div className="text-xs text-gray-300 uppercase tracking-widest mt-0.5">TOTAL</div>
            </div>
          </div>
          {otherOps.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-mono text-gray-300 uppercase tracking-widest mb-2">OTHER OPERATIONS</div>
              <div className="space-y-1">
                {otherOps.map(op => (
                  <div key={op.id} className="flex items-center justify-between text-sm font-mono border-b border-ghost/20 last:border-0 py-1">
                    <span className="text-gray-100 truncate" title={op.name}>{op.name}</span>
                    <span className="text-gray-300 text-xs">{op.operatoroperations?.length || 0} OPS</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-gray-300 text-sm font-mono py-6 text-center">NO ACTIVE OPERATIONS</div>
      )}
    </DashboardCard>
  );
}

// ── Asset Collection — denser horizontal strip ──────────────────────────────

export function AssetStripCard({ credentials = 0, keylogs = 0, downloads = 0, uploads = 0, screenshots = 0 }: QuickStatsCardProps & { keylogs?: number }) {
  const stats = [
    { label: 'CREDENTIALS', value: credentials, icon: Key, color: 'text-yellow-400', hex: '#facc15' },
    { label: 'KEYLOGS', value: keylogs, icon: Terminal, color: 'text-pink-400', hex: '#f472b6' },
    { label: 'DOWNLOADS', value: downloads, icon: Download, color: 'text-blue-400', hex: '#60a5fa' },
    { label: 'UPLOADS', value: uploads, icon: Upload, color: 'text-purple-400', hex: '#c084fc' },
    { label: 'SCREENSHOTS', value: screenshots, icon: Image, color: 'text-cyan-400', hex: '#22d3ee' },
  ];

  return (
    <DashboardCard title="Asset Collection" icon={<Shield size={18} />}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map(s => (
          <div key={s.label} className="relative border border-ghost/30 bg-black/40 backdrop-blur-md rounded px-4 py-3 hover:border-signal/60 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <s.icon size={16} className={cn('opacity-90', s.color)} />
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.value > 0 ? s.hex : '#4b5563' }} />
            </div>
            <div className={cn('text-3xl font-mono font-bold leading-none', s.value > 0 ? s.color : 'text-gray-400')}>{s.value}</div>
            <div className="text-xs font-mono text-gray-300 mt-2 tracking-widest font-semibold">{s.label}</div>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}

// ── Operators Panel — better signal strength visual ─────────────────────────

export function OperatorsPanelCard({ operators = [] }: { operators?: any[] }) {
  return (
    <DashboardCard title="Active Operators" icon={<Users size={18} />}>
      <div className="flex items-end gap-2 mb-3 pb-3 border-b border-ghost/30">
        <span className="text-4xl font-bold text-signal font-mono leading-none">{operators.length}</span>
        <span className="text-gray-300 font-mono mb-1 text-xs uppercase tracking-widest">CONNECTED</span>
      </div>
      <div className="space-y-1 max-h-[200px] overflow-y-auto cyber-scrollbar">
        {operators.slice(0, 8).map(op => {
          const last = op.last_login ? new Date(op.last_login.endsWith?.('Z') ? op.last_login : `${op.last_login}Z`).getTime() : 0;
          const ago = last ? timeAgo(last) : '—';
          const initials = (op.username || '?').slice(0, 2).toUpperCase();
          return (
            <div key={op.id} className="flex items-center gap-2.5 text-sm font-mono border-b border-ghost/20 last:border-0 py-1.5">
              <div className="w-7 h-7 flex items-center justify-center bg-signal/15 border border-signal/40 text-signal text-xs font-bold tracking-tight flex-shrink-0">{initials}</div>
              <span className="text-signal truncate flex-1">{op.username}</span>
              <SignalIcon size={12} className="text-signal" />
              <span className="text-gray-300 text-xs tabular-nums w-12 text-right">{ago}</span>
            </div>
          );
        })}
        {operators.length === 0 && <div className="text-gray-300 text-sm font-mono py-4 text-center">NO OPERATORS ONLINE</div>}
      </div>
    </DashboardCard>
  );
}

// ── Operation Countdown (T- / T+) ────────────────────────────────────────────

interface OperationCountdownProps {
  startMs: number | null;
  operationName?: string;
}

export function OperationCountdownCard({ startMs, operationName }: OperationCountdownProps) {
  // 1Hz tick
  useLiveClock(1000);
  const td = tDelta(startMs);
  const isPre = td?.sign === -1;
  const isPost = td?.sign === 1;
  const within60s = td && td.sign === -1 && td.totalSeconds <= 60;

  // Timeline progress: position of NOW relative to a 4h pre/post window
  const WINDOW_S = 4 * 3600;
  let timelinePct = 50;
  if (td) {
    const offset = td.sign * td.totalSeconds; // negative pre, positive post
    timelinePct = Math.max(0, Math.min(100, ((offset + WINDOW_S) / (2 * WINDOW_S)) * 100));
  }

  const tone = !td ? 'text-gray-200' : within60s ? 'text-yellow-300' : isPre ? 'text-signal' : 'text-cyan-300';
  const accent = !td ? 'rgb(var(--color-signal))' : within60s ? '#facc15' : isPre ? 'rgb(var(--color-signal))' : '#67e8f9';

  return (
    <DashboardCard title="Operation Schedule" icon={<Timer size={18} />}>
      {!td ? (
        <div className="py-4">
          <div className="flex items-center gap-3 text-gray-200">
            <Calendar size={20} className="text-gray-300" />
            <div>
              <div className="text-base font-mono font-semibold">NO START TIME SET</div>
              <div className="text-sm font-mono text-gray-300 mt-1">Admins can schedule {operationName ? <span className="text-signal">{operationName}</span> : 'this operation'} from Operations → Edit.</div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-mono text-gray-300 uppercase tracking-widest">{isPre ? 'COUNTDOWN' : 'ELAPSED'}</div>
            <div className={cn('text-xs font-mono uppercase tracking-widest font-semibold',
              within60s ? 'text-yellow-300 animate-pulse' : isPost ? 'text-cyan-300' : 'text-signal')}>
              {within60s ? 'IMMINENT' : isPre ? 'PRE-OPS' : 'IN-OPS'}
            </div>
          </div>
          {/* Big T-/T+ readout */}
          <div className="flex items-baseline gap-3 mb-4">
            <span className={cn('text-2xl font-mono font-bold', tone)}>{td.prefix}</span>
            <span className={cn('text-5xl font-mono font-bold tabular-nums leading-none', tone)}>
              {td.days > 0 ? `${td.days}d ` : ''}{td.hh}:{td.mm}:{td.ss}
            </span>
          </div>

          {/* Timeline bar */}
          <div className="relative h-2 bg-ghost/30 mb-2 overflow-hidden">
            <div className="absolute top-0 left-1/2 w-px h-full bg-white/40" />
            <div
              className="absolute top-0 h-full transition-all duration-500"
              style={{
                left: 0,
                width: `${timelinePct}%`,
                backgroundColor: accent,
                opacity: 0.7,
              }}
            />
            <div
              className="absolute top-0 h-full w-0.5 transition-all duration-500"
              style={{ left: `calc(${timelinePct}% - 1px)`, backgroundColor: accent, boxShadow: `0 0 8px ${accent}` }}
            />
          </div>
          <div className="flex justify-between text-xs font-mono text-gray-300 tracking-widest">
            <span>-4h</span>
            <span className={cn('font-semibold', isPre ? 'text-yellow-300' : 'text-cyan-300')}>T-0</span>
            <span>+4h</span>
          </div>

          {/* Start time display */}
          <div className="mt-4 pt-3 border-t border-ghost/30 grid grid-cols-2 gap-3 text-sm font-mono">
            <div>
              <div className="text-xs text-gray-300 uppercase tracking-widest mb-1">LOCAL</div>
              <div className="text-gray-100 tabular-nums">{new Date(startMs!).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-gray-300 uppercase tracking-widest mb-1">UTC</div>
              <div className="text-gray-100 tabular-nums">{new Date(startMs!).toISOString().replace('T', ' ').slice(0, 16)}Z</div>
            </div>
          </div>
        </>
      )}
    </DashboardCard>
  );
}

// ── Compute composite threat score ──────────────────────────────────────────

export function computeThreatScore(opts: {
  opsecTasks: number;
  errorTasks: number;
  totalTasks: number;
  c2Down: number;
  c2Total: number;
}) {
  const { opsecTasks, errorTasks, totalTasks, c2Down, c2Total } = opts;
  const opsecImpact = Math.min(60, opsecTasks * 12);
  const errorRate = totalTasks > 0 ? errorTasks / totalTasks : 0;
  const errorImpact = Math.min(30, errorRate * 60);
  const c2Ratio = c2Total > 0 ? c2Down / c2Total : 0;
  const c2Impact = Math.min(25, c2Ratio * 40);
  return Math.round(Math.min(100, opsecImpact + errorImpact + c2Impact));
}
