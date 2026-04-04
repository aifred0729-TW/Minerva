import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export type OperationMode = 'normal' | 'recon' | 'combat';

interface ModeContextType {
    mode: OperationMode;
    setMode: (mode: OperationMode) => void;
    toggleCombat: () => void;
    toggleRecon: () => void;
}

const ModeContext = createContext<ModeContextType | undefined>(undefined);

export function BattleModeProvider({ children }: { children: React.ReactNode }) {
    const [mode, setModeState] = useState<OperationMode>('normal');

    const setMode = useCallback((newMode: OperationMode) => {
        setModeState(newMode);
        window.dispatchEvent(new CustomEvent('mode-change', { detail: { mode: newMode } }));
    }, []);

    const toggleCombat = useCallback(() => {
        setModeState(prev => {
            const next = prev === 'combat' ? 'normal' : 'combat';
            window.dispatchEvent(new CustomEvent('mode-change', { detail: { mode: next } }));
            return next;
        });
    }, []);

    const toggleRecon = useCallback(() => {
        setModeState(prev => {
            const next = prev === 'recon' ? 'normal' : 'recon';
            window.dispatchEvent(new CustomEvent('mode-change', { detail: { mode: next } }));
            return next;
        });
    }, []);

    const value = useMemo(() => ({ mode, setMode, toggleCombat, toggleRecon }), [mode, setMode, toggleCombat, toggleRecon]);

    return (
        <ModeContext.Provider value={value}>
            {children}
        </ModeContext.Provider>
    );
}

export function useBattleMode() {
    const context = useContext(ModeContext);
    if (context === undefined) {
        throw new Error('useBattleMode must be used within a BattleModeProvider');
    }
    // For backwards compatibility
    return {
        ...context,
        active: context.mode === 'combat',
        toggleActive: context.toggleCombat,
    };
}

export function useOperationMode() {
    const context = useContext(ModeContext);
    if (context === undefined) {
        throw new Error('useOperationMode must be used within a BattleModeProvider');
    }
    return context;
}
