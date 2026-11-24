import React, { useState } from "react";
import { INITIAL_BANNED_IPS, INITIAL_SIEM_LOGS } from "../data/hypervisorData";
import { Fail2BanEntry } from "../types/omnicloud";

export const SecuritySiemPage: React.FC = () => {
  const [bans, setBans] = useState<Fail2BanEntry[]>(INITIAL_BANNED_IPS);
  const [logs, setLogs] = useState(INITIAL_SIEM_LOGS);

  const handleUnban = (entry: Fail2BanEntry) => {
    setBans((prev) => prev.filter((b) => b.id !== entry.id));
    setLogs((prev) => [
      {
        id: `EVT-${Math.floor(9042 + Math.random() * 900)}`,
        timestamp: new Date().toTimeString().slice(0, 8) + ".104",
        level: "INFO",
        daemon: `fail2ban.${entry.jail}`,
        sourceIp: entry.ip,
        message: `Manual operator unban executed by RYAN CANGAS (SUPERADMIN)`,
      },
      ...prev,
    ]);
  };

  return (
    <>
      <section className="kpi-grid-3" aria-label="Security and SIEM Summary">
        <div className="rack-card">
          <div className="kpi-top-row">
            <span className="micro-label">ACTIVE CRITICAL ALERTS</span>
            <span className="hw-tag">WAZUH-108</span>
          </div>
          <div className="kpi-hero-row">
            <span
              className="kpi-hero-value"
              style={{ color: "var(--signal-online)" }}
            >
              0
            </span>
            <span className="micro-label">CRITICAL · 2 WARN</span>
          </div>
          <div
            className="kpi-foot-row"
            style={{ color: "var(--signal-online)" }}
          >
            <span>✓ Integrity baseline verified across 9 guests</span>
          </div>
        </div>

        <div className="rack-card">
          <div className="kpi-top-row">
            <span className="micro-label">FAIL2BAN ACTIVE JAILS</span>
            <span className="hw-tag">NFTABLES</span>
          </div>
          <div className="kpi-hero-row">
            <span className="kpi-hero-value">{bans.length}</span>
            <span className="micro-label">BANNED OFFENDERS</span>
          </div>
          <div
            className="kpi-foot-row"
            style={{ color: "var(--rack-ink-secondary)" }}
          >
            <span>JAILS: sshd · nginx-http-auth · recidive</span>
          </div>
        </div>

        <div className="rack-card">
          <div className="kpi-top-row">
            <span className="micro-label">JWT CONTROL PLANE SESSIONS</span>
            <span className="hw-tag">RS256</span>
          </div>
          <div className="kpi-hero-row">
            <span className="kpi-hero-value">1</span>
            <span className="micro-label">ACTIVE OPERATOR</span>
          </div>
          <div
            className="kpi-foot-row"
            style={{ color: "var(--rack-ink-secondary)" }}
          >
            <span>RYAN CANGAS · BOUND TO 100.117.21.82</span>
          </div>
        </div>
      </section>

      <section className="module-panel" aria-label="Live Security Event Stream">
        <div className="module-header">
          <div>
            <div className="module-title-row">
              <h2 className="module-title">
                Live Security &amp; Audit Event Stream
              </h2>
              <span className="hw-tag">SYSLOG / AUTH.LOG</span>
            </div>
            <p className="module-subtitle">
              Real-time authentication, DNS sinkhole, and perimeter firewall
              telemetry
            </p>
          </div>
        </div>

        <div style={{ padding: "16px 20px" }}>
          <div
            className="mono"
            style={{
              background: "var(--rack-well-dark)",
              color: "#E2E8F0",
              border: "1px solid var(--rack-border)",
              borderRadius: "2px",
              padding: "14px 16px",
              fontSize: "12px",
              lineHeight: 1.7,
              maxHeight: "240px",
              overflowY: "auto",
            }}
          >
            {logs.map((item) => (
              <div
                key={item.id}
                style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}
              >
                <span style={{ color: "#64748B" }}>{item.timestamp}</span>
                <span
                  style={{
                    color: item.level === "WARN" ? "#FBBF24" : "#22C55E",
                    fontWeight: 600,
                    minWidth: "46px",
                  }}
                >
                  [{item.level}]
                </span>
                <span style={{ color: "#94A3B8", minWidth: "130px" }}>
                  {item.daemon}
                </span>
                <span style={{ color: "#F8FAFC" }}>{item.message}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="module-panel" aria-label="Fail2Ban Active IP Bans">
        <div className="module-header">
          <div>
            <div className="module-title-row">
              <h2 className="module-title">Fail2Ban Jail &amp; IP Ban Table</h2>
              <span className="hw-tag">{bans.length} ENFORCED</span>
            </div>
            <p className="module-subtitle">
              Offending external probes dropped at perimeter interface
            </p>
          </div>
        </div>

        <div className="table-scroll">
          <table className="rack-table">
            <thead>
              <tr>
                <th>OFFENDING IP</th>
                <th>JAIL</th>
                <th>ORIGIN</th>
                <th>FAILED ATTEMPTS</th>
                <th>TTL REMAINING</th>
                <th style={{ textAlign: "right" }}>OPERATOR ACTION</th>
              </tr>
            </thead>
            <tbody>
              {bans.map((b) => (
                <tr key={b.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    {b.ip}
                  </td>
                  <td>
                    <span className="hw-tag">{b.jail}</span>
                  </td>
                  <td className="mono" style={{ fontSize: "12px" }}>
                    {b.country}
                  </td>
                  <td className="mono" style={{ fontSize: "12px" }}>
                    {b.attempts}
                  </td>
                  <td
                    className="mono"
                    style={{
                      fontSize: "12px",
                      color: "var(--rack-ink-secondary)",
                    }}
                  >
                    {b.remaining}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className="console-keycap muted"
                      onClick={() => handleUnban(b)}
                    >
                      UNBAN IP
                    </button>
                  </td>
                </tr>
              ))}
              {bans.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="mono"
                    style={{
                      textAlign: "center",
                      padding: "24px",
                      color: "var(--rack-ink-muted)",
                    }}
                  >
                    NO ACTIVE FAIL2BAN ENTRIES IN JAIL
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
