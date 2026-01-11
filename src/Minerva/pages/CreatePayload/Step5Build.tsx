import React, { useState, useEffect } from 'react';
import { useMutation } from '@apollo/client';
import { CREATE_PAYLOAD_MUTATION } from './queries';
import { Disc, CheckCircle, AlertTriangle, Terminal, Cpu, Radio, FileText, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { snackActions } from '../../../Archive/components/utilities/Snackbar';

interface Step5Props {
    config: any;
}

// --- Parameter Visibility Logic ---
const HideConditionOperandEQ = "eq";
const HideConditionOperandNotEQ = "neq";
const HideConditionOperandIN = "in";
const HideConditionOperandNotIN = "nin";
const HideConditionOperandLessThan = "lt";
const HideConditionOperandGreaterThan = "gt";
const HideConditionOperandLessThanOrEqual = "lte";
const HideConditionOperandGreaterThanOrEqual = "gte";
const HideConditionOperationStartsWith = "sw";
const HideConditionOperationEndsWith = "ew";
const HideConditionOperationContains = "co";
const HideConditionOperationNotContains = "nco";

const shouldHide = (param: any, allParams: any[], selectedOS: string) => {
    // 1. Check Supported OS
    if (param.supported_os && param.supported_os.length > 0) {
        if (!param.supported_os.includes(selectedOS)) {
            return true;
        }
    }

    // 2. Check Hide Conditions
    if (!param.hide_conditions || param.hide_conditions.length === 0) return false;

    for (const condition of param.hide_conditions) {
        const targetParam = allParams.find(p => p.name === condition.name);
        if (!targetParam) continue;

        const targetValue = targetParam.value;
        const conditionValue = condition.value;
        
        let conditionMet = false;
        
        // Helper to safe string
        const safeStr = (v: any) => String(v ?? "");

        switch (condition.operand) {
            case HideConditionOperandEQ:
                if (safeStr(conditionValue) === safeStr(targetValue)) conditionMet = true;
                break;
            case HideConditionOperandNotEQ:
                if (safeStr(conditionValue) !== safeStr(targetValue)) conditionMet = true;
                break;
            case HideConditionOperandIN:
                // Normalize both sides to strings for comparison
                if (condition.choices && condition.choices.map(safeStr).includes(safeStr(targetValue))) conditionMet = true;
                break;
            case HideConditionOperandNotIN:
                if (condition.choices && !condition.choices.map(safeStr).includes(safeStr(targetValue))) conditionMet = true;
                break;
            case HideConditionOperandLessThan:
                try { if (parseFloat(targetValue) < parseFloat(conditionValue)) conditionMet = true; } catch(e){}
                break;
            case HideConditionOperandGreaterThan:
                try { if (parseFloat(targetValue) > parseFloat(conditionValue)) conditionMet = true; } catch(e){}
                break;
            case HideConditionOperandLessThanOrEqual:
                try { if (parseFloat(targetValue) <= parseFloat(conditionValue)) conditionMet = true; } catch(e){}
                break;
            case HideConditionOperandGreaterThanOrEqual:
                try { if (parseFloat(targetValue) >= parseFloat(conditionValue)) conditionMet = true; } catch(e){}
                break;
            case HideConditionOperationStartsWith:
                if (safeStr(targetValue).startsWith(safeStr(conditionValue))) conditionMet = true;
                break;
            case HideConditionOperationEndsWith:
                if (safeStr(targetValue).endsWith(safeStr(conditionValue))) conditionMet = true;
                break;
            case HideConditionOperationContains:
                if (safeStr(targetValue).includes(safeStr(conditionValue))) conditionMet = true;
                break;
            case HideConditionOperationNotContains:
                if (!safeStr(targetValue).includes(safeStr(conditionValue))) conditionMet = true;
                break;
        }

        if (conditionMet) return true;
    }
    return false;
};

// Re-implement UploadTaskFile locally to handle File objects correctly
const uploadFile = async (file: File, comment: string): Promise<string | null> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("comment", comment);
    
    console.log("Uploading " + file.name + "...");
    
    try {
        const response = await fetch('/api/v1.4/task_upload_file_webhook', {
            method: 'POST',
            body: formData,
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("access_token")}`,
                "MythicSource": "web"
            }
        });
        
        const data = await response.json();
        if (data.status === "success" || data.agent_file_id) {
            return data.agent_file_id;
        } else {
            console.error("Upload failed:", data);
            return null;
        }
    } catch (e) {
        console.error("Upload error:", e);
        return null;
    }
};

const processParamValue = async (param: any, contextStr: string) => {
    let val = param.value;
    
    // Ensure val is not undefined/null, use default if needed
    if (val === undefined || val === null) {
        val = param.default_value;
    }
    if (val === undefined || val === null) {
        val = ""; // Fallback to empty string
    }

    // File Upload Handling
    if (param.parameter_type === "File") {
        if (val instanceof File) {
            const uuid = await uploadFile(val, `Uploaded as ${contextStr} parameter: ${param.name}`);
            if (uuid) return uuid;
            throw new Error(`Failed to upload file for ${param.name}`);
        }
    }
    
    if (param.parameter_type === "FileMultiple" && Array.isArray(val)) {
        const newValues = [];
        for (const item of val) {
            if (item instanceof File) {
                const uuid = await uploadFile(item, `Uploaded as ${contextStr} parameter: ${param.name}`);
                if (uuid) newValues.push(uuid);
                else throw new Error(`Failed to upload file for ${param.name}`);
            } else {
                newValues.push(item);
            }
        }
        return newValues;
    }

    // Handle complex types - Attempt parsing ONLY for complex types
    const complexTypes = ["Array", "ChooseMultiple", "TypedArray", "FileMultiple", "Dictionary"];
    
    if (complexTypes.includes(param.parameter_type) && typeof val === 'string') {
        try {
            const parsed = JSON.parse(val);
            // Only accept parsing if it results in an object or array (and not null)
            if (typeof parsed === 'object' && parsed !== null) {
                val = parsed;
            }
        } catch (e) {
            // Not valid JSON, keep as string (might be intended for some weird edge cases, or it's just broken)
        }
    }
    
    // Dictionary specific handling: Convert Array format (from UI/Default) to Key-Value Object
    if (param.parameter_type === "Dictionary") {
        if (Array.isArray(val)) {
            val = val.reduce((prev: any, cur: any) => {
                 if (cur.default_show) {
                     return {...prev, [cur.name]: cur.value};
                 }
                 return {...prev}
            }, {});
        } 
    }

    // Strict Type Casting based on Parameter Type
    switch(param.parameter_type) {
        case "Number":
            if (val === "" && param.default_value !== undefined) return Number(param.default_value);
            return Number(val);
        case "Boolean":
            if (String(val).toLowerCase() === "false") return false;
            if (String(val).toLowerCase() === "true") return true;
            return Boolean(val);
        case "String":
        case "ChooseOne":
        case "ChooseOneCustom":
        case "Date":
            // Ensure we don't accidentally stringify an Object if we failed to parse it correctly earlier 
            // or if it was mistakenly passed as an object for a String type.
            if (typeof val === 'object' && val !== null) {
                return JSON.stringify(val);
            }
            return String(val);
        default:
            return val;
    }
};


export function Step5Build({ config }: Step5Props) {
    const navigate = useNavigate();
    const [filename, setFilename] = useState(`${config.payloadType}.bin`);
    const [description, setDescription] = useState(`Created via Minerva`);
    const [isBuilding, setIsBuilding] = useState(false);
    const [buildResult, setBuildResult] = useState<any>(null);

    const [createPayload] = useMutation(CREATE_PAYLOAD_MUTATION);

    useEffect(() => {
        // Auto-detect filename based on output_type parameter if present
        const outputTypeParam = config.buildParameters.find((p: any) => p.name === "output_type");
        if (outputTypeParam) {
            let extension = ".bin";
            const val = outputTypeParam.value || outputTypeParam.default_value;
            const valStr = String(val).toLowerCase();
            
            if (valStr === "winexe" || valStr.includes("exe")) extension = ".exe";
            else if (valStr === "serviceexe") extension = ".exe"; // Common for service wrappers
            else if (valStr === "shellcode") extension = ".bin";
            else if (valStr === "reflectivedll" || valStr === "dll" || valStr.includes("dll")) extension = ".dll";
            else if (valStr === "mach-o" || valStr.includes("mach")) extension = "";
            else if (valStr === "elf" || valStr.includes("elf")) extension = ""; // Linux usually no ext
            
            // Only update if it's the default or looks like an auto-generated name
            if (filename === `${config.payloadType}.bin` || filename.startsWith(config.payloadType)) {
                 setFilename(`${config.payloadType}${extension}`);
            }
        }
    }, [config.buildParameters, config.payloadType]);

    const handleBuild = async () => {
        setIsBuilding(true);
        setBuildResult(null);
        
        try {
            // Process Build Parameters (Async for file uploads)
            const buildParameters = [];
            for (const p of config.buildParameters) {
                // Ensure we pass OS to shouldHide
                if (!shouldHide(p, config.buildParameters, config.os)) {
                    buildParameters.push({
                        name: p.name,
                        value: await processParamValue(p, "build")
                    });
                }
            }

            // Process C2 Profiles
            const c2Profiles = [];
            for (const p of config.c2Profiles) {
                // Check if C2 params have supported_os (unlikely but safe)
                const visibleParams = p.c2profileparameters.filter((param: any) => !shouldHide(param, p.c2profileparameters, config.os));
                const params: any = {};
                
                for (const param of visibleParams) {
                    params[param.name] = await processParamValue(param, `c2 (${p.name})`);
                }
                
                c2Profiles.push({
                    c2_profile: p.name,
                    c2_profile_parameters: params
                });
            }

            const payloadDefinition = {
                selected_os: config.os,
                payload_type: config.payloadType,
                filename: filename,
                description: description,
                commands: config.commands,
                build_parameters: buildParameters,
                c2_profiles: c2Profiles
            };

            const { data } = await createPayload({
                variables: {
                    payload: JSON.stringify(payloadDefinition)
                }
            });
            
            if (data.createPayload.status === "error") {
                setBuildResult(data.createPayload);
            } else {
                setBuildResult(data.createPayload);
            }
            
        } catch (e: any) {
            console.error(e);
            setBuildResult({ status: 'error', error: e.message || "Unknown error occurred" });
        } finally {
            setIsBuilding(false);
        }
    };

    // Auto-redirect on success
    useEffect(() => {
        if (buildResult?.status === 'success') {
            const timer = setTimeout(() => {
                navigate('/payloads');
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [buildResult, navigate]);

    // Helper to format parameter values for display
    const formatParamValue = (val: any) => {
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
        if (typeof val === 'object') {
            if (val instanceof File) return `FILE: ${val.name}`;
            return JSON.stringify(val);
        }
        return String(val);
    };

    // Filter params for display in the review screen too
    const visibleBuildParams = config.buildParameters.filter((p: any) => !shouldHide(p, config.buildParameters, config.os));
    
    return (
        <div className="h-full flex flex-col gap-6 overflow-hidden">
            {/* Main Configuration Grid */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
                {/* Left Column: Core Info & Parameters */}
                <div className="flex flex-col gap-6 overflow-hidden">
                    {/* Core Info Card */}
                    <div className="border border-ghost/30 bg-black/40 p-5 relative shrink-0">
                        <div className="absolute top-0 right-0 p-2 text-gray-500 opacity-20"><Cpu size={40} /></div>
                        <h3 className="text-sm font-mono text-gray-400 mb-4 tracking-widest uppercase flex items-center gap-2">
                            <span className="w-2 h-2 bg-signal rounded-full"></span> Core Configuration
                        </h3>
                        <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                            <div>
                                <div className="text-[10px] text-gray-500">TARGET_SYSTEM</div>
                                <div className="text-signal text-lg">{config.os}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-gray-500">PAYLOAD_TYPE</div>
                                <div className="text-signal text-lg">{config.payloadType}</div>
                            </div>
                            <div className="col-span-2 pt-2 border-t border-gray-800">
                                <div className="text-[10px] text-gray-500 mb-1">FILENAME</div>
                                <input 
                                    type="text" 
                                    value={filename}
                                    onChange={(e) => setFilename(e.target.value)}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal font-mono text-xs focus:border-signal outline-none transition-colors"
                                />
                            </div>
                            <div className="col-span-2">
                                <div className="text-[10px] text-gray-500 mb-1">DESCRIPTION</div>
                                <input 
                                    type="text" 
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal font-mono text-xs focus:border-signal outline-none transition-colors"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Build Parameters List */}
                    <div className="border border-ghost/30 bg-black/40 flex-1 flex flex-col min-h-0">
                        <div className="p-3 border-b border-ghost/30 bg-white/5 flex items-center gap-2">
                            <FileText size={14} className="text-gray-400" />
                            <span className="font-mono text-xs font-bold text-signal tracking-wider">BUILD_PARAMETERS</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <tbody>
                                    {visibleBuildParams.map((param: any) => (
                                        <tr key={param.name} className="border-b border-gray-800 last:border-0 hover:bg-white/5 transition-colors">
                                            <td className="py-2 pr-4 text-xs font-mono text-gray-400">{param.name}</td>
                                            <td className="py-2 text-xs font-mono text-signal text-right break-all">{formatParamValue(param.value)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right Column: C2 & Commands */}
                <div className="flex flex-col gap-6 overflow-hidden">
                    {/* C2 Profiles */}
                    <div className="border border-ghost/30 bg-black/40 flex-1 flex flex-col min-h-0">
                        <div className="p-3 border-b border-ghost/30 bg-white/5 flex items-center gap-2">
                            <Radio size={14} className="text-gray-400" />
                            <span className="font-mono text-xs font-bold text-signal tracking-wider">C2_CHANNELS ({config.c2Profiles.length})</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
                            {config.c2Profiles.map((p: any, idx: number) => {
                                const visibleC2Params = p.c2profileparameters.filter((param: any) => !shouldHide(param, p.c2profileparameters, config.os));
                                return (
                                    <div key={idx} className="border border-gray-800 bg-black/20 p-3">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-signal font-bold font-mono text-xs">{p.name}</span>
                                            <span className="text-[10px] text-gray-500">INST_ID: {p.instance_id}</span>
                                        </div>
                                        <div className="space-y-1">
                                            {visibleC2Params.map((param: any) => (
                                                <div key={param.name} className="flex justify-between text-[10px] border-b border-gray-800/50 last:border-0 pb-1 mb-1">
                                                    <span className="text-gray-500">{param.name}</span>
                                                    <span className="text-gray-300 font-mono text-right truncate max-w-[150px]">{formatParamValue(param.value)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Selected Commands */}
                    <div className="border border-ghost/30 bg-black/40 h-1/3 flex flex-col min-h-0">
                        <div className="p-3 border-b border-ghost/30 bg-white/5 flex items-center gap-2">
                            <Terminal size={14} className="text-gray-400" />
                            <span className="font-mono text-xs font-bold text-signal tracking-wider">COMMANDS ({config.commands.length})</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            <div className="flex flex-wrap gap-1">
                                {config.commands.map((cmd: string) => (
                                    <span key={cmd} className="px-2 py-1 border border-gray-700 bg-black/50 text-[10px] font-mono text-gray-300">
                                        {cmd}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="shrink-0 pt-4 border-t border-ghost/30">
                {!buildResult && (
                    <button
                        onClick={handleBuild}
                        disabled={isBuilding}
                        className="w-full py-4 bg-signal text-void font-bold font-mono text-lg hover:bg-white disabled:opacity-50 transition-all flex items-center justify-center gap-3 relative overflow-hidden group"
                    >
                        <div className="absolute inset-0 bg-white transform translate-y-full group-hover:translate-y-0 transition-transform duration-300 z-0"></div>
                        <span className="relative z-10 flex items-center gap-2">
                            {isBuilding ? <Disc className="animate-spin" /> : <Disc />} 
                            {isBuilding ? "COMPILING_PAYLOAD..." : "INITIATE_BUILD_SEQUENCE"}
                        </span>
                    </button>
                )}

                {buildResult && (
                    <div className={cn(
                        "p-4 border font-mono text-sm relative overflow-hidden",
                        buildResult.status === "success" ? "border-green-500 bg-green-900/20 text-green-400" : "border-red-500 bg-red-900/20 text-red-400"
                    )}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 font-bold text-lg">
                                {buildResult.status === "success" ? <CheckCircle size={24} /> : <AlertTriangle size={24} />}
                                {buildResult.status === "success" ? "PAYLOAD_BUILD_INITIATED" : "COMPILATION_ERROR"}
                            </div>
                            {buildResult.status === "success" && (
                                <div className="flex items-center gap-2 text-xs text-signal animate-pulse">
                                    REDIRECTING_TO_OPERATIONS <ArrowRight size={14} />
                                </div>
                            )}
                        </div>
                        {buildResult.error && <div className="mt-2 text-xs bg-black/50 p-2 border border-red-500/50">{buildResult.error}</div>}
                        {buildResult.uuid && (
                            <div className="mt-2 flex items-center gap-2">
                                <span className="text-xs opacity-70">UUID_REFERENCE:</span>
                                <span className="font-mono bg-black/30 px-2 py-1">{buildResult.uuid}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
