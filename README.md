# FinanzeControl

Web app (PWA) per tenere sotto controllo le spese **personali** e **familiari**, mese per mese.

## Funzioni
- 📷 **Foto di scontrino, fattura o ricevuta** (anche PDF): riconosce importo, data, fornitore, P.IVA, prodotti e categoria
  - *Locale gratuito*: Tesseract.js, la lettura avviene sul telefono
  - *Avanzato (facoltativo)*: Google Gemini con chiave gratuita di Google AI Studio
  - L'app impara: se correggi la categoria di un fornitore, la volta dopo usa la tua scelta
- 👤/👨‍👩‍👧 Ogni spesa è **Personale** o **Familiare**, con filtro in alto
- 🗂️ Categorie modificabili (nome, icona, colore)
- 🥧 Grafico a torta interattivo per categoria
- 🚨 **Alert di spesa massima** per categoria e budget mensile totale: preavviso alla soglia scelta (es. 80%) e avviso al superamento, a schermo e come notifica
- 📊 **Analisi consuntive** configurabili: mese, trimestre, anno, ultimi 12 mesi o periodo personalizzato; solo personali o familiari; confronto con il periodo precedente; consuntivo vs budget, andamento, fornitori, prodotti; esportazione CSV e stampa/PDF
- 💾 Backup ed importazione JSON (foto incluse se vuoi)
- 🔄 Sistema di aggiornamento con tasto "Aggiorna" e notifica (come AgendApp)

## Pubblicazione su GitHub Pages
1. Carica tutti i file nella radice del repository (es. `FinanzeControl`)
2. Settings → Pages → Branch `main` / root
3. Apri il sito dal telefono e aggiungilo alla schermata Home

## Rilasciare un aggiornamento
Ad ogni modifica aumenta il numero di versione **in due punti**, uguali:
- `version.json` → `"version"` (e le note)
- `index.html` → `data-version` dello script `aggiornamenti.js`

I dati restano solo sul dispositivo (IndexedDB): fai un backup periodico.
