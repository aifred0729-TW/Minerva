import React, { useState } from 'react';
import { useMutation } from "@apollo/client/react";
import { motion } from 'framer-motion';
import { X, Play } from 'lucide-react';
import { snackActions } from '../../lib/snackbar';
import { TRIGGER_KEYWORD } from '../../lib/api';

export const KeywordTriggerModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    keywords: string[];
}> = ({ isOpen, onClose, keywords }) => {
    const [selectedKeyword, setSelectedKeyword] = useState(keywords[0] || '');
    const [envPairs, setEnvPairs] = useState<Array<{key: string; value: string}>>([]);

    const [triggerKeyword] = useMutation<any>(TRIGGER_KEYWORD, {
        onCompleted: (data: any) => {
            if (data.eventingTriggerKeyword.status === 'success') {
                snackActions.success('Keyword trigger sent successfully');
                onClose();
            } else {
                snackActions.error(data.eventingTriggerKeyword.error);
            }
        },
        onError: (err) => snackActions.error('Trigger failed: ' + err.message),
    });

    const handleTrigger = () => {
        const envData: Record<string, string> = {};
        envPairs.forEach(p => { if (p.key.trim()) envData[p.key.trim()] = p.value; });
        triggerKeyword({ variables: { keyword: selectedKeyword, keywordEnvData: envData } });
    };

    if (!isOpen) return null;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-void border border-ghost/30 rounded-lg w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-ghost/30">
                    <h2 className="text-lg font-bold text-signal font-mono">TRIGGER BY KEYWORD</h2>
                    <button onClick={onClose} className="text-ghost hover:text-signal"><X size={20} /></button>
                </div>
                <div className="p-4 space-y-4">
                    <div>
                        <label className="text-xs text-ghost mb-1 block font-mono">Keyword</label>
                        <select value={selectedKeyword} onChange={e => setSelectedKeyword(e.target.value)}
                            className="w-full h-9 px-3 bg-black/50 border border-ghost/30 rounded text-signal font-mono text-sm focus:border-signal outline-none">
                            {keywords.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs text-ghost font-mono">Environment Data (optional)</label>
                            <button onClick={() => setEnvPairs([...envPairs, { key: '', value: '' }])}
                                className="text-xs text-signal hover:text-white font-mono">+ Add</button>
                        </div>
                        {envPairs.map((pair, i) => (
                            <div key={i} className="flex items-center gap-2 mb-1.5">
                                <input value={pair.key} onChange={e => { const n = [...envPairs]; n[i].key = e.target.value; setEnvPairs(n); }}
                                    placeholder="key" className="flex-1 h-8 px-2 bg-black/50 border border-ghost/30 rounded text-white text-xs font-mono focus:border-signal outline-none" />
                                <input value={pair.value} onChange={e => { const n = [...envPairs]; n[i].value = e.target.value; setEnvPairs(n); }}
                                    placeholder="value" className="flex-1 h-8 px-2 bg-black/50 border border-ghost/30 rounded text-white text-xs font-mono focus:border-signal outline-none" />
                                <button onClick={() => setEnvPairs(envPairs.filter((_, j) => j !== i))}
                                    className="text-ghost hover:text-alert"><X size={14} /></button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex justify-end gap-3 p-4 border-t border-ghost/30">
                    <button onClick={onClose} className="px-4 py-2 text-ghost hover:text-signal font-mono text-sm">Cancel</button>
                    <button onClick={handleTrigger}
                        className="px-4 py-2 bg-signal text-void rounded hover:bg-signal/80 transition-colors flex items-center gap-2 font-mono text-sm">
                        <Play size={14} />Trigger
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};
