export type ConnectorCategory = "File" | "Database" | "Azure" | "AWS" | "Google" | "Online service" | "Generic" | "Migration";

export interface ConnectorField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  kind?: "text" | "url" | "select";
  options?: string[];
  wide?: boolean;
}

export interface ConnectorDefinition {
  id: string;
  label: string;
  category: ConnectorCategory;
  fields: ConnectorField[];
  authentication: string;
  directQuery?: boolean;
  aliases?: string[];
}

const relationalFields: ConnectorField[] = [
  { key: "Server", label: "Server", placeholder: "server[:port]", required: true },
  { key: "Database", label: "Database", required: true },
  { key: "Schema", label: "Schema", placeholder: "dbo / public" },
  { key: "Table", label: "Table or view" },
  { key: "Query", label: "Native SQL query", wide: true },
];

export const CONNECTOR_DEFINITIONS: ConnectorDefinition[] = [
  { id: "CSV/Text", label: "Text / CSV", category: "File", fields: [{ key: "FilePath", label: "File path", required: true, wide: true }], authentication: "File system or web credentials" },
  { id: "Excel", label: "Excel workbook", category: "File", fields: [{ key: "FilePath", label: "Workbook path", required: true, wide: true }], authentication: "File system or web credentials" },
  { id: "Parquet", label: "Parquet", category: "File", fields: [{ key: "FilePath", label: "File path", required: true, wide: true }], authentication: "File system or web credentials" },
  { id: "JSON", label: "JSON", category: "File", fields: [{ key: "FilePath", label: "File path or URL", required: true, wide: true }], authentication: "File system or web credentials" },
  { id: "XML", label: "XML", category: "File", fields: [{ key: "FilePath", label: "File path or URL", required: true, wide: true }], authentication: "File system or web credentials" },
  { id: "PDF", label: "PDF", category: "File", fields: [{ key: "FilePath", label: "File path or URL", required: true, wide: true }], authentication: "File system or web credentials" },
  { id: "Folder", label: "Folder", category: "File", fields: [{ key: "FilePath", label: "Folder path", required: true, wide: true }], authentication: "File system credentials" },

  { id: "SQL Server", label: "SQL Server", category: "Database", fields: relationalFields, authentication: "Windows, database, or organizational account", directQuery: true },
  { id: "Azure SQL Database", label: "Azure SQL Database", category: "Azure", fields: relationalFields, authentication: "Database, Microsoft account, service principal, or managed identity", directQuery: true },
  { id: "Azure Synapse Analytics", label: "Azure Synapse Analytics", category: "Azure", fields: relationalFields, authentication: "Database or Microsoft account", directQuery: true },
  { id: "PostgreSQL", label: "PostgreSQL", category: "Database", fields: relationalFields, authentication: "Database or Microsoft account", directQuery: true },
  { id: "Azure Database for PostgreSQL", label: "Azure Database for PostgreSQL", category: "Azure", fields: relationalFields, authentication: "Database or Microsoft account", directQuery: true },
  { id: "Supabase", label: "Supabase (PostgreSQL)", category: "Online service", fields: relationalFields, authentication: "Database credentials configured in Power BI", directQuery: true },
  { id: "MySQL", label: "MySQL", category: "Database", fields: relationalFields, authentication: "Database credentials", directQuery: true },
  { id: "Azure Database for MySQL", label: "Azure Database for MySQL", category: "Azure", fields: relationalFields, authentication: "Database credentials", directQuery: true },
  { id: "MariaDB", label: "MariaDB", category: "Database", fields: relationalFields, authentication: "Basic credentials configured in Power BI", directQuery: true },
  { id: "Oracle", label: "Oracle Database", category: "Database", fields: relationalFields, authentication: "Windows, database, or Microsoft account", directQuery: true },
  { id: "IBM Db2", label: "IBM Db2", category: "Database", fields: relationalFields, authentication: "Database credentials", directQuery: true },
  { id: "Teradata", label: "Teradata", category: "Database", fields: relationalFields, authentication: "Windows or database credentials", directQuery: true },
  { id: "SAP HANA", label: "SAP HANA", category: "Database", fields: relationalFields, authentication: "Database credentials", directQuery: true },
  { id: "Snowflake", label: "Snowflake", category: "Database", fields: [
    { key: "Server", label: "Server", placeholder: "account.snowflakecomputing.com", required: true },
    { key: "Warehouse", label: "Warehouse", required: true }, { key: "Database", label: "Database" },
    { key: "Schema", label: "Schema" }, { key: "Table", label: "Table or view" }, { key: "Role", label: "Role" },
  ], authentication: "Snowflake, Microsoft account, key pair, or service principal", directQuery: true },
  { id: "Databricks", label: "Databricks (Azure / AWS / GCP)", category: "Database", fields: [
    { key: "Server", label: "Server hostname", required: true }, { key: "HTTPPath", label: "HTTP path", required: true },
    { key: "Catalog", label: "Catalog" }, { key: "Database", label: "Database / schema" }, { key: "Table", label: "Table" },
  ], authentication: "OAuth, service principal, or personal access token in Power BI", directQuery: true },
  { id: "Amazon Redshift", label: "Amazon Redshift", category: "AWS", fields: relationalFields, authentication: "Database or Microsoft Entra ID credentials", directQuery: true },
  { id: "Google BigQuery", label: "Google BigQuery", category: "Google", fields: [
    { key: "BillingProject", label: "Billing project" }, { key: "Project", label: "Project" },
    { key: "Dataset", label: "Dataset" }, { key: "Table", label: "Table" },
  ], authentication: "Google account or Microsoft Entra ID", directQuery: true },
  { id: "MongoDB Atlas SQL", label: "MongoDB Atlas SQL", category: "Database", fields: [
    { key: "MongoDBURI", label: "MongoDB URI", placeholder: "mongodb://host:port/?ssl=true", required: true, wide: true },
    { key: "Database", label: "Federated database", required: true }, { key: "Query", label: "Atlas SQL query", wide: true },
  ], authentication: "Basic credentials in Power BI; never include credentials in the URI", directQuery: true },
  { id: "ODBC", label: "ODBC", category: "Generic", fields: [
    { key: "ConnectionString", label: "Connection string", placeholder: "dsn=MyDataSource", required: true, wide: true },
    { key: "Query", label: "Native SQL query", wide: true },
  ], authentication: "Configured by the selected ODBC driver", directQuery: true },

  { id: "Azure Blob Storage", label: "Azure Blob Storage", category: "Azure", fields: [{ key: "AccountURL", label: "Account name or URL", required: true, wide: true }], authentication: "Anonymous, account key, organizational account, SAS, or service principal" },
  { id: "Azure Data Lake Gen2", label: "Azure Data Lake Storage Gen2", category: "Azure", fields: [{ key: "URL", label: "Filesystem or folder URL", required: true, wide: true }], authentication: "Organizational account, account key, or SAS" },
  { id: "Amazon S3", label: "Amazon S3", category: "AWS", fields: [{ key: "BucketURL", label: "Bucket URL", required: true, wide: true }], authentication: "AWS access credentials configured in Power BI" },
  { id: "Google Sheets", label: "Google Sheets", category: "Google", fields: [{ key: "URL", label: "Google Sheet URL", required: true, wide: true }], authentication: "Google account" },
  { id: "SharePoint", label: "SharePoint Folder", category: "Online service", fields: [{ key: "SiteURL", label: "Site URL", required: true, wide: true }], authentication: "Microsoft organizational account" },
  { id: "Salesforce Objects", label: "Salesforce Objects", category: "Online service", fields: [{ key: "URL", label: "Login URL", placeholder: "https://login.salesforce.com", wide: true }], authentication: "Salesforce account" },
  { id: "OData Feed", label: "OData Feed", category: "Online service", fields: [{ key: "URL", label: "Service root URL", required: true, wide: true }], authentication: "Anonymous, Windows, Basic, Web API, or organizational account" },
  { id: "Web", label: "Web", category: "Online service", fields: [
    { key: "URL", label: "Base URL", required: true, kind: "url", wide: true },
    { key: "RelativePath", label: "Relative path" }, { key: "Query", label: "Query parameters", placeholder: "page=1&limit=100", wide: true },
    { key: "ApiKeyName", label: "API key parameter name", placeholder: "api_key" },
    { key: "ResponseType", label: "Response type", kind: "select", options: ["Auto", "JSON", "CSV", "XML", "HTML"], required: true },
    { key: "TimeoutSeconds", label: "Timeout seconds", placeholder: "100" },
  ], authentication: "Configured in Power BI Data source settings; API key values are never stored here", aliases: ["Web/API"] },

  { id: "Database/SQL", label: "Generic SQL database", category: "Generic", fields: relationalFields, authentication: "Database credentials", directQuery: true },
  { id: "QVD bypassed via lineage", label: "QVD bypassed via lineage", category: "Migration", fields: [], authentication: "Not applicable" },
  { id: "QVD - map to supported source", label: "QVD requiring source mapping", category: "Migration", fields: [], authentication: "Not applicable" },
  { id: "Unknown", label: "Unknown / manual review", category: "Migration", fields: [{ key: "Reference", label: "Source reference", wide: true }], authentication: "Unknown" },
];

export const CONNECTOR_OPTIONS = CONNECTOR_DEFINITIONS.map((connector) => connector.id);

export function getConnectorDefinition(id: string): ConnectorDefinition | undefined {
  return CONNECTOR_DEFINITIONS.find((connector) => connector.id === id || connector.aliases?.includes(id));
}

export function missingConnectorFields(id: string, values: Record<string, string>): string[] {
  return (getConnectorDefinition(id)?.fields ?? [])
    .filter((field) => field.required && !String(values[field.key] || "").trim())
    .map((field) => field.label);
}

export function parseConnectorReference(value: string, connectorId?: string): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const piece of String(value || "").split(/;|\n/)) {
    const separator = piece.indexOf("=");
    if (separator > 0) raw[piece.slice(0, separator).trim().toLowerCase()] = piece.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
  }
  const definition = connectorId ? getConnectorDefinition(connectorId) : undefined;
  if (definition && !Object.keys(raw).length && (definition.fields.length === 1 || /^https?:\/\//i.test(String(value || "").trim()))) {
    raw[definition.fields[0].key.toLowerCase()] = String(value || "").trim().replace(/^["']|["']$/g, "");
  }
  return Object.fromEntries((definition?.fields ?? []).map((field) => [field.key, raw[field.key.toLowerCase()] || ""]));
}
