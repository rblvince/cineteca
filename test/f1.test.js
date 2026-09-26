import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ErroreCorpus, parseScheda, validaScheda, ricavaCampiScena, leggiCorpus, leggiVocabolario, testoPezzo } from "../src/corpus.js";
import { apriDb, inizializza, applicaModifiche, leggiDocumento } from "../src/db.js";
import { scriviCorpusProva, SCENA_TAXI, embedderFinto } from "./helpers.js";

const VOC = {
  inquadrature: ["campo medio", "primo piano", "campo lungo", "dall'alto", "singola"],
  movimenti: ["carrello laterale", "carrello indietro", "camera fissa"],
  temi: ["solitudine", "rifiuto"],
  scala: ["campo medio", "primo piano", "campo lungo"],
  angolo: ["dall'alto"],
  relazione: ["singola"],
  obiettivo: ["normale"],
  fuoco: ["ridotto"],
  luce_chiave: ["bassa"],
  luce_qualita: ["dura"],
};
const F = "scene/taxi-driver-telefonata.md";
const shot = (extra = {}) => ({ n: 1, descrizione: "Travis di spalle al telefono", scala: "campo medio", movimenti: ["carrello indietro"], provenienza: { tipo: "fonte", riferimento: "Script Magazine" }, ...extra });
const metaConShot = (shots = [shot()]) => {
  const m = parseScheda(SCENA_TAXI, F).meta;
  delete m.inquadrature;
  delete m.movimenti;
  m.shot = shots;
  return m;
};
const rifiuta = (m, atteso) => assert.throws(() => validaScheda(m, VOC, F), (e) => e instanceof ErroreCorpus && atteso.test(e.message) && e.message.startsWith(F));

test("scena con shot: valida, e inquadrature e movimenti si ricavano dagli shot", () => {
  const m = metaConShot([
    shot(),
    shot({ n: 2, scala: "campo lungo", angolo: "dall'alto", relazione: "singola", movimenti: ["carrello laterale", "carrello indietro"], obiettivo: "normale", fuoco: "ridotto", luce_chiave: "bassa", luce_qualita: "dura", luce_direzione: "da sinistra", colore: "verde spento", suono: "voce di Travis", composizione: "short-sided", provenienza: { tipo: "modello", riferimento: "ShotVL-7B", confidenza: 0.71 } }),
  ]);
  validaScheda(m, VOC, F);
  ricavaCampiScena(m);
  assert.deepEqual(m.inquadrature, ["campo medio", "campo lungo", "dall'alto", "singola"]);
  assert.deepEqual(m.movimenti, ["carrello indietro", "carrello laterale"]);
});

test("scena con shot senza campi documentati: liste della scena vuote, non inventate", () => {
  const m = metaConShot([{ n: 1, descrizione: "Travis allo specchio", provenienza: { tipo: "fonte", riferimento: "Wikipedia" } }]);
  validaScheda(m, VOC, F);
  ricavaCampiScena(m);
  assert.deepEqual(m.inquadrature, []);
  assert.deepEqual(m.movimenti, []);
});

test("scena senza shot: resta tutto come prima", () => {
  const m = parseScheda(SCENA_TAXI, F).meta;
  validaScheda(m, VOC, F);
  ricavaCampiScena(m);
  assert.deepEqual(m.inquadrature, ["campo medio"]);
});

for (const [descrizione, modifica, atteso] of [
  ["shot e inquadrature scritte a mano insieme", (m) => (m.inquadrature = ["primo piano"]), /inquadrature si ricava dagli shot/],
  ["shot come lista vuota", (m) => (m.shot = []), /shot deve essere una lista non vuota/],
  ["shot senza provenienza", (m) => delete m.shot[0].provenienza, /shot 1: manca la provenienza/],
  ["provenienza di tipo sconosciuto", (m) => (m.shot[0].provenienza.tipo = "intuito"), /shot 1: provenienza\.tipo deve essere/],
  ["provenienza senza riferimento", (m) => (m.shot[0].provenienza.riferimento = ""), /shot 1: provenienza senza riferimento/],
  ["modello senza confidenza", (m) => (m.shot[0].provenienza = { tipo: "modello", riferimento: "ShotVL" }), /shot 1: provenienza da modello vuole una confidenza tra 0 e 1/],
  ["shot senza descrizione", (m) => delete m.shot[0].descrizione, /shot 1: manca la descrizione/],
  ["valore fuori vocabolario", (m) => (m.shot[0].scala = "mezzo busto"), /shot 1: scala "mezzo busto" non è nel vocabolario/],
  ["movimento fuori vocabolario", (m) => (m.shot[0].movimenti = ["carrellata"]), /shot 1: movimenti "carrellata" non è nel vocabolario/],
  ["campo sconosciuto (refuso)", (m) => (m.shot[0].angle = "dall'alto"), /shot 1: campo sconosciuto "angle"/],
  ["numeri ripetuti", (m) => m.shot.push(shot()), /shot 1: numero ripetuto/],
]) {
  test(`shot rifiutato: ${descrizione}`, () => {
    const m = metaConShot();
    modifica(m);
    rifiuta(m, atteso);
  });
}

test("regola: valida con elemento e fonti", () => {
  const m = { id: "scala-dell-inquadratura", tipo: "regola", elemento: "camera", fonti: [{ titolo: "t", url: "https://e.com" }] };
  assert.doesNotThrow(() => validaScheda(m, VOC, "regole/scala-dell-inquadratura.md"));
  delete m.elemento;
  assert.throws(() => validaScheda(m, VOC, "regole/scala-dell-inquadratura.md"), /manca il campo "elemento"/);
});

test("testoPezzo per una regola", () => {
  assert.equal(testoPezzo({ tipo: "regola", elemento: "luce" }, { sezione: "Cos'è", testo: "Chiave bassa." }), "Grammatica del cinema, luce — Cos'è\nChiave bassa.");
});

test("leggiCorpus legge le regole e ricava i campi delle scene con shot", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cineteca-"));
  await scriviCorpusProva(dir);
  await mkdir(path.join(dir, "regole"));
  await writeFile(path.join(dir, "regole", "luce-dura.md"), `---\nid: luce-dura\ntipo: regola\nelemento: luce\nfonti:\n  - titolo: t\n    url: https://e.com\n---\n## Cos'è\nOmbre nette.\n`);
  await writeFile(path.join(dir, "vocabolario.yaml"), "inquadrature: [campo medio, primo piano, campo lungo]\nmovimenti: [carrello laterale, steadicam, camera fissa]\ntemi: [solitudine, rifiuto, potere, famiglia]\nscala: [primo piano]\n");
  const conShot = SCENA_TAXI.replace("inquadrature: [campo medio]\nmovimenti: [carrello laterale]\n", "shot:\n  - n: 1\n    descrizione: Travis al telefono\n    scala: primo piano\n    movimenti: [carrello laterale]\n    provenienza: {tipo: vincent, riferimento: visto il 26/09}\n");
  await writeFile(path.join(dir, "scene", "taxi-driver-telefonata.md"), conShot);
  const { documenti } = await leggiCorpus(dir);
  assert.equal(documenti.find((d) => d.id === "luce-dura").tipo, "regola");
  const taxi = documenti.find((d) => d.id === "taxi-driver-telefonata");
  assert.deepEqual(taxi.metadati.inquadrature, ["primo piano"]);
  assert.deepEqual(taxi.metadati.movimenti, ["carrello laterale"]);
});

test("vocabolario: un valore di scala che non è anche tra le inquadrature è un errore", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cineteca-"));
  const p = path.join(dir, "vocabolario.yaml");
  await writeFile(p, "inquadrature: [campo medio]\nmovimenti: [camera fissa]\ntemi: [solitudine]\nscala: [mezzo busto]\n");
  await assert.rejects(leggiVocabolario(p), /vocabolario\.yaml: scala "mezzo busto" deve comparire anche in inquadrature/);
});

test("db: accetta documenti di tipo regola", async () => {
  const e = embedderFinto();
  const db = await apriDb();
  await inizializza(db, e.dim);
  const doc = { id: "luce-dura", tipo: "regola", testo: "t", metadati: { id: "luce-dura", tipo: "regola", elemento: "luce" }, pezzi: [{ sezione: "Cos'è", testo: "ombre" }] };
  await applicaModifiche(db, { daScrivere: [{ doc, impronta: "h", embeddings: await e.passaggi(["ombre"]) }], daRimuovere: [] });
  assert.equal((await leggiDocumento(db, "luce-dura")).tipo, "regola");
});
