import { LxcWorkload } from "../types/omnicloud";

export type MockShellResult =
  | { type: "clear" }
  | { type: "exit" }
  | { type: "output"; lines: string[] };

export function executeMockShellCommand(
  rawCommand: string,
  workload: LxcWorkload,
  onTogglePower: (vmid: number) => void,
): MockShellResult | null {
  const cmd = rawCommand.trim();
  if (!cmd) return null;

  if (cmd === "clear") return { type: "clear" };
  if (cmd === "exit") return { type: "exit" };

  let lines: string[] = [];

  switch (cmd) {
    case "help":
      lines = [
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
      lines =
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
      lines = [
        "               total        used        free      shared  buff/cache   available",
        `Mem:          ${totalMb}Mi       ${usedMb}Mi       ${totalMb - usedMb}Mi        12Mi        96Mi       ${totalMb - usedMb}Mi`,
        "Swap:          512Mi         0Mi       512Mi",
      ];
      break;
    }

    case "tailscale status":
      lines = [
        `100.117.21.82    pve-server           ryan@    linux   -`,
        `${workload.tailnetIp.padEnd(16)} ${workload.name.toLowerCase().padEnd(20)} ryan@    linux   ${workload.state === "running" ? `active; direct ${workload.lanIp}:41641, tx 1420 rx 4890` : "offline"}`,
      ];
      break;

    case "journalctl -n 5":
      lines = [
        `Nov 25 00:20:01 ${workload.name.toLowerCase()} systemd[1]: Reached target Multi-User System.`,
        `Nov 25 00:21:14 ${workload.name.toLowerCase()} kernel: cgroup: lxc.${workload.vmid} memory.high=${workload.ramPoolGb}G`,
        `Nov 25 00:22:30 ${workload.name.toLowerCase()} daemon[${1100 + workload.vmid}]: Listening on ${workload.lanIp}:${workload.port}`,
        `Nov 25 00:23:45 ${workload.name.toLowerCase()} tailscaled[412]: peer 100.117.21.82 RTT ${workload.rttMs || 1.1}ms`,
        `Nov 25 00:24:12 ${workload.name.toLowerCase()} audit[901]: JWT session heartbeat OK`,
      ];
      break;

    case "df -h":
      lines = [
        "Filesystem            Size  Used Avail Use% Mounted on",
        `/dev/pve/vm-${workload.vmid}-disk-0   16G  3.4G   12G  23% /`,
        "tmpfs                 512M   12M  500M   3% /run",
      ];
      break;

    case "uname -a":
      lines = [
        `Linux ${workload.name.toLowerCase()} 6.8.12-43-pve #1 SMP PREEMPT_DYNAMIC PMX 6.8.12-43 (2026-11-12) x86_64 GNU/Linux`,
      ];
      break;

    case "top":
    case "htop":
      lines = [
        `top - 00:25:00 up ${workload.uptime},  1 user,  load average: 0.34, 0.29, 0.25`,
        `Tasks:  14 total,   1 running,  13 sleeping,   0 stopped,   0 zombie`,
        `%Cpu(s):  ${workload.cpu.toFixed(2)} us,  0.12 sy,  0.00 ni, ${(99.88 - workload.cpu).toFixed(2)} id`,
        `MiB Mem : ${(workload.ramPoolGb * 1024).toFixed(0)} total, ${((workload.ramPoolGb * 1024 * workload.memPct) / 100).toFixed(0)} used`,
      ];
      break;

    case "start":
      if (workload.state === "stopped") {
        onTogglePower(workload.vmid);
        lines = [
          `[PVE-API] Starting LXC #${workload.vmid} (${workload.name})... OK`,
        ];
      } else {
        lines = [`Container #${workload.vmid} is already running.`];
      }
      break;

    default:
      lines = [
        `bash: ${cmd}: command executed (exit 0) — type 'help' for rack macros`,
      ];
  }

  return { type: "output", lines };
}
