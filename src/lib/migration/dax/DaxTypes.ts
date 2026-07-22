import type { ExpressionArtifactType, ExpressionAstNode, ExpressionIssue } from "../expression";

export interface DaxVisualContext {
  dimensions?: string[];
  sortDefinitions?: string[];
  orderedDimension?: string;
  sortDirection?: "ascending" | "descending" | "unknown";
  dateTable?: string;
  dateColumn?: string;
  granularity?: "day" | "week" | "month" | "quarter" | "year" | "fiscal-period" | "category" | "unknown";
  partitionBy?: string[];
  semanticValidationPassed?: boolean;
}

export interface DaxTranslationContext {
  homeTable: string;
  fieldToTable: Record<string, string>;
  variables: Record<string, { definition?: string; evaluatedValue?: string; isCalculated: boolean; proposedPowerBiType?: string }>;
  measureNames?: Record<string, string>;
  visualContext?: DaxVisualContext;
}

export interface DaxTranslationResult {
  dax: string;
  artifactType: ExpressionArtifactType;
  confidence: number;
  status: "automatic" | "warning" | "manual" | "unsupported" | "missing-dependency";
  referencedTables: string[];
  referencedColumns: string[];
  referencedMeasures: string[];
  issues: ExpressionIssue[];
  explanation: string[];
  ast?: ExpressionAstNode;
}
