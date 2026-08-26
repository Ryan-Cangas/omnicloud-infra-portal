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
  Search,
  Bell,
  Palette,
  Terminal,
  Play,
  Square,
  RotateCcw,
  Server,
  Activity,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  Cpu,
  HardDrive,
  Plus,
  Filter,
  Download,
  ExternalLink,
  ShieldCheck,
  CreditCard,
  Send,
  MoreVertical,
  Check,
} from "lucide-react";
import { VncTerminal } from "./components/VncTerminal";

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

export default function App() {
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
  const [resources, setResources] = useState<GuestResource[]>([]);
  const [, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // noVNC Modal State
  const [activeTerminal, setActiveTerminal] = useState<{
    node: string;
    vmType: "qemu" | "lxc";
    vmid: number;
    vmName: string;
  } | null>(null);

  // Messaging state
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

  // Notes state
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
    {
      id: 3,
      title: "Wazuh SIEM Rule Tuning",
      tag: "Security",
      snippet:
        "Audit logs for PAM logins on 192.168.1.200 mapped to SOAR webhook.",
    },
  ]);

  // Task Manager State
  const [taskList, setTaskList] = useState([
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
    {
      id: 3,
      title: "Audit Tailscale node ACL permissions",
      status: "Open",
      priority: "Medium",
      date: "Aug 27",
    },
    {
      id: 4,
      title: "Renew Proxmox Enterprise repository tokens",
      status: "Open",
      priority: "Low",
      date: "Aug 28",
    },
  ]);

  const fetchResources = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/v1/cluster/resources");
      if (res.ok) {
        const data = await res.json();
        setResources(data);
      }
    } catch (err) {
      console.error("Failed to fetch cluster resources:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
    const interval = setInterval(fetchResources, 5000);
    return () => clearInterval(interval);
  }, []);

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
        },
      );
      if (res.ok) {
        await fetchResources();
      }
    } catch (err) {
      console.error(`Failed to execute ${action}:`, err);
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
        role: "Admin",
        text: chatMessage,
        time: "Just now",
      },
    ]);
    setChatMessage("");
  };

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "workspaces", label: "Workspaces", icon: Boxes },
    { id: "customers", label: "Customers", icon: Users },
    { id: "orders", label: "Orders", icon: ShoppingCart },
    { id: "tasks", label: "Tasks", icon: CheckSquare },
    { id: "calendar", label: "Calendar", icon: CalendarIcon },
    { id: "notes", label: "Notes", icon: StickyNote },
    { id: "chats", label: "Chats", icon: MessageSquare },
    { id: "apps", label: "Apps", icon: Grid },
  ];

  const runningCount = resources.filter((r) => r.status === "running").length;

  return (
    <div className="flex h-screen bg-[#0d0d0f] text-zinc-100 font-sans antialiased overflow-hidden selection:bg-zinc-800">
      {/* Sidebar */}
      <aside className="w-64 bg-[#121214] border-r border-zinc-800/80 flex flex-col justify-between shrink-0">
        <div className="p-4 flex flex-col h-full">
          {/* Tenant Selector */}
          <div className="flex items-center justify-between p-2 rounded-xl hover:bg-zinc-800/40 cursor-pointer transition-colors border border-transparent hover:border-zinc-800 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center font-bold text-xs text-zinc-300">
                P
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-semibold text-zinc-200">
                  Partner Portal
                </span>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active
                </span>
              </div>
            </div>
            <ChevronsUpDown className="w-4 h-4 text-zinc-500" />
          </div>

          <div className="text-[11px] font-semibold text-zinc-500 px-3 uppercase tracking-wider mb-2">
            General
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

          <div className="pt-4 border-t border-zinc-800/60">
            <button className="w-full py-2.5 px-4 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Upgrade Plan
            </button>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-zinc-800/80 bg-[#121214]/60 backdrop-blur-md px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-zinc-400" />
              <h1 className="text-lg font-bold text-white tracking-tight">
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </h1>
            </div>

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
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search resources, tenants, logs..."
                className="bg-[#18181b] border border-zinc-800 rounded-xl pl-9 pr-10 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 w-72 transition-colors"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 border border-zinc-700/60 rounded px-1.5 py-0.5 font-mono">
                ⌘K
              </span>
            </div>

            <button className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 rounded-xl border border-zinc-800 relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full"></span>
            </button>
            <button className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 rounded-xl border border-zinc-800">
              <Palette className="w-4 h-4" />
            </button>
            <button className="px-3.5 py-1.5 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs rounded-xl shadow transition-all">
              Admin Profile
            </button>
          </div>
        </header>

        {/* View Routing Body */}
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
                      Saved documentation items
                    </p>
                  </div>
                </div>
              </div>

              {/* Agenda & Tasks Overview Row */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-[#151518] border border-zinc-800/80 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-bold text-white">Agenda</h2>
                      <p className="text-[11px] text-zinc-400">Today, Aug 26</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="p-1 hover:bg-zinc-800 rounded text-zinc-400">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-semibold text-zinc-200">
                        Today
                      </span>
                      <button className="p-1 hover:bg-zinc-800 rounded text-zinc-400">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-[#1a1a1e] border border-zinc-800/60 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-xs font-mono font-medium text-zinc-300">
                          09:00–09:30
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Meeting
                        </span>
                        <span className="text-xs font-medium text-zinc-200">
                          Infrastructure Standup
                        </span>
                      </div>
                    </div>
                    <div className="bg-[#1a1a1e] border border-zinc-800/60 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-xs font-mono font-medium text-zinc-300">
                          14:00–15:00
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          Call
                        </span>
                        <span className="text-xs font-medium text-zinc-200">
                          Enterprise SLA Review
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-[#151518] border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-white">
                      Tasks overview
                    </h2>
                    <p className="text-[11px] text-zinc-400 mb-4">
                      {taskList.length} active deployment targets
                    </p>

                    <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden flex mb-6">
                      <div
                        className="bg-sky-400 h-full"
                        style={{ width: "50%" }}
                      ></div>
                      <div
                        className="bg-emerald-400 h-full"
                        style={{ width: "25%" }}
                      ></div>
                      <div
                        className="bg-amber-400 h-full"
                        style={{ width: "25%" }}
                      ></div>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between text-zinc-300">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-sky-400"></span>{" "}
                          Open
                        </span>
                        <span className="font-mono text-zinc-400">2 (50%)</span>
                      </div>
                      <div className="flex items-center justify-between text-zinc-300">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>{" "}
                          Completed
                        </span>
                        <span className="font-mono text-zinc-400">1 (25%)</span>
                      </div>
                      <div className="flex items-center justify-between text-zinc-300">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400"></span>{" "}
                          In Progress
                        </span>
                        <span className="font-mono text-zinc-400">1 (25%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Infrastructure VM/LXC Compute Cluster Table */}
              <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-400" />
                      Infrastructure & Guest Virtual Machines
                    </h2>
                    <p className="text-[11px] text-zinc-400">
                      Real-time Proxmox hypervisor telemetry and RFB console
                      access
                    </p>
                  </div>
                  <button
                    onClick={fetchResources}
                    className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="bg-[#121214] text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                      <tr>
                        <th className="px-6 py-3">Guest Instance</th>
                        <th className="px-6 py-3">Type</th>
                        <th className="px-6 py-3">Cluster Node</th>
                        <th className="px-6 py-3">State</th>
                        <th className="px-6 py-3">CPU Usage</th>
                        <th className="px-6 py-3">RAM Allocation</th>
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
                          <td className="px-6 py-4">
                            <span className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono uppercase">
                              {vm.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-zinc-400">{vm.node}</td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                vm.status === "running"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  vm.status === "running"
                                    ? "bg-emerald-400 animate-pulse"
                                    : "bg-zinc-500"
                                }`}
                              ></span>
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
                              disabled={vm.status !== "running"}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 text-white font-medium rounded-lg text-xs transition-colors inline-flex items-center gap-1.5 shadow-sm"
                            >
                              <Terminal className="w-3.5 h-3.5" />
                              Console
                            </button>

                            {vm.status === "running" ? (
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
                                className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg border border-rose-500/20 transition-colors"
                                title="Shutdown"
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
                                className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/20 transition-colors"
                                title="Start"
                              >
                                <Play className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ================= ANALYTICS VIEW ================= */}
          {activeTab === "analytics" && (
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
                    14.2%
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-4 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full"
                      style={{ width: "14.2%" }}
                    ></div>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-2">
                    16 Cores allocated across 2 physical sockets
                  </p>
                </div>

                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6">
                  <div className="flex items-center justify-between text-zinc-400 mb-2">
                    <span className="text-xs font-semibold">
                      Provisioned RAM
                    </span>
                    <HardDrive className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-white font-mono">
                    24.5 / 64 GB
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-4 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full"
                      style={{ width: "38%" }}
                    ></div>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-2">
                    38% total physical pool utilization
                  </p>
                </div>

                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6">
                  <div className="flex items-center justify-between text-zinc-400 mb-2">
                    <span className="text-xs font-semibold">
                      Network I/O Throughput
                    </span>
                    <Activity className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="text-2xl font-bold text-white font-mono">
                    1.2 Gbps
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-4 overflow-hidden">
                    <div
                      className="bg-sky-500 h-full"
                      style={{ width: "60%" }}
                    ></div>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-2">
                    Zero packet drop rate across vmbr0 bridge
                  </p>
                </div>
              </div>

              <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-white mb-1">
                  Hypervisor Ingress Telemetry
                </h3>
                <p className="text-xs text-zinc-400 mb-6">
                  Historical load metrics sampled every 60 seconds
                </p>
                <div className="h-48 border border-dashed border-zinc-800 rounded-xl flex items-center justify-center text-xs text-zinc-500 font-mono">
                  [ Live Telemetry Chart Pipeline Active: Prometheus /
                  OpenObserve Engine ]
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
                <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Create Workspace
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    name: "Alpha Cloud Solutions",
                    vlan: "VLAN 101",
                    vms: 4,
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
                    vms: 6,
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
          {activeTab === "customers" && (
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
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 rounded-xl border border-zinc-700 flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5" /> Filter
                  </button>
                  <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Add Customer
                  </button>
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
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {[
                    {
                      name: "Apex Logistics LLC",
                      status: "Active",
                      vms: "4 QEMU",
                      mrr: "$1,200",
                      contact: "ops@apexlogistics.ae",
                    },
                    {
                      name: "Sovereign Bank DXB",
                      status: "Active",
                      vms: "8 QEMU / 2 LXC",
                      mrr: "$4,800",
                      contact: "cloud@sovereign.ae",
                    },
                    {
                      name: "Nexus Media Hub",
                      status: "Pending Review",
                      vms: "1 QEMU",
                      mrr: "$350",
                      contact: "admin@nexus.io",
                    },
                  ].map((cust, i) => (
                    <tr
                      key={i}
                      className="hover:bg-zinc-800/20 transition-colors"
                    >
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
                      <td className="px-6 py-4 text-right">
                        <button className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ================= ORDERS VIEW ================= */}
          {activeTab === "orders" && (
            <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Billing & Infrastructure Orders
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Automated invoice statements and resource provisioning logs
                  </p>
                </div>
                <button className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 rounded-xl border border-zinc-700 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Export Statements
                </button>
              </div>

              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-[#121214] text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                  <tr>
                    <th className="px-6 py-3">Order ID</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3">Tenant</th>
                    <th className="px-6 py-3">Amount</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {[
                    {
                      id: "INV-2026-089",
                      desc: "Compute Expansion (8 vCPU / 32GB RAM)",
                      tenant: "Apex Logistics",
                      amount: "$420.00",
                      status: "Paid",
                    },
                    {
                      id: "INV-2026-088",
                      desc: "Monthly Dedicated Hypervisor Host",
                      tenant: "Sovereign Bank",
                      amount: "$4,800.00",
                      status: "Paid",
                    },
                    {
                      id: "INV-2026-087",
                      desc: "LXC Microservices Cluster Setup",
                      tenant: "Nexus Media Hub",
                      amount: "$350.00",
                      status: "Processing",
                    },
                  ].map((order, i) => (
                    <tr
                      key={i}
                      className="hover:bg-zinc-800/20 transition-colors"
                    >
                      <td className="px-6 py-4 font-mono font-medium text-white">
                        {order.id}
                      </td>
                      <td className="px-6 py-4 text-zinc-300">{order.desc}</td>
                      <td className="px-6 py-4 text-zinc-400">
                        {order.tenant}
                      </td>
                      <td className="px-6 py-4 font-mono text-white">
                        {order.amount}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 text-[10px] font-semibold rounded-full">
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-zinc-400 hover:text-white text-xs underline font-medium">
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ================= TASKS VIEW ================= */}
          {activeTab === "tasks" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    System Tasks & DevOps Queue
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Automated SOAR triggers, maintenance routines, and
                    engineering checklists
                  </p>
                </div>
                <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Create Task
                </button>
              </div>

              <div className="space-y-3">
                {taskList.map((task) => (
                  <div
                    key={task.id}
                    className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-4 flex items-center justify-between hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-lg border flex items-center justify-center cursor-pointer ${
                          task.status === "Completed"
                            ? "bg-emerald-500 border-emerald-500 text-zinc-950"
                            : "border-zinc-700 hover:border-zinc-500"
                        }`}
                        onClick={() => {
                          setTaskList(
                            taskList.map((t) =>
                              t.id === task.id
                                ? {
                                    ...t,
                                    status:
                                      t.status === "Completed"
                                        ? "Open"
                                        : "Completed",
                                  }
                                : t,
                            ),
                          );
                        }}
                      >
                        {task.status === "Completed" && (
                          <Check className="w-3.5 h-3.5 font-bold" />
                        )}
                      </div>
                      <div>
                        <span
                          className={`text-xs font-semibold ${task.status === "Completed" ? "line-through text-zinc-500" : "text-zinc-200"}`}
                        >
                          {task.title}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-mono text-zinc-500">
                            Due {task.date}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-semibold ${
                              task.priority === "Urgent"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {task.priority}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                        task.status === "Completed"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : task.status === "In Progress"
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {task.status}
                    </span>
                  </div>
                ))}
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
                    Node kernel updates, hypervisor failover tests, and backup
                    syncs
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    time: "02:00 - 03:30 UTC",
                    title: "PVE Kernel Patch 8.3",
                    date: "Tonight",
                    tag: "Hypervisor",
                  },
                  {
                    time: "12:00 - 13:00 UTC",
                    title: "Ceph Storage Pool Rebalance",
                    date: "Tomorrow",
                    tag: "Storage",
                  },
                  {
                    time: "22:00 - 23:00 UTC",
                    title: "Wazuh Rule Definitions Sync",
                    date: "Aug 29",
                    tag: "Security",
                  },
                ].map((ev, i) => (
                  <div
                    key={i}
                    className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] font-mono rounded">
                        {ev.tag}
                      </span>
                      <span className="text-[10px] font-semibold text-sky-400">
                        {ev.date}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white mb-1">
                      {ev.title}
                    </h3>
                    <p className="text-xs text-zinc-400 font-mono mt-2 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-zinc-500" /> {ev.time}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================= NOTES VIEW ================= */}
          {activeTab === "notes" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Technical Runbooks & Documentation
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Standard operating procedures, encryption protocols, and
                    network maps
                  </p>
                </div>
                <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> New Note
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between"
                  >
                    <div>
                      <span className="px-2 py-0.5 bg-zinc-800 text-[10px] font-mono text-indigo-400 rounded">
                        {note.tag}
                      </span>
                      <h3 className="text-sm font-bold text-white mt-3 mb-2">
                        {note.title}
                      </h3>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        {note.snippet}
                      </p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-between items-center text-xs text-zinc-500">
                      <span>Markdown Ready</span>
                      <button className="text-zinc-300 hover:text-white text-xs font-semibold">
                        Edit Runbook
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================= CHATS VIEW ================= */}
          {activeTab === "chats" && (
            <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl h-[600px] flex overflow-hidden">
              {/* Channel Sidebar */}
              <div className="w-64 border-r border-zinc-800 p-4 flex flex-col">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                  Channels
                </h3>
                <div className="space-y-1 flex-1">
                  {[
                    { id: "tech-support", name: "# tech-support" },
                    { id: "devops-alerts", name: "# devops-alerts" },
                    { id: "tenant-sla", name: "# tenant-sla" },
                  ].map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => setActiveChat(ch.id)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        activeChat === ch.id
                          ? "bg-zinc-800 text-white font-semibold"
                          : "text-zinc-400 hover:bg-zinc-800/40"
                      }`}
                    >
                      {ch.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat Stream */}
              <div className="flex-1 flex flex-col justify-between bg-[#121214]">
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    #{activeChat}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    End-to-End Encrypted
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

          {/* ================= APPS VIEW ================= */}
          {activeTab === "apps" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-bold text-white">
                  Connected Cloud Integrations
                </h2>
                <p className="text-xs text-zinc-400">
                  Native orchestrator modules and external service telemetry
                  pipelines
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    name: "Proxmox Virtual Environment",
                    status: "Connected",
                    desc: "Direct hypervisor REST API control plane with automated VNC proxying.",
                    icon: Server,
                  },
                  {
                    name: "Wazuh SIEM / SOAR",
                    status: "Active",
                    desc: "Centralized security telemetry, intrusion detection, and automatic ACL containment.",
                    icon: ShieldCheck,
                  },
                  {
                    name: "Tailscale Mesh VPN",
                    status: "Active",
                    desc: "WireGuard zero-trust peer-to-peer overlay network across tenant instances.",
                    icon: Activity,
                  },
                  {
                    name: "Terraform Provider",
                    status: "Ready",
                    desc: "Infrastructure as Code deployment automation for QEMU templates.",
                    icon: Boxes,
                  },
                  {
                    name: "Stripe Billing Connect",
                    status: "Connected",
                    desc: "Automatic subscription renewals and resource usage invoicing.",
                    icon: CreditCard,
                  },
                  {
                    name: "Grafana & Prometheus",
                    status: "Ready",
                    desc: "High-frequency metric scrapers and visual status dashboards.",
                    icon: BarChart3,
                  },
                ].map((app, i) => {
                  const Icon = app.icon;
                  return (
                    <div
                      key={i}
                      className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="p-2.5 bg-zinc-800/80 border border-zinc-700/60 rounded-xl text-indigo-400">
                            <Icon className="w-5 h-5" />
                          </div>
                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold rounded-full">
                            {app.status}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-white mb-1">
                          {app.name}
                        </h3>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          {app.desc}
                        </p>
                      </div>
                      <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-end">
                        <button className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 rounded-lg border border-zinc-700">
                          Manage Settings
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Interactive noVNC Terminal Modal */}
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
