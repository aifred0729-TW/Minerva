// ═══════════════════════════════════════════════════════════════════
//  MythicSnackDownload — download notification component
//  (Minerva-native – replaces old MythicComponents/MythicSnackDownload)
// ═══════════════════════════════════════════════════════════════════
import React from 'react';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import { directDownloadUrl } from '../lib/urls';

interface MythicSnackDownloadProps {
    title: string;
    file_id: string;
}

export const MythicSnackDownload: React.FC<MythicSnackDownloadProps> = ({ title, file_id }) => {
    return (
        <div>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                {title}
            </Typography>
            <Typography gutterBottom>File ready for download</Typography>
            <Link
                color="textPrimary"
                download
                href={directDownloadUrl(file_id)}
                target="_blank"
            >
                Download here
            </Link>
        </div>
    );
};
