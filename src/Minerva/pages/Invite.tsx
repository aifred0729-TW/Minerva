import React, { useState, useEffect, useMemo } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useReactiveVar } from "@apollo/client/react";
import {
    UserPlus, Lock, Mail, Hash, ShieldCheck, AlertTriangle, CheckCircle,
    ArrowRight, Eye, EyeOff, Globe, Activity, Clock, ChevronRight,
} from 'lucide-react';
import { snackActions } from '../lib/snackbar';
import { meState } from '../lib/state';
import { cn } from '../lib/utils';

// ============================================
// Helpers
// ============================================
const PASSWORD_MIN = 8;

const getConnectionInfo = () => {
    const loc = window.location;
    return {
        hostname: loc.hostname || '127.0.0.1',
        port:     loc.port || (loc.protocol === 'https:' ? '443' : '80'),
        protocol: loc.protocol === 'https:' ? 'HTTPS' : 'HTTP',
        secure:   loc.protocol === 'https:',
    };
};

const passwordStrength = (pw: string): { score: number; label: string; color: string } => {
    if (!pw)                 return { score: 0, label: 'NONE',   color: 'text-white/55' };
    if (pw.length < 6)       return { score: 1, label: 'WEAK',   color: 'text-red-400' };
    if (pw.length < PASSWORD_MIN) return { score: 2, label: 'FAIR', color: 'text-yellow-400' };
    const hasUpper   = /[A-Z]/.test(pw);
    const hasLower   = /[a-z]/.test(pw);
    const hasDigit   = /\d/.test(pw);
    const hasSymbol  = /[^A-Za-z0-9]/.test(pw);
    const variety = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;
    if (variety >= 3 && pw.length >= 12) return { score: 4, label: 'STRONG', color: 'text-green-400' };
    if (variety >= 2)                    return { score: 3, label: 'GOOD',   color: 'text-signal' };
    return { score: 2, label: 'FAIR', color: 'text-yellow-400' };
};

// Live clock for the left panel
const LiveClock = () => {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    return (
        <div className="text-sm text-signal font-mono">
            {now.toLocaleTimeString('en-GB')}
        </div>
    );
};

// ============================================
// Invite Page
// ============================================
export default function InvitePage() {
    const me = useReactiveVar(meState);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const suppliedCode = searchParams.get('code') || '';

    const connInfo = useMemo(() => getConnectionInfo(), []);

    const [code, setCode]                       = useState(suppliedCode);
    const [username, setUsername]               = useState('');
    const [password, setPassword]               = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [email, setEmail]                     = useState('');

    const [showPw, setShowPw]                   = useState(false);
    const [showPw2, setShowPw2]                 = useState(false);
    const [submitting, setSubmitting]           = useState(false);
    const [stage, setStage]                     = useState<'form' | 'success'>('form');
    const [errorMsg, setErrorMsg]               = useState<string | null>(null);
    const [redirectIn, setRedirectIn]           = useState(5);

    // already logged in → bounce to dashboard
    if (me.loggedIn) return <Navigate replace to="/dashboard" />;

    const pwStrength = passwordStrength(password);
    const pwMatches  = password.length > 0 && password === confirmPassword;
    const pwValid    = password.length >= PASSWORD_MIN;
    const canSubmit  = !!code.trim() && !!username.trim() && pwValid && pwMatches && !submitting;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSubmitting(true);
        setErrorMsg(null);

        try {
            const res = await fetch('/invite', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ username, password, code, email }),
            });

            if (!res.ok) {
                setErrorMsg(`HTTP ${res.status} — request rejected by server`);
                setSubmitting(false);
                return;
            }
            const data = await res.json();
            if (data.status === 'success') {
                snackActions.success('Account registered successfully');
                setStage('success');
            } else {
                setErrorMsg(data.error || 'Registration failed');
                setSubmitting(false);
            }
        } catch (err: any) {
            setErrorMsg(
                err?.toString?.() === 'TypeError: Failed to fetch'
                    ? 'Connection failed — accept the SSL certificate or refresh.'
                    : 'Network error: ' + (err?.toString?.() ?? 'unknown')
            );
            setSubmitting(false);
        }
    };

    // Auto-redirect on success
    useEffect(() => {
        if (stage !== 'success') return;
        if (redirectIn <= 0) {
            navigate('/login');
            return;
        }
        const id = setTimeout(() => setRedirectIn(redirectIn - 1), 1000);
        return () => clearTimeout(id);
    }, [stage, redirectIn, navigate]);

    return (
        <div className="min-h-screen w-full bg-void relative overflow-hidden text-signal font-mono">
            <AnimatePresence mode="wait">
                {stage === 'form' ? (
                    <motion.div
                        key="form"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.97, filter: 'blur(8px)' }}
                        transition={{ duration: 0.4 }}
                        className="flex w-full h-screen"
                    >
                        {/* ── LEFT PANEL ─────────────────────────────────── */}
                        <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 border-r border-ghost/30 relative bg-void">
                            <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22300%22%20height%3D%22300%22%3E%3Cfilter%20id%3D%22n%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.65%22%20numOctaves%3D%223%22%20stitchTiles%3D%22stitch%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23n)%22%2F%3E%3C%2Fsvg%3E')] opacity-10 pointer-events-none" />

                            {/* Brand */}
                            <div className="relative">
                                <div className="flex items-center gap-3 mb-6">
                                    <ShieldCheck size={18} className="text-signal" />
                                    <span className="text-signal tracking-[0.3em] text-sm">MINERVA C2</span>
                                </div>
                                <h2 className="text-6xl font-bold text-white/15 select-none tracking-tighter leading-[1.05]">
                                    INVITE<br />PROTOCOL
                                </h2>
                            </div>

                            {/* Body: Process / Info */}
                            <div className="flex-1 flex flex-col justify-center gap-6 relative">
                                <div className="border border-ghost/50 p-5">
                                    <div className="text-[10px] tracking-[0.3em] text-cyan-300 mb-3 uppercase font-bold">
                                        Onboarding Sequence
                                    </div>
                                    <ol className="space-y-2.5">
                                        <ProcessStep n={1} label="VERIFY INVITE CODE" desc="Encrypted token issued by an admin operator" active={!!code} />
                                        <ProcessStep n={2} label="CREATE OPERATOR HANDLE" desc="Choose a unique callsign — used to sign all tasking" active={!!username} />
                                        <ProcessStep n={3} label="LOCK CREDENTIALS"     desc={`Passphrase ≥ ${PASSWORD_MIN} chars · stored as bcrypt hash`} active={pwValid && pwMatches} />
                                        <ProcessStep n={4} label="SESSION HANDOFF"      desc="Auto-redirect to login once registration completes" active={false} />
                                    </ol>
                                </div>

                                {/* Connection Info */}
                                <div className="grid grid-cols-2 gap-4">
                                    <InfoTile icon={<Globe size={10} />} label="HOST"     value={connInfo.hostname} />
                                    <InfoTile icon={<ChevronRight size={10} />} label="PORT" value={connInfo.port} />
                                    <InfoTile
                                        icon={<Lock size={10} />}
                                        label="PROTOCOL"
                                        value={connInfo.protocol}
                                        valueClass={connInfo.secure ? 'text-green-400' : 'text-yellow-400'}
                                        suffix={connInfo.secure ? 'ENCRYPTED' : 'PLAIN'}
                                    />
                                    <div className="border border-ghost/50 p-4">
                                        <div className="text-[10px] tracking-[0.2em] text-white/70 mb-2 flex items-center gap-2 font-bold uppercase">
                                            <Clock size={10} />
                                            LOCAL TIME
                                        </div>
                                        <LiveClock />
                                    </div>
                                </div>

                                <div className="border-l-2 border-signal/40 pl-4 space-y-1.5">
                                    <div className="text-[10px] tracking-[0.2em] text-cyan-300 uppercase font-bold">Status</div>
                                    <div className="text-xs text-white/95">
                                        <span className="text-white/70">SESSION:</span> AWAITING_REGISTRATION
                                    </div>
                                    <div className="text-xs text-white/95">
                                        <span className="text-white/70">CODE:</span>{' '}
                                        {suppliedCode
                                            ? <span className="text-signal">{suppliedCode}</span>
                                            : <span className="text-yellow-400">NOT PROVIDED — ENTER MANUALLY</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="text-[10px] text-white/55 flex justify-between uppercase relative">
                                <span>Minerva C2 Framework</span>
                                <span>{connInfo.protocol} · Port {connInfo.port}</span>
                            </div>
                        </div>

                        {/* ── RIGHT PANEL : FORM ─────────────────────────── */}
                        <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative overflow-y-auto">
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.5, ease: 'easeOut', delay: 0.15 }}
                                className="w-full max-w-md"
                            >
                                {/* Header */}
                                <div className="mb-8">
                                    <div className="inline-block p-3 border border-signal rounded-full mb-5">
                                        <UserPlus size={28} className="text-signal" />
                                    </div>
                                    <h1 className="text-3xl lg:text-4xl font-bold tracking-[0.2em] text-signal mb-2">REGISTER</h1>
                                    <p className="text-white/85 text-xs lg:text-sm tracking-widest uppercase">
                                        New Operator Onboarding
                                    </p>
                                </div>

                                {/* Error banner */}
                                <AnimatePresence>
                                    {errorMsg && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -8 }}
                                            className="mb-5 px-3 py-2 border border-red-500/50 bg-red-500/10 text-red-300 text-xs flex items-start gap-2 rounded"
                                        >
                                            <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                                            <span className="leading-relaxed">{errorMsg}</span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <form onSubmit={submit} className="space-y-5">
                                    {/* Invite code */}
                                    <Field
                                        icon={<Hash size={11} />}
                                        label="Invite Code"
                                        hint={suppliedCode ? 'Pre-filled from URL' : 'Required'}
                                    >
                                        <input
                                            type="text"
                                            value={code}
                                            onChange={(e) => setCode(e.target.value)}
                                            required
                                            spellCheck={false}
                                            placeholder="XXXXX"
                                            className={cn(
                                                'w-full bg-transparent border-b py-2.5 text-base text-signal focus:border-signal focus:outline-none transition-colors tracking-[0.2em] uppercase placeholder-white/30',
                                                suppliedCode ? 'border-signal/60' : 'border-ghost'
                                            )}
                                        />
                                    </Field>

                                    {/* Username */}
                                    <Field icon={<UserPlus size={11} />} label="Operator Handle">
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            required
                                            spellCheck={false}
                                            autoComplete="username"
                                            autoFocus={!!suppliedCode}
                                            placeholder="callsign"
                                            className="w-full bg-transparent border-b border-ghost py-2.5 text-base text-signal focus:border-signal focus:outline-none transition-colors tracking-wider placeholder-white/30"
                                        />
                                    </Field>

                                    {/* Password */}
                                    <Field
                                        icon={<Lock size={11} />}
                                        label="Passphrase"
                                        hint={
                                            password ? (
                                                <span className={cn('font-bold', pwStrength.color)}>{pwStrength.label}</span>
                                            ) : (
                                                <span className="text-white/55">{`min ${PASSWORD_MIN} chars`}</span>
                                            )
                                        }
                                    >
                                        <div className="relative">
                                            <input
                                                type={showPw ? 'text' : 'password'}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                                autoComplete="new-password"
                                                placeholder="••••••••"
                                                className="w-full bg-transparent border-b border-ghost py-2.5 pr-9 text-base text-signal focus:border-signal focus:outline-none transition-colors tracking-wider placeholder-white/30"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPw(s => !s)}
                                                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-white/70 hover:text-signal transition-colors"
                                                tabIndex={-1}
                                            >
                                                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </button>
                                        </div>
                                        {/* Strength bar */}
                                        {password && (
                                            <div className="mt-2 flex gap-1">
                                                {[1, 2, 3, 4].map(i => (
                                                    <div
                                                        key={i}
                                                        className={cn(
                                                            'h-0.5 flex-1 rounded-full transition-colors',
                                                            i <= pwStrength.score
                                                                ? pwStrength.score === 1 ? 'bg-red-400'
                                                                    : pwStrength.score === 2 ? 'bg-yellow-400'
                                                                    : pwStrength.score === 3 ? 'bg-signal'
                                                                    : 'bg-green-400'
                                                                : 'bg-white/10'
                                                        )}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </Field>

                                    {/* Confirm password */}
                                    <Field
                                        icon={<Lock size={11} />}
                                        label="Confirm Passphrase"
                                        hint={
                                            confirmPassword
                                                ? pwMatches
                                                    ? <span className="text-green-400 font-bold flex items-center gap-1"><CheckCircle size={10} /> MATCH</span>
                                                    : <span className="text-red-400 font-bold">MISMATCH</span>
                                                : null
                                        }
                                    >
                                        <div className="relative">
                                            <input
                                                type={showPw2 ? 'text' : 'password'}
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                required
                                                autoComplete="new-password"
                                                placeholder="••••••••"
                                                className={cn(
                                                    'w-full bg-transparent border-b py-2.5 pr-9 text-base focus:outline-none transition-colors tracking-wider placeholder-white/30 text-signal',
                                                    confirmPassword
                                                        ? pwMatches
                                                            ? 'border-green-500/60 focus:border-green-400'
                                                            : 'border-red-500/60 focus:border-red-400'
                                                        : 'border-ghost focus:border-signal'
                                                )}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPw2(s => !s)}
                                                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-white/70 hover:text-signal transition-colors"
                                                tabIndex={-1}
                                            >
                                                {showPw2 ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </button>
                                        </div>
                                    </Field>

                                    {/* Email (optional) */}
                                    <Field icon={<Mail size={11} />} label="Email" hint={<span className="text-white/55">Optional</span>}>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            spellCheck={false}
                                            autoComplete="email"
                                            placeholder="user@domain.com"
                                            className="w-full bg-transparent border-b border-ghost py-2.5 text-base text-signal focus:border-signal focus:outline-none transition-colors tracking-wider placeholder-white/30"
                                        />
                                    </Field>

                                    {/* Submit */}
                                    <button
                                        type="submit"
                                        disabled={!canSubmit}
                                        className={cn(
                                            'w-full mt-2 py-3 border font-bold tracking-widest text-sm uppercase relative overflow-hidden group transition-all duration-300',
                                            !canSubmit
                                                ? 'border-ghost/40 text-white/45 bg-transparent cursor-not-allowed'
                                                : 'border-signal bg-signal text-void hover:bg-void hover:text-signal'
                                        )}
                                    >
                                        <span className="relative z-10 flex items-center justify-center gap-2">
                                            {submitting ? (
                                                <>
                                                    <Activity size={14} className="animate-spin" /> REGISTERING…
                                                </>
                                            ) : (
                                                <>
                                                    INITIALIZE OPERATOR <ArrowRight size={14} />
                                                </>
                                            )}
                                        </span>
                                    </button>
                                </form>

                                {/* Footer */}
                                <div className="mt-6 flex items-center justify-between text-[10px] text-white/55 tracking-wider">
                                    <span>MINERVA C2 — INVITE PROTOCOL</span>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/login')}
                                        className="text-cyan-300 hover:text-signal transition-colors uppercase"
                                    >
                                        Back to Login →
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                ) : (
                    <SuccessView key="success" username={username} redirectIn={redirectIn} onLoginNow={() => navigate('/login')} />
                )}
            </AnimatePresence>
        </div>
    );
}

// ============================================
// Sub-components
// ============================================
const Field = ({ icon, label, hint, children }: { icon: React.ReactNode; label: string; hint?: React.ReactNode; children: React.ReactNode }) => (
    <div>
        <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] text-cyan-300 font-bold tracking-[0.2em] uppercase flex items-center gap-1.5">
                {icon}
                {label}
            </label>
            {hint && <span className="text-[10px] tracking-wider">{hint}</span>}
        </div>
        {children}
    </div>
);

const ProcessStep = ({ n, label, desc, active }: { n: number; label: string; desc: string; active: boolean }) => (
    <li className="flex items-start gap-3">
        <span
            className={cn(
                'shrink-0 w-6 h-6 border rounded-full flex items-center justify-center text-[10px] font-bold transition-colors',
                active
                    ? 'border-signal text-signal bg-signal/15'
                    : 'border-ghost/60 text-white/55'
            )}
        >
            {n}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
            <div className={cn('text-xs font-bold uppercase tracking-wider', active ? 'text-white' : 'text-white/85')}>{label}</div>
            <div className="text-[10px] text-white/70 leading-relaxed">{desc}</div>
        </div>
    </li>
);

const InfoTile = ({ icon, label, value, valueClass, suffix }: { icon: React.ReactNode; label: string; value: string; valueClass?: string; suffix?: string }) => (
    <div className="border border-ghost/50 p-4">
        <div className="text-[10px] tracking-[0.2em] text-white/70 mb-2 flex items-center gap-2 font-bold uppercase">
            {icon}
            {label}
        </div>
        <div className={cn('text-sm truncate', valueClass || 'text-signal')}>
            {value}
            {suffix && <span className="text-[9px] ml-2 text-white/55">{suffix}</span>}
        </div>
    </div>
);

// ============================================
// Success view
// ============================================
const SuccessView = ({ username, redirectIn, onLoginNow }: { username: string; redirectIn: number; onLoginNow: () => void }) => (
    <motion.div
        key="success-view"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full h-screen flex items-center justify-center p-6"
    >
        <div className="w-full max-w-md text-center">
            <motion.div
                initial={{ scale: 0.6, rotate: -90, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: 'backOut' }}
                className="inline-block p-5 border-2 border-green-400/60 rounded-full mb-6 bg-green-500/10"
            >
                <CheckCircle size={48} className="text-green-400" />
            </motion.div>
            <h1 className="text-3xl lg:text-4xl font-bold tracking-[0.2em] text-signal mb-2">REGISTERED</h1>
            <p className="text-sm text-white/85 tracking-widest uppercase mb-6">
                Operator <span className="text-signal font-bold">{username}</span> provisioned
            </p>

            <div className="border border-ghost/40 bg-void/40 px-5 py-4 mb-6 text-left rounded">
                <div className="text-[10px] text-cyan-300 font-bold uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                    <Activity size={11} /> Status
                </div>
                <ul className="space-y-1.5 text-xs">
                    <li className="flex items-center gap-2 text-white/95"><CheckCircle size={11} className="text-green-400" /> Account created</li>
                    <li className="flex items-center gap-2 text-white/95"><CheckCircle size={11} className="text-green-400" /> Credentials sealed</li>
                    <li className="flex items-center gap-2 text-white/85"><Activity size={11} className="text-yellow-400 animate-pulse" /> Awaiting first login</li>
                </ul>
            </div>

            <button
                onClick={onLoginNow}
                className="w-full py-3 border border-signal bg-signal text-void font-bold tracking-widest text-sm uppercase hover:bg-void hover:text-signal transition-colors rounded"
            >
                <span className="flex items-center justify-center gap-2">
                    Proceed to Login <ArrowRight size={14} />
                </span>
            </button>
            <p className="mt-4 text-[10px] text-white/55 tracking-wider">
                Auto-redirecting in <span className="text-signal font-bold">{redirectIn}</span>s…
            </p>
        </div>
    </motion.div>
);
