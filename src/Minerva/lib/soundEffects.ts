import { useAppStore } from '../store';

const clickSfx = process.env.PUBLIC_URL + '/audio/click.mp3';
const callbackSfx = process.env.PUBLIC_URL + '/audio/callback.mp3';
const enterSfx = process.env.PUBLIC_URL + '/audio/loading.wav';
const authedSfx = process.env.PUBLIC_URL + '/audio/authed.mp3';
const tunnelSfx = process.env.PUBLIC_URL + '/audio/tunnel.mp3';
const notificationSfx = process.env.PUBLIC_URL + '/audio/notification.wav';
const threeLoadSfx = process.env.PUBLIC_URL + '/audio/3dloading.mp3';
const selectQHSfx = process.env.PUBLIC_URL + '/audio/selectQH.wav';
const doneQHSfx = process.env.PUBLIC_URL + '/audio/doneQH.mp3';

// Lazy singletons
let clickAudio:    HTMLAudioElement | null = null;
let callbackAudio: HTMLAudioElement | null = null;
let enterAudio:    HTMLAudioElement | null = null;
let authedAudio:   HTMLAudioElement | null = null;
let tunnelAudio:   HTMLAudioElement | null = null;
let notificationAudio: HTMLAudioElement | null = null;
let threeLoadAudio: HTMLAudioElement | null = null;

const sfxState = () => {
    const s = useAppStore.getState();
    return { enabled: s.sfxEnabled, volume: s.sfxVolume };
};

function getClickAudio():    HTMLAudioElement { if (!clickAudio)    { clickAudio    = new Audio(clickSfx);    } return clickAudio;    }
function getCallbackAudio(): HTMLAudioElement { if (!callbackAudio) { callbackAudio = new Audio(callbackSfx); } return callbackAudio; }
function getEnterAudio():    HTMLAudioElement { if (!enterAudio)    { enterAudio    = new Audio(enterSfx);    } return enterAudio;    }
function getAuthedAudio():   HTMLAudioElement { if (!authedAudio)   { authedAudio   = new Audio(authedSfx);   } return authedAudio;   }
function getTunnelAudio():   HTMLAudioElement { if (!tunnelAudio)   { tunnelAudio   = new Audio(tunnelSfx);   } return tunnelAudio;   }
function getNotificationAudio(): HTMLAudioElement { if (!notificationAudio) { notificationAudio = new Audio(notificationSfx); } return notificationAudio; }
function getThreeLoadAudio():    HTMLAudioElement { if (!threeLoadAudio)    { threeLoadAudio    = new Audio(threeLoadSfx);    } return threeLoadAudio;    }

// Base volumes (before sfxVolume scaling)
const BASE_VOL: Record<string, number> = {
    click:    0.2,
    callback: 0.5,
    enter:    0.4,
    authed:   1.0,
    tunnel:       0.4,
    notification: 0.5,
    threeLoad:    0.5,
    selectQH:     0.5,
    doneQH:       0.5,
};

function play(audio: HTMLAudioElement, baseVol: number): void {
    const { enabled, volume } = sfxState();
    if (!enabled) return;
    try {
        audio.volume = Math.min(1, baseVol * volume * 2); // sfxVolume 0.5 = nominal
        audio.currentTime = 0;
        audio.play().catch((e) => { console.warn('[SFX] play failed:', audio.src, e); });
    } catch (e) { console.warn('[SFX] error:', e); }
}

export function playClick(): void    { play(getClickAudio(),    BASE_VOL.click);    }
export function playCallback(): void { play(getCallbackAudio(), BASE_VOL.callback); }
export function playEnter(): void    { play(getEnterAudio(),    BASE_VOL.enter);    }
export function playTunnel(): void       { play(getTunnelAudio(),       BASE_VOL.tunnel);       }
export function playNotification(): void { play(getNotificationAudio(), BASE_VOL.notification); }
export function playThreeLoad(): void    { play(getThreeLoadAudio(),    BASE_VOL.threeLoad);    }
function playOneShot(src: string, baseVol: number): void {
    const { enabled, volume } = sfxState();
    if (!enabled) return;
    try {
        const audio = new Audio(src);
        audio.volume = Math.min(1, baseVol * volume * 2);
        audio.play().catch(() => {});
    } catch {}
}
export function playSelectQH(): void { playOneShot(selectQHSfx, BASE_VOL.selectQH); }
export function playDoneQH(): void   { playOneShot(doneQHSfx, BASE_VOL.doneQH); }

export function playAuthed(): Promise<void> {
    return new Promise((resolve) => {
        const { enabled, volume } = sfxState();
        if (!enabled) { resolve(); return; }
        try {
            const audio = getAuthedAudio();
            audio.volume = Math.min(1, BASE_VOL.authed * volume * 2);
            audio.currentTime = 0;
            const onEnd = () => { audio.removeEventListener('ended', onEnd); audio.removeEventListener('error', onEnd); resolve(); };
            audio.addEventListener('ended', onEnd);
            audio.addEventListener('error', onEnd);
            audio.play().catch(() => resolve());
        } catch { resolve(); }
    });
}
