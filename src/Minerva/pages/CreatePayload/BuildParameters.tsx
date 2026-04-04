import React, { useEffect, useState, memo } from 'react';
import { useMutation } from "@apollo/client/react";
import { GET_DYNAMIC_BUILD_PARAMS } from './queries';
import { RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { CyberDropdown } from '../../components/CyberDropdown';

interface ParameterProps {
    onChange: (name: string, value: any, error: boolean) => void;
    parameter_type: string;
    default_value: any;
    name: string;
    required: boolean;
    verifier_regex: string;
    id: number;
    description: string;
    initialValue: any;
    choices: any[];
    trackedValue: any;
    payload_type: string;
    selected_os: string;
    dynamic_query_function?: string;
}

// Memoize to prevent unnecessary re-renders during wizard navigation
export const CreatePayloadParameter = memo(function CreatePayloadParameter({
    onChange, parameter_type, default_value, name, required, verifier_regex, id,
    description, initialValue, choices, trackedValue, payload_type, selected_os, dynamic_query_function
}: ParameterProps) {
    const [value, setValue] = useState<any>("");
    const [options, setOptions] = useState<any[]>([]);
    const [loadingDynamic, setLoadingDynamic] = useState(false);

    const [getDynamicParams] = useMutation<any>(GET_DYNAMIC_BUILD_PARAMS, {
        onCompleted: (data: any) => {
            setLoadingDynamic(false);
            if (data.dynamicQueryBuildParameterFunction.status === "success") {
                setOptions(data.dynamicQueryBuildParameterFunction.choices);
                // Auto-select first if current value is invalid
                if (data.dynamicQueryBuildParameterFunction.choices.length > 0 && !data.dynamicQueryBuildParameterFunction.choices.includes(value)) {
                    setValue(data.dynamicQueryBuildParameterFunction.choices[0]);
                    onChange(name, data.dynamicQueryBuildParameterFunction.choices[0], false);
                }
            }
        },
        onError: () => {
            setLoadingDynamic(false);
        }
    });

    useEffect(() => {
        if (parameter_type === "ChooseOne" || parameter_type === "ChooseOneCustom") {
            setOptions(choices || []);
            setValue(trackedValue || default_value);
        } else if (parameter_type === "Boolean") {
            setValue(trackedValue);
        } else if (parameter_type === "ChooseMultiple") {
            setOptions(choices || []);
            // Ensure value is properly-typed array (trackedValue may be a JSON string)
            const rawInit = trackedValue !== undefined ? trackedValue : default_value;
            let initMultiValue: any[];
            if (Array.isArray(rawInit)) {
                initMultiValue = rawInit;
            } else if (typeof rawInit === 'string' && rawInit !== '') {
                try {
                    const parsed = JSON.parse(rawInit);
                    initMultiValue = Array.isArray(parsed) ? parsed : [];
                } catch (e) {
                    initMultiValue = [];
                }
            } else {
                initMultiValue = [];
            }
            setValue(initMultiValue);
            // Sync parent state with properly-typed initial value
            if (!Array.isArray(rawInit)) {
                onChange(name, initMultiValue, false);
            }
        } else if (parameter_type === "Array" || parameter_type === "TypedArray") {
            // Ensure value is properly-typed array (trackedValue may be a JSON string from default_value)
            const rawInit = trackedValue !== undefined ? trackedValue : default_value;
            let initValue: any[];
            if (Array.isArray(rawInit)) {
                initValue = rawInit;
            } else if (typeof rawInit === 'string' && rawInit !== '') {
                try {
                    const parsed = JSON.parse(rawInit);
                    initValue = Array.isArray(parsed) ? parsed : [rawInit];
                } catch (e) {
                    initValue = [rawInit];
                }
            } else {
                initValue = [];
            }
            setValue(initValue);
            // Sync parent state with properly-typed initial value
            if (!Array.isArray(rawInit)) {
                onChange(name, initValue, false);
            }
        } else if (parameter_type === "File") {
            // Keep File objects as-is, but handle legacy UUID format
            setValue(trackedValue !== undefined ? trackedValue : { name: default_value || "" });
        } else if (parameter_type === "FileMultiple") {
            const initValue = trackedValue !== undefined ? trackedValue : [];
            setValue(Array.isArray(initValue) ? initValue : []);
        } else {
            setValue(trackedValue !== undefined ? trackedValue : default_value);
        }

        // Initial dynamic query if needed
        if (dynamic_query_function && (!choices || choices.length === 0)) {
            handleRefreshDynamic();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parameter_type, trackedValue, default_value, choices]);

    const handleRefreshDynamic = () => {
        setLoadingDynamic(true);
        getDynamicParams({
            variables: {
                parameter_name: name,
                payload_type: payload_type,
                selected_os: selected_os
            }
        });
    };

    const handleChange = (val: any) => {
        setValue(val);
        // Basic regex validation
        let error = false;
        if (verifier_regex && typeof val === 'string') {
            try {
                const regex = new RegExp(verifier_regex);
                if (!regex.test(val)) {
                    error = true;
                }
            } catch (e) {
                console.error("Invalid regex", verifier_regex);
            }
        }
        onChange(name, val, error);
    };

    const renderInput = () => {
        switch (parameter_type) {
            case "String":
                return (
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => handleChange(e.target.value)}
                        className="w-full bg-black/30 border border-gray-700 text-signal p-2 font-mono text-sm focus:border-signal outline-none transition-colors focus:bg-white/5"
                    />
                );
            case "Number":
                return (
                    <input
                        type="number"
                        value={value}
                        onChange={(e) => handleChange(Number(e.target.value))}
                        className="w-full bg-black/30 border border-gray-700 text-signal p-2 font-mono text-sm focus:border-signal outline-none transition-colors focus:bg-white/5"
                    />
                );
            case "Boolean":
                return (
                    <button
                        onClick={() => handleChange(!value)}
                        className={cn(
                            "w-12 h-6 rounded-full p-1 transition-colors relative border",
                            value ? "bg-green-900/50 border-green-500" : "bg-gray-900/50 border-gray-700"
                        )}
                    >
                        <div className={cn(
                            "w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_8px_white] transition-transform duration-300",
                            value ? "translate-x-6" : "translate-x-0"
                        )} />
                    </button>
                );
            case "ChooseOne":
                return (
                    <div className="relative flex items-center gap-2">
                        <div className="flex-1">
                            <CyberDropdown
                                options={options}
                                value={value}
                                onChange={handleChange}
                            />
                        </div>
                        {dynamic_query_function && (
                            <button
                                onClick={handleRefreshDynamic}
                                className="p-2 border border-gray-700 hover:border-signal hover:text-signal text-gray-500 transition-colors bg-black/40"
                            >
                                <RefreshCw size={16} className={loadingDynamic ? "animate-spin" : ""} />
                            </button>
                        )}
                    </div>
                );
             case "ChooseOneCustom":
                return (
                    <div className="flex gap-2">
                         <div className="relative flex-1">
                            <CyberDropdown
                                options={options}
                                value={options.includes(value) ? value : ""}
                                onChange={handleChange}
                                placeholder="Select..."
                            />
                        </div>
                        <input
                            type="text"
                            placeholder="Custom..."
                            value={value}
                            onChange={(e) => handleChange(e.target.value)}
                            className="flex-1 bg-black/30 border border-gray-700 text-signal p-2 font-mono text-sm focus:border-signal outline-none transition-colors focus:bg-white/5"
                        />
                    </div>
                );
            case "ChooseMultiple":
                return (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2">
                            {Array.isArray(value) && value.map((v, idx) => (
                                <div key={idx} className="px-2 py-1 bg-signal/20 border border-signal/50 text-signal text-xs font-mono flex items-center gap-2">
                                    <span>{v}</span>
                                    <button
                                        onClick={() => handleChange(value.filter((_, i) => i !== idx))}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                        <select
                            multiple
                            value={Array.isArray(value) ? value : []}
                            onChange={(e) => {
                                const selected = Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value);
                                handleChange(selected);
                            }}
                            className="w-full bg-black/30 border border-gray-700 text-signal p-2 font-mono text-sm focus:border-signal outline-none transition-colors focus:bg-white/5 min-h-[100px]"
                        >
                            {options.map((opt, i) => (
                                <option key={i} value={opt} className="py-1">{opt}</option>
                            ))}
                        </select>
                        <div className="text-[10px] text-gray-500 font-mono">HOLD_CTRL_TO_SELECT_MULTIPLE</div>
                    </div>
                );
            case "Array":
                return (
                    <div className="flex flex-col gap-2">
                        {Array.isArray(value) && value.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={item}
                                    onChange={(e) => {
                                        const newArray = [...value];
                                        newArray[idx] = e.target.value;
                                        handleChange(newArray);
                                    }}
                                    className="flex-1 bg-black/30 border border-gray-700 text-signal p-2 font-mono text-sm focus:border-signal outline-none transition-colors focus:bg-white/5"
                                    placeholder={`Item ${idx + 1}`}
                                />
                                <button
                                    onClick={() => handleChange(value.filter((_, i) => i !== idx))}
                                    className="px-2 py-1 border border-red-700 text-red-400 hover:bg-red-900/30 transition-colors font-mono text-xs"
                                >
                                    DEL
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={() => handleChange([...(Array.isArray(value) ? value : []), ""])}
                            className="px-3 py-2 border border-signal/50 text-signal hover:bg-signal/10 transition-colors font-mono text-xs"
                        >
                            + ADD_ITEM
                        </button>
                    </div>
                );
            case "TypedArray":
                return (
                    <div className="flex flex-col gap-2">
                        {Array.isArray(value) && value.map((item, idx) => {
                            const [itemType, itemValue] = Array.isArray(item) ? item : ["string", item];
                            return (
                                <div key={idx} className="flex items-center gap-2">
                                    <select
                                        value={itemType}
                                        onChange={(e) => {
                                            const newArray = [...value];
                                            newArray[idx] = [e.target.value, itemValue];
                                            handleChange(newArray);
                                        }}
                                        className="w-32 bg-black/30 border border-gray-700 text-signal p-2 font-mono text-xs focus:border-signal outline-none"
                                    >
                                        <option value="string">string</option>
                                        <option value="number">number</option>
                                        <option value="boolean">boolean</option>
                                    </select>
                                    <input
                                        type="text"
                                        value={itemValue}
                                        onChange={(e) => {
                                            const newArray = [...value];
                                            newArray[idx] = [itemType, e.target.value];
                                            handleChange(newArray);
                                        }}
                                        className="flex-1 bg-black/30 border border-gray-700 text-signal p-2 font-mono text-sm focus:border-signal outline-none transition-colors focus:bg-white/5"
                                        placeholder="Value"
                                    />
                                    <button
                                        onClick={() => handleChange(value.filter((_, i) => i !== idx))}
                                        className="px-2 py-1 border border-red-700 text-red-400 hover:bg-red-900/30 transition-colors font-mono text-xs"
                                    >
                                        DEL
                                    </button>
                                </div>
                            );
                        })}
                        <button
                            onClick={() => handleChange([...(Array.isArray(value) ? value : []), ["string", ""]])}
                            className="px-3 py-2 border border-signal/50 text-signal hover:bg-signal/10 transition-colors font-mono text-xs"
                        >
                            + ADD_ITEM
                        </button>
                    </div>
                );
            case "Date":
                return (
                    <input
                        type="date"
                        value={value}
                        onChange={(e) => handleChange(e.target.value)}
                        className="w-full bg-black/30 border border-gray-700 text-signal p-2 font-mono text-sm focus:border-signal outline-none transition-colors focus:bg-white/5"
                    />
                );
            case "File":
                return (
                    <div className="flex flex-col gap-2">
                        <input
                            type="file"
                            onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                    handleChange(e.target.files[0]);
                                }
                            }}
                            className="w-full text-signal font-mono text-sm
                                file:mr-4 file:py-2 file:px-4
                                file:border file:border-signal file:bg-black/50 file:text-signal
                                file:font-mono file:text-xs file:cursor-pointer
                                file:hover:bg-signal/20 file:transition-colors
                                bg-black/30 border border-gray-700 p-2 cursor-pointer"
                        />
                        {value instanceof File && (
                            <div className="text-xs text-gray-400 font-mono flex items-center gap-2">
                                <span className="text-signal">SELECTED:</span> {value.name} ({(value.size / 1024).toFixed(1)} KB)
                            </div>
                        )}
                        {value && typeof value === 'object' && value.name && !(value instanceof File) && (
                            <div className="text-xs text-gray-400 font-mono flex items-center gap-2">
                                <span className="text-signal">UUID:</span> {value.name}
                            </div>
                        )}
                    </div>
                );
            case "FileMultiple":
                return (
                    <div className="flex flex-col gap-2">
                        <input
                            type="file"
                            multiple
                            onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                    const newFiles = Array.from(e.target.files);
                                    const existing = Array.isArray(value) ? value : [];
                                    handleChange([...existing, ...newFiles]);
                                }
                            }}
                            className="w-full text-signal font-mono text-sm
                                file:mr-4 file:py-2 file:px-4
                                file:border file:border-signal file:bg-black/50 file:text-signal
                                file:font-mono file:text-xs file:cursor-pointer
                                file:hover:bg-signal/20 file:transition-colors
                                bg-black/30 border border-gray-700 p-2 cursor-pointer"
                        />
                        {Array.isArray(value) && value.length > 0 && (
                            <div className="flex flex-col gap-1">
                                {value.map((f: any, idx: number) => (
                                    <div key={idx} className="flex items-center justify-between bg-black/30 border border-gray-800 px-3 py-1">
                                        <span className="text-xs font-mono text-gray-300">
                                            {f instanceof File ? `${f.name} (${(f.size / 1024).toFixed(1)} KB)` : `UUID: ${f}`}
                                        </span>
                                        <button
                                            onClick={() => handleChange((value as unknown[]).filter((_, i) => i !== idx))}
                                            className="text-red-400 hover:text-red-300 text-xs font-mono"
                                        >
                                            DEL
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            case "Dictionary":
                if (Array.isArray(value)) {
                    return (
                        <div className="flex flex-col gap-2">
                            {value.map((entry: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-gray-400 w-1/3 shrink-0 truncate">{entry.name}</span>
                                    <input
                                        type="text"
                                        value={entry.value !== undefined ? String(entry.value) : ''}
                                        onChange={(e) => {
                                            const newVal = [...value];
                                            newVal[idx] = { ...entry, value: e.target.value };
                                            handleChange(newVal);
                                        }}
                                        className="flex-1 bg-black/30 border border-gray-700 text-signal p-1 font-mono text-sm focus:border-signal outline-none transition-colors focus:bg-white/5"
                                    />
                                </div>
                            ))}
                        </div>
                    );
                }
                return (
                    <div className="flex flex-col gap-1">
                        <textarea
                            value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                            onChange={(e) => handleChange(e.target.value)}
                            className="w-full bg-black/30 border border-gray-700 text-signal p-2 font-mono text-sm focus:border-signal outline-none transition-colors focus:bg-white/5 min-h-[100px]"
                            placeholder='{"key": "value"}'
                        />
                        <div className="text-[10px] text-gray-500 font-mono">JSON_FORMAT_REQUIRED</div>
                    </div>
                );
            default:
                return (
                    <div className="text-red-500 text-xs border border-red-900 p-2 bg-red-900/10">
                        Unsupported Parameter Type: {parameter_type}
                    </div>
                );
        }
    };

    return (
        <tr className="border-b border-gray-800/50 hover:bg-white/5 transition-colors group">
            <td className="p-4 align-top w-1/3 border-r border-gray-800/30">
                <div className="font-bold text-signal font-mono mb-1 group-hover:text-white transition-colors">{name}</div>
                <div className="text-xs text-gray-400 leading-relaxed">{description}</div>
                {required && <div className="text-[10px] text-red-400 mt-1 font-mono tracking-wider">* REQUIRED</div>}
            </td>
            <td className="p-4 align-top">
                {renderInput()}
            </td>
        </tr>
    );
});
