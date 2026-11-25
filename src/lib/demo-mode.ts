import { User } from "@supabase/supabase-js";

/**
 * Designated demo account identifier.
 * Can be overridden via VITE_DEMO_EMAIL environment variable.
 */
export const DEMO_ACCOUNT_EMAIL = (
  import.meta.env.VITE_DEMO_EMAIL || "vtabpublicuser@gmail.com"
).toLowerCase().trim();

/**
 * Checks if the given authenticated user is running in Demo Mode.
 * Evaluates the designated public demo email and user metadata flags.
 */
export function isDemoUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const email = (user.email || "").toLowerCase().trim();
  if (email === DEMO_ACCOUNT_EMAIL) return true;
  if (user.user_metadata?.is_demo === true || user.user_metadata?.demo_mode === true) return true;
  if (user.app_metadata?.is_demo === true || user.app_metadata?.demo_mode === true) return true;
  return false;
}

/**
 * List of routes that are locked/restricted for demo users.
 * Demo mode includes Phase 1 (Instructions, Upload, QVW Analysis) and Phase 2
 * (Expression Conversion, ETL Analysis, Power Query, DAX Measures).
 * Phase 3 (Power BI Model, Relationships, Validation & Export, Logs) is restricted to Full Enterprise Edition.
 */
export const DEMO_LOCKED_ROUTES = [
  "/app/logs",
  "/app/calendar-analysis",
  "/app/report-designer",
] as const;

/**
 * Checks if a pathname is restricted under Demo Mode.
 */
export function isPathLockedInDemo(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, "");
  return DEMO_LOCKED_ROUTES.some((route) => normalized === route || normalized.startsWith(`${route}/`));
}

export const DEMO_LOCKED_TOOLTIP = "Locked in Demo Version — Contact for More";
export const DEMO_LOCKED_MESSAGE = "🔒 Full PBIP Export and Admin Logs are available in the Full Enterprise Edition.";

/**
 * Checks whether the guided interactive tour is permitted in the current session.
 * The guided tour is strictly restricted to the Demo Version and must never appear
 * or activate in normal, production, or enterprise versions.
 */
export function isTourAllowedInDemo(isDemo: boolean): boolean {
  return Boolean(isDemo);
}
