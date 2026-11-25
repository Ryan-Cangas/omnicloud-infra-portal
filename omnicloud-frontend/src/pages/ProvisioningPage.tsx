import React, { useEffect, useRef, useState } from "react";
import { LxcWorkload } from "../types/omnicloud";
import {
  fetchAnsiblePlaybooks,
  getProvisionWsUrl,
  getStoredToken,
} from "../services/OmnicloudApi";

interface ProvisioningPageProps {
  workloads: LxcWorkload[];
  userRole: string;
  onProvisionComplete: () => void;
}

interface StreamLogEntry {
  id: number;
  type: "status" | "log" | "complete" | "error";
  text: string;
}

const FALLBACK_PLAYBOOKS = [
  "site.yml",
  "docker-engine.yml",
  "wazuh-agent.yml",
  "tailscale-node.yml",
];

export const ProvisioningPage: React.FC<ProvisioningPageProps> = ({
  workloads,
  userRole,
  onProvisionComplete,
}) => {
  // Terraform state
  const [vmid, setVmid] = useState<number>(110);
  const [hostname, setHostname] = useState<string>("worker-lxc-01");
  const [cores, setCores] = useState<number>(2);
  const [memoryMb, setMemoryMb] = useState<number>(2048);

  // Ansible state
  const [playbooks, setPlaybooks] = useState<string[]>(FALLBACK_PLAYBOOKS);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>("site.yml");
  const [targetIp, setTargetIp] = useState<string>("10.10.20.100");
  const [chainAnsibleAfterTf, setChainAnsibleAfterTf] = useState<boolean>(true);

  // Live execution stream state
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [logs, setLogs] = useState<StreamLogEntry[]>([
    {
      id: 1,
      type: "status",
      text: "[IAC-ENGINE] Ready · Terraform + Ansible WebSocket runner bound to /opt/omnicloud/infra",
    },
  ]);

  const wsRef = useRef<WebSocket | null>(null);
  const logViewportRef = useRef<HTMLDivElement | null>(null);
  const isSuperAdmin = userRole === "SuperAdmin";

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    fetchAnsiblePlaybooks()
      .then((list) => {
        if (list.length > 0) {
          setPlaybooks(list);
          setSelectedPlaybook(list[0]);
        }
      })
      .catch(() => {
        // Keep fallback playbook list when offline
      });
  }, []);

  useEffect(() => {
    if (logViewportRef.current) {
      logViewportRef.current.scrollTop = logViewportRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const appendLog = (type: StreamLogEntry["type"], text: string) => {
    setLogs((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), type, text: text.replace(/\n$/, "") },
    ]);
  };

  const runAnsibleStream = (playbook: string, ip: string) => {
    const token = getStoredToken();
    if (!token) {
      appendLog(
        "error",
        "FORBIDDEN: Sign in as SuperAdmin to execute Ansible.",
      );
      setRunningJob(null);
      return;
    }

    setRunningJob(`ANSIBLE (${playbook})`);
    const socket = new WebSocket(getProvisionWsUrl("ansible"));
    wsRef.current = socket;

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          token,
          playbook,
          target_ip: ip.trim(),
        }),
      );
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          type: StreamLogEntry["type"];
          data: string;
        };
        appendLog(msg.type || "log", msg.data);
        if (msg.type === "complete") {
          onProvisionComplete();
        }
      } catch {
        appendLog("log", String(event.data));
      }
    };

    socket.onerror = () => {
      appendLog(
        "error",
        "[WS-ERROR] Ansible WebSocket connection interrupted.",
      );
    };

    socket.onclose = () => {
      setRunningJob(null);
      wsRef.current = null;
    };
  };

  const runTerraformStream = (
    action: "plan" | "apply" | "destroy",
    chainAnsible = false,
  ) => {
    const token = getStoredToken();
    if (!token) {
      appendLog(
        "error",
        "FORBIDDEN: Sign in as SuperAdmin to execute Terraform.",
      );
      return;
    }

    if (wsRef.current) {
      wsRef.current.close();
    }

    setRunningJob(`TERRAFORM ${action.toUpperCase()}`);
    let tfSucceeded = false;

    const socket = new WebSocket(getProvisionWsUrl("terraform"));
    wsRef.current = socket;

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          token,
          action,
          vmid: Number(vmid),
          hostname: hostname.trim(),
          cores: Number(cores),
          memory: Number(memoryMb),
        }),
      );
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          type: StreamLogEntry["type"];
          data: string;
        };
        appendLog(msg.type || "log", msg.data);
        if (
          msg.type === "status" &&
          msg.data.includes("completed successfully")
        ) {
          tfSucceeded = true;
          onProvisionComplete();
        }
      } catch {
        appendLog("log", String(event.data));
      }
    };

    socket.onerror = () => {
      appendLog(
        "error",
        "[WS-ERROR] Terraform WebSocket connection interrupted.",
      );
    };

    socket.onclose = () => {
      wsRef.current = null;
      if (tfSucceeded && chainAnsible && action === "apply") {
        appendLog(
          "status",
          `[PIPELINE] Chaining Ansible playbook '${selectedPlaybook}' -> ${targetIp}...`,
        );
        runAnsibleStream(selectedPlaybook, targetIp);
      } else {
        setRunningJob(null);
      }
    };
  };

  return (
    <>
      <section className="kpi-grid-3" aria-label="IaC Pipeline Status">
        <div className="rack-card">
          <div className="kpi-top-row">
            <span className="micro-label">TERRAFORM STATE ENGINE</span>
            <span className="hw-tag">HCL / PVE</span>
          </div>
          <div className="kpi-hero-row">
            <span className="kpi-hero-value" style={{ fontSize: "24px" }}>
              PROXMOX IAC
            </span>
          </div>
          <div
            className="kpi-foot-row"
            style={{ color: "var(--signal-online)" }}
          >
            <span>● /opt/omnicloud/infra · Live Plan/Apply Stream</span>
          </div>
        </div>

        <div className="rack-card">
          <div className="kpi-top-row">
            <span className="micro-label">ANSIBLE CONFIGURATION</span>
            <span className="hw-tag">SSH / YAML</span>
          </div>
          <div className="kpi-hero-row">
            <span className="kpi-hero-value">{playbooks.length}</span>
            <span className="micro-label">DISCOVERED PLAYBOOKS</span>
          </div>
          <div
            className="kpi-foot-row"
            style={{ color: "var(--rack-ink-secondary)" }}
          >
            <span>ACTIVE TARGET: {targetIp}</span>
          </div>
        </div>

        <div className="rack-card">
          <div className="kpi-top-row">
            <span className="micro-label">EXECUTION GATE</span>
            <span className="hw-tag">RBAC</span>
          </div>
          <div className="kpi-hero-row">
            <span
              className="kpi-hero-value"
              style={{
                fontSize: "24px",
                color: isSuperAdmin
                  ? "var(--signal-online)"
                  : "var(--signal-vermilion)",
              }}
            >
              {runningJob || (isSuperAdmin ? "ARMED" : "LOCKED")}
            </span>
          </div>
          <div
            className="kpi-foot-row"
            style={{ color: "var(--rack-ink-secondary)" }}
          >
            <span>
              {isSuperAdmin
                ? "SuperAdmin JWT Verified for Mutation"
                : "Sign in as SuperAdmin to unlock"}
            </span>
          </div>
        </div>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
          gap: "16px",
          marginTop: "16px",
        }}
      >
        {/* Module 1: One-Click Terraform Provisioning */}
        <section
          className="module-panel"
          style={{ marginTop: 0 }}
          aria-label="Terraform LXC Provisioner"
        >
          <div className="module-header">
            <div>
              <div className="module-title-row">
                <h2 className="module-title">01 // Terraform Provisioner</h2>
                <span className="hw-tag">LXC / QEMU</span>
              </div>
              <p className="module-subtitle">
                Declarative guest allocation on pve-server via HCL variables
              </p>
            </div>
          </div>

          <div
            style={{
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 2fr",
                gap: "10px",
              }}
            >
              <div>
                <label className="micro-label" htmlFor="tf-vmid">
                  VMID (100–9999)
                </label>
                <input
                  id="tf-vmid"
                  type="number"
                  min={100}
                  max={9999}
                  className="rack-input"
                  style={{ width: "100%", minWidth: 0, marginTop: "4px" }}
                  value={vmid}
                  onChange={(e) => setVmid(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="micro-label" htmlFor="tf-host">
                  GUEST HOSTNAME
                </label>
                <input
                  id="tf-host"
                  type="text"
                  className="rack-input"
                  style={{ width: "100%", minWidth: 0, marginTop: "4px" }}
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
              }}
            >
              <div>
                <label className="micro-label" htmlFor="tf-cores">
                  VCPU CORES
                </label>
                <input
                  id="tf-cores"
                  type="number"
                  min={1}
                  max={16}
                  className="rack-input"
                  style={{ width: "100%", minWidth: 0, marginTop: "4px" }}
                  value={cores}
                  onChange={(e) => setCores(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="micro-label" htmlFor="tf-mem">
                  MEMORY POOL (MB)
                </label>
                <input
                  id="tf-mem"
                  type="number"
                  step={256}
                  min={256}
                  max={32768}
                  className="rack-input"
                  style={{ width: "100%", minWidth: 0, marginTop: "4px" }}
                  value={memoryMb}
                  onChange={(e) => setMemoryMb(Number(e.target.value))}
                />
              </div>
            </div>

            <label
              className="mono"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "11.5px",
                color: "var(--rack-ink-secondary)",
                cursor: "pointer",
                marginTop: "2px",
              }}
            >
              <input
                type="checkbox"
                checked={chainAnsibleAfterTf}
                onChange={(e) => setChainAnsibleAfterTf(e.target.checked)}
              />
              Chain selected Ansible playbook automatically after Apply
            </label>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginTop: "6px",
              }}
            >
              <button
                type="button"
                className="theme-switch-btn"
                style={{ minHeight: "32px", flex: 1, justifyContent: "center" }}
                disabled={Boolean(runningJob) || !isSuperAdmin}
                onClick={() => runTerraformStream("plan", false)}
              >
                TERRAFORM PLAN
              </button>

              <button
                type="button"
                className="console-keycap"
                style={{ height: "32px", flex: 1 }}
                disabled={Boolean(runningJob) || !isSuperAdmin}
                onClick={() => runTerraformStream("apply", chainAnsibleAfterTf)}
              >
                {chainAnsibleAfterTf
                  ? "ONE-CLICK DEPLOY ↵"
                  : "TERRAFORM APPLY ↵"}
              </button>

              <button
                type="button"
                className="console-keycap muted"
                style={{ height: "32px" }}
                disabled={Boolean(runningJob) || !isSuperAdmin}
                onClick={() => runTerraformStream("destroy", false)}
              >
                DESTROY
              </button>
            </div>
          </div>
        </section>

        {/* Module 2: One-Click Ansible Playbook Runner */}
        <section
          className="module-panel"
          style={{ marginTop: 0 }}
          aria-label="Ansible Configuration Runner"
        >
          <div className="module-header">
            <div>
              <div className="module-title-row">
                <h2 className="module-title">02 // Ansible Playbook Runner</h2>
                <span className="hw-tag">SITE.YML</span>
              </div>
              <p className="module-subtitle">
                Idempotent post-boot hardening, Docker, and agent provisioning
              </p>
            </div>
          </div>

          <div
            style={{
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div>
              <label className="micro-label" htmlFor="ans-playbook">
                PLAYBOOK FILE (/OPT/OMNICLOUD/INFRA)
              </label>
              <select
                id="ans-playbook"
                className="rack-input"
                style={{ width: "100%", marginTop: "4px" }}
                value={selectedPlaybook}
                onChange={(e) => setSelectedPlaybook(e.target.value)}
              >
                {playbooks.map((pb) => (
                  <option key={pb} value={pb}>
                    {pb}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="micro-label" htmlFor="ans-ip">
                TARGET HOST IP (LAN BRIDGE OR TAILNET)
              </label>
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <input
                  id="ans-ip"
                  type="text"
                  className="rack-input"
                  style={{ flex: 1, minWidth: 0 }}
                  value={targetIp}
                  onChange={(e) => setTargetIp(e.target.value)}
                  placeholder="10.10.20.100"
                />
                <select
                  aria-label="Quick select existing workload IP"
                  className="rack-input"
                  style={{ minWidth: "150px" }}
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setTargetIp(e.target.value);
                  }}
                >
                  <option value="">PICK GUEST...</option>
                  {workloads.map((w) => (
                    <option key={w.vmid} value={w.lanIp}>
                      #{w.vmid} {w.name} ({w.lanIp})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                marginTop: "28px",
              }}
            >
              <button
                type="button"
                className="console-keycap"
                style={{ height: "32px", flex: 1 }}
                disabled={
                  Boolean(runningJob) || !isSuperAdmin || !targetIp.trim()
                }
                onClick={() => runAnsibleStream(selectedPlaybook, targetIp)}
              >
                RUN PLAYBOOK ({selectedPlaybook.toUpperCase()}) ↵
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Live WebSocket Execution Console */}
      <section className="module-panel" aria-label="IaC Live Execution Output">
        <div className="module-header">
          <div>
            <div className="module-title-row">
              <h2 className="module-title">
                Live IaC Subprocess Telemetry Stream
              </h2>
              <span className="hw-tag">
                {runningJob ? `RUNNING: ${runningJob}` : "IDLE"}
              </span>
            </div>
            <p className="module-subtitle">
              Real-time stdout/stderr stream from terraform and ansible-playbook
            </p>
          </div>

          <button
            type="button"
            className="console-keycap muted"
            onClick={() => setLogs([])}
          >
            CLEAR BUFFER
          </button>
        </div>

        <div style={{ padding: "16px 20px" }}>
          <div
            ref={logViewportRef}
            className="mono"
            style={{
              background: "var(--rack-well-dark)",
              color: "#E2E8F0",
              border: "1px solid var(--rack-border)",
              borderRadius: "2px",
              padding: "14px 16px",
              fontSize: "12px",
              lineHeight: 1.65,
              height: "280px",
              overflowY: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {logs.length === 0 ? (
              <span style={{ color: "#64748B" }}>
                Awaiting Terraform or Ansible job dispatch...
              </span>
            ) : (
              logs.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    color:
                      entry.type === "error"
                        ? "#EF4444"
                        : entry.type === "complete"
                          ? "#22C55E"
                          : entry.type === "status"
                            ? "#FBBF24"
                            : "#E2E8F0",
                  }}
                >
                  {entry.text}
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </>
  );
};
