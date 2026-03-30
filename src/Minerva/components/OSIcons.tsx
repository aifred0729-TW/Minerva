// ═══════════════════════════════════════════════════════════════════
//  Shared OS / Platform icon components
//
//  Extracted from Console.tsx, CallbackGraph.tsx, Callbacks.tsx
//  to eliminate cross-file duplication.
// ═══════════════════════════════════════════════════════════════════
import React from 'react';
import { Monitor } from 'lucide-react';

export const WindowsIcon = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M3 5.548l7.065-.966v6.819H3V5.548zm0 12.904l7.065.966V12.6H3v5.852zm7.882 1.074L21 21V12.6H10.882v6.926zM10.882 3L21 3v8.4H10.882V4.474z" fill="currentColor"/>
    </svg>
);

export const LinuxIcon = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12.504 2c-.748 0-1.463.36-1.955 1.06-.492.7-.802 1.743-.802 2.94 0 1.044.236 1.975.608 2.694.372.719.88 1.224 1.435 1.379v.003c.224.062.452.096.684.096.255 0 .502-.04.725-.113.547-.178 1.033-.693 1.387-1.406.354-.713.58-1.63.58-2.653 0-1.197-.31-2.24-.802-2.94C13.872 2.36 13.252 2 12.504 2zm-4.35 9.546c-.392.27-.756.697-1.012 1.292-.356.826-.48 1.894-.218 3.24.044.227.11.466.197.717l.008.021c.56 1.485 1.622 2.478 2.736 2.951C10.98 20.24 12.12 20.28 13 20c.88-.28 1.58-.85 2.048-1.555.469-.706.726-1.567.706-2.468 0-.524-.097-1.04-.293-1.533l-.006-.013c-.35-.85-.929-1.452-1.586-1.815-.657-.363-1.38-.505-2.04-.427-.657.078-1.253.368-1.727.82-.15.143-.287.3-.408.472-.41-.546-.82-.808-1.2-.894a1.6 1.6 0 00-.34-.041z" fill="currentColor"/>
    </svg>
);

export const MacOSIcon = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" fill="currentColor"/>
    </svg>
);

export const AndroidIcon = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.27-.86-.31-.16-.69-.04-.86.27l-1.88 3.24C14.93 8.35 13.5 8 12 8s-2.93.35-4.43.95L5.69 5.71c-.16-.31-.54-.43-.86-.27-.31.16-.43.55-.27.86l1.84 3.18C4.1 10.94 2.72 12.98 2.5 16h19c-.22-3.02-1.6-5.06-3.9-6.52zM8.5 14c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm7 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" fill="currentColor"/>
    </svg>
);

export const ChromeIcon = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
        <path d="M21.17 8H14.6M12 2a10 10 0 014.94 1.3l-3.3 5.7M2.83 8l3.3 5.7A10 10 0 012 12M12 22a10 10 0 01-4.94-1.3l3.3-5.7M21.17 16l-6.57 0A10 10 0 0022 12" stroke="currentColor" strokeWidth="2"/>
    </svg>
);

/**
 * Return the appropriate OS icon for a given platform string.
 * Supports: windows, linux, macos/darwin, android, chrome.
 */
export const getOSIcon = (
    os: string,
    payloadType?: string,
    size = 16,
    className = '',
): React.ReactNode => {
    const lower = (os || '').toLowerCase();
    if (lower.includes('windows')) return <WindowsIcon size={size} className={className} />;
    if (lower.includes('linux'))   return <LinuxIcon size={size} className={className} />;
    if (lower.includes('macos') || lower.includes('darwin') || lower.includes('apple') || lower.includes('ios'))
        return <MacOSIcon size={size} className={className} />;
    if (lower.includes('android')) return <AndroidIcon size={size} className={className} />;
    if (lower.includes('chrome'))  return <ChromeIcon size={size} className={className} />;
    return <Monitor size={size} className={className} />;
};
