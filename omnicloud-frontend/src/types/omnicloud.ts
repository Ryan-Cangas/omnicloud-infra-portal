export type WorkloadState = "running" | "stopped";

export type NavTabId =
  | "overview"
  | "telemetry"
  | "sdn"
  | "catalog"
  | "security";

export type ServiceCategory = "INFRASTRUCTURE" | "MEDIA" | "SECURITY";

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

export interface SiemAlert {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "CRITICAL";
  daemon: string;
  sourceIp: string;
  message: string;
}

export interface Fail2BanEntry {
  id: string;
  ip: string;
  jail: string;
  attempts: number;
  remaining: string;
  country: string;
}
