import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { TOUR_STEPS, type TourStep } from "@/lib/tour/tour-config";
import { useAuth } from "@/contexts/AuthContext";
import { isDemoEnvironment } from "@/lib/supabase";
import { getStepByPath, markStepCompleted } from "@/lib/migration/workflow-gating";
import { loadDemoDatasetToStore } from "@/lib/migration/demo-dataset-loader";

interface TourContextType {
  isOpen: boolean;
  currentStepIndex: number;
  currentStep: TourStep;
  totalSteps: number;
  startTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (stepIndex: number) => void;
  closeTour: () => void;
  restartTour: () => void;
}

const TourContext = createContext<TourContextType | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const navigate = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const currentStep = TOUR_STEPS[currentStepIndex] || TOUR_STEPS[0];
  const totalSteps = TOUR_STEPS.length;

  const { loading: authLoading, isDemo: authIsDemo } = useAuth();
  const isDemo = authIsDemo || isDemoEnvironment();

  const navigateToStepRoute = useCallback(
    (targetRoute: string) => {
      if (currentPath.startsWith("/demo")) {
        const step = getStepByPath(targetRoute);
        if (step) {
          for (let s = 0; s < step.id; s += 1) {
            markStepCompleted(s, true);
          }
          window.dispatchEvent(new CustomEvent("demo-set-active-step", { detail: { stepId: step.id } }));
        }
        return;
      }
      const normalizedCurrent = currentPath === "/app/" ? "/app" : currentPath;
      const normalizedTarget = targetRoute === "/app/" ? "/app" : targetRoute;
      if (normalizedCurrent !== normalizedTarget) {
        navigate({ to: targetRoute as any });
      }
    },
    [currentPath, navigate],
  );

  const goToStep = useCallback(
    (index: number) => {
      if (!isDemo) return;
      if (index < 0 || index >= TOUR_STEPS.length) return;
      setCurrentStepIndex(index);
      const step = TOUR_STEPS[index];
      navigateToStepRoute(step.targetRoute);
      if (step.prepareStep) {
        step.prepareStep();
        setTimeout(() => {
          step.prepareStep?.();
        }, 120);
      }
    },
    [isDemo, navigateToStepRoute],
  );

  const startTour = useCallback(() => {
    // Strictly restrict the interactive tour to Demo Version
    if (!isDemo) return;
    // Ensure demo dataset is loaded so all 14 steps have active, valid buttons
    loadDemoDatasetToStore();
    setIsOpen(true);
    goToStep(0);
  }, [isDemo, goToStep]);

  const nextStep = useCallback(() => {
    if (!isDemo) {
      setIsOpen(false);
      return;
    }
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      goToStep(currentStepIndex + 1);
    } else {
      setIsOpen(false);
    }
  }, [isDemo, currentStepIndex, goToStep]);

  const prevStep = useCallback(() => {
    if (!isDemo) {
      setIsOpen(false);
      return;
    }
    if (currentStepIndex > 0) {
      goToStep(currentStepIndex - 1);
    }
  }, [isDemo, currentStepIndex, goToStep]);

  const closeTour = useCallback(() => {
    setIsOpen(false);
  }, []);

  const restartTour = useCallback(() => {
    if (!isDemo) return;
    loadDemoDatasetToStore();
    setIsOpen(true);
    goToStep(0);
  }, [isDemo, goToStep]);

  // Ensure tour is immediately closed if user is in normal/enterprise version
  useEffect(() => {
    if (!isDemo && isOpen) {
      setIsOpen(false);
    }
  }, [isDemo, isOpen]);

  // Auto-start tour ALWAYS for demo version users on visit to the application
  useEffect(() => {
    if (authLoading || !isDemo) return;

    // Load demo dataset automatically in background on visit for demo users
    loadDemoDatasetToStore();

    // Auto-launch the guided tour so it always shows on visit
    const timer = setTimeout(() => {
      startTour();
    }, 450);

    return () => clearTimeout(timer);
  }, [authLoading, isDemo, startTour]);

  // Listen for global custom event to trigger tour (strictly Demo version only)
  useEffect(() => {
    const handleStartTourEvent = () => {
      if (isDemo) {
        startTour();
      }
    };
    window.addEventListener("start-interactive-tour", handleStartTourEvent);
    return () => window.removeEventListener("start-interactive-tour", handleStartTourEvent);
  }, [isDemo, startTour]);

  return (
    <TourContext.Provider
      value={{
        isOpen,
        currentStepIndex,
        currentStep,
        totalSteps,
        startTour,
        nextStep,
        prevStep,
        goToStep,
        closeTour,
        restartTour,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("useTour must be used within a TourProvider");
  }
  return context;
}
