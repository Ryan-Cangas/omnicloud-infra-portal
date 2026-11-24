import React, { useState } from "react";
import { LxcWorkload, ServiceCategory } from "../types/omnicloud";

interface ServiceCatalogPageProps {
  workloads: LxcWorkload[];
  onOpenConsole: (workload: LxcWorkload) => void;
}

export const ServiceCatalogPage: React.FC<ServiceCatalogPageProps> = ({
  workloads,
  onOpenConsole,
}) => {
  const [category, setCategory] = useState<"ALL" | ServiceCategory>("ALL");
  const [routeMode, setRouteMode] = useState<"TAILSCALE_SSL" | "DIRECT_LAN">(
    "TAILSCALE_SSL",
  );
  const [copiedVmid, setCopiedVmid] = useState<number | null>(null);

  const filtered = workloads.filter(
    (w) => category === "ALL" || w.category === category,
  );

  const handleCopyEndpoint = (w: LxcWorkload) => {
    const endpoint =
      routeMode === "TAILSCALE_SSL"
        ? w.domain
        : `http://${w.lanIp}:${w.port.split("/")[0]}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(endpoint).catch(() => {});
    }
    setCopiedVmid(w.vmid);
    setTimeout(() => setCopiedVmid(null), 1600);
  };

  return (
    <section className="module-panel" aria-label="Self-Hosted Service Catalog">
      <div className="module-header">
        <div>
          <div className="module-title-row">
            <h2 className="module-title">Service Endpoint Directory</h2>
            <span className="hw-tag">{filtered.length} SERVICES</span>
          </div>
          <p className="module-subtitle">
            Reverse-proxied TLS ingress endpoints and direct LAN bridge sockets
          </p>
        </div>

        <div className="module-controls">
          <div className="segmented-group" aria-label="Address Mode">
            <button
              type="button"
              className={`seg-btn ${routeMode === "TAILSCALE_SSL" ? "active" : ""}`}
              onClick={() => setRouteMode("TAILSCALE_SSL")}
            >
              TAILSCALE SSL
            </button>
            <button
              type="button"
              className={`seg-btn ${routeMode === "DIRECT_LAN" ? "active" : ""}`}
              onClick={() => setRouteMode("DIRECT_LAN")}
            >
              DIRECT LAN
            </button>
          </div>

          <div className="segmented-group" aria-label="Category Filter">
            {(["ALL", "INFRASTRUCTURE", "MEDIA", "SECURITY"] as const).map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`seg-btn ${category === cat ? "active" : ""}`}
                  onClick={() => setCategory(cat)}
                >
                  {cat}
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="catalog-grid">
        {filtered.map((w) => {
          const isRunning = w.state === "running";
          const resolvedUrl =
            routeMode === "TAILSCALE_SSL"
              ? w.domain
              : `http://${w.lanIp}:${w.port.split("/")[0]}`;

          return (
            <article key={w.vmid} className="service-card">
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span className="hw-tag">
                    #{w.vmid} · {w.category}
                  </span>
                  <span className={`state-pill ${w.state}`}>
                    <span
                      className={`led-dot ${isRunning ? "led-online" : "led-stopped"}`}
                    />
                    {isRunning ? "200 OK" : "503 STOPPED"}
                  </span>
                </div>

                <h3
                  style={{
                    margin: "12px 0 4px",
                    fontSize: "16px",
                    fontWeight: 700,
                  }}
                >
                  {w.name}
                </h3>
                <p
                  className="mono"
                  style={{
                    margin: 0,
                    fontSize: "11.5px",
                    color: "var(--rack-ink-secondary)",
                  }}
                >
                  {w.description}
                </p>

                <div
                  className="mono"
                  style={{
                    marginTop: "12px",
                    padding: "8px 10px",
                    background: "var(--rack-plate)",
                    border: "1px solid var(--rack-border)",
                    borderRadius: "2px",
                    fontSize: "11.5px",
                  }}
                >
                  <div style={{ color: "var(--rack-ink)", fontWeight: 600 }}>
                    {resolvedUrl}
                  </div>
                  <div
                    style={{ color: "var(--rack-ink-muted)", marginTop: "3px" }}
                  >
                    SOCKET {w.tailnetIp}:{w.port} · TLS {w.tlsDaysLeft}D
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "8px",
                }}
              >
                <button
                  type="button"
                  className="theme-switch-btn"
                  style={{
                    minHeight: "28px",
                    padding: "0 10px",
                    flex: 1,
                    justifyContent: "center",
                  }}
                  onClick={() => handleCopyEndpoint(w)}
                >
                  {copiedVmid === w.vmid ? "COPIED URI ✓" : "COPY ENDPOINT ↗"}
                </button>

                <button
                  type="button"
                  className={`console-keycap ${!isRunning ? "muted" : ""}`}
                  onClick={() => onOpenConsole(w)}
                >
                  &gt;_ CONSOLE
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
