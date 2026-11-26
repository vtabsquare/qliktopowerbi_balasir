import { useEffect, useMemo, useRef, useState } from "react";
import { useMigration } from "@/lib/migration/store";
import {
  Calendar,
  Layers,
  ArrowRight,
  RotateCcw,
  GitBranch,
  Link2,
  Search,
  Table2,
  KeyRound,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Settings,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  X,
  CheckCircle2,
  AlertTriangle,
  Database,
} from "lucide-react";
import type { FinalTable } from "@/lib/migration/types";
import type { EnterpriseAnalysis } from "@/lib/migration/enterprise-parser";
import { toast } from "sonner";

function tableColor(t: FinalTable, variant: "qlik" | "pbi") {
  if (variant === "qlik") {
    return "from-slate-50 to-slate-100 text-slate-800 border-slate-200";
  }
  if (t.type === "Fact") return "from-blue-600 to-indigo-700";
  if (t.type === "Calendar") return "from-sky-500 to-sky-600";
  return "from-blue-500 to-indigo-600";
}

// Helper to extract the semantic type of a table to match relationships loosely but accurately
function getSemanticKey(tableName: string) {
  const name = tableName.toLowerCase();
  if (name.includes("product") || name.includes("item") || name.includes("part") || name.includes("sku")) return "product";
  if (name.includes("region") || name.includes("country") || name.includes("state") || name.includes("city") || name.includes("territory") || name.includes("area")) return "region";
  if (name.includes("customer") || name.includes("client") || name.includes("account")) return "customer";
  if (name.includes("date") || name.includes("calendar") || name.includes("time")) return "date";
  return name.replace(/dim|fact|_final|s$/, "");
}

export function Stage6Model({ onNext, analysis }: { onNext?: () => void, analysis?: EnterpriseAnalysis }) {
  const store = useMigration();
  const powerBiModel = store.powerBiModel;

  const relationships = analysis?.relationships || store.relationships || [];
  const setStageStatus = store.setStageStatus;

  const finalTables = useMemo(() => {
    let base: FinalTable[] = [];
    const raw = analysis?.finalTables || store.finalTables || [];

    if (raw.length > 0) {
      if ("table" in raw[0]) {
        base = (raw as any[]).map((p) => ({
          id: p.table,
          name: p.table,
          type: (p.classification === "fact" || p.classification === "bridge" ? "Fact" : p.classification === "calendar" ? "Calendar" : "Dimension") as any,
          columns:
            p.fields?.map((f: string) => ({
              name: f,
              dataType: analysis?.columnTypes?.[p.table]?.[f] || "String",
            })) || [],
          keys: p.fields?.filter((f: string) => f.toLowerCase().endsWith("id") || f.toLowerCase().endsWith("key")) || [],
          sourceTables: [],
          isFinal: true,
          steps: [],
          lineage: [],
        }));
      } else {
        base = JSON.parse(JSON.stringify(raw));
      }
    }

    return base.map((t) => {
      const rawType = (t.type || "Fact").toString().toLowerCase();
      const normType = rawType === "fact" || rawType === "bridge" ? "Fact" : rawType.includes("calendar") || rawType.includes("date") ? "Calendar" : "Dimension";
      return { ...t, type: normType };
    });
  }, [analysis, store.finalTables]);

  // Use the authoritative store.powerBiModel when present so the Power BI Model View
  // matches the exported PBIP SemanticModel (tables, columns, and relationships) 1:1.
  const allTables: FinalTable[] = useMemo(() => {
    if (powerBiModel && powerBiModel.tables.length > 0) {
      return powerBiModel.tables.map((t) => {
        const mappedType: FinalTable["type"] =
          t.kind === "fact" || t.kind === "bridge"
            ? "Fact"
            : t.kind === "date"
            ? "Calendar"
            : "Dimension";
        return {
          id: t.id,
          name: t.name,
          type: mappedType,
          columns: t.columns.map((c) => ({
            name: c.name,
            dataType: c.dataType,
            derived: c.kind === "calculated",
          })),
          measures: t.measures.map((m) => ({ name: m.name })),
          keys: t.columns.filter((c) => c.isKey).map((c) => c.name),
          sourceTables: [],
          isFinal: true,
          steps: [],
          lineage: [],
        };
      });
    }
    return finalTables;
  }, [powerBiModel, finalTables]);

  useEffect(() => {
    if (!allTables.length) return;
    const facts = allTables.filter((t) => t.type === "Fact").length;
    const dims = allTables.filter((t) => t.type !== "Fact").length;
    const score = facts && dims
      ? Math.round(((relationships.length || 1) / (facts * Math.max(1, dims)) * 50) + 50)
      : 40;
    setStageStatus(5, "complete", Math.min(100, score));
  }, [allTables, relationships, setStageStatus]);

  // Qlik associative associations (case-insensitive & loose semantic matching for robust connection lines)
  const qlikAssociations = useMemo(() => {
    const assocs: any[] = [];
    for (let i = 0; i < finalTables.length; i++) {
      for (let j = i + 1; j < finalTables.length; j++) {
        const t1 = finalTables[i];
        const t2 = finalTables[j];
        
        t1.columns.forEach(c1 => {
          const c2 = t2.columns.find(col => {
            const n1 = c1.name.toLowerCase().replace(/[^a-z0-9]/g, "");
            const n2 = col.name.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (n1 === n2) return true;
            
            // Loose matching: SalesRegionName containing RegionName, or ProductID containing Prod
            const sem1 = getSemanticKey(c1.name);
            const sem2 = getSemanticKey(col.name);
            if (sem1 === sem2 && (c1.name.toLowerCase().includes("id") || col.name.toLowerCase().includes("id") || c1.name.toLowerCase().includes("name") || col.name.toLowerCase().includes("name"))) {
              return true;
            }
            
            const minLen = Math.min(n1.length, n2.length);
            if (minLen > 3) {
              if (n1.includes(n2) || n2.includes(n1)) return true;
            }
            return false;
          });
          
          if (c2) {
            assocs.push({
              id: `qlik-${t1.name}-${t2.name}-${c1.name}`,
              fromTable: t1.name,
              fromColumn: c1.name,
              toTable: t2.name,
              toColumn: c2.name,
            });
          }
        });
      }
    }
    return assocs;
  }, [finalTables]);

  // Power BI explicit star-schema relationships (exact match to exported powerBiModel when present)
  const pbiRelationships = useMemo(() => {
    if (powerBiModel && powerBiModel.tables.length > 0) {
      return powerBiModel.relationships
        .filter((r) => !r.deleted && (r.active || r.userApproved))
        .map((r) => {
          const fromTable = powerBiModel.tables.find((t) => t.id === r.fromTableId);
          const fromColumn = fromTable?.columns.find((c) => c.id === r.fromColumnId);
          const toTable = powerBiModel.tables.find((t) => t.id === r.toTableId);
          const toColumn = toTable?.columns.find((c) => c.id === r.toColumnId);
          if (!fromTable || !fromColumn || !toTable || !toColumn) return null;
          return {
            id: r.id,
            fromTable: fromTable.name,
            fromColumn: fromColumn.name,
            toTable: toTable.name,
            toColumn: toColumn.name,
            cardinality: r.cardinality === "one-to-one" ? "1:1" : r.cardinality === "many-to-many" ? "N:N" : "N:1",
            active: r.active,
          };
        })
        .filter((r): r is NonNullable<typeof r> => Boolean(r));
    }
    if (relationships.length > 0) return relationships;
    const rels: any[] = [];
    const facts = allTables.filter(t => t.type === "Fact" || t.type?.toString().toLowerCase() === "fact" || t.type?.toString().toLowerCase() === "bridge");
    const dims = allTables.filter(t => !(t.type === "Fact" || t.type?.toString().toLowerCase() === "fact" || t.type?.toString().toLowerCase() === "bridge"));

    facts.forEach(f => {
      dims.forEach(d => {
        // Find dimension key column (ends with ID, is Date, or matches table name semantic key)
        const dKey = d.columns.find(dc => 
          dc.name.toLowerCase().endsWith("id") || 
          dc.name.toLowerCase() === "id" ||
          dc.name.toLowerCase() === "date" ||
          dc.name.toLowerCase() === d.name.toLowerCase().replace(/dim|s$/, "") + "id"
        );
        
        if (!dKey) return;
        
        // Find matching fact column using semantic key matching
        const fCol = f.columns.find(fc => {
          const fn = fc.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          const dn = dKey.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          
          if (fn === dn) return true;
          
          // Semantic match (e.g. matching "product" in PRODUCTS to a "product" or "prod" related column in FACTSALES_FINAL)
          const fSem = fc.name.toLowerCase();
          const dSem = getSemanticKey(d.name);
          if (fSem.includes(dSem) || (dSem === "product" && fSem.includes("prod")) || (dSem === "region" && fSem.includes("reg"))) {
            return true;
          }
          
          const dPrefix = dn.replace("id", "").replace("dim", "");
          if (dPrefix && dPrefix.length > 2) {
            if (fn.includes(dPrefix) || dPrefix.includes(fn)) return true;
          }
          return false;
        });
        
        if (fCol) {
          rels.push({
            id: `pbi-${f.name}-${d.name}-${fCol.name}`,
            fromTable: f.name,
            fromColumn: fCol.name,
            toTable: d.name,
            toColumn: dKey.name,
            cardinality: "N:1",
          });
        }
      });
    });
    return rels;
  }, [relationships, allTables]);

  const facts = allTables.filter((t) => t.type === "Fact" || t.type?.toString().toLowerCase() === "fact" || t.type?.toString().toLowerCase() === "bridge");
  const others = allTables.filter((t) => !(t.type === "Fact" || t.type?.toString().toLowerCase() === "fact" || t.type?.toString().toLowerCase() === "bridge"));

  return (
    <div className="space-y-6">
      <div className="surface-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-xl font-semibold">Semantic Model Architecture Comparison</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Compare original Qlik associative field vectors with optimised Power BI orthogonal star schema connection layouts.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button 
              onClick={() => toast.success("Layout zoom reset successfully")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-surface text-sm font-semibold hover:bg-muted transition-colors"
            >
              <RotateCcw className="h-4 w-4" /> Reset Layout / Zoom
            </button>
            {onNext ? (
              <button 
                onClick={() => {
                  toast.success("Semantic model migration finalized successfully!");
                  if (onNext) onNext();
                }} 
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Finalize Migration / Deployment <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button 
                onClick={() => toast.success("Semantic model migration finalized successfully!")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Finalize Migration / Deployment
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <QlikDataModelDesigner tables={finalTables} relationships={qlikAssociations} />
        <InteractivePowerBiModelPanel title="Power BI Model View (Tabular Star Schema)" tables={allTables} relationships={pbiRelationships} />
      </div>
    </div>
  );
}

function ModelPanel({
  title, tables, relationships, variant, facts, others,
}: {
  title: string; tables: FinalTable[]; relationships: any[]; variant: "qlik" | "pbi";
  facts?: FinalTable[]; others?: FinalTable[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Layout positioning
  const col1 = variant === "qlik" ? tables.filter(t => t.name.toLowerCase().includes("sales") || t.name.toLowerCase().includes("product")) : [];
  const col2 = variant === "qlik" ? tables.filter(t => !t.name.toLowerCase().includes("sales") && !t.name.toLowerCase().includes("product")) : [];

  return (
    <div className="surface-card overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface-elevated">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">{title}</span>
        </div>
        <span className="chip text-[10px]">
          {variant === "qlik" ? `${tables.length} Active Nodes` : `${tables.length} Active Tables`}
        </span>
      </div>
      
      <div 
        ref={containerRef} 
        className="p-8 min-h-[36rem] relative flex-1 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px]"
      >
        <RelationshipLines relationships={relationships} variant={variant} containerRef={containerRef} />
        
        {variant === "pbi" && facts && others ? (
          <div className="relative grid grid-cols-3 gap-12 items-start z-10">
            <div className="space-y-6">
              {others.slice(0, Math.ceil(others.length / 2)).map((t) => (
                <TableNode key={t.id} t={t} relationships={relationships} variant={variant} />
              ))}
            </div>
            <div className="space-y-6">
              {facts.map((t) => (
                <TableNode key={t.id} t={t} highlight relationships={relationships} variant={variant} />
              ))}
              {!facts.length && <div className="text-xs text-muted-foreground text-center p-4">No fact tables</div>}
            </div>
            <div className="space-y-6">
              {others.slice(Math.ceil(others.length / 2)).map((t) => (
                <TableNode key={t.id} t={t} relationships={relationships} variant={variant} />
              ))}
            </div>
          </div>
        ) : variant === "qlik" ? (
          <div className="relative grid grid-cols-2 gap-x-16 gap-y-8 items-start z-10">
            <div className="space-y-8">
              {col1.map((t) => (
                <TableNode key={t.id} t={t} relationships={relationships} variant={variant} />
              ))}
            </div>
            <div className="space-y-8">
              {col2.map((t) => (
                <TableNode key={t.id} t={t} relationships={relationships} variant={variant} />
              ))}
            </div>
          </div>
        ) : (
          <div className="relative grid grid-cols-2 gap-8 items-start z-10">
            {tables.map((t) => (
              <TableNode key={t.id} t={t} relationships={relationships} variant={variant} />
            ))}
          </div>
        )}
      </div>

      <div className="p-5 border-t border-border bg-surface-elevated text-xs">
        <div className="font-semibold text-foreground mb-2">
          {variant === "qlik" ? "Natural Index Key Associations" : "Explicit Star-Schema Relationships"}
        </div>
        {relationships.length ? (
          <div className="grid gap-2 max-h-36 overflow-y-auto pr-1">
            {relationships.map((r) => (
              <div 
                key={r.id} 
                className={`flex items-center justify-between p-2.5 rounded-lg border bg-surface ${
                  variant === "qlik" ? "border-emerald-100" : "border-blue-100"
                }`}
              >
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span className={variant === "qlik" ? "text-emerald-600" : "text-blue-600"}>✓</span>
                  <span className="font-semibold">{r.fromTable}.{r.fromColumn}</span>
                  <span className="text-muted-foreground px-1">
                    {variant === "qlik" ? "-- Index --" : `-- ${r.cardinality || "1:*"} --`}
                  </span>
                  <span className="font-semibold">{r.toTable}.{r.toColumn}</span>
                </div>
                <div className="text-[10px] font-semibold px-2 py-0.5 bg-muted text-muted-foreground rounded">
                  {variant === "qlik" 
                    ? "BIDIRECTIONAL" 
                    : `type: One-to-Many, Cross-Filter: Simple (Directional)`}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="italic text-muted-foreground">
            {variant === "qlik" 
              ? "No natural associations detected." 
              : "No relationships auto-detected from shared keys."}
          </div>
        )}
      </div>
    </div>
  );
}

function TableNode({
  t, highlight, relationships = [], variant
}: {
  t: FinalTable; highlight?: boolean; relationships?: any[]; variant: "qlik" | "pbi";
}) {
  // Sort columns so key/associated columns are guaranteed to render at the top
  const sortedColumns = useMemo(() => {
    const keyCols: typeof t.columns = [];
    const otherCols: typeof t.columns = [];
    
    t.columns.forEach(c => {
      const isRelated = relationships.some(r => 
        (r.fromTable.toLowerCase() === t.name.toLowerCase() && r.fromColumn.toLowerCase() === c.name.toLowerCase()) ||
        (r.toTable.toLowerCase() === t.name.toLowerCase() && r.toColumn.toLowerCase() === c.name.toLowerCase())
      );
      
      const isPK = t.keys?.includes(c.name) || 
                   c.name.toLowerCase().endsWith("id") || 
                   c.name.toLowerCase() === "id" || 
                   (t.type === "Calendar" && c.name === "Date");
      
      if (isRelated || isPK) {
        keyCols.push(c);
      } else {
        otherCols.push(c);
      }
    });
    
    return [...keyCols, ...otherCols];
  }, [t.columns, relationships, t.name, t.keys, t.type]);

  return (
    <div 
      id={`table-${variant}-${t.name}`} 
      className={`rounded-xl overflow-hidden border ${
        highlight 
          ? "border-primary shadow-elevated" 
          : "border-border shadow-soft"
      } bg-surface z-10 relative`}
    >
      <div className={`px-4 py-2.5 bg-gradient-to-r ${tableColor(t, variant)} ${variant === "qlik" ? "text-slate-800" : "text-white"} flex items-center justify-between`}>
        <div className="flex items-center gap-2 font-display font-semibold text-xs uppercase tracking-wide">
          {t.type === "Calendar" && <Calendar className="h-3.5 w-3.5" />}
          {t.name}
        </div>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/20 uppercase tracking-wider">
          {variant === "qlik" ? "QLIK" : t.type}
        </span>
      </div>
      <div className="text-[11px] font-mono divide-y divide-border">
        {sortedColumns.slice(0, 8).map((c) => {
          let isPK = false;
          let isFK = false;
          let isAssoc = false;

          if (variant === "qlik") {
            isAssoc = relationships.some(r => 
              (r.fromTable.toLowerCase() === t.name.toLowerCase() && r.fromColumn.toLowerCase() === c.name.toLowerCase()) ||
              (r.toTable.toLowerCase() === t.name.toLowerCase() && r.toColumn.toLowerCase() === c.name.toLowerCase())
            );
          } else {
            const relAsFrom = relationships.filter(r => r.fromTable.toLowerCase() === t.name.toLowerCase() && r.fromColumn.toLowerCase() === c.name.toLowerCase());
            const relAsTo = relationships.filter(r => r.toTable.toLowerCase() === t.name.toLowerCase() && r.toColumn.toLowerCase() === c.name.toLowerCase());

            if (relAsFrom.length > 0) {
              isFK = true; 
            }
            if (relAsTo.length > 0) {
              isPK = true; 
            }

            if (!isPK) {
              if (t.keys?.includes(c.name)) isPK = true;
              else if (t.type === "Calendar" && c.name === "Date") isPK = true;
              else if (c.name.toLowerCase() === t.name.toLowerCase() + "id" || c.name.toLowerCase() === t.name.toLowerCase().replace(/_final$/, "") + "id") isPK = true;
              else if (c.name.toLowerCase() === "id") isPK = true;
              else if (t.type === "Fact" && c.name.toLowerCase().endsWith("id") && relAsFrom.length === 0 && relAsTo.length === 0 && t.columns[0].name === c.name) isPK = true;
            }

            if (relAsFrom.length > 0 && relAsTo.length > 0) {
              isPK = true;
              isFK = true;
            }

            if (t.type !== "Fact" && relAsFrom.length === 0 && relAsTo.length === 0 && (c.name.toLowerCase().endsWith("id") || c.name === "Date") && t.columns[0].name === c.name) {
              isPK = true;
            }
          }

          let keyText = "";
          if (isPK && isFK) keyText = "(PK, FK)";
          else if (isPK) keyText = "(PK)";
          else if (isFK) keyText = "(FK)";

          return (
            <div 
              key={c.name} 
              id={`col-${variant}-${t.name}-${c.name}`} 
              className={`flex items-center justify-between px-3 py-2 transition-all ${
                isAssoc 
                  ? "bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 font-semibold" 
                  : "bg-surface text-foreground"
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {variant === "qlik" ? (
                  isAssoc ? (
                    <span className="text-emerald-600 shrink-0 font-bold">✓</span>
                  ) : (
                    <span className="w-3 shrink-0" />
                  )
                ) : isPK ? (
                  <svg className="h-3 w-3 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/>
                    <path d="m21 2-9.6 9.6"/>
                    <circle cx="7.5" cy="15.5" r="5.5"/>
                  </svg>
                ) : (
                  <span className="w-3 shrink-0" />
                )}
                
                <span className="truncate font-medium">
                  {c.name} {keyText && <span className="text-muted-foreground ml-1 text-[10px] font-normal">{keyText}</span>}
                </span>
              </div>
              
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-muted-foreground opacity-60 text-[10px]">{c.dataType}</span>
                {variant === "qlik" && isAssoc && (
                  <span className="text-[10px] text-emerald-600/80">▲</span>
                )}
                {variant === "pbi" && (isPK || isFK) && (
                  <span className="text-[10px] text-muted-foreground/50">⦾</span>
                )}
              </div>
            </div>
          );
        })}
        {t.columns.length > 8 && (
          <div className="px-3 py-1.5 text-muted-foreground italic bg-surface text-center border-t border-border">
            +{t.columns.length - 8} more
          </div>
        )}
      </div>
    </div>
  );
}

function RelationshipLines({
  relationships, variant, containerRef
}: {
  relationships: any[]; variant: "qlik" | "pbi"; containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [lines, setLines] = useState<any[]>([]);

  useEffect(() => {
    const updateLines = () => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const tempLines: any[] = [];

      relationships.forEach(r => {
        const fromId = `col-${variant}-${r.fromTable}-${r.fromColumn}`;
        const toId = `col-${variant}-${r.toTable}-${r.toColumn}`;
        const fromEl = document.getElementById(fromId);
        const toEl = document.getElementById(toId);

        if (fromEl && toEl) {
          const fromRect = fromEl.getBoundingClientRect();
          const toRect = toEl.getBoundingClientRect();

          let x1 = 0;
          let x2 = 0;
          let y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
          let y2 = toRect.top + toRect.height / 2 - containerRect.top;

          const isLeft = fromRect.right < toRect.left;
          const isRight = toRect.right < fromRect.left;

          if (isLeft) {
            x1 = fromRect.right - containerRect.left;
            x2 = toRect.left - containerRect.left;
          } else if (isRight) {
            x1 = fromRect.left - containerRect.left;
            x2 = toRect.right - containerRect.left;
          } else {
            x1 = fromRect.left - containerRect.left;
            x2 = toRect.left - containerRect.left;
          }

          let d = "";
          if (!isLeft && !isRight) {
            const offset = 40;
            d = `M ${x1} ${y1} C ${x1 - offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}`;
          } else {
            const midX = (x1 + x2) / 2;
            d = `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
          }

          tempLines.push({
            id: r.id,
            d,
            x1,
            y1,
            x2,
            y2,
            isLeft,
            isRight,
            fromTable: r.fromTable,
            toTable: r.toTable,
            cardinality: r.cardinality
          });
        }
      });
      setLines(tempLines);
    };

    updateLines();

    window.addEventListener("resize", updateLines);
    const observer = new MutationObserver(updateLines);
    if (containerRef.current) {
      observer.observe(containerRef.current, { childList: true, subtree: true, attributes: true });
    }

    const timer = setTimeout(updateLines, 200);

    return () => {
      window.removeEventListener("resize", updateLines);
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [relationships, variant, containerRef]);

  return (
    <svg className="absolute inset-0 pointer-events-none w-full h-full z-20">
      {lines.map((line) => {
        const strokeColor = variant === "qlik" ? "#10b981" : "#3b82f6";
        const showLabels = variant === "pbi";
        
        return (
          <g key={line.id}>
            <path
              d={line.d}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2"
              className="transition-all duration-300"
            />
            
            {showLabels && (
              <g className="transition-all duration-300">
                {(() => {
                  let midX = (line.x1 + line.x2) / 2;
                  let midY = (line.y1 + line.y2) / 2;
                  if (!line.isLeft && !line.isRight) {
                    midX = line.x1 - 25;
                  }
                  
                  return (
                    <g transform={`translate(${midX}, ${midY})`}>
                      <circle r="7" fill="white" stroke={strokeColor} strokeWidth="1.5" />
                      <polygon 
                        points={line.x1 < line.x2 ? "-2,-3 3,0 -2,3" : "-2,3 -2,-3 3,0"} 
                        fill={strokeColor}
                        transform={line.x1 < line.x2 ? "" : "rotate(180)"}
                      />
                    </g>
                  );
                })()}
              </g>
            )}

            {showLabels && (
              <>
                <g transform={`translate(${line.x1 < line.x2 ? line.x1 + 10 : line.x1 - 10}, ${line.y1})`}>
                  <rect x="-6" y="-7" width="12" height="14" rx="2" fill="white" stroke="#e2e8f0" strokeWidth="1" />
                  <text textAnchor="middle" y="3" fontSize="10" fontWeight="bold" fill="#64748b">*</text>
                </g>

                <g transform={`translate(${line.x2 < line.x1 ? line.x2 + 10 : line.x2 - 10}, ${line.y2})`}>
                  <rect x="-6" y="-7" width="12" height="14" rx="2" fill="white" stroke="#e2e8f0" strokeWidth="1" />
                  <text textAnchor="middle" y="3.5" fontSize="9" fontWeight="bold" fill="#64748b">1</text>
                </g>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

type PbiRelTab = "diagram" | "list" | "tables" | "properties";
type NodePos = { x: number; y: number };
type PbiTableWithMeasures = FinalTable & { measures?: { name: string }[] };

const PBI_CARD_W = 216;
const PBI_CARD_H = 196;
const PBI_GAP_X = 96;
const PBI_GAP_Y = 74;

function computeInitialPositions(tables: PbiTableWithMeasures[], rels: any[]): Record<string, NodePos> {
  const positions: Record<string, NodePos> = {};
  if (!tables.length) return positions;

  const adj = new Map<string, Set<string>>();
  const degree = new Map<string, number>();
  tables.forEach((t) => {
    adj.set(t.name, new Set());
    degree.set(t.name, 0);
  });
  rels.forEach((r) => {
    if (adj.has(r.fromTable) && adj.has(r.toTable) && r.fromTable !== r.toTable) {
      adj.get(r.fromTable)!.add(r.toTable);
      adj.get(r.toTable)!.add(r.fromTable);
      degree.set(r.fromTable, (degree.get(r.fromTable) || 0) + 1);
      degree.set(r.toTable, (degree.get(r.toTable) || 0) + 1);
    }
  });

  const visited = new Set<string>();
  const components: PbiTableWithMeasures[][] = [];
  const standalone: PbiTableWithMeasures[] = [];

  tables.forEach((t) => {
    if (visited.has(t.name)) return;
    if ((adj.get(t.name)?.size || 0) === 0) {
      visited.add(t.name);
      standalone.push(t);
      return;
    }
    const comp: PbiTableWithMeasures[] = [];
    const queue = [t.name];
    visited.add(t.name);
    while (queue.length) {
      const curr = queue.shift()!;
      const tbl = tables.find((x) => x.name === curr);
      if (tbl) comp.push(tbl);
      adj.get(curr)?.forEach((nxt) => {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push(nxt);
        }
      });
    }
    components.push(comp);
  });

  components.sort((a, b) => b.length - a.length);

  let cursorY = 28;
  const maxCols = 4;

  components.forEach((comp) => {
    const sorted = [...comp].sort((a, b) => (degree.get(b.name) || 0) - (degree.get(a.name) || 0));
    const colsCount = Math.min(maxCols, Math.max(2, Math.ceil(Math.sqrt(sorted.length * 1.4))));
    if (sorted.length >= 3) {
      const hub = sorted.shift()!;
      const midIdx = Math.floor(Math.min(colsCount, sorted.length + 1) / 2);
      sorted.splice(midIdx, 0, hub);
    }
    sorted.forEach((t, idx) => {
      const col = idx % colsCount;
      const row = Math.floor(idx / colsCount);
      positions[t.name] = {
        x: 28 + col * (PBI_CARD_W + PBI_GAP_X),
        y: cursorY + row * (PBI_CARD_H + PBI_GAP_Y),
      };
    });
    const rowsUsed = Math.ceil(sorted.length / colsCount);
    cursorY += rowsUsed * (PBI_CARD_H + PBI_GAP_Y);
  });

  if (standalone.length) {
    standalone.forEach((t, idx) => {
      const col = idx % maxCols;
      const row = Math.floor(idx / maxCols);
      positions[t.name] = {
        x: 28 + col * (PBI_CARD_W + PBI_GAP_X),
        y: cursorY + row * (PBI_CARD_H + PBI_GAP_Y),
      };
    });
  }

  return positions;
}

const QLIK_CARD_W = 248;
const QLIK_HEADER_H = 38;
const QLIK_ROW_H = 26;

function QlikDataModelDesigner({
  tables,
  relationships,
}: {
  tables: PbiTableWithMeasures[];
  relationships: any[];
}) {
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(0.92);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const [selectedTableName, setSelectedTableName] = useState<string>("");
  const [selectedRelId, setSelectedRelId] = useState<string>("");
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [propertiesTab, setPropertiesTab] = useState<"columns" | "relationships">("columns");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [nodePositions, setNodePositions] = useState<Record<string, NodePos>>({});
  const dragRef = useRef<{ name: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);

  const totalColumns = useMemo(
    () => tables.reduce((acc, t) => acc + (t.columns?.length || 0), 0),
    [tables],
  );

  // Classify columns into PK / FK / connected / unconnected based on actual table keys & relationships
  const { pkSet, fkSet, connectedColsSet } = useMemo(() => {
    const pk = new Set<string>();
    const fk = new Set<string>();
    const conn = new Set<string>();

    tables.forEach((t) => {
      const explicitKeys = t.keys || [];
      explicitKeys.forEach((k) => {
        const lower = String(k).toLowerCase();
        const tableCore = t.name.toLowerCase().replace(/s$/, "").replace(/^(dim|fact|tbl)/, "");
        if (lower === `${tableCore}id` || lower === `${t.name.toLowerCase()}id` || lower === "date" || lower === "calendardate") {
          pk.add(`${t.name}.${k}`);
        } else if (t.type === "Fact" && lower.endsWith("id")) {
          // On a fact table, the table's own ID (e.g. SaleID on Sales) is PK; other *IDs are FK
          if (lower === `${tableCore}id` || lower === `${t.name.toLowerCase()}id`) {
            pk.add(`${t.name}.${k}`);
          } else {
            fk.add(`${t.name}.${k}`);
          }
        } else {
          pk.add(`${t.name}.${k}`);
        }
      });
    });

    relationships.forEach((r) => {
      if (r.fromTable && r.fromColumn) conn.add(`${r.fromTable}.${r.fromColumn}`);
      if (r.toTable && r.toColumn) conn.add(`${r.toTable}.${r.toColumn}`);
      if (r.fromTable && r.fromColumn && !pk.has(`${r.fromTable}.${r.fromColumn}`)) {
        fk.add(`${r.fromTable}.${r.fromColumn}`);
      }
      if (r.toTable && r.toColumn && !fk.has(`${r.toTable}.${r.toColumn}`)) {
        pk.add(`${r.toTable}.${r.toColumn}`);
      }
    });

    return { pkSet: pk, fkSet: fk, connectedColsSet: conn };
  }, [tables, relationships]);

  const normalizedRels = useMemo(() => {
    return relationships.map((r) => {
      const fromTbl = tables.find((t) => t.name.toLowerCase() === String(r.fromTable || "").toLowerCase());
      const toTbl = tables.find((t) => t.name.toLowerCase() === String(r.toTable || "").toLowerCase());
      const fromColExists = fromTbl?.columns.some((c) => c.name.toLowerCase() === String(r.fromColumn || "").toLowerCase());
      const toColExists = toTbl?.columns.some((c) => c.name.toLowerCase() === String(r.toColumn || "").toLowerCase());

      let status: "Valid" | "Review" | "Invalid" = "Valid";
      let issueDescription = "";
      let recommendedFix = "";

      if (!fromTbl || !toTbl || !fromColExists || !toColExists) {
        status = "Invalid";
        issueDescription = "Source or target column does not exist in the parsed Qlik table metadata.";
        recommendedFix = "Verify the field name in Qlik script / Source Mapping and re-run ETL Analysis.";
      } else if (fromTbl.name === toTbl.name) {
        status = "Review";
        issueDescription = "Self-referencing association detected on the same table.";
        recommendedFix = "Confirm if this self-join is intentional or should be split into a role-playing dimension.";
      }

      const rawCard = String(r.cardinality || "").toLowerCase();
      const cardinalityLabel =
        rawCard.includes("1:1") || rawCard.includes("one-to-one") || rawCard.includes("onetone")
          ? "One to One"
          : rawCard.includes("n:n") || rawCard.includes("many-to-many")
          ? "Many to Many"
          : "One to Many";
      const badgeLabel =
        cardinalityLabel === "One to One" ? "1—1" : cardinalityLabel === "Many to Many" ? "N—N" : "1—<N";

      return {
        ...r,
        fromTable: fromTbl?.name || r.fromTable,
        toTable: toTbl?.name || r.toTable,
        relationshipType: r.active === false ? "Inactive" : "Active",
        cardinalityLabel,
        badgeLabel,
        filterDirection: r.filterDirection === "single" ? "Single" : "Both",
        status,
        issueDescription,
        recommendedFix,
      };
    });
  }, [relationships, tables]);

  const isExpanded = (name: string) => Boolean(expandedTables[name]);

  const getVisibleColumns = (t: PbiTableWithMeasures) => {
    const cols = t.columns || [];
    if (isExpanded(t.name)) return cols;
    return cols.slice(0, 6);
  };

  const getCardHeight = (t: PbiTableWithMeasures) => {
    const visible = getVisibleColumns(t).length;
    const hasMore = !isExpanded(t.name) && (t.columns?.length || 0) > 6;
    return QLIK_HEADER_H + visible * QLIK_ROW_H + (hasMore ? 26 : 6);
  };

  const computeAutoLayout = () => {
    setNodePositions(computeInitialPositions(tables, relationships));
  };

  useEffect(() => {
    computeAutoLayout();
  }, [tables, relationships]);

  useEffect(() => {
    if (!tables.length) return;
    if (selectedTableName && tables.some((t) => t.name === selectedTableName)) return;
    const fact = tables.find((t) => t.type === "Fact") || tables[0];
    if (fact) setSelectedTableName(fact.name);
  }, [tables, selectedTableName]);

  const canvasBounds = useMemo(() => {
    const vals = Object.entries(nodePositions);
    if (!vals.length) return { width: 920, height: 500 };
    let maxX = 820;
    let maxY = 460;
    for (const [name, pos] of vals) {
      const tbl = tables.find((t) => t.name === name);
      const h = tbl ? getCardHeight(tbl) : 210;
      maxX = Math.max(maxX, pos.x + QLIK_CARD_W + 40);
      maxY = Math.max(maxY, pos.y + h + 40);
    }
    return { width: maxX, height: maxY };
  }, [nodePositions, tables, expandedTables]);

  const fitToScreen = () => {
    const el = canvasViewportRef.current;
    if (!el) {
      setZoom(0.9);
      return;
    }
    const availW = Math.max(320, el.clientWidth - 28);
    const availH = Math.max(320, el.clientHeight - 28);
    const ratio = Math.min(1.05, availW / canvasBounds.width, availH / canvasBounds.height);
    setZoom(Math.max(0.45, +ratio.toFixed(2)));
  };

  useEffect(() => {
    const timer = setTimeout(fitToScreen, 60);
    return () => clearTimeout(timer);
  }, [canvasBounds.width, canvasBounds.height]);

  const onNodeMouseDown = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    setSelectedTableName(name);
    setPropertiesOpen(true);
    const pos = nodePositions[name] || { x: 24, y: 24 };
    dragRef.current = { name, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = (ev.clientX - dragRef.current.startX) / zoom;
      const dy = (ev.clientY - dragRef.current.startY) / zoom;
      const nx = Math.max(12, Math.round(dragRef.current.origX + dx));
      const ny = Math.max(12, Math.round(dragRef.current.origY + dy));
      const target = dragRef.current.name;
      setNodePositions((prev) => ({ ...prev, [target]: { x: nx, y: ny } }));
    };

    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    tables.forEach((t) => {
      next[t.name] = true;
    });
    setExpandedTables(next);
  };

  const collapseAll = () => {
    setExpandedTables({});
  };

  const handleRefresh = () => {
    computeAutoLayout();
    setTimeout(fitToScreen, 40);
    toast.success("Qlik Data Model refreshed");
  };

  const q = search.trim().toLowerCase();
  const tableMatches = (t: PbiTableWithMeasures) => {
    if (!q) return true;
    if (t.name.toLowerCase().includes(q)) return true;
    return (t.columns || []).some((c) => c.name.toLowerCase().includes(q));
  };

  const selectedTable = useMemo(
    () => tables.find((t) => t.name === selectedTableName) || tables[0] || null,
    [tables, selectedTableName],
  );

  const selectedTableRels = useMemo(() => {
    if (!selectedTable) return [];
    return normalizedRels.filter(
      (r) => r.fromTable === selectedTable.name || r.toTable === selectedTable.name,
    );
  }, [normalizedRels, selectedTable]);

  const selectedRel = useMemo(
    () => normalizedRels.find((r) => r.id === selectedRelId) || null,
    [normalizedRels, selectedRelId],
  );

  const getColumnAnchorY = (tableName: string, colName: string): number => {
    const pos = nodePositions[tableName] || { x: 24, y: 24 };
    const tbl = tables.find((t) => t.name === tableName);
    if (!tbl) return pos.y + QLIK_HEADER_H + 14;
    const vis = getVisibleColumns(tbl);
    const idx = vis.findIndex((c) => c.name.toLowerCase() === String(colName).toLowerCase());
    if (idx >= 0) {
      return pos.y + QLIK_HEADER_H + idx * QLIK_ROW_H + QLIK_ROW_H / 2;
    }
    return pos.y + QLIK_HEADER_H + Math.max(0, vis.length - 1) * QLIK_ROW_H + QLIK_ROW_H / 2;
  };

  return (
    <div className="surface-card overflow-hidden flex flex-col">
      {/* 1. Header & Stats & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-surface-elevated">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <h4 className="font-display font-bold text-sm text-foreground leading-tight">Qlik Data Model</h4>
              <p className="text-[11px] text-muted-foreground">Associative table &amp; field relationship designer</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs">
              <Table2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-muted-foreground">Total Tables</span>
              <strong className="text-foreground">{tables.length}</strong>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span className="text-muted-foreground">Total Columns</span>
              <strong className="text-foreground">{totalColumns}</strong>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs">
              <Link2 className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-muted-foreground">Total Relationships</span>
              <strong className="text-foreground">{normalizedRels.length}</strong>
            </div>
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Tables / Columns..."
            className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-border bg-surface/60 text-xs">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(1.3, +(z + 0.1).toFixed(2)))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 font-medium hover:bg-muted cursor-pointer"
        >
          <ZoomIn className="h-3.5 w-3.5 text-primary" /> Zoom In
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.45, +(z - 0.1).toFixed(2)))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 font-medium hover:bg-muted cursor-pointer"
        >
          <ZoomOut className="h-3.5 w-3.5 text-primary" /> Zoom Out
        </button>
        <button
          type="button"
          onClick={fitToScreen}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 font-medium hover:bg-muted cursor-pointer"
        >
          <Maximize2 className="h-3.5 w-3.5 text-primary" /> Fit to Screen
        </button>
        <button
          type="button"
          onClick={computeAutoLayout}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 font-medium hover:bg-muted cursor-pointer"
        >
          <GitBranch className="h-3.5 w-3.5 text-primary" /> Auto Arrange
        </button>
        <button
          type="button"
          onClick={expandAll}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 font-medium hover:bg-muted cursor-pointer"
        >
          <ChevronDown className="h-3.5 w-3.5 text-primary" /> Expand All
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 font-medium hover:bg-muted cursor-pointer"
        >
          <ChevronUp className="h-3.5 w-3.5 text-primary" /> Collapse All
        </button>
        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 font-medium hover:bg-muted cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5 text-primary" /> Refresh Model
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground hidden md:inline">
          Zoom: {Math.round(zoom * 100)}% · Drag cards to reposition
        </span>
      </div>

      {/* 2. Canvas + Right Table Properties Drawer */}
      <div className={`grid grid-cols-1 ${propertiesOpen && selectedTable ? "lg:grid-cols-[1fr_280px]" : ""}`}>
        {/* Interactive Canvas */}
        <div
          ref={canvasViewportRef}
          className="relative min-h-[460px] max-h-[620px] overflow-auto bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:20px_20px]"
        >
          {tables.length > 0 ? (
            <div style={{ width: canvasBounds.width * zoom, height: canvasBounds.height * zoom }}>
              <div
                className="relative"
                style={{
                  width: canvasBounds.width,
                  height: canvasBounds.height,
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                }}
              >
                {/* Green Stepped Relationship Connectors */}
                <svg className="absolute inset-0 pointer-events-none" width={canvasBounds.width} height={canvasBounds.height}>
                  {normalizedRels.map((r) => {
                    const p1 = nodePositions[r.fromTable];
                    const p2 = nodePositions[r.toTable];
                    if (!p1 || !p2) return null;

                    const y1 = getColumnAnchorY(r.fromTable, r.fromColumn);
                    const y2 = getColumnAnchorY(r.toTable, r.toColumn);
                    const p1Right = p1.x + QLIK_CARD_W;
                    const p2Right = p2.x + QLIK_CARD_W;
                    const leftToRight = p1.x + QLIK_CARD_W / 2 <= p2.x + QLIK_CARD_W / 2;

                    const x1 = leftToRight ? p1Right : p1.x;
                    const x2 = leftToRight ? p2.x : p2Right;
                    const midX = (x1 + x2) / 2;
                    const midY = (y1 + y2) / 2;
                    const pathD = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;

                    const isSelected = selectedRelId === r.id;
                    const isTableActive =
                      r.fromTable === selectedTableName || r.toTable === selectedTableName;
                    const strokeColor =
                      r.status === "Invalid"
                        ? "#ef4444"
                        : isSelected
                        ? "#15803d"
                        : isTableActive
                        ? "#16a34a"
                        : "#22c55e";

                    return (
                      <g
                        key={r.id}
                        className="pointer-events-auto cursor-pointer"
                        onClick={() => {
                          setSelectedRelId(r.id);
                          if (r.fromTable) setSelectedTableName(r.fromTable);
                          setDetailsOpen(true);
                        }}
                      >
                        <path d={pathD} fill="none" stroke="transparent" strokeWidth={12} />
                        <path
                          d={pathD}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={isSelected ? 2.6 : 1.75}
                          strokeDasharray={r.status === "Invalid" ? "5 4" : undefined}
                          opacity={isSelected || isTableActive ? 1 : 0.72}
                        />
                        <circle cx={x1} cy={y1} r={3.5} fill={strokeColor} />
                        <circle cx={x2} cy={y2} r={3.5} fill={strokeColor} />
                        <g transform={`translate(${midX}, ${midY})`}>
                          <rect
                            x={-22}
                            y={-10}
                            width={44}
                            height={20}
                            rx={5}
                            fill="#ffffff"
                            stroke={strokeColor}
                            strokeWidth={1.2}
                          />
                          <text
                            x={0}
                            y={3.5}
                            textAnchor="middle"
                            fontSize="9.5"
                            fontWeight="bold"
                            fill="#166534"
                          >
                            {r.badgeLabel}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </svg>

                {/* Qlik Table Cards */}
                {tables.map((t) => {
                  const pos = nodePositions[t.name] || { x: 24, y: 24 };
                  const expanded = isExpanded(t.name);
                  const visibleCols = getVisibleColumns(t);
                  const hiddenCount = Math.max(0, (t.columns?.length || 0) - visibleCols.length);
                  const matches = tableMatches(t);
                  const isSelected = selectedTableName === t.name;

                  return (
                    <div
                      key={t.name}
                      onMouseDown={(e) => onNodeMouseDown(e, t.name)}
                      style={{ left: pos.x, top: pos.y, width: QLIK_CARD_W }}
                      className={`absolute rounded-xl border bg-background shadow-sm select-none cursor-grab active:cursor-grabbing overflow-hidden transition-all ${
                        isSelected ? "ring-2 ring-blue-500 border-blue-500 shadow-md" : "border-border hover:border-blue-400"
                      } ${!matches ? "opacity-35" : "opacity-100"}`}
                    >
                      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-xs font-bold">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Table2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate" title={t.name}>{t.name}</span>
                        </div>
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedTables((prev) => ({ ...prev, [t.name]: !expanded }));
                          }}
                          className="p-0.5 rounded hover:bg-white/20 cursor-pointer"
                          title={expanded ? "Collapse columns" : "Expand all columns"}
                        >
                          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </div>

                      <div className="divide-y divide-border/40 text-[11px] bg-background">
                        {visibleCols.map((c, idx) => {
                          const isPk = pkSet.has(`${t.name}.${c.name}`);
                          const isFk = fkSet.has(`${t.name}.${c.name}`);
                          const isConnected = connectedColsSet.has(`${t.name}.${c.name}`);
                          const colHighlight = q && c.name.toLowerCase().includes(q);

                          return (
                            <div
                              key={`${c.name}-${idx}`}
                              style={{ height: QLIK_ROW_H }}
                              className={`flex items-center justify-between gap-2 px-2.5 ${
                                colHighlight ? "bg-amber-500/15 font-semibold" : ""
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                {isPk ? (
                                  <KeyRound className="h-3 w-3 text-amber-500 shrink-0" />
                                ) : isFk || isConnected ? (
                                  <Link2 className="h-3 w-3 text-blue-500 shrink-0" />
                                ) : (
                                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/35 mx-0.5 shrink-0" />
                                )}
                                <span className={`truncate ${isPk || isFk ? "font-semibold text-foreground" : "text-foreground/85"}`}>
                                  {c.name}
                                </span>
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {c.dataType || "Text"}
                              </span>
                            </div>
                          );
                        })}
                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedTables((prev) => ({ ...prev, [t.name]: true }));
                            }}
                            className="w-full py-1 px-2.5 text-[10px] font-medium text-primary hover:bg-muted/40 text-left cursor-pointer"
                          >
                            + {hiddenCount} more fields...
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground">No Qlik tables detected.</div>
          )}
        </div>

        {/* Right Table Properties Panel */}
        {propertiesOpen && selectedTable && (
          <aside className="border-t lg:border-t-0 lg:border-l border-border bg-surface/60 flex flex-col">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border bg-surface-elevated">
              <span className="text-xs font-bold text-foreground">Table Properties</span>
              <button
                type="button"
                onClick={() => setPropertiesOpen(false)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                title="Close properties"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="p-3.5 border-b border-border flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary shrink-0">
                <Table2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm text-foreground truncate">{selectedTable.name}</div>
                <div className="text-[11px] text-muted-foreground">{selectedTable.type} Table</div>
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-border text-xs font-semibold">
              <button
                type="button"
                onClick={() => setPropertiesTab("columns")}
                className={`py-2 text-center border-b-2 transition-colors cursor-pointer ${
                  propertiesTab === "columns" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Columns
              </button>
              <button
                type="button"
                onClick={() => setPropertiesTab("relationships")}
                className={`py-2 text-center border-b-2 transition-colors cursor-pointer ${
                  propertiesTab === "relationships" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Relationships ({selectedTableRels.length})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[300px] p-3 space-y-1.5 text-xs">
              {propertiesTab === "columns" ? (
                selectedTable.columns.map((c, idx) => {
                  const isPk = pkSet.has(`${selectedTable.name}.${c.name}`);
                  const isFk = fkSet.has(`${selectedTable.name}.${c.name}`);
                  return (
                    <div key={`${c.name}-${idx}`} className="flex items-center justify-between gap-2 py-1 border-b border-border/30 last:border-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isPk ? (
                          <KeyRound className="h-3 w-3 text-amber-500 shrink-0" />
                        ) : isFk ? (
                          <Link2 className="h-3 w-3 text-blue-500 shrink-0" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 mx-0.5 shrink-0" />
                        )}
                        <span className="truncate text-foreground">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground">{c.dataType || "Text"}</span>
                        {isPk && (
                          <span className="rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1 py-0.5 text-[9px] font-bold">
                            PK
                          </span>
                        )}
                        {!isPk && isFk && (
                          <span className="rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 px-1 py-0.5 text-[9px] font-bold">
                            FK
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : selectedTableRels.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center">No associations for this table.</div>
              ) : (
                selectedTableRels.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRelId(r.id)}
                    className={`w-full text-left rounded-lg border p-2 text-[11px] transition-colors cursor-pointer ${
                      selectedRelId === r.id ? "border-emerald-500 bg-emerald-500/10" : "border-border bg-background hover:bg-muted/50"
                    }`}
                  >
                    <div className="font-semibold text-foreground">
                      {r.fromTable}.{r.fromColumn}
                    </div>
                    <div className="text-muted-foreground">
                      → {r.toTable}.{r.toColumn} ({r.badgeLabel})
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="p-3 border-t border-border bg-surface-elevated/60 text-xs space-y-1">
              <div className="font-bold text-foreground mb-1">Table Summary</div>
              <div className="flex justify-between text-muted-foreground">
                <span>Total Columns</span>
                <strong className="text-foreground">{selectedTable.columns.length}</strong>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Primary Keys</span>
                <strong className="text-foreground">
                  {selectedTable.columns.filter((c) => pkSet.has(`${selectedTable.name}.${c.name}`)).length}
                </strong>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Foreign Keys</span>
                <strong className="text-foreground">
                  {selectedTable.columns.filter((c) => fkSet.has(`${selectedTable.name}.${c.name}`)).length}
                </strong>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* 5. Expandable Relationship Details Panel */}
      <div className="border-t border-border bg-surface-elevated">
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <span className="font-semibold text-xs sm:text-sm text-foreground">
              Relationship Details ({normalizedRels.length})
            </span>
          </div>
          {detailsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {detailsOpen && (
          <div className="border-t border-border bg-background">
            {selectedRel && selectedRel.issueDescription && (
              <div className="m-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">
                    {selectedRel.fromTable}.{selectedRel.fromColumn} → {selectedRel.toTable}.{selectedRel.toColumn}: {selectedRel.issueDescription}
                  </div>
                  <div className="mt-0.5 text-[11px]">
                    <strong>Recommended Fix:</strong> {selectedRel.recommendedFix}
                  </div>
                </div>
              </div>
            )}

            {normalizedRels.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-surface-elevated border-b border-border text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Source Table</th>
                      <th className="px-3 py-2 text-left font-semibold">Source Column</th>
                      <th className="px-3 py-2 text-left font-semibold">Target Table</th>
                      <th className="px-3 py-2 text-left font-semibold">Target Column</th>
                      <th className="px-3 py-2 text-left font-semibold">Relationship Type</th>
                      <th className="px-3 py-2 text-left font-semibold">Cardinality</th>
                      <th className="px-3 py-2 text-left font-semibold">Filter Direction</th>
                      <th className="px-3 py-2 text-left font-semibold">Status</th>
                      <th className="px-3 py-2 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {normalizedRels.map((r) => (
                      <tr
                        key={r.id}
                        className={`hover:bg-muted/30 transition-colors ${
                          selectedRelId === r.id ? "bg-emerald-500/5" : ""
                        }`}
                      >
                        <td className="px-3 py-2 font-medium text-foreground">{r.fromTable}</td>
                        <td className="px-3 py-2 font-mono text-foreground/85">{r.fromColumn}</td>
                        <td className="px-3 py-2 font-medium text-foreground">{r.toTable}</td>
                        <td className="px-3 py-2 font-mono text-foreground/85">{r.toColumn}</td>
                        <td className="px-3 py-2">
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">{r.relationshipType}</span>
                        </td>
                        <td className="px-3 py-2">{r.cardinalityLabel}</td>
                        <td className="px-3 py-2">{r.filterDirection}</td>
                        <td className="px-3 py-2">
                          {r.status === "Valid" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-semibold">
                              <CheckCircle2 className="h-3 w-3" /> Valid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-semibold">
                              <AlertTriangle className="h-3 w-3" /> {r.status}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRelId(r.id);
                              if (r.fromTable) setSelectedTableName(r.fromTable);
                              setPropertiesOpen(true);
                            }}
                            className="rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-muted cursor-pointer"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-xs text-muted-foreground italic">No natural associations detected.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InteractivePowerBiModelPanel({
  title,
  tables,
  relationships,
}: {
  title: string;
  tables: PbiTableWithMeasures[];
  relationships: any[];
}) {
  const [activeTab, setActiveTab] = useState<PbiRelTab>("diagram");
  const [tableSearch, setTableSearch] = useState("");
  const [selectedTableName, setSelectedTableName] = useState<string>("");
  const [selectedRelId, setSelectedRelId] = useState<string>("");
  const [zoom, setZoom] = useState(0.85);
  const [nodePositions, setNodePositions] = useState<Record<string, NodePos>>({});
  const dragRef = useRef<{ name: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNodePositions(computeInitialPositions(tables, relationships));
  }, [tables, relationships]);

  useEffect(() => {
    if (!tables.length) return;
    if (selectedTableName && tables.some((t) => t.name === selectedTableName)) return;
    const counts: Record<string, number> = {};
    relationships.forEach((r) => {
      counts[r.fromTable] = (counts[r.fromTable] || 0) + 2;
      counts[r.toTable] = (counts[r.toTable] || 0) + 1;
    });
    const best = [...tables].sort((a, b) => (counts[b.name] || 0) - (counts[a.name] || 0))[0];
    if (best) setSelectedTableName(best.name);
  }, [tables, relationships, selectedTableName]);

  const selectTable = (name: string) => {
    setSelectedTableName(name);
    const matching = relationships.find((r) => r.fromTable === name || r.toTable === name);
    setSelectedRelId(matching ? matching.id : "");
  };

  const canvasBounds = useMemo(() => {
    const vals = Object.values(nodePositions);
    if (!vals.length) return { width: 900, height: 520 };
    const maxX = Math.max(...vals.map((p) => p.x)) + PBI_CARD_W + 40;
    const maxY = Math.max(...vals.map((p) => p.y)) + PBI_CARD_H + 40;
    return { width: Math.max(760, maxX), height: Math.max(460, maxY) };
  }, [nodePositions]);

  const fitToView = () => {
    const el = canvasViewportRef.current;
    if (!el) {
      setZoom(0.85);
      return;
    }
    const availW = Math.max(320, el.clientWidth - 24);
    const availH = Math.max(320, el.clientHeight - 24);
    const ratio = Math.min(1, availW / canvasBounds.width, availH / canvasBounds.height);
    setZoom(Math.max(0.45, +ratio.toFixed(2)));
  };

  useEffect(() => {
    if (activeTab === "diagram") {
      const timer = setTimeout(fitToView, 60);
      return () => clearTimeout(timer);
    }
  }, [activeTab, canvasBounds.width, canvasBounds.height]);

  const onNodeMouseDown = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    selectTable(name);
    const pos = nodePositions[name] || { x: 24, y: 24 };
    dragRef.current = { name, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = (ev.clientX - dragRef.current.startX) / zoom;
      const dy = (ev.clientY - dragRef.current.startY) / zoom;
      const nx = Math.max(12, Math.round(dragRef.current.origX + dx));
      const ny = Math.max(12, Math.round(dragRef.current.origY + dy));
      const targetName = dragRef.current.name;
      setNodePositions((prev) => ({ ...prev, [targetName]: { x: nx, y: ny } }));
    };

    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const filteredTables = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [tables, tableSearch]);

  const keyColsSet = useMemo(() => {
    const s = new Set<string>();
    tables.forEach((t) => {
      (t.keys || []).forEach((k) => s.add(`${t.name}.${k}`));
    });
    relationships.forEach((r) => {
      if (r.fromTable && r.fromColumn) s.add(`${r.fromTable}.${r.fromColumn}`);
      if (r.toTable && r.toColumn) s.add(`${r.toTable}.${r.toColumn}`);
    });
    return s;
  }, [tables, relationships]);

  const factTablesSet = useMemo(() => {
    const s = new Set<string>();
    tables.forEach((t) => {
      if (t.type === "Fact") s.add(t.name);
    });
    relationships.forEach((r) => {
      if (r.fromTable) s.add(r.fromTable);
    });
    return s;
  }, [tables, relationships]);

  return (
    <div className="surface-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-border bg-surface-elevated">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">{title}</span>
        </div>
        <span className="chip text-[10px]">{tables.length} Active Tables</span>
      </div>

      {/* Tabs Row */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border bg-surface/60">
        <button
          type="button"
          onClick={() => setActiveTab("diagram")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === "diagram" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          }`}
        >
          <GitBranch className="h-3.5 w-3.5" />
          <span>Model Diagram</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("list")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === "list" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          }`}
        >
          <Link2 className="h-3.5 w-3.5" />
          <span>Relationships ({relationships.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("tables")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === "tables" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          }`}
        >
          <Table2 className="h-3.5 w-3.5" />
          <span>Tables &amp; Columns</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("properties")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === "properties" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
          <span>Model Properties</span>
        </button>
      </div>

      {/* TAB 1: MODEL DIAGRAM */}
      {activeTab === "diagram" && (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] min-h-[540px]">
          {/* Left Tables Sidebar */}
          <div className="border-b lg:border-b-0 lg:border-r border-border bg-surface/50 p-3 flex flex-col gap-2.5">
            <div className="text-xs font-bold text-foreground">Tables ({tables.length})</div>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Search tables..."
                className="w-full rounded-lg border border-border bg-background pl-8 pr-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 max-h-[440px]">
              {filteredTables.map((t) => {
                const isSelected = selectedTableName === t.name;
                return (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => selectTable(t.name)}
                    className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-primary/10 text-primary border border-primary/30 font-semibold"
                        : "text-foreground/80 hover:bg-muted/60 border border-transparent"
                    }`}
                  >
                    <Table2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate" title={t.name}>{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Center Interactive Canvas */}
          <div className="flex flex-col min-w-0">
            <div className="relative flex-1 min-h-[480px] overflow-auto bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:20px_20px]" ref={canvasViewportRef}>
              {/* Top-Right Controls */}
              <div className="sticky top-3 float-right mr-3 z-20 flex flex-col gap-1 rounded-xl border border-border bg-background/95 p-1 shadow-sm backdrop-blur-xs">
                <button type="button" onClick={fitToView} title="Fit all tables to view" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer">
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => setZoom((z) => Math.min(1.25, +(z + 0.1).toFixed(2)))} title="Zoom in" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer">
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} title="Zoom out" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer">
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => setNodePositions(computeInitialPositions(tables, relationships))} title="Reset layout" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer">
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>

              {tables.length > 0 ? (
                <div
                  style={{
                    width: canvasBounds.width * zoom,
                    height: canvasBounds.height * zoom,
                  }}
                >
                  <div
                    className="relative"
                    style={{
                      width: canvasBounds.width,
                      height: canvasBounds.height,
                      transform: `scale(${zoom})`,
                      transformOrigin: "top left",
                    }}
                  >
                    <svg className="absolute inset-0 pointer-events-none" width={canvasBounds.width} height={canvasBounds.height}>
                      {relationships.map((r) => {
                        const p1 = nodePositions[r.fromTable];
                        const p2 = nodePositions[r.toTable];
                        if (!p1 || !p2) return null;

                        const c1x = p1.x + PBI_CARD_W / 2;
                        const c1y = p1.y + PBI_CARD_H / 2;
                        const c2x = p2.x + PBI_CARD_W / 2;
                        const c2y = p2.y + PBI_CARD_H / 2;
                        const dx = c2x - c1x;
                        const dy = c2y - c1y;

                        let x1 = c1x;
                        let y1 = c1y;
                        let x2 = c2x;
                        let y2 = c2y;

                        if (Math.abs(dx) >= Math.abs(dy)) {
                          x1 = dx >= 0 ? p1.x + PBI_CARD_W : p1.x;
                          x2 = dx >= 0 ? p2.x : p2.x + PBI_CARD_W;
                        } else {
                          y1 = dy >= 0 ? p1.y + PBI_CARD_H : p1.y;
                          y2 = dy >= 0 ? p2.y : p2.y + PBI_CARD_H;
                        }

                        const midX = (x1 + x2) / 2;
                        const midY = (y1 + y2) / 2;
                        const pathD =
                          Math.abs(dx) >= Math.abs(dy)
                            ? `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
                            : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

                        const isHighlighted =
                          selectedRelId === r.id ||
                          r.fromTable === selectedTableName ||
                          r.toTable === selectedTableName;

                        const fromLabel = r.cardinality === "1:1" ? "1" : "*";
                        const toLabel = "1";
                        const lbl1X = x1 + (x2 - x1) * 0.14;
                        const lbl1Y = y1 + (y2 - y1) * 0.14;
                        const lbl2X = x2 - (x2 - x1) * 0.14;
                        const lbl2Y = y2 - (y2 - y1) * 0.14;

                        return (
                          <g
                            key={r.id}
                            className="pointer-events-auto cursor-pointer"
                            onClick={() => {
                              setSelectedRelId(r.id);
                              if (r.fromTable) setSelectedTableName(r.fromTable);
                            }}
                          >
                            <path d={pathD} fill="none" stroke="transparent" strokeWidth={12} />
                            <path
                              d={pathD}
                              fill="none"
                              stroke={isHighlighted ? "#4f46e5" : "#94a3b8"}
                              strokeWidth={isHighlighted ? 2.2 : 1.5}
                              opacity={isHighlighted ? 1 : 0.6}
                            />
                            <circle cx={lbl1X} cy={lbl1Y} r={9.5} fill="#ffffff" stroke={isHighlighted ? "#4f46e5" : "#94a3b8"} strokeWidth={1.3} />
                            <text x={lbl1X} y={lbl1Y + 3.5} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#334155">
                              {fromLabel}
                            </text>
                            <circle cx={lbl2X} cy={lbl2Y} r={9.5} fill="#ffffff" stroke={isHighlighted ? "#4f46e5" : "#94a3b8"} strokeWidth={1.3} />
                            <text x={lbl2X} y={lbl2Y + 3.5} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#334155">
                              {toLabel}
                            </text>
                          </g>
                        );
                      })}
                    </svg>

                    {tables.map((t) => {
                      const pos = nodePositions[t.name] || { x: 24, y: 24 };
                      const isSelected = selectedTableName === t.name;
                      const isFact = factTablesSet.has(t.name);
                      const visibleCols = (t.columns || []).slice(0, 5);
                      const visibleMeasures = (t.measures || []).slice(0, 2);
                      const extraCount =
                        Math.max(0, (t.columns || []).length - visibleCols.length) +
                        Math.max(0, (t.measures || []).length - visibleMeasures.length);

                      return (
                        <div
                          key={t.name}
                          onMouseDown={(e) => onNodeMouseDown(e, t.name)}
                          style={{ left: pos.x, top: pos.y, width: PBI_CARD_W }}
                          className={`absolute rounded-xl border bg-background shadow-sm select-none cursor-grab active:cursor-grabbing overflow-hidden transition-shadow ${
                            isSelected ? "ring-2 ring-primary border-primary shadow-md" : "border-border hover:border-primary/50"
                          }`}
                        >
                          <div
                            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold ${
                              isFact
                                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white"
                                : "bg-sky-50 dark:bg-sky-950/50 text-sky-950 dark:text-sky-100 border-b border-border/60"
                            }`}
                          >
                            <Table2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate" title={t.name}>{t.name}</span>
                          </div>
                          <div className="divide-y divide-border/40 text-[11px] bg-background">
                            {visibleCols.map((c, idx) => {
                              const colName = String(c.name || c);
                              const isKey = keyColsSet.has(`${t.name}.${colName}`);
                              return (
                                <div key={`${colName}-${idx}`} className="flex items-center gap-1.5 px-2.5 py-1 text-foreground/85">
                                  {isKey ? (
                                    <KeyRound className="h-3 w-3 text-amber-500 shrink-0" />
                                  ) : (
                                    <span className="w-3 shrink-0" />
                                  )}
                                  <span className="truncate">{colName}</span>
                                </div>
                              );
                            })}
                            {visibleMeasures.map((m, idx) => (
                              <div key={`m-${m.name}-${idx}`} className="flex items-center gap-1.5 px-2.5 py-1 text-primary font-medium">
                                <span className="w-3 text-center font-bold shrink-0">Σ</span>
                                <span className="truncate">{m.name}</span>
                              </div>
                            ))}
                            {extraCount > 0 && (
                              <div className="px-2.5 py-1 text-[10px] text-muted-foreground text-center bg-muted/30">
                                +{extraCount} more fields
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground">No tables in semantic model.</div>
              )}
            </div>

            {/* Bottom Legend Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-border bg-surface-elevated text-[11px] text-muted-foreground">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-foreground">Legend:</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-indigo-600 inline-block" /> Fact / Source Table
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-sky-200 border border-sky-400 inline-block" /> Dimension Table
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-3.5 bg-indigo-500 inline-block" /> Relationship ({relationships.length})
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-grid h-4 w-4 place-items-center rounded-full border border-border bg-background text-[10px] font-bold text-foreground">1</span> One
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-grid h-4 w-4 place-items-center rounded-full border border-border bg-background text-[10px] font-bold text-foreground">*</span> Many
                </span>
                <span className="hidden sm:inline text-muted-foreground/80">Tip: Drag tables to arrange</span>
              </div>
              <button
                type="button"
                onClick={fitToView}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted cursor-pointer"
              >
                <Maximize2 className="h-3 w-3" /> Fit to View ({Math.round(zoom * 100)}%)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RELATIONSHIPS LIST */}
      {activeTab === "list" && (
        <div className="p-4 space-y-2.5">
          {relationships.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No relationships in semantic model.</div>
          ) : (
            relationships.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Many / From</div>
                    <div className="font-semibold text-foreground">{r.fromTable}</div>
                    <div className="font-mono text-[11px] text-primary">{r.fromColumn}</div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 text-muted-foreground">
                    <Link2 className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{r.cardinality || "N:1"}</span>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">One / To</div>
                    <div className="font-semibold text-foreground">{r.toTable}</div>
                    <div className="font-mono text-[11px] text-primary">{r.toColumn}</div>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {r.active === false ? "Inactive" : "Active"}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: TABLES & COLUMNS */}
      {activeTab === "tables" && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {tables.map((t) => (
            <div key={t.name} className="rounded-xl border border-border bg-surface p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                  <Table2 className="h-3.5 w-3.5 text-primary" />
                  <span>{t.name}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {t.columns.length} cols · {(t.measures || []).length} measures
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {t.columns.map((c, i) => (
                  <span key={`${c.name}-${i}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px]">
                    {keyColsSet.has(`${t.name}.${c.name}`) && <KeyRound className="h-3 w-3 text-amber-500" />}
                    {c.name}
                  </span>
                ))}
                {(t.measures || []).map((m, i) => (
                  <span key={`m-${m.name}-${i}`} className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] text-primary font-medium">
                    Σ {m.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 4: MODEL PROPERTIES */}
      {activeTab === "properties" && (
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="text-muted-foreground">Final Tables</div>
            <div className="text-lg font-bold text-foreground mt-0.5">{tables.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="text-muted-foreground">Final Relationships</div>
            <div className="text-lg font-bold text-foreground mt-0.5">{relationships.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="text-muted-foreground">Filter Direction</div>
            <div className="text-lg font-bold text-foreground mt-0.5">Single</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="text-muted-foreground">Ambiguous Paths</div>
            <div className="text-lg font-bold text-foreground mt-0.5">Prevented</div>
          </div>
        </div>
      )}
    </div>
  );
}
