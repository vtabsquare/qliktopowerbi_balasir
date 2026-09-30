import { describe, it, expect } from "vitest";
import { downloadWorkspaceBackup, useMigration, type WorkspaceBackupPayload } from "@/lib/migration/store";
import { OPERATIONS_RUNBOOK_MARKDOWN } from "@/lib/migration/docs/runbook";

describe("Backup & Recovery and Operations Documentation", () => {
  it("exports a valid workspace snapshot payload format", () => {
    const store = useMigration.getState();
    const backup = store.exportWorkspaceBackup();

    expect(backup.format).toBe("qlik2pbi-workspace-backup");
    expect(backup.version).toBe("1.0.0");
    expect(typeof backup.exportedAt).toBe("string");
    expect(Array.isArray(backup.enterpriseFiles)).toBe(true);
  });

  it("restores a workspace backup snapshot into store cleanly", () => {
    const store = useMigration.getState();

    const mockBackup: WorkspaceBackupPayload = {
      format: "qlik2pbi-workspace-backup",
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      sourcePackageName: "TestCustomerMigration",
      filesCount: 1,
      enterpriseFiles: [
        {
          name: "MainScript.qvs",
          path: "scripts/MainScript.qvs",
          extension: ".qvs",
          sizeKb: 12,
          parsedAsText: true,
          text: "Sales: LOAD * INLINE [OrderID, Amount\n1, 100];",
        },
      ],
      enterpriseAnalysis: null,
      enterpriseMappingRows: [],
      enterpriseMappingUpdates: {},
      enterpriseColumnTypeEdits: {},
      qvwAnalysis: null,
      expressionInventory: null,
      powerBiModel: null,
      projectWorkspace: null,
      pipelineLogs: ["Initial log"],
      sourceQvsText: "Sales: LOAD * INLINE [OrderID, Amount\n1, 100];",
      etlQvsText: "Sales: LOAD * INLINE [OrderID, Amount\n1, 100];",
    };

    const result = store.restoreWorkspaceBackup(mockBackup);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("Successfully restored");

    const updated = useMigration.getState();
    expect(updated.enterpriseFiles.length).toBe(1);
    expect(updated.enterpriseFiles[0].name).toBe("MainScript.qvs");
    expect(updated.pipelineLogs.some((l) => l.includes("Workspace successfully restored"))).toBe(true);
  });

  it("rejects invalid backup payloads safely without throwing", () => {
    const store = useMigration.getState();
    // @ts-expect-error test invalid payload
    const result = store.restoreWorkspaceBackup({ format: "invalid-format" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Invalid backup file format");
  });

  it("provides comprehensive operations runbook documentation", () => {
    expect(OPERATIONS_RUNBOOK_MARKDOWN).toBeDefined();
    expect(OPERATIONS_RUNBOOK_MARKDOWN).toContain("Qlik to Power BI Migration Platform");
    expect(OPERATIONS_RUNBOOK_MARKDOWN).toContain("Operations Runbook & Manual");
    expect(OPERATIONS_RUNBOOK_MARKDOWN).toContain("Backup & Recovery Operations");
    expect(OPERATIONS_RUNBOOK_MARKDOWN).toContain("Opening the Exported PBIP Project in Power BI");
  });
});
