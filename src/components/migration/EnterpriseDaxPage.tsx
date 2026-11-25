// EnterpriseDaxPage - used in /app/dax-measures dedicated route
import type { EnterpriseAnalysis } from "@/lib/migration/enterprise-parser";
import type { DaxValidationResult } from "@/lib/migration/dax";
import { TabDaxMeasures } from "./EnterpriseAnalysisPanel";


interface Props {
  analysis: EnterpriseAnalysis;
  onValidationChange?: (results: DaxValidationResult[]) => void;
}

export function EnterpriseDaxPage({ analysis, onValidationChange }: Props) {
  return (
    <div className="space-y-6">
      <div className="surface-card p-4">
        <h3 className="font-display font-semibold text-lg text-foreground mb-1">DAX Measures</h3>
        <p className="text-sm text-muted-foreground mb-4">
          DAX measures automatically translated from Qlik set analysis and variable expressions.
        </p>
        <TabDaxMeasures analysis={analysis} onValidationChange={onValidationChange} />
      </div>
    </div>
  );
}
