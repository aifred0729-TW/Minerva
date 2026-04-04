import React, { useEffect, useRef, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ToastContainer, Slide } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { gql } from "@apollo/client";
import { useLazyQueryCompat as useLazyQuery } from "./lib/useQueryCompat";
import { useReactiveVar } from "@apollo/client/react";
import { meState, mePreferences } from './lib/state';
import { FailedRefresh } from './lib/auth';
import { isJWTValid, JWTTimeLeft } from './lib/auth';

// Eager imports — always needed
import Login from './pages/Login';
import { GlobalAudioPlayer } from './components/GlobalAudioPlayer';
import { BattleMode } from './components/BattleMode';
import { EventNotifications, AlertCountSubscription, CallbackSoundTrigger } from './components/EventNotifications';
import { Layout } from './components/Layout';
import { useAppStore } from './store';
import { snackActions } from './lib/snackbar';
import { playClick } from './lib/soundEffects';
import './index.css';

import { BattleModeProvider } from './context/BattleModeContext';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';

const userSettingsQuery = gql`
query getUserSettings {
    getOperatorPreferences {
        status
        error
        preferences
    }
}
`;

// Lazy-loaded page components — code-split per route
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Callbacks = lazy(() => import('./pages/Callbacks'));
const Files = lazy(() => import('./pages/Files'));
const Credentials = lazy(() => import('./pages/Credentials'));
const C2Profiles = lazy(() => import('./pages/C2Profiles'));
const Operations = lazy(() => import('./pages/Operations'));
const UsersPage = lazy(() => import('./pages/Users'));
const Console = lazy(() => import('./pages/Console'));
const ConsoleSelection = lazy(() => import('./pages/ConsoleSelection'));
const Opsec = lazy(() => import('./pages/Opsec'));
const Settings = lazy(() => import('./pages/Settings'));
const CreatePayloadRouter = lazy(() => import('./pages/CreatePayload'));
const EventFeed = lazy(() => import('./pages/EventFeed'));
const Payloads = lazy(() => import('./pages/Payloads'));
const Search = lazy(() => import('./pages/Search'));
const Artifacts = lazy(() => import('./pages/Artifacts'));
const MitreAttack = lazy(() => import('./pages/MitreAttack'));
const Reporting = lazy(() => import('./pages/Reporting'));
const Tags = lazy(() => import('./pages/Tags'));
const BrowserScripts = lazy(() => import('./pages/BrowserScripts'));
const Eventing = lazy(() => import('./pages/Eventing'));
const Tunnels = lazy(() => import('./pages/Tunnels'));
const PayloadTypes = lazy(() => import('./pages/PayloadTypes'));
const SingleTaskView = lazy(() => import('./pages/SingleTaskView'));
const Topology3D = lazy(() => import('./pages/Topology3D'));
const QuickHacks = lazy(() => import('./pages/QuickHacks'));
const Metasploit = lazy(() => import('./pages/Metasploit'));

const MinervaApp = () => {
  const { isLoggingOut, startLogout } = useAppStore();
  const me = useReactiveVar(meState);
  const prefs = useReactiveVar(mePreferences);
  const rawBg = prefs?.palette?.backgroundImage;
  const bgImage = typeof rawBg === 'string' && rawBg.length > 0 ? rawBg : null;
  const navigate = useNavigate();
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  // Track whether we have already warned about expiry in this interval window
  const warnedRef = useRef(false);

  // Fetch operator preferences from backend on login / page refresh
  const [getUserPreferences] = useLazyQuery<any>(userSettingsQuery, {
    fetchPolicy: 'no-cache',
    onCompleted: (data: any) => {
      if (data.getOperatorPreferences.status === 'success') {
        if (data.getOperatorPreferences.preferences !== null) {
          mePreferences({ ...mePreferences(), ...data.getOperatorPreferences.preferences });
        }
      }
    },
    onError: (error: Error) => {
      console.error('Failed to load user preferences:', error.message);
    },
  });

  useEffect(() => {
    if (me.loggedIn) {
      getUserPreferences();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.loggedIn]);

  // Global click sound effect
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) playClick();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in input/textarea/contenteditable
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      // Ctrl+K or Cmd+K → Search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        navigate('/search');
      }
      // Ctrl+/ or Cmd+/ → Console selection
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        navigate('/console');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // Auto-logout when JWT session expires
  useEffect(() => {
    const SESSION_CHECK_INTERVAL_MS = 60_000;
    const SESSION_WARNING_THRESHOLD_MS = 30 * 60_000; // 30 minutes
    // Reset warning flag on login state change
    warnedRef.current = false;
    const checkSession = () => {
      if (!me.loggedIn) return;
      const msLeft = JWTTimeLeft();
      if (!isJWTValid() || msLeft <= 0) {
        FailedRefresh(true);
        startLogout();
      } else if (msLeft <= SESSION_WARNING_THRESHOLD_MS && !warnedRef.current) {
        warnedRef.current = true;
        const minsLeft = Math.floor(msLeft / 60_000);
        snackActions.warning(`Session expires in ${minsLeft} minute${minsLeft !== 1 ? 's' : ''}. Save your work.`);
      }
    };

    const interval = setInterval(checkSession, SESSION_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [me.loggedIn, startLogout]);

  useEffect(() => {
    if (isLoggingOut) {
      navigate('/login');
    }
  }, [isLoggingOut, navigate]);

  // If session becomes invalid (meState.loggedIn flips to false while on a non-login page)
  useEffect(() => {
    if (!me.loggedIn && !isLoginPage) {
      // FailedRefresh may have already been called from index.js errorLink;
      // just make sure the UI transitions to login.
      startLogout();
    }
  }, [me.loggedIn, isLoginPage, startLogout]);

  return (
    <ErrorBoundary>
    <ThemeProvider>
    <BattleModeProvider>
      <div className="minerva-root font-sans text-white h-full w-full" style={
          bgImage ? {
              backgroundImage: bgImage.startsWith('url(') ? bgImage : `url("${bgImage}")`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: 'cover',
              backgroundAttachment: 'fixed',
          } : undefined
      }>
        <GlobalAudioPlayer />
        <BattleMode />
        
        {/* Event Subscriptions - only active when not on login page */}
        {!isLoginPage && (
          <>
            <EventNotifications />
            <AlertCountSubscription />
            <CallbackSoundTrigger />
          </>
        )}
        
        <ToastContainer
          position="top-right"
          theme="dark"
          autoClose={5_000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnHover
          pauseOnFocusLoss
          draggable={false}
          closeButton={false}
          transition={Slide}
          toastClassName="cyber-toast"
          progressClassName="cyber-toast-progress"
          icon={false}
          limit={5}
        />

        <Suspense fallback={<div className="flex items-center justify-center h-screen w-screen bg-void text-gray-500 font-mono text-sm">Loading…</div>}>
        <Routes>
        <Route path="login" element={<Login />} />

        {/* All authenticated routes share a persistent Layout (Sidebar stays mounted) */}
        <Route element={<Layout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="callbacks" element={<Callbacks />} />
          <Route path="files" element={<Files />} />
          <Route path="operations" element={<Operations />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="c2-profiles" element={<C2Profiles />} />
          <Route path="create-payload/*" element={<CreatePayloadRouter />} />
          <Route path="console" element={<ConsoleSelection />} />
          <Route path="console/:id" element={<Console />} />
          <Route path="opsec" element={<Opsec />} />
          <Route path="quickhacks" element={<QuickHacks />} />
          <Route path="credentials" element={<Credentials />} />
          <Route path="settings" element={<Settings />} />
          <Route path="events" element={<EventFeed />} />
          <Route path="payloads" element={<Payloads />} />
          <Route path="search" element={<Search />} />
          <Route path="artifacts" element={<Artifacts />} />
          <Route path="mitre" element={<MitreAttack />} />
          <Route path="reporting" element={<Reporting />} />
          <Route path="tags" element={<Tags />} />
          <Route path="browser-scripts" element={<BrowserScripts />} />
          <Route path="eventing" element={<Eventing />} />
          <Route path="tunnels" element={<Tunnels />} />
          <Route path="payload-types" element={<PayloadTypes />} />
          <Route path="task" element={<SingleTaskView />} />
          <Route path="task/:displayId" element={<SingleTaskView />} />
          <Route path="topology" element={<Topology3D />} />
          <Route path="metasploit" element={<Metasploit />} />
          <Route path="create-wrapper" element={<Navigate to="/payloads?tab=wrapper" replace />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
      </Suspense>
      </div>
    </BattleModeProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}

export default MinervaApp;
