import React from 'react';
import {
    CheckCircle, XCircle, Shield, Users, Trash2, RotateCcw,
    Zap, Edit,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ROLE_COLORS } from './modals';
import type { Operation } from '../../types/operations';

export function OperationRow({ op, isCurrent, onMakeCurrent, onEdit, onMembers, onToggleDelete }: {
    op: Operation; isCurrent: boolean; onMakeCurrent: () => void;
    onEdit: () => void; onMembers: () => void; onToggleDelete: () => void;
}) {
    return (
        <div className={cn(
            "border p-4 transition-all",
            op.deleted ? "border-gray-800 opacity-60 bg-black/20" :
            isCurrent ? "border-signal/60 bg-signal/5 shadow-[0_0_12px_rgba(34,211,238,0.08)]" :
            "border-ghost/20 hover:border-signal/30 bg-black/20 hover:bg-black/30"
        )}>
            <div className="flex items-start gap-4">
                {/* Status dot */}
                <div className="mt-1 shrink-0">
                    {op.deleted ? <XCircle size={15} className="text-gray-600" /> :
                     op.complete ? <CheckCircle size={15} className="text-gray-500" /> :
                     <div className={cn("w-3.5 h-3.5 rounded-full", isCurrent ? "bg-signal animate-pulse" : "bg-signal/50")} />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="font-bold text-sm text-white font-mono">{op.name}</span>
                        {isCurrent && (
                            <span className="px-2 py-0.5 text-[10px] font-bold font-mono bg-signal/10 text-signal border border-signal/40 flex items-center gap-1">
                                <Zap size={9} />CURRENT
                            </span>
                        )}
                        {op.complete && !op.deleted && (
                            <span className="px-2 py-0.5 text-[10px] font-mono text-gray-500 border border-gray-700">COMPLETE</span>
                        )}
                        {op.deleted && (
                            <span className="px-2 py-0.5 text-[10px] font-mono text-red-500 border border-red-800">DELETED</span>
                        )}
                    </div>

                    {op.banner_text && (
                        <div className="inline-block px-2 py-0.5 text-xs font-mono text-white rounded mb-2"
                            style={{ backgroundColor: op.banner_color || '#be2a2a' }}>
                            {op.banner_text}
                        </div>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1">
                            <Shield size={11} className="text-yellow-500/80" />{op.admin.username}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Users size={11} className="text-gray-600" />
                            {op.operatoroperations.length === 0 ? (
                                <span className="text-gray-700 italic text-[11px]">no members</span>
                            ) : (
                                <>
                                    {op.operatoroperations.slice(0, 6).map(oo => (
                                        <span key={oo.id}
                                            className={cn("px-1.5 py-0 rounded text-[10px] border font-mono", ROLE_COLORS[oo.view_mode] || ROLE_COLORS.operator)}
                                            title={`${oo.operator.username} (${oo.view_mode})`}>
                                            {oo.operator.username.slice(0, 10)}
                                        </span>
                                    ))}
                                    {op.operatoroperations.length > 6 && (
                                        <span className="text-gray-600 text-[10px]">+{op.operatoroperations.length - 6}</span>
                                    )}
                                </>
                            )}
                        </span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {!isCurrent && !op.deleted && (
                        <button onClick={onMakeCurrent}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-signal/40 text-signal hover:bg-signal hover:text-void font-mono text-[11px] font-bold transition-colors">
                            <Zap size={11} />MAKE CURRENT
                        </button>
                    )}
                    {!op.deleted && (
                        <>
                            <button onClick={onEdit} title="Edit config"
                                className="p-2 border border-ghost/20 text-gray-500 hover:text-signal hover:border-signal/40 transition-colors">
                                <Edit size={14} />
                            </button>
                            <button onClick={onMembers} title="Manage members"
                                className="p-2 border border-ghost/20 text-gray-500 hover:text-signal hover:border-signal/40 transition-colors">
                                <Users size={14} />
                            </button>
                        </>
                    )}
                    <button onClick={onToggleDelete} title={op.deleted ? 'Restore operation' : 'Delete operation'}
                        className={cn("p-2 border transition-colors",
                            op.deleted ? "border-green-800/40 text-green-700 hover:text-green-400 hover:border-green-500/40"
                                       : "border-red-900/30 text-red-800 hover:text-red-400 hover:border-red-600/40")}>
                        {op.deleted ? <RotateCcw size={14} /> : <Trash2 size={14} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
