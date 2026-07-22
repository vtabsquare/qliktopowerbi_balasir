# Power Query Compiler Repair Architecture

```text
Qlik parser / canonical analysis
              |
              v
       Initial generated M
              |
              v
 Deterministic compiler diagnostics
              |
       +------+------+
       |             |
      clean        errors
       |             |
       |             v
       |      grounded repair planner
       |             |
       |      smallest safe patch
       |             |
       |      regenerate / recompile
       |             |
       +-------------+
              |
              v
 syntax + dependencies + schema
              |
              v
 preview + reconciliation + PBIP validation
```

## Status policy

A query with no compiler diagnostics is not automatically semantically verified. The engine returns `Reconciliation Required` until runtime preview, source-to-target reconciliation, and PBIP open/refresh validation have completed.

## Source inference policy

The compiler may resolve a missing calendar source only when an existing generated query has a date-bearing field in the canonical table profile. It excludes the calendar query itself and ranks final/fact/model tables above staging tables. It never uses arbitrary non-date fields.

## Repair order

1. Diagnose generated M.
2. Retrieve canonical project metadata.
3. Resolve the smallest grounded repair.
4. Produce a governed proposal.
5. Apply only after the applicable approval.
6. Synchronize generated code and metadata evidence.
7. Recompile.
8. Keep runtime and reconciliation checks pending until actually executed.
