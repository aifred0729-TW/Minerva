// ═══════════════════════════════════════════════════════════════════
//  Centralised URL constants — single source of truth for all API
//  and file-serving endpoints used across Minerva.
// ═══════════════════════════════════════════════════════════════════

const API_VERSION = 'v1.4';
const HEALTH_API_VERSION = 'v1.0';

/** Health-check endpoint (pre-auth). */
export const HEALTH_URL = `/api/${HEALTH_API_VERSION}/health`;

/** Mythic file download (requires auth header). */
export const fileDownloadUrl = (fileId: string | number) =>
    `/api/${API_VERSION}/files/download/${fileId}`;

/** Direct file download (cookie-based auth, suitable for `<a href>`). */
export const directDownloadUrl = (fileId: string | number) =>
    `/direct/download/${fileId}`;

/** Absolute direct download URL (includes origin, for clipboard copy). */
export const absoluteDownloadUrl = (fileId: string | number) =>
    `${window.location.origin}/direct/download/${fileId}`;

/** Task file-upload webhook. */
export const TASK_UPLOAD_URL = `/api/${API_VERSION}/task_upload_file_webhook`;

/** Eventing import webhook. */
export const EVENTING_IMPORT_URL = `/api/${API_VERSION}/eventing_import_webhook`;

/** Eventing register-file webhook. */
export const EVENTING_REGISTER_FILE_URL = `/api/${API_VERSION}/eventing_register_file_webhook`;

/** File listing base path (for file info fetches). */
export const FILE_API_BASE = `/api/${API_VERSION}/files`;
