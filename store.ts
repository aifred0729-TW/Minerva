import { create } from 'zustand';

type AppState = 'LOGIN' | 'HANDSHAKE' | 'DASHBOARD' | 'LOGOUT_ANIMATION';

interface AppStore {
  appState: AppState;
  setAppState: (state: AppState) => void;
  // 用於控制反向動畫的 flag
  isLoggingOut: boolean; 
  startLogout: () => void;
  reset: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  appState: 'LOGIN', // Initial State
  isLoggingOut: false,
  
  setAppState: (state) => set({ appState: state }),
  
  startLogout: () => set({ 
    isLoggingOut: true, 
    appState: 'LOGOUT_ANIMATION' 
  }),
  
  reset: () => set({ 
    appState: 'LOGIN', 
    isLoggingOut: false 
  })
}));

