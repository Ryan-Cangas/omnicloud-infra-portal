/**
 * OmniOps Sovereign Homelab Operations Center
 *
 * Architecture & Modules:
 * 1. Hypervisor Gateway: Multi-guest compute inspection with isolated noVNC WebSocket consoles.
 * 2. Bare-Metal Telemetry: Real-time SVG time-series graphs for CPU, RAM, NVMe/HDD storage, and Network I/O.
 * 3. Service Catalog: Health-check matrix and latency probes across homelab containers and services.
 * 4. Security & Audit: Host intrusion events, SSH logins, and container status feeds.
 * 5. Maintenance Operations: Snapshot management, ZFS scrubs, and maintenance workflows.
 * 6. Notion 2-Way Sync: Multi-database sync for Homelab Runbooks and Future Hardware Expansions.
 * 7. Service Launchpad: Direct access to hosted web applications.
 */

import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  BarChart3,
  Boxes,
  Activity,
  ShieldCheck,
  Calendar as CalendarIcon,
  StickyNote,
  Wrench,
  Grid,
  Terminal,
  Play,
  Square,
  RotateCcw,
  Server,
  CheckCircle2,
  Clock,
  Cpu,
  HardDrive,
  Plus,
  ExternalLink,
  Lock,
  UserCheck,
  CalendarDays,
  Tag,
  LogOut,
  KeyRound,
  Zap,
  Radio,
  Disc,
  Layers,
  Cloud,
  Image as ImageIcon,
  Network,
  Globe,
  Filter,
} from "lucide-react";
import { VncTerminal } from "./components/VncTerminal";

type Role = "SuperAdmin" | "TenantAdmin" | "TenantViewer" | "Operator";

interface PersonaProfile {
  userId: string;
  role: Role;
  tenantId: string;
  name: string;
  defaultPassword?: string;
}

const PERSONA_ACCOUNTS: PersonaProfile[] = [
  {
    userId: "admin-01",
    role: "SuperAdmin",
    tenantId: "global",
    name: "Ryan Cangas (SuperAdmin)",
    defaultPassword: "password123",
  },
  {
    userId: "tenant-alex",
    role: "TenantAdmin",
    tenantId: "tenant-alpha",
    name: "Alpha Workloads (Admin)",
    defaultPassword: "password123",
  },
  {
    userId: "viewer-sam",
    role: "TenantViewer",
    tenantId: "tenant-alpha",
    name: "Homelab Guest (Viewer)",
    defaultPassword: "password123",
  },
  {
    userId: "operator-ops",
    role: "Operator",
    tenantId: "tenant-alpha",
    name: "Infrastructure Operator",
    defaultPassword: "password123",
  },
];

interface GuestResource {
  vmid: number;
  name: string;
  node: string;
  type: "qemu" | "lxc";
  status: "running" | "stopped";
  uptime: number;
  maxmem_gb: number;
  mem_usage_pct: number;
  cpu_usage_pct: number;
}

interface StoragePool {
  name: string;
  type: string;
  category: string;
  total_gb: number;
  used_gb: number;
  free_gb: number;
  usage_pct: number;
  active: boolean;
}

interface PhysicalDisk {
  devpath: string;
  model: string;
  size_gb: number;
  type: string;
  health: string;
  serial: string;
}

interface NetworkInterface {
  name: string;
  type: string;
  active: boolean;
  address: string;
  comment: string;
}

interface TelemetrySample {
  time: string;
  cpu: number;
  memory: number;
  net_in: number;
  net_out: number;
  storage: number;
  iowait: number;
}

interface NodeTelemetry {
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
    pools: StoragePool[];
    disks: PhysicalDisk[];
  };
  network: {
    interfaces: NetworkInterface[];
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
  history: TelemetrySample[];
}

interface MaintenanceTask {
  id: number;
  title: string;
  category: "Storage" | "Hypervisor" | "Security" | "Backup";
  status: "Pending" | "In Progress" | "Completed";
  priority: "High" | "Medium" | "Low";
  scheduled: string;
  target: string;
}

interface CalendarEvent {
  id: number;
  title: string;
  type: "Maintenance" | "Security Audit" | "ZFS Scrub" | "Snapshot Backup";
  date: string;
  time: string;
  targetNode: string;
}

interface NoteItem {
  id: string;
  title: string;
  tag: "Infrastructure" | "Security" | "Update";
  snippet: string;
  author: string;
  updated: string;
}

interface UpgradeItem {
  id: string;
  title: string;
  category: "Hardware" | "Software";
  priority: "High" | "Medium" | "Low";
  description: string;
  requested_by: string;
  date_added: string;
}

interface ServiceEndpoint {
  name: string;
  category: string;
  url: string;
  port: number;
  status: "Healthy" | "Degraded" | "Offline";
  latency_ms: number;
  host_node: string;
  uptime_pct: number;
}

interface SecurityAuditLog {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "CRITICAL";
  source: string;
  event: string;
  ip_address: string;
}

// ---------------------------------------------------------------------------
// Native SVG Interactive Graph Components
// ---------------------------------------------------------------------------

function formatSpeed(kbps: number) {
  // Convert KB/s (Kilobytes/sec) to Mbps (Megabits/sec)
  const mbps = (kbps * 8) / 1000;
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`;
  return `${(kbps * 8).toFixed(0)} Kbps`;
}

function TelemetryAreaChart({
  data,
  dataKey,
  color,
  gradientId,
  unit = "%",
  maxValue = 100,
}: {
  data: TelemetrySample[];
  dataKey: keyof TelemetrySample;
  color: string;
  gradientId: string;
  unit?: string;
  maxValue?: number;
}) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="h-44 w-full flex items-center justify-center text-zinc-600 text-xs font-mono">
        Waiting for telemetry frames...
      </div>
    );
  }

  const width = 600;
  const height = 170;
  const padding = 20;
  const maxDataPoints = 30;
  const step = (width - 2 * padding) / Math.max(maxDataPoints - 1, 1);

  const points = data.map((d, index) => {
    const rawVal = Number(d[dataKey]) || 0;
    const clampedVal = Math.min(Math.max(rawVal, 0), maxValue);
    const x = padding + index * step;
    const y =
      height - padding - (clampedVal / maxValue) * (height - 2 * padding);
    return { x, y, val: rawVal, time: d.time };
  });

  const pathD = points.reduce(
    (acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`,
    "",
  );
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  return (
    <div className="w-full relative" onMouseLeave={() => setHoveredIdx(null)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-44 overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
          const y = height - padding - p * (height - 2 * padding);
          return (
            <line
              key={idx}
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke="#27272a"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          );
        })}

        <path
          d={areaD}
          fill={`url(#${gradientId})`}
          className="transition-all duration-500 ease-linear"
        />
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          className="transition-all duration-500 ease-linear"
        />

        {points.map((pt, i) => (
          <rect
            key={`hit-${i}`}
            x={pt.x - step / 2}
            y={0}
            width={step}
            height={height}
            fill="transparent"
            className="cursor-crosshair outline-none"
            onMouseEnter={() => setHoveredIdx(i)}
          />
        ))}

        {hoveredIdx !== null && points[hoveredIdx] && (
          <g className="pointer-events-none transition-all duration-75">
            <line
              x1={points[hoveredIdx].x}
              y1={padding}
              x2={points[hoveredIdx].x}
              y2={height - padding}
              stroke="#71717a"
              strokeDasharray="3 3"
            />
            <rect
              x={Math.max(0, Math.min(points[hoveredIdx].x - 35, width - 70))}
              y={0}
              width={70}
              height={34}
              fill="#18181b"
              rx="6"
              stroke="#3f3f46"
            />
            <text
              x={Math.max(35, Math.min(points[hoveredIdx].x, width - 35))}
              y={13}
              fill="#a1a1aa"
              fontSize="9"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {points[hoveredIdx].time}
            </text>
            <text
              x={Math.max(35, Math.min(points[hoveredIdx].x, width - 35))}
              y={26}
              fill={color}
              fontSize="11"
              fontFamily="monospace"
              textAnchor="middle"
              fontWeight="bold"
            >
              {points[hoveredIdx].val.toFixed(1)}
              {unit}
            </text>
            <circle
              cx={points[hoveredIdx].x}
              cy={points[hoveredIdx].y}
              r="4.5"
              fill="#ffffff"
              stroke={color}
              strokeWidth="2"
            />
          </g>
        )}

        {points.length > 0 && hoveredIdx === null && (
          <>
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r="4.5"
              fill={color}
              className="animate-ping transition-all duration-500 ease-linear"
            />
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r="4"
              fill="#ffffff"
              stroke={color}
              strokeWidth="2"
              className="transition-all duration-500 ease-linear"
            />
          </>
        )}
      </svg>

      <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-1 px-2">
        <span>{points[0]?.time || ""}</span>
        <span className="text-zinc-400 font-semibold">
          Current: {points[points.length - 1]?.val} {unit}
        </span>
        <span>{points[points.length - 1]?.time || ""}</span>
      </div>
    </div>
  );
}

function NetworkThroughputChart({ data }: { data: TelemetrySample[] }) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="h-44 w-full flex items-center justify-center text-zinc-600 text-xs font-mono">
        Polling network buffer...
      </div>
    );
  }

  const width = 600;
  const height = 170;
  const padding = 20;
  const maxDataPoints = 30;
  const step = (width - 2 * padding) / Math.max(maxDataPoints - 1, 1);

  const maxRate = Math.max(
    ...data.map((d) => Math.max(Number(d.net_in) || 0, Number(d.net_out) || 0)),
    50,
  );

  const getPoints = (key: "net_in" | "net_out") =>
    data.map((d, index) => {
      const val = Number(d[key]) || 0;
      const x = padding + index * step;
      const y = height - padding - (val / maxRate) * (height - 2 * padding);
      return { x, y, val, time: d.time };
    });

  const rxPoints = getPoints("net_in");
  const txPoints = getPoints("net_out");

  const buildPath = (pts: { x: number; y: number }[]) =>
    pts.reduce(
      (acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`,
      "",
    );

  return (
    <div className="w-full relative" onMouseLeave={() => setHoveredIdx(null)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-44 overflow-visible"
      >
        <defs>
          <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((p, idx) => {
          const y = height - padding - p * (height - 2 * padding);
          return (
            <line
              key={idx}
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke="#27272a"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          );
        })}

        <path
          d={`${buildPath(rxPoints)} L ${rxPoints[rxPoints.length - 1].x} ${height - padding} L ${rxPoints[0].x} ${height - padding} Z`}
          fill="url(#rxGrad)"
          className="transition-all duration-500 ease-linear"
        />
        <path
          d={buildPath(rxPoints)}
          fill="none"
          stroke="#10b981"
          strokeWidth="2.2"
          strokeLinecap="round"
          className="transition-all duration-500 ease-linear"
        />

        <path
          d={`${buildPath(txPoints)} L ${txPoints[txPoints.length - 1].x} ${height - padding} L ${txPoints[0].x} ${height - padding} Z`}
          fill="url(#txGrad)"
          className="transition-all duration-500 ease-linear"
        />
        <path
          d={buildPath(txPoints)}
          fill="none"
          stroke="#818cf8"
          strokeWidth="2.2"
          strokeDasharray="4 2"
          className="transition-all duration-500 ease-linear"
        />

        {rxPoints.map((pt, i) => (
          <rect
            key={`hit-${i}`}
            x={pt.x - step / 2}
            y={0}
            width={step}
            height={height}
            fill="transparent"
            className="cursor-crosshair outline-none"
            onMouseEnter={() => setHoveredIdx(i)}
          />
        ))}

        {hoveredIdx !== null &&
          rxPoints[hoveredIdx] &&
          txPoints[hoveredIdx] && (
            <g className="pointer-events-none transition-all duration-75">
              <line
                x1={rxPoints[hoveredIdx].x}
                y1={padding}
                x2={rxPoints[hoveredIdx].x}
                y2={height - padding}
                stroke="#71717a"
                strokeDasharray="3 3"
              />
              <rect
                x={Math.max(
                  0,
                  Math.min(rxPoints[hoveredIdx].x - 55, width - 110),
                )}
                y={0}
                width={110}
                height={46}
                fill="#18181b"
                rx="6"
                stroke="#3f3f46"
              />
              <text
                x={Math.max(55, Math.min(rxPoints[hoveredIdx].x, width - 55))}
                y={12}
                fill="#a1a1aa"
                fontSize="9"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {rxPoints[hoveredIdx].time}
              </text>
              <text
                x={Math.max(55, Math.min(rxPoints[hoveredIdx].x, width - 55))}
                y={25}
                fill="#10b981"
                fontSize="10"
                fontFamily="monospace"
                textAnchor="middle"
                fontWeight="bold"
              >
                RX: {formatSpeed(rxPoints[hoveredIdx].val)}
              </text>
              <text
                x={Math.max(55, Math.min(txPoints[hoveredIdx].x, width - 55))}
                y={38}
                fill="#818cf8"
                fontSize="10"
                fontFamily="monospace"
                textAnchor="middle"
                fontWeight="bold"
              >
                TX: {formatSpeed(txPoints[hoveredIdx].val)}
              </text>
              <circle
                cx={rxPoints[hoveredIdx].x}
                cy={rxPoints[hoveredIdx].y}
                r="3.5"
                fill="#ffffff"
                stroke="#10b981"
                strokeWidth="2"
              />
              <circle
                cx={txPoints[hoveredIdx].x}
                cy={txPoints[hoveredIdx].y}
                r="3.5"
                fill="#ffffff"
                stroke="#818cf8"
                strokeWidth="2"
              />
            </g>
          )}
      </svg>

      <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500 mt-1 px-2">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{" "}
            RX: {formatSpeed(rxPoints[rxPoints.length - 1]?.val || 0)}
          </span>
          <span className="flex items-center gap-1 text-indigo-400">
            <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />{" "}
            TX: {formatSpeed(txPoints[txPoints.length - 1]?.val || 0)}
          </span>
        </div>
        <span className="text-zinc-500">
          Peak Window: {formatSpeed(maxRate)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard Application
// ---------------------------------------------------------------------------

export default function App() {
  const [activeTab, setActiveTab] = useState<
    | "overview"
    | "analytics"
    | "workspaces"
    | "services"
    | "security"
    | "upgrades"
    | "maintenance"
    | "calendar"
    | "notes"
    | "apps"
  >("overview");

  const [authToken, setAuthToken] = useState<string | null>(
    localStorage.getItem("cmp_jwt_token"),
  );
  const [currentUser, setCurrentUser] = useState<PersonaProfile | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>("");

  const [loginUsername, setLoginUsername] = useState("admin-01");
  const [loginPassword, setLoginPassword] = useState("password123");

  const [resources, setResources] = useState<GuestResource[]>([]);
  const [telemetry, setTelemetry] = useState<NodeTelemetry | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const [activeTerminal, setActiveTerminal] = useState<{
    node: string;
    vmType: "qemu" | "lxc";
    vmid: number;
    vmName: string;
  } | null>(null);

  const [services] = useState<ServiceEndpoint[]>([
    {
      name: "Proxmox Virtual Environment",
      category: "Virtualization Engine",
      url: "https://pve-server.exocomet-gamut.ts.net:8006",
      port: 8006,
      status: "Healthy",
      latency_ms: 2,
      host_node: "pve-server",
      uptime_pct: 99.98,
    },
    {
      name: "Immich Photo Archive",
      category: "Media & Computer Vision",
      url: "http://immich-server.exocomet-gamut.ts.net",
      port: 2283,
      status: "Healthy",
      latency_ms: 6,
      host_node: "102 (Immich-LXC)",
      uptime_pct: 99.95,
    },
    {
      name: "AdGuard Home DNS",
      category: "Network Security & Filtering",
      url: "http://192.168.1.101:3000",
      port: 3000,
      status: "Healthy",
      latency_ms: 1,
      host_node: "101 (AdGuard-LXC)",
      uptime_pct: 100.0,
    },
    {
      name: "Nextcloud Workspace",
      category: "Productivity & Storage",
      url: "https://ryan-ubuntu-home-server.exocomet-gamut.ts.net",
      port: 443,
      status: "Healthy",
      latency_ms: 12,
      host_node: "100 (Ubuntu-VM)",
      uptime_pct: 99.89,
    },
    {
      name: "Wazuh SIEM Manager",
      category: "Threat Detection & Auditing",
      url: "https://100.116.163.29:8443",
      port: 8443,
      status: "Healthy",
      latency_ms: 4,
      host_node: "100 (Ubuntu-VM)",
      uptime_pct: 99.92,
    },
    {
      name: "Nginx Proxy Manager",
      category: "Ingress Router",
      url: "http://192.168.1.103:81",
      port: 81,
      status: "Healthy",
      latency_ms: 2,
      host_node: "103 (Nginx-LXC)",
      uptime_pct: 99.99,
    },
  ]);

  const [securityLogs] = useState<SecurityAuditLog[]>([
    {
      id: "SEC-902",
      timestamp: "Just now",
      level: "INFO",
      source: "pve-server",
      event: "PAM user 'root@pam' authenticated via internal ticket",
      ip_address: "192.168.1.50",
    },
    {
      id: "SEC-901",
      timestamp: "4 mins ago",
      level: "WARN",
      source: "Wazuh-HIDS",
      event: "Multiple SSH connection attempts blocked by Fail2Ban",
      ip_address: "185.220.101.5",
    },
    {
      id: "SEC-900",
      timestamp: "18 mins ago",
      level: "INFO",
      source: "101 (AdGuard-LXC)",
      event: "DNS blocklist synchronized (412,890 rules active)",
      ip_address: "Localhost",
    },
    {
      id: "SEC-899",
      timestamp: "1 hour ago",
      level: "INFO",
      source: "Tailscale-Subnet",
      event: "Mesh node 'ryan-ubuntu-home-server' route verified",
      ip_address: "100.116.163.29",
    },
    {
      id: "SEC-898",
      timestamp: "3 hours ago",
      level: "CRITICAL",
      source: "Wazuh-HIDS",
      event: "Root privilege escalation detected in 100 (Ubuntu-VM) by ryan",
      ip_address: "100.64.0.12",
    },
  ]);

  const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>([
    {
      id: 1,
      title: "ZFS Storage Pool scrub and silent corruption trim",
      category: "Storage",
      status: "Completed",
      priority: "High",
      scheduled: "Aug 28",
      target: "local-lvm",
    },
    {
      id: 2,
      title: "Proxmox Linux kernel microcode patch (pve-manager 8.x)",
      category: "Hypervisor",
      status: "In Progress",
      priority: "High",
      scheduled: "Aug 30",
      target: "pve-server",
    },
    {
      id: 3,
      title: "Proxmox Backup Server (PBS) snapshot pruning & deduplication",
      category: "Backup",
      status: "Pending",
      priority: "Medium",
      scheduled: "Sep 12",
      target: "PBS-Target",
    },
    {
      id: 4,
      title: "Rotate Tailscale authorization keys and renew TLS certificates",
      category: "Security",
      status: "In Progress",
      priority: "High",
      scheduled: "Oct 05",
      target: "Cluster-Wide",
    },
  ]);

  const [calendarEvents] = useState<CalendarEvent[]>([
    {
      id: 1,
      title: "Corosync Node Heartbeat Calibration",
      type: "Maintenance",
      date: "Aug 29, 2026",
      time: "02:00 - 03:00 UTC",
      targetNode: "pve-server",
    },
    {
      id: 2,
      title: "ZFS Pool Scrubbing & Trim Procedure",
      type: "ZFS Scrub",
      date: "Sep 04, 2026",
      time: "23:00 - 01:00 UTC",
      targetNode: "pve-server",
    },
    {
      id: 3,
      title: "Network Isolation & WireGuard Key Rotation",
      type: "Security Audit",
      date: "Sep 18, 2026",
      time: "09:00 - 16:00 UTC",
      targetNode: "Tailscale Mesh",
    },
  ]);

  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("All");
  const [isNotesLoading, setIsNotesLoading] = useState<boolean>(false);
  const [isCreatingNote, setIsCreatingNote] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTag, setNewTag] = useState<
    "Infrastructure" | "Security" | "Update"
  >("Infrastructure");
  const [newSnippet, setNewSnippet] = useState("");
  const [newDate, setNewDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [isSubmittingNote, setIsSubmittingNote] = useState<boolean>(false);

  const [upgrades, setUpgrades] = useState<UpgradeItem[]>([]);
  const [isUpgradesLoading, setIsUpgradesLoading] = useState<boolean>(false);
  const [isCreatingUpgrade, setIsCreatingUpgrade] = useState<boolean>(false);
  const [upgTitle, setUpgTitle] = useState("");
  const [upgCategory, setUpgCategory] = useState<"Hardware" | "Software">(
    "Hardware",
  );
  const [upgPriority, setUpgPriority] = useState<"High" | "Medium" | "Low">(
    "Medium",
  );
  const [upgDesc, setUpgDesc] = useState("");
  const [isSubmittingUpgrade, setIsSubmittingUpgrade] =
    useState<boolean>(false);

  const [apps] = useState([
    {
      name: "Proxmox VE",
      category: "Hypervisor",
      status: "Active",
      desc: "Bare-metal virtualization management and container orchestration.",
      url: "https://pve-server.exocomet-gamut.ts.net:8006/#v1:0:18:4:::::::2",
      icon: Server,
    },
    {
      name: "Wazuh SIEM",
      category: "Security & Compliance",
      status: "Active",
      desc: "Real-time host intrusion detection and sovereign log compliance.",
      url: "https://100.116.163.29:8443/app/wz-home#/overview/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-24h,to:now))&_a=(filters:!(),query:(language:kuery,query:''))",
      icon: ShieldCheck,
    },
    {
      name: "NextCloud",
      category: "Cloud Storage",
      status: "Active",
      desc: "Self-hosted productivity platform and file synchronization.",
      url: "https://ryan-ubuntu-home-server.exocomet-gamut.ts.net/index.php/apps/dashboard/",
      icon: Cloud,
    },
    {
      name: "Immich",
      category: "Media Management",
      status: "Active",
      desc: "High-performance self-hosted photo and video backup solution.",
      url: "http://immich-server.exocomet-gamut.ts.net",
      icon: ImageIcon,
    },
    {
      name: "Tailscale",
      category: "SDN / Zero-Trust",
      status: "Active",
      desc: "WireGuard-based mesh networking console and machine routing.",
      url: "https://console.tailscale.com/admin/machines?refreshed=true",
      icon: Network,
    },
  ]);

  const handleAuthenticate = async (username: string, password: string) => {
    setIsAuthenticating(true);
    setLoginError("");
    try {
      const res = await fetch("http://localhost:8000/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.detail || "Authentication failed. Check credentials.",
        );
      }

      const data = await res.json();
      localStorage.setItem("cmp_jwt_token", data.access_token);
      setAuthToken(data.access_token);
      setCurrentUser(data.user);
    } catch (err: any) {
      setLoginError(err.message);
      setAuthToken(null);
      localStorage.removeItem("cmp_jwt_token");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const switchPersonaAuth = async (targetUserId: string) => {
    const persona = PERSONA_ACCOUNTS.find((p) => p.userId === targetUserId);
    if (!persona) return;
    await handleAuthenticate(
      persona.userId,
      persona.defaultPassword || "password123",
    );
  };

  useEffect(() => {
    if (authToken) {
      fetch("http://localhost:8000/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${authToken}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error("Session invalid");
          return res.json();
        })
        .then((user) => setCurrentUser(user))
        .catch(() => {
          localStorage.removeItem("cmp_jwt_token");
          setAuthToken(null);
          setCurrentUser(null);
        });
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("cmp_jwt_token");
    setAuthToken(null);
    setCurrentUser(null);
  };

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${authToken}`,
  });

  const fetchResources = async () => {
    if (!authToken || !currentUser) return;
    try {
      const res = await fetch(
        "http://localhost:8000/api/v1/cluster/resources",
        { headers: getAuthHeaders() },
      );
      if (res.ok) setResources(await res.json());
      else setResources([]);
    } catch (err) {}
  };

  const fetchTelemetry = async () => {
    if (!authToken || currentUser?.role !== "SuperAdmin") {
      setTelemetry(null);
      return;
    }
    try {
      const res = await fetch("http://localhost:8000/api/v1/nodes/telemetry", {
        headers: getAuthHeaders(),
      });
      if (res.ok) setTelemetry(await res.json());
    } catch (err) {}
  };

  const fetchNotes = async () => {
    if (!authToken) return;
    setIsNotesLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/notes", {
        headers: getAuthHeaders(),
      });
      if (res.ok) setNotes(await res.json());
    } catch (err) {
    } finally {
      setIsNotesLoading(false);
    }
  };

  const fetchUpgrades = async () => {
    if (!authToken) return;
    setIsUpgradesLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/upgrades", {
        headers: getAuthHeaders(),
      });
      if (res.ok) setUpgrades(await res.json());
    } catch (err) {
    } finally {
      setIsUpgradesLoading(false);
    }
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !authToken) return;
    setIsSubmittingNote(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/notes", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          tag: newTag,
          snippet: newSnippet.trim(),
          date: newDate,
        }),
      });
      if (res.ok) {
        setNewTitle("");
        setNewSnippet("");
        setNewDate(new Date().toISOString().split("T")[0]);
        setIsCreatingNote(false);
        await fetchNotes();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Failed to push note to Notion");
      }
    } catch (err) {
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleCreateUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upgTitle.trim() || !authToken) return;
    setIsSubmittingUpgrade(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/upgrades", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: upgTitle.trim(),
          category: upgCategory,
          priority: upgPriority,
          description: upgDesc.trim(),
        }),
      });
      if (res.ok) {
        setUpgTitle("");
        setUpgDesc("");
        setIsCreatingUpgrade(false);
        await fetchUpgrades();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Failed to push upgrade to Notion");
      }
    } catch (err) {
    } finally {
      setIsSubmittingUpgrade(false);
    }
  };

  useEffect(() => {
    if (authToken && currentUser) {
      fetchResources();
      fetchTelemetry();
      const interval = setInterval(() => {
        fetchResources();
        fetchTelemetry();
      }, 3500);
      return () => clearInterval(interval);
    }
  }, [authToken, currentUser]);

  useEffect(() => {
    if (authToken && activeTab === "notes") fetchNotes();
    if (authToken && activeTab === "upgrades") fetchUpgrades();
    if (authToken && activeTab === "analytics") fetchTelemetry();
  }, [authToken, activeTab]);

  const handlePowerAction = async (
    node: string,
    vmType: "qemu" | "lxc",
    vmid: number,
    action: string,
  ) => {
    if (!authToken) return;
    setActionLoading(vmid);
    try {
      const res = await fetch(
        `http://localhost:8000/api/v1/nodes/${node}/${vmType}/${vmid}/power/${action}`,
        {
          method: "POST",
          headers: getAuthHeaders(),
        },
      );
      if (res.ok) await fetchResources();
      else {
        const err = await res.json();
        alert(err.detail || "Action unauthorized");
      }
    } catch (err) {
    } finally {
      setActionLoading(null);
    }
  };

  const toggleMaintenanceStatus = (id: number) => {
    setMaintenanceTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const nextStatus =
            t.status === "Pending"
              ? "In Progress"
              : t.status === "In Progress"
                ? "Completed"
                : "Pending";
          return { ...t, status: nextStatus };
        }
        return t;
      }),
    );
  };

  const canControlPower =
    currentUser?.role === "SuperAdmin" || currentUser?.role === "TenantAdmin";
  const canAccessConsole =
    currentUser?.role === "SuperAdmin" || currentUser?.role === "TenantAdmin";
  const canViewHostTelemetry = currentUser?.role === "SuperAdmin";

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    ...(canViewHostTelemetry
      ? [{ id: "analytics", label: "Host Telemetry", icon: BarChart3 }]
      : []),
    { id: "workspaces", label: "Partitions & SDN", icon: Boxes },
    { id: "services", label: "Service Catalog", icon: Globe },
    { id: "security", label: "Security & SIEM", icon: ShieldCheck },
    { id: "upgrades", label: "Hardware Expansion", icon: Zap },
    { id: "maintenance", label: "Operations & Backups", icon: Wrench },
    { id: "calendar", label: "Maintenance Windows", icon: CalendarIcon },
    { id: "notes", label: "Runbooks & SOPs", icon: StickyNote },
    { id: "apps", label: "Services Launchpad", icon: Grid },
  ];

  if (!authToken || !currentUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0d0f] text-zinc-100 p-4">
        <div className="w-full max-w-md bg-[#121214] border border-zinc-800 p-8 rounded-2xl shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                OmniOps Homelab Authentication
              </h2>
              <p className="text-xs text-zinc-400">
                Sovereign Control Plane Token Gateway
              </p>
            </div>
          </div>

          {loginError && (
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl">
              {loginError}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAuthenticate(loginUsername, loginPassword);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 text-xs text-white rounded-xl p-3 focus:outline-none focus:border-emerald-500"
                placeholder="admin-01"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 text-xs text-white rounded-xl p-3 focus:outline-none focus:border-emerald-500"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-colors shadow-sm"
            >
              {isAuthenticating
                ? "Verifying Token Claims..."
                : "Authorize Control Plane"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-zinc-800">
            <span className="block text-[11px] text-zinc-500 mb-2 font-mono">
              Quick Authenticate Persona:
            </span>
            <div className="grid grid-cols-2 gap-2">
              {PERSONA_ACCOUNTS.map((p) => (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => switchPersonaAuth(p.userId)}
                  className="px-2.5 py-1.5 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 rounded-lg text-[10px] text-zinc-300 truncate text-left transition-colors"
                >
                  {p.role}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const filteredTasks = maintenanceTasks;
  const filteredEvents = calendarEvents;
  const filteredNotes =
    selectedTag === "All" ? notes : notes.filter((n) => n.tag === selectedTag);

  return (
    <div className="flex h-screen bg-[#0d0d0f] text-zinc-100 font-sans antialiased overflow-hidden selection:bg-zinc-800">
      <aside className="w-64 bg-[#121214] border-r border-zinc-800/80 flex flex-col justify-between shrink-0">
        <div className="p-4 flex flex-col h-full">
          <div className="p-3 bg-[#18181b] border border-zinc-800 rounded-xl mb-6 shadow-sm">
            <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> Operator
                Active
              </span>
              <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 text-[9px] font-mono rounded">
                JWT Valid
              </span>
            </div>
            <div className="w-full bg-zinc-900 border border-zinc-700 text-xs text-white font-medium rounded-lg p-2 truncate">
              {currentUser.name}
            </div>
            <div className="mt-2 text-[10px] font-mono text-zinc-400 flex flex-col gap-1">
              <div className="flex justify-between">
                <span>Role:</span>
                <strong className="text-emerald-400">{currentUser.role}</strong>
              </div>
              <div className="flex justify-between">
                <span>Scope:</span>
                <strong className="text-sky-400">{currentUser.tenantId}</strong>
              </div>
            </div>
          </div>

          <div className="text-[11px] font-semibold text-zinc-500 px-3 uppercase tracking-wider mb-2">
            Navigation
          </div>
          <nav className="space-y-1 flex-1 overflow-y-auto pr-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? "bg-zinc-800/90 text-white shadow-sm font-semibold"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${isActive ? "text-white" : "text-zinc-400"}`}
                  />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <button
            onClick={handleLogout}
            className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-rose-500/10 hover:text-rose-400 border border-zinc-800 rounded-xl text-xs font-medium text-zinc-400 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 border-b border-zinc-800/80 bg-[#121214]/60 backdrop-blur-md px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold text-white tracking-tight capitalize">
              {activeTab === "upgrades"
                ? "Hardware & Software Expansion"
                : activeTab === "services"
                  ? "Service Catalog & Health Matrix"
                  : activeTab === "security"
                    ? "Security Telemetry & Audit Logs"
                    : activeTab === "maintenance"
                      ? "Maintenance & Backup Operations"
                      : activeTab === "analytics"
                        ? "Host Bare-Metal Telemetry"
                        : activeTab}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-3 py-1.5 bg-zinc-800/80 border border-zinc-700/60 rounded-xl text-xs font-mono text-zinc-300">
              User:{" "}
              <span className="text-white font-bold">{currentUser.userId}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* ================= OVERVIEW VIEW ================= */}
          {activeTab === "overview" && (
            <>
              {/* Core Infrastructure Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-xs font-semibold">
                      Managed Compute Guests
                    </span>
                    <Server className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-white tracking-tight">
                      {resources.length}
                    </span>
                    <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
                      <span className="text-emerald-400 font-medium">
                        {resources.filter((r) => r.status === "running").length}{" "}
                        online
                      </span>{" "}
                      active workloads
                    </p>
                  </div>
                </div>
                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-xs font-semibold">
                      Active Service Endpoints
                    </span>
                    <Globe className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-white tracking-tight">
                      {services.length}
                    </span>
                    <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> All systems
                      responding
                    </p>
                  </div>
                </div>
                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-xs font-semibold">
                      Network I/O Throughput
                    </span>
                    <Activity className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-white tracking-tight">
                      {telemetry
                        ? formatSpeed(telemetry.network.rx_rate_kbps)
                        : "---"}
                    </span>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Outbound:{" "}
                      {telemetry
                        ? formatSpeed(telemetry.network.tx_rate_kbps)
                        : "---"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Workload Inventory Grid */}
              <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-400" /> Virtual
                      Machines & Containers
                    </h2>
                    <p className="text-[11px] text-zinc-400">
                      {currentUser.role === "SuperAdmin"
                        ? "Global Hypervisor Inventory (pve-server)"
                        : `Scope: Partition (${currentUser.tenantId})`}
                    </p>
                  </div>
                  <button
                    onClick={fetchResources}
                    className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
                {resources.length === 0 ? (
                  <div className="p-12 text-center text-xs text-zinc-500 font-mono">
                    No instances assigned to this workspace partition.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="bg-[#121214] text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                      <tr>
                        <th className="px-6 py-3">Workload</th>
                        <th className="px-6 py-3">Node</th>
                        <th className="px-6 py-3">Type</th>
                        <th className="px-6 py-3">State</th>
                        <th className="px-6 py-3">CPU</th>
                        <th className="px-6 py-3">Memory</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {resources.map((vm) => (
                        <tr
                          key={vm.vmid}
                          className="hover:bg-zinc-800/20 transition-colors"
                        >
                          <td className="px-6 py-4 font-medium text-white flex items-center gap-2">
                            <span className="font-mono text-zinc-500">
                              #{vm.vmid}
                            </span>{" "}
                            {vm.name}
                          </td>
                          <td className="px-6 py-4 text-zinc-400">{vm.node}</td>
                          <td className="px-6 py-4">
                            <span className="uppercase font-mono text-[10px] text-zinc-400">
                              {vm.type}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${vm.status === "running" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-zinc-800 text-zinc-500 border border-zinc-700"}`}
                            >
                              {vm.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono text-zinc-400">
                            {vm.cpu_usage_pct}%
                          </td>
                          <td className="px-6 py-4 font-mono text-zinc-400">
                            {Math.min(
                              Math.max(vm.mem_usage_pct, 0),
                              100,
                            ).toFixed(2)}
                            % ({vm.maxmem_gb} GB)
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button
                              onClick={() =>
                                setActiveTerminal({
                                  node: vm.node,
                                  vmType: vm.type,
                                  vmid: vm.vmid,
                                  vmName: vm.name,
                                })
                              }
                              disabled={
                                !canAccessConsole || vm.status !== "running"
                              }
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-20 disabled:hover:bg-emerald-600 text-white font-medium rounded-lg text-xs inline-flex items-center gap-1.5 shadow-sm"
                              title={
                                !canAccessConsole
                                  ? "Permission Denied (Requires Admin)"
                                  : ""
                              }
                            >
                              <Terminal className="w-3.5 h-3.5" /> Console
                            </button>
                            {canControlPower ? (
                              vm.status === "running" ? (
                                <button
                                  onClick={() =>
                                    handlePowerAction(
                                      vm.node,
                                      vm.type,
                                      vm.vmid,
                                      "shutdown",
                                    )
                                  }
                                  disabled={actionLoading === vm.vmid}
                                  className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg border border-rose-500/20"
                                >
                                  <Square className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    handlePowerAction(
                                      vm.node,
                                      vm.type,
                                      vm.vmid,
                                      "start",
                                    )
                                  }
                                  disabled={actionLoading === vm.vmid}
                                  className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/20"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                </button>
                              )
                            ) : (
                              <button
                                disabled
                                className="p-1.5 bg-zinc-800/40 text-zinc-600 rounded-lg border border-zinc-800"
                              >
                                <Lock className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ================= TELEMETRY ANALYTICS WITH GRAPHS ================= */}
          {activeTab === "analytics" && canViewHostTelemetry && (
            <div className="space-y-6">
              <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                      Proxmox Host: {telemetry?.node || "pve-server"}
                    </h2>
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-mono">
                      Bare-Metal Online
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 font-mono">
                    {telemetry?.system.pve_version} • Kernel{" "}
                    {telemetry?.system.kernel_version}
                  </p>
                </div>

                <div className="flex items-center gap-6 text-xs font-mono text-zinc-400 bg-zinc-900/90 border border-zinc-800 px-4 py-2.5 rounded-xl">
                  <div>
                    <span className="text-zinc-500 block text-[10px] uppercase">
                      Node Uptime
                    </span>
                    <strong className="text-white text-sm">
                      {telemetry?.system.uptime_formatted || "---"}
                    </strong>
                  </div>
                  <div className="border-l border-zinc-800 pl-4">
                    <span className="text-zinc-500 block text-[10px] uppercase">
                      Boot Timestamp
                    </span>
                    <span className="text-zinc-300">
                      {telemetry?.system.boot_time || "---"}
                    </span>
                  </div>
                  <div className="border-l border-zinc-800 pl-4">
                    <span className="text-zinc-500 block text-[10px] uppercase">
                      Load Averages
                    </span>
                    <span className="text-emerald-400 font-bold">
                      {telemetry?.cpu.loadavg?.slice(0, 3).join(", ") ||
                        "0.10, 0.15, 0.20"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-sm font-bold text-white">
                          CPU Usage Graph
                        </h3>
                      </div>
                      <span className="text-lg font-bold text-white font-mono">
                        {telemetry?.cpu.usage_pct || 0}%
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 font-mono mb-4">
                      {telemetry?.cpu.cores} Physical Cores (
                      {telemetry?.cpu.sockets} Socket) • IO Wait:{" "}
                      {telemetry?.cpu.iowait_pct || 0}%
                    </p>
                  </div>

                  <TelemetryAreaChart
                    data={telemetry?.history || []}
                    dataKey="cpu"
                    color="#10b981"
                    gradientId="cpuTelemetryGrad"
                    unit="%"
                    maxValue={100}
                  />
                </div>

                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-indigo-400" />
                        <h3 className="text-sm font-bold text-white">
                          Memory Usage Graph
                        </h3>
                      </div>
                      <span className="text-lg font-bold text-white font-mono">
                        {telemetry?.memory.usage_pct || 0}%
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 font-mono mb-4">
                      {telemetry?.memory.used_gb} GB used of{" "}
                      {telemetry?.memory.total_gb} GB total • Swap:{" "}
                      {telemetry?.memory.swap_used_gb} GB (
                      {telemetry?.memory.swap_pct}%)
                    </p>
                  </div>

                  <TelemetryAreaChart
                    data={telemetry?.history || []}
                    dataKey="memory"
                    color="#6366f1"
                    gradientId="memTelemetryGrad"
                    unit="%"
                    maxValue={100}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-sky-400" />
                        <h3 className="text-sm font-bold text-white">
                          Network Traffic & Bandwidth Usage
                        </h3>
                      </div>
                      <span className="text-xs font-mono text-zinc-400">
                        Throughput Stream
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 font-mono mb-4">
                      Real-time ingress (RX) vs egress (TX) packet streams
                      across bridged hypervisor interfaces
                    </p>
                  </div>

                  <NetworkThroughputChart data={telemetry?.history || []} />

                  <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap items-center gap-2">
                    {telemetry?.network.interfaces?.map((iface) => (
                      <span
                        key={iface.name}
                        className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-[10px] font-mono text-zinc-300 flex items-center gap-1.5"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${iface.active ? "bg-emerald-400" : "bg-zinc-600"}`}
                        />
                        <strong>{iface.name}</strong> ({iface.address})
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-amber-400" />
                        <h3 className="text-sm font-bold text-white">
                          Root & Pool Storage (SSD vs. HDD)
                        </h3>
                      </div>
                      <span className="text-xs font-mono text-zinc-400">
                        Rootfs: {telemetry?.storage.rootfs.usage_pct}%
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 font-mono mb-4">
                      Storage partitions, NVMe/Flash volume allocations, and
                      mechanical block storage
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs font-mono text-zinc-400 mb-1">
                        <span>SSD Root System (/rootfs)</span>
                        <span>
                          {telemetry?.storage.rootfs.used_gb} /{" "}
                          {telemetry?.storage.rootfs.total_gb} GB (
                          {telemetry?.storage.rootfs.usage_pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-amber-500 h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${telemetry?.storage.rootfs.usage_pct || 0}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2 mt-4">
                      {telemetry?.storage.pools?.map((pool) => (
                        <div
                          key={pool.name}
                          className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl flex items-center justify-between text-xs font-mono"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-bold">
                                {pool.name}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  pool.category.includes("SSD")
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                }`}
                              >
                                {pool.category}
                              </span>
                              <span className="text-[10px] text-zinc-500">
                                [{pool.type}]
                              </span>
                            </div>
                            <span className="text-[11px] text-zinc-400 mt-0.5 block">
                              {pool.used_gb} GB used • {pool.free_gb} GB free
                            </span>
                          </div>

                          <div className="text-right">
                            <span className="text-sm font-bold text-white">
                              {pool.usage_pct}%
                            </span>
                            <div className="w-20 bg-zinc-800 h-1.5 rounded-full mt-1 overflow-hidden">
                              <div
                                className="bg-emerald-400 h-full"
                                style={{ width: `${pool.usage_pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap gap-2">
                    {telemetry?.storage.disks?.map((disk) => (
                      <div
                        key={disk.devpath}
                        className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-[10px] font-mono text-zinc-300 flex items-center gap-2"
                      >
                        <Disc className="w-3.5 h-3.5 text-zinc-500" />
                        <span>
                          {disk.devpath} ({disk.type}) - {disk.size_gb} GB
                        </span>
                        <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                          <ShieldCheck className="w-3 h-3" /> {disk.health}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= WORKSPACES & PARTITIONS VIEW ================= */}
          {activeTab === "workspaces" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Isolated Tenant Partitions
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Compute boundaries and SDN VLAN allocations
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    name: "Alpha Core Services",
                    vlan: "VLAN 101",
                    vms: 3,
                    quota: "32GB RAM / 8 vCPU",
                    tier: "Production",
                  },
                  {
                    name: "Vault & Data Storage",
                    vlan: "VLAN 102",
                    vms: 2,
                    quota: "16GB RAM / 4 vCPU",
                    tier: "Encrypted",
                  },
                  {
                    name: "DevSecOps Sandbox",
                    vlan: "VLAN 104",
                    vms: 0,
                    quota: "64GB RAM / 16 vCPU",
                    tier: "Experimental",
                  },
                ].map((ws, i) => (
                  <div
                    key={i}
                    className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-2 py-0.5 bg-zinc-800 text-[10px] font-mono text-zinc-400 rounded">
                          {ws.vlan}
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          {ws.tier}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-white mb-1">
                        {ws.name}
                      </h3>
                      <p className="text-xs text-zinc-400 font-mono">
                        {ws.quota}
                      </p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
                      <span>{ws.vms} Workloads</span>
                      <button className="text-indigo-400 hover:underline flex items-center gap-1">
                        Configure <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================= SERVICE CATALOG ================= */}
          {activeTab === "services" && (
            <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Homelab Service Catalog & Health Matrix
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Active container and VM endpoints, response latencies, and
                    uptime probes
                  </p>
                </div>
              </div>
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-[#121214] text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                  <tr>
                    <th className="px-6 py-3">Service Name</th>
                    <th className="px-6 py-3">Category</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Host Node</th>
                    <th className="px-6 py-3">Latency</th>
                    <th className="px-6 py-3">SLA Availability</th>
                    <th className="px-6 py-3 text-right">Direct Endpoint</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {services.map((svc, i) => (
                    <tr key={i} className="hover:bg-zinc-800/20">
                      <td className="px-6 py-4 font-semibold text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{" "}
                        {svc.name}
                      </td>
                      <td className="px-6 py-4 text-zinc-400">
                        {svc.category}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold rounded-full border border-emerald-500/20">
                          {svc.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-zinc-400">
                        {svc.host_node}
                      </td>
                      <td className="px-6 py-4 font-mono text-emerald-400">
                        {svc.latency_ms} ms
                      </td>
                      <td className="px-6 py-4 font-mono text-zinc-300">
                        {svc.uptime_pct}%
                      </td>
                      <td className="px-6 py-4 text-right">
                        <a
                          href={svc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-indigo-400 hover:underline inline-flex items-center gap-1 font-mono"
                        >
                          :{svc.port} <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ================= SECURITY & SIEM TELEMETRY ================= */}
          {activeTab === "security" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />{" "}
                    Security Telemetry & SIEM Audit Stream
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Live security events streamed from Wazuh HIDS and PAM
                    authentication monitors
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-[#18181b] px-3 py-1.5 rounded-xl border border-zinc-800 text-xs font-mono text-zinc-400">
                  <Filter className="w-3.5 h-3.5" /> Filter:{" "}
                  <strong className="text-white">All Alerts</strong>
                </div>
              </div>

              <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#121214] text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="px-6 py-3">Alert ID</th>
                      <th className="px-6 py-3">Severity</th>
                      <th className="px-6 py-3">Source Sensor</th>
                      <th className="px-6 py-3">Audit Event Summary</th>
                      <th className="px-6 py-3">Origin IP / Host</th>
                      <th className="px-6 py-3 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {securityLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-800/20">
                        <td className="px-6 py-4 text-zinc-400">{log.id}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.level === "CRITICAL"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : log.level === "WARN"
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                            }`}
                          >
                            {log.level}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-white font-semibold">
                          {log.source}
                        </td>
                        <td className="px-6 py-4 font-sans text-zinc-200">
                          {log.event}
                        </td>
                        <td className="px-6 py-4 text-zinc-400">
                          {log.ip_address}
                        </td>
                        <td className="px-6 py-4 text-right text-zinc-500">
                          {log.timestamp}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= FUTURE UPGRADES & EXPANSION VIEW ================= */}
          {activeTab === "upgrades" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    Future Upgrades & Hardware Expansion
                    <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-mono rounded-full">
                      Notion 2-Way Sync
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Hardware expansion tracks and container memory capacity
                    requests
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={fetchUpgrades}
                    disabled={isUpgradesLoading}
                    className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-colors"
                  >
                    <RotateCcw
                      className={`w-3.5 h-3.5 ${isUpgradesLoading ? "animate-spin text-emerald-400" : ""}`}
                    />
                  </button>

                  <button
                    onClick={() => setIsCreatingUpgrade(true)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Propose Upgrade
                  </button>
                </div>
              </div>

              {isCreatingUpgrade && (
                <div className="p-6 bg-[#151518] border border-zinc-800 rounded-2xl">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
                    Submit Hardware/Software Expansion Requirement
                  </h3>
                  <form onSubmit={handleCreateUpgrade} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-1">
                        <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                          Title
                        </label>
                        <input
                          type="text"
                          value={upgTitle}
                          onChange={(e) => setUpgTitle(e.target.value)}
                          placeholder="e.g., Crucial 64GB DDR5 ECC Kit"
                          className="w-full bg-zinc-900 border border-zinc-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-indigo-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                          Category
                        </label>
                        <select
                          value={upgCategory}
                          onChange={(e) =>
                            setUpgCategory(e.target.value as any)
                          }
                          className="w-full bg-zinc-900 border border-zinc-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="Hardware">Hardware</option>
                          <option value="Software">Software</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                          Priority
                        </label>
                        <select
                          value={upgPriority}
                          onChange={(e) =>
                            setUpgPriority(e.target.value as any)
                          }
                          className="w-full bg-zinc-900 border border-zinc-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                        Description & Justification
                      </label>
                      <textarea
                        value={upgDesc}
                        onChange={(e) => setUpgDesc(e.target.value)}
                        placeholder="Detail PCIe lanes, memory channels, or software dependencies..."
                        rows={3}
                        className="w-full bg-zinc-900 border border-zinc-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCreatingUpgrade(false)}
                        className="px-3 py-1.5 bg-zinc-800 text-zinc-400 hover:text-white rounded-xl text-xs font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingUpgrade}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold"
                      >
                        {isSubmittingUpgrade
                          ? "Submitting..."
                          : "Push to Notion"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {upgrades.length === 0 ? (
                <div className="p-12 text-center text-xs text-zinc-500 font-mono bg-[#151518] border border-zinc-800 rounded-2xl">
                  {isUpgradesLoading
                    ? "Polling Notion database..."
                    : "No future upgrades tracked in Notion."}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {upgrades.map((upg) => (
                    <div
                      key={upg.id}
                      className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              upg.priority === "High"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : upg.priority === "Medium"
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                            }`}
                          >
                            {upg.priority}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2 py-0.5 rounded">
                            {upg.category}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-white mb-2">
                          {upg.title}
                        </h3>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          {upg.description}
                        </p>
                      </div>
                      <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500 font-mono">
                        <span>By: {upg.requested_by}</span>
                        <a
                          href={`https://notion.so/${upg.id.replace(/-/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-400 hover:underline flex items-center gap-1"
                        >
                          View in Notion <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================= MAINTENANCE & BACKUP OPS ================= */}
          {activeTab === "maintenance" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Maintenance Operations & Backup Schedules
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Scheduled ZFS scrubs, hypervisor patch procedures, and PBS
                    backup retention
                  </p>
                </div>
              </div>

              <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#121214] text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="px-6 py-3">Operation Details</th>
                      <th className="px-6 py-3">Category</th>
                      <th className="px-6 py-3">Priority</th>
                      <th className="px-6 py-3">Target Workload</th>
                      <th className="px-6 py-3">Execution Date</th>
                      <th className="px-6 py-3 text-right">Job Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredTasks.map((task) => (
                      <tr
                        key={task.id}
                        className="hover:bg-zinc-800/20 transition-colors"
                      >
                        <td className="px-6 py-4 font-medium text-white flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-zinc-500 shrink-0" />{" "}
                          {task.title}
                        </td>
                        <td className="px-6 py-4 capitalize font-mono text-zinc-400">
                          {task.category}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              task.priority === "High"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}
                          >
                            {task.priority}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-zinc-300">
                          {task.target}
                        </td>
                        <td className="px-6 py-4 font-mono text-zinc-400">
                          {task.scheduled}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => toggleMaintenanceStatus(task.id)}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all ${
                              task.status === "Completed"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                                : task.status === "In Progress"
                                  ? "bg-sky-500/10 text-sky-400 border-sky-500/20 hover:bg-sky-500/20"
                                  : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:bg-zinc-800"
                            }`}
                          >
                            {task.status} ↻
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= CALENDAR VIEW ================= */}
          {activeTab === "calendar" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Scheduled Maintenance Windows
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Target hypervisor maintenance and auditing windows
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-2.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-semibold rounded-full">
                          {evt.type}
                        </span>
                        <span className="text-xs font-mono text-zinc-500">
                          {evt.targetNode}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-white mb-2">
                        {evt.title}
                      </h3>
                      <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3.5 h-3.5 text-zinc-500" />{" "}
                          {evt.date}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-zinc-500" />{" "}
                          {evt.time}
                        </span>
                      </div>
                    </div>
                    <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-end">
                      <button className="text-xs text-emerald-400 hover:underline">
                        Download ICS Calendar Sync
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================= NOTES RUNBOOK VAULT (NOTION 2-WAY SYNC) ================= */}
          {activeTab === "notes" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    Sovereign Homelab Runbooks & SOPs
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono rounded-full">
                      Notion 2-Way Sync
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Operational standard procedures synchronized directly with
                    Notion
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-[#18181b] p-1 rounded-xl border border-zinc-800">
                    {["All", "Infrastructure", "Security", "Update"].map(
                      (tag) => (
                        <button
                          key={tag}
                          onClick={() => setSelectedTag(tag)}
                          className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                            selectedTag === tag
                              ? "bg-zinc-800 text-white shadow-sm"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {tag}
                        </button>
                      ),
                    )}
                  </div>
                  <button
                    onClick={fetchNotes}
                    disabled={isNotesLoading}
                    className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-colors"
                  >
                    <RotateCcw
                      className={`w-3.5 h-3.5 ${isNotesLoading ? "animate-spin text-emerald-400" : ""}`}
                    />
                  </button>
                  <button
                    onClick={() => setIsCreatingNote(true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Push to Notion
                  </button>
                </div>
              </div>

              {isCreatingNote && (
                <div className="p-6 bg-[#151518] border border-zinc-800 rounded-2xl">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
                    Add New Runbook to Notion Database
                  </h3>
                  <form onSubmit={handleCreateNote} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                          Title
                        </label>
                        <input
                          type="text"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="e.g., ZFS Pool Scrub Procedure"
                          className="w-full bg-zinc-900 border border-zinc-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-emerald-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                          Tag
                        </label>
                        <select
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value as any)}
                          className="w-full bg-zinc-900 border border-zinc-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="Infrastructure">Infrastructure</option>
                          <option value="Security">Security</option>
                          <option value="Update">Update</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                          Date
                        </label>
                        <input
                          type="date"
                          value={newDate}
                          onChange={(e) => setNewDate(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                        Snippet / SOP Instructions
                      </label>
                      <textarea
                        value={newSnippet}
                        onChange={(e) => setNewSnippet(e.target.value)}
                        placeholder="Outline steps, commands, or architecture instructions..."
                        rows={3}
                        className="w-full bg-zinc-900 border border-zinc-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCreatingNote(false)}
                        className="px-3 py-1.5 bg-zinc-800 text-zinc-400 hover:text-white rounded-xl text-xs font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingNote}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold"
                      >
                        {isSubmittingNote ? "Pushing..." : "Create in Notion"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {notes.length === 0 ? (
                <div className="p-12 text-center text-xs text-zinc-500 font-mono bg-[#151518] border border-zinc-800 rounded-2xl">
                  {isNotesLoading
                    ? "Pulling runbooks from Notion..."
                    : "No runbooks found in your Notion database."}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredNotes.map((note) => (
                    <div
                      key={note.id}
                      className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                            <Tag className="w-3 h-3 text-zinc-500" /> {note.tag}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                            <CalendarDays className="w-3 h-3 text-zinc-600" />{" "}
                            {note.updated}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-white mb-2">
                          {note.title}
                        </h3>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          {note.snippet}
                        </p>
                      </div>
                      <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500 font-mono">
                        <span>Author: {note.author}</span>
                        <a
                          href={`https://notion.so/${note.id.replace(/-/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 hover:underline flex items-center gap-1"
                        >
                          Open in Notion <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================= APPS VIEW ================= */}
          {activeTab === "apps" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Sovereign Cloud Applications
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Direct launchpad for containerized services and hypervisor
                    portals
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {apps.map((app, idx) => {
                  const AppIcon = app.icon;
                  return (
                    <div
                      key={idx}
                      className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between hover:border-emerald-500/50 transition-colors group"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] font-mono text-zinc-500 uppercase font-semibold flex items-center gap-1.5">
                            <AppIcon className="w-3.5 h-3.5 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
                            {app.category}
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {app.status}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-white mb-2">
                          {app.name}
                        </h3>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          {app.desc}
                        </p>
                      </div>
                      <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-end">
                        <a
                          href={app.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1"
                        >
                          Launch Application{" "}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Embedded noVNC Terminal Modal */}
      {activeTerminal && authToken && (
        <VncTerminal
          node={activeTerminal.node}
          vmType={activeTerminal.vmType}
          vmid={activeTerminal.vmid}
          vmName={activeTerminal.vmName}
          authToken={authToken}
          onClose={() => setActiveTerminal(null)}
        />
      )}
    </div>
  );
}
