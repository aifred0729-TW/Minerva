// ═══════════════════════════════════════════════════════════════════
//  MythicStyledTooltip — tooltip wrapper using react-tooltip data attrs
//  (Minerva-native)
// ═══════════════════════════════════════════════════════════════════
import React from 'react';
import { useTheme } from '@mui/material/styles';

interface MythicStyledTooltipProps {
    children: React.ReactNode;
    title: string;
    enterDelay?: number;
    tooltipStyle?: React.CSSProperties;
}

export function MythicStyledTooltip({ children, title, enterDelay, tooltipStyle }: MythicStyledTooltipProps) {
    const theme = useTheme();
    return (
        <span
            style={{ display: 'inline-block', ...tooltipStyle }}
            data-tooltip-id="my-tooltip"
            data-tooltip-content={title}
            data-tooltip-variant={theme.palette.mode === 'dark' ? 'light' : 'dark'}
            data-tooltip-delay-show={enterDelay ?? 750}
        >
            {children}
        </span>
    );
}
