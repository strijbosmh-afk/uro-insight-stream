import * as React from "react";
import { useAuth, type AppRole } from "./AuthProvider";

/** True when current user can perform editor-level writes (sources/hashtags/congresses). */
export function useCanEdit(): boolean {
  const { isEditor } = useAuth();
  return isEditor;
}

/** True when current user is admin. */
export function useCanAdmin(): boolean {
  const { isAdmin } = useAuth();
  return isAdmin;
}

/** Returns the highest-privilege role label for display. */
export function useRoleLabel(): AppRole | "guest" {
  const { roles } = useAuth();
  if (roles.includes("admin")) return "admin";
  if (roles.includes("editor")) return "editor";
  if (roles.includes("viewer")) return "viewer";
  return "guest";
}

/**
 * Renders children only if the user has the required role bucket.
 * `require="editor"` means admin OR editor. `require="admin"` is admin only.
 */
export function RoleGate({
  require,
  fallback = null,
  children,
}: {
  require: "admin" | "editor";
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { isAdmin, isEditor } = useAuth();
  const ok = require === "admin" ? isAdmin : isEditor;
  return <>{ok ? children : fallback}</>;
}