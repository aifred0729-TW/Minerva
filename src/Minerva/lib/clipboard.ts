// ═══════════════════════════════════════════════════════════════════
//  Re-export clipboard utilities from the legacy location.
//
//  Minerva code should import from here:
//    import { copyStringToClipboard } from '@/lib/clipboard';
//
//  The actual implementation remains in components/utilities/Clipboard
//  until the old UI layer is fully removed.
// ═══════════════════════════════════════════════════════════════════
export { copyStringToClipboard, downloadFileFromMemory } from '../../components/utilities/Clipboard';
