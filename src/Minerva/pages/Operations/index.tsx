import React, { useState } from 'react';
import { useMutation, useReactiveVar } from "@apollo/client/react";
import { useQueryCompat as useQuery } from '../../lib/useQueryCompat';
import { usePageVisible } from '../../lib/usePageVisible';
import {
    GET_OPERATIONS,
    TOGGLE_OPERATION_DELETE_MUTATION,
    UPDATE_CURRENT_OPERATION_MUTATION,
} from '../../lib/api';
import {
    Layers, Plus, Eye, EyeOff, UserPlus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { snackActions } from '../../lib/snackbar';
import { cn } from '../../lib/utils';
import { meState } from '../../lib/state';
import { restartWebsockets } from '../../lib/websocket';
import { useAppStore } from '../../store';
import type { OperatorRef, Operation } from '../../types/operations';
import { OperationRow } from './OperationRow';
import { BlockListSection } from './BlockListSection';
import {
    CreateOperationModal,
    CreateOperatorModal,
    EditOperationModal,
    MembersOperationModal,
    ConfirmModal,
} from './modals';

export default function Operations() {
    const { isSidebarCollapsed } = useAppStore();
    const pageVisible = usePageVisible();
    const me = useReactiveVar(meState);
    const currentUserId: number = me?.user?.user_id ?? me?.user?.id ?? 0;
    const currentOperationId: number = me?.user?.current_operation_id ?? 0;
    const isAdmin: boolean = !!me?.user?.admin;

    const [showDeleted, setShowDeleted] = useState(false);
    const [showCreateOp, setShowCreateOp] = useState(false);
    const [showCreateOperator, setShowCreateOperator] = useState(false);
    const [editOp, setEditOp] = useState<Operation | null>(null);
    const [membersOp, setMembersOp] = useState<Operation | null>(null);
    const [confirmOp, setConfirmOp] = useState<{ op: Operation; restore: boolean } | null>(null);

    const { data, loading, refetch } = useQuery<any>(GET_OPERATIONS, {
        pollInterval: pageVisible ? 10000 : 0, fetchPolicy: 'network-only',
    });

    const [toggleDelete] = useMutation<any>(TOGGLE_OPERATION_DELETE_MUTATION);
    const [updateCurrentOp] = useMutation<any>(UPDATE_CURRENT_OPERATION_MUTATION);

    const handleMakeCurrent = async (op: Operation) => {
        try {
            const { data: result } = await updateCurrentOp({ variables: { operator_id: currentUserId, operation_id: op.id } });
            const res = result?.updateCurrentOperation;
            if (res?.status === 'error') {
                if (res.error?.includes('not a member')) {
                    snackActions.warning('You are not a member of this operation.');
                    return;
                }
                throw new Error(res.error);
            }
            const meCur = meState();
            meState({ ...meCur, user: { ...meCur.user,
                current_operation_id: res.operation_id,
                current_operation: res.name,
                current_operation_complete: res.complete,
                current_operation_banner_text: res.banner_text,
                current_operation_banner_color: res.banner_color,
            } as any});
            localStorage.setItem('user', JSON.stringify(meState().user));
            restartWebsockets();
            snackActions.success(`Switched to: ${op.name}`);
            refetch();
        } catch (err: any) { snackActions.error(err.message || 'Failed to switch operation'); }
    };

    const handleToggleDelete = async () => {
        if (!confirmOp) return;
        try {
            await toggleDelete({ variables: { operation_id: confirmOp.op.id, deleted: !confirmOp.restore } });
            snackActions.success(confirmOp.restore ? 'Operation restored' : 'Operation deleted');
            refetch();
        } catch (err: any) { snackActions.error(err.message || 'Action failed'); }
        setConfirmOp(null);
    };

    const allOps: Operation[] = data?.operation || [];
    const allOperators: OperatorRef[] = data?.operator || [];
    const operations = allOps.filter(op => showDeleted || !op.deleted);
    const stats = {
        total:    allOps.length,
        active:   allOps.filter(o => !o.complete && !o.deleted).length,
        complete: allOps.filter(o => o.complete && !o.deleted).length,
        deleted:  allOps.filter(o => o.deleted).length,
    };

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
                className={cn("flex-1 transition-all duration-300 flex flex-col h-screen overflow-hidden", isSidebarCollapsed ? "ml-16" : "ml-64")}
            >
                <div className="flex-1 overflow-y-auto cyber-scrollbar">
                    <div className="p-6 lg:p-10">
                        {/* ── Header ── */}
                        <header className="flex justify-between items-start mb-8 gap-4 flex-wrap">
                            <div className="flex items-center gap-4">
                                <div className="p-3 border border-white/50 bg-white/10 rounded"><Layers size={24} className="text-white" /></div>
                                <div>
                                    <h1 className="text-2xl font-bold tracking-widest text-white uppercase">OPERATIONS MANAGER</h1>
                                    <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                        <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                        OPERATIONS CONTROL
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button onClick={() => setShowDeleted(d => !d)}
                                    className={cn("flex items-center gap-2 px-4 py-2.5 border font-mono text-xs transition-colors",
                                        showDeleted ? "border-red-700/60 text-red-400 bg-red-900/10 hover:bg-red-900/20"
                                                    : "border-ghost/30 text-gray-500 hover:text-gray-200 hover:border-gray-500/40")}>
                                    {showDeleted ? <EyeOff size={13} /> : <Eye size={13} />}
                                    {showDeleted ? 'HIDE DELETED' : 'SHOW DELETED'}
                                    {stats.deleted > 0 && (
                                        <span className="px-1.5 py-0.5 bg-red-900/30 text-red-500 text-[10px] rounded">{stats.deleted}</span>
                                    )}
                                </button>
                                {isAdmin && (
                                    <button onClick={() => setShowCreateOperator(true)}
                                        className="flex items-center gap-2 px-4 py-2.5 border border-ghost/30 text-gray-400 hover:text-white hover:border-gray-400/40 font-mono text-xs transition-colors">
                                        <UserPlus size={13} />NEW OPERATOR
                                    </button>
                                )}
                                <button onClick={() => setShowCreateOp(true)}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-signal text-void font-bold font-mono text-xs hover:bg-white transition-colors group">
                                    <Plus size={15} className="group-hover:rotate-90 transition-transform" />NEW OPERATION
                                </button>
                            </div>
                        </header>

                        {/* ── Stats ── */}
                        <div className="grid grid-cols-4 gap-3 mb-6">
                            {([
                                { label: 'TOTAL',    value: stats.total,    color: 'text-white' },
                                { label: 'ACTIVE',   value: stats.active,   color: 'text-signal' },
                                { label: 'COMPLETE', value: stats.complete, color: 'text-gray-500' },
                                { label: 'DELETED',  value: stats.deleted,  color: 'text-red-500' },
                            ] as const).map(s => (
                                <div key={s.label} className="border border-ghost/20 bg-black/30 px-4 py-3">
                                    <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">{s.label}</p>
                                    <p className={cn("text-2xl font-bold font-mono", s.color)}>{s.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* ── List ── */}
                        {loading ? (
                            <div className="flex items-center justify-center h-40 text-gray-600 font-mono text-sm animate-pulse">LOADING…</div>
                        ) : operations.length === 0 ? (
                            <div className="border border-ghost/20 p-12 text-center">
                                <Layers size={40} className="mx-auto mb-3 text-gray-700" />
                                <p className="font-mono text-gray-600 text-sm">NO OPERATIONS FOUND</p>
                                <p className="font-mono text-gray-700 text-xs mt-1">Ask a Mythic admin to create or add you to an operation.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {operations.map((op: Operation) => (
                                    <OperationRow
                                        key={op.id}
                                        op={op}
                                        isCurrent={op.id === currentOperationId}
                                        onMakeCurrent={() => handleMakeCurrent(op)}
                                        onEdit={() => setEditOp(op)}
                                        onMembers={() => setMembersOp(op)}
                                        onToggleDelete={() => setConfirmOp({ op, restore: op.deleted })}
                                    />
                                ))}
                            </div>
                        )}

                        {/* ── Block Lists ── */}
                        <BlockListSection />
                    </div>
                </div>
            </motion.div>

            {/* ── Modals ── */}
            <AnimatePresence>
                {showCreateOp && (
                    <CreateOperationModal key="create-op"
                        onClose={() => setShowCreateOp(false)}
                        onSuccess={() => { setShowCreateOp(false); refetch(); }} />
                )}
                {showCreateOperator && (
                    <CreateOperatorModal key="create-operator"
                        onClose={() => setShowCreateOperator(false)} />
                )}
                {editOp && (
                    <EditOperationModal key={`edit-${editOp.id}`}
                        operation={editOp}
                        onClose={() => setEditOp(null)}
                        onSuccess={() => { setEditOp(null); refetch(); }} />
                )}
                {membersOp && (
                    <MembersOperationModal key={`members-${membersOp.id}`}
                        operation={membersOp} allOperators={allOperators}
                        onClose={() => setMembersOp(null)}
                        onSuccess={() => { setMembersOp(null); refetch(); }} />
                )}
                {confirmOp && (
                    <ConfirmModal key="confirm"
                        title={confirmOp.restore ? 'RESTORE_OPERATION' : 'DELETE_OPERATION'}
                        message={confirmOp.restore
                            ? `Restore operation "${confirmOp.op.name}"?`
                            : `Delete operation "${confirmOp.op.name}"? This cannot be undone.`}
                        confirmText={confirmOp.restore ? 'RESTORE' : 'DELETE'}
                        isDestructive={!confirmOp.restore}
                        onConfirm={handleToggleDelete}
                        onCancel={() => setConfirmOp(null)} />
                )}
            </AnimatePresence>
        </div>
    );
}
