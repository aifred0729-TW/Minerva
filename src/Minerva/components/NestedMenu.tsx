import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

export interface MenuItemDef {
    action: string;
    label?: string;
    icon?: React.ReactNode;
    divider?: boolean;
    disabled?: boolean;
    danger?: boolean;
    children?: MenuItemDef[];
}

interface MenuPosition {
    x: number;
    y: number;
}

interface SubmenuProps {
    item: MenuItemDef;
    onAction: (action: string) => void;
    onClose: () => void;
}

export const NestedSubmenuItem = ({ item, onAction, onClose }: SubmenuProps) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
            <button className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-white hover:bg-signal/20 hover:text-signal transition-colors text-xs">
                <div className="flex items-center gap-2">
                    {item.icon && <span className="text-signal/70">{item.icon}</span>}
                    {item.label}
                </div>
                <ChevronRight size={10} className="text-gray-500 shrink-0" />
            </button>
            {open && (
                <div className="absolute left-full top-0 z-[10000] bg-black/95 border border-signal/40 rounded shadow-xl min-w-[170px] py-1 font-mono text-xs">
                    {(item.children || []).map(child =>
                        child.divider ? (
                            <div key={child.action} className="border-t border-white/10 my-0.5" />
                        ) : child.children?.length ? (
                            <NestedSubmenuItem key={child.action} item={child} onAction={onAction} onClose={onClose} />
                        ) : (
                            <button
                                key={child.action}
                                disabled={child.disabled}
                                className={cn(
                                    'w-full flex items-center gap-2 px-3 py-1.5 text-white hover:bg-signal/20 hover:text-signal transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
                                    child.danger && 'hover:bg-red-500/20 hover:text-red-400'
                                )}
                                onClick={() => { if (!child.disabled) { onAction(child.action); onClose(); } }}
                            >
                                {child.icon && <span className={cn('text-signal/70', child.danger && 'text-red-500/70')}>{child.icon}</span>}
                                {child.label}
                            </button>
                        )
                    )}
                </div>
            )}
        </div>
    );
};

interface NestedContextMenuProps {
    position: MenuPosition;
    items: MenuItemDef[];
    header?: React.ReactNode;
    onAction: (action: string) => void;
    onClose: () => void;
}

export const NestedContextMenu = ({ position, items, header, onAction, onClose }: NestedContextMenuProps) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    return (
        <div
            ref={ref}
            className="fixed z-[9999] bg-black/95 border border-signal/40 rounded shadow-xl min-w-[180px] py-1 font-mono text-xs"
            style={{ top: position.y, left: position.x }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {header && (
                <div className="px-3 py-1.5 border-b border-white/10 text-gray-500 truncate max-w-[220px]">
                    {header}
                </div>
            )}
            {items.map((item) =>
                item.divider ? (
                    <div key={item.action} className="border-t border-white/10 my-0.5" />
                ) : item.children?.length ? (
                    <NestedSubmenuItem key={item.action} item={item} onAction={onAction} onClose={onClose} />
                ) : (
                    <button
                        key={item.action}
                        disabled={item.disabled}
                        className={cn(
                            'w-full flex items-center gap-2 px-3 py-1.5 text-white hover:bg-signal/20 hover:text-signal transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
                            item.danger && 'hover:bg-red-500/20 hover:text-red-400'
                        )}
                        onClick={() => { if (!item.disabled) { onAction(item.action); onClose(); } }}
                    >
                        {item.icon && <span className={cn('text-signal/70', item.danger && 'text-red-500/70')}>{item.icon}</span>}
                        {item.label}
                    </button>
                )
            )}
        </div>
    );
};
