import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Zap, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
// @ts-ignore
import combatTheme from '../music/NCPD.m4a';
// @ts-ignore
import reconTheme from '../music/valentinos.m4a';
import { useOperationMode, OperationMode } from '../context/BattleModeContext';

// Color definitions (RGB arrays)
const NORMAL_SIGNAL = [255, 255, 255];   // white
const NORMAL_ACCENT = [34, 197, 94];     // green

const COMBAT_SIGNAL = [255, 54, 94];     // red
const COMBAT_ACCENT = [255, 54, 94];     // red

const RECON_SIGNAL = [250, 204, 21];     // yellow
const RECON_ACCENT = [250, 204, 21];     // yellow

// Set CSS variables on document
function setColors(signal: number[], accent: number[]) {
  const root = document.documentElement;
  root.style.setProperty('--color-signal', `${signal[0]} ${signal[1]} ${signal[2]}`);
  root.style.setProperty('--color-accent', `${accent[0]} ${accent[1]} ${accent[2]}`);
}

function getTargetColors(mode: OperationMode): { signal: number[], accent: number[] } {
  switch (mode) {
    case 'combat':
      return { signal: COMBAT_SIGNAL, accent: COMBAT_ACCENT };
    case 'recon':
      return { signal: RECON_SIGNAL, accent: RECON_ACCENT };
    default:
      return { signal: NORMAL_SIGNAL, accent: NORMAL_ACCENT };
  }
}

export const BattleMode: React.FC = () => {
  const combatAudioRef = useRef<HTMLAudioElement>(null);
  const reconAudioRef = useRef<HTMLAudioElement>(null);
  const { mode } = useOperationMode();
  const [muted, setMuted] = useState(false);
  const [overlay, setOverlay] = useState<OperationMode | null>(null);
  const overlayTimer = useRef<NodeJS.Timeout | null>(null);
  const animationRef = useRef<number | null>(null);
  const prevModeRef = useRef<OperationMode>('normal');
  
  // Use refs to track current color values during animation
  const currentSignalRef = useRef([...NORMAL_SIGNAL]);
  const currentAccentRef = useRef([...NORMAL_ACCENT]);

  // Initialize colors on mount
  useEffect(() => {
    setColors(NORMAL_SIGNAL, NORMAL_ACCENT);
    currentSignalRef.current = [...NORMAL_SIGNAL];
    currentAccentRef.current = [...NORMAL_ACCENT];
  }, []);

  // Audio control - ensure only one audio plays at a time
  useEffect(() => {
    const combatAudio = combatAudioRef.current;
    const reconAudio = reconAudioRef.current;
    
    // Configure audio settings
    if (combatAudio) {
      combatAudio.loop = true;
      combatAudio.volume = 0.4;
    }
    if (reconAudio) {
      reconAudio.loop = true;
      reconAudio.volume = 0.4;
    }

    // Stop ALL audio first and reset playback position
    if (combatAudio) {
      combatAudio.pause();
      combatAudio.currentTime = 0;
    }
    if (reconAudio) {
      reconAudio.pause();
      reconAudio.currentTime = 0;
    }

    // Only play audio for the current mode (normal mode = no audio)
    if (!muted) {
      if (mode === 'combat' && combatAudio) {
        combatAudio.play().catch(() => {});
      } else if (mode === 'recon' && reconAudio) {
        reconAudio.play().catch(() => {});
      }
      // Normal mode: all audio stays stopped (already paused above)
    }
  }, [mode, muted]);

  // Color transition effect
  useEffect(() => {
    const { signal: targetSignal, accent: targetAccent } = getTargetColors(mode);
    
    // Capture start colors from refs
    const startSignal = [...currentSignalRef.current];
    const startAccent = [...currentAccentRef.current];
    
    const duration = 800;
    const startTime = Date.now();

    // Cancel previous animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      
      const newSignal = [
        Math.round(startSignal[0] + (targetSignal[0] - startSignal[0]) * eased),
        Math.round(startSignal[1] + (targetSignal[1] - startSignal[1]) * eased),
        Math.round(startSignal[2] + (targetSignal[2] - startSignal[2]) * eased),
      ];
      const newAccent = [
        Math.round(startAccent[0] + (targetAccent[0] - startAccent[0]) * eased),
        Math.round(startAccent[1] + (targetAccent[1] - startAccent[1]) * eased),
        Math.round(startAccent[2] + (targetAccent[2] - startAccent[2]) * eased),
      ];
      
      // Update CSS variables
      setColors(newSignal, newAccent);
      
      // Update refs
      currentSignalRef.current = newSignal;
      currentAccentRef.current = newAccent;
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    // Manage body classes and overlay
    document.body.classList.remove('combat-mode', 'recon-mode');
    
    if (mode !== 'normal' && mode !== prevModeRef.current) {
      document.body.classList.add(`${mode}-mode`);
      setOverlay(mode);
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
      overlayTimer.current = setTimeout(() => setOverlay(null), 2500);
    } else if (mode === 'normal') {
      setOverlay(null);
    } else {
      document.body.classList.add(`${mode}-mode`);
    }

    prevModeRef.current = mode;

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [mode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.classList.remove('combat-mode', 'recon-mode');
      setColors(NORMAL_SIGNAL, NORMAL_ACCENT);
    };
  }, []);

  return (
    <>
      <audio ref={combatAudioRef} src={combatTheme} preload="auto" />
      <audio ref={reconAudioRef} src={reconTheme} preload="auto" />

      {/* Combat Mode Overlay */}
      <AnimatePresence>
        {overlay === 'combat' && (
          <motion.div
            key="combat-overlay"
            initial={{ opacity: 0, y: -10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.9 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="pointer-events-none fixed top-6 right-6 z-[9997] flex justify-end"
          >
            <div className="relative px-6 py-4 bg-black/85 backdrop-blur-md border border-[#ff365e]/70 shadow-[0_0_30px_rgba(255,54,94,0.45)] rounded-lg overflow-hidden">
              <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_10%_20%,rgba(255,54,94,0.35),transparent_25%),radial-gradient(circle_at_80%_0%,rgba(255,114,94,0.25),transparent_30%)]" />
              <div className="absolute inset-0 border border-[#ff365e]/40 rounded-lg pointer-events-none" />
              <div className="absolute -left-2 top-1 w-5 h-1 bg-[#ff365e]" />
              <div className="absolute -right-2 top-1 w-5 h-1 bg-[#ff365e]" />
              <div className="absolute -left-2 bottom-1 w-5 h-1 bg-[#ff365e]" />
              <div className="absolute -right-2 bottom-1 w-5 h-1 bg-[#ff365e]" />
              <div className="flex items-center gap-3 relative z-10">
                <div className="w-10 h-10 rounded-full border border-[#ff365e]/70 bg-[#ff365e]/15 flex items-center justify-center shadow-[0_0_16px_rgba(255,54,94,0.6)]">
                  <Zap className="text-[#ff365e]" size={18} />
                </div>
                <div className="flex flex-col">
                  <div className="text-[11px] text-[#ff5f7e] font-mono tracking-[0.3em] uppercase flex items-center gap-1">
                    <Sparkles className="animate-pulse" size={12} /> Combat Protocol
                  </div>
                  <div className="text-lg font-black tracking-[0.3em] text-white drop-shadow-[0_0_14px_rgba(255,54,94,0.7)] uppercase">
                    ENGAGEMENT LOCK
                  </div>
                  <div className="font-mono text-[10px] text-[#ff8fa5]/80 tracking-[0.2em]">
                    NCPD // MaxTac
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recon Mode Overlay */}
      <AnimatePresence>
        {overlay === 'recon' && (
          <motion.div
            key="recon-overlay"
            initial={{ opacity: 0, y: -10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.9 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="pointer-events-none fixed top-6 right-6 z-[9997] flex justify-end"
          >
            <div className="relative px-6 py-4 bg-black/85 backdrop-blur-md border border-[#facc15]/70 shadow-[0_0_30px_rgba(250,204,21,0.45)] rounded-lg overflow-hidden">
              <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_10%_20%,rgba(250,204,21,0.35),transparent_25%),radial-gradient(circle_at_80%_0%,rgba(250,204,21,0.25),transparent_30%)]" />
              <div className="absolute inset-0 border border-[#facc15]/40 rounded-lg pointer-events-none" />
              <div className="absolute -left-2 top-1 w-5 h-1 bg-[#facc15]" />
              <div className="absolute -right-2 top-1 w-5 h-1 bg-[#facc15]" />
              <div className="absolute -left-2 bottom-1 w-5 h-1 bg-[#facc15]" />
              <div className="absolute -right-2 bottom-1 w-5 h-1 bg-[#facc15]" />
              <div className="flex items-center gap-3 relative z-10">
                <div className="w-10 h-10 rounded-full border border-[#facc15]/70 bg-[#facc15]/15 flex items-center justify-center shadow-[0_0_16px_rgba(250,204,21,0.6)]">
                  <Eye className="text-[#facc15]" size={18} />
                </div>
                <div className="flex flex-col">
                  <div className="text-[11px] text-[#fde047] font-mono tracking-[0.3em] uppercase flex items-center gap-1">
                    <Sparkles className="animate-pulse" size={12} /> Recon Protocol
                  </div>
                  <div className="text-lg font-black tracking-[0.3em] text-white drop-shadow-[0_0_14px_rgba(250,204,21,0.7)] uppercase">
                    SURVEILLANCE MODE
                  </div>
                  <div className="font-mono text-[10px] text-[#fef08a]/80 tracking-[0.2em]">
                    Valentinos // Heywood
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mode-specific background effects */}
      <style>{`
        body.combat-mode {
          background-image: radial-gradient(circle at 20% 20%, rgba(255,54,94,0.08), transparent 32%), radial-gradient(circle at 80% 10%, rgba(255,114,94,0.08), transparent 35%), radial-gradient(circle at 60% 60%, rgba(255,0,122,0.06), transparent 45%);
        }
        body.combat-mode .minerva-root {
          filter: drop-shadow(0 0 12px rgba(255,54,94,0.25));
        }
        body.recon-mode {
          background-image: radial-gradient(circle at 20% 20%, rgba(250,204,21,0.06), transparent 32%), radial-gradient(circle at 80% 10%, rgba(250,204,21,0.05), transparent 35%), radial-gradient(circle at 60% 60%, rgba(234,179,8,0.04), transparent 45%);
        }
        body.recon-mode .minerva-root {
          filter: drop-shadow(0 0 12px rgba(250,204,21,0.2));
        }
      `}</style>
    </>
  );
};
