import { create } from 'zustand';

type AppState = 'LOGIN' | 'HANDSHAKE' | 'DASHBOARD' | 'LOGOUT_ANIMATION';

interface AppStore {
  appState: AppState;
  setAppState: (state: AppState) => void;
  // 用於控制反向動畫的 flag
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
}

export const useAppStore = create<AppStore>((set) => ({
  appState: 'LOGIN', // Initial State
  isLoggingOut: false,
  isSidebarCollapsed: true, // Default to collapsed
  alertCount: 0,
  
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
}));
