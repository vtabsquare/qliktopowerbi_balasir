# TOM duplicate-measure and Qlik formatting-variable fix

## Root cause

The TOM bridge incorrectly treated identical DAX expressions as invalid, and Qlik document formatting settings such as `MoneyThousandSep` were converted into DAX measures. Power BI allows different measures to share the same DAX expression; only object-name collisions must be blocked.

## Changes

- Qlik environment-format variables are preserved as migration metadata and excluded from the `Qlik Variables` measure table.
- TOM roundtrip no longer rejects duplicate DAX expressions.
- TMDL validation no longer treats duplicate expressions as blocking.
- Model validation reports duplicate expressions as a warning only.
- Measure-name uniqueness and measure/column collisions remain blocking.

## Protected Qlik settings

`DecimalSep`, `ThousandSep`, `MoneyFormat`, `MoneyDecimalSep`, `MoneyThousandSep`, `DateFormat`, `TimestampFormat`, `TimeFormat`, month/day name settings, first-week settings and collation settings.
