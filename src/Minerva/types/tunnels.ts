// ═══════════════════════════════════════════════
//  Tunnel / Callback Port domain types
// ═══════════════════════════════════════════════

export interface C2ParamInstance {
    value: string;
    c2profileparameter: { name: string };
    c2profile: { name: string };
}

export interface PayloadC2Profile {
    c2profile: { name: string; is_p2p: boolean };
}

export interface CallbackPort {
    id: number;
    deleted: boolean;
    port_type: 'socks' | 'rpfwd' | 'interactive';
    local_port: number;
    remote_port: number;
    remote_ip: string;
    bytes_received: number;
    bytes_sent: number;
    username: string;
    password: string;
    updated_at: string;
    task?: { display_id: number };
    callback: {
        id: number;
        display_id: number;
        host: string;
        ip: string;
        user: string;
        description: string;
        domain: string;
        process_name: string;
        integrity_level: number;
        active: boolean;
        sleep_info: string;
        init_callback: string;
        last_checkin: string;
        payload?: {
            uuid: string;
            payloadtype: { name: string };
            payloadc2profiles: PayloadC2Profile[];
            c2profileparametersinstances: C2ParamInstance[];
        };
    };
}
