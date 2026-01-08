import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

interface Option {
    label: string;
    value: string | number;
}

interface CyberDropdownProps {
    options: (Option | string)[];
    value: string | number;
    onChange: (value: any) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

export function CyberDropdown({ options, value, onChange, placeholder = "SELECT...", className, disabled }: CyberDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Normalize options
    const normalizedOptions: Option[] = options.map(opt => 
        typeof opt === 'object' ? opt : { label: opt, value: opt }
    );

    const selectedOption = normalizedOptions.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (val: any) => {
        onChange(val);
        setIsOpen(false);
    };

    return (
        <div 
            ref={containerRef} 
            className={cn("relative font-mono text-sm", className)}
        >
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={cn(
                    "w-full flex items-center justify-between px-3 py-2 border transition-all duration-300 relative overflow-hidden group",
                    isOpen 
                        ? "border-signal bg-white/10 text-signal shadow-[0_0_10px_rgba(255,255,255,0.3)]" 
                        : "border-gray-700 bg-black/40 text-gray-300 hover:border-gray-500 hover:bg-white/5",
                    disabled && "opacity-50 cursor-not-allowed"
                )}
            >
                {/* Glitch/Scanline effect on hover */}
                {!disabled && <div className="absolute inset-0 bg-signal/5 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300 pointer-events-none" />}
                
                <span className="truncate relative z-10">
                    {selectedOption ? selectedOption.label : <span className="text-gray-500">{placeholder}</span>}
                </span>
                
                <div className="relative z-10 ml-2">
                    {isOpen ? <ChevronUp size={14} className="text-signal" /> : <ChevronDown size={14} className="text-gray-500 group-hover:text-signal" />}
                </div>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -5, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -5, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 w-full mt-1 border border-signal bg-void/95 backdrop-blur-md z-50 max-h-[200px] overflow-y-auto custom-scrollbar shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
                    >
                        {normalizedOptions.length === 0 ? (
                            <div className="p-3 text-gray-500 text-xs italic">NO_OPTIONS</div>
                        ) : (
                            normalizedOptions.map((opt) => (
                                <button
                                    key={String(opt.value)}
                                    type="button"
                                    onClick={() => handleSelect(opt.value)}
                                    className={cn(
                                        "w-full text-left px-3 py-2 text-xs border-b border-gray-800 last:border-0 hover:bg-white/10 hover:text-signal transition-colors flex items-center justify-between group",
                                        opt.value === value ? "text-signal bg-white/5 font-bold" : "text-gray-400"
                                    )}
                                >
                                    <span className="truncate">{opt.label}</span>
                                    {opt.value === value && <div className="w-1.5 h-1.5 bg-signal rounded-full shadow-[0_0_5px_white]" />}
                                </button>
                            ))
                        )}
                        {/* Decorative bottom line */}
                        <div className="h-0.5 bg-signal/50 w-full" />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
