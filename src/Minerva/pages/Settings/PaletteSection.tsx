import React, { useState, useRef } from 'react';
import { useReactiveVar } from "@apollo/client/react";
import {
    Layout, Copy, RotateCcw, Trash2, Upload,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import { useSetMythicSetting } from '../../components/MythicSavedUserSetting';
import { mePreferences } from '../../lib/state';

const PALETTE_GROUPS: { label: string; fields: { key: string; name: string; darkDefault: string; lightDefault: string }[] }[] = [
    {
        label: 'ACCENT / STATUS COLORS',
        fields: [
            { key: 'primary', name: 'Primary', darkDefault: '#75859b', lightDefault: '#75859b' },
            { key: 'error', name: 'Error', darkDefault: '#bd5142', lightDefault: '#c42c32' },
            { key: 'success', name: 'Success', darkDefault: '#85b089', lightDefault: '#0e7004' },
            { key: 'secondary', name: 'Secondary', darkDefault: '#bebebe', lightDefault: '#a6a5a5' },
            { key: 'info', name: 'Informational', darkDefault: '#84b4dc', lightDefault: '#4990b2' },
            { key: 'warning', name: 'Warning', darkDefault: '#dc8455', lightDefault: '#ffb74d' },
        ],
    },
    {
        label: 'LAYOUT / BACKGROUND',
        fields: [
            { key: 'background', name: 'Background', darkDefault: '#282828', lightDefault: '#f6f6f6' },
            { key: 'paper', name: 'Modals Background', darkDefault: '#282828', lightDefault: '#ececec' },
            { key: 'text', name: 'Text', darkDefault: '#e4e4e4', lightDefault: '#000000' },
        ],
    },
    {
        label: 'TABLE',
        fields: [
            { key: 'tableHeader', name: 'Table Headers', darkDefault: '#484848', lightDefault: '#c4c4c4' },
            { key: 'tableHover', name: 'Table Hover', darkDefault: '#3c3c3c', lightDefault: '#e8e8e8' },
        ],
    },
    {
        label: 'NAVIGATION',
        fields: [
            { key: 'navBarColor', name: 'Nav Bar Top', darkDefault: '#194573', lightDefault: '#3b606d' },
            { key: 'navBarBottomColor', name: 'Nav Bar Bottom', darkDefault: '#330814', lightDefault: '#283581' },
            { key: 'navBarIcons', name: 'Nav Bar Icons', darkDefault: '#ffffff', lightDefault: '#ffffff' },
            { key: 'navBarText', name: 'Nav Bar Text', darkDefault: '#ffffff', lightDefault: '#ffffff' },
            { key: 'pageHeader', name: 'Page Headers', darkDefault: '#1b2025', lightDefault: '#706c6e' },
        ],
    },
    {
        label: 'CALLBACK / SELECTION',
        fields: [
            { key: 'selectedCallbackColor', name: 'Active Callback Row', darkDefault: '#26456e', lightDefault: '#c6e5f6' },
            { key: 'selectedCallbackHierarchyColor', name: 'Host Highlight', darkDefault: '#273e5d', lightDefault: '#deeff8' },
        ],
    },
    {
        label: 'TASKING CONTEXT',
        fields: [
            { key: 'taskPromptTextColor', name: 'Prompt Text', darkDefault: '#bebebe', lightDefault: '#a6a5a5' },
            { key: 'taskPromptCommandTextColor', name: 'Command Text', darkDefault: '#e4e4e4', lightDefault: '#000000' },
            { key: 'taskContextColor', name: 'Context Background', darkDefault: '#122848', lightDefault: '#acc0da' },
            { key: 'taskContextImpersonationColor', name: 'User Context BG', darkDefault: '#641616', lightDefault: '#dec0c0' },
            { key: 'taskContextExtraColor', name: 'Extra Info BG', darkDefault: '#2a5953', lightDefault: '#a7ce9d' },
        ],
    },
    {
        label: 'OUTPUT',
        fields: [
            { key: 'emptyFolderColor', name: 'Empty Folder Color', darkDefault: '#bebebe', lightDefault: '#a6a5a5' },
            { key: 'outputBackgroundColor', name: 'Output Background', darkDefault: '#282828', lightDefault: '#f6f6f6' },
            { key: 'outputTextColor', name: 'Output Text', darkDefault: '#f6f6f6', lightDefault: '#282828' },
        ],
    },
];

const ColorPickerRow = ({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) => (
    <div className="flex items-center gap-3 py-1">
        <div className="w-6 h-6 border border-white/20 shrink-0 cursor-pointer relative group" style={{ background: value }}>
            <input type="color" value={value} onChange={e => onChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        </div>
        <span className="text-xs text-gray-400 min-w-[160px]">{name}</span>
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
            className="w-24 bg-black/60 border border-white/15 text-gray-300 text-[10px] font-mono px-2 py-0.5 focus:outline-none focus:border-signal/40 rounded-sm" />
    </div>
);

export const PaletteSection = () => {
    const prefs = useReactiveVar(mePreferences);
    const [setSetting] = useSetMythicSetting();
    const palette = prefs?.palette || {};
    const mode = 'dark';

    const getColor = (key: string, darkDefault: string) => {
        const field = palette[key];
        if (!field) return darkDefault;
        if (typeof field === 'string') return field;
        return field[mode] || darkDefault;
    };

    const setColor = (key: string, value: string) => {
        const newPalette = { ...palette };
        if (!newPalette[key]) newPalette[key] = { dark: value, light: value };
        else if (typeof newPalette[key] === 'string') newPalette[key] = { dark: value, light: value };
        else newPalette[key] = { ...newPalette[key], [mode]: value };
        setSetting({ setting_name: 'palette', value: newPalette });
    };

    const resetAll = () => {
        const newPalette: any = {};
        PALETTE_GROUPS.forEach(g => g.fields.forEach(f => {
            newPalette[f.key] = { dark: f.darkDefault, light: f.lightDefault };
        }));
        setSetting({ setting_name: 'palette', value: newPalette });
        snackActions.success('Palette reset to defaults');
    };

    const resetDark = () => {
        const newPalette = { ...palette };
        PALETTE_GROUPS.forEach(g => g.fields.forEach(f => {
            if (!newPalette[f.key]) newPalette[f.key] = { dark: f.darkDefault, light: f.lightDefault };
            else if (typeof newPalette[f.key] === 'string') newPalette[f.key] = { dark: f.darkDefault, light: newPalette[f.key] };
            else newPalette[f.key] = { ...newPalette[f.key], dark: f.darkDefault };
        }));
        setSetting({ setting_name: 'palette', value: newPalette });
        snackActions.success('Dark mode palette reset');
    };
    const resetLight = () => {
        const newPalette = { ...palette };
        PALETTE_GROUPS.forEach(g => g.fields.forEach(f => {
            if (!newPalette[f.key]) newPalette[f.key] = { dark: f.darkDefault, light: f.lightDefault };
            else if (typeof newPalette[f.key] === 'string') newPalette[f.key] = { dark: newPalette[f.key], light: f.lightDefault };
            else newPalette[f.key] = { ...newPalette[f.key], light: f.lightDefault };
        }));
        setSetting({ setting_name: 'palette', value: newPalette });
        snackActions.success('Light mode palette reset');
    };

    const exportColorPrefs = () => {
        const colorData: any = {};
        PALETTE_GROUPS.forEach(g => g.fields.forEach(f => {
            colorData[f.key] = palette[f.key] || { dark: f.darkDefault, light: f.lightDefault };
        }));
        if (palette.backgroundImage) colorData.backgroundImage = palette.backgroundImage;
        navigator.clipboard.writeText(JSON.stringify(colorData, null, 2));
        snackActions.success('Color preferences copied to clipboard');
    };

    const rawBgImg = palette.backgroundImage;
    const bgImageVal = typeof rawBgImg === 'string' ? rawBgImg : '';

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-2 pb-1">PALETTE / THEME CUSTOMIZATION</div>
                <div className="flex items-center gap-2">
                    <button onClick={exportColorPrefs} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono text-gray-500 hover:text-signal border border-white/10 hover:border-signal/30 transition-colors"><Copy size={10} /> EXPORT COLORS</button>
                    <button onClick={resetDark} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono text-gray-500 hover:text-orange-400 border border-white/10 hover:border-orange-500/30 transition-colors"><RotateCcw size={10} /> RESET DARK</button>
                    <button onClick={resetLight} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono text-gray-500 hover:text-orange-400 border border-white/10 hover:border-orange-500/30 transition-colors"><RotateCcw size={10} /> RESET LIGHT</button>
                    <button onClick={resetAll} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono text-gray-500 hover:text-red-400 border border-white/10 hover:border-red-500/30 transition-colors"><RotateCcw size={10} /> RESET ALL</button>
                </div>
            </div>
            <p className="text-xs text-gray-500">Customize all OldReactUI-compatible palette colors. Changes are saved per-operator and synced via Mythic settings.</p>

            {/* Background Image */}
            <div className="bg-black/40 border border-white/10 p-4 hover:border-white/20 transition-colors">
                <div className="flex items-center gap-4 mb-2">
                    <div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0"><Layout size={17} className="text-gray-400" /></div>
                    <div>
                        <div className="text-sm font-medium text-white">Background Image</div>
                        <div className="text-xs text-gray-500 mt-0.5">Upload an image file or paste a URL / base64 data URI</div>
                    </div>
                </div>
                <div className="flex gap-2 ml-13 items-center">
                    <input type="text" value={bgImageVal}
                        onChange={e => {
                            const newPalette = { ...palette, backgroundImage: e.target.value || null };
                            setSetting({ setting_name: 'palette', value: newPalette });
                        }}
                        className="flex-1 bg-black/60 border border-white/15 text-gray-300 text-xs font-mono px-2 py-1.5 focus:outline-none focus:border-signal/40 rounded-sm"
                        placeholder="https://... or data:image/..." />
                    <label className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono border border-signal/30 text-signal hover:bg-signal/10 cursor-pointer transition-colors rounded-sm shrink-0">
                        <Upload size={12} />
                        UPLOAD
                        <input type="file" accept="image/*" className="hidden" onChange={(ev) => {
                            const file = ev.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (e) => {
                                const result = e.target?.result as string;
                                const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
                                const mimeMap: Record<string, string> = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp', svg: 'svg+xml', bmp: 'bmp' };
                                const mime = mimeMap[ext] || ext;
                                const dataUri = `url("data:image/${mime};base64,${btoa(result)}")`;
                                const newPalette = { ...palette, backgroundImage: dataUri };
                                setSetting({ setting_name: 'palette', value: newPalette });
                            };
                            reader.readAsBinaryString(file);
                            ev.target.value = '';
                        }} />
                    </label>
                    {bgImageVal && (
                        <button onClick={() => {
                            const newPalette = { ...palette, backgroundImage: null };
                            setSetting({ setting_name: 'palette', value: newPalette });
                        }} className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-mono text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors rounded-sm shrink-0">
                            <Trash2 size={12} /> CLEAR
                        </button>
                    )}
                </div>
                {bgImageVal && (
                    <div className="mt-3 ml-13 w-60 h-36 border border-white/10 overflow-hidden bg-black/60">
                        <img
                            src={bgImageVal.startsWith('url(') ? bgImageVal.slice(5, -2) : bgImageVal}
                            alt="Background preview"
                            className="w-full h-full object-cover"
                            onError={e => (e.target as HTMLImageElement).style.display = 'none'}
                        />
                    </div>
                )}
            </div>

            {/* Color groups */}
            {PALETTE_GROUPS.map(group => (
                <div key={group.label} className="bg-black/40 border border-white/10 p-4 hover:border-white/20 transition-colors">
                    <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pb-2 mb-2 border-b border-white/5">{group.label}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0">
                        {group.fields.map(f => (
                            <ColorPickerRow key={f.key} name={f.name} value={getColor(f.key, f.darkDefault)} onChange={v => setColor(f.key, v)} />
                        ))}
                    </div>
                </div>
            ))}

            {/* Live preview */}
            <div className="bg-black/40 border border-white/10 p-4">
                <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pb-2 mb-3 border-b border-white/5">LIVE PREVIEW</div>
                <div className="grid grid-cols-8 gap-2">
                    {PALETTE_GROUPS.flatMap(g => g.fields).map(f => (
                        <div key={f.key} className="flex flex-col items-center gap-1">
                            <div className="w-full aspect-square border border-white/10" style={{ background: getColor(f.key, f.darkDefault) }} />
                            <span className="text-[8px] font-mono text-gray-600 text-center leading-tight">{f.key}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-black/40 border border-white/10 p-4 flex items-center gap-3">
                <span className="text-[11px] font-mono text-gray-400">Community themes are located on GitHub:</span>
                <a href="https://github.com/MythicMeta/CommunityThemes" target="_blank" rel="noreferrer"
                    className="text-[11px] font-mono text-signal hover:underline transition-colors flex items-center gap-1">
                    MythicMeta/CommunityThemes ↗
                </a>
            </div>
        </div>
    );
};
