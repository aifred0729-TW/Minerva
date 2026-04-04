// ═══════════════════════════════════════════════════════════════════
//  MythicFileUpload — file upload helpers
//  (Minerva-native – replaces old MythicComponents/MythicFileUpload)
// ═══════════════════════════════════════════════════════════════════
import { snackActions } from '../lib/snackbar';
import { TASK_UPLOAD_URL, EVENTING_IMPORT_URL, EVENTING_REGISTER_FILE_URL } from '../lib/urls';
import { getAuthHeaders } from '../lib/auth';

/**
 * Upload a file for a task (used by file-browser, download commands, etc.)
 * Returns the agent_file_id string on success, or null on failure.
 */
export const UploadTaskFile = async (file: File, comment: string): Promise<string | null> => {
  const formData = new FormData();
  try {
    formData.append('file', file);
    formData.append('comment', comment);
    snackActions.info(`Uploading ${file.name} to Mythic...`, { autoClose: 1000 });
  } catch (error) {
    console.error(error);
    return null;
  }
  try {
    const response = await fetch(TASK_UPLOAD_URL, {
      method: 'POST',
      body: formData,
      headers: getAuthHeaders(),
    });
    try {
      const data = await response.json();
      return data?.agent_file_id || data?.error || null;
    } catch (error) {
      snackActions.warning(`Error: ${response.statusText}\nError Code: ${response.status}`);
      console.error('Error trying to get json response', error);
      return null;
    }
  } catch (error: any) {
    snackActions.error(error.toString());
    return null;
  }
};

/**
 * Upload a file for eventing import.
 */
export const UploadEventFile = async (file: File, comment: string): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('comment', comment);
  snackActions.info(`Uploading ${file.name} to Mythic...`, { autoClose: 1000 });
  try {
    const response = await fetch(EVENTING_IMPORT_URL, {
      method: 'POST',
      body: formData,
      headers: getAuthHeaders(),
    });
    try {
      return await response.json();
    } catch (error) {
      snackActions.warning(`Error: ${response.statusText}\nError Code: ${response.status}`);
      console.error('Error trying to get json response', error);
      return null;
    }
  } catch (error: any) {
    snackActions.error(error.toString());
    return null;
  }
};

/**
 * Upload a file for a specific event group.
 */
export const UploadEventGroupFile = async (file: File, eventgroup_id: number | string): Promise<any> => {
  const formData = new FormData();
  formData.append('eventgroup_id', String(eventgroup_id));
  formData.append('file', file);
  snackActions.info(`Uploading ${file.name} to Mythic...`, { autoClose: 1000 });
  try {
    const response = await fetch(EVENTING_REGISTER_FILE_URL, {
      method: 'POST',
      body: formData,
      headers: getAuthHeaders(),
    });
    try {
      return await response.json();
    } catch (error) {
      snackActions.warning(`Error: ${response.statusText}\nError Code: ${response.status}`);
      console.error('Error trying to get json response', error);
      return null;
    }
  } catch (error: any) {
    snackActions.error(error.toString());
    return null;
  }
};
