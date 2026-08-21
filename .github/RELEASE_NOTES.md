## Minerva Desktop

A native Minerva console for Windows and macOS. It talks to **your own Mythic
server** — the app asks for its address on first launch, before any login screen.

### Download

Download straight from this page, or with the GitHub CLI:

```bash
gh release download <version> --repo aifred0729-TW/Minerva
```

| Platform | File |
|----------|------|
| **macOS** — Apple Silicon (M1 and later) | `Minerva-*-macOS-arm64.dmg` |
| **macOS** — Intel | `Minerva-*-macOS-x64.dmg` |
| **Windows** (installer) | `Minerva-*-Windows-x64-setup.exe` · `…-arm64-setup.exe` |
| **Windows** (no install) | `Minerva-*-Windows-x64-portable.exe` |

`SHA256SUMS.txt` covers every file above — check it before running anything:

```bash
sha256sum -c SHA256SUMS.txt --ignore-missing
```

CI also attempts a [build provenance attestation](https://docs.github.com/actions/security-guides/using-artifact-attestations).
Where the repository plan supports it, verify with
`gh attestation verify <file> --repo aifred0729-TW/Minerva`.

### First launch

These builds are **not code-signed**, so both operating systems will stop you the
first time. That is the expected behaviour for an unsigned application, not a
sign that anything is wrong with the download — verify the checksum if you want
certainty.

**macOS** — the app is ad-hoc signed so it runs on Apple Silicon, but a
downloaded copy is quarantined. After dragging it to Applications:

```bash
xattr -dr com.apple.quarantine /Applications/Minerva.app
```

Then open it normally. (Right-click → Open works on some macOS versions; the
command above always works.)

**Windows** — SmartScreen shows "Windows protected your PC". Click
**More info → Run anyway**.

### Setting it up

1. Launch Minerva. The **Link Configuration** window opens first.
2. Enter your Mythic address — `10.0.0.5`, `10.0.0.5:7443` and
   `https://10.0.0.5:7443` all work; a bare host means HTTPS on 7443.
3. Press **VERIFY LINK**. Three checks run: the host is reachable, TLS
   negotiates, and something answers as Mythic. A successful handshake shows the
   certificate's SHA-256 so you can compare it against your server.
4. Press **ENTER CONSOLE** and log in with your Mythic operator credentials.

Reopen that window any time with **Connection → Link Configuration…**
(`Cmd/Ctrl+,`).

### Notes

- **Mythic's self-signed certificate is trusted by default**, matching how
  Minerva's nginx deployment is configured. Turn off *Trust self-signed
  certificate* in the connect window if you run a real certificate.
- **The app makes no outbound connections other than to your Mythic server.**
  There is no telemetry and no automatic update check — an operator console that
  calls home during an engagement is a liability. Check this page manually, or
  use **Help → Releases…** in the app.
- **Metasploit** is optional and off by default. When enabled, every RPC call is
  authorized against Mythic's `GET /me` first, so it is never reachable without a
  valid operator token.

Full documentation: [`desktop/README.md`](https://github.com/aifred0729-TW/Minerva/blob/main/desktop/README.md)
