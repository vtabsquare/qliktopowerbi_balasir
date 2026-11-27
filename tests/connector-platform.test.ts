import { describe, expect, it } from "vitest";
import { CONNECTOR_OPTIONS, getConnectorDefinition, parseConnectorReference } from "../src/lib/migration/connectors";
import { runEnterpriseAnalysis, type ProjectFile } from "../src/lib/migration/enterprise-parser";

function scriptFile(): ProjectFile {
  const content = "Sales: LOAD CustomerID, Amount FROM [legacy-source.csv];";
  return { path: "LoadScript.qvs", ext: ".qvs", size: content.length, isText: true, content, note: "" };
}

function generate(connectorType: string, mappedRef: string) {
  const files = [scriptFile()];
  const original = runEnterpriseAnalysis(files).sourceMappings.find((mapping) => !mapping.bypassQvd)?.originalRef;
  expect(original).toBeTruthy();
  return runEnterpriseAnalysis(files, {
    [original!]: { connectorType, mappedRef, status: "Mapped" },
  });
}

describe("connector platform", () => {
  it("publishes the mainstream database, cloud, online-service, and Web connectors", () => {
    expect(CONNECTOR_OPTIONS).toEqual(expect.arrayContaining([
      "Snowflake", "MariaDB", "Supabase", "MongoDB Atlas SQL", "Amazon Redshift",
      "Google BigQuery", "Google Sheets", "Azure Blob Storage", "Azure Data Lake Gen2",
      "Databricks", "Oracle", "OData Feed", "ODBC", "Web",
    ]));
    expect(getConnectorDefinition("Web/API")?.id).toBe("Web");
  });

  it.each([
    ["Snowflake", "Server=acme.snowflakecomputing.com;Warehouse=BI_WH;Database=ANALYTICS;Schema=PUBLIC;Table=SALES", "Snowflake.Databases"],
    ["MariaDB", "Server=maria.internal:3306;Database=analytics;Table=sales", "MariaDB.Contents"],
    ["Supabase", "Server=db.project.supabase.co:5432;Database=postgres;Schema=public;Table=sales", "PostgreSQL.Database"],
    ["MongoDB Atlas SQL", "MongoDBURI=mongodb://atlas.example:27017/?ssl=true;Database=federated;Query=SELECT * FROM sales", "MongoDBAtlasODBC.Contents"],
    ["Amazon Redshift", "Server=cluster.redshift.amazonaws.com:5439;Database=dev;Schema=public;Table=sales", "AmazonRedshift.Database"],
    ["Databricks", "Server=workspace.azuredatabricks.net;HTTPPath=/sql/1.0/warehouses/abc;Catalog=main;Database=default;Table=sales", "Databricks.Catalogs"],
    ["Google BigQuery", "BillingProject=billing-project;Project=data-project;Dataset=analytics;Table=sales", "GoogleBigQuery.Database"],
    ["Google Sheets", "URL=https://docs.google.com/spreadsheets/d/example", "GoogleSheets.Contents"],
    ["Azure Blob Storage", "AccountURL=https://account.blob.core.windows.net", "AzureStorage.Blobs"],
    ["Azure Data Lake Gen2", "URL=https://account.dfs.core.windows.net/container", "AzureStorage.DataLake"],
    ["OData Feed", "URL=https://services.odata.org/V4/Northwind/Northwind.svc", "OData.Feed"],
  ])("generates executable M for %s", (connectorType, mappedRef, expectedFunction) => {
    const analysis = generate(connectorType, mappedRef);
    expect(Object.values(analysis.stagingQueries).join("\n")).toContain(expectedFunction);
    expect(analysis.validation.issues.filter((issue) => issue.area === "Source Mapping" && issue.severity === "Error")).toHaveLength(0);
  });

  it("generates a Power BI-style Web.Contents request without persisting credentials", () => {
    const analysis = generate("Web", "URL=https://api.example.com;RelativePath=v1/orders;Query=page=1&limit=100;ApiKeyName=api_key;ResponseType=JSON;TimeoutSeconds=30");
    const query = Object.values(analysis.stagingQueries).join("\n");
    expect(query).toContain("Web.Contents");
    expect(query).toContain('RelativePath="v1/orders"');
    expect(query).toContain('ApiKeyName="api_key"');
    expect(query).toContain('Query=[#"page"="1", #"limit"="100"]');
    expect(query).not.toMatch(/password|secret|bearer/i);
  });

  it("blocks incomplete mappings and embedded credentials", () => {
    const incomplete = generate("Snowflake", "Server=acme.snowflakecomputing.com;Database=ANALYTICS");
    expect(incomplete.validation.issues).toContainEqual(expect.objectContaining({ area: "Source Mapping", message: expect.stringContaining("Warehouse") }));

    const credentialed = generate("MongoDB Atlas SQL", "MongoDBURI=mongodb://user:password@atlas.example:27017;Database=federated");
    expect(credentialed.validation.issues).toContainEqual(expect.objectContaining({ area: "Source Mapping", message: expect.stringContaining("Credentials must not be embedded") }));
  });

  it("parses connector fields case-insensitively", () => {
    expect(parseConnectorReference("server=db;DATABASE=warehouse;schema=public", "PostgreSQL")).toEqual(expect.objectContaining({ Server: "db", Database: "warehouse", Schema: "public" }));
  });
});
