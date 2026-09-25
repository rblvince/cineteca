# Cineteca, fasi 1-3: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fine piano esistono un motore di ricerca sulle schede di scena (PGlite + pgvector + embedding locali), il film Taxi Driver caricato da cima a fondo e un server MCP con 3 strumenti che il Regista di Ultrarantino può interrogare.

**Architecture:** Un file per compito, in `src/`:
- `corpus.js` legge e valida le schede markdown;
- `embed.js` calcola gli embedding in locale;
- `db.js` è l'unico file che parla con PGlite;
- `ingest.js` porta il corpus nel database, solo per le schede cambiate;
- `ricerca.js` contiene la logica dei 3 strumenti;
- `mcp.js` li espone via stdio.

I test girano con un embedder finto e deterministico. Un solo test d'integrazione usa il modello vero.

**Tech Stack:** Node ≥ 20 (qui c'è la 25.9), ESM, `node:test`, `@electric-sql/pglite` 0.5.8, `@electric-sql/pglite-pgvector` 0.0.9, `@huggingface/transformers` 3.8.1, `@modelcontextprotocol/sdk` 1.30.1, `zod` 4.6.5, `yaml` 2.9.1.

**Spec:** `docs/superpowers/specs/2026-09-26-cineteca-design.md`

## Global Constraints

- Il codice è JavaScript ESM (`"type": "module"`). Niente TypeScript e niente librerie di test oltre a `node:test`.
- Versioni esatte, fissate in `package.json` (senza `^`):

  | Pacchetto | Versione |
  |---|---|
  | `@electric-sql/pglite` | `0.5.8` |
  | `@electric-sql/pglite-pgvector` | `0.0.9` |
  | `@huggingface/transformers` | `3.8.1` |
  | `@modelcontextprotocol/sdk` | `1.30.1` |
  | `zod` | `4.6.5` |
  | `yaml` | `2.9.1` |

- **Transformers.js resta alla 3.8.1.** La 4.x si porta dietro `onnxruntime-node` 1.30, che non ha il binario `darwin/x64`, e questo Mac è Intel (verificato il 26/09: `Cannot find module '../bin/napi-v6/darwin/x64/onnxruntime_binding.node'`). La 3.8.1 usa `onnxruntime-node` 1.21.0, che quel binario ce l'ha.
- **pgvector in PGlite 0.5 si importa dal pacchetto a parte:** `import { vector } from "@electric-sql/pglite-pgvector"`. Il vecchio `@electric-sql/pglite/vector` non esiste più (`ERR_PACKAGE_PATH_NOT_EXPORTED`).
- Modello di embedding: `Xenova/multilingual-e5-small`, `dtype: "q8"`, 384 dimensioni. Prefisso `passage: ` per i testi e `query: ` per le domande.
- Messaggi di errore, nomi delle funzioni e testi degli strumenti MCP sono in italiano.
- Il server MCP non scrive mai su stdout: stdout è il canale del protocollo.
- Nessun LLM e nessuna chiave API dentro la Cineteca. OpenRouter non si usa.
- Il database vive in `data/cineteca/`, che è fuori da git.
- Ogni commit finisce con la riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Push su `origin` (github.com/rblvince/cineteca, privato) solo a fine fase e solo dopo l'ok di Vincent.**
- **Registrare il server MCP in Claude Code è una modifica di configurazione:** si mostra a Vincent la riga esatta e si aspetta il suo ok prima di farla.

## Review Focus

1. **Scheda rotta.** Vale per un blocco `---` in testa mancante, per YAML invalido e per un file salvato con fine riga Windows. Atteso: errore che nomina il file; con `\r\n` invece deve funzionare. Test nel Task 1.
2. **Filtro scritto con maiuscole diverse o spazi** (`"martin scorsese "`). Atteso: trova Martin Scorsese e non risponde "valore sconosciuto". Test nel Task 7.
3. **Schede cambiate tra un ingest e l'altro.** Una scheda cancellata dal corpus deve sparire dal database. Rilanciare senza modifiche deve dare zero embedding ricalcolati. Cambiare modello di embedding deve ricalcolare tutto. Test nel Task 3.
4. **Errore di validazione a metà corpus.** Il database non deve restare scritto a metà: o si carica tutto o niente. Test nel Task 3.
5. **Domanda vuota o fatta di soli spazi, `k` fuori dall'intervallo 1-20.** Atteso: errore chiaro, non un risultato vuoto o un crash. Test nei Task 7 e 8.

---

## Fase 1 — Fondamenta

### Task 1: Scaffold e lettura del corpus (`corpus.js`)

**Files:**
- Create: `package.json`, `src/corpus.js`, `test/helpers.js`, `test/corpus.test.js`

**Interfaces:**
- Consumes: niente.
- Produces:
  - `class ErroreCorpus extends Error`
  - `parseScheda(testo: string, file: string) → { meta: object, corpo: string }`
  - `validaScheda(meta: object, vocabolario: {inquadrature: string[], movimenti: string[], temi: string[]}, file: string) → void` (lancia `ErroreCorpus`)
  - `dividiInPezzi(corpo: string, file: string) → Array<{ sezione: string, testo: string }>`
  - `testoPezzo(meta: object, pezzo: {sezione, testo}) → string`
  - `leggiVocabolario(percorso: string) → Promise<vocabolario>`
  - `leggiCorpus(dir: string) → Promise<{ documenti: Array<{ id, tipo, metadati, testo, pezzi }>, vocabolario }>`
  - `hashTesto(testo: string) → string` (sha256 esadecimale)
  - in `test/helpers.js`: `scriviCorpusProva(dir: string) → Promise<void>` ed `embedderFinto(dim = 384)`, che restituisce `{ modello, dim, passaggi(testi) → Promise<number[][]>, domanda(testo) → Promise<number[]>, chiamate }`

- [ ] **Step 1: Crea `package.json` e installa**

```json
{
  "name": "cineteca",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Archivio di scene dai capolavori del cinema, interrogabile via MCP, per Ultrarantino",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test test/*.test.js",
    "test:integrazione": "node --test test/integrazione/*.test.js",
    "ingest": "node src/ingest.js",
    "mcp": "node src/mcp.js"
  },
  "dependencies": {
    "@electric-sql/pglite": "0.5.8",
    "@electric-sql/pglite-pgvector": "0.0.9",
    "@huggingface/transformers": "3.8.1",
    "@modelcontextprotocol/sdk": "1.30.1",
    "yaml": "2.9.1",
    "zod": "4.6.5"
  }
}
```

Run: `cd ~/my-agent/cineteca && npm install`
Expected: exit 0, `package-lock.json` creato, `ls node_modules/onnxruntime-node/bin/napi-v6/darwin/` elenca `x64`.

- [ ] **Step 2: Scrivi `test/helpers.js`**

```js
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Embedder deterministico per i test: ogni parola finisce in un "cassetto"
// del vettore, così testi con parole in comune risultano simili.
export function embedderFinto(dim = 384) {
  let chiamate = 0;
  const vettore = (testo) => {
    const v = new Array(dim).fill(0);
    const pulito = testo.toLowerCase().replace(/^(passage|query): /, "");
    for (const parola of pulito.match(/\p{L}+/gu) ?? []) {
      let h = 0;
      for (const c of parola) h = (h * 31 + c.codePointAt(0)) >>> 0;
      v[h % dim] += 1;
    }
    const norma = Math.hypot(...v) || 1;
    return v.map((x) => x / norma);
  };
  return {
    modello: "finto",
    dim,
    passaggi: async (testi) => {
      chiamate += testi.length;
      return testi.map(vettore);
    },
    domanda: async (testo) => vettore(testo),
    get chiamate() {
      return chiamate;
    },
  };
}

const VOCABOLARIO = `inquadrature: [campo medio, primo piano, campo lungo]
movimenti: [carrello laterale, steadicam, camera fissa]
temi: [solitudine, rifiuto, potere, famiglia]
`;

export const SCENA_TAXI = `---
id: taxi-driver-telefonata
tipo: scena
film: Taxi Driver
regista: Martin Scorsese
anno: 1976
dop: Michael Chapman
minutaggio: "~01:03"
inquadrature: [campo medio]
movimenti: [carrello laterale]
temi: [solitudine, rifiuto]
fonti:
  - titolo: Fonte di prova
    url: https://example.com/taxi
sguardo_vincent: Come la solitudine cambia una persona
---
## Cosa succede
Travis telefona a Betsy da un telefono pubblico e viene respinto.

## Come è girata
La macchina da presa si allontana lateralmente verso un corridoio vuoto, come se non sopportasse di guardare.

## Perché funziona
Il rifiuto diventa spazio vuoto: la solitudine si vede invece di dirla.
`;

export const SCENA_COPACABANA = `---
id: quei-bravi-ragazzi-copacabana
tipo: scena
film: Quei bravi ragazzi
regista: Martin Scorsese
anno: 1990
dop: Michael Ballhaus
inquadrature: [campo medio]
movimenti: [steadicam]
temi: [potere]
fonti:
  - titolo: Fonte di prova
    url: https://example.com/copacabana
---
## Cosa succede
Henry porta Karen al Copacabana entrando dal retro, attraverso la cucina.

## Come è girata
Una steadicam segue la coppia senza stacchi dalla strada fino al tavolo davanti al palco.

## Perché funziona
Il piano sequenza mostra il potere di Henry: tutte le porte si aprono per lui.
`;

export const PROFILO_SCORSESE = `---
id: martin-scorsese
tipo: regista
regista: Martin Scorsese
fonti:
  - titolo: Fonte di prova
    url: https://example.com/scorsese
---
## La firma
Camera energica, voce narrante, musica pop sopra le scene, la colpa come motore.
`;

export async function scriviCorpusProva(dir) {
  await mkdir(path.join(dir, "scene"), { recursive: true });
  await mkdir(path.join(dir, "registi"), { recursive: true });
  await writeFile(path.join(dir, "vocabolario.yaml"), VOCABOLARIO);
  await writeFile(path.join(dir, "scene", "taxi-driver-telefonata.md"), SCENA_TAXI);
  await writeFile(path.join(dir, "scene", "quei-bravi-ragazzi-copacabana.md"), SCENA_COPACABANA);
  await writeFile(path.join(dir, "registi", "martin-scorsese.md"), PROFILO_SCORSESE);
}
```

- [ ] **Step 3: Scrivi i test che falliscono (`test/corpus.test.js`)**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ErroreCorpus, parseScheda, validaScheda, dividiInPezzi, testoPezzo, leggiCorpus, hashTesto,
} from "../src/corpus.js";
import { scriviCorpusProva, SCENA_TAXI } from "./helpers.js";

const VOC = {
  inquadrature: ["campo medio", "primo piano", "campo lungo"],
  movimenti: ["carrello laterale", "steadicam", "camera fissa"],
  temi: ["solitudine", "rifiuto", "potere", "famiglia"],
};
const F = "scene/taxi-driver-telefonata.md";
const metaTaxi = () => parseScheda(SCENA_TAXI, F).meta;

test("parseScheda separa campi e corpo", () => {
  const { meta, corpo } = parseScheda(SCENA_TAXI, F);
  assert.equal(meta.film, "Taxi Driver");
  assert.equal(meta.anno, 1976);
  assert.match(corpo, /^## Cosa succede/);
});

test("parseScheda accetta i fine riga Windows", () => {
  const { meta } = parseScheda(SCENA_TAXI.replace(/\n/g, "\r\n"), F);
  assert.equal(meta.id, "taxi-driver-telefonata");
});

test("parseScheda senza blocco in testa: errore col nome del file", () => {
  assert.throws(() => parseScheda("## Solo corpo\ntesto", F), (e) => e instanceof ErroreCorpus && e.message.startsWith(F));
});

test("parseScheda con YAML rotto: errore col nome del file", () => {
  assert.throws(() => parseScheda("---\nid: [non chiusa\n---\n## A\nb", F), /taxi-driver-telefonata\.md: YAML non valido/);
});

test("validaScheda accetta una scheda corretta", () => {
  assert.doesNotThrow(() => validaScheda(metaTaxi(), VOC, F));
});

for (const [descrizione, modifica, atteso] of [
  ["campo obbligatorio mancante", (m) => delete m.dop, /manca il campo "dop"/],
  ["tipo sconosciuto", (m) => (m.tipo = "film"), /tipo deve essere/],
  ["id con maiuscole", (m) => (m.id = "Taxi"), /id "Taxi" non valido/],
  ["id diverso dal nome del file", (m) => (m.id = "altra-scena"), /diverso dal nome del file/],
  ["nessuna fonte", (m) => (m.fonti = []), /almeno una fonte/],
  ["fonte senza url", (m) => (m.fonti = [{ titolo: "x" }]), /fonte 1 senza url valido/],
  ["fonte con url non http", (m) => (m.fonti = [{ titolo: "x", url: "ftp://a" }]), /fonte 1 senza url valido/],
  ["anno non intero", (m) => (m.anno = "1976"), /anno deve essere un numero intero/],
  ["valore fuori vocabolario", (m) => (m.movimenti = ["carrellata"]), /movimenti: "carrellata" non è nel vocabolario/],
  ["lista vuota", (m) => (m.temi = []), /temi deve essere una lista non vuota/],
  ["sguardo non testuale", (m) => (m.sguardo_vincent = 3), /sguardo_vincent deve essere testo/],
]) {
  test(`validaScheda rifiuta: ${descrizione}`, () => {
    const m = metaTaxi();
    modifica(m);
    assert.throws(() => validaScheda(m, VOC, F), (e) => e instanceof ErroreCorpus && atteso.test(e.message) && e.message.startsWith(F));
  });
}

test("dividiInPezzi: un pezzo per sezione, ignora le sezioni vuote e il testo prima della prima", () => {
  const pezzi = dividiInPezzi("intro ignorata\n## A\nuno\n\n## Vuota\n\n## B\ndue\n### sotto\ntre\n", F);
  assert.deepEqual(pezzi, [
    { sezione: "A", testo: "uno" },
    { sezione: "B", testo: "due\n### sotto\ntre" },
  ]);
});

test("dividiInPezzi senza sezioni: errore", () => {
  assert.throws(() => dividiInPezzi("solo testo", F), /nessuna sezione/);
});

test("testoPezzo mette il contesto del film e lo sguardo di Vincent", () => {
  const t = testoPezzo(metaTaxi(), { sezione: "Come è girata", testo: "Carrello." });
  assert.equal(t, "Taxi Driver (Martin Scorsese, 1976) — Come è girata\nCarrello.\nSguardo di Vincent: Come la solitudine cambia una persona");
});

test("testoPezzo per un regista", () => {
  const t = testoPezzo({ tipo: "regista", regista: "Martin Scorsese" }, { sezione: "La firma", testo: "Energia." });
  assert.equal(t, "Martin Scorsese — La firma\nEnergia.");
});

test("leggiCorpus legge scene e registi", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cineteca-"));
  await scriviCorpusProva(dir);
  const { documenti, vocabolario } = await leggiCorpus(dir);
  assert.deepEqual(documenti.map((d) => d.id).sort(), ["martin-scorsese", "quei-bravi-ragazzi-copacabana", "taxi-driver-telefonata"]);
  const taxi = documenti.find((d) => d.id === "taxi-driver-telefonata");
  assert.equal(taxi.tipo, "scena");
  assert.equal(taxi.pezzi.length, 3);
  assert.equal(taxi.testo, SCENA_TAXI);
  assert.deepEqual(vocabolario.temi, ["solitudine", "rifiuto", "potere", "famiglia"]);
});

test("leggiCorpus: scheda regista nella cartella scene è un errore", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cineteca-"));
  await scriviCorpusProva(dir);
  const profilo = (await import("./helpers.js")).PROFILO_SCORSESE;
  await writeFile(path.join(dir, "scene", "martin-scorsese.md"), profilo);
  await assert.rejects(leggiCorpus(dir), /scene\/martin-scorsese\.md: .*(tipo "regista" non va in scene|già usato)/);
});

test("leggiCorpus: vocabolario senza una chiave è un errore", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cineteca-"));
  await scriviCorpusProva(dir);
  await writeFile(path.join(dir, "vocabolario.yaml"), "inquadrature: [a]\nmovimenti: [b]\n");
  await assert.rejects(leggiCorpus(dir), /vocabolario\.yaml: "temi" deve essere una lista non vuota di testi/);
});

test("hashTesto è stabile e cambia col testo", () => {
  assert.equal(hashTesto("a"), hashTesto("a"));
  assert.notEqual(hashTesto("a"), hashTesto("b"));
  assert.match(hashTesto("a"), /^[0-9a-f]{64}$/);
});
```

- [ ] **Step 4: Esegui i test e verifica che falliscano**

Run: `npm test`
Expected: FAIL con `Cannot find module '.../src/corpus.js'`.

- [ ] **Step 5: Scrivi `src/corpus.js`**

```js
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import YAML from "yaml";

export class ErroreCorpus extends Error {}

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CAMPI = {
  scena: ["id", "tipo", "film", "regista", "anno", "dop", "inquadrature", "movimenti", "temi", "fonti"],
  regista: ["id", "tipo", "regista", "fonti"],
};
const LISTE = ["inquadrature", "movimenti", "temi"];
const CARTELLE = { scene: "scena", registi: "regista" };

export function hashTesto(testo) {
  return createHash("sha256").update(testo).digest("hex");
}

export function parseScheda(testo, file) {
  const m = testo.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new ErroreCorpus(`${file}: manca il blocco --- in testa`);
  let meta;
  try {
    meta = YAML.parse(m[1]);
  } catch (e) {
    throw new ErroreCorpus(`${file}: YAML non valido (${e.message.split("\n")[0]})`);
  }
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    throw new ErroreCorpus(`${file}: il blocco in testa deve contenere dei campi`);
  }
  return { meta, corpo: m[2] };
}

export function validaScheda(meta, vocabolario, file) {
  const errore = (msg) => {
    throw new ErroreCorpus(`${file}: ${msg}`);
  };
  if (!Object.hasOwn(CAMPI, meta.tipo)) errore(`tipo deve essere "scena" o "regista", trovato ${JSON.stringify(meta.tipo)}`);
  for (const campo of CAMPI[meta.tipo]) {
    if (meta[campo] === undefined || meta[campo] === null || meta[campo] === "") errore(`manca il campo "${campo}"`);
  }
  if (typeof meta.id !== "string" || !ID.test(meta.id)) errore(`id "${meta.id}" non valido: solo minuscole, cifre e trattini`);
  if (path.basename(file, ".md") !== meta.id) errore(`id "${meta.id}" diverso dal nome del file`);
  if (!Array.isArray(meta.fonti) || meta.fonti.length === 0) errore("serve almeno una fonte");
  meta.fonti.forEach((f, i) => {
    if (!f || typeof f.titolo !== "string" || !f.titolo.trim()) errore(`fonte ${i + 1} senza titolo`);
    if (typeof f.url !== "string" || !/^https?:\/\/\S+$/.test(f.url)) errore(`fonte ${i + 1} senza url valido`);
  });
  if (meta.tipo === "scena") {
    if (!Number.isInteger(meta.anno)) errore("anno deve essere un numero intero");
    for (const campo of LISTE) {
      const valori = meta[campo];
      if (!Array.isArray(valori) || valori.length === 0) errore(`${campo} deve essere una lista non vuota`);
      for (const v of valori) {
        if (!vocabolario[campo].includes(v)) {
          errore(`${campo}: "${v}" non è nel vocabolario (valori ammessi: ${vocabolario[campo].join(", ")})`);
        }
      }
    }
  }
  if (meta.sguardo_vincent !== undefined && typeof meta.sguardo_vincent !== "string") errore("sguardo_vincent deve essere testo");
}

export function dividiInPezzi(corpo, file) {
  const pezzi = [];
  for (const blocco of corpo.split(/^## /m).slice(1)) {
    const [titolo, ...righe] = blocco.split("\n");
    const testo = righe.join("\n").trim();
    if (testo) pezzi.push({ sezione: titolo.trim(), testo });
  }
  if (!pezzi.length) throw new ErroreCorpus(`${file}: nessuna sezione "## " con del testo`);
  return pezzi;
}

// Il testo che finisce nell'embedding: il pezzo più il contesto che da solo non avrebbe.
export function testoPezzo(meta, pezzo) {
  const chi = meta.tipo === "scena" ? `${meta.film} (${meta.regista}, ${meta.anno})` : meta.regista;
  const sguardo = meta.sguardo_vincent ? `\nSguardo di Vincent: ${meta.sguardo_vincent}` : "";
  return `${chi} — ${pezzo.sezione}\n${pezzo.testo}${sguardo}`;
}

export async function leggiVocabolario(percorso) {
  const nome = path.basename(percorso);
  let voc;
  try {
    voc = YAML.parse(await readFile(percorso, "utf8"));
  } catch (e) {
    throw new ErroreCorpus(`${nome}: ${e.code === "ENOENT" ? "file mancante" : `YAML non valido (${e.message.split("\n")[0]})`}`);
  }
  for (const campo of LISTE) {
    const valori = voc?.[campo];
    if (!Array.isArray(valori) || !valori.length || !valori.every((v) => typeof v === "string" && v.trim())) {
      throw new ErroreCorpus(`${nome}: "${campo}" deve essere una lista non vuota di testi`);
    }
    if (new Set(valori).size !== valori.length) throw new ErroreCorpus(`${nome}: "${campo}" ha valori ripetuti`);
  }
  return voc;
}

export async function leggiCorpus(dir) {
  const vocabolario = await leggiVocabolario(path.join(dir, "vocabolario.yaml"));
  const documenti = [];
  const visti = new Map();
  for (const [sotto, tipoAtteso] of Object.entries(CARTELLE)) {
    let nomi = [];
    try {
      nomi = (await readdir(path.join(dir, sotto))).filter((n) => n.endsWith(".md")).sort();
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    for (const nome of nomi) {
      const file = `${sotto}/${nome}`;
      const testo = (await readFile(path.join(dir, sotto, nome), "utf8")).replace(/\r\n/g, "\n");
      const { meta, corpo } = parseScheda(testo, file);
      validaScheda(meta, vocabolario, file);
      if (meta.tipo !== tipoAtteso) throw new ErroreCorpus(`${file}: tipo "${meta.tipo}" non va in ${sotto}/`);
      if (visti.has(meta.id)) throw new ErroreCorpus(`${file}: id "${meta.id}" già usato in ${visti.get(meta.id)}`);
      visti.set(meta.id, file);
      documenti.push({ id: meta.id, tipo: meta.tipo, metadati: meta, testo, pezzi: dividiInPezzi(corpo, file) });
    }
  }
  return { documenti, vocabolario };
}
```

- [ ] **Step 6: Esegui i test e verifica che passino**

Run: `npm test`
Expected: PASS, tutti i test di `corpus.test.js` verdi.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/corpus.js test/helpers.js test/corpus.test.js
git commit -m "Lettura e validazione delle schede del corpus

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Database (`db.js`)

**Files:**
- Create: `src/db.js`, `test/db.test.js`

**Interfaces:**
- Consumes: `embedderFinto` da `test/helpers.js` (solo nei test).
- Produces:
  - `apriDb(cartella?: string) → Promise<PGlite>` (senza cartella il database sta in memoria)
  - `inizializza(db, dim: number) → Promise<void>`
  - `impronteEsistenti(db) → Promise<Map<id, impronta>>`
  - `applicaModifiche(db, { daScrivere: Array<{ doc: {id, tipo, metadati, testo, pezzi}, impronta: string, embeddings: number[][] }>, daRimuovere: string[] }) → Promise<void>` (una transazione)
  - `cercaDocumenti(db, { embedding: number[], filtri: object, k: number }) → Promise<Array<{ documento, sezione, testo, metadati, somiglianza }>>` (un solo pezzo per documento, il migliore)
  - `valoriDistinti(db, campo: "regista"|"film"|"movimenti"|"temi"|"inquadrature", tipo = "scena") → Promise<string[]>`
  - `leggiDocumento(db, id) → Promise<{ id, tipo, metadati, testo } | null>`
  - `idDove(db, filtri: object) → Promise<string[]>`

- [ ] **Step 1: Scrivi i test che falliscono (`test/db.test.js`)**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apriDb, inizializza, impronteEsistenti, applicaModifiche, cercaDocumenti, valoriDistinti, leggiDocumento, idDove,
} from "../src/db.js";
import { embedderFinto } from "./helpers.js";

const e = embedderFinto();

async function dbConDue() {
  const db = await apriDb();
  await inizializza(db, e.dim);
  const scena = (id, film, movimenti, testi) => ({
    doc: {
      id, tipo: "scena", testo: `testo ${id}`,
      metadati: { id, tipo: "scena", film, regista: "Martin Scorsese", movimenti, temi: ["solitudine"], fonti: [{ titolo: "t", url: "https://e.com" }] },
      pezzi: testi.map((t, i) => ({ sezione: `S${i}`, testo: t })),
    },
    impronta: `h-${id}`,
  });
  const a = scena("taxi", "Taxi Driver", ["carrello laterale"], ["telefono rifiuto corridoio vuoto", "corridoio vuoto solitudine notte", "altro"]);
  const b = scena("copa", "Quei bravi ragazzi", ["steadicam"], ["steadicam cucina locale"]);
  for (const s of [a, b]) s.embeddings = await e.passaggi(s.doc.pezzi.map((p) => p.testo));
  await applicaModifiche(db, { daScrivere: [a, b], daRimuovere: [] });
  return db;
}

test("applicaModifiche scrive documenti e pezzi, impronteEsistenti li vede", async () => {
  const db = await dbConDue();
  assert.deepEqual([...(await impronteEsistenti(db))].sort(), [["copa", "h-copa"], ["taxi", "h-taxi"]]);
  const { rows } = await db.query("select count(*)::int as n from pezzi");
  assert.equal(rows[0].n, 4);
});

test("cercaDocumenti: un solo pezzo per documento, il più simile, in ordine", async () => {
  const db = await dbConDue();
  const r = await cercaDocumenti(db, { embedding: await e.domanda("corridoio vuoto"), filtri: { tipo: "scena" }, k: 5 });
  assert.deepEqual(r.map((x) => x.documento), ["taxi", "copa"]);
  assert.equal(r[0].metadati.film, "Taxi Driver");
  assert.ok(r[0].somiglianza > r[1].somiglianza);
});

test("cercaDocumenti rispetta i filtri su liste e scalari", async () => {
  const db = await dbConDue();
  const q = await e.domanda("corridoio vuoto");
  assert.deepEqual((await cercaDocumenti(db, { embedding: q, filtri: { movimenti: ["steadicam"] }, k: 5 })).map((x) => x.documento), ["copa"]);
  assert.deepEqual((await cercaDocumenti(db, { embedding: q, filtri: { film: "Nessuno" }, k: 5 })), []);
});

test("cercaDocumenti rispetta k", async () => {
  const db = await dbConDue();
  assert.equal((await cercaDocumenti(db, { embedding: await e.domanda("x vuoto"), filtri: {}, k: 1 })).length, 1);
});

test("applicaModifiche sostituisce e rimuove, i pezzi seguono", async () => {
  const db = await dbConDue();
  const nuovo = { doc: { id: "taxi", tipo: "scena", testo: "t2", metadati: { id: "taxi", tipo: "scena", film: "Taxi Driver" }, pezzi: [{ sezione: "S", testo: "uno" }] }, impronta: "h2", embeddings: await e.passaggi(["uno"]) };
  await applicaModifiche(db, { daScrivere: [nuovo], daRimuovere: ["copa"] });
  assert.deepEqual([...(await impronteEsistenti(db))], [["taxi", "h2"]]);
  const { rows } = await db.query("select count(*)::int as n from pezzi");
  assert.equal(rows[0].n, 1);
});

test("applicaModifiche è tutto o niente", async () => {
  const db = await dbConDue();
  const rotto = { doc: { id: "rotto", tipo: "scena", testo: "t", metadati: {}, pezzi: [{ sezione: "S", testo: "a" }] }, impronta: "h", embeddings: [[1, 2]] };
  await assert.rejects(applicaModifiche(db, { daScrivere: [rotto], daRimuovere: ["copa"] }));
  assert.deepEqual([...(await impronteEsistenti(db))].map(([id]) => id).sort(), ["copa", "taxi"]);
});

test("valoriDistinti su scalari e liste, ordinati", async () => {
  const db = await dbConDue();
  assert.deepEqual(await valoriDistinti(db, "film"), ["Quei bravi ragazzi", "Taxi Driver"]);
  assert.deepEqual(await valoriDistinti(db, "movimenti"), ["carrello laterale", "steadicam"]);
  await assert.rejects(valoriDistinti(db, "metadati; drop table pezzi"), /campo non ammesso/);
});

test("leggiDocumento e idDove", async () => {
  const db = await dbConDue();
  assert.equal((await leggiDocumento(db, "taxi")).testo, "testo taxi");
  assert.equal(await leggiDocumento(db, "nessuno"), null);
  assert.deepEqual(await idDove(db, { regista: "Martin Scorsese" }), ["copa", "taxi"]);
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test`
Expected: FAIL con `Cannot find module '.../src/db.js'`.

- [ ] **Step 3: Scrivi `src/db.js`**

```js
import { mkdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const CAMPI_SCALARI = ["regista", "film"];
const CAMPI_LISTA = ["movimenti", "temi", "inquadrature"];

export async function apriDb(cartella) {
  const opzioni = { extensions: { vector } };
  if (cartella) await mkdir(cartella, { recursive: true });
  const db = cartella ? new PGlite(cartella, opzioni) : new PGlite(opzioni);
  await db.waitReady;
  return db;
}

export async function inizializza(db, dim) {
  if (!Number.isInteger(dim) || dim <= 0) throw new Error(`dimensione non valida: ${dim}`);
  await db.exec(`
    create extension if not exists vector;
    create table if not exists documenti (
      id        text primary key,
      tipo      text not null check (tipo in ('scena','regista')),
      metadati  jsonb not null,
      testo     text not null,
      impronta  text not null
    );
    create table if not exists pezzi (
      id         bigserial primary key,
      documento  text not null references documenti(id) on delete cascade,
      sezione    text not null,
      testo      text not null,
      embedding  vector(${dim}) not null
    );`);
}

export async function impronteEsistenti(db) {
  const { rows } = await db.query("select id, impronta from documenti");
  return new Map(rows.map((r) => [r.id, r.impronta]));
}

export async function applicaModifiche(db, { daScrivere, daRimuovere }) {
  await db.transaction(async (tx) => {
    if (daRimuovere.length) await tx.query("delete from documenti where id = any($1)", [daRimuovere]);
    for (const { doc, impronta, embeddings } of daScrivere) {
      if (embeddings.length !== doc.pezzi.length) throw new Error(`${doc.id}: ${doc.pezzi.length} pezzi ma ${embeddings.length} embedding`);
      await tx.query("delete from documenti where id = $1", [doc.id]);
      await tx.query(
        "insert into documenti (id, tipo, metadati, testo, impronta) values ($1, $2, $3::jsonb, $4, $5)",
        [doc.id, doc.tipo, JSON.stringify(doc.metadati), doc.testo, impronta],
      );
      for (const [i, p] of doc.pezzi.entries()) {
        await tx.query(
          "insert into pezzi (documento, sezione, testo, embedding) values ($1, $2, $3, $4::vector)",
          [doc.id, p.sezione, p.testo, JSON.stringify(embeddings[i])],
        );
      }
    }
  });
}

// Per ogni documento che passa i filtri tiene il pezzo più vicino alla domanda,
// poi restituisce i k documenti migliori. Nessun indice: con poche centinaia di
// pezzi la scansione completa è istantanea.
export async function cercaDocumenti(db, { embedding, filtri, k }) {
  const { rows } = await db.query(
    `select * from (
       select distinct on (p.documento)
              p.documento, p.sezione, p.testo, d.metadati,
              1 - (p.embedding <=> $1::vector) as somiglianza
         from pezzi p join documenti d on d.id = p.documento
        where d.metadati @> $2::jsonb
        order by p.documento, p.embedding <=> $1::vector
     ) migliori
     order by somiglianza desc
     limit $3`,
    [JSON.stringify(embedding), JSON.stringify(filtri), k],
  );
  return rows;
}

export async function valoriDistinti(db, campo, tipo = "scena") {
  let sql;
  if (CAMPI_SCALARI.includes(campo)) {
    sql = "select distinct metadati->>$1 as v from documenti where tipo = $2 and metadati ? $1 order by v";
  } else if (CAMPI_LISTA.includes(campo)) {
    sql = "select distinct v from documenti, jsonb_array_elements_text(metadati->$1) as v where tipo = $2 order by v";
  } else {
    throw new Error(`campo non ammesso: ${campo}`);
  }
  const { rows } = await db.query(sql, [campo, tipo]);
  return rows.map((r) => r.v);
}

export async function leggiDocumento(db, id) {
  const { rows } = await db.query("select id, tipo, metadati, testo from documenti where id = $1", [id]);
  return rows[0] ?? null;
}

export async function idDove(db, filtri) {
  const { rows } = await db.query("select id from documenti where metadati @> $1::jsonb order by id", [JSON.stringify(filtri)]);
  return rows.map((r) => r.id);
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test`
Expected: PASS, test di `corpus` e `db` tutti verdi.

- [ ] **Step 5: Commit**

```bash
git add src/db.js test/db.test.js
git commit -m "Database PGlite con pgvector: schema, scrittura, ricerca

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Embedding e caricamento (`embed.js`, `ingest.js`)

**Files:**
- Create: `src/embed.js`, `src/ingest.js`, `test/ingest.test.js`, `test/integrazione/modello.test.js`

**Interfaces:**
- Consumes: `leggiCorpus`, `testoPezzo`, `hashTesto`, `ErroreCorpus` (Task 1); `apriDb`, `inizializza`, `impronteEsistenti`, `applicaModifiche`, `cercaDocumenti` (Task 2).
- Produces:
  - `MODELLO = "Xenova/multilingual-e5-small"`, `DIM = 384`
  - `creaEmbedder({ modello = MODELLO } = {}) → Promise<{ modello, dim, passaggi(testi) → Promise<number[][]>, domanda(testo) → Promise<number[]> }>`
  - `eseguiIngest({ dirCorpus, db, embedder, lotto = 16 }) → Promise<{ aggiunti, aggiornati, rimossi, invariati }>`
  - `PERCORSO_DB`, `PERCORSO_CORPUS` (percorsi predefiniti, assoluti)

- [ ] **Step 1: Scrivi i test che falliscono (`test/ingest.test.js`)**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { apriDb, inizializza, impronteEsistenti } from "../src/db.js";
import { eseguiIngest } from "../src/ingest.js";
import { scriviCorpusProva, embedderFinto, SCENA_TAXI } from "./helpers.js";

async function preparato() {
  const dir = await mkdtemp(path.join(tmpdir(), "cineteca-"));
  await scriviCorpusProva(dir);
  const db = await apriDb();
  await inizializza(db, 384);
  return { dir, db };
}

test("primo caricamento: tutto aggiunto, un embedding per pezzo", async () => {
  const { dir, db } = await preparato();
  const e = embedderFinto();
  assert.deepEqual(await eseguiIngest({ dirCorpus: dir, db, embedder: e }), { aggiunti: 3, aggiornati: 0, rimossi: 0, invariati: 0 });
  assert.equal(e.chiamate, 3 + 3 + 1);
});

test("secondo caricamento senza modifiche: zero embedding ricalcolati", async () => {
  const { dir, db } = await preparato();
  await eseguiIngest({ dirCorpus: dir, db, embedder: embedderFinto() });
  const e = embedderFinto();
  assert.deepEqual(await eseguiIngest({ dirCorpus: dir, db, embedder: e }), { aggiunti: 0, aggiornati: 0, rimossi: 0, invariati: 3 });
  assert.equal(e.chiamate, 0);
});

test("scheda modificata e scheda cancellata", async () => {
  const { dir, db } = await preparato();
  await eseguiIngest({ dirCorpus: dir, db, embedder: embedderFinto() });
  await writeFile(path.join(dir, "scene", "taxi-driver-telefonata.md"), SCENA_TAXI.replace("respinto", "respinto di nuovo"));
  await rm(path.join(dir, "scene", "quei-bravi-ragazzi-copacabana.md"));
  const e = embedderFinto();
  assert.deepEqual(await eseguiIngest({ dirCorpus: dir, db, embedder: e }), { aggiunti: 0, aggiornati: 1, rimossi: 1, invariati: 1 });
  assert.equal(e.chiamate, 3);
  assert.deepEqual([...(await impronteEsistenti(db)).keys()].sort(), ["martin-scorsese", "taxi-driver-telefonata"]);
});

test("cambio di modello: si ricalcola tutto", async () => {
  const { dir, db } = await preparato();
  await eseguiIngest({ dirCorpus: dir, db, embedder: embedderFinto() });
  const altro = { ...embedderFinto(), modello: "altro" };
  assert.equal((await eseguiIngest({ dirCorpus: dir, db, embedder: altro })).aggiornati, 3);
});

test("errore di validazione: il database non cambia", async () => {
  const { dir, db } = await preparato();
  await eseguiIngest({ dirCorpus: dir, db, embedder: embedderFinto() });
  const prima = await impronteEsistenti(db);
  await writeFile(path.join(dir, "scene", "taxi-driver-telefonata.md"), SCENA_TAXI.replace("respinto", "cambiato").replace(/fonti:[\s\S]*?sguardo/, "fonti: []\nsguardo"));
  await assert.rejects(eseguiIngest({ dirCorpus: dir, db, embedder: embedderFinto() }), /taxi-driver-telefonata\.md: serve almeno una fonte/);
  assert.deepEqual(await impronteEsistenti(db), prima);
});

test("i lotti non cambiano il risultato", async () => {
  const { dir, db } = await preparato();
  const e = embedderFinto();
  await eseguiIngest({ dirCorpus: dir, db, embedder: e, lotto: 1 });
  assert.equal(e.chiamate, 7);
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test`
Expected: FAIL con `Cannot find module '.../src/ingest.js'`.

- [ ] **Step 3: Scrivi `src/embed.js`**

```js
import { pipeline } from "@huggingface/transformers";

export const MODELLO = "Xenova/multilingual-e5-small";
export const DIM = 384;

export async function creaEmbedder({ modello = MODELLO } = {}) {
  const estrai = await pipeline("feature-extraction", modello, { dtype: "q8" });
  const vettori = async (testi) => {
    const t = await estrai(testi, { pooling: "mean", normalize: true });
    const [n, d] = t.dims;
    if (d !== DIM) throw new Error(`il modello ${modello} dà vettori da ${d}, attesi ${DIM}`);
    return Array.from({ length: n }, (_, i) => Array.from(t.data.slice(i * d, (i + 1) * d)));
  };
  return {
    modello,
    dim: DIM,
    // Convenzione dei modelli e5: "passage: " per i testi, "query: " per le domande.
    passaggi: (testi) => vettori(testi.map((t) => `passage: ${t}`)),
    domanda: async (testo) => (await vettori([`query: ${testo}`]))[0],
  };
}
```

- [ ] **Step 4: Scrivi `src/ingest.js`**

```js
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leggiCorpus, testoPezzo, hashTesto, ErroreCorpus } from "./corpus.js";
import { apriDb, inizializza, impronteEsistenti, applicaModifiche } from "./db.js";

const RADICE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const PERCORSO_DB = process.env.CINETECA_DB ?? path.join(RADICE, "data", "cineteca");
export const PERCORSO_CORPUS = path.join(RADICE, "corpus");

export async function eseguiIngest({ dirCorpus, db, embedder, lotto = 16 }) {
  // Si legge e si valida tutto prima di toccare il database: un errore non lascia niente a metà.
  const { documenti } = await leggiCorpus(dirCorpus);
  const esistenti = await impronteEsistenti(db);
  const daScrivere = [];
  let aggiunti = 0, aggiornati = 0, invariati = 0;
  for (const doc of documenti) {
    // Il modello entra nell'impronta: cambiarlo ricalcola tutto invece di mescolare vettori.
    const impronta = hashTesto(`${embedder.modello}\n${doc.testo}`);
    const vecchia = esistenti.get(doc.id);
    if (vecchia === impronta) {
      invariati++;
      continue;
    }
    vecchia === undefined ? aggiunti++ : aggiornati++;
    const testi = doc.pezzi.map((p) => testoPezzo(doc.metadati, p));
    const embeddings = [];
    for (let i = 0; i < testi.length; i += lotto) embeddings.push(...(await embedder.passaggi(testi.slice(i, i + lotto))));
    daScrivere.push({ doc, impronta, embeddings });
  }
  const presenti = new Set(documenti.map((d) => d.id));
  const daRimuovere = [...esistenti.keys()].filter((id) => !presenti.has(id));
  await applicaModifiche(db, { daScrivere, daRimuovere });
  return { aggiunti, aggiornati, rimossi: daRimuovere.length, invariati };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { creaEmbedder, DIM } = await import("./embed.js");
  try {
    const db = await apriDb(PERCORSO_DB);
    await inizializza(db, DIM);
    const esito = await eseguiIngest({ dirCorpus: PERCORSO_CORPUS, db, embedder: await creaEmbedder() });
    console.log(`Aggiunte ${esito.aggiunti}, aggiornate ${esito.aggiornati}, rimosse ${esito.rimossi}, invariate ${esito.invariati}.`);
    await db.close();
  } catch (e) {
    if (!(e instanceof ErroreCorpus)) throw e;
    console.error(`Corpus non valido, database non toccato.\n${e.message}`);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npm test`
Expected: PASS, tutti verdi.

- [ ] **Step 6: Scrivi il test d'integrazione col modello vero (`test/integrazione/modello.test.js`)**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { creaEmbedder, DIM } from "../../src/embed.js";
import { apriDb, inizializza, cercaDocumenti } from "../../src/db.js";
import { eseguiIngest } from "../../src/ingest.js";
import { scriviCorpusProva } from "../helpers.js";

test("modello vero su PGlite vero: la domanda nota trova la scena giusta per prima", { timeout: 600_000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cineteca-"));
  await scriviCorpusProva(dir);
  const db = await apriDb();
  await inizializza(db, DIM);
  const embedder = await creaEmbedder();
  await eseguiIngest({ dirCorpus: dir, db, embedder });
  const r = await cercaDocumenti(db, { embedding: await embedder.domanda("un uomo solo respinto al telefono"), filtri: { tipo: "scena" }, k: 2 });
  assert.equal(r[0].documento, "taxi-driver-telefonata");
  const s = await cercaDocumenti(db, { embedding: await embedder.domanda("piano sequenza con la steadicam in un locale"), filtri: { tipo: "scena" }, k: 2 });
  assert.equal(s[0].documento, "quei-bravi-ragazzi-copacabana");
});
```

- [ ] **Step 7: Esegui il test d'integrazione**

Run: `npm run test:integrazione`
Expected: PASS. La prima volta scarica il modello, che poi resta nella cache di Transformers.js.

- [ ] **Step 8: Commit**

```bash
git add src/embed.js src/ingest.js test/ingest.test.js test/integrazione/modello.test.js
git commit -m "Embedding locali e caricamento incrementale del corpus

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Artefatto 1 e chiusura della fase

**Files:**
- Create: `docs/spiegazioni/01-database-embedding-chunking.html`

- [ ] **Step 1: Scrivi l'artefatto 1.** Seguire la skill `artifact-design`, poi pubblicarlo con Artifact. Deve spiegare passo passo, citando le righe di codice vere:
  - perché PGlite e non Supabase;
  - cos'è un embedding;
  - perché e5, e perché i prefissi `passage:`/`query:`;
  - perché si spezza per sezione e non a blocchi fissi;
  - perché ogni pezzo porta il contesto del film (`testoPezzo`);
  - cosa c'è nell'impronta e perché dentro c'è anche il modello;
  - perché si valida tutto prima di scrivere (tutto o niente);
  - la trappola di Transformers 4 sul Mac Intel.

  Chiude con 6 domande da colloquio, senza risposte (le risposte le dà Vincent).
- [ ] **Step 2: Copia locale.** Salvare l'HTML in `docs/spiegazioni/`, farne il commit e registrarlo nel vault. Serve una nota in `05 - Resources/Resoconti/` con una riga nell'indice `[[Resoconti]]`, per la regola "ogni resoconto si salva".
- [ ] **Step 3: Chiedere a Vincent** l'ok per il push della fase 1 su `origin`. Eseguire `git push` solo dopo il suo sì.

---

## Fase 2 — Taxi Driver da cima a fondo

### Task 5: Vocabolario vero e scelta delle scene

**Files:**
- Create: `corpus/vocabolario.yaml`
- Create: `docs/scelte/taxi-driver-scene.html` (pagina di scelta, pubblicata come artefatto)

- [ ] **Step 1: Scrivi `corpus/vocabolario.yaml`**

```yaml
inquadrature:
  - campo lunghissimo
  - campo lungo
  - campo medio
  - piano americano
  - mezza figura
  - primo piano
  - primissimo piano
  - dettaglio
  - dal basso
  - dall'alto
  - soggettiva
  - campo e controcampo
  - composizione simmetrica
  - profondità di campo
movimenti:
  - camera fissa
  - panoramica
  - carrello in avanti
  - carrello indietro
  - carrello laterale
  - steadicam
  - camera a mano
  - gru
  - zoom
  - dolly zoom
  - piano sequenza
temi:
  - solitudine
  - rifiuto
  - colpa
  - violenza
  - ossessione
  - potere
  - famiglia
  - identità
  - lutto
  - classe sociale
  - follia
  - redenzione
```

  Aggiungere un valore al vocabolario è una modifica esplicita del file, non un effetto collaterale di una scheda.

- [ ] **Step 2: Ricerca delle scene candidate.** Cercare 5-7 scene di Taxi Driver documentate da fonti vere, con WebSearch e WebFetch. Priorità alle interviste a Scorsese e a Michael Chapman, agli articoli di American Cinematographer e ai saggi Criterion. Una scena entra nella lista solo se ha almeno una fonte che parla di *come è girata*. Una fonte che la riassume e basta non conta.
- [ ] **Step 3: Pagina di scelta.** Partire dalla pagina dei film già usata (`~/my-agent/reports/2026-09-26-cineteca-scelta-film/cineteca-scelta.html`) e adattarla: capability `db`, documento `scelta/scene`. Ogni scheda mostra la scena, cosa si impara e le fonti trovate. Pubblicarla e mandare il link a Vincent.
- [ ] **Step 4: Leggere la scelta** con ArtifactData e annotarla nel daily note e nella nota Ultrarantino. Poi fare il commit di `corpus/vocabolario.yaml`.

### Task 6: Schede di Taxi Driver e profilo di Scorsese

**Files:**
- Create: `corpus/scene/taxi-driver-<slug>.md`, una per ogni scena scelta da Vincent
- Create: `corpus/registi/martin-scorsese.md`

- [ ] **Step 1: Scrivere le schede** nel formato della spec (campi in testa più le 5 sezioni).
  - Ogni affermazione su come è girata una scena deve venire da una fonte elencata in `fonti`. Se nessuna fonte copre un dettaglio (un obiettivo, un movimento), il dettaglio non si scrive.
  - `sguardo_vincent`: "Come la solitudine cambia una persona", su tutte le scene di Taxi Driver.
- [ ] **Step 2: Scrivere il profilo di Scorsese** (`tipo: regista`) con le 4 sezioni della spec e le fonti.
- [ ] **Step 3: Caricare**

Run: `npm run ingest`
Expected: `Aggiunte N, aggiornate 0, rimosse 0, invariate 0.`, dove N = numero di scene + 1. Se esce un errore di validazione, si corregge la scheda e si rilancia.

- [ ] **Step 4: Controllo del formato su un caso vero.** Rileggere una scheda insieme a Vincent: se il formato ha un difetto (un campo che manca, una sezione inutile), si corregge adesso la spec e poi le schede, prima di passare al resto del corpus.
- [ ] **Step 5: Commit**

```bash
git add corpus/
git commit -m "Corpus: Taxi Driver e profilo di Scorsese

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Fase 3 — Ricerca e server MCP

### Task 7: Logica di ricerca (`ricerca.js`)

**Files:**
- Create: `src/ricerca.js`, `test/ricerca.test.js`

**Interfaces:**
- Consumes: `cercaDocumenti`, `valoriDistinti`, `leggiDocumento`, `idDove` (Task 2); `eseguiIngest` (Task 3, nei test); `embedderFinto`, `scriviCorpusProva` (Task 1).
- Produces:
  - `class ErroreRicerca extends Error`
  - `SOGLIA_PERTINENZA` (number)
  - `distanza(a: string, b: string) → number` (Levenshtein)
  - `piuSimili(valore: string, candidati: string[], n = 3) → string[]`
  - `cercaScene(db, embedder, { domanda, regista?, film?, movimenti?, temi?, k = 5, soglia = SOGLIA_PERTINENZA }) → Promise<{ filtri: object, scene: Array<{ id, film, regista, sezione, estratto, punteggio, pertinente, fonti }> }>`
  - `leggiScena(db, id) → Promise<string>`
  - `profiloRegista(db, nome) → Promise<{ regista: string, profilo: string, scene: string[] }>`

- [ ] **Step 1: Scrivi i test che falliscono (`test/ricerca.test.js`)**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { apriDb, inizializza } from "../src/db.js";
import { eseguiIngest } from "../src/ingest.js";
import { ErroreRicerca, distanza, piuSimili, cercaScene, leggiScena, profiloRegista } from "../src/ricerca.js";
import { scriviCorpusProva, embedderFinto, SCENA_TAXI } from "./helpers.js";

const e = embedderFinto();
async function pronto() {
  const dir = await mkdtemp(path.join(tmpdir(), "cineteca-"));
  await scriviCorpusProva(dir);
  const db = await apriDb();
  await inizializza(db, e.dim);
  await eseguiIngest({ dirCorpus: dir, db, embedder: e });
  return db;
}

test("distanza e piuSimili", () => {
  assert.equal(distanza("kubrik", "kubrick"), 1);
  assert.equal(distanza("", "abc"), 3);
  assert.deepEqual(piuSimili("taxi-driver", ["quei-bravi-ragazzi-copacabana", "taxi-driver-telefonata"], 1), ["taxi-driver-telefonata"]);
});

test("cercaScene trova la scena giusta e non restituisce profili di registi", async () => {
  const db = await pronto();
  const { scene, filtri } = await cercaScene(db, e, { domanda: "corridoio vuoto dopo il rifiuto al telefono" });
  assert.equal(scene[0].id, "taxi-driver-telefonata");
  assert.equal(scene[0].film, "Taxi Driver");
  assert.ok(scene.every((s) => s.id !== "martin-scorsese"));
  assert.deepEqual(filtri, { tipo: "scena" });
  assert.deepEqual(scene[0].fonti, [{ titolo: "Fonte di prova", url: "https://example.com/taxi" }]);
  assert.equal(typeof scene[0].pertinente, "boolean");
});

test("cercaScene: ogni scena compare una volta sola", async () => {
  const db = await pronto();
  const { scene } = await cercaScene(db, e, { domanda: "corridoio vuoto solitudine rifiuto telefono", k: 5 });
  assert.equal(new Set(scene.map((s) => s.id)).size, scene.length);
});

test("cercaScene: filtri con maiuscole e spazi diversi vengono riconosciuti", async () => {
  const db = await pronto();
  const { scene, filtri } = await cercaScene(db, e, { domanda: "cucina", regista: "  martin SCORSESE ", movimenti: ["Steadicam"] });
  assert.deepEqual(filtri, { tipo: "scena", regista: "Martin Scorsese", movimenti: ["steadicam"] });
  assert.deepEqual(scene.map((s) => s.id), ["quei-bravi-ragazzi-copacabana"]);
});

test("cercaScene: filtro sconosciuto elenca i valori validi", async () => {
  const db = await pronto();
  await assert.rejects(
    cercaScene(db, e, { domanda: "x", regista: "Kubrik" }),
    (err) => err instanceof ErroreRicerca && /regista "Kubrik" non esiste\. Valori validi: Martin Scorsese/.test(err.message),
  );
});

test("cercaScene: domanda vuota o di soli spazi è un errore", async () => {
  const db = await pronto();
  await assert.rejects(cercaScene(db, e, { domanda: "   " }), /la domanda è vuota/);
});

test("cercaScene: k fuori intervallo è un errore", async () => {
  const db = await pronto();
  await assert.rejects(cercaScene(db, e, { domanda: "x", k: 0 }), /k deve essere un intero tra 1 e 20/);
  await assert.rejects(cercaScene(db, e, { domanda: "x", k: 21 }), /k deve essere un intero tra 1 e 20/);
});

test("cercaScene: soglia alta segna tutto come non pertinente, ma restituisce", async () => {
  const db = await pronto();
  const { scene } = await cercaScene(db, e, { domanda: "corridoio vuoto", soglia: 1.01 });
  assert.ok(scene.length > 0);
  assert.ok(scene.every((s) => s.pertinente === false));
});

test("cercaScene: estratto al massimo 300 caratteri", async () => {
  const db = await pronto();
  const { scene } = await cercaScene(db, e, { domanda: "corridoio" });
  assert.ok(scene.every((s) => s.estratto.length <= 301));
});

test("leggiScena restituisce la scheda completa, altrimenti suggerisce", async () => {
  const db = await pronto();
  assert.equal(await leggiScena(db, "taxi-driver-telefonata"), SCENA_TAXI);
  await assert.rejects(leggiScena(db, "taxi-driver"), /scena "taxi-driver" non trovata\. Forse: taxi-driver-telefonata/);
  await assert.rejects(leggiScena(db, "martin-scorsese"), /non trovata/);
});

test("profiloRegista: profilo più scene, nome senza badare alle maiuscole", async () => {
  const db = await pronto();
  const p = await profiloRegista(db, "martin scorsese");
  assert.equal(p.regista, "Martin Scorsese");
  assert.match(p.profilo, /## La firma/);
  assert.deepEqual(p.scene, ["quei-bravi-ragazzi-copacabana", "taxi-driver-telefonata"]);
  await assert.rejects(profiloRegista(db, "Scorsesse"), /regista "Scorsesse" non trovato\. Forse: Martin Scorsese/);
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test`
Expected: FAIL con `Cannot find module '.../src/ricerca.js'`.

- [ ] **Step 3: Scrivi `src/ricerca.js`**

```js
import { cercaDocumenti, valoriDistinti, leggiDocumento, idDove } from "./db.js";

export class ErroreRicerca extends Error {}

// ponytail: soglia provvisoria presa dallo spike del 26/09 (pertinente ~0.84, non pertinente ~0.80);
// si ritara sui dati veri con la valutazione (fase 5).
export const SOGLIA_PERTINENZA = 0.82;

const LUNGHEZZA_ESTRATTO = 300;

export function distanza(a, b) {
  let prima = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const riga = [i];
    for (let j = 1; j <= b.length; j++) {
      riga[j] = Math.min(prima[j] + 1, riga[j - 1] + 1, prima[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prima = riga;
  }
  return prima[b.length];
}

export function piuSimili(valore, candidati, n = 3) {
  const v = valore.toLowerCase();
  return [...candidati].sort((x, y) => distanza(v, x.toLowerCase()) - distanza(v, y.toLowerCase())).slice(0, n);
}

const normale = (s) => s.trim().toLowerCase();

async function canonico(db, campo, valore, tipo = "scena") {
  const validi = await valoriDistinti(db, campo, tipo);
  const trovato = validi.find((v) => normale(v) === normale(valore));
  if (trovato === undefined) {
    throw new ErroreRicerca(`${campo} "${valore}" non esiste. Valori validi: ${validi.join(", ") || "nessuno"}`);
  }
  return trovato;
}

function estratto(testo) {
  if (testo.length <= LUNGHEZZA_ESTRATTO) return testo;
  const taglio = testo.slice(0, LUNGHEZZA_ESTRATTO);
  return `${taglio.slice(0, taglio.lastIndexOf(" ") > 0 ? taglio.lastIndexOf(" ") : LUNGHEZZA_ESTRATTO)}…`;
}

export async function cercaScene(db, embedder, { domanda, regista, film, movimenti, temi, k = 5, soglia = SOGLIA_PERTINENZA }) {
  if (typeof domanda !== "string" || !domanda.trim()) throw new ErroreRicerca("la domanda è vuota");
  if (!Number.isInteger(k) || k < 1 || k > 20) throw new ErroreRicerca("k deve essere un intero tra 1 e 20");
  const filtri = { tipo: "scena" };
  if (regista !== undefined) filtri.regista = await canonico(db, "regista", regista);
  if (film !== undefined) filtri.film = await canonico(db, "film", film);
  for (const [campo, valori] of [["movimenti", movimenti], ["temi", temi]]) {
    if (valori?.length) filtri[campo] = await Promise.all(valori.map((v) => canonico(db, campo, v)));
  }
  const righe = await cercaDocumenti(db, { embedding: await embedder.domanda(domanda.trim()), filtri, k });
  const scene = righe.map((r) => ({
    id: r.documento,
    film: r.metadati.film,
    regista: r.metadati.regista,
    sezione: r.sezione,
    estratto: estratto(r.testo),
    punteggio: Math.round(r.somiglianza * 1000) / 1000,
    pertinente: r.somiglianza >= soglia,
    fonti: r.metadati.fonti,
  }));
  return { filtri, scene };
}

export async function leggiScena(db, id) {
  const doc = await leggiDocumento(db, id);
  if (!doc || doc.tipo !== "scena") {
    const simili = piuSimili(id, await idDove(db, { tipo: "scena" }));
    throw new ErroreRicerca(`scena "${id}" non trovata. Forse: ${simili.join(", ") || "nessuna scena nel database"}`);
  }
  return doc.testo;
}

export async function profiloRegista(db, nome) {
  const validi = await valoriDistinti(db, "regista", "regista");
  const regista = validi.find((v) => normale(v) === normale(nome));
  if (regista === undefined) {
    throw new ErroreRicerca(`regista "${nome}" non trovato. Forse: ${piuSimili(nome, validi).join(", ") || "nessun profilo nel database"}`);
  }
  const [idProfilo] = await idDove(db, { tipo: "regista", regista });
  const profilo = (await leggiDocumento(db, idProfilo)).testo;
  return { regista, profilo, scene: await idDove(db, { tipo: "scena", regista }) };
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test`
Expected: PASS, tutti verdi.

- [ ] **Step 5: Commit**

```bash
git add src/ricerca.js test/ricerca.test.js
git commit -m "Ricerca: filtri riconosciuti, una scena per risultato, errori con suggerimenti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Server MCP (`mcp.js`)

**Files:**
- Create: `src/mcp.js`, `test/mcp.test.js`

**Interfaces:**
- Consumes: `cercaScene`, `leggiScena`, `profiloRegista`, `ErroreRicerca` (Task 7); `apriDb`, `inizializza` (Task 2); `creaEmbedder`, `DIM` (Task 3); `PERCORSO_DB` (Task 3).
- Produces: `creaServer({ db, embedder }) → McpServer`, con gli strumenti `cerca_scene`, `leggi_scena` e `profilo_regista`.

- [ ] **Step 1: Scrivi i test che falliscono (`test/mcp.test.js`)**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { apriDb, inizializza } from "../src/db.js";
import { eseguiIngest } from "../src/ingest.js";
import { creaServer } from "../src/mcp.js";
import { scriviCorpusProva, embedderFinto } from "./helpers.js";

async function client() {
  const e = embedderFinto();
  const dir = await mkdtemp(path.join(tmpdir(), "cineteca-"));
  await scriviCorpusProva(dir);
  const db = await apriDb();
  await inizializza(db, e.dim);
  await eseguiIngest({ dirCorpus: dir, db, embedder: e });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await creaServer({ db, embedder: e }).connect(a);
  const c = new Client({ name: "test", version: "0.0.0" });
  await c.connect(b);
  return c;
}
const testo = (r) => r.content[0].text;

test("espone i 3 strumenti", async () => {
  const c = await client();
  assert.deepEqual((await c.listTools()).tools.map((t) => t.name).sort(), ["cerca_scene", "leggi_scena", "profilo_regista"]);
});

test("cerca_scene restituisce JSON con le scene", async () => {
  const c = await client();
  const r = await c.callTool({ name: "cerca_scene", arguments: { domanda: "corridoio vuoto rifiuto telefono" } });
  assert.equal(r.isError, undefined);
  assert.equal(JSON.parse(testo(r))[0].id, "taxi-driver-telefonata");
});

test("cerca_scene senza risultati lo dice e mostra i filtri", async () => {
  const c = await client();
  const r = await c.callTool({ name: "cerca_scene", arguments: { domanda: "x", film: "Taxi Driver", movimenti: ["steadicam"] } });
  assert.equal(r.isError, undefined);
  assert.match(testo(r), /^Nessuna scena trovata\. Filtri usati: .*"film":"Taxi Driver".*"movimenti":\["steadicam"\]/);
});

test("errore della Cineteca: isError col messaggio", async () => {
  const c = await client();
  const r = await c.callTool({ name: "cerca_scene", arguments: { domanda: "x", regista: "Kubrik" } });
  assert.equal(r.isError, true);
  assert.match(testo(r), /Valori validi: Martin Scorsese/);
});

test("argomenti non validi: rifiutati dallo schema", async () => {
  const c = await client();
  const r = await c.callTool({ name: "cerca_scene", arguments: { domanda: "x", k: 99 } });
  assert.equal(r.isError, true);
  const vuota = await c.callTool({ name: "cerca_scene", arguments: { domanda: "" } });
  assert.equal(vuota.isError, true);
});

test("leggi_scena e profilo_regista", async () => {
  const c = await client();
  assert.match(testo(await c.callTool({ name: "leggi_scena", arguments: { id: "taxi-driver-telefonata" } })), /## Come è girata/);
  const p = JSON.parse(testo(await c.callTool({ name: "profilo_regista", arguments: { nome: "Martin Scorsese" } })));
  assert.equal(p.regista, "Martin Scorsese");
  assert.equal(p.scene.length, 2);
  const errore = await c.callTool({ name: "leggi_scena", arguments: { id: "nessuna" } });
  assert.equal(errore.isError, true);
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test`
Expected: FAIL con `Cannot find module '.../src/mcp.js'`.

- [ ] **Step 3: Scrivi `src/mcp.js`**

```js
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { cercaScene, leggiScena, profiloRegista, ErroreRicerca } from "./ricerca.js";

const testo = (t) => ({ content: [{ type: "text", text: t }] });
const json = (v) => testo(JSON.stringify(v, null, 2));

// Gli errori della Cineteca tornano al chiamante come messaggio; gli altri sono bug e salgono.
const gestisci = (fn) => async (input) => {
  try {
    return await fn(input);
  } catch (e) {
    if (e instanceof ErroreRicerca) return { ...testo(e.message), isError: true };
    throw e;
  }
};

export function creaServer({ db, embedder }) {
  const server = new McpServer({ name: "cineteca", version: "0.1.0" });

  server.registerTool(
    "cerca_scene",
    {
      description:
        "Cerca scene di capolavori del cinema per significato (come sono girate, cosa fa la sceneggiatura, perché funzionano), con filtri facoltativi. Ogni scena compare una volta, con le fonti. pertinente=false vuol dire risultato debole: usalo con cautela.",
      inputSchema: {
        domanda: z.string().trim().min(1).describe("Cosa cerchi, in italiano. Es.: come mostrare l'isolamento di un personaggio in città"),
        regista: z.string().optional().describe("Nome del regista, es. Martin Scorsese"),
        film: z.string().optional().describe("Titolo italiano del film, es. Taxi Driver"),
        movimenti: z.array(z.string()).optional().describe("Movimenti di macchina richiesti tutti insieme, es. [\"steadicam\"]"),
        temi: z.array(z.string()).optional().describe("Temi richiesti tutti insieme, es. [\"solitudine\"]"),
        k: z.number().int().min(1).max(20).optional().describe("Quante scene al massimo (predefinito 5)"),
      },
    },
    gestisci(async (input) => {
      const { filtri, scene } = await cercaScene(db, embedder, input);
      return scene.length ? json(scene) : testo(`Nessuna scena trovata. Filtri usati: ${JSON.stringify(filtri)}`);
    }),
  );

  server.registerTool(
    "leggi_scena",
    { description: "Restituisce la scheda completa di una scena, dato il suo id.", inputSchema: { id: z.string().min(1) } },
    gestisci(async ({ id }) => testo(await leggiScena(db, id))),
  );

  server.registerTool(
    "profilo_regista",
    {
      description: "Profilo di stile di un regista più l'elenco degli id delle sue scene nella Cineteca.",
      inputSchema: { nome: z.string().min(1).describe("Nome del regista, es. Martin Scorsese") },
    },
    gestisci(async ({ nome }) => json(await profiloRegista(db, nome))),
  );

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { apriDb, inizializza } = await import("./db.js");
  const { creaEmbedder, DIM } = await import("./embed.js");
  const { PERCORSO_DB } = await import("./ingest.js");
  const db = await apriDb(PERCORSO_DB);
  await inizializza(db, DIM);
  await creaServer({ db, embedder: await creaEmbedder() }).connect(new StdioServerTransport());
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test`
Expected: PASS, tutti verdi.

- [ ] **Step 5: Prova a mano via stdio, sul database vero di Taxi Driver**

Run:
```bash
(printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"prova","version":"0"}}}' '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"cerca_scene","arguments":{"domanda":"un uomo solo in città di notte"}}}'; sleep 120) | node src/mcp.js 2>/dev/null | head -2 | tail -1
```
Expected: una riga JSON-RPC con `"id":2` che contiene almeno una scena di Taxi Driver; la prima riga (`head -1`) deve essere la risposta JSON-RPC a `initialize`, niente log. (Su macOS non c'è `timeout`: il `sleep` tiene aperto stdin finché `head` ha le sue 2 righe.)

- [ ] **Step 6: Commit**

```bash
git add src/mcp.js test/mcp.test.js
git commit -m "Server MCP con cerca_scene, leggi_scena, profilo_regista

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Collegamento a Claude Code, prova col Regista, artefatto 2

**Files:**
- Create: `README.md`, `docs/spiegazioni/02-ricerca-ibrida-e-mcp.html`

- [ ] **Step 1: Mostrare a Vincent il comando esatto e aspettare il suo ok**

```bash
claude mcp add --scope user cineteca -- node /Users/rbl.vincent/my-agent/cineteca/src/mcp.js
```
Solo dopo il sì: eseguirlo e verificare con `claude mcp list`, dove `cineteca` deve risultare connesso.

- [ ] **Step 2: Prova vera.** In una sessione nuova (gli strumenti MCP si caricano all'avvio), chiamare `cerca_scene` con una domanda presa da uno SHOT_BRIEF di *Ricominciare* (`~/Desktop/ultrarantino/projects/ricominciare/shots/`). Annotare cosa restituisce e se è utile. È solo un assaggio: la prova alla cieca vera è nella fase 6.
- [ ] **Step 3: `README.md`.** Cosa fa la Cineteca, come si installa (`npm install`), come si carica (`npm run ingest`), come si collega (il comando del passo 1), la nota su Transformers 3.8.1 per i Mac Intel e lo stato attuale (le fasi 4-7 non sono ancora fatte).
- [ ] **Step 4: Artefatto 2 (ricerca ibrida e MCP).** Stesso metodo del Task 4. Da spiegare, con le righe vere:
  - `@>` più `<=>` in una sola query;
  - `distinct on` per avere una scena per risultato;
  - perché non c'è un indice HNSW;
  - la normalizzazione dei filtri;
  - errori che suggeriscono i valori invece di allargare la ricerca;
  - `isError` contro eccezione nel protocollo MCP;
  - perché stdout è sacro;
  - la soglia provvisoria e come si tarerà.

  Chiude con 6 domande da colloquio.
- [ ] **Step 5: Commit, vault, push.** Commit di README e spiegazione. Aggiornare nel vault la nota Ultrarantino (sezione Cineteca), il daily note e [[Active Priorities]]. Push della fase 2-3 solo dopo l'ok di Vincent.

```bash
git add README.md docs/spiegazioni/
git commit -m "README e spiegazione della ricerca e del server MCP

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Dopo questo piano

Le fasi 4-7 della spec (resto del corpus, valutazione, prova alla cieca, demo web) avranno un piano loro. Quel piano si scrive quando la fase 3 è chiusa, usando quello che Taxi Driver avrà insegnato sul formato delle schede.
