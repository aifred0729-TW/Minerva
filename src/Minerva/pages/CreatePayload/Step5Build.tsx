import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useSubscription } from '@apollo/client';
import { CREATE_PAYLOAD_MUTATION, BUILD_SUBSCRIPTION } from './queries';
import { Disc, CheckCircle, AlertTriangle, Terminal, Cpu, Radio, FileText, ArrowRight, Check, Circle, ChevronDown, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';

interface Step5Props {
    config: any;
}

const shouldHide = (param: any, allParams: any[], selectedOS: string) => {
    if (param.supported_os && param.supported_os.length > 0) {
        if (!param.supported_os.includes(selectedOS)) return true;
    }
    let conditions: any[] = [];
    if (param.hide_conditions) {
        if (typeof param.hide_conditions === 'string') {
            try { conditions = JSON.parse(param.hide_conditions); } catch (e) { conditions = []; }
        } else {
            conditions = param.hide_conditions;
        }
    }
    if (!conditions || conditions.length === 0) return false;
    for (const condition of conditions) {
        const targetParam = allParams.find(p => p.name === condition.name);
        if (!targetParam) continue;
        const targetValue = targetParam.value !== undefined ? targetParam.value : targetParam.default_value;
        const conditionValue = condition.value;
        const safeStr = (v: any) => String(v ?? "");
        let conditionMet = false;
        switch (condition.operand) {
            case "eq": conditionMet = safeStr(conditionValue) === safeStr(targetValue); break;
            case "neq": conditionMet = safeStr(conditionValue) !== safeStr(targetValue); break;
            case "in": conditionMet = !!(condition.choices && condition.choices.map(safeStr).includes(safeStr(targetValue))); break;
            case "nin": conditionMet = !!(condition.choices && !condition.choices.map(safeStr).includes(safeStr(targetValue))); break;
            case "lt": try { conditionMet = parseFloat(targetValue) < parseFloat(conditionValue); } catch (e) {} break;
            case "gt": try { conditionMet = parseFloat(targetValue) > parseFloat(conditionValue); } catch (e) {} break;
            case "lte": try { conditionMet = parseFloat(targetValue) <= parseFloat(conditionValue); } catch (e) {} break;
            case "gte": try { conditionMet = parseFloat(targetValue) >= parseFloat(conditionValue); } catch (e) {} break;
            case "sw": conditionMet = safeStr(targetValue).startsWith(safeStr(conditionValue)); break;
            case "ew": conditionMet = safeStr(targetValue).endsWith(safeStr(conditionValue)); break;
            case "co": conditionMet = safeStr(targetValue).includes(safeStr(conditionValue)); break;
            case "nco": conditionMet = !safeStr(targetValue).includes(safeStr(conditionValue)); break;
        }
        if (conditionMet) return true;
    }
    return false;
};

const uploadFile = async (file: File, comment: string): Promise<string | null> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("comment", comment);
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
        if (data.status === "success" || data.agent_file_id) return data.agent_file_id;
        return null;
    } catch (e) {
        return null;
    }
};

const processParamValue = async (param: any, contextStr: string) => {
    let val = param.value;
    if (val === undefined || val === null) val = param.default_value;

    if (["Array", "ChooseMultiple", "TypedArray", "FileMultiple"].includes(param.parameter_type)) {
        if (!val || val === "") val = [];
        else if (!Array.isArray(val)) {
            if (typeof val === 'string') {
                try { const parsed = JSON.parse(val); val = Array.isArray(parsed) ? parsed : []; } catch (e) { val = []; }
            } else { val = []; }
        }
    } else if (val === undefined || val === null) {
        val = "";
    }

    if (param.parameter_type === "File") {
        if (val instanceof File) {
            const uuid = await uploadFile(val, `Uploaded as ${contextStr} parameter: ${param.name}`);
            if (uuid) return uuid;
            throw new Error(`Failed to upload file for ${param.name}`);
        }
        // Handle legacy UUID format: {name: "uuid", legacy: true} or {name: "uuid"}
        if (val && typeof val === 'object' && val.name && !(val instanceof File)) {
            return val.name;
        }
    }

    if (param.parameter_type === "FileMultiple" && Array.isArray(val)) {
        const newValues = [];
        for (const item of val) {
            if (item instanceof File) {
                const uuid = await uploadFile(item, `Uploaded as ${contextStr} parameter: ${param.name}`);
                if (uuid) newValues.push(uuid);
                else throw new Error(`Failed to upload file for ${param.name}`);
            } else { newValues.push(item); }
        }
        return newValues;
    }

    const complexTypes = ["Array", "ChooseMultiple", "TypedArray", "FileMultiple", "Dictionary"];
    if (complexTypes.includes(param.parameter_type) && typeof val === 'string') {
        try {
            const parsed = JSON.parse(val);
            if (typeof parsed === 'object' && parsed !== null) val = parsed;
        } catch (e) {}
    }

    if (param.parameter_type === "Dictionary" && Array.isArray(val)) {
        val = val.reduce((prev: any, cur: any) => {
            if (cur.default_show) return { ...prev, [cur.name]: cur.value };
            return { ...prev };
        }, {});
    }

    switch (param.parameter_type) {
        case "Number":
            if (val === "" && param.default_value !== undefined) return Number(param.default_value);
            return Number(val);
        case "Boolean":
            if (String(val).toLowerCase() === "false") return false;
            if (String(val).toLowerCase() === "true") return true;
            return Boolean(val);
        case "String": case "ChooseOne": case "ChooseOneCustom": case "Date":
            if (typeof val === 'object' && val !== null) return JSON.stringify(val);
            return String(val);
        case "Array": case "ChooseMultiple": case "TypedArray": case "FileMultiple":
            return Array.isArray(val) ? val : [];
        case "MapArray":
            // MapArray must be a JS object (key -> array) for Go to receive as map[string]interface{}
            if (typeof val === 'object' && val !== null && !Array.isArray(val)) return val;
            if (Array.isArray(val)) {
                // Convert [[key, [val1, val2]], ...] -> {key: [val1, val2]}
                return val.reduce((prev: any, cur: any) => {
                    if (Array.isArray(cur) && cur.length >= 2) return { ...prev, [cur[0]]: cur[1] };
                    return prev;
                }, {});
            }
            if (typeof val === 'string' && val !== '') {
                try {
                    const parsed = JSON.parse(val);
                    return (parsed && typeof parsed === 'object') ? parsed : {};
                } catch (e) { return {}; }
            }
            return {};
        default:
            return val;
    }
};

interface BuildStep {
    step_name: string;
    step_number: number;
    step_success: boolean | null;
    step_skip: boolean;
    start_time: string | null;
    end_time: string | null;
    step_stdout: string;
    step_stderr: string;
    id: number;
}

const BuildStepIcon = ({ step }: { step: BuildStep }) => {
    if (step.step_skip) return <Circle size={14} className="text-gray-500" />;
    if (step.step_success === true) return <Check size={14} className="text-green-400" />;
    if (step.step_success === false) return <AlertTriangle size={14} className="text-red-400" />;
    if (step.start_time && !step.end_time) return <Disc size={14} className="text-signal animate-spin" />;
    return <Circle size={14} className="text-gray-600" />;
};

const BuildStepDuration = ({ step }: { step: BuildStep }) => {
    if (!step.start_time) return <span className="text-gray-600 text-[10px] font-mono">PENDING</span>;
    if (step.start_time && !step.end_time) return <span className="text-signal text-[10px] font-mono animate-pulse">RUNNING</span>;
    if (step.start_time && step.end_time) {
        const ms = new Date(step.end_time).getTime() - new Date(step.start_time).getTime();
        return <span className="text-gray-400 text-[10px] font-mono">{(ms / 1000).toFixed(1)}s</span>;
    }
    return null;
};

export function Step5Build({ config }: Step5Props) {
    const navigate = useNavigate();
    const [filename, setFilename] = useState(`${config.payloadType}.bin`);
    const [description, setDescription] = useState(`Created via Minerva`);
    const [isBuilding, setIsBuilding] = useState(false);
    const [buildResult, setBuildResult] = useState<unknown>(null);
    const [buildUUID, setBuildUUID] = useState<string | null>(null);
    const [buildFromNow] = useState(() => new Date().toISOString());
    const [livePayloadData, setLivePayloadData] = useState<unknown>(null);
    const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
    const [showErrorDetails, setShowErrorDetails] = useState(false);
    const redirectTimerRef = useRef<any>(null);

    const [createPayload] = useMutation(CREATE_PAYLOAD_MUTATION);

    useSubscription(BUILD_SUBSCRIPTION, {
        variables: { fromNow: buildFromNow },
        skip: !buildUUID,
        onData: ({ data }) => {
            const stream = data?.data?.payload_stream;
            if (!stream || stream.length === 0) return;
            const payload = stream[0];
            if (payload.uuid !== buildUUID) return;
            setLivePayloadData({ ...payload });
        }
    });

    useEffect(() => {
        const outputTypeParam = config.buildParameters.find((p: any) => p.name === "output_type");
        if (outputTypeParam) {
            let extension = ".bin";
            const val = outputTypeParam.value || outputTypeParam.default_value;
            const valStr = String(val).toLowerCase();
            if (valStr === "winexe" || valStr.includes("exe")) extension = ".exe";
            else if (valStr === "serviceexe") extension = ".exe";
            else if (valStr === "shellcode") extension = ".bin";
            else if (valStr === "reflectivedll" || valStr === "dll" || valStr.includes("dll")) extension = ".dll";
            else if (valStr === "mach-o" || valStr.includes("mach")) extension = "";
            else if (valStr === "elf" || valStr.includes("elf")) extension = "";
            if (filename === `${config.payloadType}.bin` || filename.startsWith(config.payloadType)) {
                setFilename(`${config.payloadType}${extension}`);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.buildParameters, config.payloadType]);

    useEffect(() => {
        const phase = livePayloadData?.build_phase;
        if (phase === 'success') {
            if (!redirectTimerRef.current) {
                redirectTimerRef.current = setTimeout(() => navigate('/payloads'), 2000);
            }
        }
        return () => {
            if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
        };
    }, [livePayloadData?.build_phase, navigate]);

    const handleBuild = async () => {
        setIsBuilding(true);
        setBuildResult(null);
        setLivePayloadData(null);
        setBuildUUID(null);
        redirectTimerRef.current = null;

        try {
            const buildParameters = [];
            for (const p of config.buildParameters) {
                if (!shouldHide(p, config.buildParameters, config.os)) {
                    let processedValue = await processParamValue(p, "build");
                    // Final safety net: ensure Array/ChooseMultiple/TypedArray/FileMultiple
                    // are always proper JS arrays (never strings) before JSON.stringify
                    if (["Array", "ChooseMultiple", "TypedArray", "FileMultiple"].includes(p.parameter_type)) {
                        if (!Array.isArray(processedValue)) {
                            if (typeof processedValue === 'string' && processedValue !== '') {
                                try {
                                    const parsed = JSON.parse(processedValue);
                                    processedValue = Array.isArray(parsed) ? parsed : [];
                                } catch (e) { processedValue = []; }
                            } else { processedValue = []; }
                        }
                    }
                    buildParameters.push({ name: p.name, value: processedValue });
                }
            }

            const c2Profiles = [];
            for (const p of config.c2Profiles) {
                const visibleParams = p.c2profileparameters.filter((param: any) => !shouldHide(param, p.c2profileparameters, config.os));
                const params: any = {};
                for (const param of visibleParams) {
                    let processedValue = await processParamValue(param, `c2 (${p.name})`);
                    if (["Array", "ChooseMultiple", "TypedArray", "FileMultiple"].includes(param.parameter_type)) {
                        if (!Array.isArray(processedValue)) {
                            if (typeof processedValue === 'string' && processedValue !== '') {
                                try {
                                    const parsed = JSON.parse(processedValue);
                                    processedValue = Array.isArray(parsed) ? parsed : [];
                                } catch (e) { processedValue = []; }
                            } else { processedValue = []; }
                        }
                    }
                    params[param.name] = processedValue;
                }
                c2Profiles.push({ c2_profile: p.name, c2_profile_parameters: params });
            }

            const payloadDefinition = {
                selected_os: config.os,
                payload_type: config.payloadType,
                filename,
                description,
                commands: config.commands,
                build_parameters: buildParameters,
                c2_profiles: c2Profiles
            };

            const { data } = await createPayload({ variables: { payload: JSON.stringify(payloadDefinition) } });

            if (data.createPayload.status === "error") {
                setBuildResult(data.createPayload);
            } else {
                setBuildResult(data.createPayload);
                setBuildUUID(data.createPayload.uuid);
            }
        } catch (e: unknown) {
            setBuildResult({ status: 'error', error: e.message || "Unknown error occurred" });
        } finally {
            setIsBuilding(false);
        }
    };

    const formatParamValue = (val: any) => {
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
        if (typeof val === 'object') {
            if (val instanceof File) return `FILE: ${val.name}`;
            if (val && val.name) return `FILE_UUID: ${val.name}`;
            return JSON.stringify(val);
        }
        return String(val);
    };

    const visibleBuildParams = config.buildParameters.filter((p: any) => !shouldHide(p, config.buildParameters, config.os));
    const buildSteps: BuildStep[] = livePayloadData?.payload_build_steps || [];
    const buildPhase = livePayloadData?.build_phase;
    const fileId = livePayloadData?.filemetum?.agent_file_id;

    const toggleStepExpand = (id: number) => {
        setExpandedSteps(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    return (
        <div className="h-full flex flex-col gap-6 overflow-hidden">
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
                {/* Left: Core Info + Build Params */}
                <div className="flex flex-col gap-6 overflow-hidden">
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
                                <input type="text" value={filename} onChange={(e) => setFilename(e.target.value)}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal font-mono text-xs focus:border-signal outline-none transition-colors" />
                            </div>
                            <div className="col-span-2">
                                <div className="text-[10px] text-gray-500 mb-1">DESCRIPTION</div>
                                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal font-mono text-xs focus:border-signal outline-none transition-colors" />
                            </div>
                        </div>
                    </div>

                    <div className="border border-ghost/30 bg-black/40 flex-1 flex flex-col min-h-0">
                        <div className="p-3 border-b border-ghost/30 bg-white/5 flex items-center gap-2">
                            <FileText size={14} className="text-gray-400" />
                            <span className="font-mono text-xs font-bold text-signal tracking-wider">BUILD_PARAMETERS</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 cyber-scrollbar">
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

                {/* Right: Build Progress + C2 + Commands */}
                <div className="flex flex-col gap-6 overflow-hidden">
                    {/* Build Progress Panel */}
                    {buildUUID && (
                        <div className="border border-ghost/30 bg-black/40 flex flex-col shrink-0">
                            <div className="p-3 border-b border-ghost/30 bg-white/5 flex items-center gap-2">
                                <Disc size={14} className={cn("text-gray-400", buildPhase === "building" && "animate-spin text-signal")} />
                                <span className="font-mono text-xs font-bold text-signal tracking-wider">BUILD_PROGRESS</span>
                                <span className={cn(
                                    "ml-auto text-[10px] font-mono px-2 py-0.5 border",
                                    buildPhase === "success" ? "border-green-500 text-green-400" :
                                    buildPhase === "error" ? "border-red-500 text-red-400" :
                                    buildPhase === "building" ? "border-signal text-signal animate-pulse" :
                                    "border-gray-700 text-gray-400"
                                )}>
                                    {buildPhase ? buildPhase.toUpperCase() : "QUEUED"}
                                </span>
                            </div>
                            <div className="p-3 space-y-0.5 max-h-48 overflow-y-auto cyber-scrollbar">
                                {buildSteps.map((step) => (
                                    <div key={step.id}>
                                        <div
                                            className="flex items-center gap-2 py-1 px-1 rounded cursor-pointer hover:bg-white/5"
                                            onClick={() => (step.step_stdout || step.step_stderr) && toggleStepExpand(step.id)}
                                        >
                                            <BuildStepIcon step={step} />
                                            <span className={cn(
                                                "flex-1 text-xs font-mono",
                                                step.step_skip ? "text-gray-600 line-through" :
                                                step.step_success === true ? "text-green-400" :
                                                step.step_success === false ? "text-red-400" :
                                                step.start_time ? "text-signal" : "text-gray-600"
                                            )}>
                                                [{step.step_number}] {step.step_name}
                                            </span>
                                            <BuildStepDuration step={step} />
                                            {(step.step_stdout || step.step_stderr) && (
                                                expandedSteps.has(step.id)
                                                    ? <ChevronDown size={12} className="text-gray-500" />
                                                    : <ChevronRight size={12} className="text-gray-500" />
                                            )}
                                        </div>
                                        {expandedSteps.has(step.id) && (
                                            <div className="ml-5 mb-1 space-y-1">
                                                {step.step_stdout && <pre className="text-[10px] font-mono text-gray-400 bg-black/50 p-2 overflow-x-auto">{step.step_stdout}</pre>}
                                                {step.step_stderr && <pre className="text-[10px] font-mono text-red-400 bg-black/50 p-2 overflow-x-auto">{step.step_stderr}</pre>}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {buildSteps.length === 0 && <div className="text-xs font-mono text-gray-600 text-center py-2">AWAITING_BUILD_STEPS...</div>}
                            </div>
                            {buildPhase === "success" && fileId && (
                                <div className="p-3 border-t border-green-500/20 bg-green-900/10 flex items-center gap-2">
                                    <CheckCircle size={14} className="text-green-400" />
                                    <span className="text-xs font-mono text-green-400 flex-1">PAYLOAD_READY</span>
                                    <a href={`/direct/download/${fileId}`} target="_blank" rel="noreferrer"
                                        className="text-xs font-mono text-signal border border-signal px-3 py-1 hover:bg-signal hover:text-void transition-colors">
                                        DOWNLOAD
                                    </a>
                                </div>
                            )}
                            {buildPhase === "error" && (
                                <div className="p-3 border-t border-red-500/20 bg-red-900/10">
                                    <button onClick={() => setShowErrorDetails(!showErrorDetails)}
                                        className="flex items-center gap-2 text-xs font-mono text-red-400 mb-2 hover:text-red-300 transition-colors">
                                        <AlertTriangle size={12} /> BUILD_FAILED
                                        {showErrorDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                    </button>
                                    {showErrorDetails && (
                                        <div className="space-y-1">
                                            {livePayloadData?.build_message && <pre className="text-[10px] font-mono text-gray-400 bg-black/50 p-2 overflow-x-auto">{livePayloadData.build_message}</pre>}
                                            {livePayloadData?.build_stderr && <pre className="text-[10px] font-mono text-red-400 bg-black/50 p-2 overflow-x-auto">{livePayloadData.build_stderr}</pre>}
                                            {livePayloadData?.build_stdout && <pre className="text-[10px] font-mono text-gray-400 bg-black/50 p-2 overflow-x-auto">{livePayloadData.build_stdout}</pre>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* C2 Profiles */}
                    <div className="border border-ghost/30 bg-black/40 flex-1 flex flex-col min-h-0">
                        <div className="p-3 border-b border-ghost/30 bg-white/5 flex items-center gap-2">
                            <Radio size={14} className="text-gray-400" />
                            <span className="font-mono text-xs font-bold text-signal tracking-wider">C2_CHANNELS ({config.c2Profiles.length})</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 cyber-scrollbar space-y-4">
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

                    {/* Commands */}
                    <div className="border border-ghost/30 bg-black/40 h-1/4 flex flex-col min-h-0">
                        <div className="p-3 border-b border-ghost/30 bg-white/5 flex items-center gap-2">
                            <Terminal size={14} className="text-gray-400" />
                            <span className="font-mono text-xs font-bold text-signal tracking-wider">COMMANDS ({config.commands.length})</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 cyber-scrollbar">
                            <div className="flex flex-wrap gap-1">
                                {config.commands.map((cmd: string) => (
                                    <span key={cmd} className="px-2 py-1 border border-gray-700 bg-black/50 text-[10px] font-mono text-gray-300">{cmd}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="shrink-0 pt-4 border-t border-ghost/30">
                {!buildUUID && (
                    <button onClick={handleBuild} disabled={isBuilding}
                        className="w-full py-4 bg-signal text-void font-bold font-mono text-lg hover:bg-white disabled:opacity-50 transition-all flex items-center justify-center gap-3 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-white transform translate-y-full group-hover:translate-y-0 transition-transform duration-300 z-0"></div>
                        <span className="relative z-10 flex items-center gap-2">
                            {isBuilding ? <Disc className="animate-spin" /> : <Disc />}
                            {isBuilding ? "SUBMITTING..." : "INITIATE_BUILD_SEQUENCE"}
                        </span>
                    </button>
                )}

                {buildUUID && buildPhase !== "error" && (
                    <div className={cn(
                        "p-4 border font-mono text-sm",
                        buildPhase === "success" ? "border-green-500 bg-green-900/20 text-green-400" :
                        "border-signal bg-signal/10 text-signal"
                    )}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 font-bold text-base">
                                {buildPhase === "success" ? <CheckCircle size={20} /> : <Disc size={20} className="animate-spin" />}
                                {buildPhase === "success" ? "PAYLOAD_BUILD_COMPLETE" : "BUILD_IN_PROGRESS"}
                            </div>
                            {buildPhase === "success" && (
                                <div className="flex items-center gap-2 text-xs text-signal animate-pulse">
                                    REDIRECTING <ArrowRight size={14} />
                                </div>
                            )}
                        </div>
                        {buildResult?.uuid && (
                            <div className="mt-2 flex items-center gap-2">
                                <span className="text-xs opacity-70">UUID:</span>
                                <span className="font-mono bg-black/30 px-2 py-1 text-xs">{buildResult.uuid}</span>
                            </div>
                        )}
                    </div>
                )}

                {buildUUID && buildPhase === "error" && (
                    <button onClick={handleBuild}
                        className="w-full py-3 border border-signal text-signal font-bold font-mono text-sm hover:bg-signal hover:text-void transition-all flex items-center justify-center gap-2">
                        <Disc size={16} /> RETRY_BUILD
                    </button>
                )}

                {!buildUUID && buildResult?.status === 'error' && (
                    <div className="p-4 border border-red-500 bg-red-900/20 text-red-400 font-mono text-sm">
                        <div className="flex items-center gap-2 font-bold"><AlertTriangle size={20} /> SUBMISSION_ERROR</div>
                        {buildResult.error && <div className="mt-2 text-xs bg-black/50 p-2 border border-red-500/50">{buildResult.error}</div>}
                    </div>
                )}
            </div>
        </div>
    );
}
