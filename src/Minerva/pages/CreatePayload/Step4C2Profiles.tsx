import React, { useEffect, useState } from 'react';
import { useQuery, useLazyQuery, useReactiveVar } from '@apollo/client';
import { GET_C2_PROFILES, GET_C2_INSTANCE_PARAMS, GET_C2_DEFAULTS } from './queries';
import { CreatePayloadParameter } from './BuildParameters';
import { Disc, Plus, X } from 'lucide-react';

import { CyberDropdown } from '../../components/CyberDropdown';
import * as RandExp from 'randexp';
import { meState } from '../../lib/state';
import { snackActions } from '../../lib/snackbar';

interface Step4Props {
    payloadType: string;
    os: string;
    currentC2Profiles: any[];
    onUpdate: (profiles: any[]) => void;
    payloadTypeInfo: any | null;
}

const getDefaultChoices = (param: any) => {
    if (param.parameter_type === "Dictionary") {
        if (typeof param.choices === "string") {
            try { return JSON.parse(param.choices); } catch (e) { return []; }
        }
        return Array.isArray(param.choices) ? param.choices : [];
    }
    if (typeof param.choices === "string") {
        try { return JSON.parse(param.choices); } catch (e) { return []; }
    }
    return Array.isArray(param.choices) ? param.choices : [];
};

const getDefaultValueForType = (parameter: any) => {
    if (parameter.randomize && parameter.format_string !== "") {
        try { return new (RandExp as any)(parameter.format_string).gen(); } catch (e) { return parameter.default_value; }
    }
    switch (parameter.parameter_type) {
        case "String": return parameter.default_value;
        case "Number": return parameter.default_value === "" ? 0 : Number(parameter.default_value);
        case "ChooseOne": return parameter.default_value;
        case "ChooseOneCustom": return parameter.default_value;
        case "ChooseMultiple":
            try { return JSON.parse(parameter.default_value); } catch (e) { return []; }
        case "Array":
            try { return JSON.parse(parameter.default_value); } catch (e) { return []; }
        case "TypedArray":
            try { return JSON.parse(parameter.default_value); } catch (e) { return []; }
        case "Boolean": return parameter.default_value === "true";
        case "Dictionary": {
            const choices = getDefaultChoices(parameter);
            return choices.map((c: any) => ({ ...c, value: c.default_value }));
        }
        case "FileMultiple": return [];
        case "File": return { name: parameter.default_value };
        case "Date": {
            try {
                const d = new Date();
                d.setDate(d.getDate() + parseInt(String(parameter.default_value ?? "1")));
                return d.toISOString().slice(0, 10);
            } catch (e) { return new Date().toISOString().slice(0, 10); }
        }
        default: return parameter.default_value;
    }
};

const getModifiedC2Params = (c2: any, c2profileparameters: any[], payloadTypeInfo: any, useSuppliedValues: boolean): any[] => {
    const deviations = payloadTypeInfo?.c2_parameter_deviations;
    return c2profileparameters.reduce((prev: any[], param: any) => {
        const initialValue = getDefaultValueForType(param);
        let configuredParam = {
            ...param,
            error: false,
            value: initialValue,
            trackedValue: initialValue,
            initialValue: initialValue,
            choices: getDefaultChoices(param),
        };
        if (useSuppliedValues) {
            configuredParam = { ...param };
        }

        // Apply c2_parameter_deviations if present
        if (!deviations || !deviations[c2.name] || !deviations[c2.name][param.name]) {
            return [...prev, { ...configuredParam }];
        }
        const c2Config = deviations[c2.name][param.name];
        if (c2Config.supported === false) return prev;
        if (c2Config.default_value !== undefined) {
            configuredParam.value = c2Config.default_value;
            configuredParam.trackedValue = c2Config.default_value;
            configuredParam.initialValue = c2Config.default_value;
        }
        if (c2Config.dictionary_choices !== undefined && c2Config.dictionary_choices !== null) {
            configuredParam.choices = c2Config.dictionary_choices.map((c: any) => ({ ...c, value: c.default_value }));
            configuredParam.value = configuredParam.choices;
            configuredParam.trackedValue = configuredParam.choices;
            configuredParam.initialValue = configuredParam.choices;
        } else if (c2Config.choices !== undefined && c2Config.choices !== null) {
            configuredParam.choices = c2Config.choices;
            if (!configuredParam.choices.includes(configuredParam.default_value) && configuredParam.choices.length > 0) {
                configuredParam.value = configuredParam.choices[0];
                configuredParam.trackedValue = configuredParam.choices[0];
                configuredParam.initialValue = configuredParam.choices[0];
            }
        }
        return [...prev, { ...configuredParam }];
    }, []);
};

export function Step4C2Profiles({ payloadType, os, currentC2Profiles, onUpdate, payloadTypeInfo }: Step4Props) {
    const me = useReactiveVar(meState);
    const operationId = (me as any)?.user?.current_operation_id || 0;

    const { data, loading, error } = useQuery(GET_C2_PROFILES, {
        variables: { payloadType: payloadType, operation_id: operationId },
        fetchPolicy: "no-cache",
    });

    const [selectedProfileId, setSelectedProfileId] = useState<string>("");
    const [availableProfiles, setAvailableProfiles] = useState<any[]>([]);

    const [getC2InstanceParams] = useLazyQuery(GET_C2_INSTANCE_PARAMS, { fetchPolicy: "no-cache" });
    const [getC2Defaults] = useLazyQuery(GET_C2_DEFAULTS, { fetchPolicy: "no-cache" });

    useEffect(() => {
        if (data?.c2profile) {
            const profiles = data.c2profile.map((c2: any) => {
                const params = getModifiedC2Params(c2, c2.c2profileparameters, payloadTypeInfo, false);
                return { ...c2, c2profileparameters: params, selected_instance: "None" };
            });
            profiles.sort((a: any, b: any) => a.name.localeCompare(b.name));
            setAvailableProfiles(profiles);
        }
    }, [data, payloadTypeInfo]);

    const handleAddProfile = () => {
        if (!selectedProfileId) return;
        const profile = availableProfiles.find((p: Record<string, unknown>) => p.id === parseInt(selectedProfileId));
        if (!profile) return;

        // Check supports_multiple_c2_in_build
        if (payloadTypeInfo && !payloadTypeInfo.supports_multiple_c2_in_build && currentC2Profiles.length >= 1) {
            snackActions.warning("This payload type does not support multiple C2 profiles");
            return;
        }
        // Check supports_multiple_c2_instances_in_build (same profile twice)
        if (payloadTypeInfo && !payloadTypeInfo.supports_multiple_c2_instances_in_build) {
            if (currentC2Profiles.some((p: Record<string, unknown>) => p.name === profile.name)) {
                snackActions.warning("This payload type does not support multiple instances of the same C2 profile");
                return;
            }
        }

        const newInstance = {
            ...profile,
            instance_id: Date.now(),
        };
        onUpdate([...currentC2Profiles, newInstance]);
        setSelectedProfileId("");
    };

    const handleRemoveProfile = (instanceId: number) => {
        onUpdate(currentC2Profiles.filter((p: Record<string, unknown>) => p.instance_id !== instanceId));
    };

    const handleParamChange = (instanceId: number, paramName: string, value: any, hasError: boolean) => {
        const updatedProfiles = currentC2Profiles.map((p: Record<string, unknown>) => {
            if (p.instance_id === instanceId) {
                const updatedParams = p.c2profileparameters.map((param: any) =>
                    param.name === paramName ? { ...param, value, error: hasError } : param
                );
                return { ...p, c2profileparameters: updatedParams };
            }
            return p;
        });
        onUpdate(updatedProfiles);
    };

    const handleLoadInstance = async (instanceId: number, profile: any, instanceName: string) => {
        if (instanceName === "None") {
            // Reset to defaults
            try {
                const { data: defaultsData } = await getC2Defaults({ variables: { c2profile_id: profile.id } });
                if (defaultsData?.c2profile_by_pk) {
                    const defaults = defaultsData.c2profile_by_pk.c2profileparameters;
                    const resetParams = getModifiedC2Params(profile, defaults, payloadTypeInfo, false);
                    const updatedProfiles = currentC2Profiles.map((p: Record<string, unknown>) =>
                        p.instance_id === instanceId
                            ? { ...p, c2profileparameters: resetParams, selected_instance: "None" }
                            : p
                    );
                    onUpdate(updatedProfiles);
                }
            } catch (e) {
                snackActions.error("Failed to reset C2 defaults");
            }
            return;
        }

        try {
            const { data: instanceData } = await getC2InstanceParams({
                variables: { name: instanceName, operation_id: operationId, c2_profile_id: profile.id }
            });
            if (instanceData?.c2profileparametersinstance) {
                const instanceValues = instanceData.c2profileparametersinstance;
                const updatedParams = profile.c2profileparameters.map((param: any) => {
                    const instanceVal = instanceValues.find((iv: any) => iv.c2profileparameter?.name === param.name);
                    if (instanceVal) {
                        const newVal = instanceVal.value !== undefined ? instanceVal.value : param.value;
                        return { ...param, value: newVal, trackedValue: newVal };
                    }
                    return param;
                });
                const updatedProfiles = currentC2Profiles.map((p: Record<string, unknown>) =>
                    p.instance_id === instanceId
                        ? { ...p, c2profileparameters: updatedParams, selected_instance: instanceName }
                        : p
                );
                onUpdate(updatedProfiles);
            }
        } catch (e) {
            snackActions.error("Failed to fetch instance data");
        }
    };

    if (loading) return <div className="flex items-center gap-2 text-signal"><Disc className="animate-spin" /> LOADING_C2_PROFILES...</div>;
    if (error) return <div className="text-red-500">ERROR_LOADING_C2: {error.message}</div>;

    const profileOptions = availableProfiles.map((p: Record<string, unknown>) => ({
        label: `${p.name}${p.is_p2p ? ' [P2P]' : ''} - ${p.description}`,
        value: String(p.id)
    }));

    return (
        <div className="space-y-6">
            {/* Add Profile Section */}
            <div className="flex gap-4 items-end bg-white/5 p-4 border border-ghost/30">
                <div className="flex-1">
                    <label className="block text-xs font-mono text-gray-400 mb-2">AVAILABLE_PROFILES</label>
                    <CyberDropdown
                        options={profileOptions}
                        value={selectedProfileId}
                        onChange={(val) => setSelectedProfileId(val)}
                        placeholder="SELECT_PROFILE_TO_ADD..."
                    />
                </div>
                <button
                    onClick={handleAddProfile}
                    disabled={!selectedProfileId}
                    className="px-4 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white disabled:opacity-50 transition-colors flex items-center gap-2 h-[38px] border border-transparent"
                >
                    <Plus size={16} /> ADD_PROFILE
                </button>
            </div>

            {/* Configured Profiles List */}
            <div className="space-y-4">
                {currentC2Profiles.length === 0 && (
                    <div className="text-center py-12 border border-dashed border-gray-800 text-gray-500 font-mono">
                        NO_C2_PROFILES_CONFIGURED
                    </div>
                )}

                {currentC2Profiles.map((profile: any, idx: number) => {
                    const instanceOptions = [
                        { label: "None (defaults)", value: "None" },
                        ...(profile.c2profileparametersinstances || []).map((inst: any) => ({
                            label: inst.instance_name,
                            value: inst.instance_name,
                        }))
                    ];
                    const hasInstances = (profile.c2profileparametersinstances || []).length > 0;

                    return (
                        <div key={profile.instance_id} className="border border-ghost/30 bg-black/40">
                            <div className="bg-white/5 p-3 px-4 flex justify-between items-center border-b border-ghost/30">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <span className="text-signal font-bold font-mono">{profile.name}</span>
                                    <span className="text-xs text-gray-400">Instance #{idx + 1}</span>
                                    {profile.is_p2p && (
                                        <span className="text-[10px] border border-blue-500 text-blue-400 px-1 font-mono">P2P</span>
                                    )}
                                    {hasInstances && (
                                        <div className="flex items-center gap-2 ml-auto mr-2">
                                            <span className="text-[10px] text-gray-500 font-mono">PRESET:</span>
                                            <div className="w-48">
                                                <CyberDropdown
                                                    options={instanceOptions}
                                                    value={profile.selected_instance || "None"}
                                                    onChange={(val) => handleLoadInstance(profile.instance_id, profile, val)}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => handleRemoveProfile(profile.instance_id)}
                                    className="text-gray-500 hover:text-red-500 transition-colors ml-2 shrink-0"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="p-4">
                                <table className="w-full text-left border-collapse">
                                    <tbody>
                                        {profile.c2profileparameters.map((param: any) => (
                                            <CreatePayloadParameter
                                                key={param.id}
                                                {...param}
                                                trackedValue={param.value}
                                                payload_type={payloadType}
                                                selected_os={os}
                                                onChange={(n, v, e) => handleParamChange(profile.instance_id, n, v, e)}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
