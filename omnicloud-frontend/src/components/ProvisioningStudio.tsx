import { useState, useRef, useEffect } from "react";
import {
  Terminal,
  Play,
  CheckCircle2,
  ShieldAlert,
  Server,
  Layers,
  Code2,
  Sparkles,
  Lock,
} from "lucide-react";

interface ProvisioningStudioProps {
  authToken: string;
  userRole?: "SuperAdmin" | "Guest";
}

export function ProvisioningStudio({
  authToken,
  userRole = "Guest",
}: ProvisioningStudioProps) {
  const isGuest = userRole === "Guest";
  const [vmType, setVmType] = useState<"lxc" | "qemu">("lxc");
  const [vmid, setVmid] = useState<number>(301);
  const [hostname, setHostname] = useState<string>("prod-k3s-worker-01");
  const [cores, setCores] = useState<number>(2);
  const [memory, setMemory] = useState<number>(2048);
  const [playbooks, setPlaybooks] = useState<string[]>([]);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>("");
  const [isLoadingPlaybooks, setIsLoadingPlaybooks] = useState<boolean>(true);
  const [logs, setLogs] = useState<{ type: string; data: string }[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [, setStatus] = useState<string>(
    isGuest
      ? "Read-Only Mode - Execution Restricted"
      : "Idle - Ready for Execution",
  );

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  useEffect(() => {
    const fetchPlaybooks = async () => {
      try {
        setIsLoadingPlaybooks(true);
        const res = await fetch("/api/v1/provision/playbooks", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (res.ok) {
          const files: string[] = await res.json();
          setPlaybooks(files);
          if (files.length > 0) {
            setSelectedPlaybook(files[0]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch playbooks:", err);
      } finally {
        setIsLoadingPlaybooks(false);
      }
    };

    if (authToken) {
      fetchPlaybooks();
    }
  }, [authToken]);

  const runTerraform = (action: "plan" | "apply" | "destroy") => {
    if (isGuest) return;
    setLogs([]);
    setIsRunning(true);
    setStatus(`Executing Terraform ${action.toUpperCase()}...`);
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/api/v1/ws/provision/terraform`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          action,
          vmid,
          hostname,
          vm_type: vmType,
          cores,
          memory,
          token: authToken,
        }),
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        setLogs((prev) => [...prev, msg]);
        if (msg.type === "status") {
          setStatus(msg.data);
          if (msg.data.includes("completed successfully")) {
            setIsRunning(false);
          }
        }
        if (msg.type === "complete") {
          setStatus(`Terraform ${action.toUpperCase()} Succeeded`);
          setIsRunning(false);
        }
        if (msg.type === "error") {
          setStatus(`Failed: ${msg.data}`);
          setIsRunning(false);
        }
      } catch {
        setLogs((prev) => [...prev, { type: "log", data: event.data }]);
      }
    };

    ws.onerror = () => {
      setStatus("WebSocket Connection Error");
      setIsRunning(false);
    };

    ws.onclose = () => {
      setIsRunning(false);
    };
  };

  const runAnsible = () => {
    if (isGuest || !selectedPlaybook) return;
    setLogs([]);
    setIsRunning(true);
    setStatus(`Running ${selectedPlaybook}...`);
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/api/v1/ws/provision/ansible`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          playbook: selectedPlaybook,
          target_ip: "192.168.1.150",
          token: authToken,
        }),
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        setLogs((prev) => [...prev, msg]);
        if (msg.type === "complete") {
          setStatus("Ansible Playbook Succeeded");
          setIsRunning(false);
        }
        if (msg.type === "error") {
          setStatus(`Ansible Failed: ${msg.data}`);
          setIsRunning(false);
        }
      } catch {
        setLogs((prev) => [...prev, { type: "log", data: event.data }]);
      }
    };

    ws.onerror = () => {
      setStatus("Ansible WebSocket Error");
      setIsRunning(false);
    };
  };

  return (
    <div className="p-2 sm:p-6 max-w-7xl mx-auto space-y-6 font-sans">
      <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-indigo-950/40 border border-emerald-500/20 rounded-xl p-4 sm:p-5 shadow-lg">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                Automated Infrastructure & GitOps Engine
              </h2>
            </div>
            <p className="text-xs text-zinc-400 max-w-3xl">
              Generates and applies Terraform HCL configurations and triggers
              Ansible post-provisioning playbooks on Proxmox VE.
            </p>
          </div>
        </div>
      </div>

      {isGuest && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-amber-200 text-xs">
          <div className="flex items-center gap-3">
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <strong className="font-bold text-amber-300">
                Read-Only Guest Mode Active:
              </strong>{" "}
              Execution controls are disabled for guest users.
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-zinc-200">
                Resource Configuration
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono text-zinc-400">
                  Environment Target
                </label>
                <select
                  disabled={isGuest}
                  value={vmType}
                  onChange={(e) => setVmType(e.target.value as "lxc" | "qemu")}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="lxc">LXC Container (Lightweight)</option>
                  <option value="qemu">QEMU Virtual Machine</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-mono text-zinc-400">
                  VMID Target
                </label>
                <input
                  disabled={isGuest}
                  type="number"
                  value={vmid}
                  onChange={(e) => setVmid(Number(e.target.value))}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-mono text-zinc-400">
                Hostname / Instance Label
              </label>
              <input
                disabled={isGuest}
                type="text"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono text-zinc-400">
                  vCPU Cores
                </label>
                <input
                  disabled={isGuest}
                  type="number"
                  value={cores}
                  onChange={(e) => setCores(Number(e.target.value))}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-mono text-zinc-400">
                  RAM Allocation (MB)
                </label>
                <input
                  disabled={isGuest}
                  type="number"
                  value={memory}
                  onChange={(e) => setMemory(Number(e.target.value))}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-mono text-zinc-400">
                Ansible Playbook Script
              </label>
              <select
                value={selectedPlaybook}
                onChange={(e) => setSelectedPlaybook(e.target.value)}
                disabled={
                  isGuest || isLoadingPlaybooks || playbooks.length === 0
                }
                className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 font-mono"
              >
                {isLoadingPlaybooks ? (
                  <option value="">Scanning /opt/omnicloud/infra...</option>
                ) : playbooks.length === 0 ? (
                  <option value="">No .yml playbooks found in directory</option>
                ) : (
                  playbooks.map((pb) => (
                    <option key={pb} value={pb}>
                      {pb}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="pt-3 border-t border-zinc-800 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={isGuest || isRunning}
                  onClick={() => runTerraform("plan")}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium rounded-lg text-zinc-200 transition-colors disabled:opacity-40"
                >
                  <Play className="w-3.5 h-3.5 text-sky-400" /> TF Plan
                </button>
                <button
                  disabled={isGuest || isRunning}
                  onClick={() => runTerraform("apply")}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs font-medium rounded-lg text-white transition-colors disabled:opacity-40"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> TF Apply
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={isGuest || isRunning || !selectedPlaybook}
                  onClick={runAnsible}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-xs font-medium rounded-lg text-purple-200 transition-colors disabled:opacity-40"
                >
                  <Code2 className="w-3.5 h-3.5 text-purple-400" /> Run Ansible
                </button>
                <button
                  disabled={isGuest || isRunning}
                  onClick={() => runTerraform("destroy")}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-xs font-medium rounded-lg text-rose-300 transition-colors disabled:opacity-40"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Destroy
                </button>
              </div>
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <Server className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">{hostname}</p>
                <p className="text-[11px] font-mono text-zinc-400">
                  Target: Proxmox Node 01 | ID: {vmid}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="lg:col-span-7 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col h-[400px] sm:h-[600px] overflow-hidden shadow-2xl">
          <div className="bg-zinc-900 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-mono font-medium text-zinc-300">
                Live Execution Stream
              </span>
            </div>
          </div>
          <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1 bg-black/90">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-2">
                <Terminal className="w-8 h-8 text-zinc-700" />
                <p className="text-xs">
                  Select an execution plan to stream stdout/stderr logs.
                </p>
              </div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className="whitespace-pre-wrap leading-relaxed text-zinc-300"
                >
                  {log.data}
                </div>
              ))
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
