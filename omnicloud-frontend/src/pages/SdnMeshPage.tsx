import React, { useMemo, useState } from "react";
import { LxcWorkload, TailscaleMeshResponse } from "../types/omnicloud";

interface SdnMeshPageProps {
  workloads: LxcWorkload[];
  meshData?: TailscaleMeshResponse | null;
  onOpenConsole: (workload: LxcWorkload) => void;
}

export const SdnMeshPage: React.FC<SdnMeshPageProps> = ({
  workloads,
  meshData,
  onOpenConsole,
}) => {
  const [routeFilter, setRouteFilter] = useState<"ALL" | "DIRECT" | "DERP">(
    "ALL",
  );

  const enrichedWorkloads = useMemo(() => {
    if (!meshData?.peers?.length) return workloads;
    const peerByHost = new Map(
      meshData.peers.map((p) => [p.hostname.toLowerCase(), p]),
    );
    const peerByIp = new Map(meshData.peers.map((p) => [p.tailscale_ip, p]));

    return workloads.map((w) => {
      const matched =
        peerByIp.get(w.tailnetIp) || peerByHost.get(w.name.toLowerCase());
      if (!matched) return w;
      return {
        ...w,
        tailnetIp: matched.tailscale_ip || w.tailnetIp,
        peerMode:
          matched.relay === "direct" ? ("direct" as const) : ("DERP" as const),
      };
    });
  }, [workloads, meshData]);

  const peers = enrichedWorkloads.filter((w) => {
    if (routeFilter === "DIRECT")
      return w.state === "running" && w.peerMode === "direct";
    if (routeFilter === "DERP")
      return w.state !== "running" || w.peerMode === "DERP";
    return true;
  });

  const routerIp = meshData?.local?.tailscale_ip || "100.117.21.82";
  const routerHost = meshData?.local?.node_name || "pve-server";
  const derpRegion = meshData?.local?.derp_relay || "dxb";

  return (
    <>
      <section className="kpi-grid-3" aria-label="SDN WireGuard Mesh Status">
        <div className="rack-card">
          <div className="kpi-top-row">
            <span className="micro-label">SUBNET ROUTER NODE</span>
            <span className="hw-tag">UDP:41641</span>
          </div>
          <div className="kpi-hero-row">
            <span className="kpi-hero-value" style={{ fontSize: "26px" }}>
              {routerIp}
            </span>
          </div>
          <div
            className="kpi-foot-row"
            style={{ color: "var(--signal-online)" }}
          >
            <span>
              ● {routerHost} · MagicDNS Active ({derpRegion}.ts.net)
            </span>
          </div>
        </div>

        <div className="rack-card">
          <div className="kpi-top-row">
            <span className="micro-label">DIRECT STUN PEER RTT</span>
            <span className="hw-tag">WIREGUARD</span>
          </div>
          <div className="kpi-hero-row">
            <span className="kpi-hero-value">1.2 ms</span>
            <span className="micro-label">MEDIAN LATENCY</span>
          </div>
          <div
            className="kpi-foot-row"
            style={{ color: "var(--rack-ink-secondary)" }}
          >
            <span>ADVERTISED ROUTES: 10.10.20.0/24</span>
          </div>
        </div>

        <div className="rack-card">
          <div className="kpi-top-row">
            <span className="micro-label">PERIMETER FIREWALL POLICY</span>
            <span className="hw-tag">NFTABLES / UFW</span>
          </div>
          <div className="kpi-hero-row">
            <span className="kpi-hero-value" style={{ fontSize: "26px" }}>
              DEFAULT DENY
            </span>
          </div>
          <div
            className="kpi-foot-row"
            style={{ color: "var(--signal-online)" }}
          >
            <span>✓ Zero WAN Port Forwards Exposed</span>
          </div>
        </div>
      </section>

      <section
        className="module-panel"
        aria-label="Peer-to-Peer Latency Matrix"
      >
        <div className="module-header">
          <div>
            <div className="module-title-row">
              <h2 className="module-title">
                Peer-to-Peer Latency &amp; Routing Matrix
              </h2>
              <span className="hw-tag">VMBR0 BRIDGE</span>
            </div>
            <p className="module-subtitle">
              Overlay Tailnet endpoints mapped to internal Proxmox bridge
              interfaces
            </p>
          </div>

          <div className="segmented-group">
            {(["ALL", "DIRECT", "DERP"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`seg-btn ${routeFilter === mode ? "active" : ""}`}
                onClick={() => setRouteFilter(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="table-scroll">
          <table className="rack-table">
            <thead>
              <tr>
                <th>PEER HOSTNAME</th>
                <th>TAILNET IP</th>
                <th>LAN BRIDGE (VMBR0)</th>
                <th>TUNNEL PATH</th>
                <th>RTT LATENCY</th>
                <th style={{ textAlign: "right" }}>DIAGNOSTIC</th>
              </tr>
            </thead>
            <tbody>
              {peers.map((w) => {
                const active = w.state === "running";
                return (
                  <tr
                    key={w.vmid}
                    className={!active ? "is-stopped" : undefined}
                  >
                    <td>
                      <strong className="mono">
                        {w.name.toLowerCase()}.dxb.ts.net
                      </strong>
                      <div
                        className="mono"
                        style={{
                          fontSize: "11px",
                          color: "var(--rack-ink-secondary)",
                        }}
                      >
                        VMID #{w.vmid} · {w.port}
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: "12px" }}>
                      {w.tailnetIp}
                    </td>
                    <td
                      className="mono"
                      style={{
                        fontSize: "12px",
                        color: "var(--rack-ink-secondary)",
                      }}
                    >
                      {w.lanIp}
                    </td>
                    <td>
                      <span
                        className={`state-pill ${active ? "running" : "stopped"}`}
                      >
                        <span
                          className={`led-dot ${active ? "led-online" : "led-stopped"}`}
                        />
                        {active && w.peerMode === "direct"
                          ? "DIRECT UDP"
                          : "DERP STANDBY"}
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: "12px" }}>
                      {active ? `${w.rttMs.toFixed(1)} ms` : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className={`console-keycap ${!active ? "muted" : ""}`}
                        onClick={() => onOpenConsole(w)}
                      >
                        &gt;_ CONSOLE
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};
