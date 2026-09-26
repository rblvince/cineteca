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
