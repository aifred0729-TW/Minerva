import React, { useMemo, useState } from 'react';
import { useReactiveVar } from "@apollo/client/react";
import { motion, AnimatePresence } from 'framer-motion';
import { Box, Loader, Info } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toLocalTime } from '../../lib/time';
import { decodeFilename } from './createWrapper.utils';
import { meState } from '../../lib/state';
import type { Payload, PayloadType } from './createWrapper.types';
import { AgentIcon, MiniStepProgress, EditButton } from './SharedComponents';
import { PayloadDetailModal } from './PayloadDetailModal';

export const Step2SelectPayload: React.FC<{
    payloads: Payload[];
    loading: boolean;
    wrapperType: PayloadType | null;
    selected: Payload | null;
    onSelect: (p: Payload) => void;
    onEditWrapper: () => void;
}> = ({ payloads, loading, wrapperType, selected, onSelect, onEditWrapper }) => {
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
                                    Created: {toLocalTime(p.creation_time, (me?.user?.view_utc_time as boolean) ?? false)}
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

            {/* Payload detail modal */}
            <AnimatePresence>
                {detailPayload && (
                    <PayloadDetailModal payload={detailPayload} onClose={() => setDetailPayload(null)} />
                )}
            </AnimatePresence>
        </div>
    );
};
