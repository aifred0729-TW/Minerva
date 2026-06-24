import React from 'react';
import { useQueryCompat } from '../../lib/useQueryCompat';
import { Wrench } from 'lucide-react';
import { CyberModal } from '../../components/CyberModal';
import { GET_PAYLOAD_BUILD_PARAMS } from '../../lib/api';
import { cn } from '../../lib/utils';

interface BuildParam {
    id: number;
    name: string;
    description: string;
    default_value: string;
    parameter_type: string;
    required: boolean;
    verifier_regex: string;
    choices: string;
    crypto_type: boolean;
    randomize: boolean;
    format_string: string;
}

const formatChoices = (raw: string, parameterType: string): string => {
    if (!raw) return '';
    const isArray = parameterType === 'Array' || parameterType === 'ChooseMultiple' || parameterType === 'FileMultiple';
    const isChoose = parameterType.includes('Choose') && !parameterType.includes('File');
    if (!isArray && !isChoose && parameterType !== 'Dictionary' && parameterType !== 'ChooseOne') return '';
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.join(', ');
        if (parsed && typeof parsed === 'object') return JSON.stringify(parsed, null, 2);
        return String(parsed);
    } catch {
        return raw;
    }
};

const formatDefault = (raw: string, parameterType: string): string => {
    if (raw == null) return '';
    if (parameterType === 'Boolean') {
        return raw === 'true' || raw === 'True' ? 'True' : 'False';
    }
    if (parameterType === 'File') return '';
    if (parameterType === 'Dictionary') {
        try {
            return JSON.stringify(JSON.parse(raw), null, 2);
        } catch { return raw; }
    }
    return raw;
};

const Field = ({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) => (
    value ? (
        <div className="flex gap-2 text-[11px]">
            <span className="text-gray-500 shrink-0">{label}:</span>
            <pre className={cn("text-gray-300 whitespace-pre-wrap break-all m-0", mono ? "font-mono" : "")}>{value}</pre>
        </div>
    ) : null
);

export function BuildParamsDialog({ payloadName, onClose }: { payloadName: string; onClose: () => void }) {
    const { data, loading, error } = useQueryCompat<any>(GET_PAYLOAD_BUILD_PARAMS, {
        variables: { payload_name: payloadName },
        fetchPolicy: 'network-only',
    });

    const params: BuildParam[] = data?.payloadtype?.[0]?.buildparameters ?? [];

    return (
        <CyberModal title={`${payloadName} · BUILD PARAMETERS`} icon={<Wrench />} onClose={onClose} maxWidth="max-w-4xl">
            {loading && (
                <div className="text-center text-gray-400 font-mono text-sm py-8 animate-pulse">LOADING…</div>
            )}
            {error && (
                <div className="text-red-400 font-mono text-sm py-4">Error: {error.message}</div>
            )}
            {!loading && !error && params.length === 0 && (
                <div className="text-center text-gray-500 font-mono text-sm py-8">No build parameters defined</div>
            )}
            {!loading && params.length > 0 && (
                <div className="space-y-2">
                    {params.map(p => (
                        <div key={p.id} className="border border-white/10 bg-black/30 p-3 space-y-1.5">
                            <div className="flex items-baseline gap-2 flex-wrap pb-1 border-b border-white/5">
                                <span className="font-mono text-sm text-signal font-bold">{p.name}</span>
                                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{p.parameter_type}</span>
                                {p.required && <span className="text-[9px] font-mono text-amber-400 border border-amber-400/40 px-1.5 py-0.5">REQUIRED</span>}
                                {p.randomize && <span className="text-[9px] font-mono text-purple-300 border border-purple-400/40 px-1.5 py-0.5">RANDOMIZED</span>}
                                {p.crypto_type && <span className="text-[9px] font-mono text-blue-300 border border-blue-400/40 px-1.5 py-0.5">CRYPTO</span>}
                            </div>
                            {p.description && (
                                <p className="text-xs text-gray-400 mb-1">{p.description}</p>
                            )}
                            <Field label="Default" value={formatDefault(p.default_value, p.parameter_type)} />
                            <Field label="Options" value={formatChoices(p.choices, p.parameter_type)} />
                            <Field label="Verifier Regex" value={p.verifier_regex} />
                            {p.randomize && <Field label="Format String" value={p.format_string} />}
                        </div>
                    ))}
                </div>
            )}
        </CyberModal>
    );
}
