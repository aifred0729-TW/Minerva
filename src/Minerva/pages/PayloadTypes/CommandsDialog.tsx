import React, { useState } from 'react';
import { useQueryCompat } from '../../lib/useQueryCompat';
import { Send, BookOpen, Play, ShieldAlert } from 'lucide-react';
import { CyberModal } from '../../components/CyberModal';
import { GET_PAYLOAD_COMMANDS, GET_COMMAND_PARAMETERS } from '../../lib/api';
import { cn } from '../../lib/utils';

interface CommandRow {
    id: number;
    cmd: string;
    description: string;
    version: number;
    needs_admin: boolean;
    deleted: boolean;
}

interface CommandParameter {
    id: number;
    cli_name: string;
    name: string;
    display_name: string;
    description: string;
    type: string;
    default_value: string;
    required: boolean;
    choices: string[];
    choices_are_all_commands: boolean;
    choices_are_loaded_commands: boolean;
    dynamic_query_function: string;
    limit_credentials_by_type: string[];
    parameter_group_name: string;
    supported_agent_build_parameters: Record<string, unknown>;
    supported_agents: string[];
    ui_position: number;
    verifier_regex: string;
}

const Note = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[11px] text-gray-400 mt-1.5">
        <span className="text-amber-400 font-bold">Note: </span>{children}
    </p>
);

const CodeBlock = ({ children }: { children: React.ReactNode }) => (
    <pre className="text-[10px] font-mono text-cyan-300 bg-black/40 border border-white/5 p-2 mt-1.5 whitespace-pre-wrap break-all">
        {children}
    </pre>
);

const exampleAgentConnect = `{
    "host": "hostname where remote payload/callback is running",
    "agent_uuid": "payload uuid if trying to connect to payload",
    "c2_profile": {
        "name": "name of c2 profile",
        "parameters": { "parameter name": "parameter value" }
    },
    "callback_uuid": "callback uuid if trying to connect to callback"
}`;
const exampleCredentialJson = `{
    "account": "tywin.lannister@SEVENKINGDOMS.LOCAL",
    "comment": "",
    "credential": "doIFO<...snip...>FM",
    "realm": "SEVENKINGDOMS.LOCAL",
    "type": "ticket"
}`;
const exampleUploadFile = (cmd: string, param: string) => `newFileID = await mythic.register_file(
    mythic=mythic_instance, filename="test.txt", contents=b"this is a test"
)
status = await mythic.issue_task(
    mythic=mythic_instance,
    command_name="${cmd}",
    parameters={"${param}": newFileID},
    callback_display_id=1,
)`;

function ScriptingDialog({ commandId, commandName, onClose }: { commandId: number; commandName: string; onClose: () => void }) {
    const { data, loading, error } = useQueryCompat<any>(GET_COMMAND_PARAMETERS, {
        variables: { command_id: commandId },
        fetchPolicy: 'network-only',
    });
    const params: CommandParameter[] = data?.commandparameters ?? [];

    // Group params by parameter_group_name
    const groups = React.useMemo(() => {
        const map = new Map<string, CommandParameter[]>();
        for (const p of params) {
            const arr = map.get(p.parameter_group_name) || [];
            arr.push(p);
            map.set(p.parameter_group_name, arr);
        }
        for (const arr of map.values()) {
            arr.sort((a, b) => (a.ui_position ?? 0) - (b.ui_position ?? 0));
        }
        return Array.from(map.entries());
    }, [params]);

    return (
        <CyberModal title={`${commandName} · PARAMETERS`} icon={<Play />} onClose={onClose} maxWidth="max-w-5xl">
            <p className="text-xs text-gray-400 mb-3">
                Each <span className="text-signal">Parameter Group</span> is one way to issue this task. Required parameters must be supplied; the rest fall back to their default value.
            </p>
            {loading && <div className="text-center text-gray-400 font-mono py-8 animate-pulse">LOADING…</div>}
            {error && <div className="text-red-400 font-mono text-sm py-4">Error: {error.message}</div>}
            {!loading && groups.length === 0 && !error && (
                <div className="text-center text-gray-500 font-mono py-8">No parameters</div>
            )}
            <div className="space-y-4">
                {groups.map(([groupName, groupParams]) => (
                    <div key={groupName} className="border border-white/10">
                        <div className="bg-signal/10 border-b border-signal/20 px-3 py-1.5">
                            <span className="font-mono text-[11px] uppercase tracking-widest text-signal">Parameter Group: {groupName || '(default)'}</span>
                        </div>
                        <div className="divide-y divide-white/5">
                            {groupParams.map(p => (
                                <div key={p.id} className="grid grid-cols-12 gap-3 px-3 py-2.5 text-xs">
                                    <div className="col-span-4">
                                        <p className="font-mono text-sm text-white font-bold break-all">{p.cli_name || p.name}</p>
                                        {p.description && <p className="text-[11px] text-gray-400 mt-1">{p.description}</p>}
                                        {p.required && <span className="inline-block mt-1 text-[9px] font-mono text-amber-400 border border-amber-400/40 px-1.5 py-0.5">REQUIRED</span>}
                                    </div>
                                    <div className="col-span-8 space-y-1 text-[11px]">
                                        <div className="flex gap-2"><span className="text-gray-500 shrink-0">Type:</span><span className="text-cyan-300 font-mono">{p.type}</span></div>
                                        {p.default_value !== undefined && p.default_value !== '' && (
                                            <div className="flex gap-2"><span className="text-gray-500 shrink-0">Default:</span><pre className="text-gray-300 font-mono whitespace-pre-wrap break-all m-0">{String(p.default_value)}</pre></div>
                                        )}
                                        {p.verifier_regex && (
                                            <div className="flex gap-2"><span className="text-gray-500 shrink-0">Regex:</span><code className="text-purple-300 font-mono">{p.verifier_regex}</code></div>
                                        )}
                                        {p.choices?.length > 0 && (
                                            <div className="flex gap-2"><span className="text-gray-500 shrink-0">Choices:</span><span className="text-gray-300 font-mono">{p.choices.join(', ')}</span></div>
                                        )}
                                        {p.choices_are_all_commands && <Note>Provide any command name.</Note>}
                                        {p.choices_are_loaded_commands && <Note>Provide any currently loaded command name.</Note>}
                                        {p.dynamic_query_function && (
                                            <Note>Dynamically resolved at runtime via <code className="text-cyan-300">{p.dynamic_query_function}</code>.</Note>
                                        )}
                                        {p.type === 'File' && (
                                            <Note>Expects an AgentFileID (UUID). Upload via <code className="text-cyan-300">mythic.register_file</code>:<CodeBlock>{exampleUploadFile(commandName, p.cli_name || p.name)}</CodeBlock></Note>
                                        )}
                                        {p.type === 'TypedArray' && (
                                            <Note>Array of [type, value] tuples. Example:<CodeBlock>{`[ ["${p.choices?.[0] ?? 'type'}", "test"], ["${p.choices?.[0] ?? 'type'}", "values"] ]`}</CodeBlock></Note>
                                        )}
                                        {(p.type === 'AgentConnect' || p.type === 'LinkInfo') && (
                                            <Note>Selects a payload/callback for P2P linking.<CodeBlock>{exampleAgentConnect}</CodeBlock></Note>
                                        )}
                                        {p.type === 'PayloadList' && (
                                            <>
                                                <Note>Returns the selected payload's UUID.</Note>
                                                {p.supported_agents?.length > 0 && (
                                                    <p className="text-[11px] text-gray-400">Limited to: <span className="text-cyan-300 font-mono">{p.supported_agents.join(', ')}</span></p>
                                                )}
                                                {p.supported_agent_build_parameters && Object.keys(p.supported_agent_build_parameters).length > 0 && (
                                                    <p className="text-[11px] text-gray-400">Required build params: <code className="text-cyan-300 font-mono">{JSON.stringify(p.supported_agent_build_parameters)}</code></p>
                                                )}
                                            </>
                                        )}
                                        {p.type === 'CredentialJson' && (
                                            <>
                                                <Note>Selects a credential from Mythic's store. Value is the full JSON:<CodeBlock>{exampleCredentialJson}</CodeBlock></Note>
                                                {p.limit_credentials_by_type?.length > 0 && (
                                                    <p className="text-[11px] text-gray-400">Limited to types: <span className="text-cyan-300 font-mono">{p.limit_credentials_by_type.join(', ')}</span></p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </CyberModal>
    );
}

export function CommandsDialog({ payloadName, isWrapper, onClose }: { payloadName: string; isWrapper: boolean; onClose: () => void }) {
    const { data, loading, error } = useQueryCompat<any>(GET_PAYLOAD_COMMANDS, {
        variables: { payload_name: payloadName },
        fetchPolicy: 'network-only',
    });
    const commands: CommandRow[] = React.useMemo(() => {
        const all: CommandRow[] = data?.command ?? [];
        return [...all].sort((a, b) => (a.deleted === b.deleted ? a.cmd.localeCompare(b.cmd) : a.deleted ? 1 : -1));
    }, [data]);

    const [scripting, setScripting] = useState<{ id: number; cmd: string } | null>(null);
    const docsBase = isWrapper ? '/docs/wrappers/' : '/docs/agents/';

    return (
        <>
            <CyberModal title={`${payloadName} · COMMANDS`} icon={<Send />} onClose={onClose} maxWidth="max-w-5xl">
                {loading && <div className="text-center text-gray-400 font-mono py-8 animate-pulse">LOADING…</div>}
                {error && <div className="text-red-400 font-mono text-sm py-4">Error: {error.message}</div>}
                {!loading && commands.length === 0 && !error && (
                    <div className="text-center text-gray-500 font-mono py-8">No commands</div>
                )}
                <div className="border border-white/10">
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-black/40 border-b border-white/10 text-[10px] font-mono uppercase tracking-widest text-gray-500">
                        <div className="col-span-3">Command</div>
                        <div className="col-span-1">Ver</div>
                        <div className="col-span-1">Docs</div>
                        <div className="col-span-1">Script</div>
                        <div className="col-span-6">Description</div>
                    </div>
                    <div className="divide-y divide-white/5 max-h-[60vh] overflow-y-auto cyber-scrollbar">
                        {commands.map(c => (
                            <div key={c.id} className={cn(
                                "grid grid-cols-12 gap-2 px-3 py-2 items-center text-xs hover:bg-white/5",
                                c.deleted && "opacity-40"
                            )}>
                                <div className="col-span-3">
                                    <span className={cn("font-mono text-sm font-bold", c.deleted ? "line-through text-gray-500" : "text-white")}>{c.cmd}</span>
                                    {c.needs_admin && (
                                        <p className="flex items-center gap-1 mt-0.5 text-[10px] text-red-400 font-mono">
                                            <ShieldAlert size={10} /> Needs Admin
                                        </p>
                                    )}
                                </div>
                                <div className="col-span-1 font-mono text-cyan-300 text-[11px]">v{c.version}</div>
                                <div className="col-span-1">
                                    <a
                                        href={`${docsBase}${payloadName}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Documentation"
                                        className="inline-flex items-center justify-center w-7 h-7 text-gray-400 hover:text-signal hover:bg-signal/10 transition-colors"
                                    >
                                        <BookOpen size={12} />
                                    </a>
                                </div>
                                <div className="col-span-1">
                                    <button
                                        onClick={() => setScripting({ id: c.id, cmd: c.cmd })}
                                        title="Scripting parameters"
                                        className="inline-flex items-center justify-center w-7 h-7 text-gray-400 hover:text-signal hover:bg-signal/10 transition-colors"
                                    >
                                        <Play size={12} />
                                    </button>
                                </div>
                                <div className="col-span-6 text-gray-400">{c.description}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </CyberModal>
            {scripting && (
                <ScriptingDialog
                    commandId={scripting.id}
                    commandName={scripting.cmd}
                    onClose={() => setScripting(null)}
                />
            )}
        </>
    );
}
