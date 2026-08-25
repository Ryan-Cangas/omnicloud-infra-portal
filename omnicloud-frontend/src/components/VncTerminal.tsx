import { useEffect, useRef, useState } from "react";
// @ts-ignore
import RFB from "@novnc/novnc";
import { Terminal, X, RefreshCw } from "lucide-react";

interface VncTerminalProps {
  node: string;
  vmType: "qemu" | "lxc";
  vmid: number;
  vmName: string;
  onClose: () => void;
}

export function VncTerminal({
  node,
  vmType,
  vmid,
  vmName,
  onClose,
}: VncTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("connecting");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const connectVnc = async () => {
    setStatus("connecting");
    setErrorMessage("");

    try {
      // 1. Request ticket from FastAPI backend
      const res = await fetch(
        `http://localhost:8000/api/v1/nodes/${node}/${vmType}/${vmid}/vncproxy`,
        {
          method: "POST",
        },
      );
      if (!res.ok) throw new Error("Failed to obtain VNC ticket from backend");
      const data = await res.json();

      if (!containerRef.current) return;
      containerRef.current.innerHTML = "";

      // 2. Build Proxmox WebSocket URL
      const encodedTicket = encodeURIComponent(data.ticket);
      const wsUrl = `wss://${data.pve_host}:8006/api2/json/nodes/${node}/${vmType}/${vmid}/vncwebsocket?port=${data.port}&vncticket=${encodedTicket}`;

      // 3. Initialize RFB client
      const rfb = new RFB(containerRef.current, wsUrl, {
        credentials: { password: data.ticket },
      });

      rfb.scaleViewport = true;
      rfb.resizeSession = false;

      rfb.addEventListener("connect", () => {
        setStatus("connected");
      });

      rfb.addEventListener("disconnect", (e: any) => {
        setStatus("disconnected");
        if (e.detail?.clean === false) {
          setErrorMessage(
            "Disconnected unexpectedly. (Self-signed certificate on port 8006 may need browser approval).",
          );
        }
      });

      rfbRef.current = rfb;
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "Error connecting to console");
    }
  };

  useEffect(() => {
    connectVnc();
    return () => {
      if (rfbRef.current) {
        rfbRef.current.disconnect();
      }
    };
  }, [vmid]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-5xl rounded-xl shadow-2xl overflow-hidden flex flex-col h-[750px]">
        {/* Terminal Header */}
        <div className="bg-zinc-950 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-zinc-200">
              Console: <strong className="text-white">{vmName}</strong> ({vmid})
            </span>
            <span
              className={`px-2 py-0.5 text-xs font-mono rounded-full ${
                status === "connected"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : status === "connecting"
                    ? "bg-yellow-500/10 text-yellow-400 animate-pulse"
                    : "bg-rose-500/10 text-rose-400"
              }`}
            >
              {status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={connectVnc}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
              title="Reconnect"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Terminal Screen Area */}
        <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
          {status === "connecting" && (
            <div className="absolute z-10 text-zinc-400 text-xs font-mono flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Negotiating noVNC
              WebSocket handshake...
            </div>
          )}

          {status === "error" && (
            <div className="absolute z-10 text-center max-w-md p-4">
              <p className="text-rose-400 text-sm font-medium mb-2">
                Connection Failed
              </p>
              <p className="text-zinc-400 text-xs font-mono mb-4">
                {errorMessage}
              </p>
              <button
                onClick={connectVnc}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 rounded"
              >
                Retry Connection
              </button>
            </div>
          )}

          <div
            ref={containerRef}
            className="w-full h-full flex items-center justify-center"
          />
        </div>
      </div>
    </div>
  );
}
