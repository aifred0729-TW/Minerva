import React, { useEffect } from 'react';
import { gql, useSubscription } from '@apollo/client';
import { snackActions } from '../../Archive/components/utilities/Snackbar';
import { useAppStore } from '../store';
import { getSkewedNow } from '../../Archive/components/utilities/Time';
import { Bell, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'react-toastify';

// Subscription for real-time event notifications
const SUBSCRIBE_EVENTS = gql`
    subscription EventFeedNotificationSubscription($fromNow: timestamp!) {
        operationeventlog_stream(
            cursor: {initial_value: {timestamp: $fromNow}, ordering: ASC}, 
            batch_size: 1, 
            where: {deleted: {_eq: false}}
        ) {
            operator {
                username
            }
            id
            message
            level
            resolved
            source
            warning
        }
    }
`;

// Subscription for alert count badge
const SUBSCRIBE_ALERT_COUNT = gql`
    subscription OperationAlertCounts {
        operation_stream(
            cursor: {initial_value: {updated_at: "1970-01-01"}, ordering: ASC}, 
            batch_size: 1
        ) {
            id
            alert_count
        }
    }
`;

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

    useSubscription(SUBSCRIBE_EVENTS, {
        variables: { fromNow },
        fetchPolicy: "no-cache",
        shouldResubscribe: true,
        onError: (error) => {
            console.error('Event notification subscription error:', error);
        },
        onData: ({ data }) => {
            if (data.data?.operationeventlog_stream?.length > 0) {
                const event = data.data.operationeventlog_stream[0];
                
                // Filter out api, debug, and agent level events
                if (event.level === 'api' || event.level === 'debug' || event.level === 'agent') {
                    return;
                }
                
                // Skip resolved events
                if (event.resolved) {
                    return;
                }

                const username = event.operator?.username;
                const message = event.message;

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
            }
        }
    });

    return null;
}

// Component that tracks alert count for badge
export function AlertCountSubscription() {
    const { alertCount, setAlertCount } = useAppStore();

    useSubscription(SUBSCRIBE_ALERT_COUNT, {
        onError: (error) => {
            console.error('Alert count subscription error:', error);
        },
        onData: ({ data }) => {
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
    const { alertCount } = useAppStore();

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
export function NotificationBell() {
    const { alertCount } = useAppStore();

    return (
        <div className="relative">
            <Bell size={20} className={alertCount > 0 ? 'text-amber-400' : ''} />
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
