// ═══════════════════════════════════════════════
//  Login / Auth domain types
// ═══════════════════════════════════════════════

export type ViewMode = 'INTRO' | 'LOGIN' | 'HANDSHAKE' | 'TRANSITIONING';
export type CheckStatus = 'PENDING' | 'CHECKING' | 'OK' | 'FAIL';

export interface CheckItem {
    id: string;
    label: string;
    status: CheckStatus;
}
