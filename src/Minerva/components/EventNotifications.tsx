import React from 'react';
import { useSubscription } from "@apollo/client/react";
// Imported from the leaf modules, NOT the `lib/api` barrel. This component is
// eager (App.tsx mounts it outside the lazy routes), and `lib/api/index.ts`
// re-exports all 28 api modules — so three symbols were pulling every gql
// document in the app into the entry bundle and paying graphql's parser for
// all of them at startup.
import { SUBSCRIBE_NEW_CALLBACKS, SUBSCRIBE_ALERT_COUNT } from '../lib/api/notifications';
import { SUBSCRIBE_EVENTS } from '../lib/api/eventFeed';
import { useAppStore } from '../store';
import { useShallow } from 'zustand/shallow';
import { getSkewedNow } from '../lib/time';
import { Bell, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'react-toastify';
import { playNotification } from '../lib/soundEffects';
import { dbg } from '../lib/utils';
import { pushBroadcast } from '../lib/broadcastBus';
import { parseBroadcastMessage } from './broadcastTheme';
import { subscribeMsfNewSession, pickMsfHost, pickMsfUser } from '../pages/Callbacks/msfSyntheticCallbacks';

// Component that plays a sound + raises a top-center broadcast for every
// callback arrival. Mythic native callbacks and Metasploit sessions both
// flow through `pushBroadcast`, which calls `playCallback()` internally,
// so the operator gets one consistent "new callback" notification regardless
// of agent type.
export function CallbackSoundTrigger() {
    const [fromNow] = React.useState(getSkewedNow().toISOString());

    useSubscription<any>(SUBSCRIBE_NEW_CALLBACKS, {
        variables: { fromNow },
        fetchPolicy: "no-cache",
        shouldResubscribe: true,
        onData: ({ data }: { data: any } ) => {
            const incoming: any[] = data?.data?.callback_stream || [];
            for (const cb of incoming) {
                const agent = (cb?.payload?.payloadtype?.name || 'CALLBACK').toUpperCase();
                const displayId = cb?.display_id ?? cb?.id;
                // `pushBroadcast` already triggers `playCallback()` — explicitly
                // calling it would double the chime.
                pushBroadcast({
                    level: 'ops',
                    title: `New callback C${displayId}`,
                    message: `${cb?.user || '?'}@${cb?.host || '?'} · ${agent}`,
                    key: `mythic-new-callback-${cb?.id}`,
                    holdMs: 6000,
                    ttlMs: 30_000,
                });
            }
        },
        onError: (error) => {
            dbg('subscriptions', 'Callback sound trigger error:', error);
        },
    });

    // Mirror the same arrival behaviour for Metasploit sessions: the
    // synthetic-callback ledger fires `subscribeMsfNewSession` whenever
    // a session appears on MSF-RPC for the first time (or resurrects after
    // dying). We play the callback sound and queue a broadcast just like
    // a fresh Mythic callback would.
    React.useEffect(() => {
        return subscribeMsfNewSession((ev) => {
            // `pushBroadcast` already triggers `playCallback()` — calling
            // it here a second time would double the chime.
            const host = pickMsfHost(ev.snapshot);
            const user = pickMsfUser(ev.snapshot);
            pushBroadcast({
                level: ev.resurrected ? 'info' : 'ops',
                title: ev.resurrected
                    ? `MSF-${ev.sessionId} resurrected`
                    : `New MSF session MSF-${ev.sessionId}`,
                message: `${user}@${host} · ${ev.snapshot.type?.toUpperCase() || 'SESSION'}`,
                key: `msf-new-${ev.sessionId}-${ev.resurrected ? 'res' : 'new'}`,
                holdMs: 6000,
                ttlMs: 30_000,
            });
        });
    }, []);

    return null;
}

// Custom toast component for cyberpunk style
const CyberToast = ({ 
    message, 
    username, 
    isWarning 
}: { 
    message: string; 
    username?: string; 
    isWarning: boolean;
}) => {
    return (
        <div className="flex items-start gap-3">
            <div className={`p-2 rounded ${isWarning ? 'bg-amber-500/20' : 'bg-cyan-500/20'}`}>
                {isWarning ? (
                    <AlertTriangle size={18} className="text-amber-400" />
                ) : (
                    <Info size={18} className="text-cyan-400" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                {username && (
                    <div className="text-xs text-gray-400 font-mono mb-1 uppercase tracking-wider">
                        {username}
                    </div>
                )}
                <div className="text-sm text-white break-words whitespace-pre-wrap">
                    {message}
                </div>
            </div>
        </div>
    );
};

// Component that listens for real-time event notifications
export function EventNotifications() {
    const [fromNow] = React.useState(getSkewedNow().toISOString());
    const hideLoginNotifications = useAppStore(s => s.hideLoginNotifications);

    useSubscription<any>(SUBSCRIBE_EVENTS, {
        variables: { fromNow },
        fetchPolicy: "no-cache",
        shouldResubscribe: true,
        onError: (error) => {
            dbg('subscriptions', 'Event notification subscription error:', error);
        },
        onData: ({ data }: { data: any } ) => {
            if (data.data?.operationeventlog_stream?.length > 0) {
                const stream = data.data.operationeventlog_stream;
                
                stream.forEach((event: any) => {
                    // Bridge Minerva important-broadcast events into the in-app
                    // ImportantBroadcast bar and skip the regular toast.
                    // Detection: parse JSON and check minerva_broadcast marker
                    // (source is now 'minerva_broadcast:<uuid>' — unique per send
                    // to bypass Mythic server dedup on same-source warning events).
                    const broadcastPayload = parseBroadcastMessage(event.message);
                    if (broadcastPayload) {
                        pushBroadcast({
                            level: broadcastPayload.level,
                            title: broadcastPayload.title,
                            message: broadcastPayload.body,
                            key: `evt-${event.id}`,
                            ttlMs: 15_000,
                        });
                        return; // proceed to next event in stream
                    }

                    // Filter out api, debug, and agent level events
                    if (event.level === 'api' || event.level === 'debug' || event.level === 'agent') {
                        return;
                    }

                    // Skip resolved events
                    if (event.resolved) {
                        return;
                    }

                    // Skip login notifications if user disabled them
                    if (hideLoginNotifications && /\blogged in\b/i.test(event.message)) {
                        return;
                    }

                    const username = event.operator?.username;
                    const message = event.message;

                    // Play notification sound
                    playNotification();

                    // Show toast notification
                    if (event.warning) {
                        toast.warning(
                            <CyberToast message={message} username={username} isWarning={true} />,
                            { autoClose: 4000 }
                        );
                    } else {
                        toast.info(
                            <CyberToast message={message} username={username} isWarning={false} />,
                            { autoClose: 3000 }
                        );
                    }
                });
            }
        }
    });

    return null;
}

// Component that tracks alert count for badge
export function AlertCountSubscription() {
    const { alertCount, setAlertCount } = useAppStore(useShallow(s => ({ alertCount: s.alertCount, setAlertCount: s.setAlertCount })));

    useSubscription<any>(SUBSCRIBE_ALERT_COUNT, {
        shouldResubscribe: true,
        onError: (error) => {
            dbg('subscriptions', 'Alert count subscription error:', error);
        },
        onData: ({ data }: { data: any } ) => {
            const newAlertCount = data.data?.operation_stream?.[0]?.alert_count ?? 0;
            if (newAlertCount !== alertCount) {
                setAlertCount(newAlertCount);
            }
        }
    });

    return null;
}

// Badge component for sidebar
export function NotificationBadge({ className }: { className?: string }) {
    const alertCount = useAppStore(s => s.alertCount);

    if (alertCount === 0) return null;

    return (
        <span 
            className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center 
                        text-[10px] font-bold bg-red-500 text-white rounded-full 
                        animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)] ${className}`}
        >
            {alertCount > 99 ? '99+' : alertCount}
        </span>
    );
}

// Larger notification bell icon with badge for sidebar
export function NotificationBell({ size = 20 }: { size?: number }) {
    const alertCount = useAppStore(s => s.alertCount);

    return (
        <div className="relative">
            <Bell size={size} strokeWidth={2} className={alertCount > 0 ? 'text-amber-400' : ''} />
            {alertCount > 0 && (
                <span 
                    className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center 
                               text-[9px] font-bold bg-red-500 text-white rounded-full 
                               animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                >
                    {alertCount > 99 ? '99+' : alertCount}
                </span>
            )}
        </div>
    );
}
