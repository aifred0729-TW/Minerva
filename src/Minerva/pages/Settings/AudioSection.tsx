import React, { useState, useRef } from 'react';
import {
    Volume2, Music2, Play, Pause, Disc3, Upload, Trash2,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { cn } from '../../lib/utils';
import { ToggleRow, SliderRow } from './SettingsRows';

const ACCEPTED_AUDIO = '.mp3,.m4a,.ogg,.wav,.flac,.aac,.webm';

const SFX_PREVIEWS = [
    { label: 'CLICK',    fn: () => import('../../lib/soundEffects').then(m => m.playClick()) },
    { label: 'CALLBACK', fn: () => import('../../lib/soundEffects').then(m => m.playCallback()) },
    { label: 'LOADING',  fn: () => import('../../lib/soundEffects').then(m => m.playEnter()) },
    { label: 'AUTHED',   fn: () => import('../../lib/soundEffects').then(m => m.playAuthed()) },
    { label: 'TUNNEL',   fn: () => import('../../lib/soundEffects').then(m => m.playTunnel()) },
];

export const AudioSection = () => {
    const {
        musicEnabled, musicVolume, musicTrackId, musicLibrary, musicPlaying,
        sfxEnabled, sfxVolume,
        setMusicEnabled, setMusicVolume, setMusicTrackId, setMusicPlaying,
        addMusicLibraryEntry, removeMusicLibraryEntry,
        setSfxEnabled, setSfxVolume,
    } = useAppStore();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const currentTrackName = musicLibrary.find(t => t.id === musicTrackId)?.name ?? null;

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setUploading(true);
        try {
            const { saveTrack } = await import('../../lib/musicDB');
            for (const file of Array.from(files)) {
                const id = `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const name = file.name.replace(/\.[^.]+$/, '');
                await saveTrack({ id, name, blob: file, mimeType: file.type });
                addMusicLibraryEntry({ id, name });
                if (!musicTrackId) {
                    setMusicTrackId(id);
                    if (musicEnabled) setMusicPlaying(true);
                }
            }
        } catch (err) {
            console.error('Failed to upload music:', err);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const { deleteTrack } = await import('../../lib/musicDB');
            await deleteTrack(id);
            removeMusicLibraryEntry(id);
        } catch (err) {
            console.error('Failed to delete track:', err);
        }
    };

    return (
        <div className="space-y-3">

            {/* ─────────────── BACKGROUND MUSIC */}
            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-2 pb-1 border-b border-white/5">BACKGROUND MUSIC</div>

            <div className="bg-black/40 border border-white/10 p-4 flex items-center justify-between gap-4 hover:border-white/20 transition-colors">
                <div className="flex items-center gap-4">
                    <div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0">
                        {musicEnabled && musicPlaying && currentTrackName
                            ? <Music2 size={17} className="text-signal animate-pulse" />
                            : <Music2 size={17} className="text-gray-400" />}
                    </div>
                    <div>
                        <div className="text-sm font-medium text-white">Background Music</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                            {!musicEnabled
                                ? 'Disabled'
                                : !currentTrackName
                                    ? 'No track selected'
                                    : musicPlaying
                                        ? `▶ Playing — ${currentTrackName}`
                                        : `⏸ Paused — ${currentTrackName}`}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    {musicEnabled && currentTrackName && (
                        <button onClick={() => setMusicPlaying(!musicPlaying)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-signal/30 text-signal hover:bg-signal/10 transition-colors text-xs font-mono">
                            {musicPlaying ? <><Pause size={12}/>PAUSE</> : <><Play size={12}/>PLAY</>}
                        </button>
                    )}
                    <button onClick={() => setMusicEnabled(!musicEnabled)}
                        className={cn('relative w-11 h-5 rounded-sm transition-colors shrink-0', musicEnabled ? 'bg-signal/40' : 'bg-gray-700')}>
                        <div className={cn('absolute top-0.5 w-4 h-4 bg-white transition-all rounded-sm', musicEnabled ? 'left-6' : 'left-0.5')} />
                    </button>
                </div>
            </div>

            <SliderRow icon={Volume2} title="Music Volume" description="Background music playback volume"
                value={musicVolume} onChange={setMusicVolume}
                fmt={v => `${Math.round(v * 100)}%`} />

            <div className="bg-black/40 border border-white/10 p-4 hover:border-white/20 transition-colors">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-4">
                        <div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0"><Disc3 size={17} className="text-gray-400" /></div>
                        <div>
                            <div className="text-sm font-medium text-white">Music Library</div>
                            <div className="text-xs text-gray-500 mt-0.5">Upload and manage background music tracks</div>
                        </div>
                    </div>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-signal/30 text-signal hover:bg-signal/10 transition-colors text-xs font-mono disabled:opacity-50">
                        <Upload size={12} />
                        {uploading ? 'UPLOADING...' : 'UPLOAD'}
                    </button>
                    <input ref={fileInputRef} type="file" accept={ACCEPTED_AUDIO} multiple
                        onChange={handleUpload} className="hidden" />
                </div>

                {musicLibrary.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-white/10">
                        <Music2 size={24} className="mx-auto text-gray-600 mb-2" />
                        <div className="text-xs text-gray-500 font-mono">NO TRACKS UPLOADED</div>
                        <div className="text-[10px] text-gray-600 mt-1">Click UPLOAD to add music files</div>
                    </div>
                ) : (
                    <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                        {musicLibrary.map(track => {
                            const active = musicTrackId === track.id;
                            return (
                                <div key={track.id}
                                    className={cn(
                                        'flex items-center justify-between px-3 py-2.5 border transition-colors group',
                                        active
                                            ? 'border-signal/60 bg-signal/10'
                                            : 'border-white/10 hover:border-white/20'
                                    )}>
                                    <button
                                        onClick={() => { setMusicTrackId(track.id); if (musicEnabled) setMusicPlaying(true); }}
                                        className="flex items-center gap-3 flex-1 min-w-0 text-left">
                                        {active && musicPlaying ? (
                                            <div className="flex gap-[3px] h-3 items-end shrink-0">
                                                {[1, 1.5, 0.8, 1.3].map((d, i) => (
                                                    <div key={i} className="w-[3px] rounded-sm bg-signal"
                                                        style={{ height: i % 2 === 0 ? '100%' : '60%',
                                                            animation: `pulse ${d}s ease-in-out infinite`, opacity: 0.8 }} />
                                                ))}
                                            </div>
                                        ) : (
                                            <Play size={12} className={active ? 'text-signal shrink-0' : 'text-gray-500 shrink-0'} />
                                        )}
                                        <span className={cn('font-mono text-xs truncate', active ? 'text-signal font-bold' : 'text-gray-400')}>
                                            {track.name}
                                        </span>
                                    </button>
                                    <button
                                        onClick={() => handleDelete(track.id)}
                                        className="p-1 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                                        title="Remove track">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ─────────────── SOUND EFFECTS */}
            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pt-4 pb-1 border-b border-white/5">SOUND EFFECTS (SFX)</div>

            <ToggleRow icon={Volume2} title="Sound Effects" description="UI click sounds, callback alerts, and other event sounds"
                value={sfxEnabled} onChange={setSfxEnabled} />

            <SliderRow icon={Volume2} title="SFX Volume" description="Master volume for all UI sound effects"
                value={sfxVolume} onChange={setSfxVolume}
                fmt={v => `${Math.round(v * 100)}%`} />

            <div className="bg-black/40 border border-white/10 p-4 hover:border-white/20 transition-colors">
                <div className="flex items-center gap-4 mb-3">
                    <div className="w-9 h-9 bg-white/5 flex items-center justify-center shrink-0"><Play size={17} className="text-gray-400" /></div>
                    <div><div className="text-sm font-medium text-white">Preview Sounds</div><div className="text-xs text-gray-500 mt-0.5">Click to test each sound effect at current volume</div></div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {SFX_PREVIEWS.map(sfx => (
                        <button key={sfx.label}
                            disabled={!sfxEnabled}
                            onClick={() => sfx.fn()}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-1.5 border text-[11px] font-mono uppercase tracking-wider transition-colors',
                                sfxEnabled
                                    ? 'border-white/15 text-gray-400 hover:border-signal/40 hover:text-signal'
                                    : 'border-white/5 text-gray-700 cursor-not-allowed'
                            )}
                        >
                            <Play size={9} />{sfx.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
