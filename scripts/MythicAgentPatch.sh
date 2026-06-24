#!/bin/bash
# MythicAgentPatch.sh — Minerva-required patches to Mythic-installed agents
#
# Distinct from mythic_change.sh (which patches the Mythic server itself).
# This script holds every modification Minerva needs in agent source code
# under /opt/Mythic/InstalledServices/<agent>/.
#
# Patches included (Apollo):
#   A1. TcpProfile.cs   — single-Write framing
#        Fix : 4 concurrent BeginWrite per chunk allowed thread-pool scheduling
#              to interleave framing-header bytes with payload bytes on the wire
#              under sustained load (interactive SSH-over-SOCKS, file streaming
#              over rpfwd, etc.), corrupting the receiver's state machine and
#              producing "Bad packet length" / "Connection corrupted" once an
#              encrypted stream desynced. Replace with one synchronous Write.
#
#   A2. SocksClient.cs  — synchronous queue drain
#        Fix : The send path had two concurrent consumers on the same write
#              queue (the dedicated sender Task and OnDataSent's TryDequeue
#              shortcut), both calling BeginWrite on the same NetworkStream
#              without serialization. AutoResetEvent semantics also dropped
#              signals when items piled up faster than the consumer woke.
#              Drain inside one wakeup and use synchronous Write so order is
#              guaranteed; neutralize the legacy OnDataSent callback.
#
#   A3. IPC.cs          — RECV_SIZE / SEND_SIZE bumped 30000 → 65535
#        Fix : Larger SOCKS chunks per beacon, halving framing overhead for
#              high-throughput tunnels.
#
# Idempotent — each patch is gated by a unique marker comment in the source.
# Safe to run repeatedly. Each modified file gets a one-time .minerva.bak.
#
# Apollo source is read by the Apollo *payload container* at payload-build
# time. Existing payloads in the field were built against the old code; you
# must rebuild / reissue any Apollo payload (Mythic UI → payload row →
# "Trigger New Build", or generate a fresh payload via Payload Management)
# for the fix to reach the implant. No Mythic container rebuild is required.

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[*]${NC} $1"; }
ok()    { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[-]${NC} $1"; }
die()   { err "$1"; exit 1; }

# ── Auto-elevate ──────────────────────────────────────────────────────────────
# Mythic-installed agent source under /opt/Mythic/InstalledServices is owned by
# root; rewriting the .cs files (and dropping .minerva.bak siblings) needs
# write access. If we weren't started as root, re-exec under sudo so the user
# only has to invoke this script once.
if [ "$(id -u)" -ne 0 ]; then
    info "Not root — re-invoking under sudo (you may be prompted for your password)"
    exec sudo -E bash "$0" "$@"
fi

MYTHIC_DIR="${MYTHIC_DIR:-/opt/Mythic}"
APOLLO_SRC="$MYTHIC_DIR/InstalledServices/apollo/apollo/agent_code"

# ── Preflight ─────────────────────────────────────────────────────────────────
[ -d "$MYTHIC_DIR" ]   || die "Mythic directory not found: $MYTHIC_DIR  (set MYTHIC_DIR env var)"
[ -d "$APOLLO_SRC" ]   || warn "Apollo agent source not present (skipping Apollo patches)"
command -v python3 &>/dev/null || die "python3 is required"

info "Applying agent patches from $APOLLO_SRC"

export APOLLO_SRC

# ── Apply via Python heredoc (reliable multi-line replacement, idempotent) ───
python3 << 'PYEOF'
import os, sys, re, shutil

apollo_src = os.environ['APOLLO_SRC']
patches_applied = 0

def backup_once(path):
    bak = path + '.minerva.bak'
    if not os.path.exists(bak):
        shutil.copy2(path, bak)

# ──────────────────────────────────────────────────────────────────────────────
# Patch A1 — TcpProfile.cs: single-Write framing
# ──────────────────────────────────────────────────────────────────────────────
A1_MARKER = 'Minerva patch: single-Write framing'
A1_PATH = os.path.join(apollo_src, 'TcpProfile/TcpProfile.cs')

if not os.path.exists(A1_PATH):
    print('[!] Patch A1 — TcpProfile.cs not found, skipping')
else:
    with open(A1_PATH, 'r') as f:
        content = f.read()
    if A1_MARKER in content:
        print('[+] Patch A1 already applied  (TcpProfile.cs single-Write framing)')
    else:
        OLD_A1 = (
            '                            byte[] sizeBytes = BitConverter.GetBytes((UInt32)chunkData.Length + 8);\n'
            '                            Array.Reverse(sizeBytes);\n'
            '                            byte[] currentChunkBytes = BitConverter.GetBytes(currentChunk);\n'
            '                            Array.Reverse(currentChunkBytes);\n'
            '                            DebugHelp.DebugWriteLine($"sending chunk {currentChunk}/{totalChunksToSend} with size {chunkData.Length + 8}");\n'
            '                            c.GetStream().BeginWrite(sizeBytes, 0, sizeBytes.Length, OnAsyncMessageSent, p);\n'
            '                            c.GetStream().BeginWrite(totalChunkBytes, 0, totalChunkBytes.Length, OnAsyncMessageSent, p);\n'
            '                            c.GetStream().BeginWrite(currentChunkBytes, 0, currentChunkBytes.Length, OnAsyncMessageSent, p);\n'
            '                            c.GetStream().BeginWrite(chunkData, 0, chunkData.Length, OnAsyncMessageSent, p);\n'
        )
        NEW_A1 = (
            '                            byte[] sizeBytes = BitConverter.GetBytes((UInt32)chunkData.Length + 8);\n'
            '                            Array.Reverse(sizeBytes);\n'
            '                            byte[] currentChunkBytes = BitConverter.GetBytes(currentChunk);\n'
            '                            Array.Reverse(currentChunkBytes);\n'
            '                            DebugHelp.DebugWriteLine($"sending chunk {currentChunk}/{totalChunksToSend} with size {chunkData.Length + 8}");\n'
            '                            // Minerva patch: single-Write framing.\n'
            '                            // 4 concurrent BeginWrite per chunk let the thread\n'
            '                            // pool interleave framing-header bytes with payload\n'
            '                            // bytes on the wire, corrupting the receiver state\n'
            '                            // machine after the first burst (broke SSH-over-SOCKS\n'
            '                            // mid-stream). Pack header + payload into one buffer\n'
            '                            // and emit one synchronous Write so wire order is\n'
            '                            // guaranteed.\n'
            '                            byte[] frame = new byte[12 + chunkData.Length];\n'
            '                            Buffer.BlockCopy(sizeBytes,         0, frame, 0,  4);\n'
            '                            Buffer.BlockCopy(totalChunkBytes,   0, frame, 4,  4);\n'
            '                            Buffer.BlockCopy(currentChunkBytes, 0, frame, 8,  4);\n'
            '                            Buffer.BlockCopy(chunkData,         0, frame, 12, chunkData.Length);\n'
            '                            c.GetStream().Write(frame, 0, frame.Length);\n'
        )
        if OLD_A1 in content:
            backup_once(A1_PATH)
            with open(A1_PATH, 'w') as f:
                f.write(content.replace(OLD_A1, NEW_A1, 1))
            patches_applied += 1
            print('[+] Patch A1 applied  (TcpProfile.cs single-Write framing)')
        else:
            print('[!] WARNING: Patch A1 — target block not found; file structure may differ')

# ──────────────────────────────────────────────────────────────────────────────
# Patch A2 — SocksClient.cs: synchronous queue drain + neutralised OnDataSent
# ──────────────────────────────────────────────────────────────────────────────
A2_MARKER = 'Minerva patch: synchronous drain'
A2_PATH = os.path.join(apollo_src, 'Apollo/Management/Socks/SocksClient.cs')

if not os.path.exists(A2_PATH):
    print('[!] Patch A2 — SocksClient.cs not found, skipping')
else:
    with open(A2_PATH, 'r') as f:
        content = f.read()
    if A2_MARKER in content:
        print('[+] Patch A2 already applied  (SocksClient.cs synchronous drain)')
    else:
        # — Step 1: replace the _sendRequestsAction body —
        OLD_A2_ACT = (
            '            _sendRequestsAction = (object c) =>\n'
            '            {\n'
            '                TcpClient client = (TcpClient)c;\n'
            '                while(!_cts.IsCancellationRequested && client.Connected)\n'
            '                {\n'
            '                    try\n'
            '                    {\n'
            '                        WaitHandle.WaitAny(new WaitHandle[] {_requestEvent, _cts.Token.WaitHandle});\n'
            '                    }\n'
            '                    catch (OperationCanceledException)\n'
            '                    {\n'
            '                        break;\n'
            '                    }\n'
            '                    if (!_cts.IsCancellationRequested && client.Connected && _requestQueue.TryDequeue(out byte[] result))\n'
            '                    {\n'
            '                        try\n'
            '                        {\n'
            '                            client.GetStream().BeginWrite(result, 0, result.Length, OnDataSent, c);\n'
            '                        }\n'
            '                        catch\n'
            '                        {\n'
            '                            break;\n'
            '                        }\n'
            '                    } else if (_cts.IsCancellationRequested || !client.Connected)\n'
            '                    {\n'
            '                        break;\n'
            '                    }\n'
            '                }\n'
            '                client.Close();\n'
            '            };\n'
        )
        NEW_A2_ACT = (
            '            // Minerva patch: synchronous drain. The original loop combined\n'
            '            // an AutoResetEvent wait with a single TryDequeue per wake AND a\n'
            '            // duplicate consumer in OnDataSent that also dequeued and started\n'
            '            // a parallel BeginWrite. AutoResetEvent collapses multiple Set()s\n'
            '            // into one signal, so items piled up while two writers raced the\n'
            '            // queue and issued concurrent BeginWrites on the same NetworkStream\n'
            '            // — bytes interleaved on the wire and any encrypted SOCKS stream\n'
            '            // (SSH, TLS) desynced after the first burst. Fix: drain the queue\n'
            '            // inside each wakeup and use synchronous Write so wire order is\n'
            '            // guaranteed and dropped-signal races disappear.\n'
            '            _sendRequestsAction = (object c) =>\n'
            '            {\n'
            '                TcpClient client = (TcpClient)c;\n'
            '                while (!_cts.IsCancellationRequested && client.Connected)\n'
            '                {\n'
            '                    try\n'
            '                    {\n'
            '                        WaitHandle.WaitAny(new WaitHandle[] { _requestEvent, _cts.Token.WaitHandle });\n'
            '                    }\n'
            '                    catch (OperationCanceledException)\n'
            '                    {\n'
            '                        break;\n'
            '                    }\n'
            '                    while (!_cts.IsCancellationRequested && client.Connected\n'
            '                           && _requestQueue.TryDequeue(out byte[] result))\n'
            '                    {\n'
            '                        try\n'
            '                        {\n'
            '                            client.GetStream().Write(result, 0, result.Length);\n'
            '                        }\n'
            '                        catch\n'
            '                        {\n'
            '                            _cts.Cancel();\n'
            '                            break;\n'
            '                        }\n'
            '                    }\n'
            '                }\n'
            '                client.Close();\n'
            '            };\n'
        )
        new_content = None
        if OLD_A2_ACT in content:
            new_content = content.replace(OLD_A2_ACT, NEW_A2_ACT, 1)
        else:
            print('[!] WARNING: Patch A2 — _sendRequestsAction target block not found')

        if new_content is not None:
            # — Step 2: neutralise the legacy OnDataSent body —
            OLD_OND = (
                '        private void OnDataSent(IAsyncResult result)\n'
                '        {\n'
                '            TcpClient client = (TcpClient)result.AsyncState;\n'
                '            if (client.Connected && !_cts.IsCancellationRequested)\n'
                '            {\n'
                '                try\n'
                '                {\n'
                '                    client.GetStream().EndWrite(result);\n'
                '                    // Potentially delete this since theoretically the sender Task does everything\n'
                '                    if (_requestQueue.TryDequeue(out byte[] data))\n'
                '                    {\n'
                '                        client.GetStream().BeginWrite(data, 0, data.Length, OnDataSent, client);\n'
                '                    }\n'
                '                }\n'
                '                catch (System.IO.IOException)\n'
                '                {\n'
                '                    \n'
                '                }\n'
                '            }\n'
                '        }\n'
            )
            NEW_OND = (
                '        // Minerva patch: legacy callback kept for source compatibility but\n'
                '        // no longer used by the sender task (writes are synchronous now).\n'
                '        // Defensive EndWrite in case any stray BeginWrite is still in\n'
                '        // flight at shutdown.\n'
                '        private void OnDataSent(IAsyncResult result)\n'
                '        {\n'
                '            try\n'
                '            {\n'
                '                TcpClient client = (TcpClient)result.AsyncState;\n'
                '                if (client.Connected) client.GetStream().EndWrite(result);\n'
                '            }\n'
                '            catch { /* swallow */ }\n'
                '        }\n'
            )
            if OLD_OND in new_content:
                new_content = new_content.replace(OLD_OND, NEW_OND, 1)
            else:
                print('[!] WARNING: Patch A2 — OnDataSent target block not found (left unchanged)')

            backup_once(A2_PATH)
            with open(A2_PATH, 'w') as f:
                f.write(new_content)
            patches_applied += 1
            print('[+] Patch A2 applied  (SocksClient.cs synchronous drain + OnDataSent neutralised)')

# ──────────────────────────────────────────────────────────────────────────────
# Patch A3 — IPC.cs: RECV_SIZE / SEND_SIZE → 65535
# ──────────────────────────────────────────────────────────────────────────────
A3_MARKER = 'Minerva patch: enlarged IPC buffers'
A3_PATH = os.path.join(apollo_src, 'ApolloInterop/Constants/IPC.cs')

if not os.path.exists(A3_PATH):
    print('[!] Patch A3 — IPC.cs not found, skipping')
else:
    with open(A3_PATH, 'r') as f:
        content = f.read()
    if A3_MARKER in content:
        print('[+] Patch A3 already applied  (IPC.cs RECV_SIZE/SEND_SIZE = 65535)')
    else:
        # Replace both constants; tag with marker comment so we can detect on rerun.
        new_content = re.sub(
            r'public const int SEND_SIZE\s*=\s*\d+\s*;',
            'public const int SEND_SIZE = 65535; // Minerva patch: enlarged IPC buffers',
            content, count=1,
        )
        new_content = re.sub(
            r'public const int RECV_SIZE\s*=\s*\d+\s*;',
            'public const int RECV_SIZE = 65535;',
            new_content, count=1,
        )
        if new_content != content:
            backup_once(A3_PATH)
            with open(A3_PATH, 'w') as f:
                f.write(new_content)
            patches_applied += 1
            print('[+] Patch A3 applied  (IPC.cs RECV_SIZE/SEND_SIZE bumped to 65535)')
        else:
            print('[!] WARNING: Patch A3 — RECV_SIZE/SEND_SIZE pattern not found')

print(f'\n[*] {patches_applied} new patch(es) applied this run')
sys.exit(0)
PYEOF

echo ""
ok "====================================================="
ok "  Mythic agent patches applied"
ok "====================================================="
echo ""
info "Patches summary:"
echo "  A1. Apollo TcpProfile.cs  — single-Write framing"
echo "                              fixes wire-byte interleave under bursty traffic"
echo "  A2. Apollo SocksClient.cs — synchronous queue drain"
echo "                              fixes parallel write race on SOCKS write path"
echo "  A3. Apollo IPC.cs         — RECV/SEND buffer 30000 → 65535"
echo "                              larger SOCKS chunks per beacon"
echo ""
warn "Apollo payloads currently checked in were built with the OLD code."
warn "To pick up the fix you must rebuild / reissue the payload:"
warn "  - Mythic UI: payload row → action menu → 'Trigger New Build'"
warn "  - Or generate a fresh payload from Payload Management."
echo ""
info "Backups: each patched file has a one-time .minerva.bak sibling."
