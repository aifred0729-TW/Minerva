import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type AppState = 'LOGIN' | 'HANDSHAKE' | 'DASHBOARD' | 'LOGOUT_ANIMATION';

interface ConsoleTab {
    id: number;        // callback display_id
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
  closeConsoleTab: (id: number) => void;
  updateConsoleTabMeta: (id: number, partial: Partial<Omit<ConsoleTab, 'id'>>) => void;
  // ── Audio / Music settings ────────────────────────────────────
  musicEnabled: boolean;
  musicVolume: number;      // 0–1
  musicTrackId: string | null;   // id of currently selected uploaded track
  musicLibrary: Array<{ id: string; name: string }>;  // metadata only, blobs in IndexedDB
  musicPlaying: boolean;    // user intent: true = play, false = pause
  sfxEnabled: boolean;
  sfxVolume: number;        // 0–1
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
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      appState: 'LOGIN', // Initial State
      isLoggingOut: false,
      isSidebarCollapsed: true, // Default to collapsed
      alertCount: 0,
      consoleTabs: [],
      // Audio defaults
      musicEnabled: true,
      musicVolume: 0.3,
      musicTrackId: null,
      musicLibrary: [],
      musicPlaying: true,
      sfxEnabled: true,
      sfxVolume: 0.5,
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
      setHideLoginNotifications: (v) => set({ hideLoginNotifications: v }),

      updateConsoleTabMeta: (id, partial) => set((state) => ({
        consoleTabs: state.consoleTabs.map(t => t.id === id ? { ...t, ...partial } : t),
      })),
    }),
    {
      name: 'minerva-app-store',
      partialize: (state) => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
        consoleTabs: state.consoleTabs,
        musicEnabled: state.musicEnabled,
        musicVolume: state.musicVolume,
        musicTrackId: state.musicTrackId,
        musicLibrary: state.musicLibrary,
        musicPlaying: state.musicPlaying,
        sfxEnabled: state.sfxEnabled,
        sfxVolume: state.sfxVolume,
        hideLoginNotifications: state.hideLoginNotifications,
      }),
    }
  )
);
