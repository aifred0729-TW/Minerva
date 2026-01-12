import React, { useState, useRef } from 'react';
import { useMutation, useSubscription, gql } from '@apollo/client';
import { motion } from 'framer-motion';
import { 
    FileText, 
    Download,
    FileJson,
    FileCode,
    Target,
    Shield,
    Terminal,
    Filter,
    User,
    Server,
    Hash,
    Loader2,
    CheckCircle,
    AlertCircle,
    Info
} from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { cn } from '../lib/utils';
import { snackActions } from '../../Archive/components/utilities/Snackbar';
import { getSkewedNow } from '../../Archive/components/utilities/Time';

// ============================================
// GraphQL Queries & Mutations
// ============================================
const GENERATE_REPORT = gql`
mutation generateReportMutation(
    $outputFormat: String!, 
    $includeMITREPerTask: Boolean!, 
    $includeMITREOverall: Boolean!, 
    $excludedUsers: String!, 
    $excludedHosts: String!, 
    $excludedIDs: String!, 
    $includeOutput: Boolean!
){
    generateReport(
        outputFormat: $outputFormat, 
        includeMITREPerTask: $includeMITREPerTask, 
        includeMITREOverall: $includeMITREOverall, 
        excludedUsers: $excludedUsers, 
        excludedHosts: $excludedHosts, 
        excludedIDs: $excludedIDs, 
        includeOutput: $includeOutput
    ){
        status
        error
    }
}
`;

const REPORT_SUBSCRIPTION = gql`
subscription generatedReportEventSubscription($fromNow: timestamp!){
    operationeventlog_stream(
        batch_size: 1, 
        where: {source: {_eq: "generated_report"}}, 
        cursor: {initial_value: {timestamp: $fromNow}}
    ) {
        message
    }
}
`;

// ============================================
// Report Option Toggle Component
// ============================================
const OptionToggle = ({ 
    label, 
    description, 
    checked, 
    onChange,
    disabled = false 
}: {
    label: string;
    description: string;
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
}) => (
    <div className={cn(
        "p-4 bg-black/30 border border-ghost/20 rounded-lg",
        disabled && "opacity-50"
    )}>
        <div className="flex items-center justify-between">
            <div className="flex-1">
                <h3 className="text-white font-medium">{label}</h3>
                <p className="text-gray-500 text-sm mt-1">{description}</p>
            </div>
            <button
                onClick={onChange}
                disabled={disabled}
                className={cn(
                    "relative w-12 h-6 rounded-full transition-colors",
                    checked ? "bg-signal" : "bg-ghost/30",
                    disabled && "cursor-not-allowed"
                )}
            >
                <motion.div
                    className="absolute top-1 w-4 h-4 bg-white rounded-full shadow"
                    animate={{ left: checked ? 28 : 4 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
            </button>
        </div>
    </div>
);

// ============================================
// Main Reporting Page
// ============================================
const Reporting = () => {
    const fromNow = useRef((getSkewedNow()).toISOString());
    const [generating, setGenerating] = useState(false);
    const [lastReport, setLastReport] = useState<{ id: string; timestamp: Date } | null>(null);
    
    // Report Options
    const [outputFormat, setOutputFormat] = useState<'html' | 'json'>('html');
    const [includeMITREPerTask, setIncludeMITREPerTask] = useState(false);
    const [includeMITREOverall, setIncludeMITREOverall] = useState(false);
    const [includeOutput, setIncludeOutput] = useState(false);
    const [excludedUsers, setExcludedUsers] = useState('');
    const [excludedHosts, setExcludedHosts] = useState('');
    const [excludedIDs, setExcludedIDs] = useState('');

    // Generate Report Mutation
    const [generateReport] = useMutation(GENERATE_REPORT, {
        onCompleted: (data) => {
            if (data.generateReport.status === "success") {
                snackActions.info("Generating report... This may take a moment.");
            } else {
                snackActions.error(data.generateReport.error);
                setGenerating(false);
            }
        },
        onError: (error) => {
            snackActions.error("Failed to generate report: " + error.message);
            setGenerating(false);
        }
    });

    // Subscribe to report generation completion
    useSubscription(REPORT_SUBSCRIPTION, {
        variables: { fromNow: fromNow.current },
        fetchPolicy: "no-cache",
        onData: ({ data }) => {
            if (data.data?.operationeventlog_stream?.length > 0) {
                const message = data.data.operationeventlog_stream[0].message;
                const fileId = message.split(":").pop()?.trim();
                if (fileId) {
                    setLastReport({ id: fileId, timestamp: new Date() });
                    setGenerating(false);
                    snackActions.success("Report generated successfully!");
                }
            }
        },
        onError: () => {
            snackActions.warning("Failed to receive report notifications");
        }
    });

    const handleGenerateReport = () => {
        setGenerating(true);
        generateReport({
            variables: {
                outputFormat,
                includeMITREPerTask,
                includeMITREOverall,
                includeOutput: outputFormat === 'json' ? includeOutput : false,
                excludedUsers,
                excludedHosts,
                excludedIDs
            }
        });
    };

    const handleDownload = () => {
        if (lastReport?.id) {
            window.open(`/api/v1.4/files/download/${lastReport.id}`, '_blank');
        }
    };

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <Sidebar />
            
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="flex-1 flex flex-col min-w-0 ml-16 h-screen">
                {/* Header */}
                <div className="h-16 border-b border-ghost/30 flex items-center justify-between px-6 bg-void/90 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
                            <FileText size={20} className="text-purple-400" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-wide">REPORTING</h1>
                            <p className="text-xs text-gray-500 font-mono">
                                Generate operation reports
                            </p>
                        </div>
                    </div>

                    {lastReport && (
                        <button
                            onClick={handleDownload}
                            className="flex items-center gap-2 px-4 py-2 bg-matrix/10 hover:bg-matrix/20 border border-matrix/30 text-matrix rounded transition-colors"
                        >
                            <Download size={16} />
                            Download Last Report
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    <div className="max-w-3xl mx-auto space-y-6">
                        
                        {/* Output Format Selection */}
                        <div className="p-6 bg-black/30 border border-ghost/20 rounded-lg">
                            <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                                <FileCode size={20} className="text-signal" />
                                Output Format
                            </h2>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setOutputFormat('html')}
                                    className={cn(
                                        "flex-1 p-4 rounded-lg border-2 transition-all",
                                        outputFormat === 'html'
                                            ? "border-signal bg-signal/10"
                                            : "border-ghost/30 hover:border-ghost/50"
                                    )}
                                >
                                    <div className="flex items-center gap-3 mb-2">
                                        <FileCode size={24} className={outputFormat === 'html' ? "text-signal" : "text-gray-400"} />
                                        <span className={cn(
                                            "font-medium text-lg",
                                            outputFormat === 'html' ? "text-signal" : "text-gray-300"
                                        )}>HTML</span>
                                    </div>
                                    <p className="text-sm text-gray-500">
                                        Human-readable report with formatting
                                    </p>
                                </button>
                                <button
                                    onClick={() => setOutputFormat('json')}
                                    className={cn(
                                        "flex-1 p-4 rounded-lg border-2 transition-all",
                                        outputFormat === 'json'
                                            ? "border-signal bg-signal/10"
                                            : "border-ghost/30 hover:border-ghost/50"
                                    )}
                                >
                                    <div className="flex items-center gap-3 mb-2">
                                        <FileJson size={24} className={outputFormat === 'json' ? "text-signal" : "text-gray-400"} />
                                        <span className={cn(
                                            "font-medium text-lg",
                                            outputFormat === 'json' ? "text-signal" : "text-gray-300"
                                        )}>JSON</span>
                                    </div>
                                    <p className="text-sm text-gray-500">
                                        Machine-readable structured data
                                    </p>
                                </button>
                            </div>
                        </div>

                        {/* MITRE ATT&CK Options */}
                        <div className="p-6 bg-black/30 border border-ghost/20 rounded-lg">
                            <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                                <Target size={20} className="text-red-400" />
                                MITRE ATT&CK Options
                            </h2>
                            <div className="space-y-3">
                                <OptionToggle
                                    label="Include MITRE ATT&CK Coverage Per Task"
                                    description="Add ATT&CK technique mappings to each individual task"
                                    checked={includeMITREPerTask}
                                    onChange={() => setIncludeMITREPerTask(!includeMITREPerTask)}
                                />
                                <OptionToggle
                                    label="Include MITRE ATT&CK Coverage Overview"
                                    description="Add an overall summary of ATT&CK coverage for the operation"
                                    checked={includeMITREOverall}
                                    onChange={() => setIncludeMITREOverall(!includeMITREOverall)}
                                />
                            </div>
                        </div>

                        {/* Output Options (JSON only) */}
                        {outputFormat === 'json' && (
                            <div className="p-6 bg-black/30 border border-ghost/20 rounded-lg">
                                <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                                    <Terminal size={20} className="text-signal" />
                                    Output Options
                                </h2>
                                <OptionToggle
                                    label="Include Command Output"
                                    description="Include the full output from each command (can significantly increase file size)"
                                    checked={includeOutput}
                                    onChange={() => setIncludeOutput(!includeOutput)}
                                />
                            </div>
                        )}

                        {/* Exclusion Filters */}
                        <div className="p-6 bg-black/30 border border-ghost/20 rounded-lg">
                            <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                                <Filter size={20} className="text-yellow-400" />
                                Exclusion Filters
                            </h2>
                            <p className="text-gray-500 text-sm mb-4">
                                Exclude callbacks matching these values (comma-separated)
                            </p>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-gray-400 flex items-center gap-2 mb-2">
                                        <User size={14} />
                                        Exclude Users
                                    </label>
                                    <input
                                        type="text"
                                        value={excludedUsers}
                                        onChange={(e) => setExcludedUsers(e.target.value)}
                                        placeholder="admin, SYSTEM, ..."
                                        className="w-full h-10 px-3 bg-black/50 border border-ghost/30 rounded text-white placeholder-gray-600 focus:border-signal/50 focus:outline-none font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-400 flex items-center gap-2 mb-2">
                                        <Server size={14} />
                                        Exclude Hosts
                                    </label>
                                    <input
                                        type="text"
                                        value={excludedHosts}
                                        onChange={(e) => setExcludedHosts(e.target.value)}
                                        placeholder="DESKTOP-TEST, ..."
                                        className="w-full h-10 px-3 bg-black/50 border border-ghost/30 rounded text-white placeholder-gray-600 focus:border-signal/50 focus:outline-none font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-400 flex items-center gap-2 mb-2">
                                        <Hash size={14} />
                                        Exclude Callback IDs
                                    </label>
                                    <input
                                        type="text"
                                        value={excludedIDs}
                                        onChange={(e) => setExcludedIDs(e.target.value)}
                                        placeholder="1, 5, 10, ..."
                                        className="w-full h-10 px-3 bg-black/50 border border-ghost/30 rounded text-white placeholder-gray-600 focus:border-signal/50 focus:outline-none font-mono"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Info Box */}
                        <div className="p-4 bg-signal/5 border border-signal/20 rounded-lg flex items-start gap-3">
                            <Info size={20} className="text-signal shrink-0 mt-0.5" />
                            <div className="text-sm text-gray-400">
                                <p>Generated reports are also available in the <span className="text-signal">Search</span> page under the <span className="text-signal">Files</span> tab.</p>
                                <p className="mt-1">Reports include all tasks and metadata from the current operation.</p>
                            </div>
                        </div>

                        {/* Generate Button */}
                        <button
                            onClick={handleGenerateReport}
                            disabled={generating}
                            className={cn(
                                "w-full h-14 rounded-lg font-medium text-lg transition-all flex items-center justify-center gap-3",
                                generating
                                    ? "bg-ghost/20 text-gray-500 cursor-not-allowed"
                                    : "bg-signal hover:bg-signal/80 text-void"
                            )}
                        >
                            {generating ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    Generating Report...
                                </>
                            ) : (
                                <>
                                    <FileText size={20} />
                                    Generate Report
                                </>
                            )}
                        </button>

                        {/* Last Generated Report */}
                        {lastReport && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 bg-matrix/10 border border-matrix/30 rounded-lg flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <CheckCircle size={20} className="text-matrix" />
                                    <div>
                                        <p className="text-white font-medium">Report Generated Successfully</p>
                                        <p className="text-gray-400 text-sm">
                                            {lastReport.timestamp.toLocaleTimeString()}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleDownload}
                                    className="flex items-center gap-2 px-4 py-2 bg-matrix/20 hover:bg-matrix/30 text-matrix rounded transition-colors"
                                >
                                    <Download size={16} />
                                    Download
                                </button>
                            </motion.div>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default Reporting;
