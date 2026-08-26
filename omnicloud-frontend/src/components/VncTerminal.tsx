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
  const disconnectTimerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("connecting");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const clearDisconnectTimer = () => {
    if (disconnectTimerRef.current !== null) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
  };

  const connectVnc = async () => {
    clearDisconnectTimer();

    // Clean up existing instance before reconnecting
    if (rfbRef.current) {
      try {
        rfbRef.current.disconnect();
      } catch (e) {}
      rfbRef.current = null;
    }

    setStatus("connecting");
    setErrorMessage("");

    try {
      // 1. Fetch ticket, port, and session from FastAPI backend
      const res = await fetch(
        `http://localhost:8000/api/v1/nodes/${node}/${vmType}/${vmid}/vncproxy`,
        {
          method: "POST",
        },
      );
      if (!res.ok) throw new Error("Failed to obtain VNC ticket");
      const data = await res.json();

      if (!containerRef.current) return;
      containerRef.current.innerHTML = "";

      // 2. Connect directly to FastAPI proxy (bypasses browser self-signed SSL blocks entirely)
      const encodedTicket = encodeURIComponent(data.ticket);
      const encodedSession = encodeURIComponent(data.session_ticket);
      const wsUrl = `ws://localhost:8000/api/v1/ws/vnc/${node}/${vmType}/${vmid}?port=${data.port}&ticket=${encodedTicket}&session_ticket=${encodedSession}`;

      // 3. Initialize RFB client with credentials
      const rfb = new RFB(containerRef.current, wsUrl, {
        wsProtocols: ["binary"],
        credentials: { password: data.ticket },
      });

      rfb.scaleViewport = true;
      rfb.resizeSession = true;

      rfb.addEventListener("connect", () => {
        clearDisconnectTimer();
        setStatus("connected");
        setErrorMessage("");
      });

      rfb.addEventListener("disconnect", (e: any) => {
        // Debounce disconnect event to ignore initial handshake phase drops
        clearDisconnectTimer();
        disconnectTimerRef.current = window.setTimeout(() => {
          setStatus("disconnected");
          if (e.detail?.clean === false) {
            setErrorMessage(
              "WebSocket handshake failed or connection lost. Ensure target host is active.",
            );
          }
        }, 1500); // 1.5s grace period for handshake completion
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
      clearDisconnectTimer();
      if (rfbRef.current) {
        try {
          rfbRef.current.disconnect();
        } catch (e) {}
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

        {/* Terminal Screen Canvas */}
        <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
          {status === "connecting" && (
            <div className="absolute z-10 text-zinc-400 text-xs font-mono flex items-center gap-2 bg-zinc-900/80 px-4 py-2 rounded-lg border border-zinc-800">
              <RefreshCw className="w-4 h-4 animate-spin" /> Negotiating noVNC
              WebSocket handshake...
            </div>
          )}

          {status === "disconnected" && errorMessage && (
            <div className="absolute z-10 text-center max-w-md p-6 bg-zinc-900/90 border border-rose-900/40 rounded-xl">
              <p className="text-rose-400 text-sm font-medium mb-2">
                Connection Interrupted
              </p>
              <p className="text-zinc-400 text-xs font-mono mb-4">
                {errorMessage}
              </p>
              <div className="flex justify-center gap-2">
                <a
                  href={`https://${node === "pve-server" ? "192.168.1.200" : "192.168.1.200"}:8006`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs text-emerald-400 rounded transition-colors"
                >
                  Accept Proxmox SSL
                </a>
                <button
                  onClick={connectVnc}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs text-white rounded transition-colors"
                >
                  Retry
                </button>
              </div>
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
