import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { INITIAL_WORKLOADS } from "./data/hypervisorData";
import {
  AuthUser,
  HostTelemetrySnapshot,
  LxcWorkload,
  NavTabId,
  SiemAlert,
  TailscaleMeshResponse,
} from "./types/omnicloud";
import { RackHeader } from "./components/RackHeader";
import { CornerScrews } from "./components/CornerScrews";
import { RackAuthModal } from "./components/RackAuthModal";
import { OverviewPage } from "./pages/OverviewPage";
import { TelemetryPage } from "./pages/TelemetryPage";
import { SdnMeshPage } from "./pages/SdnMeshPage";
import { ServiceCatalogPage } from "./pages/ServiceCatalogPage";
import { SecuritySiemPage } from "./pages/SecuritySiemPage";
import { ProvisioningPage } from "./pages/ProvisioningPage";
import {
  ApiAuthError,
  controlWorkloadPower,
  fetchClusterWorkloads,
  fetchCurrentUser,
  fetchHostTelemetry,
  fetchSecurityAlerts,
  fetchTailscaleMesh,
  getStoredToken,
  setStoredToken,
} from "./services/OmnicloudApi";

const ConsoleDrawer = lazy(() =>
  import("./components/ConsoleDrawer").then((m) => ({
    default: m.ConsoleDrawer,
  })),
);

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTabId>("overview");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [apiOnline, setApiOnline] = useState<boolean>(false);

  const [workloads, setWorkloads] = useState<LxcWorkload[]>(INITIAL_WORKLOADS);
  const [telemetry, setTelemetry] = useState<HostTelemetrySnapshot | null>(
    null,
  );
  const [meshData, setMeshData] = useState<TailscaleMeshResponse | null>(null);
  const [liveAlerts, setLiveAlerts] = useState<SiemAlert[]>([]);
  const [pendingPowerVmids, setPendingPowerVmids] = useState<number[]>([]);
  const [consoleTargetVmid, setConsoleTargetVmid] = useState<number | null>(
    null,
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const syncControlPlane = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setApiOnline(false);
      return;
    }

    try {
      const [me, cluster, hostStats, mesh, alerts] = await Promise.all([
        fetchCurrentUser(),
        fetchClusterWorkloads(),
        fetchHostTelemetry().catch(() => null),
        fetchTailscaleMesh().catch(() => null),
        fetchSecurityAlerts("All Nodes", "ALL", 40).catch(() => []),
      ]);

      setUser(me);
      if (cluster.length > 0) {
        setWorkloads(cluster);
      }
      if (hostStats) setTelemetry(hostStats);
      if (mesh) setMeshData(mesh);
      if (alerts.length > 0) setLiveAlerts(alerts);
      setApiOnline(true);
    } catch (err) {
      setApiOnline(false);
      if (err instanceof ApiAuthError) {
        setUser(null);
        setAuthModalOpen(true);
      }
    }
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthModalOpen(true);
      return;
    }
    syncControlPlane();

    const timer = window.setInterval(() => {
      if (!document.hidden) {
        syncControlPlane();
      }
    }, 8000);

    const handleVisibilityChange = () => {
      if (!document.hidden && getStoredToken()) {
        syncControlPlane();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncControlPlane]);

  const handleAuthenticated = (authedUser: AuthUser) => {
    setUser(authedUser);
    setAuthModalOpen(false);
    syncControlPlane();
  };

  const handleLogout = () => {
    setStoredToken(null);
    setUser(null);
    setApiOnline(false);
    setAuthModalOpen(true);
  };

  const applyLocalPowerToggle = (vmid: number) => {
    setWorkloads((prev) =>
      prev.map((w) => {
        if (w.vmid !== vmid) return w;
        const nextRunning = w.state === "stopped";
        return {
          ...w,
          state: nextRunning ? "running" : "stopped",
          cpu: nextRunning
            ? Number((0.18 + (vmid % 7) * 0.09).toFixed(2))
            : 0.0,
          memPct: nextRunning
            ? Number((18.5 + (vmid % 9) * 3.4).toFixed(2))
            : 0.0,
          rttMs: nextRunning
            ? Number((0.8 + (vmid % 5) * 0.2).toFixed(1))
            : 0.0,
          uptime: nextRunning ? "0d 01h" : "0d 00h",
        };
      }),
    );
  };

  const handleTogglePower = async (vmid: number) => {
    const target = workloads.find((w) => w.vmid === vmid);
    if (!target) return;

    const action = target.state === "stopped" ? "start" : "shutdown";
    const token = getStoredToken();

    if (!token) {
      applyLocalPowerToggle(vmid);
      return;
    }

    setPendingPowerVmids((prev) => [...prev, vmid]);
    try {
      await controlWorkloadPower(target.node, target.type, vmid, action);
      applyLocalPowerToggle(vmid);
      window.setTimeout(syncControlPlane, 2200);
    } catch (err) {
      if (err instanceof ApiAuthError) {
        setUser(null);
        setAuthModalOpen(true);
      } else {
        applyLocalPowerToggle(vmid);
      }
    } finally {
      setPendingPowerVmids((prev) => prev.filter((id) => id !== vmid));
    }
  };

  const onlineCount = workloads.filter((w) => w.state === "running").length;
  const totalRamGb = workloads.reduce((acc, w) => acc + w.ramPoolGb, 0);
  const activeConsoleWorkload =
    workloads.find((w) => w.vmid === consoleTargetVmid) || null;

  return (
    <div className="rack-shell">
      <RackHeader
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onlineCount={onlineCount}
        totalCount={workloads.length}
        theme={theme}
        onToggleTheme={() =>
          setTheme((t) => (t === "light" ? "dark" : "light"))
        }
        user={user}
        apiOnline={apiOnline}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      <main>
        {activeTab === "overview" && (
          <OverviewPage
            workloads={workloads}
            liveRxKbps={telemetry?.network.rx_rate_kbps}
            liveTxKbps={telemetry?.network.tx_rate_kbps}
            pendingPowerVmids={pendingPowerVmids}
            onTogglePower={handleTogglePower}
            onOpenConsole={(w) => setConsoleTargetVmid(w.vmid)}
          />
        )}

        {activeTab === "telemetry" && (
          <TelemetryPage workloads={workloads} telemetry={telemetry} />
        )}

        {activeTab === "sdn" && (
          <SdnMeshPage
            workloads={workloads}
            meshData={meshData}
            onOpenConsole={(w) => setConsoleTargetVmid(w.vmid)}
          />
        )}

        {activeTab === "catalog" && (
          <ServiceCatalogPage
            workloads={workloads}
            onOpenConsole={(w) => setConsoleTargetVmid(w.vmid)}
          />
        )}

        {activeTab === "security" && (
          <SecuritySiemPage
            liveAlerts={liveAlerts}
            guestCount={workloads.length}
            operatorName={user?.name || "OPERATOR"}
          />
        )}
        {activeTab === "provision" && (
          <ProvisioningPage
            workloads={workloads}
            userRole={user?.role || "Guest"}
            onProvisionComplete={syncControlPlane}
          />
        )}
      </main>

      <footer className="chassis-footer">
        <CornerScrews />
        <span>
          OMNICLOUD RACK UNIT 01 · TOTAL PROVISIONED MEMORY:{" "}
          {totalRamGb.toFixed(1)} GB
        </span>
        <span>TAILNET MESH: 100.117.21.82</span>
      </footer>

      {activeConsoleWorkload && (
        <Suspense fallback={null}>
          <ConsoleDrawer
            workload={activeConsoleWorkload}
            onClose={() => setConsoleTargetVmid(null)}
            onTogglePower={handleTogglePower}
          />
        </Suspense>
      )}

      {authModalOpen && (
        <RackAuthModal
          onAuthenticated={handleAuthenticated}
          onContinueOffline={() => setAuthModalOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
