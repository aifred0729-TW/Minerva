// ═══════════════════════════════════════════════════════════════════
//  BACKWARD-COMPATIBILITY SHIM
//
//  All logic has been moved to Minerva/lib/*.  This file only
//  re-exports symbols so that old components/ code continues to
//  work without changing its import paths.
//
//  New code should import directly from:
//    - Minerva/lib/state   (meState, mePreferences, operatorSettingDefaults …)
//    - Minerva/lib/auth    (successfulLogin, successfulRefresh, FailedRefresh)
// ═══════════════════════════════════════════════════════════════════

// State & config
export {
    meState,
    alertCount,
    mePreferences,
    operatorSettingDefaults,
    taskTimestampDisplayFieldOptions,
    taskingContextFieldsOptions,
    defaultShortcuts,
} from './Minerva/lib/state';

// Auth actions
export {
    successfulLogin,
    successfulRefresh,
    FailedRefresh,
} from './Minerva/lib/auth';
