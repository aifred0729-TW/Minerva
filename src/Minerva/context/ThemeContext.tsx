import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
    theme: ThemeMode;
    toggleTheme: () => void;
    setTheme: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'minerva-theme';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyThemeClass(mode: ThemeMode) {
    const root = document.documentElement;
    if (mode === 'light') {
        root.classList.add('minerva-light');
    } else {
        root.classList.remove('minerva-light');
    }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<ThemeMode>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'light' || stored === 'dark') return stored;
        } catch {}
        return 'dark';
    });

    // Apply on mount and on change
    useEffect(() => {
        applyThemeClass(theme);
        try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
    }, [theme]);

    const setTheme = useCallback((mode: ThemeMode) => setThemeState(mode), []);
    const toggleTheme = useCallback(() => setThemeState(prev => prev === 'dark' ? 'light' : 'dark'), []);

    const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme, toggleTheme, setTheme]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
}
