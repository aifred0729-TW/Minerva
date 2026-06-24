/**
 * Adapter — synthesise one `CallbackPort` per Mythic operation that has
 * an MSF SOCKS tunnel running. Lets the existing Tunnels page (graph,
 * filter, stats, row component) render MSF tunnels alongside Mythic ones
 * without any special-casing.
 *
 * Why per-operation: the MSF tunnel rework collapsed every meterpreter
 * session in the operation onto a single SOCKS port — so one row per op,
 * not one per session. The embedded `callback` block on each row picks
 * a representative session (the most-recently attached) so the row's
 * "host/ip/user" cells aren't empty; the operator clicks through to the
 * SOCKS dialog to see the full session list.
 *
 * Collision avoidance: Mythic `callbackport.id` is a Postgres serial
 * (always positive). We use a negative id derived from the operation
 * port so each MSF tunnel has a stable, unique key:
 *   id = -100000 - port  →  e.g. port 7102 ⇒ id = -107102
 */
import type { CallbackPort } from '../../types/tunnels';
import type { Callback } from '../../types/callbacks';
import type { MsfOperationTunnel } from '../Metasploit/msfTunnelStore';

export const MSF_PORT_ID_BASE = -100000;

export function msfTunnelToCallbackPort(t: MsfOperationTunnel, representative: Callback | undefined): CallbackPort {
    const subnets = Object.values(t.sessions).flatMap(s => s.subnets);
    const sessionCount = Object.keys(t.sessions).length;
    const remoteIp = subnets[0] || representative?.ip || `op${t.operationId}`;
    return {
        id: MSF_PORT_ID_BASE - t.port,
        deleted: false,
        port_type: 'socks',
        local_port: t.port,
        remote_port: 0,
        remote_ip: remoteIp,
        bytes_received: 0,
        bytes_sent: 0,
        username: '',
        password: '',
        updated_at: t.startedAt,
        task: undefined,
        callback: {
            id: representative?.id ?? -1,
            display_id: representative?.display_id ?? 0,
            host: representative?.host || `op-${t.operationId}`,
            ip: representative?.ip || subnets.join(', '),
            user: representative?.user || '',
            description: `MSF SOCKS · ${sessionCount} session${sessionCount === 1 ? '' : 's'} · ${subnets.length} route${subnets.length === 1 ? '' : 's'}`,
            domain: representative?.domain || '',
            process_name: representative?.process_name || '',
            integrity_level: representative?.integrity_level || 0,
            active: true,
            sleep_info: '',
            init_callback: t.startedAt,
            last_checkin: representative?.last_checkin || t.startedAt,
            payload: representative?.payload ? {
                uuid: (representative.payload as any).uuid ?? `msf-op-${t.operationId}`,
                payloadtype: { name: representative.payload.payloadtype?.name || 'METERPRETER' },
                payloadc2profiles: [],
                c2profileparametersinstances: [],
            } : undefined,
        },
    };
}

export function isMsfPortId(id: number): boolean {
    return id <= MSF_PORT_ID_BASE;
}
