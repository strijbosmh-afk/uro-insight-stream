import * as React from "react";

// Honest illustrations of the X Developer Portal flow.
// These are NOT screenshots — they use the app's color palette and font, with a
// caption that says so. The text labels are accurate to the portal as of writing;
// when X redesigns, the prose in the wizard step still applies even if the
// shapes drift visually.

export type Variant =
  | "developer-account"
  | "project-and-app"
  | "user-auth-settings"
  | "keys-and-tokens"
  | "paste-credentials"
  | "verify"
  | "done";

const accent = "var(--accent)";
const panel = "var(--panel)";
const panelEl = "var(--panel-elevated, var(--panel))";
const border = "var(--border)";
const textMuted = "var(--text-muted, currentColor)";
const textPri = "var(--text-primary, currentColor)";
const success = "var(--success)";
const warn = "var(--warning)";

const baseProps = {
  width: "100%",
  viewBox: "0 0 320 200",
  xmlns: "http://www.w3.org/2000/svg",
  className: "block",
  style: { fontFamily: "var(--font-sans, system-ui)" },
} as const;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <rect x="0" y="0" width="320" height="200" rx="6" fill={panel} stroke={border} />
      <rect x="0" y="0" width="320" height="22" rx="6" fill={panelEl} />
      <circle cx="10" cy="11" r="3" fill={textMuted} opacity="0.4" />
      <circle cx="20" cy="11" r="3" fill={textMuted} opacity="0.4" />
      <circle cx="30" cy="11" r="3" fill={textMuted} opacity="0.4" />
      <text x="160" y="15" fill={textMuted} fontSize="9" textAnchor="middle">
        developer.x.com
      </text>
      {children}
    </>
  );
}

export function PortalIllustration({ variant }: { variant: Variant }) {
  return (
    <svg {...baseProps} role="img" aria-label={`Illustration: ${variant}`}>
      <Frame>{renderVariant(variant)}</Frame>
    </svg>
  );
}

function renderVariant(v: Variant): React.ReactNode {
  switch (v) {
    case "developer-account":
      return (
        <>
          <text x="20" y="50" fill={textPri} fontSize="13" fontWeight="600">
            Apply for a developer account
          </text>
          <text x="20" y="70" fill={textMuted} fontSize="10">
            ~2 minutes · email verification
          </text>
          <rect x="20" y="90" width="120" height="32" rx="4" fill={accent} />
          <text x="80" y="110" fill="var(--accent-foreground,#000)" fontSize="11" textAnchor="middle" fontWeight="600">
            Sign up
          </text>
          <rect x="20" y="140" width="280" height="40" rx="4" fill={panelEl} stroke={border} />
          <text x="30" y="158" fill={textMuted} fontSize="9">Tell us about your use case</text>
          <text x="30" y="172" fill={textMuted} fontSize="9">e.g. "Personal project to follow medical sources"</text>
        </>
      );
    case "project-and-app":
      return (
        <>
          <rect x="10" y="35" width="80" height="155" fill={panelEl} stroke={border} />
          <text x="50" y="55" fill={textPri} fontSize="10" textAnchor="middle" fontWeight="600">Sidebar</text>
          <rect x="15" y="65" width="70" height="20" rx="3" fill={accent} opacity="0.15" />
          <text x="22" y="79" fill={accent} fontSize="9">Projects & Apps</text>
          <text x="22" y="100" fill={textMuted} fontSize="9">Dashboard</text>
          <text x="22" y="115" fill={textMuted} fontSize="9">Products</text>
          <text x="22" y="130" fill={textMuted} fontSize="9">Support</text>
          <rect x="100" y="35" width="210" height="155" fill={panel} stroke={border} />
          <text x="115" y="60" fill={textPri} fontSize="11" fontWeight="600">+ Add Project</text>
          <rect x="115" y="75" width="180" height="40" rx="3" fill={panelEl} stroke={border} />
          <text x="125" y="92" fill={textPri} fontSize="10">My Project</text>
          <text x="125" y="106" fill={textMuted} fontSize="9">↳ App: UroFeed-personal</text>
          <rect x="115" y="135" width="180" height="40" rx="3" fill={panelEl} stroke={accent} />
          <text x="125" y="152" fill={accent} fontSize="10" fontWeight="600">UroFeed-personal</text>
          <text x="125" y="166" fill={textMuted} fontSize="9">click to open settings</text>
        </>
      );
    case "user-auth-settings":
      return (
        <>
          <text x="20" y="45" fill={textPri} fontSize="11" fontWeight="600">User authentication settings</text>
          {[
            { y: 60, k: "App permissions", v: "Read and write", ok: true },
            { y: 90, k: "Type of App", v: "Web App, Bot or Automated", ok: true },
            { y: 120, k: "Callback URI", v: "https://localhost", ok: true },
            { y: 150, k: "Website URL", v: "https://urofeed.com", ok: true },
          ].map((r, i) => (
            <g key={i}>
              <text x="20" y={r.y + 12} fill={textMuted} fontSize="9">{r.k}</text>
              <rect x="130" y={r.y} width="170" height="22" rx="3" fill={panelEl} stroke={border} />
              <text x="138" y={r.y + 14} fill={textPri} fontSize="9">{r.v}</text>
              <text x="305" y={r.y + 14} fill={success} fontSize="11" textAnchor="end">✓</text>
            </g>
          ))}
          <text x="20" y="190" fill={warn} fontSize="9">⚠ Save BEFORE generating tokens</text>
        </>
      );
    case "keys-and-tokens":
      return (
        <>
          <text x="20" y="45" fill={textPri} fontSize="11" fontWeight="600">Keys and tokens</text>
          {[
            { y: 60, k: "Consumer Keys", btn: "Regenerate" },
            { y: 105, k: "Authentication Tokens", btn: "Generate" },
          ].map((r, i) => (
            <g key={i}>
              <rect x="20" y={r.y} width="280" height="40" rx="3" fill={panelEl} stroke={border} />
              <text x="30" y={r.y + 16} fill={textPri} fontSize="10" fontWeight="600">{r.k}</text>
              <text x="30" y={r.y + 30} fill={textMuted} fontSize="9">API Key · API Key Secret</text>
              <rect x="220" y={r.y + 8} width="70" height="22" rx="3" fill={accent} />
              <text x="255" y={r.y + 23} fill="var(--accent-foreground,#000)" fontSize="9" textAnchor="middle" fontWeight="600">{r.btn}</text>
            </g>
          ))}
          <text x="20" y="170" fill={warn} fontSize="9">⚠ Secrets shown once. Copy them now.</text>
          <text x="20" y="185" fill={success} fontSize="9">✓ Token must say "Read and Write"</text>
        </>
      );
    case "paste-credentials":
      return (
        <>
          <text x="20" y="45" fill={textPri} fontSize="11" fontWeight="600">Paste 4 values from X</text>
          {["Consumer Key", "Consumer Secret", "Access Token", "Access Token Secret"].map((label, i) => (
            <g key={label}>
              <text x="20" y={68 + i * 32} fill={textMuted} fontSize="9">{label}</text>
              <rect x="20" y={72 + i * 32} width="280" height="22" rx="3" fill={panelEl} stroke={border} />
              <text x="28" y={87 + i * 32} fill={textPri} fontSize="9" fontFamily="monospace">••••••••••••••••••••</text>
            </g>
          ))}
        </>
      );
    case "verify":
      return (
        <>
          <circle cx="160" cy="80" r="30" fill={success} opacity="0.15" />
          <text x="160" y="88" fill={success} fontSize="28" textAnchor="middle">✓</text>
          <text x="160" y="135" fill={textPri} fontSize="12" textAnchor="middle" fontWeight="600">
            Connected as @yourhandle
          </text>
          <text x="160" y="155" fill={textMuted} fontSize="10" textAnchor="middle">
            Read + Write · OAuth 1.0a
          </text>
          <text x="160" y="175" fill={textMuted} fontSize="9" textAnchor="middle">
            Quota will appear in Settings → X
          </text>
        </>
      );
    case "done":
      return (
        <>
          <text x="160" y="60" fill={textPri} fontSize="14" textAnchor="middle" fontWeight="700">You're all set</text>
          <text x="160" y="85" fill={textMuted} fontSize="10" textAnchor="middle">
            UroFeed will now ingest tweets using your X quota.
          </text>
          <rect x="60" y="105" width="200" height="40" rx="4" fill={accent} />
          <text x="160" y="130" fill="var(--accent-foreground,#000)" fontSize="11" textAnchor="middle" fontWeight="600">
            Go to Sources →
          </text>
          <text x="160" y="170" fill={textMuted} fontSize="9" textAnchor="middle">
            You can manage or disconnect anytime in Settings.
          </text>
        </>
      );
  }
}

export function IllustrationFrame({
  variant,
  caption,
}: {
  variant: Variant;
  caption?: string;
}) {
  return (
    <div className="rounded-[4px] border border-border bg-panel-elevated p-3">
      <PortalIllustration variant={variant} />
      <div className="mt-2 text-[10px] text-text-muted text-center italic">
        {caption ?? "Illustration — the actual X Developer Portal may look different."}
      </div>
    </div>
  );
}