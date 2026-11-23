import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { Loader2, Sparkles, Layers } from "lucide-react";

interface NavigationLoadingContextType {
  isLoading: boolean;
  loadingMessage: string;
  subMessage?: string;
  startLoading: (message?: string, subMessage?: string) => void;
  stopLoading: () => void;
  withLoading: <T>(action: () => Promise<T> | T, options?: { message?: string; subMessage?: string; minDurationMs?: number }) => Promise<T>;
}

const NavigationLoadingContext = createContext<NavigationLoadingContextType>({
  isLoading: false,
  loadingMessage: "Processing your request...",
  subMessage: undefined,
  startLoading: () => {},
  stopLoading: () => {},
  withLoading: async (action) => action(),
});

export function useNavigationLoading() {
  return useContext(NavigationLoadingContext);
}

export function NavigationLoadingProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Processing your request...");
  const [subMessage, setSubMessage] = useState<string | undefined>("Preparing next stage...");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLoading = useCallback((message?: string, subMsg?: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLoadingMessage(message || "Processing your request...");
    setSubMessage(subMsg !== undefined ? subMsg : "Preparing workspace and validating stage data...");
    setIsLoading(true);
  }, []);

  const stopLoading = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Smooth fade out
    timerRef.current = setTimeout(() => {
      setIsLoading(false);
    }, 150);
  }, []);

  const withLoading = useCallback(
    async <T,>(
      action: () => Promise<T> | T,
      options?: { message?: string; subMessage?: string; minDurationMs?: number },
    ): Promise<T> => {
      const minDuration = options?.minDurationMs ?? 400;
      const startTime = Date.now();
      startLoading(options?.message, options?.subMessage);

      try {
        const result = await action();
        const elapsed = Date.now() - startTime;
        if (elapsed < minDuration) {
          await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
        }
        return result;
      } finally {
        stopLoading();
      }
    },
    [startLoading, stopLoading],
  );

  // Global custom event listeners to allow any component to trigger loading
  useEffect(() => {
    const handleStart = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      startLoading(detail?.message, detail?.subMessage);
    };
    const handleStop = () => {
      stopLoading();
    };

    window.addEventListener("start-navigation-loading", handleStart);
    window.addEventListener("stop-navigation-loading", handleStop);

    return () => {
      window.removeEventListener("start-navigation-loading", handleStart);
      window.removeEventListener("stop-navigation-loading", handleStop);
    };
  }, [startLoading, stopLoading]);

  return (
    <NavigationLoadingContext.Provider
      value={{
        isLoading,
        loadingMessage,
        subMessage,
        startLoading,
        stopLoading,
        withLoading,
      }}
    >
      {children}
      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          data-testid="common-navigation-loading-screen"
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-background/85 backdrop-blur-md select-none animate-in fade-in duration-200"
          style={{ pointerEvents: "all" }}
        >
          <div className="surface-card relative flex flex-col items-center justify-center p-8 sm:p-10 rounded-3xl border border-primary/30 bg-surface/95 shadow-2xl max-w-md mx-4 text-center">
            {/* Ambient background glow */}
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-primary/30 via-indigo-500/20 to-teal-500/30 blur-xl opacity-70 -z-10 animate-pulse" />

            {/* Spinner animation */}
            <div className="relative mb-6">
              <div className="h-16 w-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <div className="absolute inset-0 grid place-items-center">
                <Sparkles className="h-6 w-6 text-primary animate-pulse" />
              </div>
            </div>

            {/* Title / Main Message */}
            <h3 className="text-lg sm:text-xl font-display font-bold text-foreground mb-2 flex items-center gap-2">
              <span>{loadingMessage}</span>
            </h3>

            {/* Subtitle / Stage Context */}
            {subMessage && (
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-xs mb-4">
                {subMessage}
              </p>
            )}

            {/* Visual pulse line */}
            <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-progress" style={{ width: "70%" }} />
            </div>

            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-semibold mt-3">
              Please wait • Do not refresh
            </span>
          </div>
        </div>
      )}
    </NavigationLoadingContext.Provider>
  );
}
