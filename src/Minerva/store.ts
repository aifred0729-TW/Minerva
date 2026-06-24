import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type AppState = 'LOGIN' | 'HANDSHAKE' | 'DASHBOARD' | 'LOGOUT_ANIMATION';

interface ConsoleTab {
    /** Tab id — number for Mythic callbacks (display_id), or `msf-<sessionId>` for Metasploit sessions. */
    id: number | string;
    host: string;
    user: string;
    payloadType: string;
}

interface AppStore {
  appState: AppState;
  setAppState: (state: AppState) => void;
  // Flag for controlling reverse animation
  isLoggingOut: boolean; 
  startLogout: () => void;
  reset: () => void;
  // Sidebar state - shared across all pages
  isSidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  // Alert/notification count for event feed
  alertCount: number;
  setAlertCount: (count: number) => void;
  // ── Console Tabs ──────────────────────────────────────────────
  consoleTabs: ConsoleTab[];
  openConsoleTab: (tab: ConsoleTab) => void;
  closeConsoleTab: (id: number | string) => void;
  updateConsoleTabMeta: (id: number | string, partial: Partial<Omit<ConsoleTab, 'id'>>) => void;
  // ── 3D Topology: operator-picked session per host node ────────
  // Persisted across navigation AND page reloads so the operator's choice
  // of "which callback to interact with on this host" survives switching
  // to Callbacks / Payloads / etc. and coming back, and survives a hard
  // refresh. Keyed by TopoNode.id, value is the picked callback's
  // display_id.
  topologySessionPicks: Record<string, number>;
  setTopologySessionPick: (nodeId: string, displayId: number) => void;
  clearTopologySessionPick: (nodeId: string) => void;
  // ── Audio / Music settings ────────────────────────────────────
  musicEnabled: boolean;
  musicVolume: number;      // 0–1
  musicTrackId: string | null;   // id of currently selected uploaded track
  musicLibrary: Array<{ id: string; name: string }>;  // metadata only, blobs in IndexedDB
  musicPlaying: boolean;    // user intent: true = play, false = pause
  sfxEnabled: boolean;
  sfxVolume: number;        // 0–1
  /** Per-sound enable map. Missing key or `true` = play, `false` = skip. */
  sfxIndividualEnabled: Record<string, boolean>;
  // Notification preferences
  hideLoginNotifications: boolean;
  setHideLoginNotifications: (v: boolean) => void;
  setMusicEnabled: (v: boolean) => void;
  setMusicVolume: (v: number) => void;
  setMusicTrackId: (id: string | null) => void;
  addMusicLibraryEntry: (entry: { id: string; name: string }) => void;
  removeMusicLibraryEntry: (id: string) => void;
  setMusicPlaying: (v: boolean) => void;
  setSfxEnabled: (v: boolean) => void;
  setSfxVolume: (v: number) => void;
  setSfxSoundEnabled: (key: string, enabled: boolean) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      appState: 'LOGIN', // Initial State
      isLoggingOut: false,
      isSidebarCollapsed: true, // Default to collapsed
      alertCount: 0,
      consoleTabs: [],
      topologySessionPicks: {},
      // Audio defaults
      musicEnabled: true,
      musicVolume: 0.3,
      musicTrackId: null,
      musicLibrary: [],
      musicPlaying: true,
      sfxEnabled: true,
      sfxVolume: 0.5,
      sfxIndividualEnabled: {},
      hideLoginNotifications: false,

      setAppState: (state) => set({ appState: state }),

      startLogout: () => set({
        isLoggingOut: true,
        appState: 'LOGOUT_ANIMATION'
      }),

      reset: () => set({
        appState: 'LOGIN',
        isLoggingOut: false
      }),

      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),

      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

      setAlertCount: (count) => set({ alertCount: count }),

      openConsoleTab: (tab) => set((state) => {
        if (state.consoleTabs.some(t => t.id === tab.id)) {
          // Update metadata if tab already open
          return {
            consoleTabs: state.consoleTabs.map(t => t.id === tab.id ? { ...t, ...tab } : t),
          };
        }
        return { consoleTabs: [...state.consoleTabs, tab] };
      }),

      closeConsoleTab: (id) => set((state) => ({
        consoleTabs: state.consoleTabs.filter(t => t.id !== id),
      })),

      setMusicEnabled: (v) => set({ musicEnabled: v }),
      setMusicVolume: (v) => set({ musicVolume: v }),
      setMusicTrackId: (id) => set({ musicTrackId: id }),
      addMusicLibraryEntry: (entry) => set((state) => ({
        musicLibrary: state.musicLibrary.some(t => t.id === entry.id)
          ? state.musicLibrary
          : [...state.musicLibrary, entry],
      })),
      removeMusicLibraryEntry: (id) => set((state) => ({
        musicLibrary: state.musicLibrary.filter(t => t.id !== id),
        musicTrackId: state.musicTrackId === id ? (state.musicLibrary.filter(t => t.id !== id)[0]?.id ?? null) : state.musicTrackId,
      })),
      setMusicPlaying: (v) => set({ musicPlaying: v }),
      setSfxEnabled: (v) => set({ sfxEnabled: v }),
      setSfxVolume: (v) => set({ sfxVolume: v }),
      setSfxSoundEnabled: (key, enabled) => set((state) => ({
        sfxIndividualEnabled: { ...state.sfxIndividualEnabled, [key]: enabled },
      })),
      setHideLoginNotifications: (v) => set({ hideLoginNotifications: v }),

      updateConsoleTabMeta: (id, partial) => set((state) => ({
        consoleTabs: state.consoleTabs.map(t => t.id === id ? { ...t, ...partial } : t),
      })),

      setTopologySessionPick: (nodeId, displayId) => set((state) => (
        state.topologySessionPicks[nodeId] === displayId
          ? state
          : { topologySessionPicks: { ...state.topologySessionPicks, [nodeId]: displayId } }
      )),
      clearTopologySessionPick: (nodeId) => set((state) => {
        if (!(nodeId in state.topologySessionPicks)) return state;
        const { [nodeId]: _omit, ...rest } = state.topologySessionPicks;
        void _omit;
        return { topologySessionPicks: rest };
      }),
    }),
    {
      name: 'minerva-app-store',
      partialize: (state) => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
        consoleTabs: state.consoleTabs,
        topologySessionPicks: state.topologySessionPicks,
        musicEnabled: state.musicEnabled,
        musicVolume: state.musicVolume,
        musicTrackId: state.musicTrackId,
        musicLibrary: state.musicLibrary,
        musicPlaying: state.musicPlaying,
        sfxEnabled: state.sfxEnabled,
        sfxVolume: state.sfxVolume,
        sfxIndividualEnabled: state.sfxIndividualEnabled,
        hideLoginNotifications: state.hideLoginNotifications,
      }),
    }
  )
);
