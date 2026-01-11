import React, { useEffect, useState } from 'react';
import { useQuery } from '@apollo/client';
import { GET_C2_PROFILES } from './queries';
import { CreatePayloadParameter } from './BuildParameters';
import { Disc, Plus, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { CyberDropdown } from '../../components/CyberDropdown';
import * as RandExp from 'randexp';

interface Step4Props {
    payloadType: string;
    os: string;
    currentC2Profiles: any[];
    onUpdate: (profiles: any[]) => void;
}

const getDefaultValueForType = (parameter: any) => {
    // all default values will be strings, so convert them
    if(parameter.randomize && parameter.format_string !== ""){
        try {
            return new RandExp(parameter.format_string).gen();
        } catch (e) {
            console.error("RandExp error", e);
            return parameter.default_value;
        }
    }
    switch (parameter.parameter_type) {
        case "String":
            return parameter.default_value;
        case "Number":
            // automatic casting to number for multiplication
            if (parameter.default_value === "") return 0;
            return Number(parameter.default_value);
        case "ChooseOne":
            return parameter.default_value;
        case "ChooseOneCustom":
            return parameter.default_value;
        case "ChooseMultiple":
            // default_value will be a json string of an array
            try { return JSON.parse(parameter.default_value); } catch(e) { return []; }
        case "Array":
            try { return JSON.parse(parameter.default_value); } catch(e) { return []; }
        case "TypedArray":
            try { return JSON.parse(parameter.default_value); } catch(e) { return []; }
        case "Boolean":
            return parameter.default_value === "true";
        case "Dictionary":
            // this will be an array of configuration
            if(typeof parameter.choices === "string"){
                try {
                    let dictChoices = JSON.parse(parameter.choices);
                    return dictChoices.map( (c: any) => {
                        return {...c, value: c.default_value}
                    })
                } catch(e) { return []; }
            }else{
                return parameter.choices.map( (c: any) => {
                    return {...c, value: c.default_value}
                });
            }
        case "FileMultiple":
            return [];
        case "File":
            return {name: parameter.default_value};
        case "Date":
            // date default_value is a string of a number representing the day offset
            try {
                var tmpDate = new Date();
                tmpDate.setDate(tmpDate.getDate() + parseInt(parameter.default_value * 1));
                return tmpDate.toISOString().slice(0,10); 
            } catch(e) { return new Date().toISOString().slice(0,10); }
        default:
            return parameter.default_value;
    }
}

export function Step4C2Profiles({ payloadType, os, currentC2Profiles, onUpdate }: Step4Props) {
    const { data, loading, error } = useQuery(GET_C2_PROFILES, {
        variables: { payloadType: payloadType, operation_id: 0 }
    });

    const [selectedProfileId, setSelectedProfileId] = useState<string>("");
    const [availableProfiles, setAvailableProfiles] = useState<any[]>([]);

    useEffect(() => {
        if (data?.c2profile) {
            setAvailableProfiles(data.c2profile);
        }
    }, [data]);

    const handleAddProfile = () => {
        if (!selectedProfileId) return;
        const profile = availableProfiles.find(p => p.id === parseInt(selectedProfileId));
        if (profile) {
            // Initialize parameters with defaults
            const initializedParams = profile.c2profileparameters.map((p: any) => ({
                ...p,
                value: getDefaultValueForType(p),
                error: false
            }));
            
            const newInstance = {
                ...profile,
                instance_id: Date.now(), // Temporary ID for UI handling
                c2profileparameters: initializedParams
            };
            
            onUpdate([...currentC2Profiles, newInstance]);
            setSelectedProfileId("");
        }
    };

    const handleRemoveProfile = (instanceId: number) => {
        onUpdate(currentC2Profiles.filter(p => p.instance_id !== instanceId));
    };

    const handleParamChange = (instanceId: number, paramName: string, value: any, error: boolean) => {
        const updatedProfiles = currentC2Profiles.map(p => {
            if (p.instance_id === instanceId) {
                const updatedParams = p.c2profileparameters.map((param: any) => 
                    param.name === paramName ? { ...param, value, error } : param
                );
                return { ...p, c2profileparameters: updatedParams };
            }
            return p;
        });
        onUpdate(updatedProfiles);
    };

    if (loading) return <div className="flex items-center gap-2 text-signal"><Disc className="animate-spin" /> LOADING_C2_PROFILES...</div>;
    if (error) return <div className="text-red-500">ERROR_LOADING_C2: {error.message}</div>;

    // Prepare dropdown options
    const profileOptions = availableProfiles.map(p => ({
        label: `${p.name} - ${p.description}`,
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
                
                {currentC2Profiles.map((profile, idx) => (
                    <div key={profile.instance_id} className="border border-ghost/30 bg-black/40">
                        <div className="bg-white/5 p-3 px-4 flex justify-between items-center border-b border-ghost/30">
                            <div className="flex items-center gap-2">
                                <span className="text-signal font-bold font-mono">{profile.name}</span>
                                <span className="text-xs text-gray-400">Instance #{idx + 1}</span>
                            </div>
                            <button 
                                onClick={() => handleRemoveProfile(profile.instance_id)}
                                className="text-gray-500 hover:text-red-500 transition-colors"
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
                ))}
            </div>
        </div>
    );
}
