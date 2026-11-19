import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { TOUR_STEPS, type TourStep } from "@/lib/tour/tour-config";
import { useAuth } from "@/contexts/AuthContext";
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

  const navigateToStepRoute = useCallback(
    (targetRoute: string) => {
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
    [navigateToStepRoute],
  );

  const startTour = useCallback(() => {
    // Ensure demo dataset is loaded so all 14 steps have active, valid buttons
    loadDemoDatasetToStore();
    setIsOpen(true);
    goToStep(0);
  }, [goToStep]);

  const nextStep = useCallback(() => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      goToStep(currentStepIndex + 1);
    } else {
      setIsOpen(false);
    }
  }, [currentStepIndex, goToStep]);

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      goToStep(currentStepIndex - 1);
    }
  }, [currentStepIndex, goToStep]);

  const closeTour = useCallback(() => {
    setIsOpen(false);
  }, []);

  const restartTour = useCallback(() => {
    goToStep(0);
    setIsOpen(true);
  }, [goToStep]);

  const { loading: authLoading } = useAuth();
  const hasAutoStartedRef = useRef(false);

  // Auto-start tour for every user on every visit to the application
  useEffect(() => {
    if (authLoading) return;

    // Load demo dataset automatically in background on visit
    loadDemoDatasetToStore();

    if (!hasAutoStartedRef.current) {
      hasAutoStartedRef.current = true;
      const timer = setTimeout(() => {
        startTour();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [authLoading, startTour]);

  // Listen for global custom event to trigger tour
  useEffect(() => {
    const handleStartTourEvent = () => startTour();
    window.addEventListener("start-interactive-tour", handleStartTourEvent);
    return () => window.removeEventListener("start-interactive-tour", handleStartTourEvent);
  }, [startTour]);

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
