import { useSyncExternalStore } from 'react';

/**
 * "Is the operator actually looking at this window right now?"
 *
 * `usePageVisible` answers a narrower question — whether the *tab* is hidden —
 * and that is the right gate for polling. It is the wrong gate for animation,
 * because browsers only throttle `requestAnimationFrame` and CSS animations for
 * a HIDDEN tab. A window that is merely unfocused — Minerva sitting on a second
 * monitor, or behind the browser window playing a video — keeps every animation
 * running at the full refresh rate, on the same GPU process every other tab
 * composites through. That is what makes an unattended Minerva stutter
 * everything else on the machine.
 *
 * So: engaged = visible AND focused. Data keeps flowing either way; only
 * decoration stops.
 *
 * Side effect: mirrors the state onto `<html>` as the `mv-idle` class, which
 * `index.css` uses to pause every CSS animation at once. Components that drive
 * animation from JS (three.js's frameloop, framer-motion `repeat: Infinity`,
 * canvas rAF loops) read the boolean instead.
 */

const IDLE_CLASS = 'mv-idle';

let engaged = true;
const listeners = new Set<() => void>();

function compute(): boolean {
    if (typeof document === 'undefined') return true;
    // `hasFocus()` is false while devtools is focused too, which is fine: nobody
    // is watching the animation then either.
    return !document.hidden && document.hasFocus();
}

function apply(next: boolean) {
    if (next === engaged) return;
    engaged = next;
    document.documentElement.classList.toggle(IDLE_CLASS, !next);
    listeners.forEach(l => l());
}

function subscribe(listener: () => void): () => void {
    if (listeners.size === 0 && typeof window !== 'undefined') {
        engaged = compute();
        document.documentElement.classList.toggle(IDLE_CLASS, !engaged);
        window.addEventListener('focus', onChange);
        window.addEventListener('blur', onChange);
        document.addEventListener('visibilitychange', onChange);
    }
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== 'undefined') {
            window.removeEventListener('focus', onChange);
            window.removeEventListener('blur', onChange);
            document.removeEventListener('visibilitychange', onChange);
            // Never leave the app parked in the paused state with no subscriber
            // left to un-park it.
            document.documentElement.classList.remove(IDLE_CLASS);
            engaged = true;
        }
    };
}

function onChange() { apply(compute()); }

function getSnapshot(): boolean { return engaged; }
function getServerSnapshot(): boolean { return true; }

export function useWindowEngaged(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Non-reactive read, for imperative loops that already tick every frame and
 * only need to ask "should I still be drawing?".
 */
export function isWindowEngaged(): boolean {
    return listeners.size > 0 ? engaged : compute();
}
