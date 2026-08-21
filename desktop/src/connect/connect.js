'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  Connect window — the gate in front of the login screen.
//
//  §6's rule about derived state is load-bearing here: the title, the header
//  badge, the rail tone, the CTA and the footer all come out of one view()
//  call. Written as five separate conditionals they drift, and the operator
//  eventually sees "LINK ESTABLISHED" over a red rail.
// ═══════════════════════════════════════════════════════════════════════════

const STEPS = ['SERVER_REACHABLE', 'TLS_HANDSHAKE', 'MYTHIC_ENDPOINT'];

const $ = (id) => document.getElementById(id);

const el = {
    form: $('link-form'),
    address: $('mythic-address'),
    toggleTLS: $('toggle-tls'),
    toggleAssets: $('toggle-assets'),
    toggleMsf: $('toggle-msf'),
    msfFields: $('msf-fields'),
    msfAddress: $('msf-address'),
    msfUser: $('msf-user'),
    msfPassword: $('msf-password'),
    msfHint: $('msf-hint'),
    checklist: $('checklist'),
    railFill: $('rail-fill'),
    railStep: $('rail-step'),
    detail: $('detail-line'),
    cta: $('cta'),
    ctaLabel: $('cta-label'),
    title: $('panel-title'),
    subtitle: $('panel-subtitle'),
    badge: $('panel-badge'),
    footerState: $('footer-state'),
    chromeNode: $('chrome-node'),
    chromeDot: $('chrome-dot'),
    chromeState: $('chrome-state'),
    chromePort: $('chrome-port'),
    chromeScheme: $('chrome-scheme'),
    chromeClock: $('chrome-clock'),
    chromeBuild: $('chrome-build'),
};

/** phase: idle | checking | ready | failed | connecting */
const state = { phase: 'idle', done: 0, fingerprint: null, message: '', messageTone: '' };

// ── One derivation, five readouts ──────────────────────────────────────────

function view() {
    switch (state.phase) {
        case 'checking':
            return { title: 'VERIFYING LINK', subtitle: 'PROBING TARGET BEFORE AUTHENTICATION',
                     badge: 'CHECKING', badgeTone: 'busy', cta: 'VERIFYING', busy: true,
                     disabled: true, footer: 'PROBING', dot: 'busy', railFail: false };
        case 'ready':
            return { title: 'LINK ESTABLISHED', subtitle: 'TARGET ANSWERS — READY TO AUTHENTICATE',
                     badge: 'READY', badgeTone: '', cta: 'ENTER CONSOLE', busy: false,
                     disabled: false, footer: 'READY', dot: 'live', railFail: false };
        case 'failed':
            return { title: 'LINK REJECTED', subtitle: 'TARGET DID NOT ANSWER',
                     badge: 'DENIED', badgeTone: 'fail', cta: 'RETRY', busy: false,
                     disabled: false, footer: 'NO LINK', dot: 'fail', railFail: true };
        case 'connecting':
            return { title: 'OPENING CONSOLE', subtitle: 'HANDING OFF TO THE OPERATOR CONSOLE',
                     badge: 'LINKING', badgeTone: 'busy', cta: 'OPENING CONSOLE', busy: true,
                     disabled: true, footer: 'HANDOFF', dot: 'busy', railFail: false };
        default:
            return { title: 'ESTABLISH LINK', subtitle: 'TARGET REQUIRED BEFORE AUTHENTICATION',
                     badge: 'STANDBY', badgeTone: '', cta: 'VERIFY LINK', busy: false,
                     disabled: false, footer: 'NO LINK', dot: '', railFail: false };
    }
}

function render() {
    const v = view();

    el.title.textContent = v.title;
    el.subtitle.textContent = v.subtitle;
    el.badge.textContent = v.badge;
    el.badge.className = `badge ${v.badgeTone}`;
    el.footerState.textContent = v.footer;

    el.ctaLabel.textContent = v.cta;
    el.cta.disabled = v.disabled;
    el.cta.className = `cta ${v.busy ? 'busy' : ''}`;

    el.chromeDot.className = `dot ${v.dot}`;
    el.chromeState.textContent = v.footer;

    const pct = Math.round((state.done / STEPS.length) * 100);
    el.railFill.style.width = `${pct}%`;
    el.railFill.className = `rail-fill ${v.railFail ? 'fail' : ''}`;
    el.railStep.textContent = `STEP ${state.done} / ${STEPS.length}`;

    el.detail.textContent = state.message;
    el.detail.className = `detail ${state.messageTone}`;
}

// ── Checklist ──────────────────────────────────────────────────────────────

function setStep(id, status, detail) {
    const row = el.checklist.querySelector(`[data-step="${id}"] .ck-status`);
    if (!row) return;
    row.textContent = status;
    row.className = `ck-status ${status.toLowerCase().replace('/', '')}`;
    if (detail) {
        state.message = `${id}: ${detail}`;
        state.messageTone = status === 'FAIL' ? 'fail' : '';
    }
}

function resetChecklist() {
    for (const id of STEPS) setStep(id, 'PENDING');
    state.done = 0;
    state.fingerprint = null;
    state.message = '';
    state.messageTone = '';
}

// ── Chrome readouts ────────────────────────────────────────────────────────

function updateChromeFromAddress(raw) {
    const text = String(raw || '').trim();
    if (!text) {
        el.chromeNode.textContent = 'NODE —';
        el.chromePort.textContent = 'PORT —';
        return;
    }
    try {
        const parsed = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
        el.chromeNode.textContent = `NODE ${parsed.hostname}`;
        el.chromePort.textContent = `PORT ${parsed.port || (parsed.protocol === 'https:' ? '7443' : '80')}`;
        el.chromeScheme.textContent = parsed.protocol === 'https:' ? 'HTTPS' : 'HTTP';
    } catch {
        el.chromeNode.textContent = `NODE ${text}`;
    }
}

function startClock() {
    const tick = () => {
        const now = new Date();
        el.chromeClock.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()]
            .map((n) => String(n).padStart(2, '0'))
            .join(':');
    };
    tick();
    setInterval(tick, 1000);
}

// ── Toggles ────────────────────────────────────────────────────────────────

const isOn = (button) => button.getAttribute('aria-pressed') === 'true';

function setToggle(button, on) {
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function wireToggle(button, onChange) {
    button.addEventListener('click', () => {
        setToggle(button, !isOn(button));
        if (onChange) onChange(isOn(button));
    });
}

// ── Draft ──────────────────────────────────────────────────────────────────

function draft() {
    return {
        mythicAddress: el.address.value,
        insecureTLS: isOn(el.toggleTLS),
        allowRemoteAssets: isOn(el.toggleAssets),
        msf: {
            enabled: isOn(el.toggleMsf),
            address: el.msfAddress.value,
            user: el.msfUser.value,
            password: el.msfPassword.value,
        },
    };
}

// ── Actions ────────────────────────────────────────────────────────────────

async function verify() {
    state.phase = 'checking';
    resetChecklist();
    render();

    setStep(STEPS[0], 'CHECKING');
    render();

    const result = await window.minerva.preflight(draft(), (step) => {
        setStep(step.id, step.status, step.detail);
        if (step.status !== 'FAIL') {
            state.done = Math.min(STEPS.length, STEPS.indexOf(step.id) + 1);
            const next = STEPS[STEPS.indexOf(step.id) + 1];
            if (next) setStep(next, 'CHECKING');
        }
        render();
    });

    if (result && result.ok) {
        state.phase = 'ready';
        state.done = STEPS.length;
        state.fingerprint = result.fingerprint || null;
        state.message = state.fingerprint
            ? `SHA256 ${state.fingerprint}`
            : `TARGET ${result.mythicAddress}`;
        state.messageTone = 'ok';
        if (result.mythicAddress) {
            el.address.value = result.mythicAddress;
            updateChromeFromAddress(result.mythicAddress);
        }
    } else {
        state.phase = 'failed';
        if (result && result.error) {
            state.message = result.error;
            state.messageTone = 'fail';
        }
    }
    render();
}

async function enterConsole() {
    state.phase = 'connecting';
    render();

    const result = await window.minerva.connect(draft());
    if (!result || !result.ok) {
        state.phase = 'failed';
        state.message = (result && result.error) || 'Could not open the console';
        state.messageTone = 'fail';
        render();
    }
    // On success the main process closes this window; nothing to do here.
}

// ── Boot ───────────────────────────────────────────────────────────────────

async function boot() {
    startClock();
    drawBackdrop();

    const cfg = await window.minerva.config();

    el.address.value = cfg.mythicAddress || '';
    setToggle(el.toggleTLS, cfg.insecureTLS !== false);
    setToggle(el.toggleAssets, cfg.allowRemoteAssets === true);
    setToggle(el.toggleMsf, cfg.msf.enabled === true);
    el.msfFields.hidden = !cfg.msf.enabled;
    el.msfAddress.value = cfg.msf.address || '';
    el.msfUser.value = cfg.msf.user || 'msf';
    if (cfg.msf.hasPassword) {
        el.msfPassword.placeholder = '•••••• STORED';
        el.msfHint.textContent = 'LEAVE BLANK TO KEEP THE STORED CREDENTIAL';
    }

    el.chromeBuild.textContent = `BUILD ${cfg.version}`;
    updateChromeFromAddress(cfg.mythicAddress);

    // Only auto-probe a target this console has reached before. On a first run
    // the operator has not said where Mythic is yet, and probing the default
    // would fill the checklist with failures they did not ask for.
    if (cfg.lastConnectedAt) verify();
    else render();

    el.address.focus();
    el.address.select();
}

wireToggle(el.toggleTLS);
wireToggle(el.toggleAssets);
wireToggle(el.toggleMsf, (on) => {
    el.msfFields.hidden = !on;
});

// Any edit to the target invalidates a passing verification — otherwise the
// CTA would still read ENTER CONSOLE for an address that was never probed.
for (const input of [el.address, el.msfAddress, el.msfUser, el.msfPassword]) {
    input.addEventListener('input', () => {
        if (input === el.address) updateChromeFromAddress(el.address.value);
        if (state.phase === 'ready' || state.phase === 'failed') {
            state.phase = 'idle';
            resetChecklist();
            render();
        }
    });
}

el.form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.phase === 'ready') enterConsole();
    else if (state.phase !== 'checking' && state.phase !== 'connecting') verify();
});

// ── Backdrop ───────────────────────────────────────────────────────────────
//
//  Live glass for the panel to sample. The grid and calibration marks are
//  hud-field, the sweep is hud-trace — the same division of labour as the
//  console's login backdrop: substrate in red, instrumentation in blue.

function drawBackdrop() {
    const canvas = document.getElementById('backdrop');
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;

    const resize = () => {
        const ratio = window.devicePixelRatio || 1;
        width = canvas.clientWidth;
        height = canvas.clientHeight;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const CELL = 48;

    const paint = (sweepY) => {
        ctx.clearRect(0, 0, width, height);

        ctx.strokeStyle = 'rgba(255, 58, 52, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= width; x += CELL) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, height); }
        for (let y = 0; y <= height; y += CELL) { ctx.moveTo(0, y + 0.5); ctx.lineTo(width, y + 0.5); }
        ctx.stroke();

        // Calibration crosses on every fourth intersection.
        ctx.strokeStyle = 'rgba(255, 58, 52, 0.18)';
        ctx.beginPath();
        for (let x = CELL * 2; x <= width; x += CELL * 4) {
            for (let y = CELL * 2; y <= height; y += CELL * 4) {
                ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y);
                ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
            }
        }
        ctx.stroke();

        if (sweepY !== null) {
            const gradient = ctx.createLinearGradient(0, sweepY - 90, 0, sweepY);
            gradient.addColorStop(0, 'rgba(132, 217, 255, 0)');
            gradient.addColorStop(1, 'rgba(132, 217, 255, 0.10)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, sweepY - 90, width, 90);

            ctx.strokeStyle = 'rgba(132, 217, 255, 0.28)';
            ctx.beginPath();
            ctx.moveTo(0, sweepY + 0.5);
            ctx.lineTo(width, sweepY + 0.5);
            ctx.stroke();
        }
    };

    if (reduced) {
        paint(null);
        window.addEventListener('resize', () => paint(null));
        return;
    }

    let sweep = 0;
    const frame = () => {
        sweep = (sweep + 1.1) % (height + 180);
        paint(sweep);
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}

boot();
