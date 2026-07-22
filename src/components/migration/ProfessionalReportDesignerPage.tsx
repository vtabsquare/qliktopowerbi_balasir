import { useMemo } from "react";
import { BarChart3, BookOpenCheck, BrainCircuit, Filter, LayoutDashboard, Sparkles } from "lucide-react";
import { useMigration } from "@/lib/migration/store";
import { buildProfessionalReportPlan } from "@/lib/migration/report-designer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader } from "./AppHeader";

export function ProfessionalReportDesignerPage() {
  const model = useMigration((s) => s.powerBiModel);
  const qvw = useMigration((s) => s.qvwAnalysis);
  const plan = useMemo(() => model ? buildProfessionalReportPlan(model, qvw) : null, [model, qvw]);

  return <div className="min-h-screen bg-background"><AppHeader /><main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
    <div className="flex items-start justify-between gap-6"><div><div className="flex items-center gap-2 text-primary font-semibold"><Sparkles className="h-5 w-5"/> AI-assisted Power BI authoring</div><h1 className="text-3xl font-bold mt-2">Professional Report Designer</h1><p className="text-muted-foreground mt-2 max-w-3xl">Preserve Qlik analytical coverage and add Power BI-native 360-degree pages, KPI discovery, filters, drillthrough, tooltips, navigation and validated PBIR bindings.</p></div>{plan && <Badge variant="secondary">{plan.generationMode}</Badge>}</div>
    {!plan ? <Card><CardContent className="py-12 text-center text-muted-foreground">Build or load the Power BI semantic model first. The report planner will then discover KPIs, dimensions and professional report pages.</CardContent></Card> : <>
      <div className="grid md:grid-cols-4 gap-4">
        {[["Pages", plan.pages.length, LayoutDashboard],["KPI candidates", plan.kpis.length, BarChart3],["Dimensions", plan.dimensions.length, Filter],["Enhancements", plan.powerBiEnhancementCount, BrainCircuit]].map(([label,value,Icon]: any)=><Card key={label}><CardContent className="pt-5 flex items-center gap-4"><div className="rounded-xl bg-primary/10 p-3"><Icon className="h-5 w-5 text-primary"/></div><div><div className="text-2xl font-bold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div></CardContent></Card>)}
      </div>
      <Tabs defaultValue="plan"><TabsList><TabsTrigger value="plan">Report plan</TabsTrigger><TabsTrigger value="pages">Page designer</TabsTrigger><TabsTrigger value="kpis">KPI discovery</TabsTrigger><TabsTrigger value="governance">Validation</TabsTrigger></TabsList>
        <TabsContent value="plan" className="space-y-4"><Card><CardHeader><CardTitle>Generation strategy</CardTitle></CardHeader><CardContent className="grid md:grid-cols-3 gap-4 text-sm"><div><b>Mode</b><p className="text-muted-foreground">{plan.generationMode}</p></div><div><b>Detected domains</b><p className="text-muted-foreground">{plan.detectedDomains.join(", ") || "General analytics"}</p></div><div><b>Qlik visual coverage</b><p className="text-muted-foreground">{plan.qlikCoverage}%</p></div></CardContent></Card>{plan.warnings.map(w=><Card key={w} className="border-amber-300"><CardContent className="py-4 text-sm">{w}</CardContent></Card>)}</TabsContent>
        <TabsContent value="pages"><div className="grid lg:grid-cols-2 gap-4">{plan.pages.map(page=><Card key={page.id}><CardHeader><CardTitle className="flex items-center justify-between text-lg">{page.displayName}<Badge variant="outline">{page.purpose}</Badge></CardTitle></CardHeader><CardContent><div className="rounded-lg border bg-muted/30 aspect-video p-3 relative overflow-hidden">{page.visuals.filter(v=>v.bindings.length).map(v=><div key={v.id} className="absolute rounded border bg-background/90 px-2 py-1 text-[10px] shadow-sm" style={{left:`${v.x/12.8}%`,top:`${v.y/7.2}%`,width:`${Math.max(12,v.width/12.8)}%`,height:`${Math.max(10,v.height/7.2)}%`}}><b>{v.title}</b><div className="text-muted-foreground">{v.visualType}</div></div>)}</div><div className="mt-3 text-xs text-muted-foreground">{page.visuals.length} planned objects · {page.visuals.filter(v=>v.source==="powerbi-enhancement").length} Power BI enhancements</div></CardContent></Card>)}</div></TabsContent>
        <TabsContent value="kpis"><div className="grid md:grid-cols-2 gap-4">{plan.kpis.map(k=><Card key={`${k.table}.${k.measure}`}><CardContent className="py-4 flex justify-between"><div><b>{k.measure}</b><div className="text-xs text-muted-foreground">{k.table}</div></div><Badge variant="outline">{Math.round(k.confidence*100)}%</Badge></CardContent></Card>)}</div></TabsContent>
        <TabsContent value="governance"><Card><CardHeader><CardTitle className="flex gap-2"><BookOpenCheck className="h-5 w-5"/> Export safeguards</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>Every generated projection receives a semantic-model queryRef.</p><p>Only visuals with validated field or measure bindings are exported.</p><p>Qlik-derived visuals and Power BI enhancements retain separate traceability annotations.</p><p>The generated package includes professional-report-plan.json for audit and review.</p></CardContent></Card></TabsContent>
      </Tabs>
    </>}
  </main></div>;
}
