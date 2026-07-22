# QVS-only final table reconstruction fix

## Scope

This release corrects standalone `.qvs` processing without changing the upload branching, QVW/QVF analysis, datatype-governance UI, semantic DAX conversion, or PBIP export architecture.

## Corrected behavior

- `LOAD *` is preserved as a wildcard/schema-inheritance directive and is never converted into a fabricated `Object` column.
- Wildcard loads containing additional calculated fields now retain all inherited columns and append the calculations.
- QVD consumer loads inherit the schema of the table that produced the QVD when producer logic is available.
- `CONCATENATE` widens and preserves the target table schema.
- JOIN operations applied to intermediate resident tables are now executed before downstream `LOAD * RESIDENT` operations.
- Natural join keys hidden behind wildcard lineage are resolved from the governed effective schema.
- Final table profiles, execution plans, Power Query M, datatype maps, preview, semantic model, and PBIP projection use the same final schema.
- Execution plans include joins and calculations from the complete final-table lineage while retaining the correct primary source branch.

## Sales_ETL validation

`FactSales_Final` resolves to 28 columns:

SalesID, OrderDate, CustomerID, ProductID, RegionID, CurrencyCode, Quantity, UnitPriceUSD, DiscountPct, RevenueUSD, CostUSD, SalesChannel, OrderStatus, SalesRep, SalesRegionName, CustomerName, Segment, Industry, Status, EmailDomain, CreditLimitUSD, RiskBand, PaymentTerms, LoyaltyTier, AccountManager, DigitalAdoptionFlag, ProfitUSD, SalesBand.

The generated M includes QVD producer reconstruction, `Table.Combine`, two `Table.NestedJoin` operations, ApplyMap conversion, ProfitUSD calculation, SalesBand calculation, exact final projection, and reviewed datatype conversion.

## Validation

- 27 test files passed.
- 91 tests passed.
- Client production build passed.
- SSR production build passed.
