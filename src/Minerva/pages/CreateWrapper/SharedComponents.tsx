import React, { useState } from 'react';
import { Package, Check, Pencil } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { MiniStep } from './createWrapper.types';

// ── AgentIcon ─────────────────────────────────────────────────
export const AgentIcon: React.FC<{ name: string; size?: number; className?: string }> = ({ name, size = 32, className }) => {
    const [failed, setFailed] = useState(false);
    if (failed) return <Package size={size} className={cn("text-signal/40", className)} />;
    return (
        <img
            src={`/agent_icons/${name}.svg`}
            alt={name}
            width={size}
            height={size}
            className={cn("object-contain flex-shrink-0", className)}
            onError={() => setFailed(true)}
        />
    );
};

// ── MiniStepProgress ──────────────────────────────────────────
export const MiniStepProgress: React.FC<{ steps: MiniStep[] }> = ({ steps }) => {
    if (!steps || steps.length === 0) return null;
    const done = steps.filter(s => s.step_success === true || s.step_skip).length;
    const err = steps.filter(s => s.step_success === false).length;
    return (
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {steps.map(step => (
                <div
                    key={step.step_number}
                    title={step.step_name}
                    className={cn(
                        "w-2 h-2 rounded-full transition-colors",
                        step.step_skip ? "bg-ghost/30" :
                        step.step_success === true ? "bg-matrix" :
                        step.step_success === false ? "bg-alert" :
                        "bg-signal/30 animate-pulse"
                    )}
                />
            ))}
            <span className="text-[10px] text-ghost/40 font-mono ml-1">
                {done}/{steps.length}
                {err > 0 && <span className="text-alert ml-1">({err} err)</span>}
            </span>
        </div>
    );
};

// ── StepIndicator ─────────────────────────────────────────────
export const StepIndicator: React.FC<{
    step: number;
    currentStep: number;
    label: string;
    onClick?: () => void;
}> = ({ step, currentStep, label, onClick }) => {
    const isActive = step === currentStep;
    const isCompleted = step < currentStep;
    const isJumpable = !isCompleted && !isActive && !!onClick;
    return (
        <div
            className={cn("flex items-center", (isCompleted || isJumpable) && onClick ? "cursor-pointer" : "")}
            onClick={(isCompleted || isJumpable) && onClick ? onClick : undefined}
        >
            <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                isCompleted ? "bg-matrix border-matrix text-void" :
                isActive ? "border-signal text-signal" :
                isJumpable ? "border-signal/50 text-signal/60 hover:border-signal hover:bg-signal/10" :
                "border-ghost/30 text-ghost",
                isCompleted && onClick ? "hover:bg-matrix/80" : ""
            )}>
                {isCompleted ? <Check size={20} /> : step + 1}
            </div>
            <span className={cn(
                "ml-2 text-sm hidden md:block",
                isActive ? "text-signal font-bold" :
                isCompleted ? "text-matrix" :
                isJumpable ? "text-signal/60" :
                "text-ghost"
            )}>
                {label}
            </span>
        </div>
    );
};

// ── EditButton ────────────────────────────────────────────────
export const EditButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
    <button
        onClick={onClick}
        className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs border border-signal/40 text-signal/70 rounded hover:border-signal hover:text-signal transition-colors"
    >
        <Pencil size={11} /> {label}
    </button>
);
