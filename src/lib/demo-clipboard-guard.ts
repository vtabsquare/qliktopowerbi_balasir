import { useEffect } from "react";
import { toast } from "sonner";

export const DEMO_CLIPBOARD_RESTRICTED_MESSAGE =
  "🔒 Copying and cutting content is restricted in the Demo Version.";

/**
 * Attaches global clipboard restrictions when Demo Mode is active.
 * Prevents copy/cut events, clipboard keyboard shortcuts, and programmatic clipboard API writes.
 */
export function setupDemoClipboardProtection(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  // 1. Add CSS class to body for selection restriction
  document.body.classList.add("demo-restricted-clipboard");

  const notifyRestricted = () => {
    toast.info(DEMO_CLIPBOARD_RESTRICTED_MESSAGE, {
      id: "demo-clipboard-restricted",
      duration: 2500,
    });
  };

  // 2. Intercept native 'copy' event
  const handleCopy = (e: ClipboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.clipboardData) {
      try {
        e.clipboardData.clearData();
        e.clipboardData.setData("text/plain", "");
      } catch {
        // ignore
      }
    }
    notifyRestricted();
  };

  // 3. Intercept native 'cut' event
  const handleCut = (e: ClipboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.clipboardData) {
      try {
        e.clipboardData.clearData();
        e.clipboardData.setData("text/plain", "");
      } catch {
        // ignore
      }
    }
    notifyRestricted();
  };

  // 4. Intercept copy/cut keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent) => {
    const isMod = e.ctrlKey || e.metaKey;
    const key = e.key ? e.key.toLowerCase() : "";

    // Ctrl/Cmd + C, Ctrl/Cmd + X, Ctrl/Cmd + Insert
    if (isMod && (key === "c" || key === "x" || key === "insert")) {
      e.preventDefault();
      e.stopPropagation();
      notifyRestricted();
      return;
    }

    // Shift + Delete (Cut shortcut in Windows)
    if (e.shiftKey && (key === "delete" || key === "del")) {
      e.preventDefault();
      e.stopPropagation();
      notifyRestricted();
      return;
    }
  };

  // 5. Proxy navigator.clipboard.writeText & write
  let originalWriteText: typeof navigator.clipboard.writeText | null = null;
  let originalWrite: typeof navigator.clipboard.write | null = null;

  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      originalWriteText = navigator.clipboard.writeText?.bind(navigator.clipboard) ?? null;
      originalWrite = navigator.clipboard.write?.bind(navigator.clipboard) ?? null;

      navigator.clipboard.writeText = async () => {
        notifyRestricted();
        return Promise.resolve();
      };

      navigator.clipboard.write = async () => {
        notifyRestricted();
        return Promise.resolve();
      };
    } catch {
      // In case navigator.clipboard is read-only
    }
  }

  // Attach event listeners in capture phase to take precedence
  document.addEventListener("copy", handleCopy, true);
  document.addEventListener("cut", handleCut, true);
  document.addEventListener("keydown", handleKeyDown, true);

  return () => {
    document.body.classList.remove("demo-restricted-clipboard");
    document.removeEventListener("copy", handleCopy, true);
    document.removeEventListener("cut", handleCut, true);
    document.removeEventListener("keydown", handleKeyDown, true);

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        if (originalWriteText) {
          navigator.clipboard.writeText = originalWriteText;
        }
        if (originalWrite) {
          navigator.clipboard.write = originalWrite;
        }
      } catch {
        // ignore
      }
    }
  };
}

/**
 * React hook to automatically enable Demo clipboard protection when isDemo is true.
 */
export function useDemoClipboardProtection(isDemo: boolean) {
  useEffect(() => {
    if (!isDemo) return;
    const cleanup = setupDemoClipboardProtection();
    return cleanup;
  }, [isDemo]);
}
