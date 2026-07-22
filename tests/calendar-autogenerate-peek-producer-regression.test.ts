import { describe, expect, it } from "vitest";
import { runEnterpriseAnalysis, applyDataTypeOverrides, type ProjectFile } from "@/lib/migration/enterprise-parser";
import { collectCompilerInvariantIssues } from "@/lib/migration/QlikCompilerService";

const script = `
FactSales_Base:
LOAD SalesID, OrderDate
FROM [Sales.csv] (txt, embedded labels, delimiter is ',');

FactSales_Final:
LOAD SalesID, OrderDate
RESIDENT FactSales_Base;

TempDate:
LOAD Min(OrderDate) as MinDate, Max(OrderDate) as MaxDate
RESIDENT FactSales_Final;

LET vMinDate = Num(Peek('MinDate',0,'TempDate'));
LET vMaxDate = Num(Peek('MaxDate',0,'TempDate'));
DROP TABLE TempDate;

TempCalendar:
LOAD Date($(vMinDate)+IterNo()-1) as CalendarDate
AUTOGENERATE 1
WHILE $(vMinDate)+IterNo()-1 <= $(vMaxDate);

MasterCalendar:
LOAD CalendarDate as OrderDate,
     Year(CalendarDate) as Year,
     Month(CalendarDate) as Month
RESIDENT TempCalendar;
DROP TABLE TempCalendar;
`;

function project(): ProjectFile[] {
  return [{ path: "Sales_ETL.qvs", ext: ".qvs", size: script.length, isText: true, content: script, note: "peek calendar" }];
}

describe("AUTOGENERATE first-class producer with Peek/Min/Max bounds", () => {
  it("registers the producer and compiles the resident consumer without ManualSource", () => {
    const analysis = runEnterpriseAnalysis(project());
    const producer = analysis.operations.find((operation) => operation.table === "TempCalendar");
    expect(producer?.opType).toBe("autogenerate");
    expect(producer?.producerType).toBe("autogenerate");
    expect(producer?.executableProducer).toBe(true);
    expect(producer?.fields).toContain("CalendarDate");

    const m = analysis.mQueries.MasterCalendar || "";
    expect(m).toContain('RangeSource = #"Source_FactSales_Base"');
    expect(m).toContain('RangeSourceColumn = "OrderDate"');
    expect(m).toContain('Table.Column(ValidatedRangeSource, RangeSourceColumn)');
    expect(m).toContain("List.Min(MinimumDateValues)");
    expect(m).toContain("List.Max(MaximumDateValues)");
    expect(m).toContain("List.Dates");
    expect(m).toContain('Table.FromColumns({CalendarDateList}, {"CalendarDate"})');
    expect(m).not.toContain("Manual_TempCalendar");
    expect(m).not.toContain("QLIK2PBI.ManualSource");
    expect(collectCompilerInvariantIssues(analysis)).not.toContain("MasterCalendar: unresolved ManualSource");
  });

  it("preserves the producer through datatype regeneration", () => {
    const initial = runEnterpriseAnalysis(project());
    const regenerated = applyDataTypeOverrides(initial, { "MasterCalendar.OrderDate": "Date" });
    const m = regenerated.mQueries.MasterCalendar || "";
    expect(m).toContain("List.Dates");
    expect(m).not.toContain("QLIK2PBI.ManualSource");
  });
});
