import React from 'react';
import { motion } from 'framer-motion';
import { X, AlertTriangle, CheckCircle, Info, ShieldAlert, Square, Activity, Command } from 'lucide-react';
import { cn } from '../lib/utils';

// --- Modern Tech Modal (現代化彈窗) ---
// Design: "Modern Sleek" - Clean, frosted glass, minimalist, luxurious tech
// Features: 
// - High backdrop blur (Glassmorphism)
// - Subtle gradient borders
// - Soft ambient glow
// - Spacious layout

interface CyberModalProps {
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
  icon?: React.ReactNode;
  maxWidth?: string;
  className?: string;
}

export function CyberModal({ 
  children, 
  onClose, 
  title, 
  icon, 
  maxWidth = "max-w-lg",
  className 
}: CyberModalProps) {
  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 10 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }} 
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "group relative w-full overflow-hidden",
          "bg-[#09090b]/80 backdrop-blur-xl", // Deep frosted glass
          "border border-white/10", // Subtle border
          "shadow-2xl shadow-black/50",
          maxWidth,
          className
        )}
        style={{
            borderRadius: "12px", // Slight rounding for modern feel
        }}
      >
        {/* Top Glow Accent */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-signal/50 to-transparent opacity-50 blur-sm"></div>

        {/* Subtle Background Noise/Texture */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>

        <div className="relative z-10 flex flex-col max-h-[90vh]">
            {/* Header */}
            {(title || icon) && (
                <div className="flex items-center justify-between px-8 py-6 pb-4">
                    <div className="flex items-center gap-3">
                        {icon && (
                            <div className="text-signal/80 p-2 bg-signal/5 rounded-lg border border-signal/10">
                                {React.cloneElement(icon as React.ReactElement, { size: 18 })}
                            </div>
                        )}
                        <div>
                            <h2 className="text-lg font-semibold text-white tracking-wide font-sans mb-1 pb-1 border-b-2 border-transparent">
                                {title}
                            </h2>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200"
                    >
                        <X size={18} />
                    </button>
                </div>
            )}
            
            {/* Content Area */}
            <div className="px-8 pb-8 pt-2 overflow-y-auto custom-scrollbar">
                {children}
            </div>
        </div>
      </motion.div>
    </motion.div>
  );
}


// --- Cyberpunk Alert Modal (打勾彈窗 - 維持重工業風格) ---
// Design: "Heavy Industrial" - High contrast, urgent, warning focused

interface CyberAlertProps {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info' | 'success';
}

export function CyberAlert({ 
    title, 
    message, 
    onConfirm, 
    onCancel, 
    confirmText = "CONFIRM", 
    cancelText = "CANCEL", 
    variant = 'danger' 
}: CyberAlertProps) {
    
    const getVariantStyles = () => {
        switch(variant) {
            case 'danger':
                return {
                    icon: <ShieldAlert size={32} className="text-[#FF003C]" />,
                    headerBg: "bg-[#FF003C]",
                    headerText: "text-black",
                    borderColor: "border-[#FF003C]",
                    buttonPrimary: "bg-[#FF003C] text-black hover:bg-[#ff3362]",
                    buttonSecondary: "text-[#FF003C] border-[#FF003C]/30 hover:bg-[#FF003C]/10",
                    shadow: "shadow-[0_0_50px_rgba(255,0,60,0.2)]",
                    accent: "bg-[#FF003C]"
                };
            case 'warning':
                return {
                    icon: <AlertTriangle size={32} className="text-[#FCEE0A]" />,
                    headerBg: "bg-[#FCEE0A]",
                    headerText: "text-black",
                    borderColor: "border-[#FCEE0A]",
                    buttonPrimary: "bg-[#FCEE0A] text-black hover:bg-[#fdf34d]",
                    buttonSecondary: "text-[#FCEE0A] border-[#FCEE0A]/30 hover:bg-[#FCEE0A]/10",
                    shadow: "shadow-[0_0_50px_rgba(252,238,10,0.2)]",
                    accent: "bg-[#FCEE0A]"
                };
            case 'success':
                return {
                    icon: <CheckCircle size={32} className="text-[#00F0FF]" />,
                    headerBg: "bg-[#00F0FF]",
                    headerText: "text-black",
                    borderColor: "border-[#00F0FF]",
                    buttonPrimary: "bg-[#00F0FF] text-black hover:bg-[#33f3ff]",
                    buttonSecondary: "text-[#00F0FF] border-[#00F0FF]/30 hover:bg-[#00F0FF]/10",
                    shadow: "shadow-[0_0_50px_rgba(0,240,255,0.2)]",
                    accent: "bg-[#00F0FF]"
                };
            default: // info
                return {
                    icon: <Activity size={32} className="text-[#00F0FF]" />,
                    headerBg: "bg-[#00F0FF]",
                    headerText: "text-black",
                    borderColor: "border-[#00F0FF]",
                    buttonPrimary: "bg-[#00F0FF] text-black hover:bg-[#33f3ff]",
                    buttonSecondary: "text-[#00F0FF] border-[#00F0FF]/30 hover:bg-[#00F0FF]/10",
                    shadow: "shadow-[0_0_50px_rgba(0,240,255,0.2)]",
                    accent: "bg-[#00F0FF]"
                };
        }
    };

    const styles = getVariantStyles();

    return (
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={onCancel}
        >
            <motion.div 
                initial={{ scale: 0.9, opacity: 0, x: -50 }} 
                animate={{ scale: 1, opacity: 1, x: 0 }} 
                exit={{ scale: 0.9, opacity: 0, x: 50 }}
                transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                    "bg-[#121212] w-full max-w-[480px] relative overflow-hidden",
                    styles.shadow
                )}
                style={{
                    clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 30px), calc(100% - 30px) 100%, 0 100%)"
                }}
            >
                {/* Header Bar */}
                <div className={cn("px-8 py-4 flex items-center justify-between", styles.headerBg)}>
                    <h2 className={cn("text-xl font-black tracking-widest uppercase flex items-center gap-3 font-mono", styles.headerText)}>
                        SYSTEM_ALERT
                    </h2>
                    <div className="flex gap-1">
                        <Square size={8} fill="currentColor" strokeWidth={0} className="opacity-50" />
                        <Square size={8} fill="currentColor" strokeWidth={0} className="opacity-50" />
                        <Square size={8} fill="currentColor" strokeWidth={0} className="opacity-50" />
                    </div>
                </div>

                {/* Main Content */}
                <div className="p-8 relative">
                    {/* Background Grid */}
                    <div className="absolute inset-0 opacity-[0.05] pointer-events-none" 
                         style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                    
                    {/* Left Border Accent */}
                    <div className={cn("absolute left-0 top-0 bottom-0 w-1", styles.accent)}></div>

                    <div className="flex gap-6 relative z-10">
                        <div className="pt-1">
                            {styles.icon}
                        </div>
                        <div className="flex-1">
                            <h3 className={cn("text-2xl font-bold mb-4 uppercase tracking-wide text-white glitch-text", styles.borderColor)} data-text={title}>
                                {title}
                            </h3>
                            <p className="text-gray-300 font-mono text-sm leading-relaxed mb-8 border-l border-white/10 pl-4">
                                {message}
                            </p>
                            
                            <div className="flex justify-end gap-4 mt-8">
                                <button 
                                    onClick={onCancel} 
                                    className={cn(
                                        "px-6 py-3 font-bold font-mono text-sm border-2 transition-all uppercase tracking-wider hover:skew-x-[-10deg]",
                                        styles.buttonSecondary
                                    )}
                                >
                                    {cancelText}
                                </button>
                                <button 
                                    onClick={onConfirm}
                                    className={cn(
                                        "px-8 py-3 font-black font-mono text-sm transition-all uppercase tracking-wider relative group overflow-hidden hover:skew-x-[-10deg]",
                                        styles.buttonPrimary
                                    )}
                                >
                                    <span className="relative z-10">{confirmText}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Tech Deco Bottom Right */}
                <div className={cn("absolute bottom-0 right-0 w-[30px] h-[30px] pointer-events-none", styles.headerBg)} 
                     style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 0)" }}></div>
                <div className="absolute bottom-1 right-1 text-[10px] font-mono text-black font-bold z-10">V.03</div>

            </motion.div>
        </motion.div>
    );
}
