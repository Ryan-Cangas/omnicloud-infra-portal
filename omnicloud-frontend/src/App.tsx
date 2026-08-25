import { useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  Server,
  RotateCw,
  Play,
  Square,
  HardDrive,
  Cpu,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { VncTerminal } from "./components/VncTerminal";

const queryClient = new QueryClient();

interface ProxmoxResource {
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

const API_BASE = "http://localhost:8000/api/v1";

function Dashboard() {
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [activeTerminal, setActiveTerminal] = useState<ProxmoxResource | null>(
    null,
  );

  // Poll cluster metrics every 4 seconds
  const {
    data: resources,
    isLoading,
    error,
  } = useQuery<ProxmoxResource[]>({
    queryKey: ["cluster-resources"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/cluster/resources`);
      if (!res.ok) throw new Error("Failed to fetch cluster state");
      return res.json();
    },
    refetchInterval: 4000,
  });

  // Power action mutation
  const powerMutation = useMutation({
    mutationFn: async ({
      node,
      type,
      vmid,
      action,
    }: {
      node: string;
      type: string;
      vmid: number;
      action: string;
    }) => {
      setActionLoading(vmid);
      const res = await fetch(
        `${API_BASE}/nodes/${node}/${type}/${vmid}/power/${action}`,
        {
          method: "POST",
        },
      );
      if (!res.ok) throw new Error(`Power action failed`);
      return res.json();
    },
    onSettled: () => {
      setActionLoading(null);
      queryClient.invalidateQueries({ queryKey: ["cluster-resources"] });
    },
  });

  const runningCount =
    resources?.filter((r) => r.status === "running").length || 0;
  const totalCount = resources?.length || 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      {/* Top Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between pb-8 border-b border-zinc-800/80 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs uppercase tracking-widest text-emerald-400 font-mono">
              Sovereign DC: Business Bay
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
            OmniCloud Control Plane
          </h1>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-lg">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              Node: <strong className="text-zinc-200">pve-server</strong>
            </span>
          </div>
          <span className="text-zinc-700">|</span>
          <span>
            Compute:{" "}
            <strong className="text-emerald-400">{runningCount} Active</strong>{" "}
            / {totalCount} Total
          </span>
        </div>
      </div>

      {/* Grid Content */}
      <div className="max-w-7xl mx-auto mt-8">
        {isLoading && (
          <div className="flex items-center justify-center p-16 text-zinc-500 font-mono text-sm">
            <RotateCw className="w-5 h-5 animate-spin mr-2" /> Initializing
            Proxmox telemetry stream...
          </div>
        )}

        {error && (
          <div className="bg-red-950/40 border border-red-800/50 p-4 rounded-xl text-red-300 text-sm">
            Backend API unreachable. Ensure Uvicorn is active on port 8000.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resources?.map((res) => {
            const isBusy = actionLoading === res.vmid;
            const isRunning = res.status === "running";
            const displayMemPct = Math.min(100, Math.max(0, res.mem_usage_pct));

            return (
              <div
                key={res.vmid}
                className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between hover:border-zinc-700 transition-colors shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          isRunning
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        <Server className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-100">
                          {res.name}
                        </h3>
                        <div className="text-xs text-zinc-500 font-mono">
                          ID: {res.vmid} &bull;{" "}
                          <span className="uppercase">{res.type}</span>
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-xs font-mono rounded-full border ${
                        isRunning
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-zinc-800 text-zinc-500 border-zinc-700"
                      }`}
                    >
                      {res.status}
                    </span>
                  </div>

                  {/* Telemetry Stats */}
                  <div className="grid grid-cols-2 gap-3 my-4">
                    <div className="bg-zinc-950/60 border border-zinc-800/50 p-2.5 rounded-lg">
                      <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
                        <Cpu className="w-3.5 h-3.5" />
                        <span>vCPU Load</span>
                      </div>
                      <span className="text-sm font-mono font-medium text-zinc-200">
                        {isRunning ? `${res.cpu_usage_pct}%` : "—"}
                      </span>
                    </div>

                    <div className="bg-zinc-950/60 border border-zinc-800/50 p-2.5 rounded-lg">
                      <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
                        <HardDrive className="w-3.5 h-3.5" />
                        <span>Memory</span>
                      </div>
                      <span className="text-sm font-mono font-medium text-zinc-200">
                        {isRunning
                          ? `${displayMemPct}% of ${res.maxmem_gb}G`
                          : `${res.maxmem_gb} GB`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Power State Actions */}
                <div className="pt-3 border-t border-zinc-800/60 flex items-center justify-between gap-2">
                  {isRunning ? (
                    <>
                      <button
                        disabled={isBusy}
                        onClick={() =>
                          powerMutation.mutate({
                            node: res.node,
                            type: res.type,
                            vmid: res.vmid,
                            action: "reboot",
                          })
                        }
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                      >
                        <RotateCw className="w-3.5 h-3.5" /> Reboot
                      </button>
                      <button
                        onClick={() => setActiveTerminal(res)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-md transition-colors"
                      >
                        <Terminal className="w-3.5 h-3.5" /> Console
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() =>
                          powerMutation.mutate({
                            node: res.node,
                            type: res.type,
                            vmid: res.vmid,
                            action: "shutdown",
                          })
                        }
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-900/40 text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                      >
                        <Square className="w-3.5 h-3.5" /> Shutdown
                      </button>
                    </>
                  ) : (
                    <button
                      disabled={isBusy}
                      onClick={() =>
                        powerMutation.mutate({
                          node: res.node,
                          type: res.type,
                          vmid: res.vmid,
                          action: "start",
                        })
                      }
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50 shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> Start
                      Instance
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Terminal Modal */}
      {activeTerminal && (
        <VncTerminal
          node={activeTerminal.node}
          vmType={activeTerminal.type}
          vmid={activeTerminal.vmid}
          vmName={activeTerminal.name}
          onClose={() => setActiveTerminal(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}
