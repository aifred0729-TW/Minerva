import { parseIPString } from '../../lib/utils';
import { TASK_UPLOAD_URL } from '../../lib/urls';
import { getAuthHeaders } from '../../lib/auth';
export { formatBytes, b64DecodeUnicode, parseIPString } from '../../lib/utils';
export { timeAgo as formatTimeAgo } from '../../lib/time';

// Upload function
export const uploadFileToMythic = async (file: File, comment: string): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('comment', comment);
    
    try {
        const response = await fetch(TASK_UPLOAD_URL, {
            method: 'POST',
            body: formData,
            headers: getAuthHeaders()
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

