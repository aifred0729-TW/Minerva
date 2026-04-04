import React from 'react';
import { motion } from 'framer-motion';
import { Zap, Check, AlertCircle, Users } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { EventGroup } from './eventing.types';
import { getTriggerColor } from './eventing.types';

export const EventGroupCard: React.FC<{
    eventGroup: EventGroup;
    onClick: () => void;
}> = ({ eventGroup, onClick }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            onClick={onClick}
            className={cn(
                "p-4 border rounded-lg cursor-pointer transition-all",
                eventGroup.deleted
                    ? "border-alert/30 bg-alert/5 opacity-60"
                    : eventGroup.active
                        ? "border-ghost/30 bg-void hover:border-signal"
                        : "border-ghost/20 bg-void/50 opacity-70 hover:border-ghost/50"
            )}
        >
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Zap className={eventGroup.active ? "text-signal" : "text-ghost"} size={18} />
                    <h3 className="font-bold text-signal">{eventGroup.name}</h3>
                </div>
                <span className={cn("px-2 py-0.5 rounded text-xs font-mono", getTriggerColor(eventGroup.trigger))}>
                    {eventGroup.trigger}
                </span>
            </div>

            <p className="text-ghost text-sm mb-3 line-clamp-2">
                {eventGroup.description || 'No description'}
            </p>

            <div className="flex items-center justify-between text-xs text-ghost">
                <div className="flex items-center gap-2">
                    <Users size={14} />
                    {eventGroup.operator?.username || 'Unknown'}
                </div>
                <div className="flex items-center gap-2">
                    {eventGroup.approved_to_run ? (
                        <span className="flex items-center gap-1 text-matrix">
                            <Check size={14} />
                            Approved
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-alert">
                            <AlertCircle size={14} />
                            Pending
                        </span>
                    )}
                </div>
            </div>

            {eventGroup.keywords && eventGroup.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                    {eventGroup.keywords.slice(0, 3).map((keyword, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 bg-signal/10 text-signal/70 rounded text-xs">
                            {keyword}
                        </span>
                    ))}
                    {eventGroup.keywords.length > 3 && (
                        <span className="text-ghost text-xs">+{eventGroup.keywords.length - 3} more</span>
                    )}
                </div>
            )}
        </motion.div>
    );
};
