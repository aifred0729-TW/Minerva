// ═══════════════════════════════════════════════════════════════════
//  Animation and polling timings for the login screens (ms).
// ═══════════════════════════════════════════════════════════════════

// Handshake / logout choreography
export const DELAY_CONNECTING    = 1000;
export const DELAY_CHECK_STEP    = 400;
export const DELAY_SESSION_SETUP = 300;
export const DELAY_PACKET_TICK   = 800;
export const DELAY_LOGOUT_SHORT  = 500;
export const DELAY_LOGOUT_MID    = 800;
export const DELAY_LOGOUT_LONG   = 1500;
export const DELAY_AUTH_FAIL_MSG = 2000;

/** When the welcome's shutters begin to close, and when it hands off. */
export const CLOSE_ANIMATION_DELAY_MS = 2_100;
export const LOGIN_NAV_DELAY_MS = 2_620;

// Server reachability probe
export const HEALTH_CHECK_INTERVAL = 30_000;
export const HEALTH_CHECK_TIMEOUT_MS = 5_000;

// Boot sequence acts
export const BOOT_LINK_TICK_MS    = 32;
export const BOOT_LOADED_HOLD_MS  = 600;
export const BOOT_COMPUTE_TICK_MS = 26;
export const BOOT_COMPUTE_HOLD_MS = 450;
export const BOOT_DISSOLVE_MS     = 450;

/**
 * Boot veil clear. The boot screen is an opaque sheet over the login view, so
 * it hands off by fading itself out while the form is already fading in
 * underneath — the two overlap rather than cutting. Long enough to read as a
 * reveal, short enough not to hold the operator up.
 */
export const BOOT_EXIT_MS = 520;

// ── Session handoff (welcome screen → dashboard) ──────────────────
//
// `navigate()` unmounts the whole login route in the same commit, so the
// welcome screen's own exit animation can never play. A curtain mounted
// outside <Routes> carries the cut instead: it holds while the dashboard
// mounts, then parts on the seam the welcome screen closed on.

/** Curtain stays shut this long so the dashboard can mount and paint. */
export const CURTAIN_HOLD_MS = 260;
/** How long the two halves take to retract off screen. */
export const CURTAIN_PART_MS = 540;
