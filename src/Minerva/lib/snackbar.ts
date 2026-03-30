// ═══════════════════════════════════════════════════════════════════
//  Re-export snackbar utilities from the legacy location.
//
//  Minerva code should import from here:
//    import { snackActions } from '@/lib/snackbar';
//
//  The actual implementation remains in components/utilities/Snackbar
//  until the old UI layer is fully removed.
// ═══════════════════════════════════════════════════════════════════
export { snackActions, CloseButton } from '../../components/utilities/Snackbar';
