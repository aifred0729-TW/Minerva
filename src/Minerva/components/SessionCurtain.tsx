import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/shallow';
import { useAppStore } from '../store';
import { CURTAIN_HOLD_MS, CURTAIN_PART_MS } from '../pages/Login/timings';

/**
 * SessionCurtain — carries the cut between the welcome screen and the console.
 *
 * The welcome screen ends by closing two shutters onto a seam across the middle
 * of the display, and then `navigate('/dashboard')` unmounts the entire login
 * route in that same commit. Nothing the login screen renders can survive to
 * cover the swap, so its own exit animation never gets a frame, and what the
 * operator sees is a hard cut into a half-built dashboard.
 *
 * This is that missing half of the move, and it is mounted outside <Routes> so
 * the route swap cannot take it with it. It picks the shutters up exactly where
 * the welcome screen dropped them — same colour, same seam, same easing — holds
 * while the dashboard mounts and paints behind it, then parts them.
 *
 * So the closing and the opening are one gesture with a route change hidden in
 * the middle, rather than two screens meeting at a seam.
 */
export function SessionCurtain() {
    const { sessionOpening, endSessionOpen } = useAppStore(useShallow(s => ({
        sessionOpening: s.sessionOpening,
        endSessionOpen: s.endSessionOpen,
    })));

    const [parting, setParting] = useState(false);

    useEffect(() => {
        if (!sessionOpening) {
            setParting(false);
            return;
        }
        // Hold shut first. The dashboard is mounting in the frames right after
        // the swap, and revealing it mid-mount is the very stutter the curtain
        // exists to hide.
        const part = setTimeout(() => setParting(true), CURTAIN_HOLD_MS);
        const done = setTimeout(endSessionOpen, CURTAIN_HOLD_MS + CURTAIN_PART_MS);
        return () => { clearTimeout(part); clearTimeout(done); };
    }, [sessionOpening, endSessionOpen]);

    const retract = {
        duration: CURTAIN_PART_MS / 1000,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    };

    return (
        <AnimatePresence>
            {sessionOpening && (
                /* Never interactive: a curtain that outlived its animation must
                   not be able to swallow the operator's clicks. */
                <motion.div
                    key="session-curtain"
                    className="fixed inset-0 z-[9998] overflow-hidden pointer-events-none"
                    aria-hidden="true"
                >
                    {/* 50.5% each, matching the welcome screen's own shutters —
                        a hairline of overlap so no seam of dashboard shows
                        through the join while they are shut. */}
                    <motion.div
                        className="absolute inset-x-0 top-0 bg-void origin-top"
                        style={{ height: '50.5%' }}
                        initial={{ scaleY: 1 }}
                        animate={{ scaleY: parting ? 0 : 1 }}
                        transition={retract}
                    />
                    <motion.div
                        className="absolute inset-x-0 bottom-0 bg-void origin-bottom"
                        style={{ height: '50.5%' }}
                        initial={{ scaleY: 1 }}
                        animate={{ scaleY: parting ? 0 : 1 }}
                        transition={retract}
                    />

                    {/* The seam the welcome screen closed on, still cooling.
                        It is what makes the two halves read as one shutter
                        rather than a black rectangle that happens to split. */}
                    <motion.div
                        className="absolute left-0 right-0 h-px bg-signal"
                        style={{ top: '50%', boxShadow: '0 0 18px 3px rgb(var(--color-signal) / 0.55)' }}
                        initial={{ opacity: 0.38, scaleX: 1 }}
                        animate={{ opacity: 0, scaleX: 1.04 }}
                        transition={{ duration: (CURTAIN_HOLD_MS + 160) / 1000, ease: 'easeOut' }}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default SessionCurtain;
