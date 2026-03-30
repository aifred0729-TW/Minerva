import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

/**
 * Persistent layout that keeps the Sidebar mounted across route changes.
 * Each page is rendered via <Outlet /> so the Sidebar never unmounts/remounts.
 */
export function Layout() {
    return (
        <>
            <Sidebar />
            <Outlet />
        </>
    );
}
