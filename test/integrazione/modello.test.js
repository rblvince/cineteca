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
