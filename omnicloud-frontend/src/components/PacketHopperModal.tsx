/**
 * Packet Hopper: Interactive SDN Route Assembler & Circuit Lab
 *
 * Dev Notes:
 * - Includes a Pre-Flight Mission Briefing before starting.
 * - Displays a simulated "NAT Dead-Timer Tripped" failure modal upon timeout.
 * - Displays a dynamic Educational Debriefing on victory (Direct UDP vs DERP Relay).
 * - Dual Solvable Architecture:
 *   1) Direct UDP Path (~1.8 ms): Line-rate STUN hole-punching via Row 3 snake.
 *   2) DERP Fallback (~54.2 ms): HTTPS/WebSocket relay via Dubai (dxb) Region 24.
 * - Styled for OmniCloud dark-mode theme with Lucide React icons.
 */

import { useState, useEffect } from "react";
import {
  Network,
  ShieldCheck,
  RotateCcw,
  X,
  CheckCircle2,
  AlertTriangle,
  Info,
  Sparkles,
  HelpCircle,
  Play,
  ShieldAlert,
  Radio,
  Eye,
  Layers,
} from "lucide-react";

type Direction = "N" | "E" | "S" | "W";

interface Tile {
  id: string;
  r: number;
  c: number;
  type: "start" | "end" | "pipe-straight" | "pipe-corner" | "derp" | "firewall";
  connections: Direction[];
  rotation: number;
  label?: string;
  eduTitle: string;
  eduDesc: string;
  protocolBadge: string;
}

const ROTATION_DELTAS: Record<
  Direction,
  { r: number; c: number; opposite: Direction }
> = {
  N: { r: -1, c: 0, opposite: "S" },
  E: { r: 0, c: 1, opposite: "W" },
  S: { r: 1, c: 0, opposite: "N" },
  W: { r: 0, c: -1, opposite: "E" },
};

export function PacketHopperModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [grid, setGrid] = useState<Tile[][]>([]);
  const [ttl, setTtl] = useState(60);
  const [latency, setLatency] = useState(1.8);
  const [throughput, setThroughput] = useState("1.0 Gbps");
  const [gameState, setGameState] = useState<
    "BRIEFING" | "PLAYING" | "DELIVERED" | "TIMEOUT"
  >("BRIEFING");
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [usedDerpPath, setUsedDerpPath] = useState(false);
  const [activePath, setActivePath] = useState<string[]>([]);
  const [traceLogs, setTraceLogs] = useState<string[]>([]);
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);

  const initBoard = () => {
    const raw: Tile[][] = [
      // Row 0
      [
        {
          id: "0-0",
          r: 0,
          c: 0,
          type: "start",
          connections: ["E"],
          rotation: 0,
          label: "SRC: iOS",
          eduTitle: "Ingress Client (Mobile WebKit / Tailnet)",
          eduDesc:
            "An iPhone accessing your sovereign homelab over cellular or external Wi-Fi via Carrier-Grade NAT (100.64.0.0/10).",
          protocolBadge: "RFC 6598 / CGNAT",
        },
        {
          id: "0-1",
          r: 0,
          c: 1,
          type: "pipe-straight",
          connections: ["N", "S"], // Scrambled initial rotation
          rotation: 90,
          eduTitle: "Point-to-Point UDP Socket",
          eduDesc:
            "WireGuard encapsulates encrypted IP packets into UDP datagrams targeting destination port 41641.",
          protocolBadge: "Direct UDP:41641",
        },
        {
          id: "0-2",
          r: 0,
          c: 2,
          type: "pipe-corner",
          connections: ["N", "E"], // Scrambled initial rotation
          rotation: 0,
          eduTitle: "NAT Gateway Router",
          eduDesc:
            "Performs outbound NAT and port mapping so reply datagrams return without drops.",
          protocolBadge: "Stateful NAT Binding",
        },
        {
          id: "0-3",
          r: 0,
          c: 3,
          type: "firewall",
          connections: [],
          rotation: 0,
          eduTitle: "Symmetric NAT Drop Barrier",
          eduDesc:
            "Restrictive corporate firewall dropping direct inbound UDP datagrams.",
          protocolBadge: "DROP / REJECT",
        },
        {
          id: "0-4",
          r: 0,
          c: 4,
          type: "firewall",
          connections: [],
          rotation: 0,
          eduTitle: "Edge ACL Barrier",
          eduDesc:
            "Default drop policy filtering unauthenticated traffic on hypervisor ingress.",
          protocolBadge: "DROP / REJECT",
        },
      ],
      // Row 1
      [
        {
          id: "1-0",
          r: 1,
          c: 0,
          type: "firewall",
          connections: [],
          rotation: 0,
          eduTitle: "Subnet Boundary Filter",
          eduDesc:
            "Boundary isolation preventing lateral transit across unmapped container VLANs.",
          protocolBadge: "DROP / REJECT",
        },
        {
          id: "1-1",
          r: 1,
          c: 1,
          type: "pipe-corner",
          connections: ["N", "E"],
          rotation: 0,
          eduTitle: "Local Bridge Route",
          eduDesc:
            "Kernel route forwarding between virtual tailscale0 interface and physical NIC.",
          protocolBadge: "Routing Table",
        },
        {
          id: "1-2",
          r: 1,
          c: 2,
          type: "pipe-corner",
          connections: ["E", "S"],
          rotation: 90,
          eduTitle: "Dynamic Routing Hub",
          eduDesc:
            "Core branching junction: orient East toward the Dubai DERP relay or West toward the local STUN snake bypass.",
          protocolBadge: "Dynamic Branch",
        },
        {
          id: "1-3",
          r: 1,
          c: 3,
          type: "derp",
          connections: ["N", "E", "S", "W"],
          rotation: 0,
          label: "DERP:DXB",
          eduTitle: "Designated Encrypted Relay for Packets (DERP: Dubai)",
          eduDesc:
            "Fallback relay operating over HTTPS/WebSockets (TCP 443). Relays forward encrypted payloads without possessing decryption keys.",
          protocolBadge: "TCP:443 / Fallback Relay",
        },
        {
          id: "1-4",
          r: 1,
          c: 4,
          type: "pipe-corner",
          connections: ["N", "E"],
          rotation: 0,
          eduTitle: "Relay Ingress Link",
          eduDesc:
            "Relayed circuit connecting cloud DERP node back to your home server gateway.",
          protocolBadge: "DERP Transit",
        },
      ],
      // Row 2
      [
        {
          id: "2-0",
          r: 2,
          c: 0,
          type: "pipe-corner",
          connections: ["S", "W"],
          rotation: 180,
          eduTitle: "Local Overlay Socket",
          eduDesc:
            "WireGuard cryptographic tunnel channel running ChaCha20-Poly1305 authenticated encryption.",
          protocolBadge: "Crypto Router",
        },
        {
          id: "2-1",
          r: 2,
          c: 1,
          type: "pipe-corner",
          connections: ["S", "W"],
          rotation: 180,
          eduTitle: "STUN Discovery Node",
          eduDesc:
            "Determines public-facing IP and socket tuples, enabling direct peer connectivity.",
          protocolBadge: "STUN Protocol",
        },
        {
          id: "2-2",
          r: 2,
          c: 2,
          type: "firewall",
          connections: [],
          rotation: 0,
          eduTitle: "Hypervisor nftables Drop",
          eduDesc:
            "Kernel firewall rule blocking cross-talk from untrusted network spaces.",
          protocolBadge: "DROP / REJECT",
        },
        {
          id: "2-3",
          r: 2,
          c: 3,
          type: "firewall",
          connections: [],
          rotation: 0,
          eduTitle: "Intrusion Prevention Drop",
          eduDesc:
            "Wazuh SIEM automated active response blackholing malicious probing attempts.",
          protocolBadge: "DROP / REJECT",
        },
        {
          id: "2-4",
          r: 2,
          c: 4,
          type: "pipe-straight",
          connections: ["E", "W"],
          rotation: 0,
          eduTitle: "Edge Ingress Port",
          eduDesc:
            "Directs DERP traffic into Proxmox VE bridged virtual switches (vmbr0).",
          protocolBadge: "vmbr0 Bridge",
        },
      ],
      // Row 3
      [
        {
          id: "3-0",
          r: 3,
          c: 0,
          type: "pipe-corner",
          connections: ["S", "W"],
          rotation: 180,
          eduTitle: "Fallback Buffer",
          eduDesc: "Alternative transit socket for packet retransmission.",
          protocolBadge: "Buffer Hop",
        },
        {
          id: "3-1",
          r: 3,
          c: 1,
          type: "pipe-straight",
          connections: ["N", "S"],
          rotation: 90,
          eduTitle: "Hardware Offload NIC",
          eduDesc:
            "Physical network card utilizing TCP/UDP checksum offloading to minimize CPU load.",
          protocolBadge: "Checksum Offload",
        },
        {
          id: "3-2",
          r: 3,
          c: 2,
          type: "pipe-straight",
          connections: ["N", "S"],
          rotation: 90,
          eduTitle: "Host Socket Binding",
          eduDesc:
            "Local kernel socket delivering validated frames to target port listening process.",
          protocolBadge: "Socket Accept",
        },
        {
          id: "3-3",
          r: 3,
          c: 3,
          type: "pipe-straight",
          connections: ["N", "S"],
          rotation: 90,
          eduTitle: "Service Dispatcher",
          eduDesc:
            "Final routing jump through FastAPI's async gateway into your Proxmox orchestration daemon.",
          protocolBadge: "Control Plane Ingress",
        },
        {
          id: "3-4",
          r: 3,
          c: 4,
          type: "end",
          connections: ["W", "N"],
          rotation: 0,
          label: "DST: PVE",
          eduTitle: "Proxmox Host Ingress (pve-server:8006)",
          eduDesc:
            "Destination bare-metal hypervisor node. Streams real-time cluster telemetry once authenticated.",
          protocolBadge: "Destination:8006",
        },
      ],
    ];

    setGrid(raw);
    setTtl(60);
    setLatency(1.8);
    setThroughput("1.0 Gbps");
    setActivePath(["0-0"]);
    setSelectedTile(raw[0][0]);
    setShowSummaryModal(false);
    setUsedDerpPath(false);
    setTraceLogs([
      "[00:00:00] Ingress handshake initiated from iOS client (100.116.163.29)...",
    ]);
  };

  useEffect(() => {
    if (isOpen) {
      initBoard();
      setGameState("BRIEFING");
    }
  }, [isOpen]);

  // Buffer TTL countdown
  useEffect(() => {
    if (!isOpen || gameState !== "PLAYING") return;
    const interval = setInterval(() => {
      setTtl((prev) => {
        if (prev <= 1) {
          setGameState("TIMEOUT");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, gameState]);

  const rotateTile = (r: number, c: number) => {
    if (gameState !== "PLAYING") return;
    const tile = grid[r][c];
    if (
      tile.type === "start" ||
      tile.type === "end" ||
      tile.type === "firewall" ||
      tile.type === "derp"
    ) {
      setSelectedTile(tile);
      return;
    }

    const rotMap: Record<Direction, Direction> = {
      N: "E",
      E: "S",
      S: "W",
      W: "N",
    };
    const newConns = tile.connections.map((d) => rotMap[d]);

    const nextGrid = grid.map((row, ri) =>
      row.map((col, ci) => {
        if (ri === r && ci === c) {
          const updatedTile: Tile = {
            ...col,
            rotation: (col.rotation + 90) % 360,
            connections: newConns,
          };
          setSelectedTile(updatedTile);
          return updatedTile;
        }
        return col;
      }),
    );

    setGrid(nextGrid);
    evaluateCircuit(nextGrid);
  };

  const evaluateCircuit = (currentGrid: Tile[][]) => {
    const visited: string[] = ["0-0"];
    const logs: string[] = [
      "[00:00:00] Ingress handshake initiated from iOS client...",
    ];
    let currR = 0;
    let currC = 0;
    let currDir: Direction = currentGrid[0][0].connections[0];
    let usedDerp = false;

    for (let stepCount = 0; stepCount < 25; stepCount++) {
      const step = ROTATION_DELTAS[currDir];
      const nextR = currR + step.r;
      const nextC = currC + step.c;

      if (nextR < 0 || nextR >= 4 || nextC < 0 || nextC >= 5) {
        logs.push(
          `[WARN] Route reached perimeter at (${currR}, ${currC}). Dead-end.`,
        );
        break;
      }

      const nextTile = currentGrid[nextR][nextC];
      const nextId = `${nextR}-${nextC}`;

      if (nextTile.type === "firewall") {
        logs.push(
          `[DROP] Packet dropped by ${nextTile.eduTitle} at (${nextR}, ${nextC}).`,
        );
        break;
      }

      if (nextTile.type === "end") {
        if (nextTile.connections.includes(step.opposite)) {
          visited.push(nextId);
          const finalLatency = usedDerp ? 54.2 : 1.8;
          const finalThroughput = usedDerp ? "48 Mbps" : "1.0 Gbps";
          setLatency(finalLatency);
          setThroughput(finalThroughput);
          setUsedDerpPath(usedDerp);
          logs.push(
            `[SUCCESS] Circuit locked! Handshake verified to pve-server (${finalLatency}ms, ${finalThroughput}).`,
          );
          setActivePath(visited);
          setTraceLogs(logs);
          setGameState("DELIVERED");
          setShowSummaryModal(true);
          return;
        } else {
          logs.push(`[MISMATCH] DST: PVE socket closed from ${step.opposite}.`);
          break;
        }
      }

      if (nextTile.type === "derp") {
        usedDerp = true;
        visited.push(nextId);
        logs.push(`[RELAY] Routed via Dubai DERP Relay (dxb) over TCP 443.`);
        currR = nextR;
        currC = nextC;
        currDir = "E";
        continue;
      }

      if (!nextTile.connections.includes(step.opposite)) {
        logs.push(
          `[MISMATCH] Socket open at (${nextR}, ${nextC}). Waiting for alignment...`,
        );
        break;
      }

      visited.push(nextId);
      logs.push(
        `[HOP] Verified WireGuard crypto-hop to ${nextTile.protocolBadge}.`,
      );

      const exitDir = nextTile.connections.find((d) => d !== step.opposite);
      if (!exitDir) break;

      currR = nextR;
      currC = nextC;
      currDir = exitDir;
    }

    setActivePath(visited);
    setTraceLogs(logs);
    setLatency(usedDerp ? 54.2 : 1.8);
    setThroughput(usedDerp ? "48 Mbps" : "1.0 Gbps");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 font-mono select-none overflow-y-auto">
      <div className="w-full max-w-6xl bg-[#111114] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto relative">
        {/* ================= MODAL 1: PRE-FLIGHT MISSION BRIEFING ================= */}
        {gameState === "BRIEFING" && (
          <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
            <div className="max-w-xl w-full bg-[#16161a] border border-zinc-800 rounded-3xl p-8 shadow-2xl space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl">
                  <Radio className="w-7 h-7 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white uppercase tracking-wider">
                    Packet Hopper: Mission Briefing
                  </h3>
                  <p className="text-xs text-zinc-400 font-sans">
                    Software-Defined Mesh Topology & NAT Traversal Lab
                  </p>
                </div>
              </div>

              <div className="space-y-3 font-sans text-xs text-zinc-300 leading-relaxed">
                <div className="p-3.5 bg-zinc-900/90 border border-zinc-800 rounded-xl space-y-1">
                  <strong className="text-emerald-400 font-mono text-[11px] uppercase block">
                    1. Mission Objective
                  </strong>
                  <p>
                    Route an encrypted WireGuard circuit from{" "}
                    <strong className="text-emerald-300">SRC: iOS</strong> to{" "}
                    <strong className="text-sky-300">DST: PVE</strong> before
                    the 60-second keepalive buffer expires.
                  </p>
                </div>

                <div className="p-3.5 bg-zinc-900/90 border border-zinc-800 rounded-xl space-y-1">
                  <strong className="text-sky-400 font-mono text-[11px] uppercase block">
                    2. Dynamic Branch Decision
                  </strong>
                  <p>
                    At junction{" "}
                    <strong className="text-white font-mono">
                      (Row 1, Col 2)
                    </strong>
                    , choose your routing strategy:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-zinc-400 pt-1">
                    <li>
                      <strong className="text-amber-300">
                        Option A: DERP Relay Path (~54.2 ms):
                      </strong>{" "}
                      Rotate the hub East into{" "}
                      <code className="text-amber-400 font-mono">
                        DERP: DXB
                      </code>{" "}
                      to bypass firewalls over TCP 443.
                    </li>
                    <li>
                      <strong className="text-emerald-300">
                        Option B: Direct STUN Snake (~1.8 ms):
                      </strong>{" "}
                      Rotate the hub West to snake through the bottom perimeter
                      and achieve line-rate wire speed.
                    </li>
                  </ul>
                </div>

                <div className="p-3.5 bg-zinc-900/90 border border-zinc-800 rounded-xl space-y-1">
                  <strong className="text-rose-400 font-mono text-[11px] uppercase block">
                    3. Firewall Traps
                  </strong>
                  <p>
                    Red{" "}
                    <code className="text-rose-400 font-mono">NAT DROP</code>{" "}
                    tiles will instantly dump your packet stream. Plan your
                    socket rotations around them.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold transition-colors"
                >
                  Exit Lab
                </button>
                <button
                  onClick={() => setGameState("PLAYING")}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                >
                  <Play className="w-4 h-4 fill-white" /> Initialize Tunnel
                  Session
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= MODAL 2: TIMEOUT FAILURE ================= */}
        {gameState === "TIMEOUT" && (
          <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-[#181214] border border-rose-900/50 rounded-3xl p-8 shadow-2xl text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-mono font-bold rounded-full uppercase">
                  NAT Dead-Timer Tripped
                </span>
                <h3 className="text-lg font-bold text-white">
                  Buffer Timeout: Handshake Expired
                </h3>
                <p className="text-xs text-zinc-400 font-sans leading-relaxed">
                  The WireGuard keepalive window exceeded 60 seconds without
                  completing a circuit to{" "}
                  <strong className="text-white">pve-server</strong>.
                </p>
              </div>

              <div className="p-3 bg-zinc-950/70 border border-zinc-800/80 rounded-xl text-[11px] font-mono text-zinc-400 text-left space-y-1">
                <div className="text-zinc-500 font-bold uppercase text-[9px]">
                  Triage Hint:
                </div>
                <div className="text-amber-400">
                  • DERP path requires fewer turns via Row 1 and Col 4.
                </div>
                <div className="text-emerald-400">
                  • Direct path snakes down Col 0 and along Row 3.
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    initBoard();
                    setGameState("PLAYING");
                  }}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20 transition-all active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" /> Re-transmit Packets
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= MODAL 3: POST-FLIGHT EDUCATIONAL SUMMARY ================= */}
        {gameState === "DELIVERED" && showSummaryModal && (
          <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
            <div className="max-w-2xl w-full bg-[#141418] border border-emerald-500/30 rounded-3xl p-8 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-3 rounded-2xl ${usedDerpPath ? "bg-amber-500/10 border border-amber-500/20 text-amber-400" : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"}`}
                  >
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${usedDerpPath ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"}`}
                    >
                      {usedDerpPath
                        ? "Relayed Traversal Verified"
                        : "Direct P2P Link Verified"}
                    </span>
                    <h3 className="text-lg font-bold text-white mt-1">
                      {usedDerpPath
                        ? "Tailscale DERP Relay Route Established"
                        : "STUN UDP Hole-Punching Established"}
                    </h3>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <span className="text-[10px] text-zinc-500 uppercase block">
                    Total Hops
                  </span>
                  <strong className="text-emerald-400 text-sm">
                    {activePath.length} Nodes
                  </strong>
                </div>
              </div>

              {/* Technical Telemetry Summary Pills */}
              <div className="grid grid-cols-3 gap-3 font-mono text-xs">
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <span className="text-[10px] text-zinc-500 uppercase block">
                    Transport Protocol
                  </span>
                  <strong className="text-white font-bold">
                    {usedDerpPath ? "TCP / TLS 443" : "Direct UDP:41641"}
                  </strong>
                </div>
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <span className="text-[10px] text-zinc-500 uppercase block">
                    Measured Latency
                  </span>
                  <strong
                    className={`font-bold ${usedDerpPath ? "text-amber-400" : "text-emerald-400"}`}
                  >
                    {latency} ms
                  </strong>
                </div>
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <span className="text-[10px] text-zinc-500 uppercase block">
                    Payload Encryption
                  </span>
                  <strong className="text-indigo-400 font-bold">
                    ChaCha20-Poly1305
                  </strong>
                </div>
              </div>

              {/* Architectural Explanation */}
              <div className="p-4 bg-zinc-950/70 border border-zinc-800/80 rounded-2xl space-y-2 font-sans text-xs text-zinc-300 leading-relaxed">
                <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[11px] font-bold uppercase">
                  <Layers className="w-3.5 h-3.5 text-sky-400" /> Engineering
                  Debrief: What Just Happened?
                </div>

                {usedDerpPath ? (
                  <p>
                    Your client encountered symmetric NAT filtering or route
                    constraints and fell back to{" "}
                    <strong className="text-amber-300">
                      Designated Encrypted Relay for Packets (DERP: Region 24
                      Dubai)
                    </strong>
                    . Encrypted WireGuard payloads were encapsulated into
                    HTTPS/WebSocket frames over standard outbound TCP 443. The
                    DERP cloud node relayed frames into your local gateway
                    without decrypting the payload, incurring a small latency
                    trade-off (
                    <strong className="text-amber-400 font-mono">
                      54.2 ms
                    </strong>
                    ) to guarantee 100% connectivity.
                  </p>
                ) : (
                  <p>
                    Your client negotiated direct point-to-point UDP
                    communication using{" "}
                    <strong className="text-emerald-300">
                      STUN NAT hole-punching
                    </strong>
                    . By snaking around the central nftables drop rules and
                    keeping the local NAT binding active, your datagrams reached
                    the host's physical network adapter directly without
                    bouncing off cloud relays. This achieved maximum wire
                    throughput and ultra-low round-trip latency (
                    <strong className="text-emerald-400 font-mono">
                      1.8 ms
                    </strong>
                    ).
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setShowSummaryModal(false)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" /> Inspect Completed Circuit
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-semibold transition-colors"
                  >
                    Done
                  </button>
                  <button
                    onClick={() => {
                      initBoard();
                      setGameState("PLAYING");
                    }}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Run Alternative Route
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Header */}
        <div className="px-8 py-5 border-b border-zinc-800 bg-[#151518] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <Network className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Packet Hopper: Interactive SDN Circuit Simulator
                </h3>
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] rounded-full flex items-center gap-1 font-bold">
                  <Sparkles className="w-3 h-3" /> Educational Lab
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-sans mt-0.5">
                Rotate WireGuard cryptokey links to deliver authenticated
                packets to <strong className="text-white">pve-server</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {gameState === "DELIVERED" && !showSummaryModal && (
              <button
                onClick={() => setShowSummaryModal(true)}
                className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Layers className="w-3.5 h-3.5" /> View Debrief
              </button>
            )}
            <button
              onClick={() => setGameState("BRIEFING")}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-emerald-400" /> Guide
            </button>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Network Telemetry HUD */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 bg-zinc-950/90 border-b border-zinc-800 text-xs">
          <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl">
            <span className="text-[10px] text-zinc-500 uppercase block font-bold">
              Buffer TTL
            </span>
            <strong
              className={`text-base font-bold ${ttl > 12 ? "text-emerald-400" : "text-rose-400 animate-pulse"}`}
            >
              {ttl}s
            </strong>
          </div>
          <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl">
            <span className="text-[10px] text-zinc-500 uppercase block font-bold">
              Network RTT (Latency)
            </span>
            <strong
              className={`text-base font-bold ${latency < 10 ? "text-emerald-400" : "text-amber-400"}`}
            >
              {latency} ms
            </strong>
          </div>
          <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl">
            <span className="text-[10px] text-zinc-500 uppercase block font-bold">
              Throughput Bandwidth
            </span>
            <strong className="text-base font-bold text-sky-400">
              {throughput}
            </strong>
          </div>
          <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl">
            <span className="text-[10px] text-zinc-500 uppercase block font-bold">
              Handshake Cipher
            </span>
            <strong className="text-base font-bold text-indigo-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />{" "}
              ChaCha20-Poly1305
            </strong>
          </div>
        </div>

        {/* Main Interactive Stage */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-8">
          {/* 4x5 Puzzle Board (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center">
            <div className="grid grid-cols-5 gap-3.5 bg-zinc-950 p-6 border border-zinc-800/90 rounded-3xl shadow-inner w-full max-w-[540px]">
              {grid.map((row, r) =>
                row.map((tile, c) => {
                  const isActive = activePath.includes(tile.id);
                  const isSelected = selectedTile?.id === tile.id;

                  return (
                    <button
                      key={tile.id}
                      onClick={() => rotateTile(r, c)}
                      onMouseEnter={() => setSelectedTile(tile)}
                      className={`w-full aspect-square rounded-2xl flex flex-col items-center justify-center relative transition-all border ${
                        isSelected ? "ring-2 ring-emerald-400 scale-[1.03]" : ""
                      } ${
                        tile.type === "firewall"
                          ? "bg-rose-950/20 border-rose-900/40 cursor-pointer opacity-85"
                          : tile.type === "derp"
                            ? "bg-amber-950/30 border-amber-500/50 cursor-pointer shadow-sm shadow-amber-500/10"
                            : isActive
                              ? "bg-emerald-950/40 border-emerald-500/80 shadow-lg shadow-emerald-500/20"
                              : "bg-zinc-900/90 border-zinc-800 hover:border-zinc-700 active:scale-95"
                      }`}
                    >
                      {tile.type === "start" && (
                        <span className="text-[11px] font-bold text-emerald-400 text-center leading-tight">
                          SRC
                          <br />
                          iOS
                        </span>
                      )}
                      {tile.type === "end" && (
                        <span className="text-[11px] font-bold text-sky-400 text-center leading-tight">
                          DST
                          <br />
                          PVE
                        </span>
                      )}
                      {tile.type === "derp" && (
                        <span className="text-[10px] font-bold text-amber-400 text-center leading-tight">
                          DERP
                          <br />
                          DXB
                        </span>
                      )}
                      {tile.type === "firewall" && (
                        <span className="text-[10px] font-bold text-rose-400 text-center leading-tight">
                          NAT
                          <br />
                          DROP
                        </span>
                      )}

                      {tile.type.startsWith("pipe") && (
                        <span
                          className={`text-3xl font-black ${
                            isActive
                              ? "text-emerald-400 drop-shadow-[0_0_12px_#10b981]"
                              : "text-zinc-600 group-hover:text-zinc-400"
                          }`}
                        >
                          {tile.type === "pipe-straight" &&
                            (tile.rotation % 180 === 0 ? "═" : "║")}
                          {tile.type === "pipe-corner" &&
                            (tile.rotation === 0
                              ? "╚"
                              : tile.rotation === 90
                                ? "╔"
                                : tile.rotation === 180
                                  ? "╗"
                                  : "╝")}
                        </span>
                      )}
                    </button>
                  );
                }),
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-4 font-mono text-center">
              Click tiles to rotate 90°. Hover over any node to inspect protocol
              internals.
            </p>
          </div>

          {/* Educational Inspector & Terminal (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
            <div className="p-6 bg-zinc-900/90 border border-zinc-800 rounded-3xl space-y-3 shadow-md">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <Info className="w-4 h-4 text-sky-400" /> Node Inspector
                </span>
                <span className="px-2.5 py-0.5 bg-zinc-800 text-zinc-300 text-[10px] rounded-full font-bold font-mono">
                  {selectedTile?.protocolBadge || "Ready"}
                </span>
              </div>
              <h4 className="text-sm font-bold text-white font-sans">
                {selectedTile?.eduTitle || "Click or hover on any hop"}
              </h4>
              <p className="text-xs font-sans text-zinc-400 leading-relaxed">
                {selectedTile?.eduDesc ||
                  "Inspect any routing tile to see how WireGuard crypto-routing, STUN NAT traversal, and Tailscale DERP fallbacks function in this sovereign architecture."}
              </p>
            </div>

            <div className="p-4 bg-black/80 border border-zinc-800 rounded-3xl flex-1 flex flex-col justify-between">
              <div className="text-[11px] uppercase font-bold text-zinc-500 mb-2 flex items-center justify-between">
                <span>Real-Time Packet Trace</span>
                <span className="text-emerald-400 font-mono">
                  {activePath.length} Nodes Connected
                </span>
              </div>
              <div className="h-44 overflow-y-auto text-xs space-y-1.5 pr-2 font-mono text-zinc-400">
                {traceLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className={
                      log.includes("[SUCCESS]")
                        ? "text-emerald-400 font-bold"
                        : log.includes("[DROP]")
                          ? "text-rose-400"
                          : log.includes("[RELAY]")
                            ? "text-amber-400"
                            : "text-zinc-400"
                    }
                  >
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-8 py-5 bg-zinc-950 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            {gameState === "PLAYING" && (
              <p className="text-xs text-zinc-400 font-sans">
                Assemble an unobstructed cryptographic tunnel from{" "}
                <strong className="text-emerald-400">SRC:iOS</strong> to{" "}
                <strong className="text-sky-400">DST:PVE</strong>.
              </p>
            )}
            {gameState === "DELIVERED" && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold font-sans">
                <CheckCircle2 className="w-5 h-5" /> 0% Packet Loss — Handshake
                Verified! Route Latency: {latency}ms ({throughput})
              </div>
            )}
            {gameState === "TIMEOUT" && (
              <div className="flex items-center gap-2 text-rose-400 text-sm font-bold font-sans">
                <AlertTriangle className="w-5 h-5" /> Keepalive Expired — Packet
                Dropped by NAT Dead-Timer
              </div>
            )}
          </div>

          <button
            onClick={() => {
              initBoard();
              setGameState("PLAYING");
            }}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <RotateCcw className="w-4 h-4" /> Reset Circuit
          </button>
        </div>
      </div>
    </div>
  );
}
