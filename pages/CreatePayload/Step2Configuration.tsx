import React, { useEffect, useState } from 'react';
import { useQuery } from '@apollo/client';
import { GET_BUILD_PARAMETERS } from './queries';
import { CreatePayloadParameter } from './BuildParameters';
import { Disc } from 'lucide-react';

interface Step2Props {
    payloadType: string;
    os: string;
    currentConfig: any[];
    onUpdate: (params: any[]) => void;
}

export function Step2Configuration({ payloadType, os, currentConfig, onUpdate }: Step2Props) {
    const { data, loading, error } = useQuery(GET_BUILD_PARAMETERS, {
        variables: { payloadtype: payloadType }
    });

    const [parameters, setParameters] = useState<any[]>([]);

    useEffect(() => {
        if (data?.payloadtype?.[0]?.buildparameters) {
            // Merge with existing config if available, otherwise set defaults
            const fetchedParams = data.payloadtype[0].buildparameters;
            
            const mergedParams = fetchedParams.map((param: any) => {
                const existing = currentConfig.find((p: any) => p.name === param.name);
                return existing ? { ...param, ...existing } : { ...param, value: param.default_value };
            });
            
            setParameters(mergedParams);
            if (currentConfig.length === 0) {
                onUpdate(mergedParams);
            }
        }
    }, [data, currentConfig, onUpdate]);

    const handleParamChange = (name: string, value: any, error: boolean) => {
        const newParams = parameters.map(p => 
            p.name === name ? { ...p, value, error } : p
        );
        setParameters(newParams);
        onUpdate(newParams);
    };

    if (loading) return <div className="flex items-center gap-2 text-signal"><Disc className="animate-spin" /> LOADING_PARAMETERS...</div>;
    if (error) return <div className="text-red-500">ERROR_LOADING_PARAMETERS: {error.message}</div>;

    // Grouping Logic
    const groups = parameters.reduce((acc: any, param: any) => {
        const group = param.group_name || "Basic Options";
        if (!acc[group]) acc[group] = [];
        
        // Check filtering (supported_os)
        if (param.supported_os && param.supported_os.length > 0 && !param.supported_os.includes(os)) {
            return acc;
        }
        
        acc[group].push(param);
        return acc;
    }, {});

    return (
        <div className="space-y-8">
            {Object.entries(groups).map(([groupName, groupParams]: [string, any[]]) => (
                <div key={groupName} className="border border-ghost/30 bg-black/40">
                    <div className="bg-white/5 p-2 px-4 font-mono font-bold text-signal border-b border-ghost/30 uppercase tracking-widest text-sm">
                        {groupName}
                    </div>
                    <table className="w-full text-left border-collapse">
                        <tbody>
                            {groupParams.map((param: any) => (
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
