import React, { useEffect, useRef, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { ToastContainer, Slide } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { gql } from "@apollo/client";
import { useLazyQueryCompat as useLazyQuery } from "./lib/useQueryCompat";
import { useReactiveVar } from "@apollo/client/react";
import { meState, mePreferences } from './lib/state';
import { performLogout } from './lib/auth';
import { isJWTValid, JWTTimeLeft } from './lib/auth';
import { MSF_DISPLAY_ID_OFFSET } from './pages/Callbacks/msfSyntheticCallbacks';
import { attachApolloClient as attachMythicKV, hydrateFromPreferences as hydrateMythicKV } from './lib/mythicKVStore';
import { useApolloClient } from '@apollo/client/react';

// Eager imports — always needed
import Login from './pages/Login';
import Invite from './pages/Invite';
import { GlobalAudioPlayer } from './components/GlobalAudioPlayer';
import { BattleMode } from './components/BattleMode';
import { EventNotifications, AlertCountSubscription, CallbackSoundTrigger } from './components/EventNotifications';
import { MythicLibraryIndexRefresher } from './lib/mythicLibraryIndex';
import { MsfSocksBootstrap } from './pages/Metasploit/MsfSocksBootstrap';
import { Layout } from './components/Layout';
import { SessionCurtain } from './components/SessionCurtain';
import { useAppStore } from './store';
import { useShallow } from 'zustand/shallow';
import { snackActions } from './lib/snackbar';
import { playClick } from './lib/soundEffects';
import './index.css';

import { BattleModeProvider } from './context/BattleModeContext';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { lazyRetry } from './lib/lazyRetry';
import { useWindowEngaged } from './lib/useWindowEngaged';

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
const Dashboard = lazyRetry(() => import('./pages/Dashboard'), 'Dashboard');
const Callbacks = lazyRetry(() => import('./pages/Callbacks'), 'Callbacks');
const Files = lazyRetry(() => import('./pages/Files'), 'Files');
const Credentials = lazyRetry(() => import('./pages/Credentials'), 'Credentials');
const C2Profiles = lazyRetry(() => import('./pages/C2Profiles'), 'C2Profiles');
const Operations = lazyRetry(() => import('./pages/Operations'), 'Operations');
const UsersPage = lazyRetry(() => import('./pages/Users'), 'UsersPage');
const Console = lazyRetry(() => import('./pages/Console'), 'Console');
const ConsoleSelection = lazyRetry(() => import('./pages/ConsoleSelection'), 'ConsoleSelection');
const Opsec = lazyRetry(() => import('./pages/Opsec'), 'Opsec');
const Settings = lazyRetry(() => import('./pages/Settings'), 'Settings');
const CreatePayloadRouter = lazyRetry(() => import('./pages/CreatePayload'), 'CreatePayloadRouter');
const EventFeed = lazyRetry(() => import('./pages/EventFeed'), 'EventFeed');
const Payloads = lazyRetry(() => import('./pages/Payloads'), 'Payloads');
const Search = lazyRetry(() => import('./pages/Search'), 'Search');
const Artifacts = lazyRetry(() => import('./pages/Artifacts'), 'Artifacts');
const MitreAttack = lazyRetry(() => import('./pages/MitreAttack'), 'MitreAttack');
const Reporting = lazyRetry(() => import('./pages/Reporting'), 'Reporting');
const Tags = lazyRetry(() => import('./pages/Tags'), 'Tags');
const BrowserScripts = lazyRetry(() => import('./pages/BrowserScripts'), 'BrowserScripts');
const Eventing = lazyRetry(() => import('./pages/Eventing'), 'Eventing');
const Tunnels = lazyRetry(() => import('./pages/Tunnels'), 'Tunnels');
const PayloadTypes = lazyRetry(() => import('./pages/PayloadTypes'), 'PayloadTypes');
const SingleTaskView = lazyRetry(() => import('./pages/SingleTaskView'), 'SingleTaskView');
const Topology3D = lazyRetry(() => import('./pages/Topology3D'), 'Topology3D');
const QuickHacks = lazyRetry(() => import('./pages/QuickHacks'), 'QuickHacks');
const Metasploit = lazyRetry(() => import('./pages/Metasploit'), 'Metasploit');

// Legacy /msf-console/:sessionId → /console/<offset+sid> redirect. MSF
// callbacks now ride the same /console/<displayId> route as Mythic, with
// MSF_DISPLAY_ID_OFFSET partitioning their numeric range.
const MsfConsoleRedirect = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const sid = parseInt(sessionId ?? '0', 10) || 0;
  return <Navigate to={`/console/${MSF_DISPLAY_ID_OFFSET + sid}`} replace />;
};

const MinervaApp = () => {
  const { isLoggingOut, startLogout } = useAppStore(useShallow(s => ({ isLoggingOut: s.isLoggingOut, startLogout: s.startLogout })));
  const me = useReactiveVar(meState);
  const prefs = useReactiveVar(mePreferences);
  const rawBg = prefs?.palette?.backgroundImage;
  const bgImage = typeof rawBg === 'string' && rawBg.length > 0 ? rawBg : null;
  const navigate = useNavigate();
  const location = useLocation();
  // Subscribed here for the app's lifetime so `<html>` always carries the
  // `mv-idle` class when this window is hidden or unfocused. index.css uses it
  // to pause every CSS animation at once; JS-driven loops (three.js frameloop,
  // the login canvas, framer `repeat: Infinity`) read the same hook directly.
  useWindowEngaged();
  const isPublicPage = location.pathname === '/login' || location.pathname === '/invite';
  // Track whether we have already warned about expiry in this interval window
  const warnedRef = useRef(false);

  // Wire the Mythic-backed KV store with this app's Apollo client so MSF
  // caches can push their state up via `updateOperatorPreferences`. The
  // same mutation Mythic uses for its own settings — keeps MSF state in
  // the Mythic operator preferences blob rather than localStorage-only.
  const apolloClient = useApolloClient();
  useEffect(() => { attachMythicKV(apolloClient); }, [apolloClient]);

  // Fetch operator preferences from backend on login / page refresh
  const [getUserPreferences] = useLazyQuery<any>(userSettingsQuery, {
    fetchPolicy: 'no-cache',
    onCompleted: (data: any) => {
      if (data.getOperatorPreferences.status === 'success') {
        const fetchedPrefs = data.getOperatorPreferences.preferences;
        if (fetchedPrefs !== null) {
          mePreferences({ ...mePreferences(), ...fetchedPrefs });
        }
        // Pour any persisted MSF state into the in-memory KV store and
        // emit subscribers so views refresh from the Mythic snapshot.
        hydrateMythicKV(fetchedPrefs ?? mePreferences());
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
        // Same teardown as the sidebar's sign-out: an expired session must not
        // leave the previous operator's cache and MSF state in the heap for
        // whoever logs in next on this browser.
        void performLogout(apolloClient).finally(() => startLogout());
      } else if (msLeft <= SESSION_WARNING_THRESHOLD_MS && !warnedRef.current) {
        warnedRef.current = true;
        const minsLeft = Math.floor(msLeft / 60_000);
        snackActions.warning(`Session expires in ${minsLeft} minute${minsLeft !== 1 ? 's' : ''}. Save your work.`);
      }
    };

    const interval = setInterval(checkSession, SESSION_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [me.loggedIn, startLogout, apolloClient]);

  useEffect(() => {
    if (isLoggingOut) {
      navigate('/login');
    }
  }, [isLoggingOut, navigate]);

  // If session becomes invalid (meState.loggedIn flips to false while on a non-login page)
  useEffect(() => {
    if (!me.loggedIn && !isPublicPage) {
      // FailedRefresh may have already been called from index.js errorLink;
      // just make sure the UI transitions to login.
      startLogout();
    }
  }, [me.loggedIn, isPublicPage, startLogout]);

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
        {!isPublicPage && (
          <>
            <EventNotifications />
            <AlertCountSubscription />
            <CallbackSoundTrigger />
            <MythicLibraryIndexRefresher />
            <MsfSocksBootstrap />
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
        <Route path="invite" element={<Invite />} />

        {/* All authenticated routes share a persistent Layout (Sidebar stays mounted) */}
        <Route element={<Layout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="callbacks" element={<Callbacks />} />
          <Route path="callbacks/:displayId" element={<Callbacks />} />
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
          {/* Legacy MSF console path — redirect into the unified Console. */}
          <Route path="msf-console/:sessionId" element={<MsfConsoleRedirect />} />
          <Route path="create-wrapper" element={<Navigate to="/payloads?tab=wrapper" replace />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
      </Suspense>

      {/* Outside <Routes> on purpose — it has to outlive the login→dashboard
          route swap that it is covering. */}
      <SessionCurtain />
      </div>
    </BattleModeProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}

export default MinervaApp;
