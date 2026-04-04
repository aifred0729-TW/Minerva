import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { initialWorkflow } from './eventing.types';

export const CreateWorkflowModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onCreate: (yaml: string, filename: string) => void;
}> = ({ isOpen, onClose, onCreate }) => {
    const [code, setCode] = useState(initialWorkflow);
    const [filename, setFilename] = useState('workflow.yaml');

    const handleSubmit = () => {
        onCreate(code, filename);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-void border border-ghost/30 rounded-lg w-[90vw] max-w-5xl max-h-[90vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-ghost/30">
                    <h2 className="text-xl font-bold text-signal">CREATE EVENTING WORKFLOW</h2>
                    <button onClick={onClose} className="text-ghost hover:text-signal">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm text-ghost mb-2">Workflow Filename</label>
                        <input
                            type="text"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            className="w-full bg-void border border-ghost/30 rounded px-3 py-2 text-signal focus:border-signal outline-none"
                            placeholder="workflow.yaml"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-ghost mb-2">Workflow Definition (YAML)</label>
                        <div className="border border-ghost/30 rounded overflow-hidden">
                            <textarea
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                className="w-full h-[400px] bg-black/50 text-signal font-mono text-sm p-4 resize-none focus:outline-none"
                                placeholder="# Enter your workflow YAML here..."
                                spellCheck={false}
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 p-4 border-t border-ghost/30">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-ghost/30 rounded text-ghost hover:text-signal hover:border-signal transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-4 py-2 bg-signal text-void rounded hover:bg-signal/80 transition-colors flex items-center gap-2"
                    >
                        <Check size={16} />
                        Create Workflow
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};
