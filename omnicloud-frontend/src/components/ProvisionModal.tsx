import { useState, useRef } from "react";
import { Terminal, Play, ShieldAlert, CheckCircle2, X } from "lucide-react";

interface ProvisionModalProps {
  onClose: () => void;
}

export function ProvisionModal({ onClose }: ProvisionModalProps) {
  const [vmid, setVmid] = useState<number>(300);
  const [hostname, setHostname] = useState<string>("app-node-01");
  const [vmType, setVmType] = useState<"lxc" | "qemu">("lxc");
  const [cores, setCores] = useState<number>(2);
  const [memory, setMemory] = useState<number>(2048);

  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("Idle");

  const terminalRef = useRef<HTMLDivElement | null>(null);

  const triggerExecution = (action: "plan" | "apply" | "destroy") => {
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
        }),
      );
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "log") {
        setLogs((prev) => [...prev, msg.data]);
        if (terminalRef.current) {
          terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
      } else if (msg.type === "status") {
        setStatus(msg.data);
      } else if (msg.type === "complete") {
        setStatus("Completed Successfully");
        setIsRunning(false);
      } else if (msg.type === "error") {
        setStatus(`Error: ${msg.data}`);
        setIsRunning(false);
      }
    };

    ws.onerror = () => {
      setStatus("WebSocket Connection Failed");
      setIsRunning(false);
    };
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col h-[700px]">
        {/* Header */}
        <div className="bg-zinc-950 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-100">
              OmniCloud Infrastructure Provisioner
            </h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Controls Sidebar */}
          <div className="w-80 border-r border-zinc-800 p-4 space-y-4 bg-zinc-900/50">
            <div>
              <label className="text-xs font-mono text-zinc-400">
                Resource Type
              </label>
              <select
                value={vmType}
                onChange={(e) => setVmType(e.target.value as "lxc" | "qemu")}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200"
              >
                <option value="lxc">LXC Container</option>
                <option value="qemu">QEMU Virtual Machine</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400">VMID</label>
              <input
                type="number"
                value={vmid}
                onChange={(e) => setVmid(Number(e.target.value))}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400">
                Hostname
              </label>
              <input
                type="text"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-mono text-zinc-400">
                  CPU Cores
                </label>
                <input
                  type="number"
                  value={cores}
                  onChange={(e) => setCores(Number(e.target.value))}
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200"
                />
              </div>
              <div>
                <label className="text-xs font-mono text-zinc-400">
                  RAM (MB)
                </label>
                <input
                  type="number"
                  value={memory}
                  onChange={(e) => setMemory(Number(e.target.value))}
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800 space-y-2">
              <button
                disabled={isRunning}
                onClick={() => triggerExecution("plan")}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium rounded text-zinc-200 transition-colors"
              >
                <Play className="w-3.5 h-3.5 text-blue-400" /> Terraform Plan
              </button>
              <button
                disabled={isRunning}
                onClick={() => triggerExecution("apply")}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs font-medium rounded text-white transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Terraform Apply
              </button>
              <button
                disabled={isRunning}
                onClick={() => triggerExecution("destroy")}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-rose-900/40 hover:bg-rose-900/60 border border-rose-800 text-xs font-medium rounded text-rose-300 transition-colors"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Terraform
                Destroy
              </button>
            </div>
          </div>

          {/* Terminal Console Stream */}
          <div
            className="flex-1 bg-black p-4 font-mono text-xs text-zinc-300 overflow-y-auto flex flex-col"
            ref={terminalRef}
          >
            <div className="text-zinc-500 pb-2 border-b border-zinc-900">
              [Status: {status}]
            </div>
            <div className="mt-2 space-y-1">
              {logs.map((line, idx) => (
                <div key={idx} className="whitespace-pre-wrap">
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
