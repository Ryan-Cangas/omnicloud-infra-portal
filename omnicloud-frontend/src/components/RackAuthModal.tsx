import React, { useState } from "react";
import { CornerScrews } from "./CornerScrews";
import { AuthUser } from "../types/omnicloud";
import { loginOperator } from "../services/OmnicloudApi";

interface RackAuthModalProps {
  onAuthenticated: (user: AuthUser) => void;
  onContinueOffline?: () => void;
}

export const RackAuthModal: React.FC<RackAuthModalProps> = ({
  onAuthenticated,
  onContinueOffline,
}) => {
  const [username, setUsername] = useState("admin-01");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const { user } = await loginOperator(username.trim(), password, mfaCode);
      onAuthenticated(user);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Authentication failed.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="tty-backdrop"
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "16px",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="OmniCloud Control Plane Authentication"
    >
      <div
        className="rack-header-plate"
        style={{ width: "100%", maxWidth: "460px", margin: 0 }}
      >
        <CornerScrews />
        <div className="rack-serial-bar">
          <span>UNIT 1U // JWT CONTROL PLANE GATE</span>
          <span>PORT 8443 · TOTP</span>
        </div>

        <div style={{ padding: "20px 22px 22px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <div className="rack-monogram" aria-hidden="true">
              OC
            </div>
            <div>
              <h2 className="rack-title" style={{ fontSize: "17px" }}>
                OPERATOR AUTHENTICATION
              </h2>
              <div className="rack-submeta">
                PVE-SERVER · FASTAPI JWT + MICROSOFT AUTHENTICATOR
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <div>
              <label
                className="micro-label"
                htmlFor="rack-auth-user"
                style={{ display: "block", marginBottom: "5px" }}
              >
                OPERATOR USERNAME
              </label>
              <input
                id="rack-auth-user"
                type="text"
                className="rack-input"
                style={{ width: "100%" }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label
                className="micro-label"
                htmlFor="rack-auth-pass"
                style={{ display: "block", marginBottom: "5px" }}
              >
                PASSPHRASE
              </label>
              <input
                id="rack-auth-pass"
                type="password"
                className="rack-input"
                style={{ width: "100%" }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••••••"
                required
              />
            </div>

            <div>
              <label
                className="micro-label"
                htmlFor="rack-auth-mfa"
                style={{ display: "block", marginBottom: "5px" }}
              >
                TOTP MFA CODE (SUPERADMIN REQUIRED)
              </label>
              <input
                id="rack-auth-mfa"
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="rack-input"
                style={{ width: "100%", letterSpacing: "0.24em" }}
                value={mfaCode}
                onChange={(e) =>
                  setMfaCode(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="000000"
              />
            </div>

            {errorMsg && (
              <div
                className="mono"
                style={{
                  padding: "8px 10px",
                  fontSize: "11.5px",
                  background: "rgba(224, 60, 31, 0.12)",
                  border: "1px solid var(--signal-vermilion)",
                  color: "var(--signal-vermilion)",
                  borderRadius: "2px",
                }}
              >
                [AUTH-ERR] {errorMsg}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "8px",
                marginTop: "6px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="submit"
                className="console-keycap"
                style={{
                  flex: 1,
                  minHeight: "34px",
                  background: "var(--signal-vermilion)",
                  borderColor: "var(--signal-vermilion)",
                  color: "#FFFFFF",
                }}
                disabled={submitting}
              >
                {submitting ? "VERIFYING JWT..." : "ISSUE SESSION TOKEN ↵"}
              </button>

              {onContinueOffline && (
                <button
                  type="button"
                  className="theme-switch-btn"
                  onClick={onContinueOffline}
                >
                  PREVIEW LOCAL CACHE
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
