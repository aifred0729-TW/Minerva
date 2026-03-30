// ═══════════════════════════════════════════════
//  API & query constants
// ═══════════════════════════════════════════════

/** Default page size for paginated queries */
export const DEFAULT_PAGE_SIZE = 20;

/** Console output page size (larger due to high-frequency output) */
export const CONSOLE_PAGE_SIZE = 100;

/** Tasking location for programmatically submitted tasks */
export const TASKING_LOCATION_CLI = 'parsed_cli';

/** Interval for session health checks (ms) */
export const SESSION_CHECK_INTERVAL = 30_000;

/** Interval for callback alive recalculation (ms) */
export const ALIVE_CHECK_INTERVAL = 15_000;
