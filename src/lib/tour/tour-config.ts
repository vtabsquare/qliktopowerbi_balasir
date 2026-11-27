export interface TourStep {
  id: string;
  stepNumber: number; // 1 to 14
  title: string;
  shortLabel: string;
  explanation: string;
  selector: string;
  fallbackSelector?: string;
  targetRoute: string;
  placement?: "top" | "bottom" | "left" | "right" | "auto";
  actionHint?: string;
  prepareStep?: () => void;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "continue-to-upload",
    stepNumber: 1,
    title: "Continue to Upload",
    shortLabel: "Upload Stage",
    explanation:
      "Begin your migration by continuing to the upload stage to supply your QlikView documents or explore with preloaded files.",
    selector: '[data-tour="continue-to-upload"]',
    fallbackSelector: 'a[href="/app"]',
    targetRoute: "/app/instructions",
    placement: "bottom",
    actionHint: "Click 'Next' or click the highlighted button to proceed.",
  },
  {
    id: "select-upload-choice",
    stepNumber: 2,
    title: "Select Any One",
    shortLabel: "Select Dataset",
    explanation:
      "Choose how you want to bring data into the platform: upload your own enterprise QlikView package (.qvw with PRJ folder) or explore instantly with preloaded demo files.",
    selector: '[data-tour="select-upload-choice"]',
    fallbackSelector: ".upload-cards-container",
    targetRoute: "/app",
    placement: "top",
    actionHint: "Choose 'I Already Have a File' or 'Use a Demo File'.",
    prepareStep: () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("open-upload-modal"));
      }
    },
  },
  {
    id: "upload-done",
    stepNumber: 3,
    title: "Done",
    shortLabel: "Confirm Selection",
    explanation:
      "Once your dataset or demo files are loaded, click Done to close the selection modal and review your uploaded package.",
    selector: '[data-tour="upload-done"]',
    fallbackSelector: 'button[data-tour="upload-done"]',
    targetRoute: "/app",
    placement: "left",
    actionHint: "Click Done to close the popup and inspect the extracted package.",
    prepareStep: () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("open-upload-modal"));
      }
    },
  },
  {
    id: "review-qvw-analysis",
    stepNumber: 4,
    title: "Review QVW Analysis",
    shortLabel: "QVW Analysis",
    explanation:
      "Your QlikView visualization package has been detected. Click here to review the extracted visual metadata, sheets, UI objects, and expressions.",
    selector: '[data-tour="review-qvw-analysis"]',
    fallbackSelector: 'button[data-tour="review-qvw-analysis"]',
    targetRoute: "/app",
    placement: "bottom",
    actionHint: "Click Review QVW Analysis to navigate to Stage 3.",
    prepareStep: () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("close-upload-modal"));
      }
    },
  },
  {
    id: "convert-expressions",
    stepNumber: 5,
    title: "Convert Expression",
    shortLabel: "Expression Conversion",
    explanation:
      "Advance to the expression conversion stage to translate QlikView chart expressions, set analysis syntax, and variables into modern Power BI DAX.",
    selector: '[data-tour="convert-expressions"]',
    fallbackSelector: 'a[href="/app/expression-conversion"]',
    targetRoute: "/app/qvw-analysis",
    placement: "bottom",
    actionHint: "Click Convert expressions to view the translation workbench.",
  },
  {
    id: "save-expression",
    stepNumber: 6,
    title: "Save",
    shortLabel: "Save Measure",
    explanation:
      "Save custom edits, modified home tables, display folders, format strings, or customized DAX formula expressions for this measure.",
    selector: '[data-tour="save-expression"]',
    fallbackSelector: 'button[data-tour="save-expression"]',
    targetRoute: "/app/expression-conversion",
    placement: "top",
    actionHint: "Save your customized DAX formula adjustments.",
  },
  {
    id: "approve-expression",
    stepNumber: 7,
    title: "Approved",
    shortLabel: "Approve Measure",
    explanation:
      "Mark this expression as reviewed and approved for inclusion in the final Power BI semantic model and production deployment.",
    selector: '[data-tour="approve-expression"]',
    fallbackSelector: 'button[data-tour="approve-expression"]',
    targetRoute: "/app/expression-conversion",
    placement: "top",
    actionHint: "Mark expression as verified and production-ready.",
  },
  {
    id: "proceed-to-etl",
    stepNumber: 8,
    title: "Proceed to ETL Analysis",
    shortLabel: "ETL Analysis",
    explanation:
      "Advance to Stage 5: ETL Analysis to inspect script parsing, verified data types, table lineage, and source connectors.",
    selector: '[data-tour="proceed-to-etl"]',
    fallbackSelector: 'button[data-tour="proceed-to-etl"], a[href="/app/analysis"]',
    targetRoute: "/app/expression-conversion",
    placement: "top",
    actionHint: "Advance to ETL script analysis and source connector mapping.",
  },
  {
    id: "apply-mapping",
    stepNumber: 9,
    title: "Apply Mapping & Re-run Conversion",
    shortLabel: "Apply Mapping",
    explanation:
      "Apply table and connector mapping overrides, then re-run the full extraction pipeline for all mapped tables.",
    selector: '[data-tour="apply-mapping"]',
    fallbackSelector: 'button[data-tour="apply-mapping"]',
    targetRoute: "/app/analysis",
    placement: "top",
    actionHint: "Save connector paths and re-run the extraction pipeline.",
    prepareStep: () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("set-analysis-tab", { detail: "mapping" }));
      }
    },
  },
  {
    id: "power-query-m-code",
    stepNumber: 10,
    title: "Power Query M Code",
    shortLabel: "Power Query Stage",
    explanation:
      "Navigate to Stage 6: Power Query to review surviving tables and inspect synthesized Power Query M transformation code.",
    selector: '[data-tour="power-query-m-code"]',
    fallbackSelector: 'button[data-tour="power-query-m-code"], a[href="/app/power-query"]',
    targetRoute: "/app/analysis",
    placement: "top",
    actionHint: "Advance to Power Query M code generation.",
  },
  {
    id: "generate-m-query",
    stepNumber: 11,
    title: "Generate M Query",
    shortLabel: "Generate M Query",
    explanation:
      "Generate optimized Power Query M transformation code for all surviving tables and verified column types.",
    selector: '[data-tour="generate-m-query"]',
    fallbackSelector: 'button[data-tour="generate-m-query"]',
    targetRoute: "/app/power-query",
    placement: "top",
    actionHint: "Synthesize executable Power Query M transformation scripts.",
    prepareStep: () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("set-analysis-tab", { detail: "mquery" }));
      }
    },
  },
  {
    id: "apply-regenerate-pq",
    stepNumber: 12,
    title: "Apply and Regenerate Power Query",
    shortLabel: "Regenerate Power Query",
    explanation:
      "Configure master calendar settings and re-synthesize the complete Power Query M transformation sequence.",
    selector: '[data-tour="apply-regenerate-pq"]',
    fallbackSelector: 'button[data-tour="apply-regenerate-pq"]',
    targetRoute: "/app/power-query",
    placement: "top",
    actionHint: "Update calendar settings and re-apply transformations.",
  },
  {
    id: "dax-measures",
    stepNumber: 13,
    title: "DAX Measure",
    shortLabel: "DAX Measures Stage",
    explanation:
      "Advance to Stage 7: DAX Measures to inspect automated translation of Qlik variables and set analysis expressions.",
    selector: '[data-tour="dax-measures"]',
    fallbackSelector: 'button[data-tour="dax-measures"], a[href="/app/dax-measures"]',
    targetRoute: "/app/power-query",
    placement: "top",
    actionHint: "Proceed to final DAX measures review.",
  },
  {
    id: "apply-regenerate-dax",
    stepNumber: 14,
    title: "Apply & Regenerate",
    shortLabel: "Apply & Regenerate DAX",
    explanation:
      "Validate all translated DAX expressions and synchronize measures into the Power BI semantic model to unlock Power BI Model.",
    selector: '[data-tour="apply-regenerate-dax"]',
    fallbackSelector: 'button[data-tour="apply-regenerate-dax"]',
    targetRoute: "/app/dax-measures",
    placement: "top",
    actionHint: "Click Apply & Regenerate to validate DAX measures.",
  },
  {
    id: "semantic-model",
    stepNumber: 15,
    title: "Power BI Model",
    shortLabel: "Power BI Model",
    explanation:
      "Proceed to Stage 8: Power BI Model to review your star-schema diagram, table roles, primary keys, and relationships.",
    selector: '[data-tour="semantic-model-export"]',
    fallbackSelector: 'button[data-tour="semantic-model-export"], a[href="/app/powerbi-model"]',
    targetRoute: "/app/dax-measures",
    placement: "top",
    actionHint: "Click Power BI Model to inspect the semantic model.",
  },
  {
    id: "continue-to-validation-export",
    stepNumber: 16,
    title: "Continue to Validation & Export",
    shortLabel: "Validation & Export",
    explanation:
      "After reviewing your Power BI Model and relationships, continue to Validation & Export to inspect readiness checks and export options.",
    selector: '[data-tour="continue-to-validation-export"]',
    fallbackSelector: 'button[data-tour="continue-to-validation-export"], a[href="/app/semantic-model"]',
    targetRoute: "/app/powerbi-model",
    placement: "top",
    actionHint: "Click Continue to Validation & Export.",
  },
  {
    id: "demo-downloads",
    stepNumber: 17,
    title: "Export & Downloads",
    shortLabel: "Downloads",
    explanation:
      "In the Full Enterprise Edition, Download PBIP (.zip), Power Query M Scripts, and Full Analysis JSON export your complete Power BI project. Click any Download option in Demo to contact our team for full access.",
    selector: '[data-tour="demo-downloads"]',
    fallbackSelector: '[data-tour="semantic-model-stage"]',
    targetRoute: "/app/semantic-model",
    placement: "top",
    actionHint: "Tour complete! Click any Download button to request full access, or click Finish.",
  },
];
