---
description: Rilegge e applica le regole di consumo e ruoli di CLAUDE.md
---

Rileggi `CLAUDE.md` nella radice del repository e applica le sue regole per tutto il lavoro di questa sessione:

- Sonnet gestisce la sessione principale: scrive codice e corregge bug.
- Ricerche, grep e test vanno ai sotto-agenti Haiku 5.5 (`search`, `grep`, `audit`), anche in parallelo.
- `audit` lavora in worktree isolato.
- Opus (`advisor`) si invoca solo per decisioni chiave e firma finale dei diff.
- Scelte rapide e deterministiche le decide direttamente Sonnet.

Conferma in una riga le regole applicate, poi procedi con: $ARGUMENTS
