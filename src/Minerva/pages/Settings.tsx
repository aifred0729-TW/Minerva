import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { 
    Server, Shield, Bell, Users, AlertTriangle, Link2, RefreshCw, Eye,
    Clock, Hash, Terminal, List, RotateCcw, SlidersHorizontal, Type,
    Layout, Code, Film, Key, KeyRound, Plus, Trash2, Copy, Upload,
    X, Layers, Columns, Power, PowerOff, Palette, Folder,
    Volume2, Music2, Play, Pause, Disc3, GripVertical, ArrowUp, ArrowDown,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '../store';
import { 
    GET_GLOBAL_SETTINGS, UPDATE_GLOBAL_SETTINGS,
    GET_OPERATOR_SECRETS, UPDATE_OPERATOR_SECRETS,
    GET_API_TOKENS, CREATE_API_TOKEN, DELETE_API_TOKEN, TOGGLE_API_TOKEN_ACTIVE,
} from '../lib/api';
import { snackActions } from '../lib/snackbar';
import { cn, getErrorMessage } from '../lib/utils';
import { useGetMythicSetting, useSetMythicSetting } from '../components/MythicSavedUserSetting';
import { operatorSettingDefaults, meState, mePreferences } from '../lib/state';
import { useReactiveVar } from '@apollo/client';

/* ─────────── Reusable rows ─────────── */
const ToggleRow = ({icon:Icon,title,description,value,onChange}:{icon:React.ElementType;title:string;description:string;value:boolean;onChange:(v:boolean)=>void}) => (
    <div className="bg-black/40 border border-white/10 p-4 flex items-center justify-between gap-4 hover:border-white/20 transition-colors">
        <div className="flex items-center gap-4">
            <div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0"><Icon size={17} className="text-gray-400" /></div>
            <div><div className="text-sm font-medium text-white">{title}</div><div className="text-xs text-gray-500 mt-0.5">{description}</div></div>
        </div>
        <button onClick={()=>onChange(!value)} className={cn('relative w-11 h-5 rounded-sm transition-colors shrink-0',value?'bg-signal/40':'bg-gray-700')}>
            <div className={cn('absolute top-0.5 w-4 h-4 bg-white transition-all rounded-sm',value?'left-6':'left-0.5')}/>
        </button>
    </div>
);
const SelectRow = ({icon:Icon,title,description,value,onChange,options}:{icon:React.ElementType;title:string;description:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[]}) => (
    <div className="bg-black/40 border border-white/10 p-4 flex items-center justify-between gap-4 hover:border-white/20 transition-colors">
        <div className="flex items-center gap-4">
            <div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0"><Icon size={17} className="text-gray-400" /></div>
            <div><div className="text-sm font-medium text-white">{title}</div><div className="text-xs text-gray-500 mt-0.5">{description}</div></div>
        </div>
        <select value={value} onChange={e=>onChange(e.target.value)} className="bg-black/60 border border-white/15 text-gray-300 text-xs font-mono px-2 py-1.5 focus:outline-none focus:border-signal/40 transition-colors rounded-sm">
            {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    </div>
);
const NumberRow = ({icon:Icon,title,description,value,onChange,min=0}:{icon:React.ElementType;title:string;description:string;value:number;onChange:(v:number)=>void;min?:number}) => {
    const [input,setInput]=useState(String(value));
    useEffect(()=>{setInput(String(value))},[value]);
    return (
        <div className="bg-black/40 border border-white/10 p-4 flex items-center justify-between gap-4 hover:border-white/20 transition-colors">
            <div className="flex items-center gap-4">
                <div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0"><Icon size={17} className="text-gray-400" /></div>
                <div><div className="text-sm font-medium text-white">{title}</div><div className="text-xs text-gray-500 mt-0.5">{description}</div></div>
            </div>
            <input type="number" min={min} value={input} onChange={e=>setInput(e.target.value)}
                onBlur={()=>{const n=parseInt(input);if(!isNaN(n)&&n>=min)onChange(n);else setInput(String(value))}}
                className="w-24 bg-black/60 border border-white/15 text-gray-300 text-sm font-mono px-3 py-1.5 focus:outline-none focus:border-signal/40 transition-colors text-right rounded-sm"
            />
        </div>
    );
};
const SliderRow = ({icon:Icon,title,description,value,onChange,min=0,max=1,step=0.01,fmt}:{icon:React.ElementType;title:string;description:string;value:number;onChange:(v:number)=>void;min?:number;max?:number;step?:number;fmt?:(v:number)=>string}) => (
    <div className="bg-black/40 border border-white/10 p-4 hover:border-white/20 transition-colors">
        <div className="flex items-center gap-4 mb-3">
            <div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0"><Icon size={17} className="text-gray-400" /></div>
            <div className="flex-1"><div className="text-sm font-medium text-white">{title}</div><div className="text-xs text-gray-500 mt-0.5">{description}</div></div>
            <span className="font-mono text-sm text-signal tabular-nums w-14 text-right shrink-0">{fmt ? fmt(value) : `${Math.round(value * 100)}%`}</span>
        </div>
        <div className="pl-13 pr-2">
            <input type="range" min={min} max={max} step={step} value={value}
                onChange={e=>onChange(parseFloat(e.target.value))}
                className="w-full h-1.5 appearance-none bg-white/10 rounded-full cursor-pointer accent-signal"
                style={{ accentColor: '#00ffd1' }}
            />
        </div>
    </div>
);
const TextRow = ({icon:Icon,title,description,value,onChange,placeholder}:{icon:React.ElementType;title:string;description:string;value:string;onChange:(v:string)=>void;placeholder?:string}) => (
    <div className="bg-black/40 border border-white/10 p-4 flex items-center justify-between gap-4 hover:border-white/20 transition-colors">
        <div className="flex items-center gap-4">
            <div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0"><Icon size={17} className="text-gray-400" /></div>
            <div><div className="text-sm font-medium text-white">{title}</div><div className="text-xs text-gray-500 mt-0.5">{description}</div></div>
        </div>
        <input type="text" value={value} onChange={e=>onChange(e.target.value)} className="w-64 bg-black/60 border border-white/15 text-gray-300 text-sm font-mono px-3 py-1.5 focus:outline-none focus:border-signal/40 transition-colors rounded-sm" placeholder={placeholder}/>
    </div>
);
const MultiSelectRow = ({icon:Icon,title,description,value,onChange,options}:{icon:React.ElementType;title:string;description:string;value:string[];onChange:(v:string[])=>void;options:string[]}) => (
    <div className="bg-black/40 border border-white/10 p-4 hover:border-white/20 transition-colors">
        <div className="flex items-center gap-4 mb-3">
            <div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0"><Icon size={17} className="text-gray-400" /></div>
            <div><div className="text-sm font-medium text-white">{title}</div><div className="text-xs text-gray-500 mt-0.5">{description}</div></div>
        </div>
        <div className="flex flex-wrap gap-2 ml-13">
            {options.map(opt=>{const active=value.includes(opt);return(
                <button key={opt} onClick={()=>active?onChange(value.filter(v=>v!==opt)):onChange([...value,opt])}
                    className={cn('px-2 py-1 text-[11px] font-mono border rounded-sm transition-colors',active?'border-signal/50 bg-signal/10 text-signal':'border-white/10 text-gray-500 hover:border-white/20')}>{opt}</button>
            )})}
        </div>
    </div>
);

/* ─────────── Operator Settings ─────────── */
const LoginNotificationToggle = () => {
    const {hideLoginNotifications,setHideLoginNotifications}=useAppStore();
    return <ToggleRow icon={Bell} title="Hide Login Notifications" description="Suppress toast notifications when operators log in" value={hideLoginNotifications} onChange={v=>setHideLoginNotifications(v)}/>;
};

const OperatorSettingsSection = () => {
    const [setSetting,,resetSettings] = useSetMythicSetting() as any;
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
    const handleExport=()=>{navigator.clipboard.writeText(JSON.stringify(prefs,null,2)).then(()=>snackActions.success('Preferences copied to clipboard')).catch(()=>{const b=new Blob([JSON.stringify(prefs,null,2)],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='mythic_preferences.json';a.click();URL.revokeObjectURL(u)})};
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
    const {loading}=useQuery(GET_OPERATOR_SECRETS,{variables:{operator_id:opId},skip:!opId,fetchPolicy:'no-cache',onCompleted:(d:any)=>{if(d?.getOperatorSecrets?.status==='success')setSecrets(d.getOperatorSecrets.secrets||{})}});
    const [updateSecrets,{loading:saving}]=useMutation(UPDATE_OPERATOR_SECRETS);
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
    const {loading,refetch}=useQuery(GET_API_TOKENS,{variables:{operator_id:opId},skip:!opId,fetchPolicy:'no-cache',onCompleted:(d:any)=>setTokens(d?.apitokens||[])});
    const [createToken]=useMutation(CREATE_API_TOKEN);const [deleteToken]=useMutation(DELETE_API_TOKEN);const [toggleActive]=useMutation(TOGGLE_API_TOKEN_ACTIVE);
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
    const {loading}=useQuery(GET_GLOBAL_SETTINGS,{fetchPolicy:'no-cache',
        onCompleted:(data:any)=>{const sc=data.getGlobalSettings?.settings?.server_config||{};setSettings({serverName:sc.name||'',debugAgentMessage:sc.debug_agent_message||false,allowInviteLinks:sc.allow_invite_links||false,allowWebhooksOnNewCallbacks:sc.allow_webhooks_on_new_callbacks??true});setUserPreferences(JSON.stringify(data.getGlobalSettings?.settings?.preferences||{},null,2));setHasChanges(false)},
        onError:()=>snackActions.error('Failed to load global settings')});
    const [updateSettings,{loading:saving}]=useMutation(UPDATE_GLOBAL_SETTINGS,{
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

/* ─────────── Palette / Theme Customization ─────────── */
const PALETTE_GROUPS: { label: string; fields: { key: string; name: string; darkDefault: string; lightDefault: string }[] }[] = [
    {
        label: 'ACCENT / STATUS COLORS',
        fields: [
            { key: 'primary', name: 'Primary', darkDefault: '#75859b', lightDefault: '#75859b' },
            { key: 'error', name: 'Error', darkDefault: '#bd5142', lightDefault: '#c42c32' },
            { key: 'success', name: 'Success', darkDefault: '#85b089', lightDefault: '#0e7004' },
            { key: 'secondary', name: 'Secondary', darkDefault: '#bebebe', lightDefault: '#a6a5a5' },
            { key: 'info', name: 'Informational', darkDefault: '#84b4dc', lightDefault: '#4990b2' },
            { key: 'warning', name: 'Warning', darkDefault: '#dc8455', lightDefault: '#ffb74d' },
        ],
    },
    {
        label: 'LAYOUT / BACKGROUND',
        fields: [
            { key: 'background', name: 'Background', darkDefault: '#282828', lightDefault: '#f6f6f6' },
            { key: 'paper', name: 'Modals Background', darkDefault: '#282828', lightDefault: '#ececec' },
            { key: 'text', name: 'Text', darkDefault: '#e4e4e4', lightDefault: '#000000' },
        ],
    },
    {
        label: 'TABLE',
        fields: [
            { key: 'tableHeader', name: 'Table Headers', darkDefault: '#484848', lightDefault: '#c4c4c4' },
            { key: 'tableHover', name: 'Table Hover', darkDefault: '#3c3c3c', lightDefault: '#e8e8e8' },
        ],
    },
    {
        label: 'NAVIGATION',
        fields: [
            { key: 'navBarColor', name: 'Nav Bar Top', darkDefault: '#194573', lightDefault: '#3b606d' },
            { key: 'navBarBottomColor', name: 'Nav Bar Bottom', darkDefault: '#330814', lightDefault: '#283581' },
            { key: 'navBarIcons', name: 'Nav Bar Icons', darkDefault: '#ffffff', lightDefault: '#ffffff' },
            { key: 'navBarText', name: 'Nav Bar Text', darkDefault: '#ffffff', lightDefault: '#ffffff' },
            { key: 'pageHeader', name: 'Page Headers', darkDefault: '#1b2025', lightDefault: '#706c6e' },
        ],
    },
    {
        label: 'CALLBACK / SELECTION',
        fields: [
            { key: 'selectedCallbackColor', name: 'Active Callback Row', darkDefault: '#26456e', lightDefault: '#c6e5f6' },
            { key: 'selectedCallbackHierarchyColor', name: 'Host Highlight', darkDefault: '#273e5d', lightDefault: '#deeff8' },
        ],
    },
    {
        label: 'TASKING CONTEXT',
        fields: [
            { key: 'taskPromptTextColor', name: 'Prompt Text', darkDefault: '#bebebe', lightDefault: '#a6a5a5' },
            { key: 'taskPromptCommandTextColor', name: 'Command Text', darkDefault: '#e4e4e4', lightDefault: '#000000' },
            { key: 'taskContextColor', name: 'Context Background', darkDefault: '#122848', lightDefault: '#acc0da' },
            { key: 'taskContextImpersonationColor', name: 'User Context BG', darkDefault: '#641616', lightDefault: '#dec0c0' },
            { key: 'taskContextExtraColor', name: 'Extra Info BG', darkDefault: '#2a5953', lightDefault: '#a7ce9d' },
        ],
    },
    {
        label: 'OUTPUT',
        fields: [
            { key: 'emptyFolderColor', name: 'Empty Folder Color', darkDefault: '#bebebe', lightDefault: '#a6a5a5' },
            { key: 'outputBackgroundColor', name: 'Output Background', darkDefault: '#282828', lightDefault: '#f6f6f6' },
            { key: 'outputTextColor', name: 'Output Text', darkDefault: '#f6f6f6', lightDefault: '#282828' },
        ],
    },
];

const ColorPickerRow = ({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) => (
    <div className="flex items-center gap-3 py-1">
        <div className="w-6 h-6 border border-white/20 shrink-0 cursor-pointer relative group" style={{ background: value }}>
            <input type="color" value={value} onChange={e => onChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        </div>
        <span className="text-xs text-gray-400 min-w-[160px]">{name}</span>
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
            className="w-24 bg-black/60 border border-white/15 text-gray-300 text-[10px] font-mono px-2 py-0.5 focus:outline-none focus:border-signal/40 rounded-sm" />
    </div>
);

const PaletteSection = () => {
    const prefs = useReactiveVar(mePreferences) as any;
    const [setSetting] = useSetMythicSetting() as any;
    const palette = prefs?.palette || {};
    const mode = 'dark'; // Minerva is always dark

    const getColor = (key: string, darkDefault: string) => {
        const field = palette[key];
        if (!field) return darkDefault;
        if (typeof field === 'string') return field;
        return field[mode] || darkDefault;
    };

    const setColor = (key: string, value: string) => {
        const newPalette = { ...palette };
        if (!newPalette[key]) newPalette[key] = { dark: value, light: value };
        else if (typeof newPalette[key] === 'string') newPalette[key] = { dark: value, light: value };
        else newPalette[key] = { ...newPalette[key], [mode]: value };
        setSetting({ setting_name: 'palette', value: newPalette });
    };

    const resetAll = () => {
        const newPalette: any = {};
        PALETTE_GROUPS.forEach(g => g.fields.forEach(f => {
            newPalette[f.key] = { dark: f.darkDefault, light: f.lightDefault };
        }));
        setSetting({ setting_name: 'palette', value: newPalette });
        snackActions.success('Palette reset to defaults');
    };

    // #10 — Reset dark-only or light-only palette
    const resetDark = () => {
        const newPalette = { ...palette };
        PALETTE_GROUPS.forEach(g => g.fields.forEach(f => {
            if (!newPalette[f.key]) newPalette[f.key] = { dark: f.darkDefault, light: f.lightDefault };
            else if (typeof newPalette[f.key] === 'string') newPalette[f.key] = { dark: f.darkDefault, light: newPalette[f.key] };
            else newPalette[f.key] = { ...newPalette[f.key], dark: f.darkDefault };
        }));
        setSetting({ setting_name: 'palette', value: newPalette });
        snackActions.success('Dark mode palette reset');
    };
    const resetLight = () => {
        const newPalette = { ...palette };
        PALETTE_GROUPS.forEach(g => g.fields.forEach(f => {
            if (!newPalette[f.key]) newPalette[f.key] = { dark: f.darkDefault, light: f.lightDefault };
            else if (typeof newPalette[f.key] === 'string') newPalette[f.key] = { dark: newPalette[f.key], light: f.lightDefault };
            else newPalette[f.key] = { ...newPalette[f.key], light: f.lightDefault };
        }));
        setSetting({ setting_name: 'palette', value: newPalette });
        snackActions.success('Light mode palette reset');
    };

    // #9 — Export color preferences only
    const exportColorPrefs = () => {
        const colorData: any = {};
        PALETTE_GROUPS.forEach(g => g.fields.forEach(f => {
            colorData[f.key] = palette[f.key] || { dark: f.darkDefault, light: f.lightDefault };
        }));
        if (palette.backgroundImage) colorData.backgroundImage = palette.backgroundImage;
        navigator.clipboard.writeText(JSON.stringify(colorData, null, 2));
        snackActions.success('Color preferences copied to clipboard');
    };

    const rawBgImg = palette.backgroundImage;
    const bgImageVal = typeof rawBgImg === 'string' ? rawBgImg : '';

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-2 pb-1">PALETTE / THEME CUSTOMIZATION</div>
                <div className="flex items-center gap-2">
                    {/* #9 — Export Color Preferences only */}
                    <button onClick={exportColorPrefs} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono text-gray-500 hover:text-signal border border-white/10 hover:border-signal/30 transition-colors"><Copy size={10} /> EXPORT COLORS</button>
                    {/* #10 — Reset Dark / Light separately */}
                    <button onClick={resetDark} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono text-gray-500 hover:text-orange-400 border border-white/10 hover:border-orange-500/30 transition-colors"><RotateCcw size={10} /> RESET DARK</button>
                    <button onClick={resetLight} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono text-gray-500 hover:text-orange-400 border border-white/10 hover:border-orange-500/30 transition-colors"><RotateCcw size={10} /> RESET LIGHT</button>
                    <button onClick={resetAll} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono text-gray-500 hover:text-red-400 border border-white/10 hover:border-red-500/30 transition-colors"><RotateCcw size={10} /> RESET ALL</button>
                </div>
            </div>
            <p className="text-xs text-gray-500">Customize all OldReactUI-compatible palette colors. Changes are saved per-operator and synced via Mythic settings.</p>
            
            {/* Background Image — with file upload + preview */}
            <div className="bg-black/40 border border-white/10 p-4 hover:border-white/20 transition-colors">
                <div className="flex items-center gap-4 mb-2">
                    <div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0"><Layout size={17} className="text-gray-400" /></div>
                    <div>
                        <div className="text-sm font-medium text-white">Background Image</div>
                        <div className="text-xs text-gray-500 mt-0.5">Upload an image file or paste a URL / base64 data URI</div>
                    </div>
                </div>
                <div className="flex gap-2 ml-13 items-center">
                    <input type="text" value={bgImageVal}
                        onChange={e => {
                            const newPalette = { ...palette, backgroundImage: e.target.value || null };
                            setSetting({ setting_name: 'palette', value: newPalette });
                        }}
                        className="flex-1 bg-black/60 border border-white/15 text-gray-300 text-xs font-mono px-2 py-1.5 focus:outline-none focus:border-signal/40 rounded-sm"
                        placeholder="https://... or data:image/..." />
                    <label className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono border border-signal/30 text-signal hover:bg-signal/10 cursor-pointer transition-colors rounded-sm shrink-0">
                        <Upload size={12} />
                        UPLOAD
                        <input type="file" accept="image/*" className="hidden" onChange={(ev) => {
                            const file = ev.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (e) => {
                                const result = e.target?.result as string;
                                const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
                                const mimeMap: Record<string, string> = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp', svg: 'svg+xml', bmp: 'bmp' };
                                const mime = mimeMap[ext] || ext;
                                const dataUri = `url("data:image/${mime};base64,${btoa(result)}")`;
                                const newPalette = { ...palette, backgroundImage: dataUri };
                                setSetting({ setting_name: 'palette', value: newPalette });
                            };
                            reader.readAsBinaryString(file);
                            ev.target.value = '';
                        }} />
                    </label>
                    {bgImageVal && (
                        <button onClick={() => {
                            const newPalette = { ...palette, backgroundImage: null };
                            setSetting({ setting_name: 'palette', value: newPalette });
                        }} className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-mono text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors rounded-sm shrink-0">
                            <Trash2 size={12} /> CLEAR
                        </button>
                    )}
                </div>
                {bgImageVal && (
                    <div className="mt-3 ml-13 w-60 h-36 border border-white/10 overflow-hidden bg-black/60">
                        <img
                            src={bgImageVal.startsWith('url(') ? bgImageVal.slice(5, -2) : bgImageVal}
                            alt="Background preview"
                            className="w-full h-full object-cover"
                            onError={e => (e.target as HTMLImageElement).style.display = 'none'}
                        />
                    </div>
                )}
            </div>

            {/* Color groups */}
            {PALETTE_GROUPS.map(group => (
                <div key={group.label} className="bg-black/40 border border-white/10 p-4 hover:border-white/20 transition-colors">
                    <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pb-2 mb-2 border-b border-white/5">{group.label}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0">
                        {group.fields.map(f => (
                            <ColorPickerRow
                                key={f.key}
                                name={f.name}
                                value={getColor(f.key, f.darkDefault)}
                                onChange={v => setColor(f.key, v)}
                            />
                        ))}
                    </div>
                </div>
            ))}

            {/* Live preview */}
            <div className="bg-black/40 border border-white/10 p-4">
                <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pb-2 mb-3 border-b border-white/5">LIVE PREVIEW</div>
                <div className="grid grid-cols-8 gap-2">
                    {PALETTE_GROUPS.flatMap(g => g.fields).map(f => (
                        <div key={f.key} className="flex flex-col items-center gap-1">
                            <div className="w-full aspect-square border border-white/10" style={{ background: getColor(f.key, f.darkDefault) }} />
                            <span className="text-[8px] font-mono text-gray-600 text-center leading-tight">{f.key}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* #15 — Community Themes link */}
            <div className="bg-black/40 border border-white/10 p-4 flex items-center gap-3">
                <span className="text-[11px] font-mono text-gray-400">Community themes are located on GitHub:</span>
                <a href="https://github.com/MythicMeta/CommunityThemes" target="_blank" rel="noreferrer"
                    className="text-[11px] font-mono text-signal hover:underline transition-colors flex items-center gap-1">
                    MythicMeta/CommunityThemes ↗
                </a>
            </div>
        </div>
    );
};

/* ─────────── Audio Settings ─────────── */
const ACCEPTED_AUDIO = '.mp3,.m4a,.ogg,.wav,.flac,.aac,.webm';

const SFX_PREVIEWS = [
    { label: 'CLICK',    fn: () => import('../lib/soundEffects').then(m => m.playClick()) },
    { label: 'CALLBACK', fn: () => import('../lib/soundEffects').then(m => m.playCallback()) },
    { label: 'LOADING',  fn: () => import('../lib/soundEffects').then(m => m.playEnter()) },
    { label: 'AUTHED',   fn: () => import('../lib/soundEffects').then(m => m.playAuthed()) },
    { label: 'TUNNEL',   fn: () => import('../lib/soundEffects').then(m => m.playTunnel()) },
];

const AudioSection = () => {
    const {
        musicEnabled, musicVolume, musicTrackId, musicLibrary, musicPlaying,
        sfxEnabled, sfxVolume,
        setMusicEnabled, setMusicVolume, setMusicTrackId, setMusicPlaying,
        addMusicLibraryEntry, removeMusicLibraryEntry,
        setSfxEnabled, setSfxVolume,
    } = useAppStore();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const currentTrackName = musicLibrary.find(t => t.id === musicTrackId)?.name ?? null;

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setUploading(true);
        try {
            const { saveTrack } = await import('../lib/musicDB');
            for (const file of Array.from(files)) {
                const id = `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const name = file.name.replace(/\.[^.]+$/, '');
                await saveTrack({ id, name, blob: file, mimeType: file.type });
                addMusicLibraryEntry({ id, name });
                // Auto-select first uploaded track if none selected
                if (!musicTrackId) {
                    setMusicTrackId(id);
                    if (musicEnabled) setMusicPlaying(true);
                }
            }
        } catch (err) {
            console.error('Failed to upload music:', err);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const { deleteTrack } = await import('../lib/musicDB');
            await deleteTrack(id);
            removeMusicLibraryEntry(id);
        } catch (err) {
            console.error('Failed to delete track:', err);
        }
    };

    return (
        <div className="space-y-3">

            {/* ─────────────── BACKGROUND MUSIC */}
            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-2 pb-1 border-b border-white/5">BACKGROUND MUSIC</div>

            {/* Enable + play/pause in one row */}
            <div className="bg-black/40 border border-white/10 p-4 flex items-center justify-between gap-4 hover:border-white/20 transition-colors">
                <div className="flex items-center gap-4">
                    <div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0">
                        {musicEnabled && musicPlaying && currentTrackName
                            ? <Music2 size={17} className="text-signal animate-pulse" />
                            : <Music2 size={17} className="text-gray-400" />}
                    </div>
                    <div>
                        <div className="text-sm font-medium text-white">Background Music</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                            {!musicEnabled
                                ? 'Disabled'
                                : !currentTrackName
                                    ? 'No track selected'
                                    : musicPlaying
                                        ? `▶ Playing — ${currentTrackName}`
                                        : `⏸ Paused — ${currentTrackName}`}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    {musicEnabled && currentTrackName && (
                        <button onClick={() => setMusicPlaying(!musicPlaying)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-signal/30 text-signal hover:bg-signal/10 transition-colors text-xs font-mono">
                            {musicPlaying ? <><Pause size={12}/>PAUSE</> : <><Play size={12}/>PLAY</>}
                        </button>
                    )}
                    <button onClick={() => setMusicEnabled(!musicEnabled)}
                        className={cn('relative w-11 h-5 rounded-sm transition-colors shrink-0', musicEnabled ? 'bg-signal/40' : 'bg-gray-700')}>
                        <div className={cn('absolute top-0.5 w-4 h-4 bg-white transition-all rounded-sm', musicEnabled ? 'left-6' : 'left-0.5')} />
                    </button>
                </div>
            </div>

            {/* Volume slider */}
            <SliderRow icon={Volume2} title="Music Volume" description="Background music playback volume"
                value={musicVolume} onChange={setMusicVolume}
                fmt={v => `${Math.round(v * 100)}%`} />

            {/* Upload + Track Library */}
            <div className="bg-black/40 border border-white/10 p-4 hover:border-white/20 transition-colors">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-4">
                        <div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0"><Disc3 size={17} className="text-gray-400" /></div>
                        <div>
                            <div className="text-sm font-medium text-white">Music Library</div>
                            <div className="text-xs text-gray-500 mt-0.5">Upload and manage background music tracks</div>
                        </div>
                    </div>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-signal/30 text-signal hover:bg-signal/10 transition-colors text-xs font-mono disabled:opacity-50">
                        <Upload size={12} />
                        {uploading ? 'UPLOADING...' : 'UPLOAD'}
                    </button>
                    <input ref={fileInputRef} type="file" accept={ACCEPTED_AUDIO} multiple
                        onChange={handleUpload} className="hidden" />
                </div>

                {musicLibrary.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-white/10">
                        <Music2 size={24} className="mx-auto text-gray-600 mb-2" />
                        <div className="text-xs text-gray-500 font-mono">NO TRACKS UPLOADED</div>
                        <div className="text-[10px] text-gray-600 mt-1">Click UPLOAD to add music files</div>
                    </div>
                ) : (
                    <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                        {musicLibrary.map(track => {
                            const active = musicTrackId === track.id;
                            return (
                                <div key={track.id}
                                    className={cn(
                                        'flex items-center justify-between px-3 py-2.5 border transition-colors group',
                                        active
                                            ? 'border-signal/60 bg-signal/10'
                                            : 'border-white/10 hover:border-white/20'
                                    )}>
                                    <button
                                        onClick={() => { setMusicTrackId(track.id); if (musicEnabled) setMusicPlaying(true); }}
                                        className="flex items-center gap-3 flex-1 min-w-0 text-left">
                                        {active && musicPlaying ? (
                                            <div className="flex gap-[3px] h-3 items-end shrink-0">
                                                {[1, 1.5, 0.8, 1.3].map((d, i) => (
                                                    <div key={i} className="w-[3px] rounded-sm bg-signal"
                                                        style={{ height: i % 2 === 0 ? '100%' : '60%',
                                                            animation: `pulse ${d}s ease-in-out infinite`, opacity: 0.8 }} />
                                                ))}
                                            </div>
                                        ) : (
                                            <Play size={12} className={active ? 'text-signal shrink-0' : 'text-gray-500 shrink-0'} />
                                        )}
                                        <span className={cn('font-mono text-xs truncate', active ? 'text-signal font-bold' : 'text-gray-400')}>
                                            {track.name}
                                        </span>
                                    </button>
                                    <button
                                        onClick={() => handleDelete(track.id)}
                                        className="p-1 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                                        title="Remove track">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ─────────────── SOUND EFFECTS */}
            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-4 pb-1 border-b border-white/5">SOUND EFFECTS (SFX)</div>

            <ToggleRow icon={Volume2} title="Sound Effects" description="UI click sounds, callback alerts, and other event sounds"
                value={sfxEnabled} onChange={setSfxEnabled} />

            <SliderRow icon={Volume2} title="SFX Volume" description="Master volume for all UI sound effects"
                value={sfxVolume} onChange={setSfxVolume}
                fmt={v => `${Math.round(v * 100)}%`} />

            {/* SFX preview */}
            <div className="bg-black/40 border border-white/10 p-4 hover:border-white/20 transition-colors">
                <div className="flex items-center gap-4 mb-3">
                    <div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0"><Play size={17} className="text-gray-400" /></div>
                    <div><div className="text-sm font-medium text-white">Preview Sounds</div><div className="text-xs text-gray-500 mt-0.5">Click to test each sound effect at current volume</div></div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {SFX_PREVIEWS.map(sfx => (
                        <button key={sfx.label}
                            disabled={!sfxEnabled}
                            onClick={() => sfx.fn()}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-1.5 border text-[11px] font-mono uppercase tracking-wider transition-colors',
                                sfxEnabled
                                    ? 'border-white/15 text-gray-400 hover:border-signal/40 hover:text-signal'
                                    : 'border-white/5 text-gray-700 cursor-not-allowed'
                            )}
                        >
                            <Play size={9} />{sfx.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

/* ─────────── Sidebar Shortcuts ─────────── */
const ALL_SIDEBAR_ITEMS = [
    { key: 'dashboard',       label: 'DASHBOARD',    primary: true },
    { key: 'events',          label: 'EVENTS',       primary: true },
    { key: 'callbacks',       label: 'CALLBACKS',    primary: true },
    { key: 'console',         label: 'CONSOLE',      primary: true },
    { key: 'task',            label: 'TASKS',        primary: true },
    { key: 'payloads',        label: 'PAYLOADS',     primary: true },
    { key: 'credentials',     label: 'CREDENTIALS',  primary: true },
    { key: 'files',           label: 'FILES',        primary: true },
    { key: 'c2-profiles',     label: 'C2 PROFILES',  primary: true },
    { key: 'tunnels',         label: 'TUNNELS',      primary: true },
    { key: 'quickhacks',      label: 'QUICKHACK',    primary: true },
    { key: 'users',           label: 'USERS',        primary: true },
    { key: 'search',          label: 'SEARCH',       primary: true },
    { key: 'settings',        label: 'SETTINGS',     primary: true },
    { key: 'opsec',           label: 'OPSEC',        primary: false },
    { key: 'operations',      label: 'OPERATIONS',   primary: false },
    { key: 'artifacts',       label: 'ARTIFACTS',    primary: false },
    { key: 'mitre',           label: 'MITRE',        primary: false },
    { key: 'reporting',       label: 'REPORTING',    primary: false },
    { key: 'tags',            label: 'TAGS',         primary: false },
    { key: 'browser-scripts', label: 'SCRIPTS',      primary: false },
    { key: 'eventing',        label: 'EVENTING',     primary: false },
    { key: 'payload-types',   label: 'PKG TYPES',    primary: false },
    { key: 'jupyter',         label: 'JUPYTER',      primary: false },
    { key: 'graphql',         label: 'GRAPHQL',      primary: false },
];
export const DEFAULT_SIDEBAR_SHORTCUTS = ALL_SIDEBAR_ITEMS.map(i => i.key);

const SidebarShortcutsSection = () => {
    const sideShortcuts = useGetMythicSetting({setting_name:'sideShortcuts', default_value: DEFAULT_SIDEBAR_SHORTCUTS});
    const [setSetting] = useSetMythicSetting() as any;
    const [items, setItems] = useState<string[]>(() => Array.isArray(sideShortcuts) ? sideShortcuts : DEFAULT_SIDEBAR_SHORTCUTS);
    useEffect(() => { if (Array.isArray(sideShortcuts)) setItems(sideShortcuts); }, [sideShortcuts]);

    const enabled = new Set(items);
    const toggle = (key: string) => {
        const next = enabled.has(key) ? items.filter(k=>k!==key) : [...items, key];
        setItems(next);
    };
    const moveUp = (idx: number) => {
        if (idx<=0) return;
        const n=[...items]; [n[idx-1],n[idx]]=[n[idx],n[idx-1]]; setItems(n);
    };
    const moveDown = (idx: number) => {
        if (idx>=items.length-1) return;
        const n=[...items]; [n[idx],n[idx+1]]=[n[idx+1],n[idx]]; setItems(n);
    };
    const save = () => { setSetting({setting_name:'sideShortcuts', value: items}); snackActions.success('Sidebar shortcuts updated'); };
    const reset = () => { setItems(DEFAULT_SIDEBAR_SHORTCUTS); };
    // disabled items not in the list
    const disabledItems = ALL_SIDEBAR_ITEMS.filter(i=>!enabled.has(i.key));

    return (
        <div className="space-y-4">
            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-2 pb-1 border-b border-white/5">
                SIDEBAR ITEM ORDER & VISIBILITY
            </div>
            <p className="text-xs text-gray-500">Drag items to reorder. Click to toggle visibility. Changes apply after saving.</p>

            {/* Enabled items – ordered */}
            <div className="space-y-1">
                {items.map((key, idx) => {
                    const def = ALL_SIDEBAR_ITEMS.find(i=>i.key===key);
                    if (!def) return null;
                    return (
                        <div key={key} className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 py-2 hover:border-white/20 transition-colors">
                            <GripVertical size={14} className="text-gray-600 shrink-0"/>
                            <span className="flex-1 text-xs font-mono text-white">{def.label}</span>
                            <span className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded',def.primary?'text-signal bg-signal/10':'text-purple-400 bg-purple-500/10')}>{def.primary?'PRIMARY':'SECONDARY'}</span>
                            <button onClick={()=>moveUp(idx)} className="p-0.5 text-gray-500 hover:text-white transition-colors disabled:opacity-20" disabled={idx===0}><ArrowUp size={12}/></button>
                            <button onClick={()=>moveDown(idx)} className="p-0.5 text-gray-500 hover:text-white transition-colors disabled:opacity-20" disabled={idx===items.length-1}><ArrowDown size={12}/></button>
                            <button onClick={()=>toggle(key)} className="p-0.5 text-red-400 hover:text-red-300 transition-colors"><X size={12}/></button>
                        </div>
                    );
                })}
            </div>

            {/* Disabled items */}
            {disabledItems.length > 0 && (
                <>
                    <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-2 pb-1 border-b border-white/5">HIDDEN ITEMS (click to re-add)</div>
                    <div className="flex flex-wrap gap-2">
                        {disabledItems.map(item => (
                            <button key={item.key} onClick={()=>toggle(item.key)} className="px-3 py-1.5 text-[11px] font-mono text-gray-500 border border-white/10 hover:border-signal/30 hover:text-signal transition-colors">
                                + {item.label}
                            </button>
                        ))}
                    </div>
                </>
            )}

            <div className="flex gap-2 pt-2">
                <button onClick={save} className="px-6 py-2 text-xs font-mono uppercase tracking-wider bg-signal text-black hover:bg-signal/80 transition-colors">SAVE</button>
                <button onClick={reset} className="flex items-center gap-2 px-4 py-2 text-xs font-mono text-gray-500 hover:text-orange-400 border border-white/10 hover:border-orange-500/30 transition-colors"><RotateCcw size={12}/>RESET</button>
            </div>
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