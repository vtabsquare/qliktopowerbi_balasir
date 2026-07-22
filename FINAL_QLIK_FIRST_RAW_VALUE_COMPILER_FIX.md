# Final Qlik-First Raw Value Compiler Fix

## Fixed symptom

Alphanumeric identifiers such as `SL0000001` were converted to decimal in the physical `Source_*` staging query and became `null` before the Qlik LOAD logic ran.

## Permanent rule

Physical source queries now preserve raw values. Semantic-model datatype choices are applied only by the authoritative table compiler after Qlik expressions, mappings, joins, resident loads, and final projection have completed.

## Why this matters

The system now keeps these concerns separate:

1. physical source reading;
2. Qlik source interpretation (`Num`, `Date#`, `Timestamp#`, and related functions);
3. transformation and join-key typing;
4. final Power BI datatype contract.

This prevents final UI datatype selections from corrupting raw identifiers and dates at source-read time.

## Validation

- 36 test files passed
- 110 tests passed
- client and server production build passed
