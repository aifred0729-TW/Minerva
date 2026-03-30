import React from 'react';
import {
    Zap, Shield, Skull, Eye, Lock, Radio, Bug, Syringe,
    Settings, Key, Target, Globe, Folder, Monitor, ArrowUp, ArrowDown, Link2,
    Terminal, Code, Crosshair, Wifi, Network, Database, Cpu, Server,
    Flame, Search, Hash, FileText, Package, Layers, Users, Activity,
    Download, Copy, GitBranch, Box,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';

export const ICON_MAP: Record<string, React.FC<LucideProps>> = {
    Zap, Shield, Skull, Eye, Lock, Radio, Bug, Syringe,
    Settings, Key, Target, Globe, Folder, Monitor, ArrowUp, ArrowDown, Link2,
    Terminal, Code, Crosshair, Wifi, Network, Database, Cpu, Server,
    Flame, Search, Hash, FileText, Package, Layers, Users, Activity,
    Download, Copy, GitBranch, Box,
};

export const PRESET_ICON_NAMES = Object.keys(ICON_MAP);

/** Render a lucide icon by its string name. Falls back to Zap if not found. */
export const LucideIcon = ({
    name,
    size = 16,
    className,
    style,
}: {
    name: string;
    size?: number;
    className?: string;
    style?: React.CSSProperties;
}) => {
    const IconComp = ICON_MAP[name] ?? Zap;
    return <IconComp size={size} className={className} style={style} />;
};
