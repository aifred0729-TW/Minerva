import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Dashboard from './pages/Dashboard';
import Callbacks from './pages/Callbacks';
import C2Profiles from './pages/C2Profiles';
import Operations from './pages/Operations';
import UsersPage from './pages/Users';
import Console from './pages/Console';
import Opsec from './pages/Opsec';
import Login from './pages/Login';
import CreatePayloadRouter from './pages/CreatePayload';
import { GlobalAudioPlayer } from './components/GlobalAudioPlayer';
import { BattleMode } from './components/BattleMode';
import { useAppStore } from './store';
import './index.css';

import { BattleModeProvider } from './context/BattleModeContext';

const MinervaApp = () => {
  const { isLoggingOut } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggingOut) {
      navigate('/login');
    }
  }, [isLoggingOut, navigate]);

  return (
    <BattleModeProvider>
      <div className="minerva-root font-sans text-white h-full w-full">
        <GlobalAudioPlayer />
        <BattleMode />
        <ToastContainer theme="dark" />
        
        <Routes>
        <Route path="login" element={<Login />} />
        
        <Route 
          path="dashboard" 
          element={<Dashboard />} 
        />
        
        <Route 
          path="callbacks" 
          element={<Callbacks />} 
        />

        <Route 
          path="operations" 
          element={<Operations />} 
        />

        <Route
          path="users"
          element={<UsersPage />}
        />

        <Route 
          path="c2-profiles" 
          element={<C2Profiles />} 
        />
        
        <Route 
          path="create-payload/*" 
          element={<CreatePayloadRouter />} 
        />
        
        <Route 
          path="payloads/*" 
          element={<CreatePayloadRouter />} 
        />

        <Route 
          path="console/:id" 
          element={<Console />} 
        />

        <Route 
          path="opsec" 
          element={<Opsec />} 
        />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </div>
    </BattleModeProvider>
  );
}

export default MinervaApp;
