import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface Option {
    label: string;
    value: string | number;
    icon?: React.ReactNode;
}

interface CyberDropdownProps {
    options: (Option | string)[];
    value: string | number;
    onChange: (value: any) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

export function CyberDropdown({ 
    options, 
    value, 
    onChange, 
    placeholder = "SELECT...", 
    className, 
    disabled,
    size = 'md'
}: CyberDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Normalize options
    const normalizedOptions: Option[] = options.map(opt => 
        typeof opt === 'object' ? opt : { label: String(opt), value: opt }
    );

    const selectedOption = normalizedOptions.find(opt => opt.value === value);

    const updateMenuPosition = useCallback(() => {
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setMenuPosition({
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width
            });
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            // Check if click is outside both button container and menu portal
            const isOutsideContainer = containerRef.current && !containerRef.current.contains(target);
            const isOutsideMenu = menuRef.current && !menuRef.current.contains(target);
            
            if (isOutsideContainer && isOutsideMenu) {
                setIsOpen(false);
            }
        };
        
        // Use setTimeout to avoid closing immediately when opening
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);
        
        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            updateMenuPosition();
            window.addEventListener('scroll', updateMenuPosition, true);
            window.addEventListener('resize', updateMenuPosition);
            return () => {
                window.removeEventListener('scroll', updateMenuPosition, true);
                window.removeEventListener('resize', updateMenuPosition);
            };
        }
    }, [isOpen, updateMenuPosition]);

    const handleSelect = (val: any, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onChange(val);
        setIsOpen(false);
    };

    const sizeClasses = {
        sm: 'px-2 py-1 text-xs',
        md: 'px-3 py-2 text-sm',
        lg: 'px-4 py-3 text-base'
    };

    const dropdownMenu = (
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                top: menuPosition.top,
                left: menuPosition.left,
                width: menuPosition.width,
                zIndex: 99999
            }}
            className="border border-signal bg-void/98 backdrop-blur-xl shadow-[0_0_30px_rgba(0,255,255,0.2),0_8px_32px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
        >
            {/* Scanline effect */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] opacity-20" />
            
            {/* Glowing top border */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-signal to-transparent" />
            
            <div className="max-h-[240px] overflow-y-auto cyber-scrollbar relative">
                {normalizedOptions.length === 0 ? (
                    <div className="p-4 text-gray-500 text-xs font-mono text-center">
                        <span className="animate-pulse">NO_OPTIONS_AVAILABLE</span>
                    </div>
                ) : (
                    normalizedOptions.map((opt, index) => (
                        <button
                            key={String(opt.value)}
                            type="button"
                            onClick={(e) => handleSelect(opt.value, e)}
                            className={cn(
                                "w-full text-left px-3 py-2 font-mono text-xs transition-all duration-150 flex items-center gap-3 relative group",
                                "hover:bg-signal/15 hover:text-signal",
                                opt.value === value 
                                    ? "text-signal bg-signal/10 font-bold" 
                                    : "text-gray-400",
                                index !== normalizedOptions.length - 1 && "border-b border-gray-800/50"
                            )}
                        >
                            {/* Selection indicator bar */}
                            <div className={cn(
                                "absolute left-0 top-0 bottom-0 w-[2px] transition-all duration-150",
                                opt.value === value 
                                    ? "bg-signal shadow-[0_0_8px_rgba(255,255,255,0.5)]" 
                                    : "bg-transparent group-hover:bg-signal/50"
                            )} />
                            
                            {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                            
                            <span className="flex-1 truncate">{opt.label}</span>
                            
                            {opt.value === value && (
                                <Check size={12} className="flex-shrink-0 text-signal" />
                            )}
                        </button>
                    ))
                )}
            </div>
            
            {/* Glowing bottom border */}
            <div className="h-[2px] bg-gradient-to-r from-signal/30 via-signal to-signal/30" />
        </div>
    );

    return (
        <div 
            ref={containerRef} 
            className={cn("relative font-mono", className)}
        >
            <button
                ref={buttonRef}
                type="button"
                onClick={() => {
                    if (!disabled) {
                        updateMenuPosition();
                        setIsOpen(!isOpen);
                    }
                }}
                disabled={disabled}
                className={cn(
                    "w-full flex items-center justify-between border transition-all duration-200 relative overflow-hidden group",
                    sizeClasses[size],
                    isOpen 
                        ? "border-signal bg-signal/10 text-signal shadow-[0_0_15px_rgba(255,255,255,0.2),inset_0_0_15px_rgba(255,255,255,0.05)]" 
                        : "border-gray-700 bg-void/60 text-gray-300 hover:border-signal/50 hover:bg-void/80",
                    disabled && "opacity-40 cursor-not-allowed grayscale"
                )}
            >
                {/* Hover sweep effect */}
                {!disabled && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-signal/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 pointer-events-none" />
                )}
                
                {/* Corner accents */}
                <div className={cn(
                    "absolute top-0 left-0 w-2 h-2 border-t border-l transition-colors duration-200",
                    isOpen ? "border-signal" : "border-gray-600 group-hover:border-signal/50"
                )} />
                <div className={cn(
                    "absolute top-0 right-0 w-2 h-2 border-t border-r transition-colors duration-200",
                    isOpen ? "border-signal" : "border-gray-600 group-hover:border-signal/50"
                )} />
                <div className={cn(
                    "absolute bottom-0 left-0 w-2 h-2 border-b border-l transition-colors duration-200",
                    isOpen ? "border-signal" : "border-gray-600 group-hover:border-signal/50"
                )} />
                <div className={cn(
                    "absolute bottom-0 right-0 w-2 h-2 border-b border-r transition-colors duration-200",
                    isOpen ? "border-signal" : "border-gray-600 group-hover:border-signal/50"
                )} />
                
                <span className="truncate relative z-10">
                    {selectedOption ? selectedOption.label : <span className="text-gray-500 italic">{placeholder}</span>}
                </span>
                
                <div className={cn(
                    "relative z-10 ml-2 transition-transform duration-200",
                    isOpen && "rotate-180"
                )}>
                    <ChevronDown size={14} className={cn(
                        "transition-colors duration-200",
                        isOpen ? "text-signal" : "text-gray-500 group-hover:text-signal"
                    )} />
                </div>
            </button>

            {isOpen && createPortal(dropdownMenu, document.body)}
        </div>
    );
}
