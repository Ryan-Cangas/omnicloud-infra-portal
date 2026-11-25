import { INITIAL_WORKLOADS } from "../data/hypervisorData";
import {
  AuthUser,
  HostTelemetrySnapshot,
  LxcWorkload,
  SiemAlert,
  TailscaleMeshResponse,
} from "../types/omnicloud";

const TOKEN_STORAGE_KEY = "omnicloud_jwt_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export class ApiAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiAuthError";
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  tokenOverride?: string | null,
): Promise<T> {
  const token = tokenOverride !== undefined ? tokenOverride : getStoredToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    setStoredToken(null);
    throw new ApiAuthError("Session expired or unauthorized (401).");
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody && typeof errBody.detail === "string") {
        detail = errBody.detail;
      }
    } catch {
      // ignore non-JSON error payloads
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export async function loginOperator(
  username: string,
  password: string,
  mfaCode?: string,
): Promise<{ access_token: string; user: AuthUser }> {
  const data = await apiFetch<{
    access_token: string;
    token_type: string;
    user: AuthUser;
  }>(
    "/api/v1/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        mfa_code: mfaCode?.trim() || undefined,
      }),
    },
    null,
  );
  setStoredToken(data.access_token);
  return { access_token: data.access_token, user: data.user };
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  return apiFetch<AuthUser>("/api/v1/auth/me");
}

export async function fetchAnsiblePlaybooks(): Promise<string[]> {
  return apiFetch<string[]>("/api/v1/provision/playbooks");
}

export function getProvisionWsUrl(engine: "terraform" | "ansible"): string {
  const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${window.location.host}/api/v1/ws/provision/${engine}`;
}

function formatSecondsUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return "0d 00h";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${String(hours).padStart(2, "0")}h`;
}

interface RawClusterResource {
  vmid: number;
  name: string;
  node: string;
  type: string;
  status: string;
  uptime: number;
  maxmem_gb: number;
  mem_usage_pct: number;
  cpu_usage_pct: number;
}

export async function fetchClusterWorkloads(): Promise<LxcWorkload[]> {
  const rawList = await apiFetch<RawClusterResource[]>(
    "/api/v1/cluster/resources",
  );
  const catalogByVmid = new Map<number, LxcWorkload>(
    INITIAL_WORKLOADS.map((w) => [w.vmid, w]),
  );

  const mapped: LxcWorkload[] = rawList.map((item) => {
    const meta = catalogByVmid.get(item.vmid);
    const isRunning = item.status === "running";
    const normalizedType: "LXC" | "KVM" =
      item.type?.toLowerCase() === "qemu" ? "KVM" : "LXC";

    return {
      vmid: item.vmid,
      name: item.name || meta?.name || `guest-${item.vmid}`,
      node: item.node || meta?.node || "pve-server",
      type: normalizedType,
      state: isRunning ? "running" : "stopped",
      cpu: isRunning ? Number(item.cpu_usage_pct.toFixed(2)) : 0.0,
      vcpus: meta?.vcpus ?? 2,
      memPct: isRunning ? Number(item.mem_usage_pct.toFixed(2)) : 0.0,
      ramPoolGb: item.maxmem_gb > 0 ? item.maxmem_gb : (meta?.ramPoolGb ?? 1.0),
      tailnetIp: meta?.tailnetIp ?? `100.117.21.${item.vmid % 250}`,
      lanIp: meta?.lanIp ?? `10.10.20.${item.vmid % 250}`,
      port: meta?.port ?? "22/tcp",
      description:
        meta?.description ??
        `Proxmox ${normalizedType} Workload (#${item.vmid})`,
      category: meta?.category ?? "INFRASTRUCTURE",
      domain:
        meta?.domain ??
        `https://${(item.name || `guest-${item.vmid}`).toLowerCase()}.dxb.ts.net`,
      tlsDaysLeft: meta?.tlsDaysLeft ?? 84,
      peerMode: isRunning ? (meta?.peerMode ?? "direct") : "DERP",
      rttMs: isRunning ? (meta?.rttMs ?? 1.1) : 0.0,
      uptime: isRunning ? formatSecondsUptime(item.uptime) : "0d 00h",
    };
  });

  return mapped.sort((a, b) => a.vmid - b.vmid);
}

export async function controlWorkloadPower(
  node: string,
  type: "LXC" | "KVM",
  vmid: number,
  action: "start" | "shutdown" | "stop" | "reboot",
): Promise<{ status: string; action: string; upid: string; actor: string }> {
  const pveType = type === "KVM" ? "qemu" : "lxc";
  return apiFetch(
    `/api/v1/nodes/${encodeURIComponent(node)}/${pveType}/${vmid}/power/${action}`,
    { method: "POST" },
  );
}

export async function requestConsoleSession(
  node: string,
  type: "LXC" | "KVM",
  vmid: number,
): Promise<{
  wsUrl: string;
  ticket: string;
  port: number;
  user: string;
}> {
  const pveType = type === "KVM" ? "qemu" : "lxc";

  const [{ console_token }, proxyInfo] = await Promise.all([
    apiFetch<{ console_token: string }>("/api/v1/auth/console-token", {
      method: "POST",
      body: JSON.stringify({ node, vm_type: pveType, vmid }),
    }),
    apiFetch<{
      ticket: string;
      port: number;
      session_ticket: string;
      user: string;
    }>(
      `/api/v1/nodes/${encodeURIComponent(node)}/${pveType}/${vmid}/vncproxy`,
      { method: "POST" },
    ),
  ]);

  const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({
    port: String(proxyInfo.port),
    ticket: proxyInfo.ticket,
    session_ticket: proxyInfo.session_ticket,
    auth_token: console_token,
  });

  return {
    wsUrl: `${wsProto}//${window.location.host}/api/v1/ws/vnc/${encodeURIComponent(node)}/${pveType}/${vmid}?${params.toString()}`,
    ticket: proxyInfo.ticket,
    port: proxyInfo.port,
    user: proxyInfo.user,
  };
}

export async function fetchHostTelemetry(): Promise<HostTelemetrySnapshot> {
  return apiFetch<HostTelemetrySnapshot>("/api/v1/nodes/telemetry");
}

export async function fetchTailscaleMesh(): Promise<TailscaleMeshResponse> {
  return apiFetch<TailscaleMeshResponse>("/api/v1/network/mesh");
}

export async function fetchSecurityNodes(): Promise<string[]> {
  return apiFetch<string[]>("/api/v1/security/nodes");
}

interface RawWazuhAlert {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "CRITICAL";
  level_number: number;
  source: string;
  event: string;
  ip_address: string;
  rule_id: string;
}

export async function fetchSecurityAlerts(
  node = "All Nodes",
  severity = "ALL",
  limit = 40,
): Promise<SiemAlert[]> {
  const params = new URLSearchParams({
    node,
    severity,
    limit: String(limit),
  });
  const rows = await apiFetch<RawWazuhAlert[]>(
    `/api/v1/security/alerts?${params.toString()}`,
  );
  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    level: r.level,
    daemon: `${r.source} [rule:${r.rule_id}]`,
    sourceIp: r.ip_address,
    message: r.event,
    ruleId: r.rule_id,
  }));
}
