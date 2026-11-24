import React, { useEffect, useRef, useState } from "react";
import { LxcWorkload } from "../types/omnicloud";

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
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!workload) return;
    const banner = [
      `Connecting to pve-server (100.117.21.82) via JWT session [RYAN CANGAS · SUPERADMIN]...`,
      `Executing: pct enter ${workload.vmid}`,
      `------------------------------------------------------------------------`,
      `Linux ${workload.name.toLowerCase()} 6.8.12-43-pve #1 SMP PREEMPT_DYNAMIC x86_64`,
      `Workload: #${workload.vmid} (${workload.description}) · Pool: ${workload.ramPoolGb.toFixed(1)} GB`,
      workload.state === "running"
        ? `Status: ACTIVE · Tailnet ${workload.tailnetIp} · Port ${workload.port}`
        : `Warning: Container #${workload.vmid} is currently STOPPED. Type 'start' to boot.`,
      ``,
    ];
    setLines(banner);
  }, [workload]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && workload) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [workload, onClose]);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [lines]);

  if (!workload) return null;

  const hostPrompt = `root@${workload.name.toLowerCase()}:~#`;

  const runCommand = (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;

    if (cmd === "clear") {
      setLines([]);
      return;
    }
    if (cmd === "exit") {
      onClose();
      return;
    }

    let output: string[] = [];
    switch (cmd) {
      case "help":
        output = [
          "Available diagnostic commands:",
          "  systemctl status   Inspect primary service unit",
          "  free -h            Display LXC cgroup memory allocation",
          "  tailscale status   Verify WireGuard mesh peer routing",
          "  journalctl -n 5    Tail recent systemd unit events",
          "  df -h              Show mounted ZFS / LVM-Thin datasets",
          "  uname -a           Print host kernel signature",
          "  start              Power on container if stopped",
          "  clear / exit       Reset buffer or close TTY session",
        ];
        break;
      case "systemctl status":
        output =
          workload.state === "running"
            ? [
                `● ${workload.name.toLowerCase()}.service - ${workload.description}`,
                `     Loaded: loaded (/etc/systemd/system/${workload.name.toLowerCase()}.service; enabled)`,
                `     Active: active (running) since Boot (${workload.uptime} ago)`,
                `   Main PID: ${1100 + workload.vmid} (daemon)`,
                `      Tasks: 18 (limit: 4915)`,
                `     Memory: ${((workload.ramPoolGb * workload.memPct) / 100).toFixed(2)}G / ${workload.ramPoolGb.toFixed(1)}G`,
              ]
            : [
                `○ ${workload.name.toLowerCase()}.service - ${workload.description}`,
                `     Loaded: loaded (/etc/systemd/system/${workload.name.toLowerCase()}.service; enabled)`,
                `     Active: inactive (dead) — container halted`,
              ];
        break;
      case "free -h": {
        const usedMb = Math.round(
          workload.ramPoolGb * 1024 * (workload.memPct / 100),
        );
        const totalMb = Math.round(workload.ramPoolGb * 1024);
        output = [
          "               total        used        free      shared  buff/cache   available",
          `Mem:          ${totalMb}Mi       ${usedMb}Mi       ${totalMb - usedMb}Mi        12Mi        96Mi       ${totalMb - usedMb}Mi`,
          "Swap:          512Mi         0Mi       512Mi",
        ];
        break;
      }
      case "tailscale status":
        output = [
          `100.117.21.82    pve-server           ryan@    linux   -`,
          `${workload.tailnetIp.padEnd(16)} ${workload.name.toLowerCase().padEnd(20)} ryan@    linux   ${workload.state === "running" ? `active; direct ${workload.lanIp}:41641, tx 1420 rx 4890` : "offline"}`,
        ];
        break;
      case "journalctl -n 5":
        output = [
          `Nov 25 00:20:01 ${workload.name.toLowerCase()} systemd[1]: Reached target Multi-User System.`,
          `Nov 25 00:21:14 ${workload.name.toLowerCase()} kernel: cgroup: lxc.${workload.vmid} memory.high=${workload.ramPoolGb}G`,
          `Nov 25 00:22:30 ${workload.name.toLowerCase()} daemon[${1100 + workload.vmid}]: Listening on ${workload.lanIp}:${workload.port}`,
          `Nov 25 00:23:45 ${workload.name.toLowerCase()} tailscaled[412]: peer 100.117.21.82 RTT ${workload.rttMs || 1.1}ms`,
          `Nov 25 00:24:12 ${workload.name.toLowerCase()} audit[901]: JWT session heartbeat OK`,
        ];
        break;
      case "df -h":
        output = [
          "Filesystem            Size  Used Avail Use% Mounted on",
          `/dev/pve/vm-${workload.vmid}-disk-0   16G  3.4G   12G  23% /`,
          "tmpfs                 512M   12M  500M   3% /run",
        ];
        break;
      case "uname -a":
        output = [
          `Linux ${workload.name.toLowerCase()} 6.8.12-43-pve #1 SMP PREEMPT_DYNAMIC PMX 6.8.12-43 (2026-11-12) x86_64 GNU/Linux`,
        ];
        break;
      case "top":
      case "htop":
        output = [
          `top - 00:25:00 up ${workload.uptime},  1 user,  load average: 0.34, 0.29, 0.25`,
          `Tasks:  14 total,   1 running,  13 sleeping,   0 stopped,   0 zombie`,
          `%Cpu(s):  ${workload.cpu.toFixed(2)} us,  0.12 sy,  0.00 ni, ${(99.88 - workload.cpu).toFixed(2)} id`,
          `MiB Mem : ${(workload.ramPoolGb * 1024).toFixed(0)} total, ${((workload.ramPoolGb * 1024 * workload.memPct) / 100).toFixed(0)} used`,
        ];
        break;
      case "start":
        if (workload.state === "stopped") {
          onTogglePower(workload.vmid);
          output = [
            `[PVE-API] Starting LXC #${workload.vmid} (${workload.name})... OK`,
          ];
        } else {
          output = [`Container #${workload.vmid} is already running.`];
        }
        break;
      default:
        output = [
          `bash: ${cmd}: command executed (exit 0) — type 'help' for rack macros`,
        ];
    }

    setLines((prev) => [...prev, `${hostPrompt} ${cmd}`, ...output, ""]);
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
                TTY0 // #{workload.vmid} {workload.name}
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
            </div>
            <div
              style={{ fontSize: "11px", color: "#94A3B8", marginTop: "4px" }}
            >
              pct enter {workload.vmid} · {workload.node} ·{" "}
              {workload.description}
            </div>
          </div>

          <div style={{ display: "flex", gap: "6px" }}>
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
            <button type="button" className="console-keycap" onClick={onClose}>
              ESC ✕
            </button>
          </div>
        </div>

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
      </div>
    </div>
  );
};
