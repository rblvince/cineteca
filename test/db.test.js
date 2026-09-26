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
