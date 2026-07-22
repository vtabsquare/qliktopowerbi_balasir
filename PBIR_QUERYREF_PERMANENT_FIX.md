# PBIR visual projection contract — permanent fix

## Root cause

The report generator wrote each semantic field under `visual.query.queryState.<role>.projections[]`, but omitted the required `queryRef` property. Power BI Desktop therefore rejected every generated field projection. The repeated 107 messages were one schema defect multiplied across all visuals and all roles; they were not 107 unrelated conversion failures.

## Correct projection contract

Each projection now contains both:

```json
{
  "field": {
    "Column": {
      "Expression": { "SourceRef": { "Entity": "DimCustomer" } },
      "Property": "CustomerName"
    }
  },
  "queryRef": "DimCustomer.CustomerName"
}
```

Measures use the same stable `Table.Field` query-name convention.

## Preventive validation

The export engine now blocks package creation when a generated projection:

- has no `queryRef`;
- has no semantic-model entity or property;
- has a `queryRef` that does not match its bound semantic field.

This changes the behavior from “export an invalid PBIR and let Desktop fail” to “fail fast inside the migration application with the exact visual path and role.”

## Additional correction

Visual titles were moved from chart-specific `visual.objects` to `visual.visualContainerObjects`, which is the PBIR container-formatting location.

## Verification

The regression test exports a report containing a category column and a measure, opens the generated ZIP, and verifies that every projection has a non-empty and matching `queryRef`.
