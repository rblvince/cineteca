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
