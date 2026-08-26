import { useEffect, useRef, useState } from "react";
// @ts-ignore
import RFB from "@novnc/novnc";
import { Terminal, X, RefreshCw } from "lucide-react";

interface VncTerminalProps {
  node: string;
  vmType: "qemu" | "lxc";
  vmid: number;
  vmName: string;
  userRole?: string;
  userId?: string;
  tenantId?: string;
  onClose: () => void;
}

export function VncTerminal({
  node,
  vmType,
  vmid,
  vmName,
  userRole = "SuperAdmin",
  userId = "admin-01",
  tenantId = "global",
  onClose,
}: VncTerminalProps) {
  // DOM element reference to attach the HTML5 canvas viewport[cite: 3]
  const containerRef = useRef<HTMLDivElement>(null);

  // Persistent reference to the active RFB instance[cite: 3]
  const rfbRef = useRef<any>(null);

  // Debounce timer ID used to suppress connection handshake drop alerts[cite: 3]
  const disconnectTimerRef = useRef<number | null>(null);

  // Component UI State[cite: 3]
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("connecting");
  const [errorMessage, setErrorMessage] = useState<string>("");

  /**
   * Clears any active debounce timer to prevent stale disconnect transitions.
   */
  const clearDisconnectTimer = () => {
    if (disconnectTimerRef.current !== null) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
  };

  /**
   * Acquires credentials from FastAPI and initializes the @novnc/novnc RFB engine.
   */
  const connectVnc = async () => {
    clearDisconnectTimer();

    // Teardown existing instance before reconnecting[cite: 3]
    if (rfbRef.current) {
      try {
        rfbRef.current.disconnect();
      } catch (e) {}
      rfbRef.current = null;
    }

    setStatus("connecting");
    setErrorMessage("");

    try {
      // Step 1: Request ephemeral ticket and session cookie with RBAC identity headers
      const res = await fetch(
        `http://localhost:8000/api/v1/nodes/${node}/${vmType}/${vmid}/vncproxy`,
        {
          method: "POST",
          headers: {
            "X-User-Id": userId,
            "X-User-Role": userRole,
            "X-Tenant-Id": tenantId,
          },
        },
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          errJson.detail || "Backend rejected VNC ticket generation request.",
        );
      }

      const data = await res.json();

      if (!containerRef.current) return;
      containerRef.current.innerHTML = "";

      // Step 2: Construct WebSocket reverse proxy URL[cite: 3]
      const wsUrl = `ws://localhost:8000/api/v1/ws/vnc/${node}/${vmType}/${vmid}?port=${data.port}&ticket=${encodeURIComponent(data.ticket)}&session_ticket=${encodeURIComponent(data.session_ticket)}`;

      // Step 3: Instantiate @novnc/novnc RFB client[cite: 3]
      const rfb = new RFB(containerRef.current, wsUrl, {
        wsProtocols: ["binary"],
        credentials: { password: data.ticket },
      });

      // Enable dynamic canvas scaling[cite: 3]
      rfb.scaleViewport = true;
      rfb.resizeSession = true;

      // Event: RFB Handshake Success[cite: 3]
      rfb.addEventListener("connect", () => {
        clearDisconnectTimer();
        setStatus("connected");
        setErrorMessage("");
      });

      // Event: Disconnection with 2-second grace period debounce[cite: 3]
      rfb.addEventListener("disconnect", (e: any) => {
        clearDisconnectTimer();
        disconnectTimerRef.current = window.setTimeout(() => {
          setStatus("disconnected");
          if (e.detail?.clean === false) {
            setErrorMessage(
              "WebSocket connection dropped or host is unreachable. Ensure the guest instance is running.",
            );
          }
        }, 2000);
      });

      rfbRef.current = rfb;
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "Unable to establish console session.");
    }
  };

  // Mount/Unmount Lifecycle: Connect on load, disconnect cleanly on exit[cite: 3]
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
        {/* Terminal Header Bar */}
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
              title="Reconnect Session"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
              title="Close Terminal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Terminal Canvas Body */}
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
              <button
                onClick={connectVnc}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs text-white rounded transition-colors"
              >
                Retry Connection
              </button>
            </div>
          )}

          {/* Mount point for the noVNC HTML5 canvas[cite: 3] */}
          <div
            ref={containerRef}
            className="w-full h-full flex items-center justify-center"
          />
        </div>
      </div>
    </div>
  );
}
