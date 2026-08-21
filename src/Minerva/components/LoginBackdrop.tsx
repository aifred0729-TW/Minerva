import React, { useEffect, useRef } from 'react';
import { getServerHostname, serverHostnameFallback } from '../lib/serverInfo';

/**
 * LoginBackdrop — a military tactical display panel behind the login view.
 *
 * Modelled on /opt/Ref/loginbackground.gif.
 *
 * THE GLASS
 *  - The camera is FIXED. One continuous sheet of glass at a constant tilt.
 *    Everything on it is coplanar and shares one grid origin, so the reticle
 *    renders as an ellipse. Nothing on the panel ever gets its own rotation —
 *    a second angle would split the glass into separate planes.
 *  - Two pixel layers: a fine cell layer, and a coarse layer whose cells are
 *    an exact multiple of the fine pitch, so coarse blocks read as groups of
 *    fine pixels rather than a separate grid.
 *  - A scan band sweeps the panel, brightening whatever it crosses.
 *  - The `+` registration lattice is on the viewer's side of the glass:
 *    screen-space, and completely static.
 *
 * THE ACQUISITION CYCLE (see TIMELINE)
 *  1. TRAVEL   — the reticle is in its small travel form and slides to a new
 *                position. The main line is a bare hairline.
 *  2. GROW     — the reticle overshoots past its focus size...
 *  3. SETTLE   — ...then eases back down to it. The settle is what sells the
 *                lock; a plain expansion just reads as a size change.
 *  4. NUMBERS  — channel IDs fade in where each secondary line meets the ring.
 *  5. RIPPLE   — the ring turns a few degrees and emits three slow, staggered
 *                rings outward.
 *  6. SCAN     — two X and two Y rules slide in from off-panel and close on
 *                the rectangle around the reticle. This is how the panel
 *                focuses: converging rules, never brackets drawn in place.
 *  7. MAIN     — the main line unfolds from a hairline into a wide corridor.
 *  8. TRI      — triangle icons pop in at the corridor's corners, each with an
 *                ID and info block at its lower right.
 *  9. HOLD, then everything retracts and the cycle repeats on the next target.
 *
 * THE SCREEN REFRESH (see RF) runs on its own longer, deliberately unrelated
 * period, so the two cycles drift against each other instead of locking up. It
 * is a resolution ladder, not a cut:
 *
 *  1. WAVE  — a swell travels through the pixels and the field's phase is
 *             RAMPED to its next value underneath it, so the image churns and
 *             re-forms. Stepping the phase instead would replace the picture in
 *             one frame, which is exactly what reads as a power cut.
 *  2. MID   — mega blocks split into mid blocks, block by block.
 *  3. FULL  — mid blocks split into full cells, block by block, so you watch
 *             big squares be composed out of small ones.
 *  4. RESOLVE — only then does the fine pixel layer fade back in.
 *
 * The descent is the mirror of the climb and the long hold sits after it, so
 * the loop point falls in the middle of the steady state and is invisible.
 *
 * THE TRANSITION HAS NO SHAPE. Rungs are not clipped into bands behind a moving
 * front: a front is a curve, and a curve sweeping the panel is plainly visible
 * as one even when it is not stroked. Instead every block owns a noise
 * threshold and flips rung when the ladder progress crosses it, so the only
 * edges on screen are the edges of squares.
 *
 * Brightness is invariant across rungs because a coarsened block carries the
 * average of the cells it replaces, and because the missing fine layer is
 * compensated with a second pass. Changing pixel size must never read as the
 * panel dimming.
 *
 * Re-coloured into Minerva's locked palette: void black, `signal` hairlines,
 * `accent` for anything live. The reference's crimson field and amber routes
 * are deliberately not carried over — red and amber are reserved for
 * dead/destructive and validation states.
 *
 * PERFORMANCE CONTRACT — this sits behind a login form, never in front of the
 * user's real work, so it must leave video decode alone:
 *  - The fine pixel layer is one repeating pattern fill. The coarse layer is a
 *    ~60x42 bitmap repainted per frame and blitted up, so animating every cell
 *    costs a few thousand typed-array writes and two draw calls.
 *  - No full-canvas gradient fills; vignette and scanlines are CSS overlays.
 *  - Runs at FPS_CAP whether or not the window is focused; only a hidden tab
 *    stops it, since nothing is composited then anyway.
 */

/**
 * Three-colour scheme, matching the reference: a red field, yellow routing, and
 * pale blue instrumentation.
 *
 * Defined in DESIGN_LANGUAGE.md §1「登入畫面 HUD 色系」. These are FALLBACKS. The live values come from --color-hud-* in index.css,
 * which the login panel also consumes through Tailwind tokens — one source of
 * truth, so the panel and the artwork behind it cannot drift apart.
 */
type RGB = [number, number, number];

const PALETTE = {
    /** Bright red — the screen substrate. */
    field: [255, 58, 52] as RGB,
    /** Bright yellow — routing and its labels. */
    route: [255, 201, 46] as RGB,
    /** Pale blue — reticle, rings, scan lines, secondary lines. */
    trace: [132, 217, 255] as RGB,
};

const FPS_CAP = 60;
/** Longest hostname the callout will try to typeset. See buildCallouts. */
const MAX_HOST_CHARS = 64;
const DPR_CAP = 1.5;

/** Constant panel tilt. Applied to every on-panel element, never animated. */
const PANEL = { rot: -0.14, shear: 0.14, squash: 0.86 };

/** Two pixel layers. COARSE must stay an exact multiple of FINE. */
const FINE = 16;
const COARSE = FINE * 4;
const PLANE_X = 1900;
const PLANE_Y = 1300;

/** Scan band sweeping the glass. */
const SWEEP_PERIOD = 7.5;
const BAND = 320;
const SWEEP_TRAVEL = 2 * PLANE_Y + BAND;

/**
 * Main lines. All of them are FIXED in panel space and all of them are always
 * on screen; the acquisition cycle only changes which one is focused. An
 * unfocused main line renders in the same thin style as a secondary line and
 * does not move — nothing here is ever repositioned, only restyled.
 *
 * `focus` is where the reticle parks for that line, and doubles as the lock
 * rectangle. `pts` interior vertices carry the corner callouts, so a line needs
 * exactly `pts.length - 2` entries in `corners`.
 */
const MAIN_LINES: {
    pts: [number, number][];
    focus: { x: number; y: number; w: number; h: number };
    /** The two endpoint tags a focused line carries; traffic runs between them. */
    ends: [string, string];
    /** Designation shown under the host name while this line is locked. */
    seg: string;
    corners: { id: string; l1: string; l2: string }[];
}[] = [
    {
        pts: [[-2100, -900], [-330, -120], [-30, 20], [420, 90], [2100, 620]],
        focus: { x: -30, y: 20, w: 560, h: 390 },
        ends: ['MVX.C201', 'IDN.CC03'] as [string, string],
        seg: 'SEG 04-1    CH 06',
        corners: [
            { id: 'IDN.CC01', l1: 'OPER. COOP', l2: 'BAT. 22-9/' },
            { id: 'IDN.CC02', l1: 'RELAY. 04', l2: 'SEG. 11-2/' },
            { id: 'IDN.CC03', l1: 'EDGE. 12', l2: 'SEG. 04-1/' },
        ],
    },
    {
        pts: [[-2100, -1150], [120, -420], [470, -230], [980, -110], [2100, 200]],
        focus: { x: 470, y: -230, w: 400, h: 300 },
        ends: ['MVX.D118', 'IDN.CD09'] as [string, string],
        seg: 'SEG 19-3    CH 02',
        corners: [
            { id: 'IDN.CD07', l1: 'NODE. 07', l2: 'SEG. 19-3/' },
            { id: 'IDN.CD08', l1: 'OPER. LINK', l2: 'BAT. 31-2/' },
            { id: 'IDN.CD09', l1: 'EDGE. 02', l2: 'SEG. 08-6/' },
        ],
    },
    {
        pts: [[-2100, 90], [-900, 225], [-520, 280], [-40, 430], [2100, 1180]],
        focus: { x: -520, y: 280, w: 470, h: 340 },
        ends: ['MVX.E440', 'IDN.CE23'] as [string, string],
        seg: 'SEG 11-2    CH 09',
        corners: [
            { id: 'IDN.CE21', l1: 'RELAY. 11', l2: 'SEG. 02-4/' },
            { id: 'IDN.CE22', l1: 'COOP.', l2: 'BAT. 23-7/' },
            { id: 'IDN.CE23', l1: 'NODE. 15', l2: 'SEG. 27-1/' },
        ],
    },
    {
        pts: [[-2100, 1220], [-330, 530], [210, 380], [730, 290], [2100, 40]],
        focus: { x: 210, y: 380, w: 360, h: 420 },
        ends: ['MVX.F026', 'IDN.CF06'] as [string, string],
        seg: 'SEG 33-2    CH 04',
        corners: [
            { id: 'IDN.CF04', l1: 'OPER. HOLD', l2: 'BAT. 12-8/' },
            { id: 'IDN.CF05', l1: 'EDGE. 19', l2: 'SEG. 33-2/' },
            { id: 'IDN.CF06', l1: 'RELAY. 06', l2: 'SEG. 05-9/' },
        ],
    },
    {
        pts: [[-2100, -640], [-820, -395], [-330, -310], [300, -190], [2100, 90]],
        focus: { x: -330, y: -310, w: 520, h: 300 },
        ends: ['MVX.G713', 'IDN.CG15'] as [string, string],
        seg: 'SEG 14-5    CH 11',
        corners: [
            { id: 'IDN.CG13', l1: 'NODE. 22', l2: 'SEG. 14-5/' },
            { id: 'IDN.CG14', l1: 'COOP. LINK', l2: 'BAT. 09-3/' },
            { id: 'IDN.CG15', l1: 'OPER. 08', l2: 'SEG. 41-7/' },
        ],
    },
];

/** Acquisition timeline, in seconds from the start of each cycle. */
const TIMELINE = {
    travel: [0.0, 1.6],
    grow: [1.6, 0.55],
    settle: [2.15, 0.45],
    numbers: [2.35, 0.5],
    ripple: [2.9, 2.4],
    scan: [3.6, 1.2],
    main: [4.9, 0.9],
    tri: [5.8, 0.8],
    retract: [9.0, 0.9],
} as const;
const CYCLE = 10.4;

const R_TRAVEL = 30;   // reticle radius while moving
const R_PEAK = 74;   // overshoot at the end of the expansion
const R_FOCUS = 58;   // settled radius once locked

/**
 * Screen refresh. The whole panel is disturbed, repaints itself at coarse
 * resolution behind a travelling render edge, then resolves into fine pixels.
 * The coarse guides exist only while that pass is running.
 */
const REFRESH = 18.0;
/**
 * The ladder runs DOWN and back UP, and the long hold sits at the end. That
 * ordering is what makes the loop seamless: refreshPos wraps in the middle of
 * the hold, so the sequence a viewer actually perceives is
 * steady -> slowly coarsen -> churn -> slowly rebuild -> steady. Building only,
 * with no descent, forces the cycle to snap back to blocks at the loop point.
 *
 * Windows are deliberately long. Coarsening is the slowest beat of all — it is
 * the one the eye follows into the disturbance.
 */
const RF = {
    /** Fine detail drops out first, before the blocks start merging. */
    fineOut: [0.00, 1.20],
    /** Full cells merge into mid blocks. */
    degradeFull: [0.40, 1.80],
    /** Mid blocks merge into mega blocks. */
    degradeMid: [1.40, 1.80],
    /** Swell + field phase morph, at the bottom of the ladder. */
    wave: [2.60, 2.00],
    /** Mega blocks break back down into mid blocks. */
    buildMid: [4.20, 1.80],
    /** Mid blocks resolve back to full cells. */
    buildFull: [5.20, 1.80],
    /** Only then does the fine pixel layer come back. */
    resolve: [7.00, 1.40],
} as const;
/** refreshPos below this is the descent, above it the climb. */
const RF_TURN = 3.90;

/** Resolution ladder used during a refresh. Each must divide the cell grid. */
const MEGA_DIV = 5;
const MID_DIV = 2;

/** How far a far anchor is allowed to wander. Deliberately tiny. */
const ANCHOR_DRIFT = 10;
/** Per-line anchor drift rates, mutually irrational-ish so they never sync up. */
const SEC_DRIFT_RATE = [0.083, 0.061, 0.097, 0.071, 0.055, 0.089];

/**
 * Secondary lines. Exactly ONE carries an elbow; the rest run straight, so the
 * bend reads as an exception rather than a style.
 *
 * Anchors are FIXED IN PANEL SPACE, not attached to the
 * reticle, so they stay put while the reticle travels; each only breathes
 * within +/-ANCHOR_DRIFT. The tip is placed on the ring every frame, aimed at
 * whatever the line heads for next, so it is welded to the circle and the
 * line's ANGLE is what changes as the reticle moves.
 *
 * NON-OVERLAP IS A HARD CONSTRAINT and these positions are solved, not
 * eyeballed. Straight segments sharing an endpoint cannot cross, so the risk
 * lives entirely in the two elbowed lines. The set was searched and then
 * checked exhaustively for pairwise segment intersection over every reticle
 * focus position crossed with the ring's R_TRAVEL..R_PEAK sweep and the drift
 * extremes — 315 combinations: minimum separation 15.4 plane units.
 *
 * Re-solve rather than hand-tune, and re-verify over that same product —
 * moving one anchor can open a crossing at a reticle position you were not
 * looking at.
 */
const SECONDARY: {
    anchor: [number, number];
    elbow: [number, number] | null;
    id: string;
    /**
     * Traffic riding the line. `u` is its start position along the path.
     *
     * BOTH TAGS ON A LINE MUST SHARE A SPEED. With different speeds the faster
     * one laps the slower one every 1/dSpeed seconds and the two 64px sprites
     * pass through each other at full opacity — measured on 32% of frames. A
     * shared speed makes their separation constant, and the offsets below keep
     * every pair at least 0.33 apart, well clear of a sprite width on even the
     * shortest line.
     */
    tags: { u: number; speed: number; route: boolean; label: string; sub: string }[];
}[] = [
    { anchor: [-1008, -501], elbow: null, id: '084', tags: [
        { u: 0.22, speed: 0.026, route: true, label: 'TB1', sub: 'AB' },
        { u: 0.72, speed: 0.026, route: false, label: '04F', sub: '' },
    ] },
    { anchor: [-528, -1309], elbow: [-220, -822], id: '090', tags: [
        { u: 0.33, speed: 0.021, route: false, label: '11A', sub: '' },
        { u: 0.83, speed: 0.021, route: true, label: 'CD2', sub: 'RX' },
    ] },
    { anchor: [886, -469], elbow: null, id: '888', tags: [
        { u: 0.15, speed: 0.029, route: false, label: '09C', sub: '' },
        { u: 0.65, speed: 0.029, route: true, label: 'SL8', sub: '01' },
    ] },
    { anchor: [880, 544], elbow: null, id: '036', tags: [
        { u: 0.37, speed: 0.023, route: true, label: 'EG7', sub: 'TX' },
        { u: 0.87, speed: 0.023, route: false, label: '22B', sub: '' },
    ] },
    { anchor: [15, 1152], elbow: null, id: '880', tags: [
        { u: 0.26, speed: 0.031, route: false, label: '17D', sub: '' },
        { u: 0.76, speed: 0.031, route: true, label: 'NR4', sub: 'AB' },
    ] },
    { anchor: [-1022, 874], elbow: null, id: '012', tags: [
        { u: 0.44, speed: 0.019, route: true, label: 'RL6', sub: 'QX' },
        { u: 0.94, speed: 0.019, route: false, label: '31E', sub: '' },
    ] },
];

const MASSES = [
    { x: 0.22, y: 0.30, r: 0.52, accent: false, a: 0.075 },
    { x: 0.78, y: 0.58, r: 0.58, accent: false, a: 0.060 },
    { x: 0.52, y: 0.16, r: 0.36, accent: true, a: 0.042 },
    { x: 0.14, y: 0.82, r: 0.42, accent: false, a: 0.050 },
    { x: 0.88, y: 0.20, r: 0.34, accent: true, a: 0.030 },
    { x: 0.62, y: 0.86, r: 0.30, accent: false, a: 0.038 },
];

const readVar = (styles: CSSStyleDeclaration, name: string, fallback: RGB): RGB => {
    const raw = styles.getPropertyValue(name).trim();
    const parts = raw.split(/[\s,]+/).map(Number).filter(n => Number.isFinite(n));
    return parts.length === 3 ? (parts as RGB) : fallback;
};

const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

const hash = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
};

const makeSprite = (w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
};

/** Cells that light up across the whole glass, not only inside the lock. */
const ACTIVATIONS = Array.from({ length: 26 }, (_, i) => ({
    gx: Math.round((hash(i * 2.3) - 0.5) * 56),
    gy: Math.round((hash(i * 4.7) - 0.5) * 38),
    period: 3.2 + hash(i * 6.1) * 7.5,
    phase: hash(i * 8.9) * 10,
    accent: hash(i * 11.3) > 0.45,
}));

const DOTS = Array.from({ length: 52 }, (_, i) => ({
    x: (hash(i * 1.7) - 0.5) * 2 * PLANE_X,
    y: (hash(i * 3.9) - 0.5) * 2 * PLANE_Y,
    r: 0.7 + hash(i * 5.1) * 2.2,
    a: 0.10 + hash(i * 7.3) * 0.38,
    accent: hash(i * 9.5) > 0.78,
    flicker: hash(i * 13.1) > 0.55,
    phase: hash(i * 15.3) * 6.28,
    rate: 1.4 + hash(i * 17.9) * 4.2,
}));

/**
 * Memoised with no props: the login page re-renders on every keystroke, and
 * there is nothing here for React to reconcile that a re-render could change.
 */
const LoginBackdrop: React.FC = React.memo(function LoginBackdrop() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null;
        if (!ctx) return;

        const styles = getComputedStyle(document.documentElement);
        const VOID = readVar(styles, '--color-void', [0, 0, 0]);
        // FIELD: the screen substrate — tone map, graticule, registration marks.
        // ROUTE: the focused main line and everything labelling it.
        // TRACE: the HUD proper — reticle, rings, scan lines, secondary lines.
        const FIELD = readVar(styles, '--color-hud-field', PALETTE.field);
        const ROUTE = readVar(styles, '--color-hud-route', PALETTE.route);
        const TRACE = readVar(styles, '--color-hud-trace', PALETTE.trace);

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // ── Fine pixel layer, as one repeating pattern ───────────────────────
        // A tile of exactly COARSE-aligned fine cells, so the two layers stay
        // registered to the same origin no matter where the tile repeats.
        const TILE_CELLS = 24;                       // 24 fine cells per tile side
        const finePattern = (() => {
            const size = FINE * TILE_CELLS;
            const cv = makeSprite(size, size);
            const c = cv.getContext('2d')!;
            for (let i = 0; i < TILE_CELLS; i++) {
                for (let j = 0; j < TILE_CELLS; j++) {
                    const n = hash(i * 73 + j * 149);
                    if (n > 0.30) continue;
                    c.fillStyle = rgba(FIELD, 0.018 + hash(n * 41) * 0.045);
                    c.fillRect(i * FINE, j * FINE, FINE, FINE);
                }
            }
            c.strokeStyle = rgba(FIELD, 0.045);
            c.lineWidth = 1;
            c.beginPath();
            for (let i = 0; i <= TILE_CELLS; i++) {
                c.moveTo(i * FINE + 0.5, 0); c.lineTo(i * FINE + 0.5, size);
                c.moveTo(0, i * FINE + 0.5); c.lineTo(size, i * FINE + 0.5);
            }
            c.stroke();
            return ctx.createPattern(cv, 'repeat');
        })();

        // ── Coarse pixel layer, bucketed Path2D geometry ─────────────────────
        // Several variants, so each screen refresh resolves to a different
        // low-resolution pass rather than repainting the same thing.
        const C0 = -Math.ceil(PLANE_X / COARSE), C1 = Math.ceil(PLANE_X / COARSE);
        const R0 = -Math.ceil(PLANE_Y / COARSE), R1 = Math.ceil(PLANE_Y / COARSE);

        /**
         * The coarse layer is a low-resolution bitmap — one pixel per cell —
         * repainted every frame and blitted up with smoothing off.
         *
         * Two reasons it is a bitmap and not geometry. First, every cell always
         * carries a tone: nothing is ever an unpainted hole, so neighbours ramp
         * into each other instead of slamming against pure black, which is what
         * makes the field read as harmonious rather than as speckle. Second,
         * repainting a ~60×41 buffer is trivial, so the pixels can keep drifting
         * continuously instead of only changing on a refresh.
         *
         * Tone lives in RGB with a fixed low alpha, not in the alpha channel:
         * at these opacities an 8-bit alpha would only have a dozen usable steps
         * and the gradients would band.
         */
        const CCOLS = C1 - C0, CROWS = R1 - R0;
        // Exact extent the cells cover — the plane half-sizes are not whole
        // multiples of COARSE, so blitting to those would misalign the guides.
        const MAP_X = C0 * COARSE, MAP_Y = R0 * COARSE;
        const MAP_W = CCOLS * COARSE, MAP_H = CROWS * COARSE;
        // Of 255. Sized against the palette, not against white: the field red
        // carries ~0.39 of white's relative luminance, so tone written at the
        // alpha a white scheme wanted comes out about 2.5x too dim to read.
        const COARSE_ALPHA = 108;
        const coarseBuf = makeSprite(CCOLS, CROWS);
        const coarseBufCtx = coarseBuf.getContext('2d')!;
        const coarseImg = coarseBufCtx.createImageData(CCOLS, CROWS);

        /**
         * Resolution ladder, resolved PER BLOCK inside this one buffer.
         *
         * The transition must not have a shape. Clipping the panel into bands
         * behind a moving front — however the front is drawn — puts a geometric
         * edge on screen, and a curved front is plainly visible as a curve even
         * when it is not stroked. Instead each block carries its own threshold
         * and flips resolution when the ladder progress passes it, so the
         * boundary is made of scattered squares merging and splitting. There is
         * no front, so there is nothing to see a shape in.
         *
         * Thresholds are pure noise, with no spatial term at all: any smooth
         * spatial bias would reintroduce a directional edge in aggregate, which
         * is the thing being avoided.
         */
        const MEGA_COLS = Math.ceil(CCOLS / MEGA_DIV), MEGA_ROWS = Math.ceil(CROWS / MEGA_DIV);
        const MID_COLS = Math.ceil(CCOLS / MID_DIV), MID_ROWS = Math.ceil(CROWS / MID_DIV);
        // Hashed on (col, row), not on the flat index. A 1-D index walks the
        // sine hash in equal steps, which leaves neighbours measurably
        // correlated (~-0.18 horizontally) and gives the dissolve a faint
        // checkerboard grain. Two independent axes drop that under 0.05.
        const megaThr = new Float32Array(MEGA_COLS * MEGA_ROWS);
        const midThr = new Float32Array(MID_COLS * MID_ROWS);
        for (let j = 0; j < MEGA_ROWS; j++)
            for (let i = 0; i < MEGA_COLS; i++)
                megaThr[j * MEGA_COLS + i] = hash(i * 12.9898 + j * 78.233);
        for (let j = 0; j < MID_ROWS; j++)
            for (let i = 0; i < MID_COLS; i++)
                midThr[j * MID_COLS + i] = hash(i * 12.9898 + j * 78.233 + 4.7);

        // Block sums, rebuilt each frame. Averaging (not point sampling) is what
        // keeps a coarsened block at the same brightness as the cells it
        // replaces, so changing pixel size never dims the panel.
        const shadeBuf = new Float32Array(CCOLS * CROWS);
        const megaSum = new Float32Array(MEGA_COLS * MEGA_ROWS);
        const midSum = new Float32Array(MID_COLS * MID_ROWS);
        const megaCnt = new Uint16Array(MEGA_COLS * MEGA_ROWS);
        const midCnt = new Uint16Array(MID_COLS * MID_ROWS);
        for (let j = 0; j < CROWS; j++) {
            for (let i = 0; i < CCOLS; i++) {
                megaCnt[((j / MEGA_DIV) | 0) * MEGA_COLS + ((i / MEGA_DIV) | 0)]++;
                midCnt[((j / MID_DIV) | 0) * MID_COLS + ((i / MID_DIV) | 0)]++;
            }
        }

        // Static per-cell jitter breaks the field's contour lines without
        // destroying the neighbour-to-neighbour ramp; the accent mask decides
        // which cells tint green when the field peaks there.
        const jitter = new Float32Array(CCOLS * CROWS);
        const accentMask = new Uint8Array(CCOLS * CROWS);
        for (let p = 0; p < jitter.length; p++) {
            jitter[p] = (hash(p * 1.37) - 0.5) * 0.13;
            accentMask[p] = hash(p * 3.71) > 0.90 ? 1 : 0;
        }

        // Separable wave tables, so the field costs a few hundred trig calls per
        // frame instead of one per cell.
        const wi = [new Float32Array(CCOLS), new Float32Array(CCOLS), new Float32Array(CCOLS)];
        const wj = [new Float32Array(CROWS), new Float32Array(CROWS), new Float32Array(CROWS)];
        // Travelling swell. sin(ax + by - wt) is separable via the angle-sum
        // identity, so it stays four tables rather than a trig call per cell.
        const swI = new Float32Array(CCOLS), swIc = new Float32Array(CCOLS);
        const swJ = new Float32Array(CROWS), swJc = new Float32Array(CROWS);

        const paintCoarse = (t: number, seed: number, waveAmp: number, pMid: number, pFull: number) => {
            for (let i = 0; i < CCOLS; i++) {
                const x = i + C0;
                wi[0][i] = Math.sin(x * 0.13 + t * 0.11 + seed);
                wi[1][i] = Math.sin(x * 0.05 - t * 0.07 + seed * 2.3);
                wi[2][i] = Math.sin(x * 0.23 + t * 0.04 + seed * 0.7);
            }
            for (let j = 0; j < CROWS; j++) {
                const y = j + R0;
                wj[0][j] = Math.cos(y * 0.09 - t * 0.08 + seed * 1.7);
                wj[1][j] = Math.cos(y * 0.21 + t * 0.05 + seed * 3.1);
                wj[2][j] = Math.cos(y * 0.15 - t * 0.13 + seed * 0.4);
            }
            if (waveAmp > 0.001) {
                for (let i = 0; i < CCOLS; i++) {
                    const a = (i + C0) * 0.30 - t * 3.1;
                    swI[i] = Math.sin(a); swIc[i] = Math.cos(a);
                }
                for (let j = 0; j < CROWS; j++) {
                    const b = (j + R0) * 0.17;
                    swJ[j] = Math.sin(b); swJc[j] = Math.cos(b);
                }
            }

            // Pass 1 — the field itself, plus block sums for the coarser rungs.
            megaSum.fill(0);
            midSum.fill(0);
            let p = 0;
            for (let j = 0; j < CROWS; j++) {
                const b0 = wj[0][j], b1 = wj[1][j], b2 = wj[2][j];
                const sj = swJ[j], sjc = swJc[j];
                const gRow = ((j / MEGA_DIV) | 0) * MEGA_COLS;
                const mRow = ((j / MID_DIV) | 0) * MID_COLS;
                for (let i = 0; i < CCOLS; i++) {
                    const f = 0.44 * wi[0][i] * b0 + 0.33 * wi[1][i] * b1 + 0.23 * wi[2][i] * b2;
                    // sin(ax + by - wt) = sin(ax-wt)cos(by) + cos(ax-wt)sin(by)
                    const swell = waveAmp > 0.001 ? (swI[i] * sjc + swIc[i] * sj) * waveAmp : 0;
                    let shade = 0.5 + 0.5 * f + jitter[p] + swell;
                    shade = shade < 0 ? 0 : shade > 1 ? 1 : shade;
                    shadeBuf[p] = shade;
                    megaSum[gRow + ((i / MEGA_DIV) | 0)] += shade;
                    midSum[mRow + ((i / MID_DIV) | 0)] += shade;
                    p++;
                }
            }

            // Pass 2 — each cell takes its value from whichever rung its own
            // block currently sits on. No clipping, so the boundary between
            // pixel sizes is only ever the edge of a square.
            const data = coarseImg.data;
            p = 0;
            for (let j = 0; j < CROWS; j++) {
                const gRow = ((j / MEGA_DIV) | 0) * MEGA_COLS;
                const mRow = ((j / MID_DIV) | 0) * MID_COLS;
                for (let i = 0; i < CCOLS; i++) {
                    const g = gRow + ((i / MEGA_DIV) | 0);
                    const m = mRow + ((i / MID_DIV) | 0);
                    const shade = pMid <= megaThr[g] ? megaSum[g] / megaCnt[g]
                        : pFull <= midThr[m] ? midSum[m] / midCnt[m]
                            : shadeBuf[p];
                    // Gamma keeps the bulk of the field dark so the HUD reads.
                    // Not steeper than squared: the coarse layer has to carry
                    // the picture alone while the fine layer is absent.
                    const tone = shade * shade;
                    const q = p * 4;
                    if (accentMask[p] && shade > 0.66) {
                        data[q] = ROUTE[0] * tone;
                        data[q + 1] = ROUTE[1] * tone;
                        data[q + 2] = ROUTE[2] * tone;
                    } else {
                        data[q] = FIELD[0] * tone;
                        data[q + 1] = FIELD[1] * tone;
                        data[q + 2] = FIELD[2] * tone;
                    }
                    data[q + 3] = COARSE_ALPHA;
                    p++;
                }
            }
            coarseBufCtx.putImageData(coarseImg, 0, 0);
        };

        // Prime the field so the first frame has an image rather than nothing.
        paintCoarse(0, 0, 0, 1, 1);

        const coarseGrid = new Path2D();
        for (let i = C0; i <= C1; i++) {
            coarseGrid.moveTo(i * COARSE, R0 * COARSE);
            coarseGrid.lineTo(i * COARSE, R1 * COARSE);
        }
        for (let j = R0; j <= R1; j++) {
            coarseGrid.moveTo(C0 * COARSE, j * COARSE);
            coarseGrid.lineTo(C1 * COARSE, j * COARSE);
        }

        // ── Backlight ────────────────────────────────────────────────────────
        const WASH_W = 360, WASH_H = 240;
        const washSprite = (() => {
            const cv = makeSprite(WASH_W, WASH_H);
            const c = cv.getContext('2d')!;
            const span = Math.max(WASH_W, WASH_H);
            for (const m of MASSES) {
                const cx = m.x * WASH_W, cy = m.y * WASH_H, r = m.r * span;
                const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
                g.addColorStop(0, rgba(m.accent ? ROUTE : FIELD, m.a));
                g.addColorStop(1, rgba(m.accent ? ROUTE : FIELD, 0));
                c.fillStyle = g;
                c.fillRect(0, 0, WASH_W, WASH_H);
            }
            return cv;
        })();

        /**
         * Tag sprites, baked once. Twelve of these redrawn as live text every
         * frame would put a dozen fillText calls in the hot path for decoration
         * nobody reads.
         */
        const TAG_W = 64, TAG_H = 28;
        const tagSprites = SECONDARY.map(sec => sec.tags.map(tag => {
            const cv = makeSprite(TAG_W, TAG_H);
            const c = cv.getContext('2d')!;
            c.translate(TAG_W / 2, TAG_H / 2);
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            if (tag.route) {
                // Routing traffic: a solid chip with knocked-out text.
                const w = 26, h = 10;
                c.fillStyle = rgba(ROUTE, 0.92);
                c.fillRect(-w / 2, -h - 2, w, h);
                c.fillStyle = rgba(VOID, 0.92);
                c.font = '700 7px "JetBrains Mono", monospace';
                c.fillText(tag.label, 0, -h / 2 - 2);
                if (tag.sub) {
                    c.fillStyle = rgba(ROUTE, 0.75);
                    c.font = '700 6px "JetBrains Mono", monospace';
                    c.fillText(tag.sub, 0, 6);
                }
            } else {
                // Instrumentation traffic: an outlined marker.
                c.strokeStyle = rgba(TRACE, 0.85);
                c.lineWidth = 1;
                c.strokeRect(-11, -9, 22, 9);
                c.fillStyle = rgba(TRACE, 0.95);
                c.font = '700 6px "JetBrains Mono", monospace';
                c.fillText(tag.label, 0, -4.5);
            }
            return cv;
        }));

        /**
         * Reticle callout: the server this console is pointed at.
         *
         * Baked rather than drawn live because the hostname is variable-length:
         * it has to be measured and size-fitted, and doing that every frame to
         * render an unchanging string would be pure waste. Right-aligned inside
         * the sprite so the gap to the ring stays constant however long the name
         * is, and the whole block grows leftward — away from the docked panel.
         */
        const CALLOUT_W = 560, CALLOUT_H = 46;
        const buildCallouts = (host: string) => {
            const RIGHT = CALLOUT_W - 8;
            const MAX = 420;

            // Bounded before the fitting loop below, which measures the whole
            // remaining string once per character it trims. This value arrives
            // over HTTP: a 4KB name costs ~24k measureText calls on the main
            // thread, which freezes the tab.
            const capped = host.length > MAX_HOST_CHARS ? host.slice(0, MAX_HOST_CHARS) : host;

            const build = (sub: string) => {
                const cv = makeSprite(CALLOUT_W, CALLOUT_H);
                const c = cv.getContext('2d')!;
                c.textBaseline = 'alphabetic';
                c.textAlign = 'right';

                // Shrink to fit, then truncate only if it still will not.
                let size = 27;
                let text = capped;
                for (; size >= 13; size -= 1) {
                    c.font = `700 ${size}px "JetBrains Mono", monospace`;
                    if (c.measureText(text).width <= MAX) break;
                }
                while (text.length > 4 && c.measureText(text).width > MAX) {
                    text = text.slice(0, -1);
                }
                if (text !== capped || capped.length < host.length) text = text.slice(0, -1) + '\u2026';

                c.fillStyle = rgba(ROUTE, 0.95);
                c.font = `700 ${size}px "JetBrains Mono", monospace`;
                c.fillText(text, RIGHT, 22);
                const w = c.measureText(text).width;

                c.fillStyle = rgba(ROUTE, 0.6);
                c.font = '700 10px "JetBrains Mono", monospace';
                c.fillText(sub, RIGHT, 38);

                c.fillStyle = rgba(ROUTE, 0.85);
                c.font = '700 13px "JetBrains Mono", monospace';
                c.textAlign = 'left';
                c.fillText('>', RIGHT - w - 20, 20);
                return cv;
            };
            // One idle variant per main line: the subline names whichever
            // segment is currently locked, so it changes as the reticle travels.
            return { idle: MAIN_LINES.map(ml => build(ml.seg)), acquiring: build('ACQUIRING…') };
        };

        // First paint uses the dialled host; the real machine name swaps in when
        // /server-info answers. Rebuilding two sprites is cheaper than blocking
        // the whole backdrop on a network round trip.
        let calloutSprites = buildCallouts(serverHostnameFallback().toUpperCase());
        let disposed = false;
        getServerHostname().then(name => {
            if (!disposed) calloutSprites = buildCallouts(name.toUpperCase());
        });

        /**
         * Corner callouts, baked per main line. These were the last live
         * fillText calls in the loop: three lines per corner, three corners,
         * every frame. Canvas does not cache text shaping, so that was ~9 text
         * layouts a frame for strings that never change.
         */
        const CORNER_W = 132, CORNER_H = 44;
        const cornerSprites = MAIN_LINES.map(ml => ml.corners.map(c => {
            const cv = makeSprite(CORNER_W, CORNER_H);
            const cx = cv.getContext('2d')!;
            cx.textAlign = 'left';
            cx.textBaseline = 'alphabetic';
            cx.fillStyle = rgba(ROUTE, 0.9);
            cx.font = '700 9px "JetBrains Mono", monospace';
            cx.fillText(c.id, 0, 10);
            cx.fillStyle = rgba(ROUTE, 0.55);
            cx.font = '600 7px "JetBrains Mono", monospace';
            cx.fillText(c.l1, 0, 19);
            cx.fillText(c.l2, 0, 27);
            return cv;
        }));

        /** Channel IDs at each ring junction — same reasoning as the corners. */
        const SEC_ID_W = 46, SEC_ID_H = 18;
        const secIdSprites = SECONDARY.map(sec => {
            const cv = makeSprite(SEC_ID_W, SEC_ID_H);
            const cx = cv.getContext('2d')!;
            cx.textAlign = 'left';
            cx.textBaseline = 'middle';
            cx.fillStyle = rgba(TRACE, 0.95);
            cx.font = '700 11px "JetBrains Mono", monospace';
            cx.fillText(sec.id, 0, SEC_ID_H / 2);
            return cv;
        });

        /** Endpoint tags for each main line, baked like the traffic tags. */
        const END_W = 108, END_H = 34;
        const endSprites = MAIN_LINES.map(ml => ml.ends.map(label => {
            const cv = makeSprite(END_W, END_H);
            const c = cv.getContext('2d')!;
            c.translate(END_W / 2, END_H / 2);
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            const w = 64, h = 14;
            c.fillStyle = rgba(ROUTE, 0.94);
            c.fillRect(-w / 2, -h / 2, w, h);
            c.fillStyle = rgba(VOID, 0.92);
            c.font = '700 8px "JetBrains Mono", monospace';
            c.fillText(label, 0, 0);
            // Stem down to the line itself.
            c.strokeStyle = rgba(ROUTE, 0.8);
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(0, h / 2); c.lineTo(0, h / 2 + 9);
            c.stroke();
            return cv;
        }));

        /**
         * Arc-length parameterisation of each main line's visible middle span,
         * precomputed. The polylines never move, so measuring them per frame
         * meant an array allocation and a hypot per segment, 60 times a second,
         * for a result that cannot change.
         */
        const spanGeometry = MAIN_LINES.map(ml => {
            const pts = ml.pts.slice(1, ml.pts.length - 1);
            const seg: number[] = [];
            const ang: number[] = [];
            let total = 0;
            for (let k = 0; k < pts.length - 1; k++) {
                const dx = pts[k + 1][0] - pts[k][0], dy = pts[k + 1][1] - pts[k][1];
                seg.push(Math.hypot(dx, dy));
                ang.push(Math.atan2(dy, dx));
                total += seg[k];
            }
            return { pts, seg, ang, total };
        });

        /** Point and heading at normalised distance `u` along a precomputed span. */
        const alongSpan = (g: typeof spanGeometry[number], u: number) => {
            let want = clamp01(u) * g.total;
            let k = 0;
            while (k < g.seg.length - 1 && want > g.seg[k]) { want -= g.seg[k]; k++; }
            const f = g.seg[k] ? want / g.seg[k] : 0;
            return {
                x: g.pts[k][0] + (g.pts[k + 1][0] - g.pts[k][0]) * f,
                y: g.pts[k][1] + (g.pts[k + 1][1] - g.pts[k][1]) * f,
                a: g.ang[k],
            };
        };

        // Scratch for the secondary tag paths. Their tips move every frame so the
        // geometry cannot be precomputed, but the arrays holding it can be
        // reused — six lines x two arrays x 60fps is a lot of short-lived
        // garbage for three numbers.
        const scratchX = new Float64Array(3);
        const scratchY = new Float64Array(3);
        const scratchSeg = new Float64Array(2);

        /** Scan band, built once; the frame only moves it. */
        const bandGradient = (() => {
            const g = ctx.createLinearGradient(0, -BAND / 2, 0, BAND / 2);
            g.addColorStop(0, rgba(TRACE, 0));
            g.addColorStop(0.45, rgba(TRACE, 0.05));
            g.addColorStop(0.62, rgba(TRACE, 0.09));
            g.addColorStop(1, rgba(TRACE, 0));
            return g;
        })();

        const secondaryGradients = SECONDARY.map(s => {
            const g = ctx.createLinearGradient(0, 0, Math.hypot(s.anchor[0], s.anchor[1]) + 700, 0);
            g.addColorStop(0, rgba(TRACE, 0.55));
            g.addColorStop(1, rgba(TRACE, 0));
            return g;
        });

        // ── Sizing ────────────────────────────────────────────────────────────
        let width = 0, height = 0, dpr = 1;
        const resize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
            width = canvas.clientWidth;
            height = canvas.clientHeight;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
        };
        resize();

        /**
         * Colour strings the frame would otherwise rebuild. `rgba()` returns a
         * template literal and the canvas re-parses it as CSS on assignment, so
         * a constant colour inside the loop costs an allocation and a parse
         * 60 times a second for a value that never changes. Measured 77 such
         * builds per frame before this.
         *
         * Where the alpha genuinely varies (contacts flickering, cells
         * reporting in) the solid colour is hoisted here and the alpha applied
         * with globalAlpha, turning a string build into a number assignment.
         */
        const C = {
            fieldSolid: rgba(FIELD, 1),
            routeSolid: rgba(ROUTE, 1),
            traceSolid: rgba(TRACE, 1),
            unfocusedLine: rgba(TRACE, 0.22),
            ring: rgba(TRACE, 0.92),
            ringInner: rgba(TRACE, 0.34),
            ringIndex: rgba(TRACE, 0.95),
            ringCore: rgba(TRACE, 0.98),
            sweepEdge: rgba(TRACE, 0.32),
            lattice: rgba(FIELD, 0.34),
            ground: rgba(VOID, 1),
            contact: rgba(TRACE, 0.85),
            markerTri: rgba(ROUTE, 0.95),
        };

        // ── Frame ─────────────────────────────────────────────────────────────

        const at = (span: readonly [number, number], local: number) =>
            clamp01((local - span[0]) / span[1]);

        const render = (t: number) => {
            const cyclePos = ((t % CYCLE) + CYCLE) % CYCLE;
            const cycleIdx = Math.floor(t / CYCLE);
            const idx = cycleIdx % MAIN_LINES.length;
            const prev = MAIN_LINES[(idx - 1 + MAIN_LINES.length) % MAIN_LINES.length].focus;
            const cur = MAIN_LINES[idx].focus;

            const pTravel = easeInOut(at(TIMELINE.travel, cyclePos));
            const pRetract = at(TIMELINE.retract, cyclePos);
            const pGrow = easeOut(at(TIMELINE.grow, cyclePos)) * (1 - pRetract);
            const pNum = at(TIMELINE.numbers, cyclePos) * (1 - pRetract);
            const pRipple = at(TIMELINE.ripple, cyclePos);
            const pScan = easeInOut(at(TIMELINE.scan, cyclePos)) * (1 - easeInOut(pRetract));
            const pMain = easeOut(at(TIMELINE.main, cyclePos)) * (1 - pRetract);
            const pTri = at(TIMELINE.tri, cyclePos) * (1 - pRetract);

            const fcx = lerp(prev.x, cur.x, pTravel);
            const fcy = lerp(prev.y, cur.y, pTravel);
            const fw = lerp(prev.w, cur.w, pTravel);
            const fh = lerp(prev.h, cur.h, pTravel);
            const pSettle = easeInOut(at(TIMELINE.settle, cyclePos)) * (1 - pRetract);
            const ringR = lerp(lerp(R_TRAVEL, R_PEAK, pGrow), R_FOCUS, pSettle);
            // A few degrees of turn, spent during the ripple beat. Accumulated
            // across cycles so the ring never snaps back at the loop point.
            const ringSpin = (cycleIdx + easeOut(pRipple)) * 0.42;

            // Refresh state: a swell runs through the pixels, then the panel
            // climbs a resolution ladder — mega blocks, mid blocks, full cells —
            // each rung arriving behind its own rolling front.
            const refreshPos = ((t % REFRESH) + REFRESH) % REFRESH;
            const waveK = at(RF.wave, refreshPos);
            const waveAmp = Math.sin(waveK * Math.PI) * 0.34;
            const descending = refreshPos < RF_TURN;
            // Both fronts are continuous across the turn: each descent window
            // has finished before its climb window opens.
            const pMidFront = descending
                ? 1 - easeInOut(at(RF.degradeMid, refreshPos))
                : easeInOut(at(RF.buildMid, refreshPos));
            const pFullFront = descending
                ? 1 - easeInOut(at(RF.degradeFull, refreshPos))
                : easeInOut(at(RF.buildFull, refreshPos));
            // Detail leaves before the blocks merge and returns after they
            // split, and both ends land on 1 so the wrap point is invisible.
            const fineAlpha = descending
                ? 1 - easeInOut(at(RF.fineOut, refreshPos))
                : easeOut(at(RF.resolve, refreshPos));
            const coarseGridAlpha = 1 - fineAlpha;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.fillStyle = C.ground;
            ctx.fillRect(0, 0, width, height);

            const wob = 1.35;
            ctx.globalAlpha = 0.85 + Math.sin(t * 0.06) * 0.15;
            ctx.drawImage(
                washSprite,
                -width * (wob - 1) / 2 + Math.sin(t * 0.012) * width * 0.05,
                -height * (wob - 1) / 2 + Math.cos(t * 0.009) * height * 0.05,
                width * wob, height * wob,
            );
            ctx.globalAlpha = 1;

            // ── The glass ────────────────────────────────────────────────────
            ctx.save();
            ctx.translate(width * 0.42, height * 0.50);
            ctx.rotate(PANEL.rot);
            ctx.transform(1, 0, PANEL.shear, PANEL.squash, 0, 0);

            // ── Screen refresh ───────────────────────────────────────────────
            // Each refresh moves the field to a new phase. The move is RAMPED
            // across the swell, never stepped: a stepped phase would replace the
            // whole image in one frame, which is what reads as a cut rather than
            // a re-render. Ramping it makes the picture churn and re-form under
            // the swell instead.
            const refreshIdx = Math.floor(t / REFRESH);
            const seed = lerp((refreshIdx - 1) * 3.7, refreshIdx * 3.7,
                              easeInOut(at(RF.wave, refreshPos)));
            paintCoarse(t, seed, waveAmp, pMidFront, pFullFront);

            // Smoothing off for every blit below: each rung must land as hard
            // blocks. The averaging that keeps the image's weight happens when
            // filling the ladder buffers, whose own contexts smooth on downscale.
            ctx.imageSmoothingEnabled = false;

            // One blit. The ladder was already resolved per block inside the
            // buffer, so nothing here is clipped and no boundary has a shape.
            ctx.save();
            ctx.drawImage(coarseBuf, MAP_X, MAP_Y, MAP_W, MAP_H);
            // Absent detail is made up by a second pass, so coarsening changes
            // resolution without also darkening the panel.
            const boost = 0.55 * (1 - fineAlpha);
            if (boost > 0.01) {
                ctx.globalAlpha = boost;
                ctx.drawImage(coarseBuf, MAP_X, MAP_Y, MAP_W, MAP_H);
                ctx.globalAlpha = 1;
            }

            // Coarse guides retire once the low-resolution pass has landed.
            if (coarseGridAlpha > 0.002) {
                ctx.strokeStyle = rgba(FIELD, 0.17 * coarseGridAlpha);
                ctx.lineWidth = 1;
                ctx.stroke(coarseGrid);
            }

            // Fine pixel layer: only once the coarse pass has resolved.
            if (finePattern && fineAlpha > 0.002) {
                ctx.globalAlpha = fineAlpha;
                ctx.fillStyle = finePattern;
                ctx.fillRect(MAP_X, MAP_Y, MAP_W, MAP_H);
                ctx.globalAlpha = 1;
            }

            for (const a of ACTIVATIONS) {
                const k = ((t + a.phase) % a.period) / a.period;
                if (k > 0.22) continue;
                ctx.globalAlpha = 0.32 * Math.sin((k / 0.22) * Math.PI);
                ctx.fillStyle = a.accent ? C.routeSolid : C.fieldSolid;
                ctx.fillRect(a.gx * COARSE, a.gy * COARSE, COARSE, COARSE);
            }
            ctx.globalAlpha = 1;
            ctx.restore();
            // Re-enabled OUTSIDE the pixel layers' save/restore. It used to sit
            // inside it, so the restore popped it straight back to false and
            // every baked text sprite — corner callouts, channel IDs, traffic
            // tags, the hostname — was resampled nearest-neighbour under the
            // panel tilt and came out aliased.
            ctx.imageSmoothingEnabled = true;

            // 52 contacts; this loop alone was building 52 colour strings a frame.
            for (const d of DOTS) {
                ctx.globalAlpha = d.flicker
                    ? d.a * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * d.rate + d.phase)))
                    : d.a;
                ctx.beginPath();
                ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
                ctx.fillStyle = d.accent ? C.routeSolid : C.traceSolid;
                ctx.fill();
            }
            ctx.globalAlpha = 1;

            // ── Focus rules: two X and two Y, closing in from off-panel ───────
            if (pScan > 0.001) {
                const l = lerp(-PLANE_X, fcx - fw / 2, pScan);
                const r = lerp(PLANE_X, fcx + fw / 2, pScan);
                const u = lerp(-PLANE_Y, fcy - fh / 2, pScan);
                const b = lerp(PLANE_Y, fcy + fh / 2, pScan);

                ctx.strokeStyle = rgba(TRACE, 0.30 + 0.45 * pScan);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(l, -PLANE_Y); ctx.lineTo(l, PLANE_Y);
                ctx.moveTo(r, -PLANE_Y); ctx.lineTo(r, PLANE_Y);
                ctx.moveTo(-PLANE_X, u); ctx.lineTo(PLANE_X, u);
                ctx.moveTo(-PLANE_X, b); ctx.lineTo(PLANE_X, b);
                ctx.stroke();

                // The enclosed region reads slightly hotter once the rules land.
                ctx.fillStyle = rgba(TRACE, 0.030 * pScan);
                ctx.fillRect(l, u, r - l, b - u);

                // Short ticks marking each rule's own axis.
                ctx.strokeStyle = rgba(TRACE, 0.80 * pScan);
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (const x of [l, r]) { ctx.moveTo(x, u - 26); ctx.lineTo(x, u - 4); ctx.moveTo(x, b + 4); ctx.lineTo(x, b + 26); }
                for (const y of [u, b]) { ctx.moveTo(l - 26, y); ctx.lineTo(l - 4, y); ctx.moveTo(r + 4, y); ctx.lineTo(r + 26, y); }
                ctx.stroke();
            }

            // ── Main lines. All fixed in panel space; only styling changes. ──
            ctx.lineJoin = 'round';
            ctx.lineCap = 'butt';
            const strokeLine = (pts: [number, number][]) => {
                ctx.beginPath();
                pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
                ctx.stroke();
            };

            // Unfocused lines borrow the secondary style and stay exactly where
            // they are. Restyling, never repositioning.
            ctx.strokeStyle = C.unfocusedLine;
            ctx.lineWidth = 1;
            for (let i = 0; i < MAIN_LINES.length; i++) {
                if (i === idx) continue;
                strokeLine(MAIN_LINES[i].pts);
            }

            const focused = MAIN_LINES[idx].pts;
            if (pMain > 0.001) {
                ctx.strokeStyle = rgba(ROUTE, 0.06 * pMain); ctx.lineWidth = 48 * pMain; strokeLine(focused);
                ctx.strokeStyle = rgba(ROUTE, 0.11 * pMain); ctx.lineWidth = 24 * pMain; strokeLine(focused);
                ctx.strokeStyle = rgba(ROUTE, 0.24 * pMain); ctx.lineWidth = 6 * pMain; strokeLine(focused);
                ctx.strokeStyle = rgba(ROUTE, 0.30 * pMain); ctx.lineWidth = 1; strokeLine(focused);
            }
            ctx.save();
            ctx.setLineDash([18, 13]);
            ctx.lineDashOffset = -t * 38;
            ctx.strokeStyle = rgba(ROUTE, lerp(0.30, 0.85, pMain));
            ctx.lineWidth = lerp(1, 2, pMain);
            strokeLine(focused);
            ctx.restore();

            // Two endpoint tags on the focused line, with traffic running
            // between them. The span is the visible middle of the polyline —
            // its interior vertices — since the ends run far off-panel.
            if (pMain > 0.01) {
                const geo = spanGeometry[idx];
                const span = geo.pts;
                const U0 = 0.16, U1 = 0.84;
                const a0 = alongSpan(geo, U0), a1 = alongSpan(geo, U1);

                // The active span between the tags reads hotter than the rest.
                ctx.strokeStyle = rgba(ROUTE, 0.5 * pMain);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(a0.x, a0.y);
                for (let k = 0; k < span.length; k++) ctx.lineTo(span[k][0], span[k][1]);
                ctx.lineTo(a1.x, a1.y);
                ctx.stroke();

                // Traffic: a packet with a short trail, running tag 0 -> tag 1.
                const head = (t * 0.34) % 1;
                for (let k = 0; k < 5; k++) {
                    const u = head - k * 0.035;
                    if (u < 0) continue;
                    const q = alongSpan(geo, lerp(U0, U1, u));
                    const fade = (1 - k / 5) * pMain;
                    ctx.save();
                    ctx.translate(q.x, q.y);
                    ctx.rotate(q.a);
                    ctx.fillStyle = rgba(ROUTE, (k === 0 ? 0.95 : 0.35) * fade);
                    const len = k === 0 ? 13 : 8;
                    ctx.fillRect(-len / 2, -2, len, 4);
                    ctx.restore();
                }

                ctx.globalAlpha = pMain;
                for (let k = 0; k < 2; k++) {
                    const q = k === 0 ? a0 : a1;
                    ctx.drawImage(endSprites[idx][k], q.x - END_W / 2, q.y - END_H / 2 - 16);
                }
                ctx.globalAlpha = 1;
            }

            // Corner callouts at the focused corridor's interior vertices.
            if (pTri > 0.001) {
                const corners = MAIN_LINES[idx].corners;
                for (let i = 0; i < corners.length; i++) {
                    const k = clamp01((pTri - i * 0.18) / 0.55);
                    if (k <= 0) continue;
                    const [vx, vy] = focused[i + 1];
                    const size = 11 * easeOut(k);
                    ctx.save();
                    ctx.translate(vx, vy);
                    ctx.globalAlpha = k;
                    ctx.beginPath();
                    ctx.moveTo(0, -size);
                    ctx.lineTo(size * 0.88, size * 0.62);
                    ctx.lineTo(-size * 0.88, size * 0.62);
                    ctx.closePath();
                    ctx.strokeStyle = C.markerTri;
                    ctx.lineWidth = 1.4;
                    ctx.stroke();
                    ctx.drawImage(cornerSprites[idx][i], 14, 6);
                    ctx.restore();
                }
                ctx.globalAlpha = 1;
            }

            // ── Secondary lines. Anchors fixed in panel space. ────────────────
            // The tip is recomputed on the ring every frame, aimed at whatever
            // the line heads for next, so it stays welded to the circle while
            // the reticle travels and it is the ANGLE that changes.
            // Locking silences the channels from the reticle outward.
            const fadeFront = pScan * 1.30;
            ctx.lineWidth = 1;
            for (let i = 0; i < SECONDARY.length; i++) {
                const sec = SECONDARY[i];
                const dx = Math.sin(t * SEC_DRIFT_RATE[i] + i * 2.3) * ANCHOR_DRIFT;
                const dy = Math.cos(t * SEC_DRIFT_RATE[i] * 0.77 + i * 1.1) * ANCHOR_DRIFT;
                const aimX = (sec.elbow ? sec.elbow[0] : sec.anchor[0]) + dx;
                const aimY = (sec.elbow ? sec.elbow[1] : sec.anchor[1]) + dy;
                const vx = aimX - fcx, vy = aimY - fcy;
                const len = Math.hypot(vx, vy) || 1;
                const tipX = fcx + (vx / len) * ringR;
                const tipY = fcy + (vy / len) * ringR;

                // Work in a frame whose +x runs from the tip toward the aim
                // point, so the prebuilt gradient and the ID orient down the line.
                const head = Math.atan2(vy, vx);
                const hc = Math.cos(-head), hs = Math.sin(-head);
                const local = (px: number, py: number) => {
                    const ox = px - tipX, oy = py - tipY;
                    return [ox * hc - oy * hs, ox * hs + oy * hc] as const;
                };

                ctx.save();
                ctx.translate(tipX, tipY);
                ctx.rotate(head);
                ctx.strokeStyle = secondaryGradients[i];
                ctx.beginPath();
                ctx.moveTo(0, 0);
                const [ex, ey] = local(aimX, aimY);
                if (sec.elbow) ctx.lineTo(ex, ey);
                const [ax2, ay2] = local(sec.anchor[0] + dx, sec.anchor[1] + dy);
                ctx.lineTo(ax2, ay2);
                ctx.stroke();

                if (pNum > 0.001) {
                    ctx.globalAlpha = pNum;
                    ctx.drawImage(secIdSprites[i], 9, -7 - SEC_ID_H / 2);
                    ctx.globalAlpha = 1;
                }

                // Traffic riding the line, in local coords. The fade front
                // sweeps outward from the tip as the lock engages, so channels
                // go quiet in a direction rather than all blinking out at once.
                const nodes = sec.elbow ? 3 : 2;
                scratchX[0] = 0; scratchY[0] = 0;
                if (sec.elbow) { scratchX[1] = ex; scratchY[1] = ey; }
                scratchX[nodes - 1] = ax2; scratchY[nodes - 1] = ay2;
                let pathLen = 0;
                for (let k = 0; k < nodes - 1; k++) {
                    scratchSeg[k] = Math.hypot(scratchX[k + 1] - scratchX[k], scratchY[k + 1] - scratchY[k]);
                    pathLen += scratchSeg[k];
                }
                for (let ti = 0; ti < sec.tags.length; ti++) {
                    const tag = sec.tags[ti];
                    const u = ((tag.u + t * tag.speed) % 1 + 1) % 1;
                    const alpha = clamp01((u - fadeFront) / 0.22) * clamp01((1 - u) / 0.10);
                    if (alpha < 0.02) continue;
                    let want = u * pathLen;
                    let k = 0;
                    while (k < nodes - 2 && want > scratchSeg[k]) { want -= scratchSeg[k]; k++; }
                    const px0 = scratchX[k], py0 = scratchY[k];
                    const px1 = scratchX[k + 1], py1 = scratchY[k + 1];
                    const f2 = scratchSeg[k] ? want / scratchSeg[k] : 0;
                    ctx.save();
                    ctx.translate(px0 + (px1 - px0) * f2, py0 + (py1 - py0) * f2);
                    ctx.rotate(Math.atan2(py1 - py0, px1 - px0));
                    ctx.globalAlpha = alpha;
                    ctx.drawImage(tagSprites[i][ti], -TAG_W / 2, -TAG_H / 2);
                    ctx.globalAlpha = 1;
                    ctx.restore();
                }
                ctx.restore();
            }

            // ── The reticle ───────────────────────────────────────────────────
            ctx.save();
            ctx.translate(fcx, fcy);
            // Ripple emitted as the ring settles.
            if (pRipple > 0.001 && pRipple < 1) {
                for (let i = 0; i < 3; i++) {
                    const k = clamp01((pRipple - i * 0.26) / 0.46);
                    if (k <= 0 || k >= 1) continue;
                    const e = easeOut(k);
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR + e * 240, 0, Math.PI * 2);
                    ctx.strokeStyle = rgba(TRACE, 0.45 * (1 - e));
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            }

            ctx.beginPath();
            ctx.arc(0, 0, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = C.ring;
            ctx.lineWidth = 1.6;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, 0, ringR * 0.58, 0, Math.PI * 2);
            ctx.strokeStyle = C.ringInner;
            ctx.lineWidth = 1;
            ctx.stroke();

            // Index marks on the ring itself — without these its rotation would
            // be invisible now that the connections no longer turn with it.
            ctx.save();
            ctx.rotate(ringSpin);
            ctx.strokeStyle = C.ringIndex;
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2;
                // Seed the subpath at the arc's start, or canvas joins them up.
                ctx.moveTo(Math.cos(a - 0.09) * ringR, Math.sin(a - 0.09) * ringR);
                ctx.arc(0, 0, ringR, a - 0.09, a + 0.09);
            }
            ctx.stroke();
            ctx.restore();

            for (let i = 0; i < 2; i++) {
                const a = t * (0.3 + i * 0.19) + i * 2.4 + ringSpin;
                const r = ringR * (0.24 + i * 0.3);
                ctx.beginPath();
                ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.7, 0, Math.PI * 2);
                ctx.fillStyle = C.contact;
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
            ctx.fillStyle = C.ringCore;
            ctx.fill();

            // Callout rides with the reticle, sitting clear of the ring.
            ctx.globalAlpha = 0.35 + 0.65 * pGrow;
            ctx.drawImage(
                pTravel < 1 ? calloutSprites.acquiring : calloutSprites.idle[idx],
                -96 - CALLOUT_W, -CALLOUT_H / 2 - 4,
            );
            ctx.globalAlpha = 1;

            ctx.restore(); // end reticle

            // ── Scan band sweeping the glass ──────────────────────────────────
            const sweepY = -SWEEP_TRAVEL / 2 + ((t % SWEEP_PERIOD) / SWEEP_PERIOD) * SWEEP_TRAVEL;
            // The gradient is built once at the origin and moved into place by
            // translating the context. Rebuilding it per frame meant a fresh
            // gradient object and four colour-string parses every frame.
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.translate(0, sweepY);
            ctx.fillStyle = bandGradient;
            ctx.fillRect(-PLANE_X, -BAND / 2, PLANE_X * 2, BAND);
            ctx.restore();

            ctx.strokeStyle = C.sweepEdge;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-PLANE_X, sweepY + BAND / 2);
            ctx.lineTo(PLANE_X, sweepY + BAND / 2);
            ctx.stroke();

            ctx.restore(); // end glass

            // ── Viewer's side of the glass: static registration lattice ───────
            const step = 132;
            ctx.strokeStyle = C.lattice;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = step / 2; x < width; x += step) {
                for (let y = step / 2; y < height; y += step) {
                    ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y);
                    ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
                }
            }
            ctx.stroke();
        };

        // ── Loop ──────────────────────────────────────────────────────────────

        let raf = 0;
        let startTs = 0;
        let lastDraw = 0;
        let elapsed = 0;
        let resumeOffset = 0;
        // One millisecond of slack. rAF fires a hair before the exact interval on
        // most displays, so an exact 1000/FPS_CAP threshold rejects the frame
        // that should have been drawn and waits a whole extra vsync: measured
        // 39.8fps on a 60Hz panel and 30.0fps on one running 60.0006Hz.
        const minDelta = 1000 / FPS_CAP - 1;

        const loop = (now: number) => {
            raf = requestAnimationFrame(loop);
            if (!startTs) startTs = now - resumeOffset;
            if (now - lastDraw < minDelta) return;
            lastDraw = now;
            elapsed = (now - startTs) / 1000;
            render(elapsed);
        };

        const stop = () => {
            if (!raf) return;
            cancelAnimationFrame(raf);
            raf = 0;
            startTs = 0;
            lastDraw = 0;
        };
        const play = () => {
            if (raf || reduced) return;
            resumeOffset = elapsed * 1000;
            raf = requestAnimationFrame(loop);
        };

/**
         * Stops when the window is hidden OR unfocused.
         *
         * This used to deliberately ignore focus — "coming back to a frozen
         * backdrop reads as broken". The premise was wrong: `stop()`/`play()`
         * carry the scene clock across the gap via `resumeOffset`, so refocusing
         * resumes exactly where it left off, and nobody sees a frozen frame
         * because nobody was looking at it. Meanwhile a full-screen 2D canvas
         * ran at FPS_CAP forever with Minerva parked on a second monitor —
         * browsers only throttle rAF for a HIDDEN tab, never for an unfocused
         * one — starving the GPU process every other tab composites through.
         */
        const sync = () => {
            if (reduced) return;
            if (document.hidden || !document.hasFocus()) stop(); else play();
        };

        if (reduced) render(TIMELINE.tri[0] + TIMELINE.tri[1]); else sync();

        const onResize = () => { resize(); render(reduced ? TIMELINE.tri[0] + TIMELINE.tri[1] : elapsed); };

        document.addEventListener('visibilitychange', sync);
        window.addEventListener('focus', sync);
        window.addEventListener('blur', sync);
        window.addEventListener('resize', onResize);

        return () => {
            disposed = true;
            stop();
            document.removeEventListener('visibilitychange', sync);
            window.removeEventListener('focus', sync);
            window.removeEventListener('blur', sync);
            window.removeEventListener('resize', onResize);
        };
    }, []);

    return (
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none select-none">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            {/* Scanlines and vignette as CSS overlays — free, versus a full
                canvas pass each frame. */}
            <div
                className="absolute inset-0"
                style={{
                    background: 'repeating-linear-gradient(0deg, rgba(255,58,52,0.020) 0px, rgba(255,58,52,0.020) 1px, transparent 1px, transparent 3px)',
                }}
            />
            <div
                className="absolute inset-0"
                style={{
                    background: 'radial-gradient(ellipse 78% 86% at 42% 50%, transparent 20%, rgb(var(--color-void) / 0.72) 100%)',
                }}
            />
        </div>
    );
});

export default LoginBackdrop;
