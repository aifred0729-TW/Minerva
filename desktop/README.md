# Minerva Desktop

The Minerva console as a native application for **Windows** and **macOS**.

It ships the same React bundle the container serves — not a fork, not a
reimplementation. `src/` is untouched by this directory.

---

## Why there is a gateway inside the app

Every backend call in the console is addressed against its own origin:

```ts
lib/apollo.ts      uri: window.location.origin + "/graphql/"
lib/websocket.ts   "wss://" + window.location.host + "/graphql/"
lib/urls.ts        `${window.location.origin}/direct/download/${fileId}`
Metasploit/msfrpc  `${window.location.origin}/msf-rpc/`
```

In the container deploy, nginx *is* that origin and rewrites those paths onto
Mythic. Loading the bundle from `file://` in Electron would strip the origin and
break all of it at once.

So the desktop app keeps the shape and moves the proxy in-process. `src/gateway.js`
is a loopback HTTP server that mirrors `nginx.conf.template` route for route:

```
     Electron renderer                 main process                    network
┌──────────────────────┐      ┌───────────────────────────┐
│  the React bundle,   │      │  gateway  127.0.0.1:41390 │
│  unmodified          │─────▶│                           │
│                      │      │  /new/*      → bundle on disk
│  window.location     │      │  /           → 302 /new/login
│  .origin ==          │      │  /graphql/   → Mythic  (HTTP + WS upgrade) ──▶ :7443
│  http://127.0.0.1:   │      │  /api/       → Mythic  (streamed uploads)  ──▶
│  41390               │      │  /auth       → Mythic                      ──▶
│                      │      │  /invite     → Mythic                      ──▶
│                      │      │  /refresh    → Mythic                      ──▶
│                      │      │  /direct/    → Mythic                      ──▶
│                      │      │  /server-info→ answered locally
│                      │      │  /msf-config → gated on Mythic GET /me
│                      │      │  /msf-rpc/   → msfrpcd /api/, same gate    ──▶ :55553
└──────────────────────┘      └───────────────────────────┘
```

Mythic's self-signed TLS is terminated on the Node side, exactly as nginx does
with `proxy_ssl_verify off`.

**The port is fixed at 41390 on purpose.** The origin is the storage key for the
operator's JWT, the persisted Zustand store (sidebar layout, console tabs, audio
settings) and the IndexedDB music library and graph cache. An ephemeral port would
hand the renderer a new origin on every launch and silently wipe all of it — the
app would behave as though it had never been logged into. `127.0.0.1` is also a
Chromium secure context, so `navigator.clipboard` and `crypto.subtle` work over
plain HTTP with no certificate involved.

---

## The connect window

The desktop app asks **where Mythic is before a login screen exists**. In the
container deploy that answer is compose configuration nobody re-reads; here one
binary travels between engagements, and the wrong target would otherwise only be
discovered as a failed login.

```
launch ──▶ connect window ──▶ preflight ──▶ gateway ──▶ console ──▶ Mythic login
```

Preflight fills a three-line checklist before the CTA will hand over:

| Check | What it proves |
|-------|----------------|
| `SERVER_REACHABLE` | TCP connect to the host and port |
| `TLS_HANDSHAKE` | TLS negotiated; reports the certificate's SHA-256 so the operator can eyeball it |
| `MYTHIC_ENDPOINT` | An HTTP answer from `/me` — something is speaking Mythic there |

The window follows the Screen Frame scale in
[`docs/DESIGN_LANGUAGE.md §6`](../docs/DESIGN_LANGUAGE.md): four corners of fixed
chrome, one docked panel, live glass behind it, dotted-leader checklist, 7 px
double-layer progress rail. It re-opens any time from **Connection → Link
Configuration…** (`Cmd/Ctrl+,`).

An address typed here is normalised the way an operator actually types it —
`10.0.0.5`, `10.0.0.5:7443` and `https://10.0.0.5:7443` all mean the same thing,
and a bare host implies HTTPS on Mythic's default 7443.

---

## Building

The desktop app does **not** build the UI. Build the bundle once at the
repository root, then package:

```bash
# repository root — produces ./build
npm install
npm run build

# desktop shell
cd desktop
npm install
npm run dist:win     # Windows: NSIS installer + portable, x64 & arm64
npm run dist:mac     # macOS:   dmg + zip, arm64 and x64 separately
npm run dist         # whatever the current host can produce
```

Installers land in `desktop/dist/`.

`npm run dist` refuses to start if `../build/index.html` is missing, rather than
producing an installer whose window renders a "bundle not found" page.

> **macOS installers require a macOS host.** A `.dmg` cannot be cross-built from
> Linux or Windows. Use the bundled CI workflow if you do not have a Mac —
> `.github/workflows/desktop-build.yml` builds both platforms on a tag push and
> attaches the installers to a GitHub Release.

### Signing

Builds are unsigned by default. Unsigned means Gatekeeper will refuse the first
launch on macOS (right-click → Open, or `xattr -d com.apple.quarantine`) and
SmartScreen will warn on Windows.

To sign, add the repository secrets named in the CI workflow and remove the
`CSC_IDENTITY_AUTO_DISCOVERY: false` override. macOS notarization additionally
needs `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`.

---

## Developing the shell

```bash
# terminal 1 — repository root, CRA dev server with HMR
npm start

# terminal 2 — point the shell at it instead of a built bundle
cd desktop
MINERVA_DEV_SERVER=http://127.0.0.1:3000 npm start
```

The gateway then proxies `/new/*` and webpack's `/ws` HMR socket to the dev
server, and everything else to Mythic as usual.

### Environment overrides

| Variable | Effect |
|----------|--------|
| `MINERVA_MYTHIC_ADDRESS` | Force the Mythic address, overriding stored settings. `MYTHIC_ADDRESS` also works. |
| `MINERVA_PORT` | Move the gateway off 41390. Changing it changes the origin, so stored sessions and preferences will not be seen. |
| `MINERVA_DEV_SERVER` | Serve `/new/*` from a CRA dev server instead of disk. |

---

## Security posture

**Egress is closed by default.** The renderer may reach the loopback gateway and
nothing else. This is not theoretical tidiness: the bundle's `index.html` pulls
Inter and JetBrains Mono from `fonts.googleapis.com`, and a C2 console making an
unprompted request to a third party from an operator's machine during an
engagement is a finding, not a feature. Blocked means system monospace is used
instead. Turn it off with **ALLOW REMOTE ASSETS** in the connect window if you
want the intended typography; bundling the two fonts into `public/` would fix it
properly for both this and the container deploy.

**MSF-RPC stays behind the operator gate.** `/msf-config` and `/msf-rpc/` are
authorized by a subrequest to Mythic's JWT-protected `GET /me`, the same
`auth_request` control nginx applies. Without it, `/msf-rpc/` is an
unauthenticated path to `module.execute` and `session.shell_write` — which is
exactly the hole the container deploy closed. The msfrpcd password is stored in
the settings file at mode 0600 and is never handed to a renderer; the connect
window is only told whether one exists.

**TLS verification is off by default**, matching nginx's `proxy_ssl_verify off`,
because stock Mythic self-signs and verification on would refuse every default
install. The connect window shows the certificate's SHA-256 fingerprint on a
successful handshake so a changed certificate is visible. Turn **TRUST
SELF-SIGNED CERTIFICATE** off if you run a real certificate.

The renderer runs with `contextIsolation: true`, `nodeIntegration: false` and
`sandbox: true`. The console window has no preload at all — only the pre-login
connect window does, and it is given four IPC verbs, not a nameable channel.

---

## Settings file

```
macOS    ~/Library/Application Support/Minerva/minerva-desktop.json
Windows  %APPDATA%\Minerva\minerva-desktop.json
```

Mode 0600, written atomically. **Connection → Open Settings File** reveals it.

---

## Differences from the container deploy

| | Container | Desktop |
|---|---|---|
| Reverse proxy | nginx, TLS on 443 | in-process gateway, plain HTTP on loopback |
| Where Mythic is | `MYTHIC_ADDRESS` at compose time | connect window, before login |
| `/server-info` | file written by `minerva_install.sh` | answered from the configured address |
| MSF credential | `nginx/runtime/msf-config.json` | settings file, mode 0600 |
| Fonts | Google Fonts CDN | system fonts unless remote assets are allowed |
| Sessions | per browser origin | per fixed loopback origin, survives relaunch |

`MsfSocksDialog` seeds its host hint from `window.location.hostname`, which reads
`127.0.0.1` here instead of the C2 host. Cosmetic — the field is editable.

---

---

## Cutting a release

Releases are published to **Minerva-Internal**. Tagging is the whole trigger:

```bash
git tag v2.1.3
git push internal v2.1.3
```

`.github/workflows/desktop-build.yml` then:

1. builds the web bundle and packages the shell on a macOS runner and a Windows
   runner in parallel,
2. uploads both sets of installers into one draft Release,
3. downloads them back, writes `SHA256SUMS.txt`, attaches
   `.github/RELEASE_NOTES.md` as the body, and publishes.

Bump `version` in **both** `package.json` files before tagging — the root one
feeds the console's build badge, `desktop/package.json` names the artifacts.

`workflow_dispatch` runs the same build without publishing anything, which is
the way to check a packaging change before committing to a tag.

### What downloaders will hit

These builds are unsigned, and the release notes say so plainly rather than
letting people conclude the download is corrupt:

- **macOS** — ships as two per-arch downloads rather than one universal file.
  A universal build merges the per-arch apps and requires every non-binary file
  to hash identically across them, which an ad-hoc signature breaks. The
  signature is the part that cannot be dropped: `scripts/adhoc-sign.js` applies
  it during packaging, and without it Apple Silicon refuses to execute the app
  at all.
  Gatekeeper still quarantines the download, so the first launch needs
  `xattr -dr com.apple.quarantine /Applications/Minerva.app`.
- **Windows** — SmartScreen warns; **More info → Run anyway** clears it.

To remove that friction, add the signing secrets named in the workflow and
delete its `CSC_IDENTITY_AUTO_DISCOVERY: false` line. macOS additionally needs
notarization credentials (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID`); Windows code-signing certificates now require a hardware token
for OV, so Azure Trusted Signing is the option that works unattended in CI.

### No update checks

The app never contacts GitHub on its own. **Help → Releases…** opens this page in
the operator's browser, and that is the only path. An operator console that
beacons to github.com on every launch during an engagement is a liability, which
is the same reasoning that closes egress by default.

## Icons

`build/icon.png` and `build/icon.mac.png` are generated from
`src/assets/minerva.png` by `build/make-icons.py`.

The source is white line art on transparency, which is right for the console —
it always sits on void black — and wrong for an app icon, where a light Dock or
taskbar would render it invisible. The generator composites it onto void black
and gives each platform the tile it expects: full-bleed square for Windows, an
inset rounded tile for macOS. Re-run `npm run icons` after changing the artwork.
