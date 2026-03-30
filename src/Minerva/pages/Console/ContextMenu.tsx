import React, { useRef, useEffect } from 'react';
import { FolderSearch, Upload, Eye, Download, Copy } from 'lucide-react';
import type { ContextMenuState } from '../../types/console';

export const ContextMenu = ({ menu, onAction, onClose }: {
    menu: ContextMenuState;
    onAction: (action: string, path: string, name: string) => void;
    onClose: () => void;
}) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    const items = menu.isDir
        ? [
            { action: 'ls',     label: 'List directory',  icon: <FolderSearch size={13} /> },
            { action: 'upload', label: 'Upload file here', icon: <Upload size={13} /> },
          ]
        : [
            { action: 'cat',      label: 'View / cat',  icon: <Eye size={13} /> },
            { action: 'download', label: 'Download',     icon: <Download size={13} /> },
            { action: 'copy',     label: 'Copy path',    icon: <Copy size={13} /> },
          ];

    return (
        <div
            ref={ref}
            className="fixed z-[9999] bg-black/95 border border-signal/40 rounded shadow-xl min-w-[160px] py-1 font-mono text-xs"
            style={{ top: menu.y, left: menu.x }}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className="px-3 py-1.5 border-b border-white/10 text-gray-500 truncate max-w-[200px]" title={menu.path}>
                {menu.isDir ? '📁' : '📄'} {menu.name}
            </div>
            {items.map(({ action, label, icon }) => (
                <button
                    key={action}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-white hover:bg-signal/20 hover:text-signal transition-colors"
                    onClick={() => { onAction(action, menu.path, menu.name); onClose(); }}
                >
                    <span className="text-signal/70">{icon}</span>
                    {label}
                </button>
            ))}
        </div>
    );
};
