// ═════════════════════════════════════════════════════════════════════
//  BroadcastComposerModal — lead/admin composes an Important Broadcast
//
//  Sends via the existing Mythic Hasura action `createOperationEventLog`
//  with source='minerva_broadcast'. Every operator's <EventNotifications/>
//  bridge picks it up from the operationeventlog_stream subscription and
//  pushes it into their local broadcastBus, so every online operator's
//  ImportantBroadcast bar lights up at the same time.
//
//  Sender included: the server fans the same event to the sender too,
//  so their own bar lights up via the subscription. We do NOT push
//  optimistically — that would duplicate the broadcast.
// ═════════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import { useMutation } from "@apollo/client/react";
import { motion } from 'framer-motion';
import { Megaphone, Send, X } from 'lucide-react';
import { CREATE_OPERATION_EVENT_LOG } from '../lib/api';
import { snackActions } from '../lib/snackbar';
import { cn } from '../lib/utils';
import type { BroadcastLevel } from '../lib/broadcastBus';
import { LEVEL_TONE } from './broadcastTheme';
import { ModalBackdrop, Field } from '../pages/Operations/modals';

interface LevelOption {
    key: BroadcastLevel;
    eventLogLevel: 'info' | 'warning';
    warning: boolean;
}

const LEVELS: LevelOption[] = [
    { key: 'info',     eventLogLevel: 'info',    warning: false },
    { key: 'ops',      eventLogLevel: 'info',    warning: false },
    { key: 'warning',  eventLogLevel: 'warning', warning: true  },
    { key: 'critical', eventLogLevel: 'warning', warning: true  },
];

const TITLE_MAX = 80;
const BODY_MAX = 240;

export interface BroadcastComposerModalProps {
    onClose: () => void;
    /** Display name of the current operation, shown for context. */
    operationName?: string;
    /** Username of the sender, shown for confirmation. */
    senderUsername?: string;
}

export function BroadcastComposerModal({ onClose, operationName, senderUsername }: BroadcastComposerModalProps) {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [level, setLevel] = useState<BroadcastLevel>('warning');
    const [createEvent, { loading }] = useMutation<any>(CREATE_OPERATION_EVENT_LOG);

    const activeOpt = LEVELS.find(l => l.key === level) || LEVELS[2];
    const activeTone = LEVEL_TONE[level];
    const ActivePreviewIcon = activeTone.icon;

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) {
            snackActions.warning('A title is required.');
            return;
        }
        try {
            const payload = JSON.stringify({
                minerva_broadcast: 1,
                level,
                title: t.slice(0, TITLE_MAX),
                body: body.trim().slice(0, BODY_MAX),
                from: senderUsername,
            });
            // Use a unique source per broadcast so the Mythic server's
            // SendAllOperationsMessage never deduplicates by source-key.
            // When warning=true, Mythic would UPDATE the existing row
            // (same source) instead of INSERTing — the stream subscription
            // only fires on INSERT, so B never receives it.
            const uniqueSource = `minerva_broadcast:${crypto.randomUUID()}`;
            const { data } = await createEvent({
                variables: {
                    level: activeOpt.eventLogLevel,
                    message: payload,
                    source: uniqueSource,
                    warning: activeOpt.warning,
                },
            });
            const res = data?.createOperationEventLog;
            if (res?.status === 'error') throw new Error(res.error || 'unknown error');
            snackActions.success('Broadcast sent to all online operators.');
            onClose();
        } catch (err: any) {
            snackActions.error(err.message || 'Broadcast failed');
        }
    };

    return (
        <ModalBackdrop onClose={onClose} wide>
            <div className="p-6 flex-1 overflow-y-auto cyber-scrollbar max-h-[85vh]">
                <h2 className="text-lg font-bold tracking-widest mb-1 flex items-center gap-2 uppercase">
                    <Megaphone size={20} className="text-signal" />Important Broadcast
                </h2>
                <p className="text-xs font-mono text-gray-300 mb-5 tracking-wide">
                    Sends to every online operator ONLY in
                    {operationName ? <> <span className="text-signal">{operationName}</span></> : ' the current operation'}
                    {' '}via the Mythic event channel. Their <span className="text-signal">Important Broadcast</span> bar will light up.
                </p>

                <form onSubmit={onSubmit} className="space-y-5">
                    <Field label="Severity">
                        <div className="grid grid-cols-4 gap-2">
                            {LEVELS.map(l => {
                                const t = LEVEL_TONE[l.key];
                                const Icon = t.icon;
                                const active = l.key === level;
                                return (
                                    <button
                                        key={l.key}
                                        type="button"
                                        onClick={() => setLevel(l.key)}
                                        className={cn(
                                            'flex flex-col items-center gap-1.5 px-3 py-3 border font-mono text-xs uppercase tracking-widest transition-colors',
                                            active ? cn(t.border, t.fg, t.bar.replace('bg-', 'bg-') + '/10', 'font-semibold') : 'border-gray-700 text-gray-300 hover:text-white hover:border-gray-500',
                                        )}
                                    >
                                        <Icon size={18} />
                                        {t.label}
                                    </button>
                                );
                            })}
                        </div>
                    </Field>

                    <Field label={`Headline · ${title.length}/${TITLE_MAX}`}>
                        <input
                            value={title}
                            onChange={e => setTitle(e.target.value.slice(0, TITLE_MAX))}
                            placeholder="e.g. STAGING WINDOW OPENS IN 5 MIN"
                            maxLength={TITLE_MAX}
                            autoFocus
                            className="w-full bg-black/50 border border-gray-700 focus:border-signal px-3 py-2.5 text-white outline-none font-mono text-sm"
                        />
                    </Field>

                    <Field label={`Detail (optional) · ${body.length}/${BODY_MAX}`}>
                        <textarea
                            value={body}
                            onChange={e => setBody(e.target.value.slice(0, BODY_MAX))}
                            rows={3}
                            placeholder="Add brief context — coordinates, timing, callsigns…"
                            maxLength={BODY_MAX}
                            className="w-full bg-black/50 border border-gray-700 focus:border-signal px-3 py-2.5 text-white outline-none font-mono text-sm resize-none"
                        />
                    </Field>

                    {/* Preview */}
                    <div>
                        <div className="text-[10px] font-mono text-gray-300 uppercase tracking-widest mb-2">Preview</div>
                        <motion.div
                            key={level + title + body}
                            initial={{ opacity: 0.6, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25 }}
                            className={cn('flex items-center gap-3 px-3 py-2.5 border bg-black/85', activeTone.border)}
                        >
                            <div className={cn('flex-shrink-0 grid place-items-center w-9 h-9 border', activeTone.border, activeTone.fg)}>
                                <ActivePreviewIcon size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className={cn('text-xs font-mono uppercase tracking-widest font-semibold truncate', activeTone.fg)}>
                                    {title.trim() || 'HEADLINE_PLACEHOLDER'}
                                </div>
                                {body.trim() && (
                                    <div className="text-xs font-mono text-gray-100 truncate mt-0.5">
                                        {body.trim()}
                                    </div>
                                )}
                            </div>
                            <div className={cn('text-[9px] font-mono uppercase tracking-widest font-semibold flex-shrink-0', activeTone.fg)}>
                                {activeTone.label}
                            </div>
                        </motion.div>
                    </div>

                    <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 text-gray-300 hover:text-white font-mono text-xs uppercase tracking-widest">
                            <X size={13} className="inline mr-1.5" />Cancel
                        </button>
                        <button type="submit" disabled={loading || !title.trim()}
                            className={cn(
                                'flex items-center gap-2 px-6 py-2 font-bold font-mono text-xs uppercase tracking-widest transition-colors',
                                loading || !title.trim()
                                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                    : 'bg-signal text-void hover:bg-white',
                            )}>
                            <Send size={13} />
                            {loading ? 'TRANSMITTING…' : 'BROADCAST'}
                        </button>
                    </div>
                </form>
            </div>
        </ModalBackdrop>
    );
}

export default BroadcastComposerModal;
