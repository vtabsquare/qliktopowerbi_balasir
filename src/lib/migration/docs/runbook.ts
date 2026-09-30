// src/lib/migration/docs/runbook.ts
// Standalone Operations Runbook & Comprehensive Technical Manual for Qlik to Power BI Migration

export const OPERATIONS_RUNBOOK_MARKDOWN = `# Qlik to Power BI Migration Engine — Operations Runbook & Manual
**Platform Version:** v2.0 Enterprise  
**Author:** VTAB Square AI Migration Engineering  
**Target:** Microsoft Power BI (PBIP, TMDL, Power Query M, DAX)

---

## 1. Executive Overview & Workflow Architecture
The VTAB Square Qlik to Power BI Migration Platform automates the discovery, extraction, compilation, modeling, and project packaging of legacy QlikView (.qvw, -prj) and Qlik Sense (.qvs) applications into modern Microsoft Power BI Projects (PBIP).

### The 11-Stage Pipeline
1. **Stage 0 — Instructions:** Review prerequisites, extraction modes, and security scrubbing rules.
2. **Stage 1 — Upload & Intake:** Ingest single QVS scripts, PRJ XML folders, or complete ZIP packages.
3. **Stage 2 — QVW Analysis:** Extract sheet designs, visual objects, dimensions, expressions, and bookmarks.
4. **Stage 2.5 — Calendar Analysis:** Auto-detect date bounds and generate DAX Master Date dimensions.
5. **Stage 3 — Expression Conversion:** Normalize and translate Qlik expressions to Power BI DAX.
6. **Stage 4 — ETL Analysis:** Parse LOAD, RESIDENT, MAPPING, and JOIN statements into lineage graphs.
7. **Stage 5 — Power Query (M):** Compile table-producing M queries with AI Auto-Fix error recovery.
8. **Stage 6 — DAX Measures:** Inspect translated DAX measures, test formulas, and verify filter context.
9. **Stage 7 — Power BI Model:** Classify Fact vs Dimension tables, assign primary keys, and format fields.
10. **Stage 8 — Relationships:** Review visual ER diagram, configure cardinality (1:*, *:1), and cross-filtering.
11. **Stage 9 — Report Designer:** Preview multi-page layouts (Overview, Details, Trends) with 16:9 canvas grids.
12. **Stage 10 — Validation & PBIP Export:** Run 8-point pre-flight checks and download the deployment-ready PBIP ZIP package.
13. **Stage 11 — Observability & Logs:** Inspect chronological pipeline logs, error diagnostics, and audit manifests.

---

## 2. Supported Extraction Modes
* **Mode A — QVW + PRJ Folder (Recommended):** Upload the binary \`.qvw\` alongside its exported \`<AppName>-prj\` folder as a single ZIP. Provides 100% visual layout, expression, and script fidelity.
* **Mode B — PRJ Folder Only:** Upload only the XML/TXT project definition folder. Ideal for environments where corporate security prohibits sharing large binary QVW files.
* **Mode C — Single QVS Script File:** Upload a standalone \`.qvs\` or \`.txt\` ETL script. The platform analyzes source connections, transformations, and creates both the Power Query M and DAX data model.
* **Mode D — QVW Binary Only:** Upload a raw \`.qvw\` file. Requires the local Windows extraction bridge utility to unpack internal XML object definitions.

---

## 3. Qlik to Power BI Syntax & Translation Reference

### A. Load Script (ETL) to Power Query (M)
* **LOAD ... RESIDENT [Staging]:** Translated to sequential Power Query steps referencing the parent query (\`Table.SelectRows\`, \`Table.TransformColumns\`).
* **MAPPING LOAD & ApplyMap():** Converted to \`Table.NestedJoin\` with lookup expansion or scalar DAX \`LOOKUPVALUE()\`.
* **AUTOGENERATE(n):** Converted to \`List.Numbers\` and \`Table.FromList\` in Power Query.
* **LEFT / INNER JOIN (Table):** Converted to \`Table.NestedJoin(Table1, {"Key"}, Table2, {"Key"}, "Joined", JoinKind.LeftOuter)\`.
* **CONCATENATE (Table):** Converted to \`Table.Combine({Table1, Table2})\`.
* **DROP TABLE:** Excluded from the final semantic model to keep the report canvas clean and high-performing.

### B. Qlik Expressions to DAX Measures
* **Basic Aggregation:** \`Sum(Sales)\` ➔ \`SUM(Sales[Sales])\`
* **Distinct Count:** \`Count(distinct CustomerID)\` ➔ \`DISTINCTCOUNT(Customer[CustomerID])\`
* **Set Analysis (Filter):** \`Sum({<Year={2024}>} Amount)\` ➔ \`CALCULATE(SUM(Amount), DimDate[Year] = 2024)\`
* **Set Analysis (Exclusion):** \`Sum({<Status-={'Closed'}>} Margin)\` ➔ \`CALCULATE(SUM(Margin), Orders[Status] <> "Closed")\`
* **Aggr() Calculated Granularity:** \`Aggr(Sum(Sales), Region)\` ➔ \`SUMX(VALUES(Region[Region]), [Total Sales])\`
* **Rolling Window:** \`RangeSum(Above(Sum(Sales), 0, 3))\` ➔ \`CALCULATE([Total Sales], DATESINPERIOD(DimDate[Date], MAX(DimDate[Date]), -3, MONTH))\`
* **Conditionals:** \`If(IsNull(Field), 0, Field)\` ➔ \`IF(ISBLANK(Field), 0, Field)\` or \`COALESCE(Field, 0)\`
* **Branching:** \`Pick(Match(Code, 1, 2), 'A', 'B')\` ➔ \`SWITCH(TRUE(), Code = 1, "A", Code = 2, "B", "Unknown")\`

---

## 4. Star-Schema Modeling & Relationship Guidelines
1. **Fact Tables:** Contain numerical transaction measurements and foreign keys (e.g. Sales, Inventory, GL).
2. **Dimension Tables:** Contain unique descriptive business attributes (e.g. DimCustomer, DimProduct, DimDate).
3. **Cardinality:** Enforce \`1:*\` (One-to-Many) from Dimensions to Facts.
4. **Cross-Filtering:** Keep cross-filter direction set to **Single** by default to prevent ambiguous circular filter propagation.
5. **Technical Key Visibility:** Technical surrogate keys and foreign keys should have \`isHidden: true\` applied.

---

## 5. Opening the Exported PBIP Project in Power BI
1. Download the generated \`<ProjectName>_Workspace.zip\` from Stage 10 (Validation & Export).
2. Extract the ZIP archive on your local Windows workstation.
3. Open **Power BI Desktop** (May 2024 release or newer with Power BI Project PBIP enabled).
4. Go to **File > Open report > Browse reports**, and select the extracted \`<ProjectName>.pbip\` file.
5. Power BI Desktop will automatically load the **TMDL semantic model**, compile all **Power Query M queries**, and establish all **star-schema relationships**.
6. When prompted, configure your database credentials for the parameterized SQL server or data sources.

---

## 6. Backup & Recovery Operations
* **Exporting a Workspace Backup:** On the Upload page or Logs page, click **"Backup Workspace"**. This saves a complete \`<ProjectName>_Backup_<Date>.q2pbi.json\` snapshot containing all parsed ASTs, expression inventories, and models.
* **Restoring a Workspace Backup:** Click **"Restore from Backup"** on the Upload page, select your \`.q2pbi.json\` snapshot, and your entire workspace will be restored in milliseconds without needing to re-upload source scripts.
* **Staging Cleanup:** The platform automatically sweeps and deletes temporary QVD conversion files older than 24 hours.

---

## 7. Troubleshooting & AI Auto-Fix Center
* **M Syntax Errors:** Open the **Auto-Fix Center** in Stage 5 (Power Query). Click **"Apply Fix"** to let the deterministic compiler repair missing commas, unbalanced brackets, or invalid step references.
* **DAX Syntax Warnings:** In Stage 3 (Expression Conversion), click **"Edit"** to open the Monaco DAX Code Editor. Inspect parentheses matching or click **"Suggest AI Fix"** for automatic formula restructuring.
* **Circular Relationships:** In Stage 8 (Relationships), inactive redundant paths to avoid ambiguous filtering paths.
`;

export function downloadOperationsRunbookFile(format: "markdown" | "html" = "markdown"): void {
  if (format === "markdown") {
    const blob = new Blob([OPERATIONS_RUNBOOK_MARKDOWN], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `Qlik_to_PowerBI_Operations_Runbook_v2.0.md`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  // Printable HTML Format with CSS styling for direct Print/Save as PDF
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Qlik to Power BI Migration — Operations Runbook & Manual</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 900px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #1e3a8a; border-bottom: 2px solid #0284c7; padding-bottom: 8px; font-size: 26px; }
    h2 { color: #0f172a; margin-top: 28px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; font-size: 20px; }
    h3 { color: #0284c7; margin-top: 20px; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
    th { background: #1e293b; color: white; text-align: left; padding: 10px 12px; }
    td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f8fafc; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: Consolas, Monaco, monospace; font-size: 13px; color: #0f766e; }
    pre { background: #0f172a; color: #f8fafc; padding: 14px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; background: #e0f2fe; color: #0369a1; font-weight: 600; font-size: 12px; }
    .notice { background: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0; }
    @media print { body { max-width: 100%; margin: 0; padding: 15mm; } button { display: none; } }
  </style>
</head>
<body>
  <div style="text-align: right; margin-bottom: 20px;">
    <button onclick="window.print()" style="padding: 8px 16px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">🖨️ Print / Save as PDF</button>
  </div>
  ${OPERATIONS_RUNBOOK_MARKDOWN
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^\* (.*$)/gim, '<li>$1</li>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\`(.*?)\`/gim, '<code>$1</code>')
    .replace(/\n\n/gim, '<p></p>')
  }
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.download = `Qlik_to_PowerBI_Operations_Runbook_v2.0.html`;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
