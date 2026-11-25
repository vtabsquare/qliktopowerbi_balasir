import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { MoreHorizontal, LogOut, Trash2, Lock, Compass } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export function AppHeader() {
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const { isDemo: authIsDemo, signOut } = useAuth();
  const isDemo = authIsDemo || currentPath.startsWith("/demo");
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setDeleteConfirm(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success("Logged out successfully!");
    } catch {
      toast.error("Failed to log out. Please try again.");
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setDeleting(true);
    try {
      await signOut();
      toast.success(
        "Your account deletion request has been submitted. All your data will be removed within 30 days per our Privacy Policy.",
        { duration: 6000 },
      );
    } catch {
      toast.error("Could not process account deletion. Please contact support.");
    } finally {
      setDeleting(false);
      setMenuOpen(false);
      setDeleteConfirm(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 shadow-xs transition-all">
      <div className="flex w-full items-center justify-between gap-4 px-4 py-2 sm:px-6">
        {/* Left: Logo, Branding, AI Engine v2.0 */}
        <div className="flex shrink-0 items-center gap-3">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 group">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.62_0.2_260)] text-primary-foreground font-bold shadow-sm group-hover:scale-105 transition-transform">
              <span className="text-xs tracking-tight">VT</span>
            </div>
            <div className="leading-tight">
              <div className="font-display font-bold text-sm tracking-wide text-foreground">VTAB SQUARE</div>
              <div className="mt-0.5 hidden sm:inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                <span>AI MIGRATION ENGINE v2.0</span>
              </div>
            </div>
          </Link>
        </div>

        {/* Center: Main Navigation */}
        <nav aria-label="Main navigation" className="hidden min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap rounded-full border border-border/60 bg-surface/70 p-1 text-xs font-medium shadow-xs md:flex">
          <Link
            to={isDemo ? "/demo" : "/app"}
            activeProps={{ className: "bg-primary text-primary-foreground shadow-sm" }}
            className="rounded-full px-3.5 py-1.5 text-muted-foreground hover:text-foreground transition-all"
          >
            Pipeline
          </Link>
          {isDemo ? (
            <button
              type="button"
              disabled
              onClick={() => toast.info("🔒 Calendars is locked in the Demo Version.")}
              title="Calendars is locked in Demo Version"
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-muted-foreground/50 opacity-40 cursor-not-allowed select-none transition-all hover:bg-muted/20"
            >
              <span>Calendars</span>
              <Lock className="h-3 w-3 opacity-70" />
            </button>
          ) : (
            <Link
              to="/app/calendar-analysis"
              activeProps={{ className: "bg-primary text-primary-foreground shadow-sm" }}
              className="rounded-full px-3.5 py-1.5 text-muted-foreground hover:text-foreground transition-all"
            >
              Calendars
            </Link>
          )}

          {isDemo ? (
            <button
              type="button"
              disabled
              onClick={() => toast.info("🔒 Report Designer is locked in the Demo Version.")}
              title="Report Designer is locked in Demo Version"
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-muted-foreground/50 opacity-40 cursor-not-allowed select-none transition-all hover:bg-muted/20"
            >
              <span>Report Designer</span>
              <Lock className="h-3 w-3 opacity-70" />
            </button>
          ) : (
            <Link
              to="/app/report-designer"
              activeProps={{ className: "bg-primary text-primary-foreground shadow-sm" }}
              className="rounded-full px-3.5 py-1.5 text-muted-foreground hover:text-foreground transition-all"
            >
              Report Designer
            </Link>
          )}

          {isDemo ? (
            <button
              type="button"
              disabled
              onClick={() => toast.info("🔒 Logs is locked in the Demo Version.")}
              title="Logs is locked in Demo Version"
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-muted-foreground/50 opacity-40 cursor-not-allowed select-none transition-all hover:bg-muted/20"
            >
              <span>Logs</span>
              <Lock className="h-3 w-3 opacity-70" />
            </button>
          ) : (
            <Link
              to="/app/logs"
              activeProps={{ className: "bg-primary text-primary-foreground shadow-sm" }}
              className="rounded-full px-3.5 py-1.5 text-muted-foreground hover:text-foreground transition-all"
            >
              Logs
            </Link>
          )}
        </nav>

        {/* Right: Demo controls / Sign Out + Options */}
        <div className="flex shrink-0 items-center gap-2">
          {isDemo && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("start-interactive-tour"))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold shadow-xs transition-all cursor-pointer"
              title="Start step-by-step interactive application tour"
            >
              <Compass className="h-3.5 w-3.5" />
              <span>Start Tour</span>
            </button>
          )}
          {isDemo && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-xs tracking-wider shadow-xs animate-in fade-in duration-200"
              title="Demo Mode: Restricted features are locked"
            >
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span>DEMO VERSION</span>
            </div>
          )}

          {!isDemo && (
            <button
              onClick={handleLogout}
              title="Logout"
              className="grid place-items-center h-10 w-10 rounded-xl border border-border bg-surface hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-500 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}

          {/* (...) menu with account deletion */}
          <div className="relative" ref={menuRef}>
            {isDemo ? (
              <button
                type="button"
                disabled
                title="Options locked in Demo Version"
                className="grid place-items-center h-10 w-10 rounded-xl border border-border/40 bg-surface/40 text-muted-foreground/40 opacity-40 cursor-not-allowed select-none"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            ) : (
              <button
                id="header-more-menu-btn"
                aria-label="More options"
                aria-expanded={menuOpen}
                onClick={() => {
                  setMenuOpen((v) => !v);
                  setDeleteConfirm(false);
                }}
                className="grid place-items-center h-10 w-10 rounded-xl border border-border bg-surface hover:bg-muted transition-colors"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}

            {!isDemo && menuOpen && (
              <div className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-border bg-background shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                <a
                  href="/privacy"
                  className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  Privacy Policy
                </a>
                <div className="h-px bg-border" />
                {!deleteConfirm ? (
                  <button
                    id="delete-account-btn"
                    onClick={handleDeleteAccount}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete My Account
                  </button>
                ) : (
                  <div className="p-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      This will permanently delete your account and all associated data. Are you
                      sure?
                    </p>
                    <div className="flex gap-2">
                      <button
                        id="delete-account-confirm-btn"
                        onClick={handleDeleteAccount}
                        disabled={deleting}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        {deleting ? "Deleting…" : "Yes, delete"}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(false)}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
