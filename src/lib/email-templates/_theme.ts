// Shared RayStation-inspired theme tokens for email templates.
// Email body MUST stay white for client compatibility; the dark panel
// is rendered as an inner card so the brand identity carries through.

export const theme = {
  // Outer body — white per email-client best practice
  bodyBg: "#ffffff",
  bodyFont:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  monoFont:
    "'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'Courier New', monospace",

  // RayStation panel
  bg: "#0E1116",
  panel: "#1B2230",
  panelElevated: "#232C3D",
  border: "#2A3340",

  // Text
  textPrimary: "#E5ECF5",
  textMuted: "#7A8699",

  // Accents
  accent: "#22D3EE", // cyan-400 — primary CTA
  accentHover: "#06B6D4",
  accentInk: "#0E1116", // text on accent
  amber: "#F59E0B", // warning / brand secondary
  danger: "#EF4444",
  success: "#10B981",
} as const;

export const styles = {
  main: {
    backgroundColor: theme.bodyBg,
    fontFamily: theme.bodyFont,
    margin: 0,
    padding: "32px 16px",
  },
  outer: {
    width: "100%",
    maxWidth: "560px",
    margin: "0 auto",
  },
  // Slim brand bar above the panel
  brandBar: {
    display: "block",
    fontFamily: theme.monoFont,
    fontSize: "11px",
    letterSpacing: "0.18em",
    textTransform: "uppercase" as const,
    color: theme.textMuted,
    padding: "0 0 12px",
  },
  brandAccent: {
    color: theme.accent,
  },
  brandAmber: {
    color: theme.amber,
  },
  panel: {
    backgroundColor: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: "4px",
    padding: "32px 28px",
    color: theme.textPrimary,
  },
  // Top accent rule
  accentRule: {
    display: "block",
    height: "2px",
    width: "40px",
    backgroundColor: theme.accent,
    margin: "0 0 20px",
    border: 0,
    lineHeight: "2px",
  },
  eyebrow: {
    fontFamily: theme.monoFont,
    fontSize: "11px",
    letterSpacing: "0.18em",
    textTransform: "uppercase" as const,
    color: theme.textMuted,
    margin: "0 0 8px",
  },
  h1: {
    fontFamily: theme.bodyFont,
    fontSize: "22px",
    fontWeight: 600 as const,
    color: theme.textPrimary,
    letterSpacing: "-0.01em",
    margin: "0 0 20px",
    lineHeight: "1.25",
  },
  text: {
    fontFamily: theme.bodyFont,
    fontSize: "14px",
    color: theme.textPrimary,
    lineHeight: "1.6",
    margin: "0 0 18px",
  },
  muted: {
    fontFamily: theme.bodyFont,
    fontSize: "13px",
    color: theme.textMuted,
    lineHeight: "1.6",
    margin: "0 0 18px",
  },
  link: {
    color: theme.accent,
    textDecoration: "underline",
  },
  button: {
    backgroundColor: theme.accent,
    color: theme.accentInk,
    fontFamily: theme.bodyFont,
    fontSize: "13px",
    fontWeight: 600 as const,
    letterSpacing: "0.02em",
    borderRadius: "4px",
    padding: "12px 22px",
    textDecoration: "none",
    display: "inline-block",
    margin: "8px 0 24px",
  },
  code: {
    fontFamily: theme.monoFont,
    fontSize: "26px",
    fontWeight: 600 as const,
    color: theme.amber,
    letterSpacing: "0.32em",
    backgroundColor: theme.panelElevated,
    border: `1px solid ${theme.border}`,
    borderRadius: "4px",
    padding: "16px 20px",
    margin: "0 0 24px",
    textAlign: "center" as const,
    display: "block",
  },
  divider: {
    borderTop: `1px solid ${theme.border}`,
    margin: "24px 0 16px",
    height: 0,
    lineHeight: 0,
  },
  footer: {
    fontFamily: theme.monoFont,
    fontSize: "10px",
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: theme.textMuted,
    margin: "0",
    lineHeight: "1.5",
  },
  outerFooter: {
    fontFamily: theme.monoFont,
    fontSize: "10px",
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "#9aa3af",
    textAlign: "center" as const,
    padding: "16px 0 0",
    margin: 0,
  },
} as const;

export function BrandBar({ siteName }: { siteName: string }) {
  // Plain string used inside <Text>; keeps email rendering robust.
  return `${siteName.toUpperCase()} · CLINICAL CONGRESS INTELLIGENCE`;
}