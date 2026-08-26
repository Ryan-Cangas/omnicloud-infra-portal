/**
 * Sovereign Cloud Management Platform (CMP) Dashboard.
 *
 * Features:
 * - Multi-Tenant Persona Switcher: Simulates RBAC roles (SuperAdmin, TenantAdmin, TenantViewer, BillingManager).
 * - Live Hypervisor Telemetry: Real bare-metal CPU, RAM, Disk, and Kernel statistics from Proxmox.
 * - Dynamic Infrastructure Grid: Role-gated guest management with embedded noVNC console launch.
 * - Sovereign Cloud Modular Views: Workspaces, Customers, Billing, Tasks, Calendar, Notes, Chats, Apps.
 */

import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  BarChart3,
  Boxes,
  Users,
  ShoppingCart,
  CheckSquare,
  Calendar as CalendarIcon,
  StickyNote,
  MessageSquare,
  Grid,
  Terminal,
  Play,
  Square,
  RotateCcw,
  Server,
  Activity,
  CheckCircle2,
  Cpu,
  HardDrive,
  Plus,
  ExternalLink,
  Send,
  Lock,
  UserCheck,
} from "lucide-react";
import { VncTerminal } from "./components/VncTerminal";

// Type definitions for RBAC & CMP telemetry
type Role = "SuperAdmin" | "TenantAdmin" | "TenantViewer" | "BillingManager";

interface PersonaConfig {
  userId: string;
  role: Role;
  tenantId: string;
  label: string;
}

// Predefined personas for local development and RBAC testing
const PERSONAS: PersonaConfig[] = [
  {
    userId: "admin-01",
    role: "SuperAdmin",
    tenantId: "global",
    label: "Cloud Operator (SuperAdmin)",
  },
  {
    userId: "tenant-alex",
    role: "TenantAdmin",
    tenantId: "tenant-alpha",
    label: "Alpha Corp (TenantAdmin)",
  },
  {
    userId: "viewer-sam",
    role: "TenantViewer",
    tenantId: "tenant-alpha",
    label: "Alpha Corp (TenantViewer)",
  },
  {
    userId: "finance-claire",
    role: "BillingManager",
    tenantId: "tenant-alpha",
    label: "Finance (BillingManager)",
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

interface NodeTelemetry {
  node: string;
  cpu: { usage_pct: number; cores: number; sockets: number; model: string };
  memory: { used_gb: number; total_gb: number; usage_pct: number };
  storage: { used_gb: number; total_gb: number; usage_pct: number };
  system: { pve_version: string; kernel_version: string; uptime: number };
}

export default function App() {
  // Navigation & Time Range State
  const [activeTab, setActiveTab] = useState<
    | "overview"
    | "analytics"
    | "workspaces"
    | "customers"
    | "orders"
    | "tasks"
    | "calendar"
    | "notes"
    | "chats"
    | "apps"
  >("overview");
  const [timeFilter, setTimeFilter] = useState<"week" | "month" | "quarter">(
    "month",
  );

  // Active RBAC Persona state
  const [currentPersona, setCurrentPersona] = useState<PersonaConfig>(
    PERSONAS[0],
  );

  // Telemetry & Compute resource states
  const [resources, setResources] = useState<GuestResource[]>([]);
  const [telemetry, setTelemetry] = useState<NodeTelemetry | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Active noVNC Terminal modal target
  const [activeTerminal, setActiveTerminal] = useState<{
    node: string;
    vmType: "qemu" | "lxc";
    vmid: number;
    vmName: string;
  } | null>(null);

  // Mock State: Notes Runbook Vault
  const [notes] = useState([
    {
      id: 1,
      title: "Edge Cluster Provisioning SOP",
      tag: "Infrastructure",
      snippet:
        "Ensure VLAN 104 and VxLAN tunnels are initialized before spinning up worker nodes.",
    },
    {
      id: 2,
      title: "Quarterly Compute Quotas",
      tag: "Billing",
      snippet:
        "Enterprise tier customers receive 128 vCPUs and 256GB dedicated memory pool defaults.",
    },
  ]);

  // Mock State: Tasks / DevOps Checklist
  const [taskList] = useState([
    {
      id: 1,
      title: "Validate zero-knowledge vault backups",
      status: "Completed",
      priority: "High",
      date: "Aug 25",
    },
    {
      id: 2,
      title: "Deploy telemetry collector on QEMU-100",
      status: "In Progress",
      priority: "Urgent",
      date: "Aug 26",
    },
  ]);

  // Mock State: Messaging Channel
  const [activeChat, setActiveChat] = useState("tech-support");
  const [chatMessage, setChatMessage] = useState("");
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "Alex Rivera",
      role: "DevOps Lead",
      text: "Node-01 migration scheduled for 02:00 UTC.",
      time: "10:14 AM",
    },
    {
      id: 2,
      sender: "You",
      role: "Admin",
      text: "Acknowledged. Quotas and telemetry validated.",
      time: "10:18 AM",
    },
  ]);

  /**
   * Helper function: Generates headers reflecting the active RBAC persona.
   */
  const getRbacHeaders = () => ({
    "X-User-Id": currentPersona.userId,
    "X-User-Role": currentPersona.role,
    "X-Tenant-Id": currentPersona.tenantId,
  });

  /**
   * Fetches the scoped guest VM/LXC inventory for the current persona.
   */
  const fetchResources = async () => {
    try {
      const res = await fetch(
        "http://localhost:8000/api/v1/cluster/resources",
        {
          headers: getRbacHeaders(),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setResources(data);
      } else {
        setResources([]);
      }
    } catch (err) {
      console.error("Failed to fetch cluster resources:", err);
    }
  };

  /**
   * Fetches real bare-metal node telemetry from Proxmox (SuperAdmin only).
   */
  const fetchTelemetry = async () => {
    if (currentPersona.role !== "SuperAdmin") {
      setTelemetry(null);
      return;
    }
    try {
      const res = await fetch("http://localhost:8000/api/v1/nodes/telemetry", {
        headers: getRbacHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data);
      }
    } catch (err) {
      console.error("Failed to fetch telemetry:", err);
    }
  };

  // Polling loop: Refreshes VM status and telemetry every 4 seconds
  useEffect(() => {
    fetchResources();
    fetchTelemetry();
    const interval = setInterval(() => {
      fetchResources();
      fetchTelemetry();
    }, 4000);
    return () => clearInterval(interval);
  }, [currentPersona]);

  /**
   * Triggers VM power states (start, shutdown) with RBAC validation.
   */
  const handlePowerAction = async (
    node: string,
    vmType: "qemu" | "lxc",
    vmid: number,
    action: string,
  ) => {
    setActionLoading(vmid);
    try {
      const res = await fetch(
        `http://localhost:8000/api/v1/nodes/${node}/${vmType}/${vmid}/power/${action}`,
        {
          method: "POST",
          headers: getRbacHeaders(),
        },
      );
      if (res.ok) {
        await fetchResources();
      } else {
        const err = await res.json();
        alert(err.detail || "Action unauthorized");
      }
    } catch (err) {
      console.error("Power action failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    setMessages([
      ...messages,
      {
        id: Date.now(),
        sender: "You",
        role: currentPersona.role,
        text: chatMessage,
        time: "Just now",
      },
    ]);
    setChatMessage("");
  };

  // Role Capability Checks
  const canControlPower =
    currentPersona.role === "SuperAdmin" ||
    currentPersona.role === "TenantAdmin";
  const canAccessConsole =
    currentPersona.role === "SuperAdmin" ||
    currentPersona.role === "TenantAdmin";
  const canViewHostTelemetry = currentPersona.role === "SuperAdmin";

  // Navigation Items dynamic filter based on role permissions
  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    ...(canViewHostTelemetry
      ? [{ id: "analytics", label: "Analytics", icon: BarChart3 }]
      : []),
    { id: "workspaces", label: "Workspaces", icon: Boxes },
    ...(currentPersona.role === "SuperAdmin"
      ? [{ id: "customers", label: "Customers", icon: Users }]
      : []),
    { id: "orders", label: "Orders & Billing", icon: ShoppingCart },
    { id: "tasks", label: "Tasks", icon: CheckSquare },
    { id: "calendar", label: "Calendar", icon: CalendarIcon },
    { id: "notes", label: "Notes", icon: StickyNote },
    { id: "chats", label: "Chats", icon: MessageSquare },
    { id: "apps", label: "Apps", icon: Grid },
  ];

  const runningCount = resources.filter((r) => r.status === "running").length;

  return (
    <div className="flex h-screen bg-[#0d0d0f] text-zinc-100 font-sans antialiased overflow-hidden selection:bg-zinc-800">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#121214] border-r border-zinc-800/80 flex flex-col justify-between shrink-0">
        <div className="p-4 flex flex-col h-full">
          {/* Persona Switcher Selector for RBAC simulation */}
          <div className="p-3 bg-[#18181b] border border-zinc-800 rounded-xl mb-6">
            <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-2 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> Active
              Persona
            </div>
            <select
              value={currentPersona.userId}
              onChange={(e) => {
                const found = PERSONAS.find((p) => p.userId === e.target.value);
                if (found) setCurrentPersona(found);
              }}
              className="w-full bg-zinc-900 border border-zinc-700 text-xs text-white rounded-lg p-2 focus:outline-none focus:border-emerald-500"
            >
              {PERSONAS.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.label}
                </option>
              ))}
            </select>
            <div className="mt-2 text-[10px] font-mono text-zinc-400 flex justify-between">
              <span>
                Role:{" "}
                <strong className="text-emerald-400">
                  {currentPersona.role}
                </strong>
              </span>
              <span>
                Tenant:{" "}
                <strong className="text-sky-400">
                  {currentPersona.tenantId}
                </strong>
              </span>
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
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header Bar */}
        <header className="h-16 border-b border-zinc-800/80 bg-[#121214]/60 backdrop-blur-md px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold text-white tracking-tight capitalize">
              {activeTab}
            </h1>

            <div className="bg-[#18181b] p-0.5 rounded-xl border border-zinc-800 flex items-center">
              {(["week", "month", "quarter"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setTimeFilter(filter)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all ${
                    timeFilter === filter
                      ? "bg-zinc-800 text-white shadow"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  This {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3 py-1 bg-zinc-800/80 border border-zinc-700/60 rounded-xl text-xs font-mono text-zinc-300">
              User:{" "}
              <span className="text-white font-bold">
                {currentPersona.userId}
              </span>
            </div>
          </div>
        </header>

        {/* Dynamic Route Content */}
        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* ================= OVERVIEW VIEW ================= */}
          {activeTab === "overview" && (
            <>
              {/* Stat Metric Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-xs font-semibold">Total Guests</span>
                    <Server className="w-4 h-4 text-zinc-500" />
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-white tracking-tight">
                      {resources.length}
                    </span>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {runningCount} active instances
                    </p>
                  </div>
                </div>

                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-xs font-semibold">
                      Completed Tasks
                    </span>
                    <CheckCircle2 className="w-4 h-4 text-zinc-500" />
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-white tracking-tight">
                      {taskList.filter((t) => t.status === "Completed").length}
                    </span>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Verified automations
                    </p>
                  </div>
                </div>

                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-xs font-semibold">Events</span>
                    <CalendarIcon className="w-4 h-4 text-zinc-500" />
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-white tracking-tight">
                      5
                    </span>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Maintenance windows
                    </p>
                  </div>
                </div>

                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-xs font-semibold">Notes</span>
                    <StickyNote className="w-4 h-4 text-zinc-500" />
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-white tracking-tight">
                      {notes.length}
                    </span>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Saved runbooks
                    </p>
                  </div>
                </div>
              </div>

              {/* Proxmox Compute Infrastructure Grid */}
              <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-400" />
                      Provisioned Virtual Machines
                    </h2>
                    <p className="text-[11px] text-zinc-400">
                      {currentPersona.role === "SuperAdmin"
                        ? "Global Cluster View (All Tenants)"
                        : `Tenant Scoped View (${currentPersona.tenantId})`}
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
                    {currentPersona.role === "BillingManager"
                      ? "Billing Manager Role has no permission to view active compute instances."
                      : "No instances assigned to this tenant workspace."}
                  </div>
                ) : (
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="bg-[#121214] text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                      <tr>
                        <th className="px-6 py-3">Guest</th>
                        <th className="px-6 py-3">Node</th>
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
                            </span>
                            {vm.name}
                          </td>
                          <td className="px-6 py-4 text-zinc-400">{vm.node}</td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
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
                            {/* Console Launch Button (Role-Gated) */}
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
                              <Terminal className="w-3.5 h-3.5" />
                              Console
                            </button>

                            {/* Power Controls (Role-Gated) */}
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
                                  title="Graceful Shutdown"
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
                                  title="Power On"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                </button>
                              )
                            ) : (
                              <button
                                disabled
                                className="p-1.5 bg-zinc-800/40 text-zinc-600 rounded-lg border border-zinc-800"
                                title="Power controls restricted to Admins"
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

          {/* ================= ANALYTICS VIEW (SUPERADMIN ONLY) ================= */}
          {activeTab === "analytics" && canViewHostTelemetry && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6">
                  <div className="flex items-center justify-between text-zinc-400 mb-2">
                    <span className="text-xs font-semibold">
                      Cluster Aggregated CPU
                    </span>
                    <Cpu className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-bold text-white font-mono">
                    {telemetry ? `${telemetry.cpu.usage_pct}%` : "---"}
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-4 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full transition-all duration-500"
                      style={{ width: `${telemetry?.cpu.usage_pct || 0}%` }}
                    ></div>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-2 truncate">
                    {telemetry
                      ? `${telemetry.cpu.cores} Cores (${telemetry.cpu.sockets} Sockets) • ${telemetry.cpu.model}`
                      : "Polling CPU sockets..."}
                  </p>
                </div>

                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6">
                  <div className="flex items-center justify-between text-zinc-400 mb-2">
                    <span className="text-xs font-semibold">
                      Host Physical RAM
                    </span>
                    <HardDrive className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-white font-mono">
                    {telemetry
                      ? `${telemetry.memory.used_gb} / ${telemetry.memory.total_gb} GB`
                      : "---"}
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-4 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-500"
                      style={{ width: `${telemetry?.memory.usage_pct || 0}%` }}
                    ></div>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-2">
                    {telemetry
                      ? `${telemetry.memory.usage_pct}% allocated memory pool`
                      : "Calculating system RAM..."}
                  </p>
                </div>

                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6">
                  <div className="flex items-center justify-between text-zinc-400 mb-2">
                    <span className="text-xs font-semibold">
                      Local Rootfs Storage
                    </span>
                    <Activity className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="text-2xl font-bold text-white font-mono">
                    {telemetry
                      ? `${telemetry.storage.used_gb} / ${telemetry.storage.total_gb} GB`
                      : "---"}
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-4 overflow-hidden">
                    <div
                      className="bg-sky-500 h-full transition-all duration-500"
                      style={{ width: `${telemetry?.storage.usage_pct || 0}%` }}
                    ></div>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-2">
                    {telemetry
                      ? `${telemetry.storage.usage_pct}% storage capacity utilized`
                      : "Reading local storage..."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ================= WORKSPACES VIEW ================= */}
          {activeTab === "workspaces" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Isolated Tenant Workspaces
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Multi-tenant compute partitions and SDN VLAN boundaries
                  </p>
                </div>
                {canControlPower && (
                  <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Create Workspace
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    name: "Alpha Cloud Solutions",
                    vlan: "VLAN 101",
                    vms: 3,
                    quota: "32GB RAM / 8 vCPU",
                    tier: "Enterprise",
                  },
                  {
                    name: "FinTech Vault Core",
                    vlan: "VLAN 102",
                    vms: 2,
                    quota: "16GB RAM / 4 vCPU",
                    tier: "Dedicated",
                  },
                  {
                    name: "DevSecOps Sandbox",
                    vlan: "VLAN 104",
                    vms: 0,
                    quota: "64GB RAM / 16 vCPU",
                    tier: "Internal",
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
                      <span>{ws.vms} Instances</span>
                      <button className="text-indigo-400 hover:underline flex items-center gap-1">
                        Configure <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================= CUSTOMERS VIEW ================= */}
          {activeTab === "customers" &&
            currentPersona.role === "SuperAdmin" && (
              <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-white">
                      Partner Tenant Accounts
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Active contracts, billing schedules, and assigned nodes
                    </p>
                  </div>
                </div>
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#121214] text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="px-6 py-3">Tenant Name</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Instances</th>
                      <th className="px-6 py-3">MRR</th>
                      <th className="px-6 py-3">Primary Contact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {[
                      {
                        name: "Alpha Cloud Solutions",
                        status: "Active",
                        vms: "3 Instances",
                        mrr: "$1,200",
                        contact: "ops@alphacloud.io",
                      },
                      {
                        name: "FinTech Vault Core",
                        status: "Active",
                        vms: "2 Instances",
                        mrr: "$2,400",
                        contact: "security@fintechvault.io",
                      },
                    ].map((cust, i) => (
                      <tr key={i} className="hover:bg-zinc-800/20">
                        <td className="px-6 py-4 font-semibold text-white">
                          {cust.name}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold rounded-full">
                            {cust.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-zinc-400">
                          {cust.vms}
                        </td>
                        <td className="px-6 py-4 font-mono text-white font-medium">
                          {cust.mrr}
                        </td>
                        <td className="px-6 py-4 text-zinc-400">
                          {cust.contact}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          {/* ================= ORDERS & BILLING VIEW ================= */}
          {activeTab === "orders" && (
            <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Billing Statements & Invoices
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Automated recurring billing statements and compute expansion
                    charges
                  </p>
                </div>
              </div>
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-[#121214] text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                  <tr>
                    <th className="px-6 py-3">Invoice ID</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3">Amount</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {[
                    {
                      id: "INV-2026-089",
                      desc: "Enterprise Compute Expansion (32GB RAM)",
                      amount: "$420.00",
                      status: "Paid",
                    },
                    {
                      id: "INV-2026-088",
                      desc: "Monthly Hypervisor Tenant Subscription",
                      amount: "$1,200.00",
                      status: "Paid",
                    },
                  ].map((order, i) => (
                    <tr key={i} className="hover:bg-zinc-800/20">
                      <td className="px-6 py-4 font-mono font-medium text-white">
                        {order.id}
                      </td>
                      <td className="px-6 py-4 text-zinc-300">{order.desc}</td>
                      <td className="px-6 py-4 font-mono text-white">
                        {order.amount}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 text-[10px] font-semibold rounded-full">
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ================= CHATS VIEW ================= */}
          {activeTab === "chats" && (
            <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl h-[600px] flex overflow-hidden">
              <div className="w-64 border-r border-zinc-800 p-4 flex flex-col">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                  Support Channels
                </h3>
                <div className="space-y-1 flex-1">
                  {["tech-support", "devops-alerts", "tenant-sla"].map((ch) => (
                    <button
                      key={ch}
                      onClick={() => setActiveChat(ch)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        activeChat === ch
                          ? "bg-zinc-800 text-white font-semibold"
                          : "text-zinc-400 hover:bg-zinc-800/40"
                      }`}
                    >
                      #{ch}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-between bg-[#121214]">
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    #{activeChat}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Encrypted Sovereign Channel
                  </span>
                </div>

                <div className="flex-1 p-6 overflow-y-auto space-y-4">
                  {messages.map((m) => (
                    <div key={m.id} className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-200">
                          {m.sender}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {m.role} • {m.time}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 mt-1 bg-zinc-900 border border-zinc-800/80 rounded-xl p-3 inline-block max-w-lg">
                        {m.text}
                      </p>
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={handleSendMessage}
                  className="p-4 border-t border-zinc-800 flex gap-2"
                >
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Broadcast message to channel..."
                    className="flex-1 bg-[#18181b] border border-zinc-800 rounded-xl px-4 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" /> Send
                  </button>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Embedded noVNC Terminal Modal */}
      {activeTerminal && (
        <VncTerminal
          node={activeTerminal.node}
          vmType={activeTerminal.vmType}
          vmid={activeTerminal.vmid}
          vmName={activeTerminal.vmName}
          onClose={() => setActiveTerminal(null)}
        />
      )}
    </div>
  );
}
