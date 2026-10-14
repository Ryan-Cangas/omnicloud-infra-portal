import { useState, useRef, useEffect } from "react";
import {
  Terminal,
  Play,
  CheckCircle2,
  ShieldAlert,
  Cpu,
  HardDrive,
  Server,
  Layers,
  Code2,
  RefreshCw,
  Sparkles,
} from "lucide-react";

interface ProvisioningStudioProps {
  authToken: string;
}

export function ProvisioningStudio({ authToken }: ProvisioningStudioProps) {
  const [vmType, setVmType] = useState<"lxc" | "qemu">("lxc");
  const [vmid, setVmid] = useState<number>(301);
  const [hostname, setHostname] = useState<string>("prod-k3s-worker-01");
  const [cores, setCores] = useState<number>(2);
  const [memory, setMemory] = useState<number>(2048);

  // Dynamic Playbooks State
  const [playbooks, setPlaybooks] = useState<string[]>([]);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>("");
  const [isLoadingPlaybooks, setIsLoadingPlaybooks] = useState<boolean>(true);

  const [logs, setLogs] = useState<{ type: string; data: string }[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("Idle - Ready for Execution");

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  // Fetch Playbooks Dynamically on Component Mount
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
    setLogs([]);
    setIsRunning(true);
    setStatus(`Executing Terraform ${action.toUpperCase()} via WebSocket...`);

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
        if (msg.type === "status") setStatus(msg.data);
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
      if (isRunning) setIsRunning(false);
    };
  };

  const runAnsible = () => {
    if (!selectedPlaybook) return;
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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Recruiter Technical Feature Banner */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-indigo-950/40 border border-emerald-500/20 rounded-xl p-5 shadow-lg">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-white tracking-wide">
                Automated Infrastructure & GitOps Engine
              </h2>
            </div>
            <p className="text-xs text-zinc-400 max-w-3xl">
              This interactive suite dynamically generates and applies Terraform
              HCL configurations and triggers Ansible post-provisioning
              playbooks on Proxmox VE. Real-time stdout/stderr streams are
              proxied asynchronously via WebSockets.
            </p>
          </div>
          <div className="hidden lg:flex gap-2">
            <span className="px-2.5 py-1 text-[10px] font-mono rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              FastAPI AsyncIO
            </span>
            <span className="px-2.5 py-1 text-[10px] font-mono rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
              Terraform HCL
            </span>
            <span className="px-2.5 py-1 text-[10px] font-mono rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
              Ansible Automation
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Control & Configuration Panel */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-zinc-200">
                Resource Configuration
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono text-zinc-400">
                  Environment Target
                </label>
                <select
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
                disabled={isLoadingPlaybooks || playbooks.length === 0}
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

            {/* Execution Controls */}
            <div className="pt-3 border-t border-zinc-800 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={isRunning}
                  onClick={() => runTerraform("plan")}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium rounded-lg text-zinc-200 transition-colors disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 text-sky-400" /> TF Plan
                </button>
                <button
                  disabled={isRunning}
                  onClick={() => runTerraform("apply")}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs font-medium rounded-lg text-white transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> TF Apply
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={isRunning || !selectedPlaybook}
                  onClick={runAnsible}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-xs font-medium rounded-lg text-purple-200 transition-colors disabled:opacity-50"
                >
                  <Code2 className="w-3.5 h-3.5 text-purple-400" /> Run Ansible
                </button>
                <button
                  disabled={isRunning}
                  onClick={() => runTerraform("destroy")}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-xs font-medium rounded-lg text-rose-300 transition-colors disabled:opacity-50"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Destroy
                </button>
              </div>
            </div>
          </div>

          {/* Visual Topology Card */}
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

            <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
              <span className="flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-zinc-500" /> {cores} Cores
              </span>
              <span className="flex items-center gap-1">
                <HardDrive className="w-3.5 h-3.5 text-zinc-500" /> {memory} MB
              </span>
            </div>
          </div>
        </div>

        {/* Right Terminal Console Output Window */}
        <div className="lg:col-span-7 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col h-[600px] overflow-hidden shadow-2xl">
          {/* Console Header */}
          <div className="bg-zinc-900 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-mono font-medium text-zinc-300">
                Live Execution Stream
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-zinc-400">
                {status}
              </span>
              {isRunning && (
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
              )}
            </div>
          </div>

          {/* Console Output Body */}
          <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1 bg-black/90">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-2">
                <Terminal className="w-8 h-8 text-zinc-700" />
                <p className="text-xs">
                  Select an execution plan to stream stdout/stderr logs.
                </p>
              </div>
            ) : (
              logs.map((log, index) => {
                const isError = log.type === "error";
                const isStatus = log.type === "status";
                return (
                  <div
                    key={index}
                    className={`whitespace-pre-wrap leading-relaxed ${
                      isError
                        ? "text-rose-400 font-semibold"
                        : isStatus
                          ? "text-amber-400 font-semibold"
                          : "text-zinc-300"
                    }`}
                  >
                    {log.data}
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
