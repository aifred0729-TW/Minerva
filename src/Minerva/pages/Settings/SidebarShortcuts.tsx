import React, { useState, useEffect } from 'react';
import {
    ArrowUp, ArrowDown, X, RotateCcw,
} from 'lucide-react';
import { snackActions } from '../../lib/snackbar';
import { useGetMythicSetting, useSetMythicSetting } from '../../components/MythicSavedUserSetting';
import { DraggableList } from '../../components/DraggableList';
import { ALL_SIDEBAR_ITEMS, DEFAULT_SIDEBAR_SHORTCUTS } from './sidebarItems';

export { DEFAULT_SIDEBAR_SHORTCUTS };


// Mirror Sidebar.tsx's resolution: drop unknown keys (legacy MythicReactUI defaults like
// "ActiveCallbacks","Payloads",… stored from older installs) and append any current items
// not already in the saved order. Result is exactly what the Sidebar will render.
const normalizeSidebarItems = (raw: unknown): string[] => {
    const validKeys = ALL_SIDEBAR_ITEMS.map(i => i.key);
    const validSet = new Set(validKeys);
    const filtered = Array.isArray(raw)
        ? raw.filter((k): k is string => typeof k === 'string' && validSet.has(k))
        : [];
    const seen = new Set(filtered);
    const result = [...filtered];
    for (const k of validKeys) {
        if (!seen.has(k)) result.push(k);
    }
    return result;
};

export const SidebarShortcutsSection = () => {
    const sideShortcuts = useGetMythicSetting({setting_name:'sideShortcuts', default_value: DEFAULT_SIDEBAR_SHORTCUTS});
    const [setSetting] = useSetMythicSetting();
    const [items, setItems] = useState<string[]>(() => normalizeSidebarItems(sideShortcuts));
    useEffect(() => { setItems(normalizeSidebarItems(sideShortcuts)); }, [sideShortcuts]);

    const enabled = new Set(items);
    const toggle = (key: string) => {
        const next = enabled.has(key) ? items.filter(k=>k!==key) : [...items, key];
        setItems(next);
    };
    const moveUp = (idx: number) => {
        if (idx<=0) return;
        const n=[...items]; [n[idx-1],n[idx]]=[n[idx],n[idx-1]]; setItems(n);
    };
    const moveDown = (idx: number) => {
        if (idx>=items.length-1) return;
        const n=[...items]; [n[idx],n[idx+1]]=[n[idx+1],n[idx]]; setItems(n);
    };
    const save = () => { setSetting({setting_name:'sideShortcuts', value: items}); snackActions.success('Sidebar shortcuts updated'); };
    const reset = () => { setItems(DEFAULT_SIDEBAR_SHORTCUTS); };
    const disabledItems = ALL_SIDEBAR_ITEMS.filter(i=>!enabled.has(i.key));

    return (
        <div className="space-y-4">
            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-2 pb-1 border-b border-white/5">
                SIDEBAR ITEM ORDER & VISIBILITY
            </div>
            <p className="text-xs text-gray-500">Drag items to reorder. Click to toggle visibility. Changes apply after saving.</p>

            <DraggableList
                droppableId="sidebar-shortcuts"
                items={items}
                keyExtractor={(k) => k}
                onReorder={setItems}
                className="space-y-1"
                itemClassName="bg-black/40 border border-white/10 px-3 py-2 hover:border-white/20"
                renderItem={(key, idx) => {
                    const def = ALL_SIDEBAR_ITEMS.find(i => i.key === key);
                    if (!def) return null;
                    return (
                        <div className="flex items-center gap-2">
                            <span className="flex-1 text-xs font-mono text-white">{def.label}</span>
                            <button onClick={() => moveUp(idx)} className="p-0.5 text-gray-500 hover:text-white transition-colors disabled:opacity-20" disabled={idx === 0}><ArrowUp size={12} /></button>
                            <button onClick={() => moveDown(idx)} className="p-0.5 text-gray-500 hover:text-white transition-colors disabled:opacity-20" disabled={idx === items.length - 1}><ArrowDown size={12} /></button>
                            <button onClick={() => toggle(key)} className="p-0.5 text-red-400 hover:text-red-300 transition-colors"><X size={12} /></button>
                        </div>
                    );
                }}
            />

            {disabledItems.length > 0 && (
                <>
                    <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-2 pb-1 border-b border-white/5">HIDDEN ITEMS (click to re-add)</div>
                    <div className="flex flex-wrap gap-2">
                        {disabledItems.map(item => (
                            <button key={item.key} onClick={()=>toggle(item.key)} className="px-3 py-1.5 text-[11px] font-mono text-gray-500 border border-white/10 hover:border-signal/30 hover:text-signal transition-colors">
                                + {item.label}
                            </button>
                        ))}
                    </div>
                </>
            )}

            <div className="flex gap-2 pt-2">
                <button onClick={save} className="px-6 py-2 text-xs font-mono uppercase tracking-wider bg-signal text-black hover:bg-signal/80 transition-colors">SAVE</button>
                <button onClick={reset} className="flex items-center gap-2 px-4 py-2 text-xs font-mono text-gray-500 hover:text-orange-400 border border-white/10 hover:border-orange-500/30 transition-colors"><RotateCcw size={12}/>RESET</button>
            </div>
        </div>
    );
};
