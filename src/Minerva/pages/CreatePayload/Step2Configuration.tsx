import React, { useEffect, useState } from 'react';
import { useQuery } from "@apollo/client/react";
import { GET_BUILD_PARAMETERS } from './queries';
import { CreatePayloadParameter } from './BuildParameters';
import { Disc } from 'lucide-react';

// Mirrors OldReactUI's getDefaultValueForType to ensure properly-typed initial values
// instead of relying on raw database strings (which causes Array/ChooseMultiple/TypedArray errors)
export const getDefaultValueForType = (parameter: any): any => {
    if (parameter.randomize && parameter.format_string) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const RandExp = require('randexp').default || require('randexp');
            return new RandExp(parameter.format_string).gen();
        } catch (e) { /* fall through */ }
    }
    switch (parameter.parameter_type) {
        case "String":
        case "ChooseOne":
        case "ChooseOneCustom":
            return parameter.default_value ?? "";
        case "Number":
            return (parameter.default_value ?? 0) * 1;
        case "ChooseMultiple":
        case "Array":
        case "TypedArray":
            try { return JSON.parse(parameter.default_value); } catch (e) { return []; }
        case "Boolean":
            return parameter.default_value === "true" || parameter.default_value === true;
        case "Dictionary": {
            const rawChoices = parameter.choices;
            let dictChoices: any[] = [];
            if (typeof rawChoices === 'string') {
                try { dictChoices = JSON.parse(rawChoices); } catch (e) { dictChoices = []; }
            } else if (Array.isArray(rawChoices)) {
                dictChoices = rawChoices;
            }
            return dictChoices.map((c: any) => ({ ...c, value: c.default_value }));
        }
        case "FileMultiple":
            return [];
        case "File":
            return { name: parameter.default_value ?? "" };
        case "Date": {
            const offset = parseInt(String(parameter.default_value ?? "1"));
            const d = new Date();
            d.setDate(d.getDate() + (isNaN(offset) ? 1 : offset));
            return d.toISOString().slice(0, 10);
        }
        case "MapArray": {
            try {
                const parsed = JSON.parse(parameter.default_value);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    return Object.entries(parsed).map(([k, v]) => [k, Array.isArray(v) ? v : []]);
                }
            } catch (e) { /* fall through */ }
            return [];
        }
        default:
            return parameter.default_value ?? "";
    }
};

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

const shouldHideParam = (param, allParams, selectedOS) => {
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
        const targetParam = allParams.find((p) => p.name === condition.name);
        if (!targetParam) continue;
        const targetValue = targetParam.value !== undefined ? targetParam.value : targetParam.default_value;
        const conditionValue = condition.value;
        const safeStr = (v) => String(v ?? "");
        let conditionMet = false;
        switch (condition.operand) {
            case HideConditionOperandEQ: conditionMet = safeStr(conditionValue) === safeStr(targetValue); break;
            case HideConditionOperandNotEQ: conditionMet = safeStr(conditionValue) !== safeStr(targetValue); break;
            case HideConditionOperandIN: conditionMet = !!(condition.choices && condition.choices.map(safeStr).includes(safeStr(targetValue))); break;
            case HideConditionOperandNotIN: conditionMet = !!(condition.choices && !condition.choices.map(safeStr).includes(safeStr(targetValue))); break;
            case HideConditionOperandLessThan: try { conditionMet = parseFloat(targetValue) < parseFloat(conditionValue); } catch (e) {} break;
            case HideConditionOperandGreaterThan: try { conditionMet = parseFloat(targetValue) > parseFloat(conditionValue); } catch (e) {} break;
            case HideConditionOperandLessThanOrEqual: try { conditionMet = parseFloat(targetValue) <= parseFloat(conditionValue); } catch (e) {} break;
            case HideConditionOperandGreaterThanOrEqual: try { conditionMet = parseFloat(targetValue) >= parseFloat(conditionValue); } catch (e) {} break;
            case HideConditionOperationStartsWith: conditionMet = safeStr(targetValue).startsWith(safeStr(conditionValue)); break;
            case HideConditionOperationEndsWith: conditionMet = safeStr(targetValue).endsWith(safeStr(conditionValue)); break;
            case HideConditionOperationContains: conditionMet = safeStr(targetValue).includes(safeStr(conditionValue)); break;
            case HideConditionOperationNotContains: conditionMet = !safeStr(targetValue).includes(safeStr(conditionValue)); break;
        }
        if (conditionMet) return true;
    }
    return false;
};

const sortByUiPositionThenName = (a, b) => {
    const posA = a.ui_position ?? 999999;
    const posB = b.ui_position ?? 999999;
    if (posA === posB) return a.name.localeCompare(b.name);
    return posA < posB ? -1 : 1;
};

export function Step2Configuration({ payloadType, os, currentConfig, onUpdate, onPayloadTypeInfoLoad }) {
    const { data, loading, error } = useQuery<any>(GET_BUILD_PARAMETERS, {
        variables: { payloadtype: payloadType }
    });

    const [parameters, setParameters] = useState<any[]>([]);

    useEffect(() => {
        if (data?.payloadtype?.[0]?.buildparameters) {
            const ptData = data.payloadtype[0];
            const fetchedParams = ptData.buildparameters;

            if (onPayloadTypeInfoLoad) {
                onPayloadTypeInfoLoad({
                    file_extension: ptData.file_extension,
                    agent_type: ptData.agent_type,
                    supports_multiple_c2_in_build: ptData.supports_multiple_c2_in_build,
                    supports_multiple_c2_instances_in_build: ptData.supports_multiple_c2_instances_in_build,
                    c2_parameter_deviations: ptData.c2_parameter_deviations,
                });
            }

            const mergedParams = fetchedParams.map((param) => {
                const existing = currentConfig.find((p) => p.name === param.name);
                const initialValue = getDefaultValueForType(param);
                return existing ? { ...param, ...existing } : { ...param, value: initialValue };
            });

            const sortedParams = [...mergedParams].sort(sortByUiPositionThenName);
            setParameters(sortedParams);
            if (currentConfig.length === 0) {
                onUpdate(sortedParams);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    const handleParamChange = (name, value, hasError) => {
        const newParams = parameters.map(p =>
            p.name === name ? { ...p, value, error: hasError } : p
        );
        setParameters(newParams);
        onUpdate(newParams);
    };

    if (loading) return React.createElement('div', { className: "flex items-center gap-2 text-signal" },
        React.createElement(Disc, { className: "animate-spin" }), " LOADING_PARAMETERS...");
    if (error) return React.createElement('div', { className: "text-red-500" }, "ERROR_LOADING_PARAMETERS: " + error.message);

    const groups = parameters.reduce((acc, param) => {
        if (shouldHideParam(param, parameters, os)) return acc;
        const group = param.group_name || "Basic Options";
        if (!acc[group]) acc[group] = [];
        acc[group].push(param);
        return acc;
    }, {} as Record<string, any[]>);

    return (
        <div className="space-y-8">
            {(Object.entries(groups) as [string, any[]][]).map(([groupName, groupParams]) => (
                <div key={groupName} className="border border-ghost/30 bg-black/40">
                    <div className="bg-white/5 p-2 px-4 font-mono font-bold text-signal border-b border-ghost/30 uppercase tracking-widest text-sm">
                        {groupName}
                    </div>
                    <table className="w-full text-left border-collapse">
                        <tbody>
                            {groupParams.map((param) => (
                                <CreatePayloadParameter
                                    key={param.id}
                                    {...param}
                                    trackedValue={param.value}
                                    payload_type={payloadType}
                                    selected_os={os}
                                    onChange={handleParamChange}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
}
