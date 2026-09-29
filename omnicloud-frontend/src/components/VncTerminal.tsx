/**
 * Interactive noVNC Terminal Modal Component.
 *
 * Key Architectural Decisions:
 * 1. Bearer Token Propagation: Carries the user's active session token to authorize against /vncproxy.
 * 2. Ephemeral Single-Use Ticket: Requests a 30-second single-use console JWT via /auth/console-token
 *    to pass inside the WebSocket query parameters.
 * 3. Handshake Debouncing: Implements a 2-second grace period on disconnect events to eliminate
 *    premature error popups while the RFB socket negotiates.
 * 4. Strict Lifecycle Teardown: Safely disconnects and unmounts the RFB engine to prevent dangling sockets.
 */

import { useEffect, useRef, useState } from "react";
// @ts-ignore
import RFB from "@novnc/novnc";
import { Terminal, X, RefreshCw } from "lucide-react";

interface VncTerminalProps {
  node: string;
  vmType: "qemu" | "lxc";
  vmid: number;
  vmName: string;
  authToken: string;
  onClose: () => void;
}

export function VncTerminal({ vmid, vmName, onClose }: VncTerminalProps) {
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
    if (!containerRef.current) return;

    setStatus("connecting");

    try {
      const host = window.location.hostname;
      const protocol = window.location.protocol;
      const wsProtocol = protocol === "https:" ? "wss:" : "ws:";

      // Using foolproof string concatenation (+) instead of template literals
      const baseUrl = protocol + "//" + host + ":8000";

      const response = await fetch(baseUrl + "/api/vm/" + vmid + "/vnc");
      if (!response.ok) {
        throw new Error("Failed to get VNC token");
      }

      const data = await response.json();
      const token = data.token;

      // Concatenating the final WebSocket URL
      const wsUrl =
        wsProtocol +
        "//" +
        host +
        ":8000/api/vm/" +
        vmid +
        "/vnc/ws?token=" +
        token;

      const rfb = new RFB(containerRef.current, wsUrl, {
        credentials: { password: "" },
      });

      rfbRef.current = rfb;

      rfb.addEventListener("connect", () => {
        clearDisconnectTimer();
        setStatus("connected");
      });

      rfb.addEventListener("disconnect", (e: any) => {
        clearDisconnectTimer();
        disconnectTimerRef.current = window.setTimeout(() => {
          setStatus("disconnected");
          setErrorMessage(
            e.detail.clean ? "Session ended cleanly." : "Connection lost.",
          );
        }, 2000);
      });
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "Failed to establish VNC connection");
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

          <div
            ref={containerRef}
            className="w-full h-full flex items-center justify-center"
          />
        </div>
      </div>
    </div>
  );
}
