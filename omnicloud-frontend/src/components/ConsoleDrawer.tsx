import React, { useEffect, useRef, useState } from "react";
import RFB from "@novnc/novnc";
import { LxcWorkload } from "../types/omnicloud";
import {
  getStoredToken,
  requestConsoleSession,
} from "../services/OmnicloudApi";
import { executeMockShellCommand } from "../data/mockShell";

interface ConsoleDrawerProps {
  workload: LxcWorkload | null;
  onClose: () => void;
  onTogglePower: (vmid: number) => void;
}

export const ConsoleDrawer: React.FC<ConsoleDrawerProps> = ({
  workload,
  onClose,
  onTogglePower,
}) => {
  const [lines, setLines] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [vncFallbackActive, setVncFallbackActive] = useState(false);
  const [statusNote, setStatusNote] = useState<string>("");

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const vncScreenRef = useRef<HTMLDivElement | null>(null);
  const rfbRef = useRef<RFB | null>(null);

  const targetVmid = workload?.vmid ?? null;
  const targetNode = workload?.node ?? "";
  const targetType = workload?.type ?? "LXC";
  const targetState = workload?.state ?? "stopped";
  const targetName = workload?.name ?? "";
  const targetDesc = workload?.description ?? "";
  const targetRamGb = workload?.ramPoolGb ?? 1.0;
  const targetTailnetIp = workload?.tailnetIp ?? "";
  const targetPort = workload?.port ?? "";

  useEffect(() => {
    if (targetVmid === null) return;

    setWsConnected(false);
    setVncFallbackActive(false);

    const hasToken = Boolean(getStoredToken());
    const banner = [
      `Connecting to ${targetNode} (100.117.21.82) via JWT session [SUPERADMIN]...`,
      `Executing: pct enter ${targetVmid}`,
      `------------------------------------------------------------------------`,
      `Linux ${targetName.toLowerCase()} 6.8.12-43-pve #1 SMP PREEMPT_DYNAMIC x86_64`,
      `Workload: #${targetVmid} (${targetDesc}) · Pool: ${targetRamGb.toFixed(1)} GB`,
      targetState === "running"
        ? `Status: ACTIVE · Tailnet ${targetTailnetIp} · Port ${targetPort}`
        : `Warning: Container #${targetVmid} is currently STOPPED. Type 'start' to boot.`,
      ``,
    ];
    setLines(banner);

    if (!hasToken || targetState !== "running") {
      setVncFallbackActive(true);
      setStatusNote(
        targetState !== "running"
          ? `Guest #${targetVmid} is stopped — local diagnostic shell active.`
          : "Offline preview mode — authenticate to attach live noVNC.",
      );
      return;
    }

    setStatusNote("Minting ephemeral Proxmox VNC ticket...");
    let cancelled = false;

    requestConsoleSession(targetNode, targetType, targetVmid)
      .then((session) => {
        if (cancelled || !vncScreenRef.current) return;

        vncScreenRef.current.innerHTML = "";
        setStatusNote(
          `Authenticating RFB stream (port ${session.port}, ${session.user})...`,
        );

        const rfb = new RFB(vncScreenRef.current, session.wsUrl, {
          wsProtocols: ["binary"],
          credentials: {
            password: session.ticket,
          },
        });
        rfb.scaleViewport = true;
        rfb.resizeSession = targetType === "KVM";
        rfb.focusOnClick = true;

        rfb.addEventListener("credentialsrequired", () => {
          if (!cancelled) {
            rfb.sendCredentials({ password: session.ticket });
          }
        });

        rfb.addEventListener("connect", () => {
          if (!cancelled) {
            setWsConnected(true);
            setVncFallbackActive(false);
            setStatusNote(
              `noVNC RFB active · /api/v1/ws/vnc/${targetNode}/${targetType.toLowerCase()}/${targetVmid}`,
            );
          }
        });

        rfb.addEventListener("securityfailure", (e: CustomEvent) => {
          if (!cancelled) {
            const detail = e.detail as { status?: number; reason?: string };
            setStatusNote(
              `RFB auth failed (${detail?.reason || detail?.status || "rejected"})`,
            );
          }
        });

        rfb.addEventListener("disconnect", (e: CustomEvent) => {
          if (!cancelled) {
            setWsConnected(false);
            const clean = Boolean((e.detail as { clean?: boolean })?.clean);
            setStatusNote(
              clean
                ? "noVNC session closed."
                : "noVNC relay disconnected — switched to local diagnostic shell.",
            );
            setVncFallbackActive(true);
            setLines((prev) => [
              ...prev,
              `[WS-BRIDGE] noVNC RFB stream closed — local diagnostic shell active.`,
              ``,
            ]);
          }
        });

        rfbRef.current = rfb;
      })
      .catch((err) => {
        if (!cancelled) {
          const reason = err instanceof Error ? err.message : "offline";
          setWsConnected(false);
          setVncFallbackActive(true);
          setStatusNote(
            `VNC handshake failed (${reason}) — local shell active.`,
          );
          setLines((prev) => [
            ...prev,
            `[PVE-API] Console handshake skipped (${reason}) — local macro shell active.`,
            ``,
          ]);
        }
      });

    return () => {
      cancelled = true;
      if (rfbRef.current) {
        rfbRef.current.disconnect();
        rfbRef.current = null;
      }
    };
  }, [
    targetVmid,
    targetNode,
    targetType,
    targetState,
    targetName,
    targetDesc,
    targetRamGb,
    targetTailnetIp,
    targetPort,
  ]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && targetVmid !== null) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [targetVmid, onClose]);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [lines]);

  if (!workload) return null;

  const hostPrompt = `root@${workload.name.toLowerCase()}:~#`;

  const runCommand = (raw: string) => {
    const result = executeMockShellCommand(raw, workload, onTogglePower);
    if (!result) return;
    if (result.type === "clear") {
      setLines([]);
      return;
    }
    if (result.type === "exit") {
      onClose();
      return;
    }
    setLines((prev) => [
      ...prev,
      `${hostPrompt} ${raw.trim()}`,
      ...result.lines,
      "",
    ]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runCommand(command);
    setCommand("");
  };

  return (
    <div
      className="tty-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Console TTY for ${workload.name}`}
    >
      <div className="tty-drawer">
        <div className="tty-header">
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <span
                className={`led-dot ${
                  workload.state === "running" ? "led-online" : "led-vermilion"
                }`}
              />
              <strong style={{ fontSize: "13px", letterSpacing: "0.04em" }}>
                {wsConnected ? "noVNC" : "TTY0"} // #{workload.vmid}{" "}
                {workload.name}
              </strong>
              <span
                style={{
                  background: "rgba(217, 119, 6, 0.18)",
                  border: "1px solid rgba(217, 119, 6, 0.45)",
                  color: "#FBBF24",
                  fontSize: "11px",
                  padding: "1px 7px",
                  borderRadius: "2px",
                }}
              >
                {workload.tailnetIp}
              </span>
              {wsConnected && (
                <span
                  style={{
                    background: "rgba(34, 197, 94, 0.16)",
                    border: "1px solid rgba(34, 197, 94, 0.45)",
                    color: "#22C55E",
                    fontSize: "10px",
                    padding: "1px 6px",
                    borderRadius: "2px",
                  }}
                >
                  RFB LIVE
                </span>
              )}
            </div>
            <div
              style={{ fontSize: "11px", color: "#94A3B8", marginTop: "4px" }}
            >
              {statusNote ||
                `pct enter ${workload.vmid} · ${workload.node} · ${workload.description}`}
            </div>
          </div>

          <div style={{ display: "flex", gap: "6px" }}>
            {wsConnected ? (
              <button
                type="button"
                className="tty-macro-btn"
                onClick={() => rfbRef.current?.sendCtrlAltDel()}
              >
                CTRL+ALT+DEL
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="tty-macro-btn"
                  onClick={() => runCommand("top")}
                >
                  htop / top
                </button>
                <button
                  type="button"
                  className="tty-macro-btn"
                  onClick={() => setLines([])}
                >
                  CLEAR
                </button>
              </>
            )}
            <button type="button" className="console-keycap" onClick={onClose}>
              ESC ✕
            </button>
          </div>
        </div>

        <div
          ref={vncScreenRef}
          style={{
            display: vncFallbackActive ? "none" : "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: "440px",
            background: "#090D16",
            overflow: "hidden",
          }}
        />

        {vncFallbackActive && (
          <>
            <div className="tty-macro-bar">
              {[
                "systemctl status",
                "free -h",
                "tailscale status",
                "journalctl -n 5",
              ].map((macro) => (
                <button
                  key={macro}
                  type="button"
                  className="tty-macro-btn"
                  onClick={() => runCommand(macro)}
                >
                  $ {macro}
                </button>
              ))}
            </div>

            <div className="tty-viewport" ref={viewportRef}>
              {lines.map((line, idx) => (
                <div key={idx}>{line || "\u00A0"}</div>
              ))}
              <div>
                <span style={{ color: "#22C55E" }}>{hostPrompt}</span>{" "}
                <span className="cursor-blink" />
              </div>
            </div>

            <form className="tty-footer" onSubmit={handleSubmit}>
              <span style={{ color: "#22C55E", fontSize: "12px" }}>#</span>
              <input
                type="text"
                className="tty-input"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Enter shell command (e.g. help, systemctl status, free -h)..."
                autoFocus
              />
              <button type="submit" className="console-keycap">
                SEND ↵
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
