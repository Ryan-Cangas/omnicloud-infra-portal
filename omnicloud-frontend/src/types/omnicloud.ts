export type WorkloadState = "running" | "stopped";

export type NavTabId =
  | "overview"
  | "telemetry"
  | "sdn"
  | "catalog"
  | "security"
  | "provision";

export type ServiceCategory = "INFRASTRUCTURE" | "MEDIA" | "SECURITY";

export interface AuthUser {
  userId: string;
  role: "SuperAdmin" | "Guest" | string;
  name: string;
}

export interface LxcWorkload {
  vmid: number;
  name: string;
  node: string;
  type: "LXC" | "KVM";
  state: WorkloadState;
  cpu: number;
  vcpus: number;
  memPct: number;
  ramPoolGb: number;
  tailnetIp: string;
  lanIp: string;
  port: string;
  description: string;
  category: ServiceCategory;
  domain: string;
  tlsDaysLeft: number;
  peerMode: "direct" | "DERP";
  rttMs: number;
  uptime: string;
}

export interface StoragePool {
  id: string;
  mount: string;
  filesystem: string;
  device: string;
  usedGb: number;
  totalGb: number;
  smartStatus: "PASSED" | "DEGRADED";
  tempC: number;
}

export interface TelemetryPoint {
  time: string;
  cpu: number;
  memory: number;
  net_in: number;
  net_out: number;
  storage: number;
  iowait: number;
}

export interface HostTelemetrySnapshot {
  node: string;
  cpu: {
    usage_pct: number;
    cores: number;
    sockets: number;
    model: string;
    mhz: string;
    loadavg: number[];
    iowait_pct: number;
  };
  memory: {
    used_gb: number;
    total_gb: number;
    free_gb: number;
    usage_pct: number;
    swap_used_gb: number;
    swap_total_gb: number;
    swap_pct: number;
  };
  storage: {
    rootfs: {
      used_gb: number;
      total_gb: number;
      free_gb: number;
      usage_pct: number;
    };
    pools: {
      name: string;
      type: string;
      category: string;
      total_gb: number;
      used_gb: number;
      free_gb: number;
      usage_pct: number;
      active: boolean;
    }[];
    disks: {
      devpath: string;
      model: string;
      size_gb: number;
      type: string;
      health: string;
      serial: string;
    }[];
  };
  network: {
    interfaces: {
      name: string;
      type: string;
      active: boolean;
      address: string;
      comment: string;
    }[];
    rx_rate_kbps: number;
    tx_rate_kbps: number;
  };
  system: {
    pve_version: string;
    kernel_version: string;
    uptime_seconds: number;
    uptime_formatted: string;
    boot_time: string;
  };
  history: TelemetryPoint[];
}

export interface TailscaleMeshResponse {
  local: {
    node_name: string;
    tailscale_ip: string;
    derp_relay: string;
    direct_connections: number;
    relayed_connections: number;
  };
  peers: {
    id: string;
    hostname: string;
    tailscale_ip: string;
    os: string;
    online: boolean;
    active: boolean;
    connection_type: string;
    endpoint: string;
    relay: string;
    rx_bytes: number;
    tx_bytes: number;
    last_handshake: string;
  }[];
}

export interface SiemAlert {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "CRITICAL";
  daemon: string;
  sourceIp: string;
  message: string;
  ruleId?: string;
}

export interface Fail2BanEntry {
  id: string;
  ip: string;
  jail: string;
  attempts: number;
  remaining: string;
  country: string;
}
