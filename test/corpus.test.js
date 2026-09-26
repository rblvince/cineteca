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
