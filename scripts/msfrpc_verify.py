#!/usr/bin/env python3
"""Verify MSF-RPC connectivity — login, fetch version & module stats."""

import sys
import ssl
import http.client
import json
import struct

HOST = "127.0.0.1"
PORT = 55553
USER = "msf"
PASS = "minerva_msf"

# ── Minimal msgpack helpers (no third-party deps) ────────────────────────────
def _pack(obj):
    """Encode a Python object to MessagePack bytes (subset)."""
    if obj is None:
        return b"\xc0"
    if isinstance(obj, bool):
        return b"\xc3" if obj else b"\xc2"
    if isinstance(obj, int):
        if 0 <= obj <= 0x7F:
            return struct.pack("B", obj)
        if -32 <= obj < 0:
            return struct.pack("b", obj)
        if 0 <= obj <= 0xFF:
            return b"\xcc" + struct.pack("B", obj)
        if 0 <= obj <= 0xFFFF:
            return b"\xcd" + struct.pack(">H", obj)
        if 0 <= obj <= 0xFFFFFFFF:
            return b"\xce" + struct.pack(">I", obj)
        return b"\xcf" + struct.pack(">Q", obj)
    if isinstance(obj, str):
        raw = obj.encode("utf-8")
        l = len(raw)
        if l <= 31:
            return struct.pack("B", 0xA0 | l) + raw
        if l <= 0xFF:
            return b"\xd9" + struct.pack("B", l) + raw
        if l <= 0xFFFF:
            return b"\xda" + struct.pack(">H", l) + raw
        return b"\xdb" + struct.pack(">I", l) + raw
    if isinstance(obj, bytes):
        l = len(obj)
        if l <= 0xFF:
            return b"\xc4" + struct.pack("B", l) + obj
        if l <= 0xFFFF:
            return b"\xc5" + struct.pack(">H", l) + obj
        return b"\xc6" + struct.pack(">I", l) + obj
    if isinstance(obj, (list, tuple)):
        l = len(obj)
        if l <= 15:
            hdr = struct.pack("B", 0x90 | l)
        elif l <= 0xFFFF:
            hdr = b"\xdc" + struct.pack(">H", l)
        else:
            hdr = b"\xdd" + struct.pack(">I", l)
        return hdr + b"".join(_pack(i) for i in obj)
    if isinstance(obj, dict):
        l = len(obj)
        if l <= 15:
            hdr = struct.pack("B", 0x80 | l)
        elif l <= 0xFFFF:
            hdr = b"\xde" + struct.pack(">H", l)
        else:
            hdr = b"\xdf" + struct.pack(">I", l)
        return hdr + b"".join(_pack(k) + _pack(v) for k, v in obj.items())
    raise TypeError(f"Cannot pack {type(obj)}")


def _unpack_from(buf, off):
    """Decode one MessagePack object from buf at offset; return (obj, new_off)."""
    b = buf[off]
    off += 1
    # positive fixint
    if b <= 0x7F:
        return b, off
    # negative fixint
    if b >= 0xE0:
        return struct.unpack("b", bytes([b]))[0], off
    # fixstr
    if 0xA0 <= b <= 0xBF:
        l = b & 0x1F
        return buf[off:off+l].decode("utf-8", errors="replace"), off+l
    # fixarray
    if 0x90 <= b <= 0x9F:
        l = b & 0x0F
        arr = []
        for _ in range(l):
            v, off = _unpack_from(buf, off)
            arr.append(v)
        return arr, off
    # fixmap
    if 0x80 <= b <= 0x8F:
        l = b & 0x0F
        d = {}
        for _ in range(l):
            k, off = _unpack_from(buf, off)
            v, off = _unpack_from(buf, off)
            d[k] = v
        return d, off
    # nil, bool
    if b == 0xC0: return None, off
    if b == 0xC2: return False, off
    if b == 0xC3: return True, off
    # bin 8/16/32 — MSF-RPC encodes strings as bin; decode to str
    if b == 0xC4:
        l = buf[off]; off+=1; return buf[off:off+l].decode("utf-8", errors="replace"), off+l
    if b == 0xC5:
        l = struct.unpack(">H", buf[off:off+2])[0]; off+=2; return buf[off:off+l].decode("utf-8", errors="replace"), off+l
    if b == 0xC6:
        l = struct.unpack(">I", buf[off:off+4])[0]; off+=4; return buf[off:off+l].decode("utf-8", errors="replace"), off+l
    # uint 8/16/32/64
    if b == 0xCC: return buf[off], off+1
    if b == 0xCD: return struct.unpack(">H", buf[off:off+2])[0], off+2
    if b == 0xCE: return struct.unpack(">I", buf[off:off+4])[0], off+4
    if b == 0xCF: return struct.unpack(">Q", buf[off:off+8])[0], off+8
    # int 8/16/32/64
    if b == 0xD0: return struct.unpack("b", buf[off:off+1])[0], off+1
    if b == 0xD1: return struct.unpack(">h", buf[off:off+2])[0], off+2
    if b == 0xD2: return struct.unpack(">i", buf[off:off+4])[0], off+4
    if b == 0xD3: return struct.unpack(">q", buf[off:off+8])[0], off+8
    # str 8/16/32
    if b == 0xD9:
        l = buf[off]; off+=1; return buf[off:off+l].decode("utf-8", errors="replace"), off+l
    if b == 0xDA:
        l = struct.unpack(">H", buf[off:off+2])[0]; off+=2; return buf[off:off+l].decode("utf-8", errors="replace"), off+l
    if b == 0xDB:
        l = struct.unpack(">I", buf[off:off+4])[0]; off+=4; return buf[off:off+l].decode("utf-8", errors="replace"), off+l
    # array 16/32
    if b == 0xDC:
        l = struct.unpack(">H", buf[off:off+2])[0]; off+=2
        arr = []
        for _ in range(l): v, off = _unpack_from(buf, off); arr.append(v)
        return arr, off
    if b == 0xDD:
        l = struct.unpack(">I", buf[off:off+4])[0]; off+=4
        arr = []
        for _ in range(l): v, off = _unpack_from(buf, off); arr.append(v)
        return arr, off
    # map 16/32
    if b == 0xDE:
        l = struct.unpack(">H", buf[off:off+2])[0]; off+=2
        d = {}
        for _ in range(l): k, off = _unpack_from(buf, off); v, off = _unpack_from(buf, off); d[k] = v
        return d, off
    if b == 0xDF:
        l = struct.unpack(">I", buf[off:off+4])[0]; off+=4
        d = {}
        for _ in range(l): k, off = _unpack_from(buf, off); v, off = _unpack_from(buf, off); d[k] = v
        return d, off
    raise ValueError(f"Unknown msgpack byte: 0x{b:02X}")


def _unpack(buf):
    obj, _ = _unpack_from(buf, 0)
    return obj


# ── RPC call via HTTPS + MessagePack ─────────────────────────────────────────
def rpc_call(method, *args, token=None):
    """Send an MSF-RPC call and return the decoded response."""
    payload = [method] + ([token] if token else []) + list(args)
    body = _pack(payload)

    conn = http.client.HTTPConnection(HOST, PORT, timeout=15)
    conn.request("POST", "/api/", body=body, headers={
        "Content-Type": "binary/message-pack",
    })
    resp = conn.getresponse()
    data = resp.read()
    conn.close()
    return _unpack(data)


def main():
    print(f"[*] Connecting to msfrpcd at {HOST}:{PORT} ...")

    # 1. Login
    try:
        res = rpc_call("auth.login", USER, PASS)
    except ConnectionRefusedError:
        print(f"[-] Connection refused — is minerva_msf running on {HOST}:{PORT}?")
        sys.exit(1)
    except Exception as e:
        print(f"[-] Connection error: {e}")
        sys.exit(1)

    if "error" in res:
        print(f"[-] Login failed: {res}")
        sys.exit(1)

    token = res.get("token")
    if not token:
        print(f"[-] No token in response: {res}")
        sys.exit(1)
    print(f"[+] Authenticated — token: {token[:12]}...")

    # 2. Core version
    ver = rpc_call("core.version", token=token)
    print(f"[+] Metasploit version : {ver.get('version', '?')}")
    print(f"    Ruby               : {ver.get('ruby', '?')}")
    print(f"    API                : {ver.get('api', '?')}")

    # 3. Module counts (individual calls — module.stats does not exist)
    print(f"[+] Module counts:")
    for mod_type in ["exploits", "auxiliary", "post", "payloads", "encoders", "nops", "evasion"]:
        try:
            mods = rpc_call(f"module.{mod_type}", token=token)
            count = len(mods.get("modules", []))
            print(f"    {mod_type:20s}: {count}")
        except Exception as e:
            print(f"    {mod_type:20s}: error ({e})")

    # 4. Logout
    rpc_call("auth.logout", token, token=token)
    print("[+] Logged out — MSF-RPC is operational!")


if __name__ == "__main__":
    main()
