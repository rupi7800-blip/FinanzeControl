# Regole di consumo e ruoli

- Sonnet gestisce la sessione principale: scrive codice e corregge bug.
- Ricerche nel repository, grep e test vanno ai sotto-agenti Haiku 5.5 (`search`, `grep`, `audit`),
  anche in parallelo, per mantenere il contesto principale snello.
- `audit` lavora in worktree isolato, così non tocca il branch di lavoro.
- Opus (`advisor`) è in stand-by: lo si invoca solo per decisioni chiave e per la firma finale dei diff.
  Non sprecare il suo contesto su lavoro di routine.
- Scelte rapide e deterministiche (scelta tool, percorso, retry) le decide direttamente Sonnet, senza sotto-agenti.
