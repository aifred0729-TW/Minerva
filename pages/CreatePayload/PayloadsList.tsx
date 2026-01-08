import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useLazyQuery } from '@apollo/client';
import { createPortal } from 'react-dom';
import { 
    GET_PAYLOADS_LIST, 
    PAYLOAD_SUBSCRIPTION,
    REBUILD_PAYLOAD_MUTATION, 
    TOGGLE_PAYLOAD_DELETE_MUTATION, 
    UPDATE_FILENAME_MUTATION, 
    EXPORT_PAYLOAD_CONFIG,
    UPDATE_PAYLOAD_DESCRIPTION,
    UPDATE_PAYLOAD_ALERTS,
    UPDATE_PAYLOAD_ALLOWED,
    GENERATE_REDIRECT_RULES,
    CHECK_PAYLOAD_CONFIGURATION,
    GENERATE_IOC,
    GENERATE_SAMPLE_MESSAGE
} from './queries';
import { CyberTable } from '../../components/CyberTable';
import { useNavigate } from 'react-router-dom';
import { 
    Download, Disc, PlusCircle, Box, AlertTriangle, FileText, MoreVertical, 
    RefreshCw, Trash2, Edit, Code, FileJson, RotateCcw, X, Save, 
    Info, Eye, EyeOff, MessageSquare, ShieldAlert, PhoneMissed, 
    Verified, Fingerprint, Activity, Phone, Clock, Link
} from 'lucide-react';
import { cn, b64DecodeUnicode } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { PayloadDetailsModal } from '../../components/PayloadDetailsModal';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-text';
import 'ace-builds/src-noconflict/theme-monokai';
import { snackActions } from '../../../components/utilities/Snackbar';

// Modal Component
const RenameModal = ({ payload, isOpen, onClose, onRename }: { payload: any, isOpen: boolean, onClose: () => void, onRename: (id: number, newName: string) => void }) => {
    const [filename, setFilename] = useState("");

    useEffect(() => {
        if (payload) {
            setFilename(payload.filemetum?.filename_text ? b64DecodeUnicode(payload.filemetum.filename_text) : "");
        }
    }, [payload]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onRename(payload.filemetum.id, filename); 
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-void border border-signal p-6 rounded-lg w-full max-w-md shadow-[0_0_30px_rgba(34,197,94,0.2)]"
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-signal flex items-center gap-2">
                                <Edit size={20} /> RENAME PAYLOAD
                            </h3>
                            <button onClick={onClose} className="text-gray-400 hover:text-signal"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="mb-4">
                                <label className="block text-xs font-mono text-gray-400 mb-1">NEW FILENAME</label>
                                <input 
                                    type="text" 
                                    value={filename}
                                    onChange={(e) => setFilename(e.target.value)}
                                    className="w-full bg-black/30 border border-gray-700 p-2 text-signal font-mono focus:border-signal outline-none"
                                    autoFocus
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-mono text-gray-400 hover:text-white border border-transparent hover:border-gray-600">CANCEL</button>
                                <button type="submit" className="px-4 py-2 bg-signal/20 border border-signal text-signal hover:bg-signal/30 text-xs font-bold font-mono flex items-center gap-2">
                                    <Save size={14} /> SAVE
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

const EditDescriptionModal = ({ payload, isOpen, onClose, onSave }: { payload: any, isOpen: boolean, onClose: () => void, onSave: (uuid: string, description: string) => void }) => {
    const [description, setDescription] = useState("");

    useEffect(() => {
        if (payload) {
            setDescription(payload.description || "");
        }
    }, [payload]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(payload.uuid, description);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-void border border-signal p-6 rounded-lg w-full max-w-md shadow-[0_0_30px_rgba(34,197,94,0.2)]"
                    >
                         <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-signal flex items-center gap-2">
                                <FileText size={20} /> EDIT DESCRIPTION
                            </h3>
                            <button onClick={onClose} className="text-gray-400 hover:text-signal"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="mb-4">
                                <label className="block text-xs font-mono text-gray-400 mb-1">DESCRIPTION</label>
                                <textarea 
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full bg-black/30 border border-gray-700 p-2 text-signal font-mono focus:border-signal outline-none h-32 resize-none"
                                    autoFocus
                                />
                            </div>
                             <div className="flex justify-end gap-2">
                                <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-mono text-gray-400 hover:text-white border border-transparent hover:border-gray-600">CANCEL</button>
                                <button type="submit" className="px-4 py-2 bg-signal/20 border border-signal text-signal hover:bg-signal/30 text-xs font-bold font-mono flex items-center gap-2">
                                    <Save size={14} /> SAVE
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

const TextInfoModal = ({ title, content, isOpen, onClose, isLoading }: { title: string, content: string, isOpen: boolean, onClose: () => void, isLoading: boolean }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-void border border-signal p-0 rounded-lg w-full max-w-4xl shadow-[0_0_30px_rgba(34,197,94,0.2)] h-[80vh] flex flex-col"
                    >
                         <div className="flex justify-between items-center p-4 border-b border-gray-800">
                            <h3 className="text-xl font-bold text-signal flex items-center gap-2 uppercase">
                                <Info size={20} /> {title}
                            </h3>
                            <button onClick={onClose} className="text-gray-400 hover:text-signal"><X size={20} /></button>
                        </div>
                        <div className="flex-1 relative bg-black/50">
                            {isLoading ? (
                                <div className="absolute inset-0 flex items-center justify-center text-signal gap-2">
                                    <RefreshCw className="animate-spin" /> PROCESSING...
                                </div>
                            ) : (
                                <AceEditor
                                    mode="text"
                                    theme="monokai"
                                    width="100%"
                                    height="100%"
                                    value={content}
                                    readOnly={true}
                                    fontSize={14}
                                    showPrintMargin={false}
                                    setOptions={{ useWorker: false, showLineNumbers: false }}
                                />
                            )}
                        </div>
                        <div className="p-4 border-t border-gray-800 flex justify-end">
                             <button onClick={onClose} className="px-4 py-2 bg-white/5 border border-gray-700 text-gray-300 hover:bg-white/10 text-xs font-mono uppercase">CLOSE</button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}


export function PayloadsList() {
  const navigate = useNavigate();
  const [selectedPayload, setSelectedPayload] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState("overview");
  
  const [renameTarget, setRenameTarget] = useState<any>(null);
  const [descriptionTarget, setDescriptionTarget] = useState<any>(null);
  
  // Generic Info Modal State
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [infoModalTitle, setInfoModalTitle] = useState("");
  const [infoModalContent, setInfoModalContent] = useState("");
  const [infoModalLoading, setInfoModalLoading] = useState(false);

  const [pageData, setPageData] = React.useState({
    totalCount: 0,
    fetchLimit: 20,
    showDeleted: false,
    showAutogenerated: false,
  });

  // Queries & Mutations
  const { data, loading, error, refetch, subscribeToMore } = useQuery(GET_PAYLOADS_LIST, {
    variables: { offset: 0, limit: pageData.fetchLimit, showDeleted: pageData.showDeleted, showAutogenerated: pageData.showAutogenerated },
    fetchPolicy: "network-only"
  });

  // Subscription for real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToMore({
      document: PAYLOAD_SUBSCRIPTION,
      variables: { now: new Date().toISOString() },
      updateQuery: (prev, { subscriptionData }) => {
        if (!subscriptionData.data) return prev;
        const newPayloads = subscriptionData.data.payload_stream;
        
        // Merge logic: Replace existing payloads if found, prepend if new
        const existingPayloads = prev.payload || [];
        let mergedPayloads = [...existingPayloads];
        
        newPayloads.forEach((newP: any) => {
            // Check visibility based on current filters
            // Note: pageData might be stale in closure if not in dependency array, 
            // but we added it to dependencies.
            const isDeletedMatch = newP.deleted === pageData.showDeleted;
            const isAutoMatch = newP.auto_generated === pageData.showAutogenerated;
            const shouldBeVisible = isDeletedMatch && isAutoMatch;

            const index = mergedPayloads.findIndex(p => p.id === newP.id);
            
            if (index > -1) {
                if (shouldBeVisible) {
                    mergedPayloads[index] = newP;
                } else {
                    // Remove it (e.g. it was deleted and we are not showing deleted)
                    mergedPayloads.splice(index, 1);
                }
            } else {
                if (shouldBeVisible) {
                    mergedPayloads.unshift(newP);
                }
            }
        });

        // Ensure sorted by ID desc
        mergedPayloads.sort((a: any, b: any) => b.id - a.id);

        return {
            ...prev,
            payload: mergedPayloads,
            payload_aggregate: {
                ...prev.payload_aggregate,
                aggregate: {
                    ...prev.payload_aggregate.aggregate,
                    count: mergedPayloads.length // Approximate count update
                }
            }
        };
      }
    });
    return () => unsubscribe();
  }, [subscribeToMore, pageData.showDeleted, pageData.showAutogenerated]);

  const [triggerRebuild] = useMutation(REBUILD_PAYLOAD_MUTATION, {
      onCompleted: (data) => {
          if (data.rebuild_payload.status === "success") {
              // refetch(); // Subscription handles update
          }
      }
  });

  const [toggleDelete] = useMutation(TOGGLE_PAYLOAD_DELETE_MUTATION, {
      onCompleted: () => { /* Subscription handles update */ }
  });

  const [updateFilename] = useMutation(UPDATE_FILENAME_MUTATION, {
      onCompleted: () => { /* Subscription handles update */ }
  });
  
  const [updateDescription] = useMutation(UPDATE_PAYLOAD_DESCRIPTION, {
      onCompleted: () => { /* Subscription handles update */ }
  });

  const [updateAlerts] = useMutation(UPDATE_PAYLOAD_ALERTS); 
  const [updateAllowed] = useMutation(UPDATE_PAYLOAD_ALLOWED);

  // Lazy Queries for "Generate" actions
  const [exportConfig] = useLazyQuery(EXPORT_PAYLOAD_CONFIG, {
      onCompleted: (data) => {
        if(data.exportPayloadConfig.status === "success"){
            try {
                const dataBlob = new Blob([data.exportPayloadConfig.config], {type: 'application/json'});
                const url = window.URL.createObjectURL(dataBlob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'payload_config.json');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (e) {
                console.error("Download failed", e);
            }
        }
      }
  });

  const [generateRedirectRules] = useLazyQuery(GENERATE_REDIRECT_RULES, {
      fetchPolicy: "network-only",
      onCompleted: (data) => {
          setInfoModalLoading(false);
          setInfoModalContent(data.redirect_rules?.output || data.redirect_rules?.error || "No output");
      },
      onError: (err) => {
          setInfoModalLoading(false);
          setInfoModalContent(`Error: ${err.message}`);
      }
  });

  const [checkConfig] = useLazyQuery(CHECK_PAYLOAD_CONFIGURATION, {
      fetchPolicy: "network-only",
      onCompleted: (data) => {
          setInfoModalLoading(false);
          setInfoModalContent(data.config_check?.output || data.config_check?.error || "No output");
      },
      onError: (err) => {
          setInfoModalLoading(false);
          setInfoModalContent(`Error: ${err.message}`);
      }
  });

  const [generateIOC] = useLazyQuery(GENERATE_IOC, {
      fetchPolicy: "network-only",
      onCompleted: (data) => {
          setInfoModalLoading(false);
          setInfoModalContent(data.c2GetIOC?.output || data.c2GetIOC?.error || "No output");
      },
      onError: (err) => {
          setInfoModalLoading(false);
          setInfoModalContent(`Error: ${err.message}`);
      }
  });

  const [generateSample] = useLazyQuery(GENERATE_SAMPLE_MESSAGE, {
      fetchPolicy: "network-only",
      onCompleted: (data) => {
          setInfoModalLoading(false);
          setInfoModalContent(data.c2SampleMessage?.output || data.c2SampleMessage?.error || "No output");
      },
      onError: (err) => {
          setInfoModalLoading(false);
          setInfoModalContent(`Error: ${err.message}`);
      }
  });


  const payloads = useMemo(() => data?.payload || [], [data]);
  
  // Keep selectedPayload in sync with updated data
  const activePayload = useMemo(() => {
      if (!selectedPayload) return null;
      return payloads.find((p: any) => p.id === selectedPayload.id) || selectedPayload;
  }, [payloads, selectedPayload]);

  const handleRowClick = (payload: any) => {
    setSelectedPayload(payload);
    setSelectedTab("overview");
  };

  const handleGeneratePayload = () => {
    navigate('/payloads/new');
  };

  // Action Handlers
  const handleRebuild = (uuid: string) => {
      triggerRebuild({ variables: { uuid } });
  };

  const handleDelete = (uuid: string, deleted: boolean) => {
      // Optimistically remove from UI immediately
      toggleDelete({ 
          variables: { payload_uuid: uuid, deleted: true },
          update: (cache, { data }) => {
              if (data?.updatePayload?.status === 'success') {
                  const queryVars = { 
                      offset: 0, 
                      limit: pageData.fetchLimit, 
                      showDeleted: pageData.showDeleted, 
                      showAutogenerated: pageData.showAutogenerated 
                  };
                  
                  try {
                      const existingData: any = cache.readQuery({
                          query: GET_PAYLOADS_LIST,
                          variables: queryVars
                      });
                      
                      if (existingData && existingData.payload) {
                          const newPayloads = existingData.payload.filter((p: any) => p.uuid !== uuid);
                          cache.writeQuery({
                              query: GET_PAYLOADS_LIST,
                              variables: queryVars,
                              data: {
                                  ...existingData,
                                  payload: newPayloads,
                                  payload_aggregate: {
                                      ...existingData.payload_aggregate,
                                      aggregate: {
                                          ...existingData.payload_aggregate.aggregate,
                                          count: newPayloads.length
                                      }
                                  }
                              }
                          });
                      }
                  } catch (e) {
                      console.error("Error updating cache for delete", e);
                  }
              }
          }
      });
  };

  const handleExportConfig = (uuid: string) => {
      exportConfig({ variables: { uuid } });
  };

  const handleRename = (fileId: number, newName: string) => {
      updateFilename({ variables: { file_id: fileId, filename: newName } });
  };
  
  const handleDescriptionSave = (uuid: string, description: string) => {
      updateDescription({ variables: { payload_uuid: uuid, description } });
  }

  const handleToggleAlert = (uuid: string, current: boolean) => {
      updateAlerts({ variables: { payload_uuid: uuid, callback_alert: !current } });
  }

  const handleToggleAllowed = (uuid: string, current: boolean) => {
      updateAllowed({ variables: { payload_uuid: uuid, callback_allowed: !current } });
  }
  
  // Generic Info Modal Handlers
  const openInfoModal = (title: string, action: () => void) => {
      setInfoModalTitle(title);
      setInfoModalContent("");
      setInfoModalLoading(true);
      setInfoModalOpen(true);
      action();
  }

  // Dropdown Menu Component for Actions
  const ActionsMenu = ({ row }: { row: any }) => {
      const [isOpen, setIsOpen] = useState(false);
      const buttonRef = useRef<HTMLButtonElement>(null);
      const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

      const toggleMenu = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (!isOpen && buttonRef.current) {
              const rect = buttonRef.current.getBoundingClientRect();
              setMenuPos({
                  top: rect.bottom + window.scrollY + 5,
                  left: rect.right + window.scrollX - 250 // Align right, adjust width
              });
          }
          setIsOpen(!isOpen);
      };

      const copyDownloadLink = () => {
          if (row.filemetum?.agent_file_id) {
              const link = `${window.location.origin}/api/v1.4/files/download/${row.filemetum.agent_file_id}`;
              navigator.clipboard.writeText(link).then(() => {
                  snackActions.success("Download link copied to clipboard");
              }).catch(err => {
                  snackActions.error("Failed to copy link: " + err);
              });
          }
      };
      
      return (
          <div className="relative">
              <button 
                  ref={buttonRef}
                  onClick={toggleMenu}
                  className="p-1 text-gray-400 hover:text-signal transition-colors"
              >
                  <MoreVertical size={16} />
              </button>
              
              {isOpen && createPortal(
                  <>
                    <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} />
                    <AnimatePresence>
                          <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -10 }}
                              transition={{ duration: 0.1 }}
                              className="fixed z-[9999] w-64 bg-void border border-signal/50 shadow-[0_0_20px_rgba(0,0,0,0.8)] rounded overflow-hidden max-h-[400px] overflow-y-auto custom-scrollbar"
                              style={{ top: menuPos.top, left: menuPos.left }}
                              onClick={(e) => e.stopPropagation()}
                          >
                              <div className="py-1">
                                  {/* File Operations */}
                                  <button onClick={() => { setIsOpen(false); setRenameTarget(row); }} className="action-item" disabled={!row.filemetum}>
                                      <Edit size={14} /> Rename File
                                  </button>
                                  <button onClick={() => { setIsOpen(false); setDescriptionTarget(row); }} className="action-item">
                                      <FileText size={14} /> Edit Description
                                  </button>
                                  
                                  <div className="separator" />

                                  {/* View / Config */}
                                  <button onClick={() => { setIsOpen(false); setSelectedPayload(row); setSelectedTab("config"); }} className="action-item">
                                      <Info size={14} /> View Payload Configuration
                                  </button>
                                  {/* Compare - Placeholder */}
                                  <button disabled className="action-item opacity-50 cursor-not-allowed">
                                      <Code size={14} /> Compare Payload Configuration
                                  </button>

                                  <div className="separator" />
                                  
                                  {/* Toggles */}
                                  <button onClick={() => { handleToggleAlert(row.uuid, row.callback_alert); }} className="action-item">
                                      {row.callback_alert ? <Eye size={14} className="text-green-400" /> : <EyeOff size={14} className="text-red-400" />}
                                      {row.callback_alert ? "Alerting to New Callbacks" : "Not Alerting to New Callbacks"}
                                  </button>
                                  <button onClick={() => { handleToggleAllowed(row.uuid, row.callback_allowed); }} className="action-item">
                                      {row.callback_allowed ? <Eye size={14} className="text-green-400" /> : <EyeOff size={14} className="text-red-400" />}
                                      {row.callback_allowed ? "Allow New Callbacks" : "Prevent New Callbacks"}
                                  </button>
                                  
                                  <div className="separator" />

                                  {/* Build Logs */}
                                  <button onClick={() => { setIsOpen(false); setSelectedPayload(row); setSelectedTab("build"); }} className="action-item">
                                      <MessageSquare size={14} /> View Build Message/Stdout
                                  </button>
                                  <button onClick={() => { setIsOpen(false); setSelectedPayload(row); setSelectedTab("build"); }} className="action-item">
                                      <AlertTriangle size={14} className="text-yellow-500" /> View Build Errors
                                  </button>
                                  
                                  <div className="separator" />

                                  {/* Rebuild */}
                                  <button onClick={() => { setIsOpen(false); handleRebuild(row.uuid); }} className="action-item">
                                      <RefreshCw size={14} /> Trigger New Build
                                  </button>
                                  <button onClick={() => { setIsOpen(false); navigate('/payloads/new'); /* TODO: Pre-fill */ }} className="action-item">
                                      <RefreshCw size={14} /> Trigger New Build With Edits
                                  </button>
                                  
                                  <div className="separator" />
                                  
                                  {/* Exports / Generators */}
                                  <button onClick={() => { setIsOpen(false); handleExportConfig(row.uuid); }} className="action-item">
                                      <FileJson size={14} /> Export Payload Config
                                  </button>
                                  <button onClick={() => { setIsOpen(false); openInfoModal("Redirect Rules", () => generateRedirectRules({variables: {uuid: row.uuid}})); }} className="action-item">
                                      <PhoneMissed size={14} /> Generate Redirect Rules
                                  </button>
                                  <button onClick={() => { setIsOpen(false); openInfoModal("Agent C2 Config", () => checkConfig({variables: {uuid: row.uuid}})); }} className="action-item">
                                      <Verified size={14} /> Check Agent C2 Configuration
                                  </button>
                                  <button onClick={() => { setIsOpen(false); openInfoModal("IOCs", () => generateIOC({variables: {uuid: row.uuid}})); }} className="action-item">
                                      <Fingerprint size={14} /> Generate IOCs
                                  </button>
                                  <button onClick={() => { setIsOpen(false); openInfoModal("Sample Message", () => generateSample({variables: {uuid: row.uuid}})); }} className="action-item">
                                      <Activity size={14} /> Generate Sample Message
                                  </button>
                                  <button disabled className="action-item opacity-50 cursor-not-allowed">
                                      <Phone size={14} /> Generate Fake Callback
                                  </button>

                                  <div className="separator" />
                                  
                                  <button 
                                      onClick={() => { setIsOpen(false); handleDelete(row.uuid, false); }}
                                      className="action-item text-red-400 hover:bg-red-900/20"
                                  >
                                      <Trash2 size={14} /> Delete from Disk
                                  </button>
                              </div>
                          </motion.div>
                    </AnimatePresence>
                  </>,
                  document.body
              )}
          </div>
      );
  };
  
  // Helper for cleaner JSX
  // defined inside component to access styles via tailwind classes in className
  const ActionItemStyles = `
    .action-item {
        width: 100%;
        text-align: left;
        padding: 8px 16px;
        font-size: 12px;
        font-family: monospace;
        color: #d1d5db;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s;
    }
    .action-item:hover:not(:disabled) {
        background-color: rgba(255, 255, 255, 0.1);
        color: #22c55e;
    }
    .separator {
        height: 1px;
        background-color: #374151;
        margin: 4px 0;
    }
  `;

  const columns = [
    {
      header: "ID",
      cell: (row: any) => <span className="text-gray-400 font-mono text-xs">#{row.id}</span>
    },
    {
      header: "FILE ARTIFACT",
      cell: (row: any) => {
        const decodedName = row.filemetum?.filename_text ? b64DecodeUnicode(row.filemetum.filename_text) : row.uuid;
        return (
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className={cn(
                "p-2 rounded border transition-colors",
                row.build_phase === 'success' ? "border-green-500/30 bg-green-900/10 text-green-400" :
                row.build_phase === 'error' ? "border-red-500/30 bg-red-900/10 text-red-400" :
                "border-yellow-500/30 bg-yellow-900/10 text-yellow-400"
            )}>
              {row.build_phase === 'error' ? <AlertTriangle size={16} /> : <FileText size={16} />}
            </div>
            <div className="flex flex-col">
                <span className="text-signal font-bold text-sm hover:underline hover:text-white transition-colors truncate max-w-[200px]" title={decodedName}>
                    {decodedName}
                </span>
                <span className="text-[10px] text-gray-500 font-mono">{row.filemetum?.size ? `${(row.filemetum.size / 1024).toFixed(1)} KB` : "SIZE_UNKNOWN"}</span>
            </div>
          </div>
        )
      }
    },
    {
      header: "DESCRIPTION",
      cell: (row: any) => (
          <span className="text-gray-400 italic text-xs truncate max-w-[200px] block" title={row.description}>
              {row.description || "No description"}
          </span>
      )
    },
    {
      header: "AGENT ARCH",
      cell: (row: any) => (
          <div className="flex flex-col">
              <span className="uppercase text-xs font-bold text-gray-300">{row.payloadtype?.name}</span>
              <span className="text-[10px] text-gray-500 font-mono">{row.os}</span>
          </div>
      )
    },
    {
      header: "C2 CHANNELS",
      cell: (row: any) => (
        <div className="flex flex-wrap gap-1">
          {row.payloadc2profiles.map((pc: any) => (
            <span key={pc.c2profile.name} className={cn(
              "text-[10px] px-2 py-0.5 rounded border font-mono",
              pc.c2profile.running ? "bg-green-900/20 border-green-500/30 text-green-400" : "bg-red-900/20 border-red-500/30 text-red-400"
            )}>
              {pc.c2profile.name}
            </span>
          ))}
        </div>
      )
    },
    {
      header: "BUILD STATUS",
      cell: (row: any) => (
        <span className={cn(
          "uppercase text-xs font-bold font-mono px-2 py-1 rounded",
          row.build_phase === "success" && "text-green-400 bg-green-900/10",
          row.build_phase === "building" && "text-yellow-400 bg-yellow-900/10 animate-pulse",
          row.build_phase === "error" && "text-red-400 bg-red-900/10"
        )}>
          {row.build_phase}
        </span>
      )
    },
    {
      header: "ACTIONS",
      cell: (row: any) => (
        <div className="flex items-center gap-2 justify-end">
            <button
              onClick={(e) => { 
                  e.stopPropagation(); 
                  if (row.filemetum?.agent_file_id) {
                      const link = `${window.location.origin}/direct/download/${row.filemetum.agent_file_id}`;
                      navigator.clipboard.writeText(link).then(() => {
                          snackActions.success("Public download link copied");
                      }).catch(err => {
                          snackActions.error("Failed to copy link");
                      });
                  }
              }}
              className="p-2 text-gray-400 hover:text-signal hover:bg-white/10 rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={row.build_phase !== 'success' || !row.filemetum?.agent_file_id}
              title="Copy Public Download Link"
            >
              <Link size={18} />
            </button>
            <button
              onClick={(e) => { 
                  e.stopPropagation(); 
                  if (row.filemetum?.agent_file_id) {
                      window.location.href = `/direct/download/${row.filemetum.agent_file_id}`;
                  }
              }}
              className="p-2 text-gray-400 hover:text-signal hover:bg-white/10 rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={row.build_phase !== 'success' || !row.filemetum?.agent_file_id}
              title="Download Artifact"
            >
              <Download size={18} />
            </button>
            
            <ActionsMenu row={row} />
        </div>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-void text-signal font-sans p-6 lg:p-12">
      <style>{ActionItemStyles}</style>
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 border border-signal bg-signal/10 rounded">
            <Box size={24} className="text-signal" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-widest">PAYLOADS OVERVIEW</h1>
            <p className="text-xs text-gray-400 font-mono">/root/payloads/list</p>
          </div>
        </div>
        <button
          onClick={handleGeneratePayload}
          className="flex items-center gap-2 px-6 py-3 bg-signal text-void font-bold font-mono text-sm hover:bg-white hover:shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all rounded"
        >
          <PlusCircle size={18} /> GENERATE PAYLOAD
        </button>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <CyberTable
          data={payloads}
          columns={columns}
          isLoading={loading}
          onRowClick={handleRowClick}
        />
      </motion.div>

      {/* Payload Details Modal */}
      <PayloadDetailsModal 
        payload={activePayload}
        isOpen={!!activePayload}
        onClose={() => setSelectedPayload(null)}
        initialTab={selectedTab} // We need to update PayloadDetailsModal to accept this prop
      />

      {/* Rename Modal */}
      <RenameModal 
          payload={renameTarget}
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          onRename={handleRename}
      />
      
      {/* Description Modal */}
      <EditDescriptionModal
          payload={descriptionTarget}
          isOpen={!!descriptionTarget}
          onClose={() => setDescriptionTarget(null)}
          onSave={handleDescriptionSave}
      />

      {/* Generic Info Modal (Redirects, IOCs, etc.) */}
      <TextInfoModal 
          title={infoModalTitle}
          content={infoModalContent}
          isOpen={infoModalOpen}
          onClose={() => setInfoModalOpen(false)}
          isLoading={infoModalLoading}
      />
    </div>
  );
}
