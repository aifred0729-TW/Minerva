import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Terminal, ArrowLeft, Send, Shield, Activity, Lock, Disc } from 'lucide-react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, gql } from '@apollo/client';

// -----------------------------------------------------------------------------
// API QUERIES (Console Specific)
// -----------------------------------------------------------------------------

const GET_CALLBACK_DETAILS = gql`
  query GetCallbackDetails($display_id: Int!) {
    callback(where: {display_id: {_eq: $display_id}}) {
      id
      display_id
      user
      host
      ip
      pid
      os
      architecture
      integrity_level
      last_checkin
      description
      payload {
        payloadtype {
          name
        }
      }
    }
  }
`;

const GET_TASKING = gql`
  query GetTasking($callback_id: Int!, $limit: Int = 50) {
    task(where: {callback_id: {_eq: $callback_id}}, order_by: {id: desc}, limit: $limit) {
      id
      display_id
      command_name
      params
      status
      timestamp
      response_count
      operator {
        username
      }
      responses(order_by: {id: asc}) {
        response: response_text
        timestamp
      }
    }
  }
`;

const CREATE_TASK = gql`
  mutation CreateTask($callback_id: Int, $command: String!, $params: String!) {
    createTask(callback_id: $callback_id, command: $command, params: $params) {
      status
      id
      error
    }
  }
`;

// -----------------------------------------------------------------------------
// COMPONENTS
// -----------------------------------------------------------------------------

export default function Console() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [commandInput, setCommandInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Get Callback Metadata
  const { data: callbackData } = useQuery(GET_CALLBACK_DETAILS, {
    variables: { display_id: parseInt(id || '0') },
    pollInterval: 10000
  });

  const callback = callbackData?.callback[0];

  // 2. Get Tasking History
  const { data: taskData, refetch: refetchTasks } = useQuery(GET_TASKING, {
    variables: { callback_id: callback?.id || 0 },
    skip: !callback?.id,
    pollInterval: 2000
  });

  // 3. Create Task Mutation
  const [createTask] = useMutation(CREATE_TASK, {
      onCompleted: (data) => {
          setIsSending(false);
          if (data.createTask.status === "success") {
              setCommandInput('');
              refetchTasks();
          } else {
              console.error("Task creation failed:", data.createTask.error);
              // Ideally show a toast/snackbar here
          }
      },
      onError: (error) => {
          setIsSending(false);
          console.error("Mutation error:", error);
      }
  });

  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim() || !callback?.id || isSending) return;

    setIsSending(true);
    
    // Simple command parsing: "cmd params..."
    const parts = commandInput.trim().split(' ');
    const command = parts[0];
    const params = parts.slice(1).join(' ');

    createTask({
        variables: {
            callback_id: callback.display_id, // Mythic typically uses display_id for tasking from UI
            command: command,
            params: params
        }
    });
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [taskData, callback]);

  if (!callback && !callbackData) return (
      <div className="min-h-screen bg-void flex items-center justify-center text-gray-400 font-mono">
          <div className="flex flex-col items-center gap-4">
            <Disc className="animate-spin text-signal" size={32} />
            <span>ESTABLISHING_UPLINK...</span>
          </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-void text-signal font-mono flex flex-col overflow-hidden">
      
      {/* HEADER: Callback Info */}
      <header className="border-b border-ghost/30 p-4 bg-void/90 backdrop-blur-sm z-10 flex items-center justify-between">
        <div className="flex items-center gap-4">
            <button onClick={() => navigate('/callbacks')} className="text-gray-400 hover:text-signal transition-colors">
                <ArrowLeft size={20} />
            </button>
            
            <div className="flex flex-col">
                <div className="flex items-center gap-2">
                    <Terminal size={16} className="text-signal" />
                    <span className="font-bold tracking-widest text-lg">CALLBACK #{callback?.display_id}</span>
                    <span className="text-xs px-2 py-0.5 border border-ghost/50 rounded text-gray-400 uppercase">
                        {callback?.payload?.payloadtype?.name || "UNKNOWN"}
                    </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                    <span>{callback?.user}@{callback?.host}</span>
                    <span>|</span>
                    <span>PID: {callback?.pid}</span>
                    <span>|</span>
                    <span className={callback?.integrity_level > 2 ? "text-yellow-500" : ""}>
                        INTEGRITY: {callback?.integrity_level}
                    </span>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2 text-green-500">
                <Activity size={14} className="animate-pulse" />
                <span>ONLINE</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
                <Lock size={14} />
                <span>EKE-DIFFIE-HELLMAN</span>
            </div>
        </div>
      </header>

      {/* MAIN: Console Output */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar" ref={scrollRef}>
          {/* Welcome Message */}
          <div className="text-gray-400 text-xs mb-8 opacity-50">
              <p>MINERVA C2 CONSOLE v1.0.0</p>
              <p>SECURE CONNECTION ESTABLISHED TO {callback?.ip}</p>
              <p>WAITING FOR INPUT...</p>
              <p className="border-b border-dashed border-ghost/30 w-full my-2"></p>
          </div>

          {/* Task History */}
          {[...(taskData?.task || [])].reverse().map((task: any) => (
              <div key={task.id} className="space-y-2 group">
                  {/* Command Line */}
                  <div className="flex gap-2 text-sm">
                      <span className="text-green-500 font-bold">root@minerva:~$</span>
                      <span className="text-signal">{task.command_name} {task.params}</span>
                      <span className="text-gray-400 text-xs ml-auto opacity-0 group-hover:opacity-50 transition-opacity">
                          {new Date(task.timestamp).toLocaleTimeString()} by {task.operator?.username}
                      </span>
                  </div>

                  {/* Output */}
                  <div className="pl-4 border-l-2 border-ghost/20 ml-1 text-xs text-signal/80 whitespace-pre-wrap font-mono">
                      {task.responses?.map((r: any, i: number) => (
                          <div key={i}>{r.response}</div>
                      ))}
                      {task.status === "processing" && (
                          <div className="animate-pulse text-yellow-500">{'>'}{'>'} Processing...</div>
                      )}
                      {(!task.responses || task.responses.length === 0) && task.status !== "processing" && (
                          <div className="text-gray-400 italic">No output</div>
                      )}
                  </div>
              </div>
          ))}
      </div>

      {/* FOOTER: Input Area */}
      <div className="p-4 bg-void border-t border-ghost/30">
          <form onSubmit={handleSendCommand} className="relative flex items-center group">
              <span className="absolute left-4 text-green-500 font-bold select-none">{'>'}</span>
              <input 
                type="text" 
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                className="w-full bg-ghost/5 border border-ghost/30 rounded-none py-3 pl-8 pr-12 text-signal focus:outline-none focus:border-signal transition-colors font-mono"
                placeholder="Enter command..."
                autoFocus
                disabled={isSending}
              />
              <button 
                type="submit"
                disabled={!commandInput.trim() || isSending}
                className="absolute right-2 p-1.5 text-gray-400 hover:text-signal disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
              >
                  <Send size={18} />
              </button>
          </form>
      </div>
    </div>
  );
}
