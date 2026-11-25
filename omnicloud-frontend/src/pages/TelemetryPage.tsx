import React, { useState } from "react";
import { STORAGE_POOLS } from "../data/hypervisorData";
import { HostTelemetrySnapshot, LxcWorkload } from "../types/omnicloud";

interface TelemetryPageProps {
  workloads: LxcWorkload[];
  telemetry?: HostTelemetrySnapshot | null;
}

export const TelemetryPage: React.FC<TelemetryPageProps> = ({
  workloads,
  telemetry,
}) => {
  const [windowSpan, setWindowSpan] = useState<"1H" | "6H" | "24H">("1H");

  const fallbackRamGb = workloads
    .filter((w) => w.state === "running")
    .reduce((acc, w) => acc + (w.ramPoolGb * w.memPct) / 100, 3.8);

  const cpuPct = telemetry ? telemetry.cpu.usage_pct : 19.2;
  const cpuCores = telemetry ? telemetry.cpu.cores : 12;
  const loadAvgStr = telemetry
    ? telemetry.cpu.loadavg.map((n) => Number(n).toFixed(2)).join(", ")
    : "0.42, 0.38, 0.31";
  const ioWaitPct = telemetry ? telemetry.cpu.iowait_pct : 0.14;

  const memUsedGb = telemetry ? telemetry.memory.used_gb : fallbackRamGb;
  const memTotalGb = telemetry ? telemetry.memory.total_gb : 32.0;
  const uptimeStr = telemetry
    ? telemetry.system.uptime_formatted.toUpperCase()
    : "68D 11H 04M";

  const liveHistory = telemetry?.history ?? [];
  const cpuSeries =
    liveHistory.length >= 2
      ? liveHistory.map((pt) => pt.cpu)
      : windowSpan === "1H"
        ? [14, 16, 15, 19, 22, 18, 17, 21, 19, 16, 18, 19.2]
        : windowSpan === "6H"
          ? [11, 13, 18, 26, 24, 19, 15, 14, 17, 20, 18, 19.2]
          : [9, 12, 15, 28, 31, 22, 17, 14, 16, 21, 19, 19.2];

  const ramSeries =
    liveHistory.length >= 2
      ? liveHistory.map((pt) => pt.memory)
      : windowSpan === "1H"
        ? [44, 45, 45, 46, 46, 46, 47, 46, 46, 46, 46, 46.2]
        : windowSpan === "6H"
          ? [41, 42, 43, 45, 46, 46, 45, 45, 46, 46, 46, 46.2]
          : [39, 40, 42, 44, 47, 46, 45, 45, 46, 46, 46, 46.2];

  const displayPools =
    telemetry && telemetry.storage.pools.length > 0
      ? telemetry.storage.pools.map((p) => ({
          id: p.name,
          mount: p.category,
          filesystem: p.type.toUpperCase(),
          device: `${p.free_gb.toFixed(1)} GB FREE`,
          usedGb: p.used_gb,
          totalGb: Math.max(p.total_gb, 1),
          tempC: 36,
          smartStatus: p.active ? ("PASSED" as const) : ("DEGRADED" as const),
        }))
      : STORAGE_POOLS;

  const toPolyline = (values: number[]) =>
    values
      .map((val, i) => {
        const x = 40 + (i / Math.max(values.length - 1, 1)) * 720;
        const y = 170 - (Math.min(100, Math.max(0, val)) / 100) * 140;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <>
      <section className="kpi-grid-3" aria-label="Bare-Metal Host Telemetry">
        <div className="rack-card">
          <div className="kpi-top-row">
            <span className="micro-label">
              CPU UTILIZATION ({cpuCores}-CORE)
            </span>
            <span className="hw-tag">SMP 6.8.12</span>
          </div>
          <div className="kpi-hero-row">
            <span className="kpi-hero-value">{cpuPct.toFixed(1)}%</span>
            <span className="micro-label">
              IDLE {(100 - cpuPct).toFixed(1)}%
            </span>
          </div>
          <div className="meter-track">
            <div
              className="meter-fill-online"
              style={{ width: `${Math.min(100, cpuPct)}%` }}
            />
          </div>
          <div
            className="kpi-foot-row"
            style={{ color: "var(--rack-ink-secondary)" }}
          >
            <span>LOAD AVG: {loadAvgStr}</span>
            <span>I/O WAIT: {ioWaitPct.toFixed(2)}%</span>
          </div>
        </div>

        <div className="rack-card">
          <div className="kpi-top-row">
            <span className="micro-label">HOST ECC MEMORY &amp; ZFS ARC</span>
            <span className="hw-tag">{memTotalGb.toFixed(1)} GB DDR4</span>
          </div>
          <div className="kpi-hero-row">
            <span className="kpi-hero-value">{memUsedGb.toFixed(1)} GB</span>
            <span className="micro-label">/ {memTotalGb.toFixed(1)} GB</span>
          </div>
          <div className="meter-track">
            <div
              className="meter-fill-online"
              style={{
                width: `${Math.min(100, (memUsedGb / Math.max(memTotalGb, 1)) * 100)}%`,
              }}
            />
            <div className="meter-fill-ink" style={{ width: "12.5%" }} />
          </div>
          <div
            className="kpi-foot-row"
            style={{ color: "var(--rack-ink-secondary)" }}
          >
            <span>GUESTS: {Math.max(0, memUsedGb - 3.8).toFixed(1)} GB</span>
            <span>ZFS ARC: 3.8 GB PINNED</span>
          </div>
        </div>

        <div className="rack-card">
          <div className="kpi-top-row">
            <span className="micro-label">THERMAL &amp; CONTINUOUS UPTIME</span>
            <span className="hw-tag">IPMI / SENSORS</span>
          </div>
          <div className="kpi-hero-row">
            <span className="kpi-hero-value">44°C</span>
            <span className="micro-label">PACKAGE</span>
          </div>
          <div className="meter-track">
            <div className="meter-fill-online" style={{ width: "44%" }} />
          </div>
          <div
            className="kpi-foot-row"
            style={{ color: "var(--signal-online)" }}
          >
            <span>UPTIME: {uptimeStr}</span>
            <span>FAN: 1,420 RPM</span>
          </div>
        </div>
      </section>

      <section className="module-panel" aria-label="Host Telemetry Waveform">
        <div className="module-header">
          <div>
            <div className="module-title-row">
              <h2 className="module-title">Host Resource Oscilloscope</h2>
              <span className="hw-tag">
                {liveHistory.length >= 2
                  ? "LIVE RRD STREAM"
                  : "SAMPLING 1000MS"}
              </span>
            </div>
            <p className="module-subtitle">
              Real-time hypervisor compute and ECC memory allocation curves
            </p>
          </div>

          <div className="segmented-group">
            {(["1H", "6H", "24H"] as const).map((span) => (
              <button
                key={span}
                type="button"
                className={`seg-btn ${windowSpan === span ? "active" : ""}`}
                onClick={() => setWindowSpan(span)}
              >
                {span}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: "18px 20px" }}>
          <div
            style={{
              background: "var(--rack-well-dark)",
              border: "1px solid var(--rack-border)",
              borderRadius: "2px",
              padding: "14px",
            }}
          >
            <div
              className="mono"
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "11px",
                color: "#94A3B8",
                marginBottom: "8px",
              }}
            >
              <span>
                <span style={{ color: "#22C55E" }}>■ CPU UTILIZATION (%)</span>{" "}
                · <span style={{ color: "#E03C1F" }}>■ ECC MEMORY (%)</span>
              </span>
              <span>WINDOW: {windowSpan}</span>
            </div>

            <svg
              viewBox="0 0 780 190"
              style={{ width: "100%", height: "190px", display: "block" }}
              role="img"
              aria-label="CPU and Memory Utilization Chart"
            >
              {[0, 25, 50, 75, 100].map((pct) => {
                const y = 170 - (pct / 100) * 140;
                return (
                  <g key={pct}>
                    <line
                      x1="40"
                      y1={y}
                      x2="760"
                      y2={y}
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="1"
                    />
                    <text
                      x="6"
                      y={y + 4}
                      fill="#64748B"
                      fontSize="10"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {pct}%
                    </text>
                  </g>
                );
              })}

              <polyline
                fill="none"
                stroke="#E03C1F"
                strokeWidth="2"
                points={toPolyline(ramSeries)}
              />
              <polyline
                fill="none"
                stroke="#22C55E"
                strokeWidth="2"
                points={toPolyline(cpuSeries)}
              />
            </svg>
          </div>
        </div>
      </section>

      <section className="module-panel" aria-label="Storage Pool Hardware Rack">
        <div className="module-header">
          <div>
            <div className="module-title-row">
              <h2 className="module-title">Storage Pool Hardware Rack</h2>
              <span className="hw-tag">{displayPools.length} POOLS ONLINE</span>
            </div>
            <p className="module-subtitle">
              Separated NVMe OS tier and thin-provisioned ZFS bulk datasets
            </p>
          </div>
        </div>

        <div className="table-scroll">
          <table className="rack-table">
            <thead>
              <tr>
                <th>DATASET / POOL</th>
                <th>FILESYSTEM</th>
                <th>BLOCK DEVICE</th>
                <th>CAPACITY ALLOCATION</th>
                <th>TEMP</th>
                <th>SMART HEALTH</th>
              </tr>
            </thead>
            <tbody>
              {displayPools.map((pool) => {
                const pct = Math.round((pool.usedGb / pool.totalGb) * 100);
                return (
                  <tr key={pool.id}>
                    <td>
                      <strong className="mono">{pool.id}</strong>
                      <div
                        className="mono"
                        style={{
                          fontSize: "11px",
                          color: "var(--rack-ink-secondary)",
                        }}
                      >
                        {pool.mount}
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: "12px" }}>
                      {pool.filesystem}
                    </td>
                    <td
                      className="mono"
                      style={{
                        fontSize: "12px",
                        color: "var(--rack-ink-secondary)",
                      }}
                    >
                      {pool.device}
                    </td>
                    <td>
                      <div className="mono" style={{ fontSize: "12px" }}>
                        <strong>{pct}%</strong> ({pool.usedGb} / {pool.totalGb}{" "}
                        GB)
                      </div>
                      <div
                        className="meter-track"
                        style={{
                          width: "160px",
                          height: "5px",
                          marginTop: "5px",
                        }}
                      >
                        <div
                          className="meter-fill-online"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: "12px" }}>
                      {pool.tempC}°C
                    </td>
                    <td>
                      <span className="state-pill running">
                        <span className="led-dot led-online" />
                        {pool.smartStatus}
                      </span>
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
