import React from "react";
import { CornerScrews } from "./CornerScrews";
import { NavTabId } from "../types/omnicloud";

interface RackHeaderProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  onlineCount: number;
  totalCount: number;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

const CHANNELS: { id: NavTabId; index: string; label: string }[] = [
  { id: "overview", index: "01", label: "OVERVIEW" },
  { id: "telemetry", index: "02", label: "HOST TELEMETRY" },
  { id: "sdn", index: "03", label: "SDN TAILSCALE MESH" },
  { id: "catalog", index: "04", label: "SERVICE CATALOG" },
  { id: "security", index: "05", label: "SECURITY & SIEM" },
];

export const RackHeader: React.FC<RackHeaderProps> = ({
  activeTab,
  onSelectTab,
  onlineCount,
  totalCount,
  theme,
  onToggleTheme,
}) => {
  return (
    <header>
      <div className="rack-header-plate">
        <CornerScrews />
        <div className="rack-serial-bar">
          <span>UNIT 1U // ANODIZED RACK CHASSIS · SERIES 01</span>
          <span>REV 6.8.12-43</span>
        </div>

        <div className="rack-identity-row">
          <div className="rack-brand-cluster">
            <div className="rack-monogram" aria-hidden="true">
              OC
            </div>
            <div>
              <div className="rack-title-line">
                <h1 className="rack-title">OMNICLOUD // RACK UNIT 01</h1>
                <span className="jwt-badge">
                  <span className="led-dot led-online" />
                  JWT VALID - RYAN CANGAS
                </span>
              </div>
              <div className="rack-submeta">
                PVE-SERVER · KERNEL 6.8.12-43-PVE · TAILNET 100.117.21.82
              </div>
            </div>
          </div>

          <div className="rack-readout-group">
            <div className="rack-readout-box">
              <div className="rack-readout-label">GUESTS ONLINE</div>
              <div className="rack-readout-val">
                <span style={{ color: "var(--signal-online)" }}>
                  {onlineCount}
                </span>{" "}
                / {totalCount} ACTIVE
              </div>
            </div>

            <div className="rack-readout-box">
              <div className="rack-readout-label">ROLE / ACCESS</div>
              <div
                className="rack-readout-val"
                style={{ color: "var(--signal-vermilion)" }}
              >
                SUPERADMIN
              </div>
            </div>

            <button
              type="button"
              className="theme-switch-btn"
              onClick={onToggleTheme}
              aria-label="Toggle Light and Dark Chassis Mode"
            >
              <span
                className={`led-dot ${theme === "dark" ? "led-vermilion" : "led-online"}`}
              />
              {theme === "light" ? "PUTTY // LIGHT" : "OBSIDIAN // DARK"}
            </button>
          </div>
        </div>
      </div>

      <nav className="channel-strip" aria-label="OmniCloud Control Channels">
        {CHANNELS.map((ch) => {
          const isActive = activeTab === ch.id;
          return (
            <button
              key={ch.id}
              type="button"
              className={`channel-btn ${isActive ? "active" : ""}`}
              onClick={() => onSelectTab(ch.id)}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="channel-index">{ch.index}</span>
              <span>{ch.label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
};
