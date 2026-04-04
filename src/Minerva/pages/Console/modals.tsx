import React, { useState, useEffect } from 'react';
import { useMutation } from "@apollo/client/react";
import { useQueryCompat as useQuery } from "../../lib/useQueryCompat";
import { XCircle } from 'lucide-react';
import { GET_TASK_COMMENT_QUERY, GET_TASK_PARAMS_QUERY, GET_TASK_STDOUT_STDERR_QUERY, UPDATE_TASK_COMMENT_MUTATION } from '../../lib/api';
import { snackActions } from '../../lib/snackbar';

export const InlineModal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);
    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                    <span className="w-[3px] h-4 bg-signal inline-block" />
                    <span className="font-mono text-[11px] font-bold text-signal tracking-widest uppercase">{title}</span>
                </div>
                <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-0.5"><XCircle size={15} /></button>
            </div>
            <div className="flex-1 overflow-auto p-5 cyber-scrollbar">{children}</div>
        </div>
    );
};

// Task Comment Modal
export const TaskCommentModal = ({ taskId, onClose }: { taskId: number; onClose: () => void }) => {
    const [comment, setComment] = useState('');
    const { loading } = useQuery<any>(GET_TASK_COMMENT_QUERY, {
        variables: { task_id: taskId },
        onCompleted: (d: any) => setComment(d.task_by_pk?.comment || ''),
        fetchPolicy: 'network-only',
    });
    const [updateComment, { loading: saving }] = useMutation<any>(UPDATE_TASK_COMMENT_MUTATION);
    const handleSave = () => {
        updateComment({ variables: { task_id: taskId, comment } })
            .then(() => { snackActions.success('Comment saved'); onClose(); })
            .catch(() => snackActions.error('Failed to save comment'));
    };
    return (
        <InlineModal title="EDIT_TASK_COMMENT" onClose={onClose}>
            {loading ? (
                <div className="text-gray-500 animate-pulse font-mono text-sm py-4 text-center">Loading...</div>
            ) : (
                <>
                    <textarea
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        rows={4}
                        className="w-full bg-black/60 border border-gray-700 focus:border-signal px-3 py-2 text-white font-mono text-sm resize-y outline-none transition-colors"
                        placeholder="Add a comment..."
                        autoFocus
                    />
                    <div className="flex justify-end gap-3 mt-3">
                        <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs transition-colors">CANCEL</button>
                        <button onClick={handleSave} disabled={saving}
                            className="px-5 py-2 bg-signal text-black font-mono text-xs font-bold hover:bg-white disabled:opacity-50 transition-colors">
                            {saving ? 'SAVING…' : 'SAVE'}
                        </button>
                    </div>
                </>
            )}
        </InlineModal>
    );
};

// Task Parameters Modal
export const TaskParamsModal = ({ taskId, onClose }: { taskId: number; onClose: () => void }) => {
    const [text, setText] = useState('');
    const { loading } = useQuery<any>(GET_TASK_PARAMS_QUERY, {
        variables: { task_id: taskId },
        onCompleted: (d: any) => {
            const t = d.task_by_pk;
            if (!t) { setText('Task not found'); return; }
            let s = `Original Parameters:\n${t.original_params ?? '(none)'}`;
            s += `\n\nDisplay Parameters:\n${t.display_params ?? '(none)'}`;
            s += `\n\nAgent Parameters:\n${t.params ?? '(none)'}`;
            s += `\n\nMythic Parsed Parameters:\n${t.mythic_parsed_params ?? '(none)'}`;
            s += `\n\nTasking Location:   ${t.tasking_location ?? '-'}`;
            s += `\nParameter Group:    ${t.parameter_group_name ?? '-'}`;
            if (t.command) s += `\nPayload Type:       ${t.command.payloadtype?.name ?? '-'}`;
            s += `\n\n──── TIMESTAMPS ────────────────────────`;
            s += `\nSubmitted:       ${t.status_timestamp_preprocessing ?? '-'}`;
            s += `\nAgent Pickup:    ${t.status_timestamp_processing ?? '-'}`;
            s += `\nFirst Response:  ${t.status_timestamp_processed ?? '-'}`;
            s += `\nLast Update:     ${t.timestamp ?? '-'}`;
            setText(s);
        },
        fetchPolicy: 'network-only',
    });
    return (
        <InlineModal title="TASK_PARAMETERS_AND_TIMESTAMPS" onClose={onClose}>
            {loading ? (
                <div className="text-gray-500 animate-pulse font-mono text-sm py-4 text-center">Loading...</div>
            ) : (
                <pre className="text-gray-200 text-[12px] font-mono whitespace-pre-wrap break-words leading-relaxed">{text}</pre>
            )}
        </InlineModal>
    );
};

// Task Stdout/Stderr Modal
export const TaskStdoutStderrModal = ({ taskId, onClose }: { taskId: number; onClose: () => void }) => {
    const [text, setText] = useState('');
    const { loading } = useQuery<any>(GET_TASK_STDOUT_STDERR_QUERY, {
        variables: { task_id: taskId },
        onCompleted: (d: any) => {
            const t = d.task_by_pk;
            if (!t) { setText('Task not found'); return; }
            const hasContent = (t.stdout && t.stdout.trim()) || (t.stderr && t.stderr.trim());
            if (!hasContent) { setText('(No stdout/stderr recorded for this task)'); return; }
            setText(`[STDOUT]:\n${t.stdout || '(empty)'}\n\n[STDERR]:\n${t.stderr || '(empty)'}`);
        },
        fetchPolicy: 'network-only',
    });
    return (
        <InlineModal title="TASK_STDOUT_STDERR" onClose={onClose}>
            {loading ? (
                <div className="text-gray-500 animate-pulse font-mono text-sm py-4 text-center">Loading...</div>
            ) : (
                <pre className="text-gray-200 text-[12px] font-mono whitespace-pre-wrap break-words leading-relaxed">{text}</pre>
            )}
        </InlineModal>
    );
};
