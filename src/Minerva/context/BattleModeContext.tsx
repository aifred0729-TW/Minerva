import React, { createContext, useContext, useState } from 'react';

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

    const setMode = (newMode: OperationMode) => {
        setModeState(newMode);
        window.dispatchEvent(new CustomEvent('mode-change', { detail: { mode: newMode } }));
    };

    const toggleCombat = () => {
        setMode(mode === 'combat' ? 'normal' : 'combat');
    };

    const toggleRecon = () => {
        setMode(mode === 'recon' ? 'normal' : 'recon');
    };

    return (
        <ModeContext.Provider value={{ mode, setMode, toggleCombat, toggleRecon }}>
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
