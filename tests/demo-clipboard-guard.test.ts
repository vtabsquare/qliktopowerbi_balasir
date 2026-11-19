// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setupDemoClipboardProtection,
  DEMO_CLIPBOARD_RESTRICTED_MESSAGE,
} from "../src/lib/demo-clipboard-guard";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Demo Version Universal Clipboard Protection", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.className = "";
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
  });

  it("applies demo-restricted-clipboard CSS class to document.body", () => {
    cleanup = setupDemoClipboardProtection();
    expect(document.body.classList.contains("demo-restricted-clipboard")).toBe(true);

    cleanup();
    cleanup = null;
    expect(document.body.classList.contains("demo-restricted-clipboard")).toBe(false);
  });

  it("blocks native copy event and notifies user", () => {
    cleanup = setupDemoClipboardProtection();

    const copyEvent = new Event("copy", { bubbles: true, cancelable: true });
    const dispatched = document.dispatchEvent(copyEvent);

    expect(dispatched).toBe(false);
    expect(copyEvent.defaultPrevented).toBe(true);
    expect(toast.info).toHaveBeenCalledWith(
      DEMO_CLIPBOARD_RESTRICTED_MESSAGE,
      expect.objectContaining({ id: "demo-clipboard-restricted" })
    );
  });

  it("blocks native cut event and notifies user", () => {
    cleanup = setupDemoClipboardProtection();

    const cutEvent = new Event("cut", { bubbles: true, cancelable: true });
    const dispatched = document.dispatchEvent(cutEvent);

    expect(dispatched).toBe(false);
    expect(cutEvent.defaultPrevented).toBe(true);
    expect(toast.info).toHaveBeenCalledWith(
      DEMO_CLIPBOARD_RESTRICTED_MESSAGE,
      expect.objectContaining({ id: "demo-clipboard-restricted" })
    );
  });

  it("intercepts Ctrl+C and Ctrl+X keyboard shortcuts", () => {
    cleanup = setupDemoClipboardProtection();

    const ctrlC = new KeyboardEvent("keydown", {
      key: "c",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(ctrlC);
    expect(ctrlC.defaultPrevented).toBe(true);

    const ctrlX = new KeyboardEvent("keydown", {
      key: "x",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(ctrlX);
    expect(ctrlX.defaultPrevented).toBe(true);
  });

  it("intercepts Cmd+C and Cmd+X on macOS", () => {
    cleanup = setupDemoClipboardProtection();

    const metaC = new KeyboardEvent("keydown", {
      key: "c",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(metaC);
    expect(metaC.defaultPrevented).toBe(true);

    const metaX = new KeyboardEvent("keydown", {
      key: "x",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(metaX);
    expect(metaX.defaultPrevented).toBe(true);
  });

  it("intercepts Windows secondary shortcuts (Ctrl+Insert and Shift+Delete)", () => {
    cleanup = setupDemoClipboardProtection();

    const ctrlInsert = new KeyboardEvent("keydown", {
      key: "insert",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(ctrlInsert);
    expect(ctrlInsert.defaultPrevented).toBe(true);

    const shiftDelete = new KeyboardEvent("keydown", {
      key: "delete",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(shiftDelete);
    expect(shiftDelete.defaultPrevented).toBe(true);
  });

  it("proxies navigator.clipboard.writeText and navigator.clipboard.write", async () => {
    const originalWriteText = vi.fn().mockResolvedValue(undefined);
    const originalWrite = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: originalWriteText,
        write: originalWrite,
      },
    });

    cleanup = setupDemoClipboardProtection();

    await navigator.clipboard.writeText("SECRET_FORMULA");
    expect(originalWriteText).not.toHaveBeenCalled();

    await (navigator.clipboard as any).write([{}]);
    expect(originalWrite).not.toHaveBeenCalled();

    expect(toast.info).toHaveBeenCalledWith(
      DEMO_CLIPBOARD_RESTRICTED_MESSAGE,
      expect.objectContaining({ id: "demo-clipboard-restricted" })
    );
  });
});
