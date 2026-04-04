import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ErrorBoundary } from './ErrorBoundary';
import { WifiOff } from 'lucide-react';

function OfflineIndicator() {
    const [online, setOnline] = useState(navigator.onLine);
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);
    if (online) return null;
    return (
        <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-1.5 bg-red-900/90 text-red-200 text-xs font-mono uppercase tracking-widest backdrop-blur-sm border-b border-red-700/50">
            <WifiOff size={12} />
            NETWORK OFFLINE — RECONNECTING…
        </div>
    );
}

/**
 * Persistent layout that keeps the Sidebar mounted across route changes.
 * Each page is rendered via <Outlet /> so the Sidebar never unmounts/remounts.
 * The ErrorBoundary around Outlet prevents a single page crash from killing the sidebar.
 */
export function Layout() {
    return (
        <>
            <OfflineIndicator />
            <Sidebar />
            <ErrorBoundary>
                <Outlet />
            </ErrorBoundary>
        </>
    );
}
