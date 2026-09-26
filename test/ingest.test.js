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
