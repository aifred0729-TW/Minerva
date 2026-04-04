import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';

export const ToggleRow = ({icon:Icon,title,description,value,onChange}:{icon:React.ComponentType<any>;title:string;description:string;value:boolean;onChange:(v:boolean)=>void}) => (
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

export const SelectRow = ({icon:Icon,title,description,value,onChange,options}:{icon:React.ComponentType<any>;title:string;description:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[]}) => (
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

export const NumberRow = ({icon:Icon,title,description,value,onChange,min=0}:{icon:React.ComponentType<any>;title:string;description:string;value:number;onChange:(v:number)=>void;min?:number}) => {
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

export const SliderRow = ({icon:Icon,title,description,value,onChange,min=0,max=1,step=0.01,fmt}:{icon:React.ComponentType<any>;title:string;description:string;value:number;onChange:(v:number)=>void;min?:number;max?:number;step?:number;fmt?:(v:number)=>string}) => (
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

export const TextRow = ({icon:Icon,title,description,value,onChange,placeholder}:{icon:React.ComponentType<any>;title:string;description:string;value:string;onChange:(v:string)=>void;placeholder?:string}) => (
    <div className="bg-black/40 border border-white/10 p-4 flex items-center justify-between gap-4 hover:border-white/20 transition-colors">
        <div className="flex items-center gap-4">
            <div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0"><Icon size={17} className="text-gray-400" /></div>
            <div><div className="text-sm font-medium text-white">{title}</div><div className="text-xs text-gray-500 mt-0.5">{description}</div></div>
        </div>
        <input type="text" value={value} onChange={e=>onChange(e.target.value)} className="w-64 bg-black/60 border border-white/15 text-gray-300 text-sm font-mono px-3 py-1.5 focus:outline-none focus:border-signal/40 transition-colors rounded-sm" placeholder={placeholder}/>
    </div>
);

export const MultiSelectRow = ({icon:Icon,title,description,value,onChange,options}:{icon:React.ComponentType<any>;title:string;description:string;value:string[];onChange:(v:string[])=>void;options:string[]}) => (
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
