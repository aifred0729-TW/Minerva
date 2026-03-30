import { b64DecodeUnicode } from '../../lib/utils';
import type { BuildParam } from './createWrapper.types';
import {
    HC_EQ, HC_NEQ, HC_IN, HC_NIN, HC_LT, HC_GT,
    HC_LTE, HC_GTE, HC_SW, HC_EW, HC_CO, HC_NCO,
} from './createWrapper.types';

/** Decodes base64 filename safely */
export const decodeFilename = (b64: string | undefined): string => {
    if (!b64) return '';
    try { return b64DecodeUnicode(b64); } catch { return b64; }
};

/**
 * Evaluates whether a param should be hidden given current parameter values and selected OS.
 */
export function shouldHideParam(
    param: BuildParam,
    allParams: BuildParam[],
    values: Record<string, unknown>,
    selectedOS: string
): boolean {
    // Per-param OS filter
    if ((param.supported_os?.length ?? 0) > 0 && selectedOS) {
        if (!param.supported_os!.includes(selectedOS)) return true;
    }
    // hide_conditions evaluation
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
 * Applies supported_os + hide_conditions filtering.
 */
export function groupBuildParams(
    params: BuildParam[],
    values: Record<string, unknown> = {},
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
export function formatParamValue(param: BuildParam, val: any): string {
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
