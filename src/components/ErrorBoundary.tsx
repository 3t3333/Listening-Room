import { Component, type ErrorInfo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, RefreshCw, Copy, Check } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  reported: boolean;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      reported: false,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    // Automatically transmit diagnostic report to backend
    const stack = (error.stack || "") + (errorInfo.componentStack ? `\n\nComponent Stack:\n${errorInfo.componentStack}` : "");

    invoke("submit_diagnostic_report", {
      request: {
        source: "react-error-boundary",
        errorMessage: error.message || "Unknown React render error",
        errorLocation: "React Component Tree",
        stackTrace: stack,
        userNote: "Automatically captured by React ErrorBoundary.",
      },
    })
      .then(() => {
        this.setState({ reported: true });
      })
      .catch((err) => {
        console.warn("Could not dispatch ErrorBoundary diagnostic:", err);
      });
  }

  handleCopy = () => {
    const { error, errorInfo } = this.state;
    const text = `Listening Room UI Crash:\nError: ${error?.message}\n\nStack:\n${error?.stack}\n\nComponent Stack:\n${errorInfo?.componentStack}`;
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-screen" style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "2rem",
          background: "radial-gradient(circle at 50% 30%, #1f1b2e 0%, #0d0c13 100%)",
          color: "#fff",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
          textAlign: "center",
        }}>
          <div style={{
            maxWidth: "540px",
            width: "100%",
            background: "rgba(30, 27, 45, 0.75)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "16px",
            padding: "2.5rem 2rem",
            boxShadow: "0 24px 48px rgba(0, 0, 0, 0.5)",
          }}>
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(231, 76, 60, 0.15)",
              border: "1px solid rgba(231, 76, 60, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem",
              color: "#e74c3c",
            }}>
              <AlertTriangle size={28} />
            </div>

            <h2 style={{ fontSize: "1.35rem", fontWeight: 600, margin: "0 0 0.5rem", color: "#f3f4f6" }}>
              Something went wrong in the interface
            </h2>
            <p style={{ fontSize: "0.9rem", color: "rgba(255, 255, 255, 0.7)", margin: "0 0 1.5rem", lineHeight: 1.5 }}>
              Listening Room encountered an unexpected UI exception.
              {this.state.reported
                ? " A diagnostic report has been automatically sent to Discord."
                : " The error details have been logged."}
            </p>

            {this.state.error && (
              <div style={{
                background: "rgba(0, 0, 0, 0.35)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "8px",
                padding: "0.85rem 1rem",
                textAlign: "left",
                fontSize: "0.8rem",
                color: "#f87171",
                fontFamily: "monospace",
                marginBottom: "1.75rem",
                maxHeight: "120px",
                overflowY: "auto",
                wordBreak: "break-word",
              }}>
                {this.state.error.message}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                onClick={this.handleReload}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  background: "#1db954",
                  color: "#000",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  padding: "0.6rem 1.25rem",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  transition: "transform 0.15s, opacity 0.15s",
                }}
                onMouseOver={(e) => (e.currentTarget.style.opacity = "0.9")}
                onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
              >
                <RefreshCw size={16} />
                Reload App
              </button>

              <button
                onClick={this.handleCopy}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  background: "rgba(255, 255, 255, 0.08)",
                  color: "#fff",
                  fontWeight: 500,
                  fontSize: "0.88rem",
                  padding: "0.6rem 1.1rem",
                  borderRadius: "999px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.14)")}
                onMouseOut={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)")}
              >
                {this.state.copied ? <Check size={16} color="#1db954" /> : <Copy size={16} />}
                {this.state.copied ? "Copied" : "Copy Error"}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
