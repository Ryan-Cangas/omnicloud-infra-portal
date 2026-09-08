/**
 * Sovereign Cloud Management Platform (CMP) & Cloud CRM Dashboard.
 *
 * Developer Notes:
 * 1. Time Horizon Filter: "This Week", "This Month", and "This Quarter" dynamically re-calculate
 *    CRM progress, revenue MRR, completed task velocity, and tenant provisioning rates.
 * 2. Cryptographic JWT Authentication: Requests signed Bearer tokens from /api/v1/auth/login and
 *    attaches Authorization headers across all protected endpoints.
 * 3. Multi-Tenant RBAC Integration: Evaluates active persona boundaries (SuperAdmin, TenantAdmin,
 *    TenantViewer, BillingManager) across infrastructure actions and financial records. Strict
 *    session isolation is enforced.
 * 4. Notion Two-Way Sync: Notes and SOP Runbooks are fetched from and pushed to your Notion database,
 *    supporting Title, Tag, Snippet, Author, and custom Date properties.
 * 5. Functional Modules Scaffolding:
 *    - Tasks: Filterable, interactive status toggle (Pending -> In Progress -> Completed).
 *    - Calendar: Maintenance windows, scheduled audit slots, and hypervisor kernel patch timelines.
 *    - Notes: Notion-backed SOP repository with interactive tag filtering (Infrastructure, Security, Update).
 *    - Chats: Support channel switcher with real-time interactive message broadcasting.
 *    - Apps: Sovereign cloud integration marketplace (Wazuh SIEM, OpenObserve, Vault, Prometheus).
 */

import React, { useState, useEffect, useMemo } from "react";
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
  Clock,
  Cpu,
  HardDrive,
  Plus,
  ExternalLink,
  Send,
  Lock,
  UserCheck,
  CalendarDays,
  Tag,
  TrendingUp,
  ArrowUpRight,
  LogOut,
  KeyRound,
} from "lucide-react";
import { VncTerminal } from "./components/VncTerminal";

type Role = "SuperAdmin" | "TenantAdmin" | "TenantViewer" | "BillingManager";
type TimeFilter = "week" | "month" | "quarter";

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
    name: "Alpha Corp (TenantAdmin)",
    defaultPassword: "password123",
  },
  {
    userId: "viewer-sam",
    role: "TenantViewer",
    tenantId: "tenant-alpha",
    name: "Alpha Corp (TenantViewer)",
    defaultPassword: "password123",
  },
  {
    userId: "finance-claire",
    role: "BillingManager",
    tenantId: "tenant-alpha",
    name: "Finance (BillingManager)",
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

interface NodeTelemetry {
  node: string;
  cpu: { usage_pct: number; cores: number; sockets: number; model: string };
  memory: { used_gb: number; total_gb: number; usage_pct: number };
  storage: { used_gb: number; total_gb: number; usage_pct: number };
  system: { pve_version: string; kernel_version: string; uptime: number };
}

interface TaskItem {
  id: number;
  title: string;
  horizon: TimeFilter;
  status: "Pending" | "In Progress" | "Completed";
  priority: "High" | "Medium" | "Low";
  dueDate: string;
  assignee: string;
}

interface CalendarEvent {
  id: number;
  title: string;
  type: "Maintenance" | "Security Audit" | "Billing Review" | "Snapshot Backup";
  date: string;
  time: string;
  horizon: TimeFilter;
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

export default function App() {
  // Navigation View State
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

  // Time Horizon Filter State (This Week, This Month, This Quarter)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("month");

  // Authentication State
  const [authToken, setAuthToken] = useState<string | null>(
    localStorage.getItem("cmp_jwt_token"),
  );
  const [currentUser, setCurrentUser] = useState<PersonaProfile | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>("");

  // Fallback Manual Credentials
  const [loginUsername, setLoginUsername] = useState("admin-01");
  const [loginPassword, setLoginPassword] = useState("password123");

  // Compute & Node Telemetry States
  const [resources, setResources] = useState<GuestResource[]>([]);
  const [telemetry, setTelemetry] = useState<NodeTelemetry | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Active noVNC Terminal target state
  const [activeTerminal, setActiveTerminal] = useState<{
    node: string;
    vmType: "qemu" | "lxc";
    vmid: number;
    vmName: string;
  } | null>(null);

  // Tasks State
  const [taskList, setTaskList] = useState<TaskItem[]>([
    {
      id: 1,
      title: "Inspect QEMU-100 zero-knowledge vault backups",
      horizon: "week",
      status: "Completed",
      priority: "High",
      dueDate: "Aug 28",
      assignee: "Alex Rivera",
    },
    {
      id: 2,
      title: "Apply kernel patch to node pve-server",
      horizon: "week",
      status: "In Progress",
      priority: "High",
      dueDate: "Aug 30",
      assignee: "CloudHost DevOps",
    },
    {
      id: 3,
      title: "Re-balance storage pool local-lvm allocations",
      horizon: "month",
      status: "Pending",
      priority: "Medium",
      dueDate: "Sep 12",
      assignee: "Infra Ops",
    },
    {
      id: 4,
      title: "Quarterly compliance audit and SIEM event validation",
      horizon: "quarter",
      status: "In Progress",
      priority: "High",
      dueDate: "Oct 05",
      assignee: "SecOps Team",
    },
  ]);

  // Calendar Events State
  const [calendarEvents] = useState<CalendarEvent[]>([
    {
      id: 1,
      title: "Corosync Node Heartbeat Calibration",
      type: "Maintenance",
      date: "Aug 29, 2026",
      time: "02:00 - 03:00 UTC",
      horizon: "week",
      targetNode: "pve-server",
    },
    {
      id: 2,
      title: "ZFS Pool Scrubbing & Trim Procedure",
      type: "Snapshot Backup",
      date: "Sep 04, 2026",
      time: "23:00 - 01:00 UTC",
      horizon: "month",
      targetNode: "pve-server",
    },
    {
      id: 3,
      title: "Tenant Isolation & RBAC Penetration Audit",
      type: "Security Audit",
      date: "Sep 18, 2026",
      time: "09:00 - 16:00 UTC",
      horizon: "month",
      targetNode: "Cluster Global",
    },
  ]);

  // Notion Notes & SOP State
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("All");
  const [isNotesLoading, setIsNotesLoading] = useState<boolean>(false);
  const [isCreatingNote, setIsCreatingNote] = useState<boolean>(false);

  // Form state for creating a new Notion SOP
  const [newTitle, setNewTitle] = useState("");
  const [newTag, setNewTag] = useState<
    "Infrastructure" | "Security" | "Update"
  >("Infrastructure");
  const [newSnippet, setNewSnippet] = useState("");
  const [newDate, setNewDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [isSubmittingNote, setIsSubmittingNote] = useState<boolean>(false);

  // Support Chats State
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
      text: "Acknowledged. Quotas and telemetry validated on host.",
      time: "10:18 AM",
    },
  ]);

  // Sovereign Integrations Marketplace State
  const [apps] = useState([
    {
      name: "Wazuh SIEM",
      category: "Security & Compliance",
      status: "Installed",
      desc: "Real-time host intrusion detection and PCI-DSS sovereign log compliance.",
    },
    {
      name: "OpenObserve",
      category: "Observability",
      status: "Active",
      desc: "Petabyte-scale cloud telemetry search and hypervisor node log ingestion.",
    },
    {
      name: "Vault Zero-Trust",
      category: "Key Management",
      status: "Active",
      desc: "Hardware-backed Shamir Secret Sharing cryptographic vault for tenant certificates.",
    },
  ]);

  /**
   * Authenticates against the backend to receive a cryptographically signed JWT.
   */
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

  /**
   * Validates active session on mount.
   */
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
        {
          headers: getAuthHeaders(),
        },
      );
      if (res.ok) {
        setResources(await res.json());
      } else {
        setResources([]);
      }
    } catch (err) {
      console.error("Failed to fetch cluster resources:", err);
    }
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
      if (res.ok) {
        setTelemetry(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch telemetry:", err);
    }
  };

  const fetchNotes = async () => {
    if (!authToken) return;
    setIsNotesLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/notes", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setNotes(await res.json());
      }
    } catch (err) {
      console.error("Failed to pull notes from Notion:", err);
    } finally {
      setIsNotesLoading(false);
    }
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !authToken) return;

    setIsSubmittingNote(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/notes", {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
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
      console.error("Failed to create note in Notion:", err);
    } finally {
      setIsSubmittingNote(false);
    }
  };

  useEffect(() => {
    if (authToken && currentUser) {
      fetchResources();
      fetchTelemetry();
      const interval = setInterval(() => {
        fetchResources();
        fetchTelemetry();
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [authToken, currentUser]);

  useEffect(() => {
    if (authToken && activeTab === "notes") {
      fetchNotes();
    }
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

  const crmMetrics = useMemo(() => {
    switch (timeFilter) {
      case "week":
        return {
          mrr: "$1,850",
          growth: "+14.2%",
          bandwidth: "840 GB",
          activeVmsDelta: "+2 deployed",
          taskCompletionPct: 80,
        };
      case "month":
        return {
          mrr: "$3,600",
          growth: "+22.5%",
          bandwidth: "4.2 TB",
          activeVmsDelta: "+6 deployed",
          taskCompletionPct: 65,
        };
      case "quarter":
        return {
          mrr: "$11,400",
          growth: "+38.9%",
          bandwidth: "18.6 TB",
          activeVmsDelta: "+14 deployed",
          taskCompletionPct: 54,
        };
    }
  }, [timeFilter]);

  const toggleTaskStatus = (id: number) => {
    setTaskList((prev) =>
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

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    setMessages([
      ...messages,
      {
        id: Date.now(),
        sender: "You",
        role: currentUser?.role || "User",
        text: chatMessage,
        time: "Just now",
      },
    ]);
    setChatMessage("");
  };

  const canControlPower =
    currentUser?.role === "SuperAdmin" || currentUser?.role === "TenantAdmin";
  const canAccessConsole =
    currentUser?.role === "SuperAdmin" || currentUser?.role === "TenantAdmin";
  const canViewHostTelemetry = currentUser?.role === "SuperAdmin";

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    ...(canViewHostTelemetry
      ? [{ id: "analytics", label: "Analytics", icon: BarChart3 }]
      : []),
    { id: "workspaces", label: "Workspaces", icon: Boxes },
    ...(currentUser?.role === "SuperAdmin"
      ? [{ id: "customers", label: "Customers", icon: Users }]
      : []),
    { id: "orders", label: "Orders & Billing", icon: ShoppingCart },
    { id: "tasks", label: "Tasks", icon: CheckSquare },
    { id: "calendar", label: "Calendar", icon: CalendarIcon },
    { id: "notes", label: "Notes", icon: StickyNote },
    { id: "chats", label: "Chats", icon: MessageSquare },
    { id: "apps", label: "Apps", icon: Grid },
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
                OmniCloud Authentication
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
                ? "Validating Token Claims..."
                : "Sign In & Issue JWT"}
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

  const filteredTasks = taskList.filter(
    (t) => t.horizon === timeFilter || timeFilter === "quarter",
  );
  const filteredEvents = calendarEvents.filter(
    (e) => e.horizon === timeFilter || timeFilter === "quarter",
  );
  const filteredNotes =
    selectedTag === "All" ? notes : notes.filter((n) => n.tag === selectedTag);

  return (
    <div className="flex h-screen bg-[#0d0d0f] text-zinc-100 font-sans antialiased overflow-hidden selection:bg-zinc-800">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#121214] border-r border-zinc-800/80 flex flex-col justify-between shrink-0">
        <div className="p-4 flex flex-col h-full">
          {/* Authenticated Persona Read-Only Display */}
          <div className="p-3 bg-[#18181b] border border-zinc-800 rounded-xl mb-6 shadow-sm">
            <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> Active
                Session
              </span>
              <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 text-[9px] font-mono rounded">
                JWT Valid
              </span>
            </div>

            {/* Read-only profile to enforce isolation */}
            <div className="w-full bg-zinc-900 border border-zinc-700 text-xs text-white font-medium rounded-lg p-2 truncate">
              {currentUser.name}
            </div>

            <div className="mt-2 text-[10px] font-mono text-zinc-400 flex flex-col gap-1">
              <div className="flex justify-between">
                <span>Role:</span>
                <strong className="text-emerald-400">{currentUser.role}</strong>
              </div>
              <div className="flex justify-between">
                <span>Tenant:</span>
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

      {/* Main Container */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header Bar */}
        <header className="h-16 border-b border-zinc-800/80 bg-[#121214]/60 backdrop-blur-md px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold text-white tracking-tight capitalize">
              {activeTab}
            </h1>

            <div className="bg-[#18181b] p-1 rounded-xl border border-zinc-800 flex items-center shadow-inner">
              {(["week", "month", "quarter"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setTimeFilter(filter)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                    timeFilter === filter
                      ? "bg-zinc-800 text-white shadow-sm border border-zinc-700/60"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  This {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="px-3 py-1.5 bg-zinc-800/80 border border-zinc-700/60 rounded-xl text-xs font-mono text-zinc-300">
              User:{" "}
              <span className="text-white font-bold">{currentUser.userId}</span>
            </div>
          </div>
        </header>

        {/* Dynamic Route Content */}
        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* ================= OVERVIEW VIEW ================= */}
          {activeTab === "overview" && (
            <>
              {/* Dynamic CRM Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-xs font-semibold">
                      Managed Instances
                    </span>
                    <Server className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-white tracking-tight">
                      {resources.length}
                    </span>
                    <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
                      <span className="text-emerald-400 font-medium">
                        {crmMetrics.activeVmsDelta}
                      </span>{" "}
                      this {timeFilter}
                    </p>
                  </div>
                </div>

                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-xs font-semibold">
                      CRM Run-Rate MRR
                    </span>
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-white tracking-tight">
                      {crmMetrics.mrr}
                    </span>
                    <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-0.5">
                      <ArrowUpRight className="w-3.5 h-3.5" />{" "}
                      {crmMetrics.growth} from previous {timeFilter}
                    </p>
                  </div>
                </div>

                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-xs font-semibold">Task Velocity</span>
                    <CheckCircle2 className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-white tracking-tight">
                      {crmMetrics.taskCompletionPct}%
                    </span>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Milestones cleared in window
                    </p>
                  </div>
                </div>

                <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-xs font-semibold">
                      Edge Ingress Bandwidth
                    </span>
                    <Activity className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-white tracking-tight">
                      {crmMetrics.bandwidth}
                    </span>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Sovereign overlay routing
                    </p>
                  </div>
                </div>
              </div>

              {/* Guest Compute Infrastructure Grid */}
              <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-400" />
                      Provisioned Virtual Machines
                    </h2>
                    <p className="text-[11px] text-zinc-400">
                      {currentUser.role === "SuperAdmin"
                        ? "Global Cluster View (All Tenants)"
                        : `Tenant Scoped View (${currentUser.tenantId})`}
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
                    {currentUser.role === "BillingManager"
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

          {/* ================= ANALYTICS VIEW ================= */}
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
                    Multi-tenant compute partitions and SDN boundaries
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
          {activeTab === "customers" && currentUser.role === "SuperAdmin" && (
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
                    Recurring compute charges for this {timeFilter}
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
                      desc: "Compute Expansion (32GB RAM)",
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

          {/* ================= TASKS VIEW ================= */}
          {activeTab === "tasks" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    DevOps & Infrastructure Milestones
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Operational tasks filtered for this {timeFilter} (Click
                    status to advance)
                  </p>
                </div>
                <div className="text-xs font-mono text-zinc-400 bg-[#18181b] px-3 py-1.5 rounded-xl border border-zinc-800">
                  Active in Horizon:{" "}
                  <strong className="text-white">{filteredTasks.length}</strong>
                </div>
              </div>

              <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#121214] text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="px-6 py-3">Task Description</th>
                      <th className="px-6 py-3">Horizon</th>
                      <th className="px-6 py-3">Priority</th>
                      <th className="px-6 py-3">Assignee</th>
                      <th className="px-6 py-3">Due Date</th>
                      <th className="px-6 py-3 text-right">Status Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredTasks.map((task) => (
                      <tr
                        key={task.id}
                        className="hover:bg-zinc-800/20 transition-colors"
                      >
                        <td className="px-6 py-4 font-medium text-white flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-zinc-500 shrink-0" />
                          {task.title}
                        </td>
                        <td className="px-6 py-4 capitalize font-mono text-zinc-400">
                          {task.horizon}
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
                        <td className="px-6 py-4 text-zinc-300">
                          {task.assignee}
                        </td>
                        <td className="px-6 py-4 font-mono text-zinc-400">
                          {task.dueDate}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => toggleTaskStatus(task.id)}
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
                    Target hypervisor maintenance and auditing windows for this{" "}
                    {timeFilter}
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
                    Sovereign Cloud Runbooks & Vault
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono rounded-full">
                      Notion 2-Way Sync
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Operational SOPs synchronized directly with your Notion
                    workspace
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
                    title="Pull latest notes from Notion"
                  >
                    <RotateCcw
                      className={`w-3.5 h-3.5 ${
                        isNotesLoading ? "animate-spin text-emerald-400" : ""
                      }`}
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

              {/* Create Note Modal Form */}
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
                        {isSubmittingNote
                          ? "Pushing to Notion..."
                          : "Create in Notion"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Notes Cards Grid */}
              {notes.length === 0 ? (
                <div className="p-12 text-center text-xs text-zinc-500 font-mono bg-[#151518] border border-zinc-800 rounded-2xl">
                  {isNotesLoading
                    ? "Pulling notes from Notion..."
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

          {/* ================= CHATS VIEW ================= */}
          {activeTab === "chats" && (
            <div className="bg-[#151518] border border-zinc-800/80 rounded-2xl h-[600px] flex overflow-hidden shadow-sm">
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
                          ? "bg-zinc-800 text-white font-semibold shadow-sm"
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

          {/* ================= APPS VIEW ================= */}
          {activeTab === "apps" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Sovereign Cloud Marketplace & Extensions
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Integrated security telemetry pipelines and cloud add-ons
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {apps.map((app, idx) => (
                  <div
                    key={idx}
                    className="bg-[#151518] border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase font-semibold">
                          {app.category}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            app.status === "Active"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
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
                      <button className="text-xs text-indigo-400 hover:underline flex items-center gap-1">
                        Manage Integration <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
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
