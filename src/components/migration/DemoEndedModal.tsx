import { useState, useEffect } from "react";
import {
  Lock,
  X,
  CheckCircle2,
  Mail,
  Copy,
  Check,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DemoEndedModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function DemoEndedModal({
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
}: DemoEndedModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isControlled = typeof controlledIsOpen === "boolean";
  const isOpen = isControlled ? controlledIsOpen : internalOpen;

  const handleClose = () => {
    if (isControlled && controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalOpen(false);
    }
  };

  useEffect(() => {
    const handleOpenEvent = () => {
      setInternalOpen(true);
    };
    window.addEventListener("open-demo-ended-modal", handleOpenEvent);
    return () => {
      window.removeEventListener("open-demo-ended-modal", handleOpenEvent);
    };
  }, []);

  const contactEmail = "contactsales@vtabsquare.com";

  const handleCopyEmail = () => {
    toast.info("🔒 Copying content is restricted in the Demo Version.", {
      id: "demo-clipboard-restricted",
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-ended-title"
        className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="bg-slate-50/90 dark:bg-slate-950/70 border-b border-slate-200/80 dark:border-slate-800/80 px-6 sm:px-8 py-5 shrink-0">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wider uppercase bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-900/60">
              <Lock className="h-3 w-3" /> DEMO VERSION COMPLETED
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="h-8 w-8 rounded-lg grid place-items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <h2
            id="demo-ended-title"
            className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display"
          >
            Demo Ended — Phase 1 &amp; Phase 2 Completed!
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            You have successfully explored the interactive demo up to DAX Measures. Contact us for full access to Phase 3 and production deployment.
          </p>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 sm:p-8 space-y-6 overflow-y-auto">
          {/* Summary Grid: What was completed vs Phase 3 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Unlocked in Demo */}
            <div className="p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Completed in Demo
              </div>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 pl-1">
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span><strong>Phase 1:</strong> Capture, QVS Parsing &amp; QVW Analysis</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span><strong>Phase 2:</strong> Lineage, Power Query M &amp; DAX Measures</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span>Deterministic logic policy validation &amp; review</span>
                </li>
              </ul>
            </div>

            {/* Enterprise Phase 3 */}
            <div className="p-4 rounded-xl border border-blue-200/80 dark:border-blue-900/50 bg-blue-50/30 dark:bg-blue-950/20 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                <Lock className="h-3.5 w-3.5 text-blue-600" />
                Phase 3 (Enterprise Edition)
              </div>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 pl-1">
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500 font-bold">🔒</span>
                  <span><strong>Phase 3:</strong> Automated Semantic Model &amp; TMDL Generation</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500 font-bold">🔒</span>
                  <span>Power BI Desktop PBIP (.zip) download</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500 font-bold">🔒</span>
                  <span>Direct Microsoft Fabric &amp; Power BI Service deployment</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Contact Box */}
          <div className="p-5 sm:p-6 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-primary/10 to-transparent space-y-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Ready to migrate your full Qlik environment?
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                  Contact our solutions team for enterprise licensing, private on-prem / cloud deployment, and Proof of Concept (PoC) validation on your own enterprise reports.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-primary/15">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 select-all">
                  {contactEmail}
                </span>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border border-border/60 bg-white/70 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-not-allowed select-none"
                  title="Copying is restricted in Demo Version"
                >
                  <Lock className="h-3 w-3 text-muted-foreground/70" />
                  <span>Copy</span>
                </button>
              </div>

              <a
                href="https://www.vtabsquare.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-md hover:opacity-90 transition-opacity"
              >
                <span>Contact Demo</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50/80 dark:bg-slate-950/60 border-t border-slate-200/80 dark:border-slate-800/80 px-6 sm:px-8 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span>VTAB Square Enterprise Migration Engine v2.0</span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Review Previous Stages
          </button>
        </div>
      </div>
    </div>
  );
}
