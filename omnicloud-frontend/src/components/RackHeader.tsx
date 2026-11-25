import React from "react";
import { CornerScrews } from "./CornerScrews";
import { AuthUser, NavTabId } from "../types/omnicloud";

interface RackHeaderProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  onlineCount: number;
  totalCount: number;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  user: AuthUser | null;
  apiOnline: boolean;
  onOpenAuth: () => void;
  onLogout: () => void;
}

const CHANNELS: { id: NavTabId; index: string; label: string }[] = [
  { id: "overview", index: "01", label: "OVERVIEW" },
  { id: "telemetry", index: "02", label: "HOST TELEMETRY" },
  { id: "sdn", index: "03", label: "SDN TAILSCALE MESH" },
  { id: "catalog", index: "04", label: "SERVICE CATALOG" },
  { id: "security", index: "05", label: "SECURITY & SIEM" },
  { id: "provision", index: "06", label: "IAC DEPLOY" },
];

export const RackHeader: React.FC<RackHeaderProps> = ({
  activeTab,
  onSelectTab,
  onlineCount,
  totalCount,
  theme,
  onToggleTheme,
  user,
  apiOnline,
  onOpenAuth,
  onLogout,
}) => {
  const displayName = (user?.name || "OPERATOR").toUpperCase();
  const displayRole = (user?.role || "GUEST").toUpperCase();

  return (
    <header>
      <div className="rack-header-plate">
        <CornerScrews />
        <div className="rack-serial-bar">
          <span>UNIT 1U // ANODIZED RACK CHASSIS · SERIES 01</span>
          <span>
            {apiOnline ? "API LINK: LIVE (8443)" : "API LINK: STANDALONE CACHE"}
          </span>
        </div>

        <div className="rack-identity-row">
          <div className="rack-brand-cluster">
            <div className="rack-monogram" aria-hidden="true">
              OC
            </div>
            <div>
              <div className="rack-title-line">
                <h1 className="rack-title">OMNICLOUD // RACK UNIT 01</h1>
                {user ? (
                  <button
                    type="button"
                    className="jwt-badge"
                    onClick={onLogout}
                    title="Click to sign out and revoke local JWT"
                    style={{ cursor: "pointer" }}
                  >
                    <span className="led-dot led-online" />
                    JWT VALID - {displayName}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="jwt-badge"
                    onClick={onOpenAuth}
                    style={{
                      cursor: "pointer",
                      borderColor: "var(--signal-vermilion)",
                      color: "var(--signal-vermilion)",
                      background: "rgba(224, 60, 31, 0.08)",
                    }}
                  >
                    <span className="led-dot led-vermilion" />
                    UNAUTHENTICATED · SIGN IN
                  </button>
                )}
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
                {displayRole}
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
