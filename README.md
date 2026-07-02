# URLLM

**100% locale. Zero server. Privacy totale.**

URLLM è una web app Angular che esegue modelli linguistici (LLM) direttamente nel browser tramite WebGPU e `@mlc-ai/web-llm`. All'avvio, l'app rileva la VRAM e la RAM del dispositivo e filtra i modelli compatibili, mostrandoti solo quelli che il tuo hardware può sostenere. Nessun dato lascia il dispositivo — nessuna API key, nessun cloud, nessun abbonamento.

## ✨ Caratteristiche

- **🔒 Privacy assoluta** — Conversazioni, modelli e configurazioni persistono solo in IndexedDB lato browser. Zero traffico di rete.
- **⚡ WebGPU nativo** — I modelli girano nel browser via Web Worker. La prima volta richiede download, poi il modello è in cache e parte istantaneamente.
- **🌍 Multi-lingua** — Interfaccia tradotta in Italiano, Inglese, Francese e Tedesco. La lingua si seleziona al primo avvio.
- **📱 Responsive** — Layout adattivo che funziona su desktop, tablet e mobile.
- **🔄 Cambio modello a caldo** — Possibilità di cambiare modello LLM senza perdere le conversazioni.
- **💾 Persistenza** — Tutte le chat vengono automaticamente salvate in IndexedDB. Chiusura del browser = nessuna perdita.

## Architettura

```
src/
├── app/
│   ├── components/
│   │   ├── sidebar/          # Pannello laterale – lista conversazioni, azioni
│   │   ├── chat/             # Area chat – messaggi, input, streaming
│   │   ├── confirm-modal/    # Modale di conferma (reset, clear all)
│   │   └── app-config-modal/ # Modale di setup – scelta lingua e modello
│   ├── services/
│   │   ├── chat-state.service.ts   # Store centrale reattivo (Signals)
│   │   ├── llm.service.ts          # Ciclo di vita del motore AI
│   │   ├── language.service.ts     # Internazionalizzazione
│   │   └── indexed-db.service.ts   # Persistenza IndexedDB
│   ├── models/
│   │   └── chat.types.ts           # Tipi condivisi
│   ├── i18n/
│   │   └── translations.ts         # Traduzioni IT/EN/FR/DE
│   ├── workers/
│   │   └── llm.worker.ts           # Web Worker per l'inferenza
│   ├── app.ts / .html / .scss      # Root component
│   └── app.config.ts               # Angular ApplicationConfig
├── styles.scss                     # Variabili globali, utility, reset
└── index.html
```

**State management:** Signals (Angular nativo). Nessuna libreria esterna.
**AI Engine:** `@mlc-ai/web-llm` in un Web Worker dedicato.
**Persistenza:** IndexedDB con API nativa (`IDBDatabase`).

## Prerequisiti

- **Browser:** Chrome/Edge/Brave 113+ con WebGPU abilitato
- **Node.js:** 20+ (consigliato 22 LTS)
- **RAM dispositivi mobili:** 8 GB+ (4GB con modelli `low_resource_required`)
- **Spazio su disco:** ~2–8 GB per la cache del modello (primo download)

## Installazione

```bash
git clone <url>
cd urllm
npm install
```

## Sviluppo

```bash
npm start          # ng serve — http://localhost:4200
npm run dev        # alias
npm run build      # build produzione in dist/
npm run test       # unit test (Vitest)
npm run watch      # build --watch (dev mode)
```

## Stack

| Categoria | Tecnologia |
|---|---|
| Framework | **Angular 21** — Standalone Components, Signals, `@angular/build` |
| Language | **TypeScript 5.9** |
| AI Engine | **MLC `@mlc-ai/web-llm` 0.2.84** (WebWorker + WebGPU) |
| Stili | **SCSS** vanilla — variabili CSS, `clamp()` fluid, tema custom |
| Package manager | npm 11 |

## Compatibilità modelli

Al primo avvio l'app rileva la RAM del dispositivo e filtra i modelli compatibili (max 70% RAM). Un modello viene preselezionato in base a benchmark oggettivi (MMLU, GSM8K, HumanEval) scegliendo il miglior rapporto qualità/velocità entro il 50% della RAM. Sotto, un pulsante "Vedi tutti i modelli" espande la lista completa ordinata per VRAM decrescente.

I modelli scaricati mantengono le proprie licenze d'uso originali. Verifica i termini di ciascun modello prima dell'utilizzo.

## Contribuire

Le contribuzioni sono benvenute! Per mantenere il progetto semplice e manutenibile, segui queste linee guida:

1. **Fork** il repository e crea un branch dedicato (`git checkout -b feat/nome-feature`)
2. **Keep It Simple** — niente over-engineering, astrazioni premature o pattern complessi. Scrivi codice lineare e leggibile.
3. **Conventional Commits** — messaggi in inglese, formato `tipo(scope): descrizione` (es. `feat(sidebar): aggiunge ordinamento cronologico`)
4. **PR** — apri una pull request descrivendo cosa cambi e perché

## Licenza

MIT
