// ═══════════════════════════════════════════════════════════════════
//  BACKWARD-COMPATIBILITY SHIM
//
//  The actual implementation has moved to Minerva/lib/time.ts.
//  This file re-exports everything so that old components/ code
//  continues to work without changing its import paths.
// ═══════════════════════════════════════════════════════════════════
export {
    toLocalTime,
    toLocalTimeShort,
    getTimeDifference,
    milisecondsToString,
    useInterval,
    getSkewedNow,
} from '../../Minerva/lib/time';
