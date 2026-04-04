import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, ChevronUp, ChevronDown, Copy, Loader, Package, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { decodeFilename } from './createWrapper.utils';
import type { PayloadType, ExistingWrapper } from './createWrapper.types';
import { AgentIcon } from './SharedComponents';

export const Step1SelectWrapper: React.FC<{
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
    const [showExisting, setShowExisting] = useState(true);

    const filteredWrappers = useMemo(() => {
        if (!osFilter) return wrapperTypes;
        return wrapperTypes.filter(pt => pt.supported_os.includes(osFilter));
    }, [wrapperTypes, osFilter]);

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-signal mb-4">SELECT WRAPPER TYPE</h2>

            {/* Copy-from-existing */}
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

            {/* Divider */}
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
