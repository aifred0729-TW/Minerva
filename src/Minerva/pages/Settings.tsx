import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { 
    Settings as SettingsIcon, 
    Server, 
    Shield, 
    Bell, 
    Users,
    ChevronRight,
    Check,
    AlertTriangle,
    Link2,
    RefreshCw
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Sidebar } from '../components/Sidebar';
import { useAppStore } from '../store';
import { 
    GET_GLOBAL_SETTINGS, 
    UPDATE_GLOBAL_SETTINGS
} from '../lib/api';
import { snackActions } from '../../Archive/components/utilities/Snackbar';
import { cn } from '../lib/utils';

// ===== Global Settings Section =====
const GlobalSettingsSection = () => {
    const [settings, setSettings] = useState({
        serverName: '',
        debugAgentMessage: false,
        allowInviteLinks: false,
        allowWebhooksOnNewCallbacks: true,
    });
    const [userPreferences, setUserPreferences] = useState('{}');
    const [hasChanges, setHasChanges] = useState(false);

    const { loading, refetch } = useQuery(GET_GLOBAL_SETTINGS, {
        fetchPolicy: 'no-cache',
        onCompleted: (data) => {
            const serverConfig = data.getGlobalSettings?.settings?.server_config || {};
            setSettings({
                serverName: serverConfig.name || '',
                debugAgentMessage: serverConfig.debug_agent_message || false,
                allowInviteLinks: serverConfig.allow_invite_links || false,
                allowWebhooksOnNewCallbacks: serverConfig.allow_webhooks_on_new_callbacks ?? true,
            });
            setUserPreferences(JSON.stringify(data.getGlobalSettings?.settings?.preferences || {}, null, 2));
            setHasChanges(false);
        },
        onError: (err) => {
            snackActions.error('Failed to load global settings');
        }
    });

    const [updateSettings, { loading: saving }] = useMutation(UPDATE_GLOBAL_SETTINGS, {
        onCompleted: (result) => {
            if (result.updateGlobalSettings.status === 'success') {
                snackActions.success('Settings updated successfully');
                setHasChanges(false);
            } else {
                snackActions.error(result.updateGlobalSettings.error);
            }
        },
        onError: () => {
            snackActions.error('Failed to update settings - Admin permission required');
        }
    });

    const handleToggle = (key: keyof typeof settings) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
        setHasChanges(true);
    };

    const handleSave = () => {
        try {
            const prefs = JSON.parse(userPreferences);
            updateSettings({
                variables: {
                    settings: {
                        server_config: {
                            name: settings.serverName,
                            debug_agent_message: settings.debugAgentMessage,
                            allow_invite_links: settings.allowInviteLinks,
                            allow_webhooks_on_new_callbacks: settings.allowWebhooksOnNewCallbacks,
                        },
                        preferences: prefs
                    }
                }
            });
        } catch (e) {
            snackActions.error('Invalid JSON in user preferences');
        }
    };

    const settingsItems = [
        {
            key: 'serverName',
            icon: Server,
            title: 'Server Name',
            description: 'Local server name sent as part of webhooks',
            type: 'text' as const,
        },
        {
            key: 'debugAgentMessage',
            icon: AlertTriangle,
            title: 'Debug Agent Messages',
            description: 'Emit detailed agent message parsing to event logs (noisy, can slow server)',
            type: 'toggle' as const,
        },
        {
            key: 'allowInviteLinks',
            icon: Link2,
            title: 'Allow Invite Links',
            description: 'Allow admin users to create invite links for new user registration',
            type: 'toggle' as const,
        },
        {
            key: 'allowWebhooksOnNewCallbacks',
            icon: Bell,
            title: 'Webhook Notifications',
            description: 'Send webhook notifications when new callbacks are received',
            type: 'toggle' as const,
        },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw size={24} className="animate-spin text-signal/50" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {settingsItems.map((item) => (
                <div 
                    key={item.key}
                    className="bg-black/40 border border-signal/20 p-4 flex items-center justify-between gap-4 hover:border-signal/40 transition-colors"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-signal/10 flex items-center justify-center">
                            <item.icon size={20} className="text-signal" />
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-white">{item.title}</h3>
                            <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                        </div>
                    </div>
                    
                    {item.type === 'toggle' ? (
                        <button
                            onClick={() => handleToggle(item.key as keyof typeof settings)}
                            className={`relative w-12 h-6 rounded-sm transition-colors ${
                                settings[item.key as keyof typeof settings] 
                                    ? 'bg-signal/30' 
                                    : 'bg-gray-700'
                            }`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white transition-all ${
                                settings[item.key as keyof typeof settings] 
                                    ? 'left-7' 
                                    : 'left-1'
                            }`} />
                        </button>
                    ) : (
                        <input
                            type="text"
                            value={settings.serverName}
                            onChange={(e) => {
                                setSettings(prev => ({ ...prev, serverName: e.target.value }));
                                setHasChanges(true);
                            }}
                            className="bg-black/60 border border-signal/30 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-signal w-64"
                            placeholder="Enter server name..."
                        />
                    )}
                </div>
            ))}

            {/* User Preferences JSON Editor */}
            <div className="bg-black/40 border border-signal/20 p-4">
                <div className="flex items-center gap-4 mb-3">
                    <div className="w-10 h-10 bg-signal/10 flex items-center justify-center">
                        <Users size={20} className="text-signal" />
                    </div>
                    <div>
                        <h3 className="text-sm font-medium text-white">Default User Preferences</h3>
                        <p className="text-xs text-gray-500 mt-0.5">JSON configuration applied to new users only</p>
                    </div>
                </div>
                <textarea
                    value={userPreferences}
                    onChange={(e) => {
                        setUserPreferences(e.target.value);
                        setHasChanges(true);
                    }}
                    className="w-full h-32 bg-black/60 border border-signal/30 p-3 text-xs font-mono text-gray-300 focus:outline-none focus:border-signal resize-none"
                    placeholder="{}"
                />
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4">
                <button
                    onClick={handleSave}
                    disabled={!hasChanges || saving}
                    className={`px-6 py-2 text-sm font-medium uppercase tracking-wider transition-all ${
                        hasChanges && !saving
                            ? 'bg-signal text-black hover:bg-signal/80'
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </div>
    );
};

// ===== Main Settings Page =====
const SettingsPage = () => {
    const { isSidebarCollapsed } = useAppStore();

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <Sidebar />
            
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={cn("flex-1 flex flex-col transition-all duration-300 p-6 lg:p-12", isSidebarCollapsed ? "ml-16" : "ml-64")}
            >
                {/* Header */}
                <header className="flex justify-between items-center mb-8 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-signal bg-signal/10 rounded">
                            <Shield size={24} className="text-signal" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest">MYTHIC SETTINGS</h1>
                            <p className="text-xs text-gray-400 font-mono">/root/system/config</p>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <div className="max-w-4xl flex-1 overflow-y-auto">
                    <GlobalSettingsSection />
                </div>
            </motion.div>
        </div>
    );
};

export default SettingsPage;