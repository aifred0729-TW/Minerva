import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ToastContainer, Slide } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Dashboard from './pages/Dashboard';
import Callbacks from './pages/Callbacks';
import Files from './pages/Files';
import Credentials from './pages/Credentials';
import C2Profiles from './pages/C2Profiles';
import Operations from './pages/Operations';
import UsersPage from './pages/Users';
import Console from './pages/Console';
import Opsec from './pages/Opsec';
import Settings from './pages/Settings';
import Login from './pages/Login';
import CreatePayloadRouter from './pages/CreatePayload';
import EventFeed from './pages/EventFeed';
import Payloads from './pages/Payloads';
import Search from './pages/Search';
import Artifacts from './pages/Artifacts';
import MitreAttack from './pages/MitreAttack';
import Reporting from './pages/Reporting';
import Tags from './pages/Tags';
import BrowserScripts from './pages/BrowserScripts';
import Eventing from './pages/Eventing';
import { GlobalAudioPlayer } from './components/GlobalAudioPlayer';
import { BattleMode } from './components/BattleMode';
import { EventNotifications, AlertCountSubscription } from './components/EventNotifications';
import { useAppStore } from './store';
import './index.css';

import { BattleModeProvider } from './context/BattleModeContext';

const MinervaApp = () => {
  const { isLoggingOut } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

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
        
        {/* Event Subscriptions - only active when not on login page */}
        {!isLoginPage && (
          <>
            <EventNotifications />
            <AlertCountSubscription />
          </>
        )}
        
        <ToastContainer 
          position="bottom-left"
          theme="dark"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnHover
          pauseOnFocusLoss
          draggable={false}
          closeButton={false}
          transition={Slide}
          toastClassName="cyber-toast"
          bodyClassName="cyber-toast-body"
          progressClassName="cyber-toast-progress"
          icon={false}
          limit={5}
        />
        
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
          path="files" 
          element={<Files />} 
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

        <Route 
          path="credentials" 
          element={<Credentials />} 
        />

        <Route 
          path="settings" 
          element={<Settings />} 
        />

        <Route 
          path="events" 
          element={<EventFeed />} 
        />

        <Route 
          path="payloads" 
          element={<Payloads />} 
        />

        <Route 
          path="search" 
          element={<Search />} 
        />

        <Route 
          path="artifacts" 
          element={<Artifacts />} 
        />

        <Route 
          path="mitre" 
          element={<MitreAttack />} 
        />

        <Route 
          path="reporting" 
          element={<Reporting />} 
        />

        <Route 
          path="tags" 
          element={<Tags />} 
        />

        <Route 
          path="browser-scripts" 
          element={<BrowserScripts />} 
        />

        <Route 
          path="eventing" 
          element={<Eventing />} 
        />

        {/* Redirect create-wrapper to payloads with wrapper tab */}
        <Route 
          path="create-wrapper" 
          element={<Navigate to="/payloads?tab=wrapper" replace />} 
        />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </div>
    </BattleModeProvider>
  );
}

export default MinervaApp;
