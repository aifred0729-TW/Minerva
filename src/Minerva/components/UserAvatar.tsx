import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { useGetMythicSetting, useSetMythicSetting } from './MythicSavedUserSetting';
import { Check } from 'lucide-react';

const AVATAR_COLORS = [
    '#22d3ee', // cyan (signal)
    '#6366f1', // indigo
    '#a855f7', // purple
    '#ec4899', // pink
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#4ade80', // green
    '#14b8a6', // teal
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#f43f5e', // rose
];

interface UserAvatarProps {
    username: string;
    size?: number;
    editable?: boolean;
    className?: string;
}

export function UserAvatar({ username, size = 32, editable = false, className }: UserAvatarProps) {
    const [showPicker, setShowPicker] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
    const avatarColor = useGetMythicSetting({ setting_name: 'avatarColor', default_value: AVATAR_COLORS[0] });
    const [setSetting] = useSetMythicSetting();

    const initials = username
        ? username.slice(0, 2).toUpperCase()
        : '??';

    const pickerHeight = 140; // approximate height of the color picker

    const updatePosition = useCallback(() => {
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPickerPos({
                top: rect.top - pickerHeight - 8,
                left: rect.left,
            });
        }
    }, []);

    const handleTogglePicker = () => {
        if (!editable) return;
        if (!showPicker) {
            updatePosition();
        }
        setShowPicker(!showPicker);
    };

    useEffect(() => {
        if (!showPicker) return;
        const handleClick = (e: MouseEvent) => {
            if (
                pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(e.target as Node)
            ) {
                setShowPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showPicker]);

    const handleColorSelect = (color: string) => {
        setSetting({ setting_name: 'avatarColor', value: color });
        setShowPicker(false);
    };

    return (
        <div className={cn("relative", className)}>
            <button
                ref={buttonRef}
                onClick={handleTogglePicker}
                className={cn(
                    "rounded-full flex items-center justify-center shrink-0 font-bold font-mono select-none transition-all duration-200",
                    editable && "cursor-pointer hover:ring-2 hover:ring-white/30 hover:scale-105",
                    !editable && "cursor-default"
                )}
                style={{
                    width: size,
                    height: size,
                    fontSize: size * 0.38,
                    backgroundColor: avatarColor + '25',
                    border: `1.5px solid ${avatarColor}60`,
                    color: avatarColor,
                }}
                title={editable ? 'Click to customize avatar' : username}
            >
                {initials}
            </button>

            <AnimatePresence>
                {showPicker && (
                    <motion.div
                        ref={pickerRef}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="fixed p-3 bg-void border border-ghost/40 rounded-lg shadow-2xl shadow-black/60 z-[99999]"
                        style={{
                            top: pickerPos.top,
                            left: pickerPos.left,
                        }}
                    >
                        <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-2">Avatar Color</div>
                        <div className="grid grid-cols-4 gap-1.5">
                            {AVATAR_COLORS.map((color) => (
                                <button
                                    key={color}
                                    onClick={() => handleColorSelect(color)}
                                    className={cn(
                                        "w-7 h-7 rounded-full transition-all duration-150 flex items-center justify-center",
                                        "hover:scale-110 hover:ring-2 hover:ring-white/20",
                                        avatarColor === color && "ring-2 ring-white/40 scale-110"
                                    )}
                                    style={{ backgroundColor: color }}
                                >
                                    {avatarColor === color && <Check size={12} className="text-white drop-shadow" />}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
