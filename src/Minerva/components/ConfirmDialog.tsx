import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { ModalBackdrop } from '../pages/Operations/modals';

interface ConfirmDialogProps {
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    loading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    title,
    message,
    confirmText = 'CONFIRM',
    cancelText = 'CANCEL',
    isDestructive = false,
    loading = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    return (
        <ModalBackdrop onClose={onCancel}>
            <div className="p-6">
                <h2 className={cn("text-lg font-bold tracking-widest mb-3 flex items-center gap-2", isDestructive ? "text-red-400" : "text-signal")}>
                    <AlertTriangle size={18} className={isDestructive ? "text-red-500" : "text-yellow-500"} />{title}
                </h2>
                <p className="text-sm text-gray-300 font-mono mb-6">{message}</p>
                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} disabled={loading} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs disabled:opacity-50">
                        {cancelText}
                    </button>
                    <button onClick={onConfirm} disabled={loading}
                        className={cn("px-6 py-2 font-bold font-mono text-xs transition-colors disabled:opacity-50",
                            isDestructive ? "bg-red-600 hover:bg-red-500 text-white" : "bg-signal text-void hover:bg-white")}>
                        {loading ? 'PROCESSING…' : confirmText}
                    </button>
                </div>
            </div>
        </ModalBackdrop>
    );
}
