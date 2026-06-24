import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Music2, Pause, Play } from 'lucide-react';
import { useAppStore } from '../store';
import { useShallow } from 'zustand/shallow';
import { getTrack } from '../lib/musicDB';

export function GlobalAudioPlayer() {
    const audioRef = useRef<HTMLAudioElement>(null);
    const hasInteractedRef = useRef(false);
    const objectUrlRef = useRef<string | null>(null);

    const {
        musicEnabled,
        musicVolume,
        musicTrackId,
        musicLibrary,
        musicPlaying,
        setMusicPlaying,
    } = useAppStore(useShallow(s => ({
        musicEnabled: s.musicEnabled,
        musicVolume: s.musicVolume,
        musicTrackId: s.musicTrackId,
        musicLibrary: s.musicLibrary,
        musicPlaying: s.musicPlaying,
        setMusicPlaying: s.setMusicPlaying,
    })));

    const [trackName, setTrackName] = useState<string>('');

    // Load audio blob from IndexedDB when trackId changes
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        // Revoke previous object URL
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }

        if (!musicTrackId) {
            audio.removeAttribute('src');
            audio.pause();
            setTrackName('');
            return;
        }

        let cancelled = false;
        (async () => {
            const record = await getTrack(musicTrackId);
            if (cancelled || !record) return;
            const url = URL.createObjectURL(record.blob);
            objectUrlRef.current = url;
            audio.src = url;
            audio.volume = musicVolume;
            setTrackName(record.name);
            if (musicEnabled && musicPlaying) {
                audio.play().catch(() => {});
            }
        })();

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [musicTrackId]);

    // Cleanup object URL on unmount
    useEffect(() => {
        return () => {
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        };
    }, []);

    // Attempt playback helper
    const tryPlay = useCallback(async () => {
        const audio = audioRef.current;
        if (!audio || !musicEnabled || !musicPlaying || !musicTrackId) return;
        try {
            if (!audio.paused) return;
            await audio.play();
        } catch { /* autoplay blocked */ }
    }, [musicEnabled, musicPlaying, musicTrackId]);

    // One-time interaction bootstrap
    useEffect(() => {
        const handle = () => {
            if (hasInteractedRef.current) return;
            hasInteractedRef.current = true;
            tryPlay();
        };
        const evts = ['click', 'keydown', 'touchstart'];
        evts.forEach(e => window.addEventListener(e, handle, { passive: true }));
        setTimeout(tryPlay, 150);
        return () => evts.forEach(e => window.removeEventListener(e, handle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // React to musicEnabled / musicPlaying
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (musicEnabled && musicPlaying) {
            tryPlay();
        } else {
            audio.pause();
        }
    }, [musicEnabled, musicPlaying, tryPlay]);

    // React to volume
    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = musicVolume;
    }, [musicVolume]);

    // Mode-change external override
    useEffect(() => {
        const handler = (e: any) => {
            const mode = e.detail?.mode;
            if (mode === 'recon' || mode === 'combat') {
                audioRef.current?.pause();
            } else if (musicEnabled && musicPlaying) {
                tryPlay();
            }
        };
        window.addEventListener('mode-change', handler as EventListener);
        return () => window.removeEventListener('mode-change', handler as EventListener);
    }, [musicEnabled, musicPlaying, tryPlay]);

    // Keepalive
    useEffect(() => {
        const id = setInterval(() => {
            if (audioRef.current?.paused && musicEnabled && musicPlaying && musicTrackId && hasInteractedRef.current) {
                tryPlay();
            }
        }, 3000);
        return () => clearInterval(id);
    }, [musicEnabled, musicPlaying, musicTrackId, tryPlay]);

    const hasTrack = !!musicTrackId && musicLibrary.some(t => t.id === musicTrackId);
    const active = musicEnabled && musicPlaying && hasTrack;

    if (!musicEnabled || musicLibrary.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2">
            <audio ref={audioRef} loop preload="auto" />

            {/* Mini visualizer */}
            {active && (
                <div className="flex gap-[3px] h-3 items-end">
                    {[1, 1.5, 0.8, 1.3, 0.9].map((d, i) => (
                        <div key={i} className="w-[3px] rounded-sm"
                            style={{ background: '#00ffd1', animation: `pulse ${d}s ease-in-out infinite`,
                                height: i % 2 === 0 ? '100%' : '65%', opacity: 0.7 }} />
                    ))}
                </div>
            )}

            {/* Play/pause */}
            {hasTrack && (
                <button onClick={() => setMusicPlaying(!musicPlaying)}
                    title={active ? 'Pause music' : 'Play music'}
                    className="p-2 border border-ghost/30 bg-void/80 text-gray-400 hover:text-signal hover:border-signal transition-all rounded-full backdrop-blur-sm">
                    {active ? <Pause size={15} /> : <Play size={15} />}
                </button>
            )}

            {/* Track pill */}
            {hasTrack && trackName && (
                <div className="flex items-center gap-1.5 px-2 py-1 border border-ghost/20 bg-void/80 backdrop-blur-sm rounded-full">
                    <Music2 size={10} className={active ? 'text-signal animate-pulse' : 'text-gray-600'} />
                    <span className="font-mono text-[9px] uppercase tracking-wider text-gray-500 select-none max-w-[120px] truncate">
                        {trackName}
                    </span>
                </div>
            )}
        </div>
    );
}
