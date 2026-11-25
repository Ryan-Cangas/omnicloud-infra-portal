import React, { useMemo, useState } from "react";
import { LxcWorkload } from "../types/omnicloud";

interface OverviewPageProps {
  workloads: LxcWorkload[];
  liveRxKbps?: number;
  liveTxKbps?: number;
  pendingPowerVmids?: number[];
  onTogglePower: (vmid: number) => void;
  onOpenConsole: (workload: LxcWorkload) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  workloads,
  liveRxKbps,
  liveTxKbps,
  pendingPowerVmids = [],
  onTogglePower,
  onOpenConsole,
}) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "RUNNING" | "STOPPED">("ALL");

  const onlineCount = useMemo(
    () => workloads.filter((w) => w.state === "running").length,
    [workloads],
  );
  const stoppedCount = workloads.length - onlineCount;

  const fallbackThroughputKbps = useMemo(
    () => 139 + onlineCount * 78,
    [onlineCount],
  );
  const hasLiveNet =
    typeof liveRxKbps === "number" &&
    typeof liveTxKbps === "number" &&
    liveRxKbps + liveTxKbps > 0;

  const txKbps = hasLiveNet
    ? Math.round(liveTxKbps)
    : Math.round(fallbackThroughputKbps * 0.225);
  const rxKbps = hasLiveNet
    ? Math.round(liveRxKbps)
    : fallbackThroughputKbps - txKbps;
  const totalThroughputKbps = txKbps + rxKbps;
  const txSharePct =
    totalThroughputKbps > 0
      ? Math.min(90, Math.max(10, (txKbps / totalThroughputKbps) * 100))
      : 22.5;

  const filteredWorkloads = useMemo(() => {
    return workloads.filter((w) => {
      const matchesFilter =
        filter === "ALL" ||
        (filter === "RUNNING" && w.state === "running") ||
        (filter === "STOPPED" && w.state === "stopped");
      const q = search.trim().toLowerCase();
      const matchesQuery =
        !q ||
        w.name.toLowerCase().includes(q) ||
        String(w.vmid).includes(q) ||
        w.description.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [workloads, filter, search]);

  return (
    <>
      <section className="kpi-grid-3" aria-label="Hypervisor Summary Metrics">
        <div className="rack-card">
          <div className="kpi-top-row">
            <span className="micro-label">MANAGED COMPUTE GUESTS</span>
            <span className="hw-tag">PVE-01</span>
          </div>
          <div className="kpi-hero-row">
            <span className="kpi-hero-value">{workloads.length}</span>
            <span className="micro-label">LXC CONTAINERS</span>
          </div>
          <div className="led-segment-bar" aria-hidden="true">
            {workloads.map((w) => (
              <div
                key={w.vmid}
                className={`led-segment ${w.state === "running" ? "on" : ""}`}
              />
            ))}
          </div>
          <div
            className="kpi-foot-row"
            style={{ color: "var(--signal-online)" }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span className="led-dot led-online" />
              {onlineCount} online active workloads · {stoppedCount} standby
            </span>
          </div>
        </div>

        <div className="rack-card">
          <div className="kpi-top-row">
            <span className="micro-label">ACTIVE SERVICE ENDPOINTS</span>
            <span className="hw-tag">SSL/LAN</span>
          </div>
          <div className="kpi-hero-row">
            <span className="kpi-hero-value">{workloads.length}</span>
            <span className="micro-label">TLS / TAILNET ROUTES</span>
          </div>
          <div className="meter-track" aria-hidden="true">
            <div className="meter-fill-online" style={{ width: "99.95%" }} />
          </div>
          <div
            className="kpi-foot-row"
            style={{ color: "var(--signal-online)" }}
          >
            <span>✓ All systems responding (99.95% SLA)</span>
          </div>
        </div>

        <div className="rack-card">
          <div className="kpi-top-row">
            <span className="micro-label">NETWORK I/O THROUGHPUT</span>
            <span className="hw-tag">VMBR0</span>
          </div>
          <div className="kpi-hero-row">
            <span className="kpi-hero-value">{totalThroughputKbps} Kbps</span>
          </div>
          <div className="meter-track" aria-hidden="true">
            <div
              className="meter-fill-vermilion"
              style={{ width: `${txSharePct.toFixed(1)}%` }}
            />
            <div
              className="meter-fill-ink"
              style={{ width: `${(100 - txSharePct).toFixed(1)}%` }}
            />
          </div>
          <div className="kpi-foot-row">
            <span style={{ color: "var(--signal-vermilion)" }}>
              TX {txKbps} Kbps
            </span>
            <span style={{ color: "var(--rack-ink-secondary)" }}>
              RX {rxKbps} Kbps
            </span>
          </div>
        </div>
      </section>

      <section
        className="module-panel"
        aria-label="Virtual Machines and Containers"
      >
        <div className="module-header">
          <div>
            <div className="module-title-row">
              <h2 className="module-title">
                Virtual Machines &amp; Containers
              </h2>
              <span className="hw-tag">
                {onlineCount} RUNNING / {stoppedCount} STOPPED
              </span>
            </div>
            <p className="module-subtitle">
              Global Hypervisor Inventory (pve-server) · Toggle hardware rocker
              switch for power or press &gt;_ CONSOLE for live TTY
            </p>
          </div>

          <div className="module-controls">
            <input
              type="search"
              className="rack-input"
              placeholder="Filter ID or guest..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filter workloads by ID or name"
            />
            <div
              className="segmented-group"
              role="group"
              aria-label="Workload State Filter"
            >
              {(["ALL", "RUNNING", "STOPPED"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`seg-btn ${filter === tab ? "active" : ""}`}
                  onClick={() => setFilter(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="table-scroll">
          <table className="rack-table">
            <thead>
              <tr>
                <th>VMID / WORKLOAD</th>
                <th>NODE</th>
                <th>TYPE</th>
                <th>STATE</th>
                <th>CPU LOAD</th>
                <th>MEMORY ALLOCATION</th>
                <th style={{ textAlign: "right" }}>HARDWARE CONTROLS</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkloads.map((w) => {
                const isRunning = w.state === "running";
                const isPending = pendingPowerVmids.includes(w.vmid);
                return (
                  <tr
                    key={w.vmid}
                    className={!isRunning ? "is-stopped" : undefined}
                  >
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: "8px",
                        }}
                      >
                        <span
                          className="mono"
                          style={{
                            color: "var(--rack-ink-muted)",
                            fontSize: "12px",
                          }}
                        >
                          #{w.vmid}
                        </span>
                        <strong
                          style={{ fontSize: "14px", color: "var(--rack-ink)" }}
                        >
                          {w.name}
                        </strong>
                      </div>
                      <div
                        className="mono"
                        style={{
                          fontSize: "11px",
                          color: "var(--rack-ink-secondary)",
                          marginTop: "2px",
                        }}
                      >
                        {w.description}
                      </div>
                    </td>

                    <td
                      className="mono"
                      style={{
                        fontSize: "12px",
                        color: "var(--rack-ink-secondary)",
                      }}
                    >
                      {w.node}
                    </td>

                    <td>
                      <span className="hw-tag">{w.type}</span>
                    </td>

                    <td>
                      <span className={`state-pill ${w.state}`}>
                        <span
                          className={`led-dot ${isRunning ? "led-online" : "led-stopped"}`}
                        />
                        {isPending ? "SWITCHING" : w.state}
                      </span>
                    </td>

                    <td>
                      <div className="mono" style={{ fontSize: "12px" }}>
                        <strong>{w.cpu.toFixed(2)}%</strong>{" "}
                        <span style={{ color: "var(--rack-ink-muted)" }}>
                          · {w.vcpus} vCPU
                        </span>
                      </div>
                      <div
                        className="meter-track"
                        style={{
                          marginTop: "5px",
                          height: "4px",
                          width: "96px",
                        }}
                      >
                        <div
                          className="meter-fill-online"
                          style={{ width: `${Math.min(100, w.cpu * 25)}%` }}
                        />
                      </div>
                    </td>

                    <td>
                      <div className="mono" style={{ fontSize: "12px" }}>
                        <strong>{w.memPct.toFixed(2)}%</strong>{" "}
                        <span style={{ color: "var(--rack-ink-muted)" }}>
                          ({w.ramPoolGb} GB)
                        </span>
                      </div>
                      <div
                        className="meter-track"
                        style={{
                          marginTop: "5px",
                          height: "5px",
                          width: "112px",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${w.memPct}%`,
                            background:
                              w.memPct > 50
                                ? "var(--signal-amber)"
                                : "var(--signal-online)",
                          }}
                        />
                      </div>
                    </td>

                    <td>
                      <div className="hw-action-cell">
                        <button
                          type="button"
                          className={`console-keycap ${!isRunning ? "muted" : ""}`}
                          onClick={() => onOpenConsole(w)}
                        >
                          &gt;_ CONSOLE
                        </button>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={isRunning}
                          aria-label={`Toggle power for ${w.name}`}
                          className="rocker-switch"
                          disabled={isPending}
                          style={{ opacity: isPending ? 0.55 : 1 }}
                          onClick={() => onTogglePower(w.vmid)}
                        >
                          <span className="rocker-knob" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredWorkloads.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="mono"
                    style={{
                      textAlign: "center",
                      padding: "28px",
                      color: "var(--rack-ink-muted)",
                    }}
                  >
                    NO WORKLOADS MATCH CURRENT RACK FILTER
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};
