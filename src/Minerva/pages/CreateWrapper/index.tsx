import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { gql, useQuery, useMutation, useSubscription, useLazyQuery } from '@apollo/client';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/theme-monokai';
import { UploadTaskFile } from '../../../components/MythicComponents/MythicFileUpload';
import {
    Package, ChevronRight, ChevronLeft, Check, Box, Loader, AlertCircle,
    X, Pencil, RotateCcw, ChevronDown, ChevronUp, CheckCircle, XCircle,
    Minus, RefreshCw, Upload, Copy, Info, Plus, Trash2, Hash, Calendar, FileText,
} from 'lucide-react';
import { Sidebar } from '../../components/Sidebar';
import { cn, b64DecodeUnicode } from '../../lib/utils';
import { toLocalTime } from '../../../components/utilities/Time';
import { useAppStore } from '../../store';
import { snackActions } from '../../../components/utilities/Snackbar';
import { meState } from '../../../cache';
import { useReactiveVar } from '@apollo/client';

// ============================================================
// hide_conditions operand constants (mirrors OldReactUI)
// ============================================================
const HC_EQ  = 'eq';
const HC_NEQ = 'neq';
const HC_IN  = 'in';
const HC_NIN = 'nin';
const HC_LT  = 'lt';
const HC_GT  = 'gt';
const HC_LTE = 'lte';
const HC_GTE = 'gte';
const HC_SW  = 'sw';
const HC_EW  = 'ew';
const HC_CO  = 'co';
const HC_NCO = 'nco';

// ============================================================
// GraphQL
// ============================================================
const GET_WRAPPER_PAYLOAD_TYPES = gql`
query GetWrapperPayloadTypes {
    payloadtype(where: {deleted: {_eq: false}, wrapper: {_eq: true}}) {
        id name supported_os note author semver file_extension container_running
        buildparameters(where: {deleted: {_eq: false}}, order_by: {ui_position: asc}) {
            id name description parameter_type default_value required choices
            group_name verifier_regex randomize format_string supported_os ui_position
            hide_conditions
        }
        wrap_these_payload_types { wrapped { id name } }
        c2_parameter_deviations
        agent_type
    }
}
`;

// Per-wrapper-type lazy query for compatible payloads (DB-side filtering)
const GET_WRAPPABLE_BY_TYPE = gql`
query GetWrappableByType($payloadTypeId: Int!) {
    payloadtype_by_pk(id: $payloadTypeId) {
        wrap_these_payload_types {
            wrapped {
                name
                payloads(where: {_and: [{_or: [{auto_generated: {_eq: false}}, {auto_generated: {_is_null: true}}]}, {build_phase: {_eq: "success"}}, {deleted: {_eq: false}}]}, order_by: {id: desc}) {
                    id uuid description build_phase creation_time
                    payloadtype { id name supported_os }
                    filemetum { filename_text agent_file_id }
                    c2profileparametersinstances { c2profile { name } }
                    buildparameterinstances { build_parameter_id value }
                    payload_build_steps(order_by: {step_number: asc}) {
                        step_number step_name step_success step_skip
                    }
                }
            }
        }
    }
}
`;

// For "Copy From Existing" in Step1
const GET_EXISTING_WRAPPERS = gql`
query GetExistingWrapperPayloads {
    payload(
        where: {deleted: {_eq: false}, _or: [{auto_generated: {_eq: false}}, {auto_generated: {_is_null: true}}], payloadtype: {wrapper: {_eq: true}}}
        order_by: {id: desc}
        limit: 30
    ) {
        id uuid description
        payloadtype { id name }
        filemetum { filename_text }
        buildparameterinstances { build_parameter_id value }
    }
}
`;

const CREATE_WRAPPER = gql`
mutation createPayload($payload: String!) {
    createPayload(payloadDefinition: $payload) {
        error status uuid
    }
}
`;

const EXPORT_PAYLOAD_CONFIG = gql`
query ExportPayloadConfig($uuid: String!) {
    exportPayloadConfig(uuid: $uuid) {
        status error config
    }
}
`;

const SUBSCRIBE_PAYLOAD_BUILD = gql`
subscription SubscribePayloadBuild($uuid: String!, $fromNow: timestamp!) {
    payload_stream(
        batch_size: 1
        cursor: { initial_value: { timestamp: $fromNow }, ordering: ASC }
        where: { uuid: { _eq: $uuid }, deleted: { _eq: false } }
    ) {
        uuid build_phase build_message build_stderr build_stdout
        filemetum { agent_file_id }
        payload_build_steps(order_by: { step_number: asc }) {
            step_number step_name step_success step_skip
            start_time end_time step_stdout step_stderr
        }
    }
}
`;

// ============================================================
// Interfaces
// ============================================================
interface HideCondition {
    name: string;
    operand: string;
    value?: string;
    choices?: string[];
}

interface BuildParam {
    id: number;
    name: string;
    description: string;
    parameter_type: string;
    default_value: any;
    required: boolean;
    choices: string[];
    group_name?: string;
    verifier_regex?: string;
    randomize?: boolean;
    format_string?: string;
    supported_os?: string[] | null;
    ui_position?: number;
    hide_conditions?: HideCondition[] | null;
}

interface PayloadType {
    id: number;
    name: string;
    supported_os: string[];
    note: string;
    author: string;
    semver: string;
    container_running: boolean;
    file_extension: string;
    buildparameters: BuildParam[];
    wrap_these_payload_types: Array<{ wrapped: { id: number; name: string } }>;
}

interface MiniStep {
    step_number: number;
    step_name: string;
    step_success: boolean | null;
    step_skip: boolean;
}

interface Payload {
    id: number;
    uuid: string;
    description: string;
    build_phase: string;
    creation_time: string;
    payloadtype: { id: number; name: string; supported_os: string[] };
    filemetum: { filename_text: string; agent_file_id: string };
    c2profileparametersinstances: Array<{ c2profile: { name: string } }>;
    buildparameterinstances: Array<{ build_parameter_id: number; value: string }>;
    payload_build_steps?: MiniStep[];
}

interface BuildStepFull extends MiniStep {
    step_stdout: string;
    step_stderr: string;
}

interface ExistingWrapper {
    id: number;
    uuid: string;
    description: string;
    payloadtype: { id: number; name: string };
    filemetum?: { filename_text: string };
    buildparameterinstances: Array<{ build_parameter_id: number; value: string }>;
}

// ============================================================
// Helpers
// ============================================================

/** Decodes base64 filename safely */
const decodeFilename = (b64: string | undefined): string => {
    if (!b64) return '';
    try { return b64DecodeUnicode(b64); } catch { return b64; }
};

/**
 * Evaluates whether a param should be hidden given current parameter values and selected OS.
 */
function shouldHideParam(
    param: BuildParam,
    allParams: BuildParam[],
    values: Record<string, any>,
    selectedOS: string
): boolean {
    // Per-param OS filter (Item 2)
    if ((param.supported_os?.length ?? 0) > 0 && selectedOS) {
        if (!param.supported_os!.includes(selectedOS)) return true;
    }
    // hide_conditions evaluation (Item 1)
    for (const cond of (param.hide_conditions ?? [])) {
        const targetParam = allParams.find(p => p.name === cond.name);
        if (!targetParam) continue;
        const targetVal = String(values[cond.name] ?? targetParam.default_value ?? '');
        let hide = false;
        switch (cond.operand) {
            case HC_EQ:  hide = targetVal === String(cond.value ?? ''); break;
            case HC_NEQ: hide = targetVal !== String(cond.value ?? ''); break;
            case HC_IN:  hide = (cond.choices ?? []).includes(targetVal); break;
            case HC_NIN: hide = !(cond.choices ?? []).includes(targetVal); break;
            case HC_LT:  try { hide = parseInt(targetVal) < parseInt(cond.value ?? '0'); } catch{} break;
            case HC_GT:  try { hide = parseInt(targetVal) > parseInt(cond.value ?? '0'); } catch{} break;
            case HC_LTE: try { hide = parseInt(targetVal) <= parseInt(cond.value ?? '0'); } catch{} break;
            case HC_GTE: try { hide = parseInt(targetVal) >= parseInt(cond.value ?? '0'); } catch{} break;
            case HC_SW:  hide = targetVal.startsWith(cond.value ?? ''); break;
            case HC_EW:  hide = targetVal.endsWith(cond.value ?? ''); break;
            case HC_CO:  hide = targetVal.includes(cond.value ?? ''); break;
            case HC_NCO: hide = !targetVal.includes(cond.value ?? ''); break;
        }
        if (hide) return true;
    }
    return false;
}

/**
 * Groups *visible* build params by group_name.
 * Applies supported_os + hide_conditions filtering (Items 1 & 2).
 */
function groupBuildParams(
    params: BuildParam[],
    values: Record<string, any> = {},
    selectedOS: string = ''
): Array<{ group: string; params: BuildParam[] }> {
    const map: Record<string, BuildParam[]> = {};
    for (const p of params) {
        if (shouldHideParam(p, params, values, selectedOS)) continue;
        const g = p.group_name || 'Configuration';
        if (!map[g]) map[g] = [];
        map[g].push(p);
    }
    return Object.entries(map).map(([group, params]) => ({ group, params }));
}

/** Formats a param value for display in the summary card. */
function formatParamValue(param: BuildParam, val: any): string {
    if (val === undefined || val === null || val === '') return '—';
    if (val instanceof File) return val.name;
    if (param.parameter_type === 'Boolean') return String(val) === 'true' || val === true ? 'Enabled' : 'Disabled';
    if (param.parameter_type === 'Array' || param.parameter_type === 'ChooseMultiple') {
        if (!Array.isArray(val) || val.length === 0) return '—';
        return val.join(', ');
    }
    if (param.parameter_type === 'FileMultiple') {
        if (!Array.isArray(val) || val.length === 0) return '—';
        return val.map((v: any) => v instanceof File ? v.name : String(v)).join(', ');
    }
    if (param.parameter_type === 'TypedArray') {
        if (!Array.isArray(val) || val.length === 0) return '—';
        return val.map((v: any) => Array.isArray(v) ? v[1] : String(v)).join(', ');
    }
    if (param.parameter_type === 'MapArray') {
        if (!Array.isArray(val) || val.length === 0) return '—';
        return val.map((v: any) => `${v[0]}:[${(v[1] || []).join(',')}]`).join(' | ');
    }
    if (param.parameter_type === 'Dictionary') {
        if (!Array.isArray(val) || val.length === 0) return '—';
        return val.map((v: any) => `${v.name}=${v.value}`).join(', ');
    }
    return String(val);
}

// ============================================================
// AgentIcon — /agent_icons/{name}.svg with Package fallback
// ============================================================
const AgentIcon: React.FC<{ name: string; size?: number; className?: string }> = ({ name, size = 32, className }) => {
    const [failed, setFailed] = useState(false);
    if (failed) return <Package size={size} className={cn("text-signal/40", className)} />;
    return (
        <img
            src={`/agent_icons/${name}.svg`}
            alt={name}
            width={size}
            height={size}
            className={cn("object-contain flex-shrink-0", className)}
            onError={() => setFailed(true)}
        />
    );
};

// ============================================================
// MiniStepProgress — compact build step dots for Step2 cards
// ============================================================
const MiniStepProgress: React.FC<{ steps: MiniStep[] }> = ({ steps }) => {
    if (!steps || steps.length === 0) return null;
    const done = steps.filter(s => s.step_success === true || s.step_skip).length;
    const err = steps.filter(s => s.step_success === false).length;
    return (
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {steps.map(step => (
                <div
                    key={step.step_number}
                    title={step.step_name}
                    className={cn(
                        "w-2 h-2 rounded-full transition-colors",
                        step.step_skip ? "bg-ghost/30" :
                        step.step_success === true ? "bg-matrix" :
                        step.step_success === false ? "bg-alert" :
                        "bg-signal/30 animate-pulse"
                    )}
                />
            ))}
            <span className="text-[10px] text-ghost/40 font-mono ml-1">
                {done}/{steps.length}
                {err > 0 && <span className="text-alert ml-1">({err} err)</span>}
            </span>
        </div>
    );
};

// ============================================================
// PayloadDetailModal — Item 4: detailed payload info modal
// ============================================================
const PayloadDetailModal: React.FC<{ payload: Payload; onClose: () => void }> = ({ payload, onClose }) => {
    const fname = decodeFilename(payload.filemetum?.filename_text) || payload.uuid.slice(0, 12);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-void border border-ghost/30 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto z-10"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-ghost/20">
                    <div className="flex items-center gap-3">
                        <AgentIcon name={payload.payloadtype.name} size={24} />
                        <div>
                            <p className="font-mono text-signal font-bold text-sm">{fname}</p>
                            <p className="text-xs text-ghost/60">{payload.payloadtype.name} · {payload.uuid.slice(0, 8)}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-ghost hover:text-signal transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-4">
                    {/* Status & OS */}
                    <div className="flex flex-wrap gap-2">
                        <span className={cn(
                            "px-2 py-0.5 text-xs rounded font-mono",
                            payload.build_phase === 'success' ? "bg-matrix/20 text-matrix" :
                            payload.build_phase === 'error' ? "bg-alert/20 text-alert" :
                            "bg-signal/20 text-signal"
                        )}>{payload.build_phase}</span>
                        {payload.payloadtype.supported_os.map(os => (
                            <span key={os} className="px-2 py-0.5 bg-signal/15 text-signal text-xs rounded">{os}</span>
                        ))}
                    </div>

                    {/* Description */}
                    {payload.description && (
                        <p className="text-sm text-ghost">{payload.description}</p>
                    )}

                    {/* Creation time — Item 3: respect operator UTC preference */}
                    <p className="text-xs text-ghost/50">
                        Created: {toLocalTime(payload.creation_time, false)}
                    </p>

                    {/* C2 Profiles */}
                    {payload.c2profileparametersinstances.length > 0 && (
                        <div>
                            <p className="text-xs text-ghost/60 uppercase tracking-widest mb-2 font-mono">C2 Profiles</p>
                            <div className="flex flex-wrap gap-1">
                                {[...new Set(payload.c2profileparametersinstances.map(c => c.c2profile.name))].map(name => (
                                    <span key={name} className="px-2 py-0.5 bg-signal/15 text-signal text-xs rounded font-mono">{name}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Build parameters */}
                    {payload.buildparameterinstances.length > 0 && (
                        <div>
                            <p className="text-xs text-ghost/60 uppercase tracking-widest mb-2 font-mono">Build Parameters</p>
                            <div className="space-y-1">
                                {payload.buildparameterinstances.map((bpi, i) => (
                                    <div key={i} className="flex justify-between text-xs">
                                        <span className="text-ghost font-mono">{bpi.build_parameter_id}</span>
                                        <span className="text-signal font-mono truncate max-w-[55%] text-right">{String(bpi.value ?? '—')}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Build steps progress */}
                    {(payload.payload_build_steps?.length ?? 0) > 0 && (
                        <div>
                            <p className="text-xs text-ghost/60 uppercase tracking-widest mb-2 font-mono">Build Steps</p>
                            <MiniStepProgress steps={payload.payload_build_steps!} />
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

// ============================================================
// StepIndicator
// ============================================================
const StepIndicator: React.FC<{
    step: number;
    currentStep: number;
    label: string;
    onClick?: () => void;
}> = ({ step, currentStep, label, onClick }) => {
    const isActive = step === currentStep;
    const isCompleted = step < currentStep;
    const isJumpable = !isCompleted && !isActive && !!onClick;
    return (
        <div
            className={cn("flex items-center", (isCompleted || isJumpable) && onClick ? "cursor-pointer" : "")}
            onClick={(isCompleted || isJumpable) && onClick ? onClick : undefined}
        >
            <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                isCompleted ? "bg-matrix border-matrix text-void" :
                isActive ? "border-signal text-signal" :
                isJumpable ? "border-signal/50 text-signal/60 hover:border-signal hover:bg-signal/10" :
                "border-ghost/30 text-ghost",
                isCompleted && onClick ? "hover:bg-matrix/80" : ""
            )}>
                {isCompleted ? <Check size={20} /> : step + 1}
            </div>
            <span className={cn(
                "ml-2 text-sm hidden md:block",
                isActive ? "text-signal font-bold" :
                isCompleted ? "text-matrix" :
                isJumpable ? "text-signal/60" :
                "text-ghost"
            )}>
                {label}
            </span>
        </div>
    );
};

// EditButton
const EditButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
    <button
        onClick={onClick}
        className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs border border-signal/40 text-signal/70 rounded hover:border-signal hover:text-signal transition-colors"
    >
        <Pencil size={11} /> {label}
    </button>
);

// ============================================================
// BuildProgressPanel
// ============================================================
const BuildProgressPanel: React.FC<{
    uuid: string;
    fromNow: string;
    onComplete?: (uuid: string) => void;
}> = ({ uuid, fromNow, onComplete }) => {
    const [buildData, setBuildData] = useState<{
        build_phase: string;
        build_message: string;
        build_stderr: string;
        build_stdout: string;
        agent_file_id?: string;
        steps: BuildStepFull[];
    } | null>(null);
    const [expandedStep, setExpandedStep] = useState<number | null>(null);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const notifiedRef = useRef(false);

    useSubscription(SUBSCRIBE_PAYLOAD_BUILD, {
        variables: { uuid, fromNow },
        onData: ({ data }) => {
            const stream = data.data?.payload_stream;
            if (!stream || stream.length === 0) return;
            const p = stream[0];
            setBuildData({
                build_phase: p.build_phase,
                build_message: p.build_message || '',
                build_stderr: p.build_stderr || '',
                build_stdout: p.build_stdout || '',
                agent_file_id: p.filemetum?.agent_file_id,
                steps: p.payload_build_steps || [],
            });
            if (p.build_phase === 'success' && !notifiedRef.current) {
                notifiedRef.current = true;
                const fileId = p.filemetum?.agent_file_id;
                snackActions.success(
                    <span className="flex flex-col gap-1">
                        <span className="font-bold">Wrapper built successfully!</span>
                        {fileId && (
                            <a
                                href={`/direct/download/${fileId}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="underline font-mono text-green-200 hover:text-green-100 text-xs"
                            >
                                ⬇ Download now
                            </a>
                        )}
                    </span>
                );
            } else if (p.build_phase === 'error' && !notifiedRef.current) {
                notifiedRef.current = true;
                snackActions.error('Wrapper build failed — click "View Error" in the build panel for details');
            }
        },
        onError: (err) => console.error('Build subscription error:', err),
    });

    const phaseColor = buildData?.build_phase === 'success' ? 'text-matrix'
        : buildData?.build_phase === 'error' ? 'text-alert' : 'text-signal';
    const phaseIcon = buildData?.build_phase === 'success'
        ? <CheckCircle size={18} className="text-matrix" />
        : buildData?.build_phase === 'error'
        ? <XCircle size={18} className="text-alert" />
        : <Loader size={18} className="text-signal animate-spin" />;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 border border-ghost/30 rounded-lg overflow-hidden"
        >
            {/* Phase header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-black/40 border-b border-ghost/20">
                {phaseIcon}
                <span className={cn("font-mono text-sm font-bold uppercase flex-1", phaseColor)}>
                    {buildData?.build_phase ?? 'Waiting…'}
                </span>
                {buildData?.build_phase === 'success' && onComplete && (
                    <button
                        onClick={() => onComplete(uuid)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-matrix/20 border border-matrix/40 text-matrix text-xs rounded hover:bg-matrix/30 transition-colors font-mono"
                    >
                        <Check size={12} /> Done — View in List
                    </button>
                )}
            </div>

            {/* Build steps */}
            <div className="divide-y divide-ghost/10">
                {buildData?.steps.map(step => {
                    const isExpanded = expandedStep === step.step_number;
                    const hasOutput = step.step_stdout || step.step_stderr;
                    const icon = step.step_skip
                        ? <Minus size={14} className="text-ghost" />
                        : step.step_success === true
                        ? <CheckCircle size={14} className="text-matrix" />
                        : step.step_success === false
                        ? <XCircle size={14} className="text-alert" />
                        : <Loader size={14} className="text-signal animate-spin" />;
                    return (
                        <div key={step.step_number} className="px-4 py-2">
                            <div
                                className={cn("flex items-center justify-between", hasOutput ? "cursor-pointer" : "")}
                                onClick={() => hasOutput && setExpandedStep(isExpanded ? null : step.step_number)}
                            >
                                <div className="flex items-center gap-2">
                                    {icon}
                                    <span className="text-xs text-ghost font-mono">{step.step_name}</span>
                                </div>
                                {hasOutput && (isExpanded
                                    ? <ChevronUp size={12} className="text-ghost" />
                                    : <ChevronDown size={12} className="text-ghost" />)}
                            </div>
                            {isExpanded && (
                                <div className="mt-2 space-y-1">
                                    {step.step_stdout && (
                                        <pre className="text-xs bg-black/30 rounded p-2 text-matrix overflow-x-auto whitespace-pre-wrap font-mono">{step.step_stdout}</pre>
                                    )}
                                    {step.step_stderr && (
                                        <pre className="text-xs bg-black/30 rounded p-2 text-alert overflow-x-auto whitespace-pre-wrap font-mono">{step.step_stderr}</pre>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Download + UUID link on success (Item 9) */}
            {buildData?.build_phase === 'success' && buildData.agent_file_id && (
                <div className="px-4 py-3 bg-matrix/10 border-t border-matrix/30 space-y-1">
                    <div className="flex items-center gap-3">
                        <span className="text-ghost text-sm">Download:</span>
                        <a
                            href={`/direct/download/${buildData.agent_file_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-matrix underline hover:text-matrix/80 font-mono text-sm"
                        >
                            {buildData.agent_file_id}
                        </a>
                    </div>
                    <p className="text-xs text-ghost/50 font-mono">UUID: {uuid}</p>
                </div>
            )}

            {/* Error details */}
            {buildData?.build_phase === 'error' && (buildData.build_message || buildData.build_stderr || buildData.build_stdout) && (
                <div className="px-4 py-3 bg-alert/5 border-t border-alert/30 space-y-2">
                    {buildData.build_message && (
                        <pre className="text-xs text-alert font-mono whitespace-pre-wrap line-clamp-5">{buildData.build_message}</pre>
                    )}
                    {buildData.build_stderr && (
                        <pre className="text-xs text-alert/70 font-mono whitespace-pre-wrap line-clamp-3">{buildData.build_stderr}</pre>
                    )}
                    <button
                        onClick={() => setShowErrorModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-alert/20 border border-alert/40 text-alert text-xs rounded hover:bg-alert/30 transition-colors font-mono"
                    >
                        <FileText size={12} /> View Full Error Details
                    </button>
                </div>
            )}

            {/* AceEditor error modal */}
            {showErrorModal && createPortal(
                <div
                    className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
                    onClick={() => setShowErrorModal(false)}
                >
                    <div
                        className="bg-void border border-alert/30 rounded-lg shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="bg-alert/10 p-4 border-b border-alert/30 flex items-center justify-between shrink-0">
                            <h3 className="font-mono font-bold text-alert tracking-widest flex items-center gap-2">
                                <XCircle size={16} /> BUILD ERROR DETAILS
                            </h3>
                            <button onClick={() => setShowErrorModal(false)} className="text-ghost hover:text-signal transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden" style={{ minHeight: '300px' }}>
                            <AceEditor
                                mode="text"
                                theme="monokai"
                                fontSize={13}
                                width="100%"
                                height="100%"
                                value={[
                                    buildData?.build_message ? `[Build Message]\n${buildData.build_message}` : '',
                                    buildData?.build_stderr  ? `[Stderr]\n${buildData.build_stderr}` : '',
                                    buildData?.build_stdout  ? `[Stdout]\n${buildData.build_stdout}` : '',
                                ].filter(Boolean).join('\n\n')}
                                readOnly
                                showPrintMargin={false}
                                wrapEnabled={true}
                                setOptions={{ useWorker: false, showLineNumbers: true, tabSize: 2 }}
                            />
                        </div>
                        <div className="p-4 border-t border-ghost/30 flex justify-end shrink-0">
                            <button
                                onClick={() => setShowErrorModal(false)}
                                className="px-4 py-2 border border-ghost/30 text-ghost font-mono rounded hover:text-signal hover:border-signal transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </motion.div>
    );
};

// ============================================================
// Step 1: Select Wrapper Type
// ============================================================
const Step1SelectWrapper: React.FC<{
    wrapperTypes: PayloadType[];
    selected: PayloadType | null;
    onSelect: (pt: PayloadType) => void;
    existingWrappers: ExistingWrapper[];
    loadingExisting: boolean;
    onCopyExisting: (ew: ExistingWrapper) => void;
}> = ({ wrapperTypes, selected, onSelect, existingWrappers, loadingExisting, onCopyExisting }) => {

    const allOSes = useMemo(() => {
        const set = new Set<string>();
        wrapperTypes.forEach(pt => pt.supported_os.forEach(os => set.add(os)));
        return Array.from(set).sort();
    }, [wrapperTypes]);

    const [osFilter, setOsFilter] = useState('');
    // Item 4 + 12: show copy-from-existing prominently by default
    const [showExisting, setShowExisting] = useState(true);

    const filteredWrappers = useMemo(() => {
        if (!osFilter) return wrapperTypes;
        return wrapperTypes.filter(pt => pt.supported_os.includes(osFilter));
    }, [wrapperTypes, osFilter]);

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-signal mb-4">SELECT WRAPPER TYPE</h2>

            {/* ---- Item 4 + 12: Copy-from-existing at the TOP (prominent) ---- */}
            {(existingWrappers.length > 0 || loadingExisting) && (
                <div className="border border-signal/20 rounded-lg overflow-hidden">
                    <button
                        onClick={() => setShowExisting(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-signal/5 hover:bg-signal/10 transition-colors"
                    >
                        <div className="flex items-center gap-2 text-sm font-semibold text-signal">
                            <RefreshCw size={14} />
                            Copy settings from an existing wrapper
                            {existingWrappers.length > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 bg-signal/20 text-signal text-[10px] rounded-full font-mono">
                                    {existingWrappers.length}
                                </span>
                            )}
                        </div>
                        {showExisting ? <ChevronUp size={14} className="text-ghost" /> : <ChevronDown size={14} className="text-ghost" />}
                    </button>
                    <AnimatePresence initial={false}>
                        {showExisting && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-3">
                                    {loadingExisting ? (
                                        <div className="flex items-center gap-2 py-3 text-ghost text-sm">
                                            <Loader size={16} className="animate-spin text-signal/60" />
                                            Loading existing wrappers…
                                        </div>
                                    ) : (
                                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                            {existingWrappers.map(ew => (
                                                <motion.div
                                                    key={ew.id}
                                                    whileHover={{ scale: 1.01 }}
                                                    onClick={() => onCopyExisting(ew)}
                                                    className="flex items-center gap-3 p-3 border border-ghost/20 rounded-lg cursor-pointer hover:border-signal/50 hover:bg-signal/5 transition-all"
                                                >
                                                    <Copy size={14} className="text-ghost/50 flex-shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <span className="font-mono text-sm text-signal truncate block">
                                                            {decodeFilename(ew.filemetum?.filename_text) || ew.uuid.slice(0, 8)}
                                                        </span>
                                                        <span className="text-xs text-ghost/50">{ew.payloadtype.name}</span>
                                                        {ew.description && (
                                                            <span className="text-xs text-ghost/40 ml-2">{ew.description}</span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-signal/50 font-mono flex-shrink-0">copy &rarr;</span>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* ---- Item 12: "or start fresh" divider ---- */}
            {existingWrappers.length > 0 && (
                <div className="flex items-center gap-3 my-1">
                    <div className="flex-1 border-t border-ghost/20" />
                    <span className="text-xs text-ghost/40 font-mono uppercase tracking-wider whitespace-nowrap">or start fresh</span>
                    <div className="flex-1 border-t border-ghost/20" />
                </div>
            )}

            <p className="text-ghost">Choose the wrapper payload type that will contain your existing payload</p>

            {/* OS Filter */}
            {allOSes.length > 1 && (
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setOsFilter('')}
                        className={cn(
                            "px-3 py-1 rounded text-xs font-mono border transition-colors",
                            !osFilter ? "border-signal bg-signal/10 text-signal" : "border-ghost/30 text-ghost hover:border-signal/50"
                        )}
                    >
                        All
                    </button>
                    {allOSes.map(os => (
                        <button
                            key={os}
                            onClick={() => setOsFilter(os === osFilter ? '' : os)}
                            className={cn(
                                "px-3 py-1 rounded text-xs font-mono border transition-colors",
                                osFilter === os ? "border-signal bg-signal/10 text-signal" : "border-ghost/30 text-ghost hover:border-signal/50"
                            )}
                        >
                            {os}
                        </button>
                    ))}
                </div>
            )}

            {/* Wrapper cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredWrappers.map(pt => (
                    <motion.div
                        key={pt.id}
                        whileHover={{ scale: 1.02 }}
                        onClick={() => onSelect(pt)}
                        className={cn(
                            "p-4 border rounded-lg cursor-pointer transition-all",
                            selected?.id === pt.id ? "border-signal bg-signal/10" : "border-ghost/30 hover:border-signal/50"
                        )}
                    >
                        <div className="flex items-start gap-3 mb-2">
                            <AgentIcon name={pt.name} size={36} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-bold text-signal truncate">{pt.name}</h3>
                                    {!pt.container_running && (
                                        <span title="Container not running"><AlertCircle className="text-alert flex-shrink-0 ml-1" size={16} /></span>
                                    )}
                                </div>
                                {pt.semver && (
                                    <span className="text-xs text-ghost/50 font-mono">v{pt.semver}</span>
                                )}
                            </div>
                        </div>
                        <p className="text-sm text-ghost mb-2 line-clamp-2">{pt.note}</p>
                        <div className="flex flex-wrap gap-1 mb-1">
                            {pt.supported_os.map(os => (
                                <span key={os} className="px-2 py-0.5 bg-signal/20 text-signal text-xs rounded">{os}</span>
                            ))}
                        </div>
                        <p className="text-xs text-ghost/60">by {pt.author}</p>
                    </motion.div>
                ))}
            </div>

            {filteredWrappers.length === 0 && (
                <div className="text-center py-10 text-ghost">
                    <Package size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No wrapper types for {osFilter || 'selected filter'}</p>
                </div>
            )}
        </div>
    );
};

// ============================================================
// Step 2: Select Payload to Wrap
//   - Item 4: ℹ detail modal per card
// ============================================================
const Step2SelectPayload: React.FC<{
    payloads: Payload[];
    loading: boolean;
    wrapperType: PayloadType | null;
    selected: Payload | null;
    onSelect: (p: Payload) => void;
    onEditWrapper: () => void;
}> = ({ payloads, loading, wrapperType, selected, onSelect, onEditWrapper }) => {
    // Item 3: read UTC time preference from current operator
    const me = useReactiveVar(meState);
    const [search, setSearch] = useState('');
    const [detailPayload, setDetailPayload] = useState<Payload | null>(null);

    const filteredPayloads = useMemo(() => {
        if (!search) return payloads;
        const s = search.toLowerCase();
        return payloads.filter(p =>
            p.payloadtype.name.toLowerCase().includes(s) ||
            decodeFilename(p.filemetum?.filename_text).toLowerCase().includes(s) ||
            p.description?.toLowerCase().includes(s)
        );
    }, [payloads, search]);

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-signal mb-2">SELECT PAYLOAD TO WRAP</h2>

            {/* Wrapper context bar */}
            {wrapperType && (
                <div className="flex items-center gap-3 p-3 bg-black/20 border border-ghost/20 rounded-lg mb-4">
                    <AgentIcon name={wrapperType.name} size={28} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-ghost">Wrapper:</span>
                            <span className="text-sm font-bold text-signal font-mono">{wrapperType.name}</span>
                            {wrapperType.semver && (
                                <span className="text-xs text-ghost/50 font-mono">v{wrapperType.semver}</span>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {wrapperType.supported_os.map(os => (
                                <span key={os} className="px-1.5 py-0.5 bg-signal/15 text-signal text-xs rounded">{os}</span>
                            ))}
                        </div>
                        {wrapperType.note && (
                            <p className="text-xs text-ghost/60 mt-1 truncate">{wrapperType.note}</p>
                        )}
                    </div>
                    <EditButton label="Change" onClick={onEditWrapper} />
                </div>
            )}

            <input
                type="text"
                placeholder="Search payloads..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-void border border-ghost/30 rounded-lg px-4 py-2 text-signal placeholder:text-ghost/50 focus:border-signal outline-none mb-4"
            />

            {loading && (
                <div className="flex items-center justify-center py-10 text-ghost">
                    <Loader size={24} className="animate-spin mr-3 text-signal/60" />
                    <span className="text-sm">Loading payloads…</span>
                </div>
            )}

            {!loading && (
                <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                    {filteredPayloads.map(p => {
                        const fname = decodeFilename(p.filemetum?.filename_text) || p.uuid.slice(0, 8);
                        return (
                            <motion.div
                                key={p.id}
                                whileHover={{ scale: 1.01 }}
                                onClick={() => onSelect(p)}
                                className={cn(
                                    "p-3 border rounded-lg cursor-pointer transition-all",
                                    selected?.id === p.id
                                        ? "border-signal bg-signal/10"
                                        : "border-ghost/30 hover:border-signal/50"
                                )}
                            >
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-signal">{fname}</span>
                                        <span className="px-2 py-0.5 bg-matrix/20 text-matrix text-xs rounded">
                                            {p.payloadtype.name}
                                        </span>
                                        {p.payloadtype.supported_os.map(os => (
                                            <span key={os} className="px-1.5 py-0.5 bg-ghost/10 text-ghost text-xs rounded">{os}</span>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {p.c2profileparametersinstances
                                            .filter((v, i, a) => a.findIndex(x => x.c2profile.name === v.c2profile.name) === i)
                                            .map((c2, i) => (
                                                <span key={i} className="px-2 py-0.5 bg-signal/15 text-signal text-xs rounded">
                                                    {c2.c2profile.name}
                                                </span>
                                            ))}
                                        {/* Item 4: detail button */}
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setDetailPayload(p); }}
                                            className="p-1 text-ghost/50 hover:text-signal transition-colors rounded hover:bg-signal/10"
                                            title="View payload details"
                                        >
                                            <Info size={14} />
                                        </button>
                                    </div>
                                </div>
                                {p.description && (
                                    <p className="text-sm text-ghost mt-1">{p.description}</p>
                                )}
                                <p className="text-xs text-ghost/50 mt-1">
                                    Created: {toLocalTime(p.creation_time, me?.user?.view_utc_time ?? false)}
                                </p>
                                {p.payload_build_steps && p.payload_build_steps.length > 0 && (
                                    <MiniStepProgress steps={p.payload_build_steps} />
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {!loading && filteredPayloads.length === 0 && (
                <div className="text-center py-10 text-ghost">
                    <Box size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No compatible payloads found</p>
                    <p className="text-xs mt-1 text-ghost/50">
                        Compatible: {wrapperType?.wrap_these_payload_types?.map(w => w.wrapped.name).join(', ') || wrapperType?.supported_os.join('/') + ' payloads'}
                    </p>
                </div>
            )}

            {/* Item 4: Payload detail modal */}
            <AnimatePresence>
                {detailPayload && (
                    <PayloadDetailModal payload={detailPayload} onClose={() => setDetailPayload(null)} />
                )}
            </AnimatePresence>
        </div>
    );
};

// ============================================================
// Step 3: Configure Build Parameters
//   Items 1,2: hide_conditions + supported_os per-param filtering
//   Items 3,5,6,7,8: ChooseOneCustom, Number, Date, Dictionary, Array/TypedArray/MapArray
// ============================================================
const Step3Configure: React.FC<{
    wrapperType: PayloadType | null;
    selectedOS: string;
    parameters: Record<string, any>;
    setParameters: (params: Record<string, any>) => void;
    description: string;
    setDescription: (d: string) => void;
    filename: string;
    setFilename: (f: string) => void;
    onEditWrapper: () => void;
    onEditPayload: () => void;
}> = ({ wrapperType, selectedOS, parameters, setParameters, description, setDescription, filename, setFilename, onEditWrapper, onEditPayload }) => {
    const buildParams = wrapperType?.buildparameters || [];
    // Items 1+2: apply hide_conditions + supported_os filtering with live values
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

        // ── ChooseOne ──────────────────────────────────────────────
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

        // ── ChooseOneCustom (Item 3) ───────────────────────────────
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

        // ── ChooseMultiple ─────────────────────────────────────────
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

        // ── Boolean ───────────────────────────────────────────────
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

        // ── Number (Item 5) ───────────────────────────────────────
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

        // ── Date (Item 6) ─────────────────────────────────────────
        if (param.parameter_type === 'Date') {
            // Stored as ISO date string yyyy-mm-dd
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

        // ── File ──────────────────────────────────────────────────
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

        // ── FileMultiple ──────────────────────────────────────────
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

        // ── Array (Item 8) ────────────────────────────────────────
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

        // ── TypedArray (Item 8) ───────────────────────────────────
        // Stored as [type_label, value][] — type_label uses default_value as type reference
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

        // ── MapArray (Item 8) ─────────────────────────────────────
        // Stored as [key, string[]][] — key maps to list of values
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

        // ── Dictionary (Item 7) ───────────────────────────────────
        // Stored as {name, value}[] — rendered as editable key-value pairs
        if (param.parameter_type === 'Dictionary') {
            // Parse initial: from choices (JSON) or existing value
            const dictEntries: { name: string; value: string }[] = Array.isArray(val)
                ? val.map((v: any) => ({ name: String(v.name ?? ''), value: String(v.value ?? '') }))
                : [];
            // Available keys from choices (parsed as JSON [{name, default_value, default_show}])
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

        // ── Default: String text input ────────────────────────────
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

                {/* Grouped build parameters with hide_conditions + supported_os filtering */}
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

// ============================================================
// Step 4: Build
//   - Item 4: AceEditor for JSON preview
//   - Item 9: onComplete passes uuid for direct navigation
//   - Item 10: formatParamValue for complex type summary
// ============================================================
const Step4Build: React.FC<{
    wrapperType: PayloadType | null;
    wrappedPayload: Payload | null;
    parameters: Record<string, any>;
    description: string;
    filename: string;
    selectedOS: string;
    onBuild: () => void;
    building: boolean;
    buildUUID: string | null;
    buildFromNow: string;
    onEditWrapper: () => void;
    onEditPayload: () => void;
    onEditConfigure: () => void;
    onStartOver: () => void;
    onComplete?: (uuid: string) => void;
    onFilenameChange?: (v: string) => void;
}> = ({
    wrapperType, wrappedPayload, parameters, description, filename, selectedOS,
    onBuild, building, buildUUID, buildFromNow,
    onEditWrapper, onEditPayload, onEditConfigure, onStartOver, onComplete,
    onFilenameChange,
}) => {
    // Item 2: auto-show config panel
    const [showPayloadConfig, setShowPayloadConfig] = useState(true);
    const [payloadConfigJSON, setPayloadConfigJSON] = useState<string | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(false);

    const [fetchConfig] = useLazyQuery(EXPORT_PAYLOAD_CONFIG, {
        fetchPolicy: 'no-cache',
        onCompleted: (data) => {
            setLoadingConfig(false);
            if (data.exportPayloadConfig.status === 'success') {
                try {
                    setPayloadConfigJSON(JSON.stringify(JSON.parse(data.exportPayloadConfig.config), null, 2));
                } catch {
                    setPayloadConfigJSON(data.exportPayloadConfig.config);
                }
            } else {
                snackActions.error('Failed to load config: ' + data.exportPayloadConfig.error);
            }
        },
        onError: () => {
            setLoadingConfig(false);
            snackActions.error('Failed to load payload config');
        },
    });

    // Item 2: auto-fetch embedded JSON when payload is selected
    useEffect(() => {
        if (wrappedPayload && !payloadConfigJSON) {
            setLoadingConfig(true);
            fetchConfig({ variables: { uuid: wrappedPayload.uuid } });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wrappedPayload?.uuid]);

    const handleToggleConfig = () => {
        if (!showPayloadConfig && !payloadConfigJSON && wrappedPayload) {
            setLoadingConfig(true);
            fetchConfig({ variables: { uuid: wrappedPayload.uuid } });
        }
        setShowPayloadConfig(v => !v);
    };

    const buildParams = wrapperType?.buildparameters || [];
    // Summary also applies hide_conditions + OS filter (Item 1+2)
    const paramGroups = useMemo(
        () => groupBuildParams(buildParams, parameters, selectedOS),
        [buildParams, parameters, selectedOS]
    );
    const wrappedFilename = decodeFilename(wrappedPayload?.filemetum?.filename_text) || wrappedPayload?.uuid.slice(0, 8) || '—';

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-signal">BUILD WRAPPER</h2>
                <button
                    onClick={onStartOver}
                    className="flex items-center gap-1 text-xs text-ghost hover:text-signal border border-ghost/30 hover:border-signal/50 px-3 py-1.5 rounded transition-colors"
                >
                    <RotateCcw size={13} /> Start Over
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Wrapper info */}
                <div className="bg-black/30 border border-ghost/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase tracking-widest text-ghost/60">Wrapper</span>
                        <EditButton label="Edit" onClick={onEditWrapper} />
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                        <AgentIcon name={wrapperType?.name || ''} size={28} />
                        <div>
                            <p className="font-mono text-signal font-bold">{wrapperType?.name}</p>
                            {wrapperType?.semver && (
                                <p className="text-xs text-ghost/60 font-mono">v{wrapperType.semver}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {wrapperType?.supported_os.map(os => (
                            <span key={os} className="px-1.5 py-0.5 bg-signal/15 text-signal text-xs rounded">{os}</span>
                        ))}
                    </div>
                    {selectedOS && (
                        <p className="text-xs mt-2">
                            <span className="text-ghost">Selected OS: </span>
                            <span className="text-signal font-mono">{selectedOS}</span>
                        </p>
                    )}
                </div>

                {/* Wrapped payload info */}
                <div className="bg-black/30 border border-ghost/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase tracking-widest text-ghost/60">Wrapped Payload</span>
                        <EditButton label="Edit" onClick={onEditPayload} />
                    </div>
                    <p className="font-mono text-signal font-bold">{wrappedFilename}</p>
                    <span className="px-2 py-0.5 bg-matrix/20 text-matrix text-xs rounded mt-1 inline-block">
                        {wrappedPayload?.payloadtype.name}
                    </span>
                    {wrappedPayload?.description && (
                        <p className="text-xs text-ghost mt-1">{wrappedPayload.description}</p>
                    )}
                    <button
                        onClick={handleToggleConfig}
                        className="mt-2 text-xs text-signal/60 hover:text-signal flex items-center gap-1 transition-colors"
                    >
                        {showPayloadConfig ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {showPayloadConfig ? 'Hide' : 'Show'} full configuration
                    </button>
                </div>

                {/* Output settings */}
                <div className="bg-black/30 border border-ghost/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase tracking-widest text-ghost/60">Output</span>
                        <EditButton label="Edit" onClick={onEditConfigure} />
                    </div>
                    {/* Item 10: editable filename before build */}
                    <div className="mb-1">
                        <span className="text-ghost text-xs">Filename: </span>
                        {onFilenameChange ? (
                            <input
                                value={filename}
                                onChange={(e) => onFilenameChange(e.target.value)}
                                placeholder={wrapperType
                                    ? `${wrapperType.name}${wrapperType.file_extension ? '.' + wrapperType.file_extension : ''}`
                                    : 'wrapper'}
                                className="ml-1 bg-black/40 border border-ghost/30 rounded px-2 py-0.5 text-signal font-mono text-xs focus:border-signal focus:outline-none w-auto min-w-[140px]"
                            />
                        ) : (
                            <span className="text-signal font-mono text-sm">{filename || <span className="italic text-ghost/40">default</span>}</span>
                        )}
                    </div>
                    <p className="text-sm mt-1">
                        <span className="text-ghost text-xs">Description: </span>
                        <span className="text-signal">{description || <span className="text-ghost/40 italic text-xs">none</span>}</span>
                    </p>
                </div>

                {/* Build parameters summary — grouped + Item 10: proper complex type display */}
                {buildParams.length > 0 && (
                    <div className="bg-black/30 border border-ghost/30 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs uppercase tracking-widest text-ghost/60">Build Parameters</span>
                            <EditButton label="Edit" onClick={onEditConfigure} />
                        </div>
                        <div className="space-y-3">
                            {paramGroups.map(({ group, params }) => (
                                <div key={group}>
                                    {paramGroups.length > 1 && (
                                        <p className="text-[9px] uppercase tracking-widest text-ghost/40 font-mono mb-1">{group}</p>
                                    )}
                                    <div className="space-y-1">
                                        {params.map(bp => {
                                            const v = parameters[bp.name] ?? bp.default_value ?? '';
                                            return (
                                                <div key={bp.id} className="flex justify-between text-xs gap-2">
                                                    <span className="text-ghost flex-shrink-0">{bp.name}:</span>
                                                    <span className="text-signal font-mono truncate text-right"
                                                        title={formatParamValue(bp, v)}>
                                                        {formatParamValue(bp, v)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Payload JSON config expansion — AceEditor */}
            <AnimatePresence>
                {showPayloadConfig && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="border border-ghost/30 rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-ghost/20">
                                <span className="text-xs uppercase tracking-widest text-ghost/60">
                                    Wrapped Payload Configuration
                                </span>
                                {loadingConfig && <Loader size={14} className="animate-spin text-ghost" />}
                            </div>
                            {payloadConfigJSON ? (
                                <AceEditor
                                    mode="json"
                                    theme="monokai"
                                    width="100%"
                                    height="300px"
                                    readOnly={true}
                                    showPrintMargin={false}
                                    wrapEnabled={true}
                                    value={payloadConfigJSON}
                                    setOptions={{ useWorker: false, fontSize: 12 }}
                                    style={{ background: 'transparent' }}
                                />
                            ) : !loadingConfig ? (
                                <p className="p-4 text-xs text-ghost/50">No configuration available</p>
                            ) : (
                                <div className="p-4 flex items-center gap-2 text-ghost text-xs">
                                    <Loader size={14} className="animate-spin" /> Loading…
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Build button */}
            {!buildUUID && (
                <button
                    onClick={onBuild}
                    disabled={building}
                    className="w-full py-3 bg-signal text-void rounded-lg hover:bg-signal/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-bold"
                >
                    {building ? (
                        <><Loader className="animate-spin" size={20} /> Submitting…</>
                    ) : (
                        <><Package size={20} /> Build Wrapper Payload</>
                    )}
                </button>
            )}

            {/* Live build progress — passes UUID to onComplete (Item 9) */}
            {buildUUID && (
                <BuildProgressPanel uuid={buildUUID} fromNow={buildFromNow} onComplete={onComplete} />
            )}
        </div>
    );
};

// ============================================================
// Main Wizard
// ============================================================
export function CreateWrapperWizard({
    embedded = false,
    onComplete,
}: {
    embedded?: boolean;
    onComplete?: (uuid?: string) => void;
}) {
    const navigate = useNavigate();
    const { isSidebarCollapsed } = useAppStore();
    const me = useReactiveVar(meState);

    const [currentStep, setCurrentStep] = useState(0);
    const [selectedWrapper, setSelectedWrapper] = useState<PayloadType | null>(null);
    const [selectedPayload, setSelectedPayload] = useState<Payload | null>(null);
    const [buildParameters, setBuildParameters] = useState<Record<string, any>>({});
    const [description, setDescription] = useState('');
    const [filename, setFilename] = useState('');
    const [building, setBuilding] = useState(false);
    const [buildUUID, setBuildUUID] = useState<string | null>(null);
    const buildFromNowRef = useRef(new Date().toISOString());

    // Fetch wrapper types
    const { data: wrapperData, loading: loadingWrappers } = useQuery(GET_WRAPPER_PAYLOAD_TYPES, {
        fetchPolicy: 'cache-and-network',
    });
    const wrapperTypes: PayloadType[] = wrapperData?.payloadtype || [];

    // Fetch existing wrappers (used in Step1 "copy from")
    const { data: existingData, loading: loadingExisting } = useQuery(GET_EXISTING_WRAPPERS, {
        fetchPolicy: 'cache-and-network',
    });
    const existingWrappers: ExistingWrapper[] = existingData?.payload || [];

    // Lazy query for wrappable payloads — triggered when a wrapper type is selected
    const [fetchWrappable, { data: wrappableData, loading: loadingWrappable }] = useLazyQuery(
        GET_WRAPPABLE_BY_TYPE,
        { fetchPolicy: 'network-only' }
    );

    const wrappablePayloads: Payload[] = useMemo(() => {
        if (!wrappableData?.payloadtype_by_pk) return [];
        const options: Payload[] = [];
        for (const item of (wrappableData.payloadtype_by_pk.wrap_these_payload_types || [])) {
            for (const p of (item.wrapped.payloads || [])) {
                options.push(p);
            }
        }
        return options.sort((a, b) => b.id - a.id);
    }, [wrappableData]);

    // Trigger wrappable query when wrapper type changes
    useEffect(() => {
        if (selectedWrapper) {
            fetchWrappable({ variables: { payloadTypeId: selectedWrapper.id } });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedWrapper?.id]);

    // Auto-populate filename when wrapper type changes
    useEffect(() => {
        if (selectedWrapper) {
            const ext = selectedWrapper.file_extension;
            setFilename(ext ? `${selectedWrapper.name}.${ext}` : selectedWrapper.name);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedWrapper?.id]);

    // Create wrapper mutation
    const [createWrapper] = useMutation(CREATE_WRAPPER, {
        onCompleted: (data) => {
            setBuilding(false);
            if (data.createPayload.status === 'success') {
                setBuildUUID(data.createPayload.uuid);
                snackActions.info('Build submitted — watching progress…');
            } else {
                snackActions.error('Failed to create wrapper: ' + data.createPayload.error);
            }
        },
        onError: (error) => {
            setBuilding(false);
            snackActions.error('Failed to create wrapper: ' + error.message);
        },
    });

    const steps = ['Select Wrapper', 'Select Payload', 'Configure', 'Build'];

    // @ts-ignore
    const noOperation = (me?.user?.current_operation_id || 0) === 0;

    const handleNext = () => { if (currentStep < steps.length - 1) setCurrentStep(currentStep + 1); };
    const handleBack = () => { if (currentStep > 0) setCurrentStep(currentStep - 1); };

    const canJumpTo = (idx: number): boolean => {
        if (idx < currentStep) return true;  // always allow back
        if (idx === currentStep) return false; // no-op
        if (idx === 1 && selectedWrapper !== null) return true;
        if (idx === 2 && selectedWrapper !== null && selectedPayload !== null) return true;
        if (idx === 3 && selectedWrapper !== null && selectedPayload !== null) return true;
        return false;
    };

    const handleStartOver = () => {
        setCurrentStep(0);
        setSelectedWrapper(null);
        setSelectedPayload(null);
        setBuildParameters({});
        setDescription('');
        setFilename('');
        setBuilding(false);
        setBuildUUID(null);
        buildFromNowRef.current = new Date().toISOString();
    };

    const canProceed = () => {
        switch (currentStep) {
            case 0: return selectedWrapper !== null;
            case 1: return selectedPayload !== null;
            default: return true;
        }
    };

    // Determine selected_os: prefer intersection of wrapper and payload OS
    const computedOS = useMemo(() => {
        if (!selectedWrapper || !selectedPayload) return '';
        const intersection = selectedWrapper.supported_os.filter(
            os => selectedPayload.payloadtype.supported_os.includes(os)
        );
        return intersection.length > 0 ? intersection[0] : selectedWrapper.supported_os[0];
    }, [selectedWrapper, selectedPayload]);

    // Async build — handles File / FileMultiple uploads first
    const handleBuild = async () => {
        if (!selectedWrapper || !selectedPayload) return;
        setBuilding(true);
        buildFromNowRef.current = new Date().toISOString();

        const resolvedParams: Array<{ name: string; value: any }> = [];
        for (const bp of selectedWrapper.buildparameters) {
            const val = buildParameters[bp.name] ?? bp.default_value;
            if (bp.parameter_type === 'File') {
                if (val instanceof File) {
                    const uuid = await UploadTaskFile(val, `Build param ${bp.name} for ${filename}`);
                    if (!uuid) {
                        snackActions.error(`Failed to upload file for parameter: ${bp.name}`);
                        setBuilding(false);
                        return;
                    }
                    resolvedParams.push({ name: bp.name, value: uuid });
                } else {
                    resolvedParams.push({ name: bp.name, value: val || '' });
                }
            } else if (bp.parameter_type === 'FileMultiple') {
                const files: any[] = Array.isArray(val) ? val : [];
                const uuids: string[] = [];
                for (const f of files) {
                    if (f instanceof File) {
                        const uuid = await UploadTaskFile(f, `Build param ${bp.name} for ${filename}`);
                        if (!uuid) {
                            snackActions.error(`Failed to upload file for parameter: ${bp.name}`);
                            setBuilding(false);
                            return;
                        }
                        uuids.push(uuid);
                    } else {
                        uuids.push(String(f));
                    }
                }
                resolvedParams.push({ name: bp.name, value: uuids });
            } else if (bp.parameter_type === 'Dictionary') {
                // Dictionary: convert [{name, value}] → {key: value}
                const entries: { name: string; value: string }[] = Array.isArray(val) ? val : [];
                const obj: Record<string, string> = {};
                for (const e of entries) obj[e.name] = e.value;
                resolvedParams.push({ name: bp.name, value: obj });
            } else if (bp.parameter_type === 'MapArray') {
                // MapArray: convert [[key, vals[]]] → {key: vals[]}
                const entries: [string, string[]][] = Array.isArray(val) ? val : [];
                const obj: Record<string, string[]> = {};
                for (const [k, v] of entries) obj[k] = v;
                resolvedParams.push({ name: bp.name, value: obj });
            } else if (['Array', 'ChooseMultiple', 'TypedArray'].includes(bp.parameter_type)) {
                // Ensure Array-type values are proper JS arrays (not raw JSON strings from default_value)
                let arrVal: any[];
                if (Array.isArray(val)) {
                    arrVal = val;
                } else if (typeof val === 'string' && val !== '') {
                    try { const parsed = JSON.parse(val); arrVal = Array.isArray(parsed) ? parsed : []; } catch { arrVal = []; }
                } else {
                    arrVal = [];
                }
                resolvedParams.push({ name: bp.name, value: arrVal });
            } else if (bp.parameter_type === 'Boolean') {
                // Ensure Boolean values are actual booleans, not strings
                const boolVal = val === true || val === 'true';
                resolvedParams.push({ name: bp.name, value: boolVal });
            } else if (bp.parameter_type === 'Number') {
                resolvedParams.push({ name: bp.name, value: Number(val) || 0 });
            } else {
                resolvedParams.push({ name: bp.name, value: val });
            }
        }

        const wrappedFname = decodeFilename(selectedPayload.filemetum?.filename_text) || selectedPayload.uuid;
        const payloadDef = {
            selected_os: computedOS,
            payload_type: selectedWrapper.name,
            filename: filename || selectedWrapper.name,
            description: description || `Wrapped ${wrappedFname}`,
            commands: [],
            build_parameters: resolvedParams,
            wrapped_payload: selectedPayload.uuid,
            wrapper: true,
            c2_profiles: [],
        };

        createWrapper({ variables: { payload: JSON.stringify(payloadDef) } });
    };

    // Handle copying settings from an existing wrapper payload
    const handleCopyExisting = (existing: ExistingWrapper) => {
        const matchingType = wrapperTypes.find(wt => wt.id === existing.payloadtype.id);
        if (!matchingType) {
            snackActions.warning('Could not find matching wrapper type');
            return;
        }
        if (!selectedWrapper || selectedWrapper.id !== matchingType.id) {
            setSelectedPayload(null);
            setBuildParameters({});
        }
        setSelectedWrapper(matchingType);
        const newParams: Record<string, any> = {};
        for (const bpi of existing.buildparameterinstances) {
            const bp = matchingType.buildparameters.find(p => p.id === bpi.build_parameter_id);
            if (bp) newParams[bp.name] = bpi.value;
        }
        setBuildParameters(newParams);
        snackActions.success('Loaded settings from existing wrapper — select a payload to continue');
        setCurrentStep(1);
    };

    // Item 9: onComplete receives UUID and navigates to payloads page
    const handleComplete = useCallback((uuid: string) => {
        if (onComplete) {
            onComplete(uuid);
        } else {
            navigate('/new/payloads');
            snackActions.info(`Wrapper ${uuid.slice(0, 8)}… built. Find it in the Payloads list.`);
        }
    }, [onComplete, navigate]);

    const renderStep = () => {
        switch (currentStep) {
            case 0:
                return (
                    <Step1SelectWrapper
                        wrapperTypes={wrapperTypes}
                        selected={selectedWrapper}
                        onSelect={(pt) => {
                            if (selectedWrapper && selectedWrapper.id !== pt.id) {
                                setSelectedPayload(null);
                                setBuildParameters({});
                            }
                            setSelectedWrapper(pt);
                        }}
                        existingWrappers={existingWrappers}
                        loadingExisting={loadingExisting}
                        onCopyExisting={handleCopyExisting}
                    />
                );
            case 1:
                return (
                    <Step2SelectPayload
                        payloads={wrappablePayloads}
                        loading={loadingWrappable}
                        wrapperType={selectedWrapper}
                        selected={selectedPayload}
                        onSelect={(p) => setSelectedPayload(p)}
                        onEditWrapper={() => setCurrentStep(0)}
                    />
                );
            case 2:
                return (
                    <Step3Configure
                        wrapperType={selectedWrapper}
                        selectedOS={computedOS}
                        parameters={buildParameters}
                        setParameters={setBuildParameters}
                        description={description}
                        setDescription={setDescription}
                        filename={filename}
                        setFilename={setFilename}
                        onEditWrapper={() => setCurrentStep(0)}
                        onEditPayload={() => setCurrentStep(1)}
                    />
                );
            case 3:
                return (
                    <Step4Build
                        wrapperType={selectedWrapper}
                        wrappedPayload={selectedPayload}
                        parameters={buildParameters}
                        description={description}
                        filename={filename}
                        selectedOS={computedOS}
                        onBuild={handleBuild}
                        building={building}
                        buildUUID={buildUUID}
                        buildFromNow={buildFromNowRef.current}
                        onEditWrapper={() => setCurrentStep(0)}
                        onEditPayload={() => setCurrentStep(1)}
                        onEditConfigure={() => setCurrentStep(2)}
                        onStartOver={handleStartOver}
                        onComplete={handleComplete}
                        onFilenameChange={(v) => setFilename(v)}
                    />
                );
            default:
                return null;
        }
    };

    if (noOperation) {
        if (embedded) {
            return (
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center">
                        <AlertCircle size={48} className="mx-auto mb-4 text-alert" />
                        <h1 className="text-2xl font-bold text-alert mb-2">No Operation Selected</h1>
                        <p className="text-ghost">Please select a current operation to create wrappers</p>
                    </div>
                </div>
            );
        }
        return (
            <div className="min-h-screen bg-void text-signal">
                <Sidebar />
                <div className={cn("transition-all duration-300 p-6 flex items-center justify-center", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                    <div className="text-center">
                        <AlertCircle size={48} className="mx-auto mb-4 text-alert" />
                        <h1 className="text-2xl font-bold text-alert mb-2">No Operation Selected</h1>
                        <p className="text-ghost">Please select a current operation to create wrappers</p>
                    </div>
                </div>
            </div>
        );
    }

    // Embedded mode — no Sidebar
    if (embedded) {
        return (
            <div className="flex-1 flex flex-col overflow-auto p-6">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center gap-3 mb-2">
                        <Package className="text-signal" size={24} />
                        <h2 className="text-xl font-bold tracking-wider">CREATE WRAPPER</h2>
                    </div>
                    <p className="text-ghost text-sm">Wrap an existing payload with a container</p>
                </div>

                {/* Step Indicator */}
                <div className="flex items-center justify-between mb-6 border-b border-ghost/30 pb-4">
                    {steps.map((step, idx) => (
                        <React.Fragment key={step}>
                            <div className={cn("flex items-center gap-2", idx <= currentStep ? "text-signal" : canJumpTo(idx) ? "text-signal/60" : "text-ghost/50")}>
                                <div
                                    className={cn(
                                        "w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold border",
                                        idx < currentStep ? "bg-matrix border-matrix text-void cursor-pointer hover:bg-matrix/80" :
                                        idx === currentStep ? "border-signal text-signal" :
                                        canJumpTo(idx) ? "border-signal/50 text-signal/60 cursor-pointer hover:bg-signal/10 hover:border-signal" :
                                        "border-ghost/30"
                                    )}
                                    onClick={() => canJumpTo(idx) && setCurrentStep(idx)}
                                >
                                    {idx < currentStep ? <Check size={14} /> : idx + 1}
                                </div>
                                <span className="text-xs font-medium hidden sm:inline">{step}</span>
                            </div>
                            {idx < steps.length - 1 && (
                                <div className={cn("flex-1 h-0.5 mx-2", idx < currentStep ? "bg-matrix" : "bg-ghost/30")} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Loading */}
                {loadingWrappers && (
                    <div className="flex items-center justify-center py-20">
                        <Loader className="animate-spin text-signal" size={32} />
                        <span className="ml-3 text-ghost">Loading...</span>
                    </div>
                )}

                {/* Step Content */}
                {!loadingWrappers && (
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="mb-8 flex-1"
                        >
                            {renderStep()}
                        </motion.div>
                    </AnimatePresence>
                )}

                {/* Navigation */}
                {!loadingWrappers && currentStep < 3 && (
                    <div className="flex justify-between pt-4 border-t border-ghost/20">
                        <button
                            onClick={handleBack}
                            disabled={currentStep === 0}
                            className="px-4 py-2 border border-ghost/30 rounded text-ghost hover:text-signal hover:border-signal transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <ChevronLeft size={16} /> Back
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={!canProceed()}
                            className="px-4 py-2 bg-signal text-void rounded hover:bg-signal/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            Next <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // Full-page mode with Sidebar
    return (
        <div className="min-h-screen bg-void text-signal">
            <Sidebar />
            <div className={cn("transition-all duration-300 p-6", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                {/* Header */}
                <header className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded">
                            <Package size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">CREATE WRAPPER</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                PAYLOAD WRAPPER
                            </p>
                        </div>
                    </div>
                </header>

                {/* Step Indicator */}
                <div className="flex items-center justify-between mb-8 border-b border-ghost/30 pb-4">
                    {steps.map((step, idx) => (
                        <React.Fragment key={step}>
                            <StepIndicator
                                step={idx}
                                currentStep={currentStep}
                                label={step}
                                onClick={canJumpTo(idx) ? () => setCurrentStep(idx) : undefined}
                            />
                            {idx < steps.length - 1 && (
                                <div className={cn("flex-1 h-0.5 mx-2", idx < currentStep ? "bg-matrix" : "bg-ghost/30")} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Loading */}
                {loadingWrappers && (
                    <div className="flex items-center justify-center py-20">
                        <Loader className="animate-spin text-signal" size={32} />
                        <span className="ml-3 text-ghost">Loading...</span>
                    </div>
                )}

                {/* Step Content */}
                {!loadingWrappers && (
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="mb-8"
                        >
                            {renderStep()}
                        </motion.div>
                    </AnimatePresence>
                )}

                {/* Navigation */}
                {!loadingWrappers && currentStep < 3 && (
                    <div className="flex justify-between">
                        <button
                            onClick={handleBack}
                            disabled={currentStep === 0}
                            className="px-6 py-2 border border-ghost/30 rounded-lg text-ghost hover:text-signal hover:border-signal transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <ChevronLeft size={20} /> Back
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={!canProceed()}
                            className="px-6 py-2 bg-signal text-void rounded-lg hover:bg-signal/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            Next <ChevronRight size={20} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// Default export for standalone route
export default function CreateWrapper() {
    return <CreateWrapperWizard embedded={false} />;
}
