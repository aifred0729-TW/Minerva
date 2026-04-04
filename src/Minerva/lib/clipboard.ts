// ═══════════════════════════════════════════════════════════════════
//  Clipboard & file-download utilities (Minerva-native)
// ═══════════════════════════════════════════════════════════════════

/**
 * Copy a string to the system clipboard.
 * Uses the modern `navigator.clipboard` API when available,
 * falling back to the legacy `execCommand('copy')` approach.
 */
export function copyStringToClipboard(str: string): boolean {
    try {
        const text = str || ' ';

        // Prefer the modern async API (fire-and-forget is fine here)
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(text).catch(() => {
                // Silently fall through – the legacy path below is the sync fallback
            });
        }

        // Legacy fallback for older browsers / non-HTTPS contexts
        const el = document.createElement('textarea');
        el.value = text;
        el.setAttribute('readonly', '');
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.execCommand('cut');
        document.body.removeChild(el);
        return true;
    } catch (error) {
        console.warn('[Minerva] Failed to copy to clipboard:', error);
        return false;
    }
}

/**
 * Trigger a browser download for in-memory data.
 *
 * @param output   The content to download (string or ArrayBuffer/Uint8Array).
 * @param filename The suggested filename for the download.
 */
export function downloadFileFromMemory(output: BlobPart, filename: string): void {
    const dataBlob = new Blob([output], { type: 'application/octet-stream' });
    let el = document.getElementById('download_config') as HTMLAnchorElement | null;

    if (!el) {
        el = document.createElement('a');
        el.id = 'download_config';
        document.body.appendChild(el);
    }

    el.href = URL.createObjectURL(dataBlob);
    el.download = filename;
    el.click();
}
