import { parseIPString } from '../../lib/utils';
export { formatBytes, b64DecodeUnicode, parseIPString } from '../../lib/utils';

export const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
};

// Upload function
export const uploadFileToMythic = async (file: File, comment: string): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('comment', comment);
    
    try {
        const response = await fetch('/api/v1.4/task_upload_file_webhook', {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                'MythicSource': 'web'
            }
        });
        
        const data = await response.json();
        return data?.agent_file_id || null;
    } catch (error) {
        console.error('Upload error:', error);
        return null;
    }
};

// ============================================
// Sidebar Category Types
// ============================================
export type SidebarView = 'machines' | 'downloads' | 'uploads' | 'screenshots' | 'eventing' | 'filebrowser';

export const getIPRange = (ip: string): string => {
    const parsed = parseIPString(ip)[0] || ip || 'UNKNOWN';
    const parts = parsed.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    return parsed;
};

