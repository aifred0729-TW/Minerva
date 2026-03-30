import type { FileNode } from '../../types/files';
export { formatBytes, b64DecodeUnicode } from '../../lib/utils';

export const COLUMN_DEFS: Array<{ key: string; label: string; sortable: boolean; width: string; defaultVisible: boolean }> = [
    { key: 'name_text',   label: 'NAME',     sortable: true,  width: '',      defaultVisible: true  },
    { key: 'size',        label: 'SIZE',      sortable: true,  width: 'w-20',  defaultVisible: true  },
    { key: 'modify_time', label: 'MODIFIED',  sortable: true,  width: 'w-36',  defaultVisible: true  },
    { key: 'comment',     label: 'COMMENT',   sortable: true,  width: 'w-32',  defaultVisible: true  },
    { key: 'tags',        label: 'TAGS',      sortable: false, width: 'w-24',  defaultVisible: false },
    { key: 'permissions', label: 'PERMS',     sortable: false, width: 'w-28',  defaultVisible: false },
];


// Helper to deduplicate nodes by full_path_text
// This handles the case where multiple callbacks on the same host create duplicate entries
export const deduplicateNodes = (nodes: FileNode[]): FileNode[] => {
    if (!nodes || nodes.length === 0) return [];
    const seen = new Map<string, FileNode>();
    nodes.forEach(node => {
        // Use full_path_text as unique key
        // Keep the first (or latest based on id) entry
        const key = node.full_path_text;
        if (!seen.has(key)) {
            seen.set(key, node);
        }
    });
    return Array.from(seen.values());
};

// Helper to parse metadata
export const getMetadata = (node: FileNode) => {
    try {
        if (typeof node.metadata === 'string') return JSON.parse(node.metadata);
        return node.metadata || {};
    } catch {
        return {};
    }
}

// Compute all ancestor paths of a given full_path_text (mirrors OldReactUI's getAllParentNodes)
export const getAllParentPaths = (fullPath: string): string[] => {
    if (!fullPath) return [];
    const paths: string[] = [fullPath];
    const isWindows = fullPath.includes('\\');
    const sep = isWindows ? '\\' : '/';
    const parts = fullPath.split(sep);
    if (!isWindows) paths.push('/');
    for (let i = 1; i < parts.length; i++) {
        const segment = parts.slice(0, i).join(sep);
        if (segment && !paths.includes(segment)) paths.push(segment);
    }
    return paths;
};

// Deduplicate an array by id field
export const deduplicateById = <T extends { id: number }>(arr: T[]): T[] => {
    const seen = new Set<number>();
    return arr.filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
    });
};

// ============================================
// Context Menu
// ============================================
