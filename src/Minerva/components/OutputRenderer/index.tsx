/**
 * OutputRenderer barrel — re-exports the full public API so that
 * consumers can continue importing from '../components/OutputRenderer'.
 */

// Core utilities & components
export {
    b64Decode,
    decodeResponses,
    OutputCallbackContext,
    getIconComponent,
    getIconColor,
    OutputPanel,
    renderCell,
    MythicTable,
    AutoTable,
    TerminalPanel,
} from './core';

// Type re-exports
export type { OutputPanelProps, MythicTableProps } from './core';
export type { MythicCell, MythicTableRow, MythicTableDef, MythicScreenshot, MythicDownload, MythicBrowserScriptData, DecodedResponse } from '../../types/output';

// Specialist panels
export { ProcessPanel } from './panels';
export { FilesPanel } from './panels';
export { ScreenshotPanel } from './panels';
export { DownloadPanel } from './panels';
export { MediaPanel } from './panels';

// Graph & database panels
export { GraphPanel, DatabasePanel } from './graph';

// High-level parsed output
export { JsonPanel, ParsedOutput, BrowserScriptOutput, hasBuiltinStructuredRenderer, OutputModeToggle, RawOutput, StructuredResponseOutput, NetSharesPanel, NetDcListPanel } from './parsed';
export type { ParsedOutputProps } from '../../types/output';
export type { OutputMode, OutputModeToggleProps, RawOutputProps } from './parsed';
