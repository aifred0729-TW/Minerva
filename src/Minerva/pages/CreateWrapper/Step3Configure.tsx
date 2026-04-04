import React, { useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AceEditor from 'react-ace';
import {
    Upload, Trash2, Plus, X, RotateCcw, ChevronDown, ChevronUp,
    Hash, Calendar, Pencil, RefreshCw,
} from 'lucide-react';
import { UploadTaskFile } from '../../components/MythicFileUpload';
import { cn } from '../../lib/utils';
import { groupBuildParams } from './createWrapper.utils';
import type { PayloadType, BuildParam } from './createWrapper.types';
import { EditButton } from './SharedComponents';

export const Step3Configure: React.FC<{
    wrapperType: PayloadType | null;
    selectedOS: string;
    parameters: Record<string, unknown>;
    setParameters: (params: Record<string, unknown>) => void;
    description: string;
    setDescription: (d: string) => void;
    filename: string;
    setFilename: (f: string) => void;
    onEditWrapper: () => void;
    onEditPayload: () => void;
}> = ({ wrapperType, selectedOS, parameters, setParameters, description, setDescription, filename, setFilename, onEditWrapper, onEditPayload }) => {
    const buildParams = wrapperType?.buildparameters || [];
    const paramGroups = useMemo(
        () => groupBuildParams(buildParams, parameters, selectedOS),
        [buildParams, parameters, selectedOS]
    );
    const [paramErrors, setParamErrors] = useState<Record<string, string>>({});

    const handleParamChange = useCallback((name: string, value: any, regex?: string) => {
        setParameters({ ...parameters, [name]: value });
        if (regex && typeof value === 'string') {
            try {
                const valid = new RegExp(regex).test(value);
                setParamErrors(prev => ({ ...prev, [name]: valid ? '' : `Must match: ${regex}` }));
            } catch { /* invalid regex */ }
        } else if (paramErrors[name]) {
            setParamErrors(prev => ({ ...prev, [name]: '' }));
        }
    }, [parameters, paramErrors, setParameters]);

    const renderParamInput = (param: BuildParam) => {
        const val = parameters[param.name] ?? param.default_value ?? '';
        const err = paramErrors[param.name];

        if (param.parameter_type === 'ChooseOne') {
            return (
                <select
                    value={String(val)}
                    onChange={(e) => handleParamChange(param.name, e.target.value)}
                    className="w-full bg-void border border-ghost/30 rounded px-3 py-2 text-signal focus:border-signal outline-none"
                >
                    {param.choices?.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            );
        }

        if (param.parameter_type === 'ChooseOneCustom') {
            const isCustom = !param.choices?.includes(String(val));
            return (
                <div className="space-y-2">
                    <select
                        value={isCustom ? '__custom__' : String(val)}
                        onChange={(e) => {
                            if (e.target.value === '__custom__') {
                                handleParamChange(param.name, '');
                            } else {
                                handleParamChange(param.name, e.target.value);
                            }
                        }}
                        className="w-full bg-void border border-ghost/30 rounded px-3 py-2 text-signal focus:border-signal outline-none"
                    >
                        {param.choices?.map(c => <option key={c} value={c}>{c}</option>)}
                        <option value="__custom__">Custom…</option>
                    </select>
                    {isCustom && (
                        <input
                            type="text"
                            value={String(val)}
                            placeholder="Enter custom value…"
                            onChange={(e) => handleParamChange(param.name, e.target.value, param.verifier_regex)}
                            className={cn(
                                "w-full bg-void border rounded px-3 py-2 text-signal focus:border-signal outline-none font-mono text-sm",
                                err ? "border-alert" : "border-ghost/30"
                            )}
                        />
                    )}
                    {err && <p className="text-xs text-alert">{err}</p>}
                </div>
            );
        }

        if (param.parameter_type === 'ChooseMultiple') {
            const selected: string[] = Array.isArray(val) ? val : (val ? [val] : []);
            return (
                <div className="flex flex-wrap gap-2">
                    {param.choices?.map(c => (
                        <button
                            key={c} type="button"
                            onClick={() => {
                                const next = selected.includes(c)
                                    ? selected.filter(x => x !== c)
                                    : [...selected, c];
                                handleParamChange(param.name, next);
                            }}
                            className={cn(
                                "px-3 py-1 text-xs rounded border transition-colors",
                                selected.includes(c)
                                    ? "border-signal bg-signal/20 text-signal"
                                    : "border-ghost/30 text-ghost hover:border-signal/50"
                            )}
                        >
                            {c}
                        </button>
                    ))}
                </div>
            );
        }

        if (param.parameter_type === 'Boolean') {
            const bval = typeof val === 'string' ? val === 'true' : Boolean(val);
            return (
                <button
                    type="button"
                    onClick={() => handleParamChange(param.name, !bval)}
                    className={cn(
                        "px-4 py-2 rounded border transition-colors text-sm",
                        bval ? "border-matrix bg-matrix/20 text-matrix" : "border-ghost/30 text-ghost hover:border-signal/50"
                    )}
                >
                    {bval ? 'Enabled' : 'Disabled'}
                </button>
            );
        }

        if (param.parameter_type === 'Number') {
            return (
                <div className="flex gap-2 items-center">
                    <input
                        type="number"
                        value={val === '' ? '' : Number(val)}
                        onChange={(e) => handleParamChange(param.name, e.target.value === '' ? '' : Number(e.target.value), param.verifier_regex)}
                        className={cn(
                            "w-40 bg-void border rounded px-3 py-2 text-signal focus:border-signal outline-none font-mono text-sm",
                            err ? "border-alert" : "border-ghost/30"
                        )}
                    />
                    <Hash size={14} className="text-ghost/40" />
                    {err && <p className="text-xs text-alert">{err}</p>}
                </div>
            );
        }

        if (param.parameter_type === 'Date') {
            const dateStr = val ? String(val).slice(0, 10) : '';
            return (
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={dateStr}
                        onChange={(e) => handleParamChange(param.name, e.target.value)}
                        className={cn(
                            "bg-void border rounded px-3 py-2 text-signal focus:border-signal outline-none font-mono text-sm",
                            err ? "border-alert" : "border-ghost/30"
                        )}
                    />
                    <Calendar size={14} className="text-ghost/40" />
                </div>
            );
        }

        if (param.parameter_type === 'File') {
            return (
                <label className="flex items-center gap-2 px-3 py-2 border border-ghost/30 rounded cursor-pointer hover:border-signal/50 text-sm text-ghost transition-colors w-fit">
                    <Upload size={14} />
                    {val instanceof File ? val.name : (val ? String(val).slice(0, 24) + '…' : 'Choose file')}
                    <input
                        type="file"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleParamChange(param.name, e.target.files[0])}
                    />
                </label>
            );
        }

        if (param.parameter_type === 'FileMultiple') {
            const files: any[] = Array.isArray(val) ? val : [];
            return (
                <div className="space-y-2">
                    <label className="flex items-center gap-2 px-3 py-2 border border-ghost/30 rounded cursor-pointer hover:border-signal/50 text-sm text-ghost transition-colors w-fit">
                        <Upload size={14} /> Add files
                        <input
                            type="file" multiple className="hidden"
                            onChange={(e) => {
                                const added = Array.from(e.target.files || []);
                                handleParamChange(param.name, [...files, ...added]);
                            }}
                        />
                    </label>
                    {files.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-ghost">
                            <span className="font-mono">{f instanceof File ? f.name : String(f)}</span>
                            <button type="button"
                                onClick={() => handleParamChange(param.name, files.filter((_, j) => j !== i))}
                                className="text-ghost/50 hover:text-alert transition-colors"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            );
        }

        if (param.parameter_type === 'Array') {
            const arr: string[] = Array.isArray(val) ? val : [];
            return (
                <div className="space-y-2">
                    {arr.map((item, i) => (
                        <div key={i} className="flex gap-2 items-center">
                            <input
                                type="text"
                                value={item}
                                onChange={(e) => {
                                    const next = [...arr]; next[i] = e.target.value;
                                    handleParamChange(param.name, next);
                                }}
                                className="flex-1 bg-void border border-ghost/30 rounded px-3 py-1.5 text-signal focus:border-signal outline-none font-mono text-sm"
                            />
                            <button type="button" onClick={() => handleParamChange(param.name, arr.filter((_, j) => j !== i))}
                                className="text-ghost/50 hover:text-alert transition-colors flex-shrink-0">
                                <Trash2 size={13} />
                            </button>
                        </div>
                    ))}
                    <button type="button"
                        onClick={() => handleParamChange(param.name, [...arr, ''])}
                        className="flex items-center gap-1 text-xs text-signal/70 hover:text-signal border border-ghost/20 hover:border-signal/40 px-2 py-1 rounded transition-colors"
                    >
                        <Plus size={12} /> Add item
                    </button>
                </div>
            );
        }

        if (param.parameter_type === 'TypedArray') {
            const arr: [string, string][] = Array.isArray(val) ? val : [];
            const typeLabel = String(param.default_value || 'value');
            return (
                <div className="space-y-2">
                    {arr.map((item, i) => (
                        <div key={i} className="flex gap-2 items-center">
                            <span className="text-xs text-ghost/50 font-mono flex-shrink-0 w-16 truncate" title={typeLabel}>{typeLabel}</span>
                            <input
                                type="text"
                                value={item[1] || ''}
                                onChange={(e) => {
                                    const next = [...arr] as [string, string][];
                                    next[i] = [typeLabel, e.target.value];
                                    handleParamChange(param.name, next);
                                }}
                                className="flex-1 bg-void border border-ghost/30 rounded px-3 py-1.5 text-signal focus:border-signal outline-none font-mono text-sm"
                            />
                            <button type="button" onClick={() => handleParamChange(param.name, arr.filter((_, j) => j !== i))}
                                className="text-ghost/50 hover:text-alert transition-colors flex-shrink-0">
                                <Trash2 size={13} />
                            </button>
                        </div>
                    ))}
                    <button type="button"
                        onClick={() => handleParamChange(param.name, [...arr, [typeLabel, '']])}
                        className="flex items-center gap-1 text-xs text-signal/70 hover:text-signal border border-ghost/20 hover:border-signal/40 px-2 py-1 rounded transition-colors"
                    >
                        <Plus size={12} /> Add entry
                    </button>
                </div>
            );
        }

        if (param.parameter_type === 'MapArray') {
            const mapArr: [string, string[]][] = Array.isArray(val) ? val : [];
            return (
                <div className="space-y-3">
                    {mapArr.map(([key, values], i) => (
                        <div key={i} className="border border-ghost/20 rounded p-3 space-y-2">
                            <div className="flex gap-2 items-center">
                                <input
                                    type="text"
                                    value={key}
                                    placeholder="Key"
                                    onChange={(e) => {
                                        const next = [...mapArr] as [string, string[]][];
                                        next[i] = [e.target.value, values];
                                        handleParamChange(param.name, next);
                                    }}
                                    className="flex-1 bg-void border border-ghost/30 rounded px-3 py-1.5 text-signal focus:border-signal outline-none font-mono text-sm"
                                />
                                <button type="button" onClick={() => handleParamChange(param.name, mapArr.filter((_, j) => j !== i))}
                                    className="text-ghost/50 hover:text-alert transition-colors flex-shrink-0">
                                    <Trash2 size={13} />
                                </button>
                            </div>
                            <div className="ml-3 space-y-1">
                                {values.map((v, vi) => (
                                    <div key={vi} className="flex gap-2 items-center">
                                        <input
                                            type="text"
                                            value={v}
                                            onChange={(e) => {
                                                const next = [...mapArr] as [string, string[]][];
                                                const newVals = [...values]; newVals[vi] = e.target.value;
                                                next[i] = [key, newVals];
                                                handleParamChange(param.name, next);
                                            }}
                                            className="flex-1 bg-void border border-ghost/30 rounded px-2 py-1 text-signal focus:border-signal outline-none font-mono text-xs"
                                        />
                                        <button type="button" onClick={() => {
                                            const next = [...mapArr] as [string, string[]][];
                                            next[i] = [key, values.filter((_, j) => j !== vi)];
                                            handleParamChange(param.name, next);
                                        }} className="text-ghost/50 hover:text-alert transition-colors flex-shrink-0">
                                            <X size={11} />
                                        </button>
                                    </div>
                                ))}
                                <button type="button"
                                    onClick={() => {
                                        const next = [...mapArr] as [string, string[]][];
                                        next[i] = [key, [...values, '']];
                                        handleParamChange(param.name, next);
                                    }}
                                    className="flex items-center gap-1 text-[10px] text-signal/60 hover:text-signal border border-ghost/20 hover:border-signal/40 px-2 py-0.5 rounded transition-colors"
                                >
                                    <Plus size={10} /> value
                                </button>
                            </div>
                        </div>
                    ))}
                    <button type="button"
                        onClick={() => handleParamChange(param.name, [...mapArr, ['', []]])}
                        className="flex items-center gap-1 text-xs text-signal/70 hover:text-signal border border-ghost/20 hover:border-signal/40 px-2 py-1 rounded transition-colors"
                    >
                        <Plus size={12} /> Add key
                    </button>
                </div>
            );
        }

        if (param.parameter_type === 'Dictionary') {
            const dictEntries: { name: string; value: string }[] = Array.isArray(val)
                ? val.map((v: any) => ({ name: String(v.name ?? ''), value: String(v.value ?? '') }))
                : [];
            let choiceKeys: { name: string; default_value: string }[] = [];
            try {
                if (Array.isArray(param.choices)) {
                    choiceKeys = param.choices.map((c: any) => typeof c === 'string' ? JSON.parse(c) : c);
                }
            } catch {}

            const updateEntry = (i: number, field: 'name' | 'value', newVal: string) => {
                const next = dictEntries.map((e, idx) => idx === i ? { ...e, [field]: newVal } : e);
                handleParamChange(param.name, next);
            };
            const removeEntry = (i: number) => handleParamChange(param.name, dictEntries.filter((_, j) => j !== i));
            const addEntry = (keyName = '', keyDefault = '') => handleParamChange(param.name, [...dictEntries, { name: keyName, value: keyDefault }]);

            const usedNames = new Set(dictEntries.map(e => e.name));
            const availableChoices = choiceKeys.filter(k => !usedNames.has(k.name));

            return (
                <div className="space-y-2">
                    {dictEntries.map((entry, i) => (
                        <div key={i} className="flex gap-2 items-center">
                            <input
                                type="text"
                                value={entry.name}
                                placeholder="Key"
                                onChange={(e) => updateEntry(i, 'name', e.target.value)}
                                className="w-1/3 bg-void border border-ghost/30 rounded px-2 py-1.5 text-signal focus:border-signal outline-none font-mono text-sm"
                            />
                            <span className="text-ghost/30 text-xs">=</span>
                            <input
                                type="text"
                                value={entry.value}
                                placeholder="Value"
                                onChange={(e) => updateEntry(i, 'value', e.target.value)}
                                className="flex-1 bg-void border border-ghost/30 rounded px-2 py-1.5 text-signal focus:border-signal outline-none font-mono text-sm"
                            />
                            <button type="button" onClick={() => removeEntry(i)}
                                className="text-ghost/50 hover:text-alert transition-colors flex-shrink-0">
                                <Trash2 size={13} />
                            </button>
                        </div>
                    ))}
                    <div className="flex gap-2 flex-wrap">
                        {availableChoices.slice(0, 6).map(k => (
                            <button key={k.name} type="button"
                                onClick={() => addEntry(k.name, k.default_value)}
                                className="flex items-center gap-1 text-xs text-signal/70 hover:text-signal border border-ghost/20 hover:border-signal/40 px-2 py-1 rounded transition-colors"
                            >
                                <Plus size={11} /> {k.name}
                            </button>
                        ))}
                        <button type="button" onClick={() => addEntry()}
                            className="flex items-center gap-1 text-xs text-ghost/60 hover:text-signal border border-ghost/20 hover:border-signal/40 px-2 py-1 rounded transition-colors"
                        >
                            <Plus size={12} /> Custom
                        </button>
                    </div>
                </div>
            );
        }

        // Default: String text input
        return (
            <div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={String(val)}
                        onChange={(e) => handleParamChange(param.name, e.target.value, param.verifier_regex)}
                        className={cn(
                            "flex-1 bg-void border rounded px-3 py-2 text-signal focus:border-signal outline-none font-mono text-sm",
                            err ? "border-alert" : "border-ghost/30"
                        )}
                    />
                    {param.randomize && (
                        <button
                            type="button"
                            onClick={() => handleParamChange(param.name, Math.random().toString(36).substring(2, 14))}
                            title="Randomize"
                            className="px-2 py-1 border border-ghost/30 rounded hover:border-signal/50 text-ghost hover:text-signal transition-colors"
                        >
                            <RefreshCw size={14} />
                        </button>
                    )}
                </div>
                {err && <p className="text-xs text-alert mt-1">{err}</p>}
                {param.format_string && (
                    <p className="text-xs text-ghost/40 mt-1 font-mono">format: {param.format_string}</p>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-signal mb-4">CONFIGURE BUILD PARAMETERS</h2>

            {/* Context breadcrumb */}
            <div className="flex items-center gap-2 text-xs mb-4 flex-wrap">
                <span className="text-ghost">Wrapper:</span>
                <span className="text-signal font-mono">{wrapperType?.name}</span>
                <EditButton label="Change" onClick={onEditWrapper} />
                <span className="text-ghost/40 mx-1">›</span>
                <span className="text-ghost">Payload: selected</span>
                <EditButton label="Change" onClick={onEditPayload} />
                {selectedOS && (
                    <>
                        <span className="text-ghost/40 mx-1">›</span>
                        <span className="px-1.5 py-0.5 bg-signal/10 text-signal text-[10px] rounded font-mono">{selectedOS}</span>
                    </>
                )}
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm text-ghost mb-2">
                        Output Filename
                        <span className="text-ghost/50 text-xs ml-2">(optional)</span>
                    </label>
                    <input
                        type="text"
                        value={filename}
                        onChange={(e) => setFilename(e.target.value)}
                        placeholder={wrapperType
                            ? `${wrapperType.name}${wrapperType.file_extension ? '.' + wrapperType.file_extension : ''}`
                            : 'wrapper'}
                        className="w-full bg-void border border-ghost/30 rounded-lg px-4 py-2 text-signal placeholder:text-ghost/30 focus:border-signal outline-none font-mono text-sm"
                    />
                </div>

                <div>
                    <label className="block text-sm text-ghost mb-2">Description</label>
                    <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Wrapped payload description"
                        className="w-full bg-void border border-ghost/30 rounded-lg px-4 py-2 text-signal placeholder:text-ghost/50 focus:border-signal outline-none"
                    />
                </div>

                {/* Grouped build parameters */}
                {paramGroups.length > 0 && paramGroups.map(({ group, params }) => (
                    <div key={group} className="border-t border-ghost/20 pt-4">
                        <p className="text-xs text-ghost/60 uppercase tracking-widest mb-3 font-mono">{group}</p>
                        {params.map(param => (
                            <div key={param.id} className="mb-4">
                                <label className="block text-sm text-ghost mb-1">
                                    {param.name}
                                    {param.required && <span className="text-alert ml-1">*</span>}
                                </label>
                                {param.description && (
                                    <p className="text-xs text-ghost/50 mb-1">{param.description}</p>
                                )}
                                {renderParamInput(param)}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
};
