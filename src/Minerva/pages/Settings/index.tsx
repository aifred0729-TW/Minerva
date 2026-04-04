import React, { useState, useRef } from 'react';
import { useMutation } from "@apollo/client/react";
import { useQueryCompat as useQuery } from "../../lib/useQueryCompat";
import {
    Server, Shield, Bell, Users, AlertTriangle, Link2, RefreshCw, Eye,
    Clock, Hash, Terminal, List, RotateCcw, SlidersHorizontal, Type,
    Layout, Code, Film, Key, KeyRound, Plus, Trash2, Copy, Upload,
    X, Layers, Columns, Power, PowerOff, Palette, Folder, Music2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '../../store';
import {
    GET_GLOBAL_SETTINGS, UPDATE_GLOBAL_SETTINGS,
    GET_OPERATOR_SECRETS, UPDATE_OPERATOR_SECRETS,
    GET_API_TOKENS, CREATE_API_TOKEN, DELETE_API_TOKEN, TOGGLE_API_TOKEN_ACTIVE,
} from '../../lib/api';
import { snackActions } from '../../lib/snackbar';
import { cn, getErrorMessage, downloadBlob } from '../../lib/utils';
import { useGetMythicSetting, useSetMythicSetting } from '../../components/MythicSavedUserSetting';
import { operatorSettingDefaults, meState, mePreferences } from '../../lib/state';
import { useReactiveVar } from "@apollo/client/react";
import { ToggleRow, SelectRow, NumberRow, TextRow, MultiSelectRow } from './SettingsRows';
import { PaletteSection } from './PaletteSection';
import { AudioSection } from './AudioSection';
import { SidebarShortcutsSection, DEFAULT_SIDEBAR_SHORTCUTS } from './SidebarShortcuts';

// Re-export for Sidebar.tsx which imports from '../pages/Settings'
export { DEFAULT_SIDEBAR_SHORTCUTS };

/* ─────────── Operator Settings ─────────── */
const LoginNotificationToggle = () => {
    const {hideLoginNotifications,setHideLoginNotifications}=useAppStore();
    return <ToggleRow icon={Bell} title="Hide Login Notifications" description="Suppress toast notifications when operators log in" value={hideLoginNotifications} onChange={v=>setHideLoginNotifications(v)}/>;
};

const OperatorSettingsSection = () => {
    const [setSetting,,resetSettings] = useSetMythicSetting();
    const hideUsernames=useGetMythicSetting({setting_name:'hideUsernames',default_value:operatorSettingDefaults.hideUsernames});
    const showIP=useGetMythicSetting({setting_name:'showIP',default_value:operatorSettingDefaults.showIP});
    const showHostname=useGetMythicSetting({setting_name:'showHostname',default_value:operatorSettingDefaults.showHostname});
    const showCallbackGroups=useGetMythicSetting({setting_name:'showCallbackGroups',default_value:operatorSettingDefaults.showCallbackGroups});
    const showOPSECBypass=useGetMythicSetting({setting_name:'showOPSECBypassUsername',default_value:operatorSettingDefaults.showOPSECBypassUsername});
    const useDisplayParams=useGetMythicSetting({setting_name:'useDisplayParamsForCLIHistory',default_value:operatorSettingDefaults.useDisplayParamsForCLIHistory});
    const timestampField=useGetMythicSetting({setting_name:'taskTimestampDisplayField',default_value:operatorSettingDefaults.taskTimestampDisplayField??'timestamp'});
    const streamLimit=useGetMythicSetting({setting_name:'experiment-responseStreamLimit',default_value:operatorSettingDefaults['experiment-responseStreamLimit']??50});
    const fontSize=useGetMythicSetting({setting_name:'fontSize',default_value:operatorSettingDefaults.fontSize??12});
    const fontFamily=useGetMythicSetting({setting_name:'fontFamily',default_value:operatorSettingDefaults.fontFamily??'Verdana, Arial, sans-serif'});
    const showMedia=useGetMythicSetting({setting_name:'showMedia',default_value:operatorSettingDefaults.showMedia??true});
    const autoTaskLs=useGetMythicSetting({setting_name:'autoTaskLsOnEmptyDirectories',default_value:operatorSettingDefaults.autoTaskLsOnEmptyDirectories??false});
    const interactType=useGetMythicSetting({setting_name:'interactType',default_value:operatorSettingDefaults.interactType??'interactSplit'});
    const hideBrowserTasking=useGetMythicSetting({setting_name:'hideBrowserTasking',default_value:operatorSettingDefaults.hideBrowserTasking??false});
    const hideTaskingContext=useGetMythicSetting({setting_name:'hideTaskingContext',default_value:operatorSettingDefaults.hideTaskingContext??false});
    const taskingContextFields=useGetMythicSetting({setting_name:'taskingContextFields',default_value:operatorSettingDefaults.taskingContextFields??['impersonation_context','cwd']});
    const set=(name:string,value:any)=>setSetting({setting_name:name,value});
    const TIMESTAMP_OPTIONS=[{value:'timestamp',label:'Created (timestamp)'},{value:'status_timestamp_submitted',label:'Submitted'},{value:'status_timestamp_preprocessing',label:'Pre-processing'},{value:'status_timestamp_processing',label:'Processing'}];
    const INTERACT_OPTIONS=[{value:'interact',label:'Accordion'},{value:'interactSplit',label:'Split View'},{value:'interactConsole',label:'Console'}];
    const CTX_OPTS=['impersonation_context','cwd','user','host','ip','pid','process_short_name','extra_info','architecture'].sort();
    const prefs=useReactiveVar(mePreferences);
    const fileInputRef=useRef<HTMLInputElement>(null);
    const handleExport=()=>{navigator.clipboard.writeText(JSON.stringify(prefs,null,2)).then(()=>snackActions.success('Preferences copied to clipboard')).catch(()=>{downloadBlob(new Blob([JSON.stringify(prefs,null,2)],{type:'application/json'}),'mythic_preferences.json')})};
    const handleImport=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{const i=JSON.parse(ev.target?.result as string);mePreferences({...operatorSettingDefaults,...i});snackActions.success('Preferences imported')}catch{snackActions.error('Invalid JSON')}};r.readAsText(f);e.target.value=''};

    return (
        <div className="space-y-3">
            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-2 pb-1 border-b border-white/5">TASK HEADER DISPLAY</div>
            <ToggleRow icon={Users} title="Hide Operator Usernames" description="Don't show the operator name on each task header" value={hideUsernames} onChange={v=>set('hideUsernames',v)}/>
            <ToggleRow icon={Eye} title="Show IP Address" description="Show callback IP in task headers" value={showIP} onChange={v=>set('showIP',v)}/>
            <ToggleRow icon={Terminal} title="Show Hostname" description="Show callback hostname in task headers" value={showHostname} onChange={v=>set('showHostname',v)}/>
            <ToggleRow icon={List} title="Show Callback Groups" description="Show mythictree_groups in task headers" value={showCallbackGroups} onChange={v=>set('showCallbackGroups',v)}/>
            <ToggleRow icon={Shield} title="Show OPSEC Bypass Username" description="Show who approved OPSEC bypasses in task headers" value={showOPSECBypass} onChange={v=>set('showOPSECBypassUsername',v)}/>
            <SelectRow icon={Clock} title="Timestamp Display Field" description="Which task timestamp to show in headers" value={timestampField} onChange={v=>set('taskTimestampDisplayField',v)} options={TIMESTAMP_OPTIONS}/>

            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-3 pb-1 border-b border-white/5">TASK DISPLAY MODE</div>
            <SelectRow icon={Layout} title="Task Interaction Type" description="How tasks are displayed (Accordion / Split / Console)" value={interactType} onChange={v=>set('interactType',v)} options={INTERACT_OPTIONS}/>
            <ToggleRow icon={Code} title="Hide Browser-Script Tasking" description="Hide tasks issued from browser script UI buttons" value={hideBrowserTasking} onChange={v=>set('hideBrowserTasking',v)}/>
            <ToggleRow icon={Film} title="Auto-Show Media" description="Automatically show media in browser-script output" value={showMedia} onChange={v=>set('showMedia',v)}/>

            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-3 pb-1 border-b border-white/5">TASKING CONTEXT</div>
            <ToggleRow icon={Layers} title="Hide Tasking Context" description="Hide tasking context tabs (CWD, impersonation, etc.)" value={hideTaskingContext} onChange={v=>set('hideTaskingContext',v)}/>
            <MultiSelectRow icon={Columns} title="Context Fields" description="Which context fields to show" value={Array.isArray(taskingContextFields)?taskingContextFields:['impersonation_context','cwd']} onChange={v=>set('taskingContextFields',v)} options={CTX_OPTS}/>

            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-3 pb-1 border-b border-white/5">CLI HISTORY</div>
            <ToggleRow icon={Hash} title="Use Display Params for CLI History" description="↑↓ history shows display_params instead of original_params" value={useDisplayParams} onChange={v=>set('useDisplayParamsForCLIHistory',v)}/>

            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-3 pb-1 border-b border-white/5">APPEARANCE</div>
            <NumberRow icon={Type} title="Font Size" description="Global UI font size in pixels" value={typeof fontSize==='number'?fontSize:12} onChange={v=>set('fontSize',v)} min={8}/>
            <TextRow icon={Type} title="Font Family" description="CSS font-family string for the UI" value={fontFamily??'Verdana, Arial, sans-serif'} onChange={v=>set('fontFamily',v)} placeholder="Verdana, Arial, sans-serif"/>

            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-3 pb-1 border-b border-white/5">FILE BROWSER</div>
            <ToggleRow icon={Folder} title="Auto-Task LS on Empty Dirs" description="Automatically issue 'ls' when browsing into empty directories" value={autoTaskLs} onChange={v=>set('autoTaskLsOnEmptyDirectories',v)}/>

            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-3 pb-1 border-b border-white/5">NOTIFICATIONS</div>
            <LoginNotificationToggle/>

            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-3 pb-1 border-b border-white/5">OUTPUT / PERFORMANCE</div>
            <NumberRow icon={SlidersHorizontal} title="Response Stream Limit" description="Max responses per task before paginating (0 = never paginate)" value={typeof streamLimit==='number'?streamLimit:50} onChange={v=>set('experiment-responseStreamLimit',v)}/>

            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-3 pb-1 border-b border-white/5">PREFERENCES MANAGEMENT</div>
            <div className="flex flex-wrap gap-2 pt-2">
                <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 text-xs font-mono text-gray-400 hover:text-signal border border-white/10 hover:border-signal/30 transition-colors"><Copy size={12}/>EXPORT TO CLIPBOARD</button>
                <button onClick={()=>fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 text-xs font-mono text-gray-400 hover:text-signal border border-white/10 hover:border-signal/30 transition-colors"><Upload size={12}/>IMPORT FROM FILE</button>
                <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport}/>
                <button onClick={()=>{resetSettings();snackActions.success('Settings reset to defaults')}} className="flex items-center gap-2 px-4 py-2 text-xs font-mono text-gray-500 hover:text-red-400 border border-white/10 hover:border-red-500/30 transition-colors"><RotateCcw size={12}/>RESET TO DEFAULTS</button>
            </div>
        </div>
    );
};

/* ─────────── Operator Secrets ─────────── */
const OperatorSecretsSection = () => {
    const me=useReactiveVar(meState);const opId=me?.user?.id;
    const [secrets,setSecrets]=useState<Record<string,string>>({});
    const [nk,setNk]=useState('');const [nv,setNv]=useState('');
    const {loading}=useQuery<any>(GET_OPERATOR_SECRETS,{variables:{operator_id:opId},skip:!opId,fetchPolicy:'no-cache',onCompleted:(d:any)=>{if(d?.getOperatorSecrets?.status==='success')setSecrets(d.getOperatorSecrets.secrets||{})}});
    const [updateSecrets,{loading:saving}]=useMutation<any>(UPDATE_OPERATOR_SECRETS);
    const save=async()=>{try{const r=await updateSecrets({variables:{secrets,operator_id:opId}});r.data?.updateOperatorSecrets?.status==='success'?snackActions.success('Secrets saved'):snackActions.error(r.data?.updateOperatorSecrets?.error||'Failed')}catch(e: unknown){snackActions.error(getErrorMessage(e))}};
    if(loading)return<div className="flex items-center justify-center h-32"><RefreshCw size={20} className="animate-spin text-signal/50"/></div>;
    return(
        <div className="space-y-4">
            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-2 pb-1 border-b border-white/5">OPERATOR SECRETS (KEY → VALUE)</div>
            <p className="text-xs text-gray-500">Encrypted secrets per-operator. Used by agents/eventing workflows.</p>
            {Object.entries(secrets).map(([k,v])=>(
                <div key={k} className="bg-black/40 border border-white/10 p-3 flex items-center gap-3">
                    <span className="text-xs font-mono text-signal min-w-[120px]">{k}</span>
                    <input type="text" value={v} onChange={e=>setSecrets(p=>({...p,[k]:e.target.value}))} className="flex-1 bg-black/60 border border-white/15 text-gray-300 text-xs font-mono px-2 py-1 focus:outline-none focus:border-signal/40 rounded-sm"/>
                    <button onClick={()=>setSecrets(p=>{const n={...p};delete n[k];return n})} className="text-gray-500 hover:text-red-400 transition-colors"><Trash2 size={14}/></button>
                </div>
            ))}
            <div className="flex gap-2">
                <input type="text" value={nk} onChange={e=>setNk(e.target.value)} placeholder="Key" className="w-40 bg-black/60 border border-white/15 text-gray-300 text-xs font-mono px-2 py-1.5 focus:outline-none focus:border-signal/40 rounded-sm"/>
                <input type="text" value={nv} onChange={e=>setNv(e.target.value)} placeholder="Value" className="flex-1 bg-black/60 border border-white/15 text-gray-300 text-xs font-mono px-2 py-1.5 focus:outline-none focus:border-signal/40 rounded-sm"/>
                <button onClick={()=>{if(!nk.trim())return;setSecrets(p=>({...p,[nk.trim()]:nv}));setNk('');setNv('')}} disabled={!nk.trim()} className="px-3 py-1.5 text-xs font-mono border border-signal/30 text-signal hover:bg-signal/10 disabled:opacity-30 transition-colors"><Plus size={14}/></button>
            </div>
            <div className="flex justify-end"><button onClick={save} disabled={saving} className="px-6 py-2 text-xs font-mono uppercase tracking-wider bg-signal text-black hover:bg-signal/80 disabled:opacity-50 transition-colors">{saving?'SAVING...':'SAVE SECRETS'}</button></div>
        </div>
    );
};

/* ─────────── API Tokens ─────────── */
const APITokensSection = () => {
    const me=useReactiveVar(meState);const opId=me?.user?.id;
    const [tokens,setTokens]=useState<any[]>([]);const [name,setName]=useState('');const [shown,setShown]=useState<string|null>(null);
    const {loading,refetch}=useQuery<any>(GET_API_TOKENS,{variables:{operator_id:opId},skip:!opId,fetchPolicy:'no-cache',onCompleted:(d:any)=>setTokens(d?.apitokens||[])});
    const [createToken]=useMutation<any>(CREATE_API_TOKEN);const [deleteToken]=useMutation<any>(DELETE_API_TOKEN);const [toggleActive]=useMutation<any>(TOGGLE_API_TOKEN_ACTIVE);
    const create=async()=>{if(!name.trim())return;try{const r=await createToken({variables:{operator_id:opId,name:name.trim()}});const d=r.data?.createAPIToken;if(d?.status==='success'){setShown(d.token_value);setName('');refetch()}else snackActions.error(d?.error||'Failed')}catch(e: unknown){snackActions.error(getErrorMessage(e))}};
    if(loading)return<div className="flex items-center justify-center h-32"><RefreshCw size={20} className="animate-spin text-signal/50"/></div>;
    return(
        <div className="space-y-4">
            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-2 pb-1 border-b border-white/5">API TOKENS</div>
            <p className="text-xs text-gray-500">User-scoped API tokens for scripting and automation.</p>
            {shown&&(<div className="bg-signal/10 border border-signal/40 p-4">
                <div className="text-xs font-mono text-signal mb-1">NEW TOKEN — COPY NOW (won't be shown again)</div>
                <div className="flex items-center gap-2"><code className="text-xs font-mono text-white bg-black/60 px-3 py-1.5 flex-1 break-all">{shown}</code>
                    <button onClick={()=>{navigator.clipboard.writeText(shown);snackActions.success('Copied')}} className="px-2 py-1.5 text-signal hover:bg-signal/10"><Copy size={14}/></button>
                    <button onClick={()=>setShown(null)} className="text-gray-500 hover:text-white"><X size={14}/></button>
                </div>
            </div>)}
            <div className="flex gap-2">
                <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Token name..." className="flex-1 bg-black/60 border border-white/15 text-gray-300 text-xs font-mono px-2 py-1.5 focus:outline-none focus:border-signal/40 rounded-sm" onKeyDown={e=>e.key==='Enter'&&create()}/>
                <button onClick={create} disabled={!name.trim()} className="px-4 py-1.5 text-xs font-mono border border-signal/30 text-signal hover:bg-signal/10 disabled:opacity-30 transition-colors">CREATE TOKEN</button>
            </div>
            {tokens.filter(t=>!t.deleted).length===0?<div className="text-xs text-gray-500 text-center py-8">No API tokens</div>:
            <div className="space-y-2">{tokens.filter(t=>!t.deleted).map(t=>(
                <div key={t.id} className="bg-black/40 border border-white/10 p-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <KeyRound size={14} className={cn(t.active?'text-signal':'text-gray-600')}/>
                        <div className="min-w-0"><div className="text-xs font-mono text-white truncate">{t.name||'Unnamed'}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{t.token_value?.slice(0,8)}...{t.token_value?.slice(-8)} · {new Date(t.creation_time).toLocaleDateString()}</div></div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={()=>{navigator.clipboard.writeText(t.token_value);snackActions.success('Copied')}} className="text-gray-500 hover:text-signal transition-colors p-1" title="Copy"><Copy size={13}/></button>
                        <button onClick={async()=>{try{await toggleActive({variables:{id:t.id,active:!t.active}});refetch()}catch(e: unknown){snackActions.error(getErrorMessage(e))}}} className={cn("p-1 transition-colors",t.active?"text-signal hover:text-yellow-500":"text-gray-600 hover:text-signal")} title={t.active?'Deactivate':'Activate'}>{t.active?<Power size={13}/>:<PowerOff size={13}/>}</button>
                        <button onClick={async()=>{try{await deleteToken({variables:{id:t.id}});snackActions.success('Deleted');refetch()}catch(e: unknown){snackActions.error(getErrorMessage(e))}}} className="text-gray-500 hover:text-red-400 transition-colors p-1" title="Delete"><Trash2 size={13}/></button>
                    </div>
                </div>
            ))}</div>}
        </div>
    );
};

/* ─────────── Global Settings ─────────── */
const GlobalSettingsSection = () => {
    const [settings,setSettings]=useState({serverName:'',debugAgentMessage:false,allowInviteLinks:false,allowWebhooksOnNewCallbacks:true});
    const [userPreferences,setUserPreferences]=useState('{}');const [hasChanges,setHasChanges]=useState(false);
    const {loading}=useQuery<any>(GET_GLOBAL_SETTINGS,{fetchPolicy:'no-cache',
        onCompleted:(data:any)=>{const sc=data.getGlobalSettings?.settings?.server_config||{};setSettings({serverName:sc.name||'',debugAgentMessage:sc.debug_agent_message||false,allowInviteLinks:sc.allow_invite_links||false,allowWebhooksOnNewCallbacks:sc.allow_webhooks_on_new_callbacks??true});setUserPreferences(JSON.stringify(data.getGlobalSettings?.settings?.preferences||{},null,2));setHasChanges(false)},
        onError:()=>snackActions.error('Failed to load global settings')});
    const [updateSettings,{loading:saving}]=useMutation<any>(UPDATE_GLOBAL_SETTINGS,{
        onCompleted:(r:any)=>r.updateGlobalSettings.status==='success'?(snackActions.success('Settings updated'),setHasChanges(false)):snackActions.error(r.updateGlobalSettings.error),
        onError:()=>snackActions.error('Failed to update settings')});
    const handleSave=()=>{try{const p=JSON.parse(userPreferences);updateSettings({variables:{settings:{server_config:{name:settings.serverName,debug_agent_message:settings.debugAgentMessage,allow_invite_links:settings.allowInviteLinks,allow_webhooks_on_new_callbacks:settings.allowWebhooksOnNewCallbacks},preferences:p}}})}catch{snackActions.error('Invalid JSON')}};
    if(loading)return<div className="flex items-center justify-center h-64"><RefreshCw size={24} className="animate-spin text-signal/50"/></div>;
    return(
        <div className="space-y-4">
            <TextRow icon={Server} title="Server Name" description="Local server name sent as part of webhooks" value={settings.serverName} onChange={v=>{setSettings(s=>({...s,serverName:v}));setHasChanges(true)}} placeholder="Enter server name..."/>
            <ToggleRow icon={AlertTriangle} title="Debug Agent Messages" description="Emit detailed agent message parsing to event logs" value={settings.debugAgentMessage} onChange={()=>{setSettings(s=>({...s,debugAgentMessage:!s.debugAgentMessage}));setHasChanges(true)}}/>
            <ToggleRow icon={Link2} title="Allow Invite Links" description="Allow admin users to create invite links" value={settings.allowInviteLinks} onChange={()=>{setSettings(s=>({...s,allowInviteLinks:!s.allowInviteLinks}));setHasChanges(true)}}/>
            <ToggleRow icon={Bell} title="Webhook Notifications" description="Send webhook notifications when new callbacks are received" value={settings.allowWebhooksOnNewCallbacks} onChange={()=>{setSettings(s=>({...s,allowWebhooksOnNewCallbacks:!s.allowWebhooksOnNewCallbacks}));setHasChanges(true)}}/>
            <div className="bg-black/40 border border-white/10 p-4">
                <div className="flex items-center gap-4 mb-3"><div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0"><Users size={17} className="text-gray-400"/></div>
                <div><div className="text-sm font-medium text-white">Default User Preferences</div><div className="text-xs text-gray-500 mt-0.5">JSON configuration applied to new users only</div></div></div>
                <textarea value={userPreferences} onChange={e=>{setUserPreferences(e.target.value);setHasChanges(true)}} className="w-full h-32 bg-black/60 border border-white/15 p-3 text-xs font-mono text-gray-300 focus:outline-none focus:border-signal/40 resize-none" placeholder="{}"/>
            </div>
            <div className="flex justify-end pt-4"><button onClick={handleSave} disabled={!hasChanges||saving} className={cn('px-6 py-2 text-sm font-medium uppercase tracking-wider transition-all',hasChanges&&!saving?'bg-signal text-black hover:bg-signal/80':'bg-gray-700 text-gray-500 cursor-not-allowed')}>{saving?'Saving...':'Save Changes'}</button></div>
        </div>
    );
};

/* ─────────── Main Page ─────────── */
const SettingsPage = () => {
    const {isSidebarCollapsed}=useAppStore();
    const [activeSection,setActiveSection]=useState<'operator'|'secrets'|'tokens'|'palette'|'audio'|'sidebar'|'global'>('operator');
    const sections=[
        {id:'operator' as const,label:'OPERATOR PREFS',icon:SlidersHorizontal},
        {id:'secrets'  as const,label:'SECRETS',        icon:Key},
        {id:'tokens'   as const,label:'API TOKENS',     icon:KeyRound},
        {id:'palette'  as const,label:'PALETTE',        icon:Palette},
        {id:'audio'    as const,label:'AUDIO',          icon:Music2},
        {id:'sidebar'  as const,label:'SIDEBAR',        icon:Layout},
        {id:'global'   as const,label:'GLOBAL CONFIG',  icon:Server},
    ];
    return(
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.3}} className={cn("flex-1 flex flex-col transition-all duration-300 p-6 lg:p-12 h-screen",isSidebarCollapsed?"ml-16":"ml-64")}>
                <header className="flex justify-between items-center mb-8 shrink-0">
                    <div className="flex items-center gap-4"><div className="p-3 border border-white/50 bg-white/10 rounded"><Shield size={24} className="text-white"/></div>
                    <div><h1 className="text-2xl font-bold tracking-widest text-white uppercase">MYTHIC SETTINGS</h1><p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]"><span className="w-2 h-2 bg-signal rounded-full animate-pulse" />SYSTEM CONFIGURATION</p></div></div>
                </header>
                <div className="flex gap-1 mb-6 shrink-0 flex-wrap">
                    {sections.map(s=>(<button key={s.id} onClick={()=>setActiveSection(s.id)} className={cn('flex items-center gap-2 px-4 py-2 text-xs font-mono uppercase tracking-widest border transition-colors',activeSection===s.id?'border-signal bg-signal/10 text-signal':'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300')}><s.icon size={13}/>{s.label}</button>))}
                </div>
                <div className="max-w-4xl flex-1 overflow-y-auto">
                    {activeSection==='operator'&&<OperatorSettingsSection/>}
                    {activeSection==='secrets'&&<OperatorSecretsSection/>}
                    {activeSection==='tokens'&&<APITokensSection/>}
                    {activeSection==='palette'&&<PaletteSection/>}
                    {activeSection==='audio'&&<AudioSection/>}
                    {activeSection==='sidebar'&&<SidebarShortcutsSection/>}
                    {activeSection==='global'&&<GlobalSettingsSection/>}
                </div>
            </motion.div>
        </div>
    );
};

export default SettingsPage;
