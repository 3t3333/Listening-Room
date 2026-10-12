import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Activity, Send, CheckCircle2, AlertCircle, ShieldAlert, Cpu, HardDrive, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";

interface SystemDiagnostics {
  app_version: string;
  platform: string;
  arch: string;
  os_version: string;
  has_pending_crash_log: boolean;
  crash_log_path: string;
  configured_proxy_url: string | null;
}

export function DiagnosticsTab() {
  const [proxyUrl, setProxyUrl] = useState(() => {
    return localStorage.getItem("listening-room-proxy-url") || (import.meta as any).env?.VITE_DIAGNOSTICS_PROXY_URL || "";
  });
  const [systemInfo, setSystemInfo] = useState<SystemDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [testingPing, setTestingPing] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [userNote, setUserNote] = useState("");

  const refreshSystemInfo = async () => {
    setLoading(true);
    try {
      const info = await invoke<SystemDiagnostics>("get_system_diagnostics", {
        configuredUrl: proxyUrl.trim() || null,
      });
      setSystemInfo(info);
      if (info.configured_proxy_url && !proxyUrl) {
        setProxyUrl(info.configured_proxy_url);
      }
    } catch (err) {
      console.warn("Could not fetch system diagnostics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshSystemInfo();
  }, []);

  const handleUrlChange = (value: string) => {
    setProxyUrl(value);
    localStorage.setItem("listening-room-proxy-url", value.trim());
    if (value.trim()) {
      void invoke("save_diagnostics_url", { proxyUrl: value.trim() }).catch(() => {});
    }
  };

  const handleTriggerTestCrash = async () => {
    if (!proxyUrl.trim()) {
      setStatusMessage({ text: "Please enter your Cloudflare Worker URL first so crash reports can be delivered.", type: "error" });
      return;
    }
    const confirmed = window.confirm(
      "⚠️ INTENTIONAL CRASH TEST\n\n" +
      "This will trigger a real native Rust panic to test the crash sentinel.\n\n" +
      "• Real-time Discord Ping: The panic hook will transmit the crash report directly to your Discord webhook.\n" +
      "• Local Crash Log: The crash report is also written to %LOCALAPPDATA%\\com.listeningroom.player\\logs\\crash.log.\n\n" +
      "Proceed with crash test?"
    );
    if (!confirmed) return;

    try {
      await invoke("save_diagnostics_url", { proxyUrl: proxyUrl.trim() });
      await invoke("trigger_test_crash", { proxyUrl: proxyUrl.trim() });
    } catch (err) {
      console.error("Test crash invoke error:", err);
    }
  };

  const handleTestPing = async () => {
    if (!proxyUrl.trim()) {
      setStatusMessage({ text: "Please enter your Cloudflare Worker URL first.", type: "error" });
      return;
    }

    setTestingPing(true);
    setStatusMessage({ text: "Sending test ping to proxy...", type: "info" });
    try {
      const res = await invoke<{ success: boolean; message: string }>("test_diagnostic_webhook", {
        proxyUrl: proxyUrl.trim(),
      });
      setStatusMessage({
        text: `✅ ${res.message || "Test ping successfully delivered to your Discord channel!"}`,
        type: "success",
      });
    } catch (err) {
      setStatusMessage({
        text: `❌ Test failed: ${String(err)}`,
        type: "error",
      });
    } finally {
      setTestingPing(false);
    }
  };

  const handleSendManualReport = async () => {
    if (!proxyUrl.trim()) {
      setStatusMessage({ text: "Please enter your Cloudflare Worker URL first.", type: "error" });
      return;
    }

    setSendingReport(true);
    setStatusMessage({ text: "Submitting diagnostic report...", type: "info" });
    try {
      const res = await invoke<{ success: boolean; message: string }>("submit_diagnostic_report", {
        request: {
          source: "manual-report",
          errorMessage: userNote.trim() ? "User issue report" : "Manual diagnostics capture",
          errorLocation: "In-App Diagnostics Panel",
          stackTrace: `Diagnostics snapshot:\nOS: ${systemInfo?.os_version || "unknown"}\nApp Version: ${systemInfo?.app_version || "0.2.2"}\nCrash Log Present: ${systemInfo?.has_pending_crash_log}`,
          userNote: userNote.trim() || undefined,
          proxyUrl: proxyUrl.trim(),
        },
      });
      setStatusMessage({
        text: `✅ ${res.message || "Diagnostic report successfully sent to Discord!"}`,
        type: "success",
      });
      setUserNote("");
    } catch (err) {
      setStatusMessage({
        text: `❌ Could not send report: ${String(err)}`,
        type: "error",
      });
    } finally {
      setSendingReport(false);
    }
  };

  return (
    <div className="diagnostics-panel" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", color: "#f3f4f6" }}>
      {/* Overview Card */}
      <div style={{
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "12px",
        padding: "1rem 1.25rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600, fontSize: "0.95rem" }}>
            <Activity size={18} color="#1db954" />
            System & Diagnostics Overview
          </div>
          <button
            onClick={refreshSystemInfo}
            disabled={loading}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.6)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
            }}
            title="Refresh status"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", fontSize: "0.82rem" }}>
          <div style={{ background: "rgba(0, 0, 0, 0.2)", padding: "0.6rem 0.75rem", borderRadius: "8px" }}>
            <div style={{ color: "rgba(255, 255, 255, 0.5)", marginBottom: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
              <Cpu size={13} /> Version
            </div>
            <div style={{ fontWeight: 600, color: "#fff" }}>v{systemInfo?.app_version || "0.2.2"}</div>
          </div>

          <div style={{ background: "rgba(0, 0, 0, 0.2)", padding: "0.6rem 0.75rem", borderRadius: "8px" }}>
            <div style={{ color: "rgba(255, 255, 255, 0.5)", marginBottom: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
              <HardDrive size={13} /> Platform
            </div>
            <div style={{ fontWeight: 600, color: "#fff" }}>{systemInfo?.platform} ({systemInfo?.arch})</div>
          </div>

          <div style={{ background: "rgba(0, 0, 0, 0.2)", padding: "0.6rem 0.75rem", borderRadius: "8px" }}>
            <div style={{ color: "rgba(255, 255, 255, 0.5)", marginBottom: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
              <ShieldAlert size={13} /> Crash Sentinel
            </div>
            <div style={{ fontWeight: 600, color: systemInfo?.has_pending_crash_log ? "#f59e0b" : "#10b981" }}>
              {systemInfo?.has_pending_crash_log ? "Pending Upload" : "All Clear"}
            </div>
          </div>
        </div>
      </div>

      {/* Cloudflare Worker Proxy Endpoint Configuration */}
      <div style={{
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "12px",
        padding: "1rem 1.25rem",
      }}>
        <label style={{ display: "block", fontSize: "0.88rem", fontWeight: 600, marginBottom: "0.4rem" }}>
          Cloudflare Worker Proxy URL
        </label>
        <p style={{ fontSize: "0.78rem", color: "rgba(255, 255, 255, 0.6)", marginBottom: "0.75rem", lineHeight: 1.4 }}>
          All diagnostics are dispatched to your serverless Cloudflare Worker proxy, which forwards formatted embeds to Discord while keeping your webhook secret.
        </p>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="url"
            value={proxyUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://listening-room-diagnostics.<subdomain>.workers.dev"
            style={{
              flex: 1,
              background: "rgba(0, 0, 0, 0.35)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "8px",
              padding: "0.55rem 0.75rem",
              color: "#fff",
              fontSize: "0.85rem",
              fontFamily: "monospace",
              outline: "none",
            }}
          />
          <Button
            onClick={handleTestPing}
            disabled={testingPing || !proxyUrl.trim()}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#fff",
              fontSize: "0.82rem",
              whiteSpace: "nowrap",
              padding: "0 1rem",
            }}
          >
            {testingPing ? "Pinging..." : "Test Ping"}
          </Button>
        </div>
      </div>

      {/* Diagnostics Verification (Two Levels) */}
      <div style={{
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "12px",
        padding: "1rem 1.25rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600, fontSize: "0.88rem", marginBottom: "0.35rem" }}>
          <ShieldAlert size={16} color="#f59e0b" />
          Diagnostics Verification (Two Levels)
        </div>
        <p style={{ fontSize: "0.78rem", color: "rgba(255, 255, 255, 0.6)", marginBottom: "0.9rem", lineHeight: 1.4 }}>
          Verify your setup using either a non-destructive test ping or an intentional native panic test.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
          {/* Level 1: Safe Test Ping */}
          <div style={{
            background: "rgba(0, 0, 0, 0.25)",
            padding: "0.85rem",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#34d399", marginBottom: "0.25rem" }}>
                Level 1: Safe Ping
              </div>
              <div style={{ fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.6)", marginBottom: "0.85rem", lineHeight: 1.35 }}>
                Sends a green test notification to Discord without closing or interrupting the app.
              </div>
            </div>
            <Button
              onClick={handleTestPing}
              disabled={testingPing || !proxyUrl.trim()}
              style={{
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#34d399",
                fontSize: "0.8rem",
                width: "100%",
              }}
            >
              {testingPing ? "Pinging Discord..." : "Send Safe Ping"}
            </Button>
          </div>

          {/* Level 2: Intentional Crash Simulation */}
          <div style={{
            background: "rgba(0, 0, 0, 0.25)",
            padding: "0.85rem",
            borderRadius: "8px",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#f87171", marginBottom: "0.25rem" }}>
                Level 2: Simulate Fatal Crash
              </div>
              <div style={{ fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.6)", marginBottom: "0.85rem", lineHeight: 1.35 }}>
                Triggers an intentional Rust panic. Upon reopening the app, the backtrace is delivered to Discord.
              </div>
            </div>
            <Button
              onClick={handleTriggerTestCrash}
              disabled={!proxyUrl.trim()}
              style={{
                background: "rgba(239, 68, 68, 0.18)",
                border: "1px solid rgba(239, 68, 68, 0.35)",
                color: "#f87171",
                fontSize: "0.8rem",
                width: "100%",
              }}
            >
              Simulate Fatal Crash (Test)
            </Button>
          </div>
        </div>
      </div>

      {/* Network & Setup Troubleshooting Tip */}
      <div style={{
        background: "rgba(30, 58, 138, 0.15)",
        border: "1px solid rgba(59, 130, 246, 0.25)",
        borderRadius: "10px",
        padding: "0.85rem 1rem",
        fontSize: "0.78rem",
        lineHeight: 1.45,
        color: "rgba(255, 255, 255, 0.8)",
      }}>
        <div style={{ fontWeight: 600, color: "#60a5fa", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          💡 Spotify Connect Tip
        </div>
        Listening Room functions as a Spotify Connect speaker. Ensure your Spotify account has <strong>Spotify Premium</strong> and your Windows network profile is set to <strong>Private Network</strong> so other devices can discover Listening Room Player over your local Wi-Fi.
      </div>

      {/* Feedback & Manual Diagnostic Send */}
      <div style={{
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "12px",
        padding: "1rem 1.25rem",
      }}>
        <label style={{ display: "block", fontSize: "0.88rem", fontWeight: 600, marginBottom: "0.4rem" }}>
          Report an Issue or Send Diagnostics
        </label>
        <p style={{ fontSize: "0.78rem", color: "rgba(255, 255, 255, 0.6)", marginBottom: "0.75rem" }}>
          Sends system specifications and recent log snapshot to your Discord channel. Personal tokens and file paths are automatically redacted.
        </p>

        <textarea
          value={userNote}
          onChange={(e) => setUserNote(e.target.value)}
          placeholder="Optional: Describe what happened (e.g. 'Sound stuttered during track transition')..."
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "rgba(0, 0, 0, 0.35)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "8px",
            padding: "0.6rem 0.75rem",
            color: "#fff",
            fontSize: "0.82rem",
            outline: "none",
            resize: "vertical",
            marginBottom: "0.75rem",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            onClick={handleSendManualReport}
            disabled={sendingReport || !proxyUrl.trim()}
            style={{
              background: "#1db954",
              color: "#000",
              fontWeight: 600,
              fontSize: "0.82rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <Send size={14} />
            {sendingReport ? "Sending..." : "Send Diagnostic Report"}
          </Button>
        </div>
      </div>

      {/* Status Message Notification */}
      {statusMessage && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          padding: "0.75rem 1rem",
          borderRadius: "8px",
          fontSize: "0.82rem",
          background: statusMessage.type === "success"
            ? "rgba(16, 185, 129, 0.15)"
            : statusMessage.type === "error"
            ? "rgba(239, 68, 68, 0.15)"
            : "rgba(59, 130, 246, 0.15)",
          border: `1px solid ${
            statusMessage.type === "success"
              ? "rgba(16, 185, 129, 0.3)"
              : statusMessage.type === "error"
              ? "rgba(239, 68, 68, 0.3)"
              : "rgba(59, 130, 246, 0.3)"
          }`,
          color: statusMessage.type === "success" ? "#34d399" : statusMessage.type === "error" ? "#f87171" : "#60a5fa",
        }}>
          {statusMessage.type === "success" && <CheckCircle2 size={16} />}
          {statusMessage.type === "error" && <AlertCircle size={16} />}
          {statusMessage.type === "info" && <Activity size={16} className="animate-spin" />}
          <span>{statusMessage.text}</span>
        </div>
      )}
    </div>
  );
}
