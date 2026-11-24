import React, { useEffect, useState } from "react";
import { INITIAL_WORKLOADS } from "./data/hypervisorData";
import { LxcWorkload, NavTabId } from "./types/omnicloud";
import { RackHeader } from "./components/RackHeader";
import { CornerScrews } from "./components/CornerScrews";
import { ConsoleDrawer } from "./components/ConsoleDrawer";
import { OverviewPage } from "./pages/OverviewPage";
import { TelemetryPage } from "./pages/TelemetryPage";
import { SdnMeshPage } from "./pages/SdnMeshPage";
import { ServiceCatalogPage } from "./pages/ServiceCatalogPage";
import { SecuritySiemPage } from "./pages/SecuritySiemPage";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTabId>("overview");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [workloads, setWorkloads] = useState<LxcWorkload[]>(INITIAL_WORKLOADS);
  const [consoleTargetVmid, setConsoleTargetVmid] = useState<number | null>(
    null,
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const handleTogglePower = (vmid: number) => {
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
      />

      <main>
        {activeTab === "overview" && (
          <OverviewPage
            workloads={workloads}
            onTogglePower={handleTogglePower}
            onOpenConsole={(w) => setConsoleTargetVmid(w.vmid)}
          />
        )}

        {activeTab === "telemetry" && <TelemetryPage workloads={workloads} />}

        {activeTab === "sdn" && (
          <SdnMeshPage
            workloads={workloads}
            onOpenConsole={(w) => setConsoleTargetVmid(w.vmid)}
          />
        )}

        {activeTab === "catalog" && (
          <ServiceCatalogPage
            workloads={workloads}
            onOpenConsole={(w) => setConsoleTargetVmid(w.vmid)}
          />
        )}

        {activeTab === "security" && <SecuritySiemPage />}
      </main>

      <footer className="chassis-footer">
        <CornerScrews />
        <span>
          OMNICLOUD RACK UNIT 01 · TOTAL PROVISIONED MEMORY:{" "}
          {totalRamGb.toFixed(1)} GB
        </span>
        <span>TAILNET MESH: 100.117.21.82</span>
      </footer>

      <ConsoleDrawer
        workload={activeConsoleWorkload}
        onClose={() => setConsoleTargetVmid(null)}
        onTogglePower={handleTogglePower}
      />
    </div>
  );
};

export default App;
