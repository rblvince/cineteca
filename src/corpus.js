import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import YAML from "yaml";

export class ErroreCorpus extends Error {}

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CAMPI = {
  scena: ["id", "tipo", "film", "regista", "anno", "dop", "temi", "fonti"],
  regista: ["id", "tipo", "regista", "fonti"],
  regola: ["id", "tipo", "elemento", "fonti"],
};
const LISTE = ["inquadrature", "movimenti", "temi"];
const CARTELLE = { scene: "scena", registi: "regista", regole: "regola" };

// Campi di un'inquadratura (shot). I valori chiusi si controllano sul vocabolario
// con lo stesso nome; quelli liberi sono testo. scala, angolo e relazione finiscono
// nelle inquadrature della scena, movimenti nei suoi movimenti.
const SHOT_CHIUSI = ["scala", "angolo", "relazione", "obiettivo", "fuoco", "luce_chiave", "luce_qualita"];
const SHOT_LIBERI = ["descrizione", "composizione", "luce_direzione", "colore", "suono"];
const SHOT_CAMPI = new Set(["n", "movimenti", "provenienza", ...SHOT_CHIUSI, ...SHOT_LIBERI]);
const VERSO_INQUADRATURE = ["scala", "angolo", "relazione"];
const PROVENIENZE = ["fonte", "dataset", "modello", "vincent"];

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
    if (meta.shot !== undefined) validaShot(meta, vocabolario, errore);
    for (const campo of LISTE) {
      if (meta.shot !== undefined && campo !== "temi") continue;
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

function validaShot(meta, vocabolario, errore) {
  for (const campo of ["inquadrature", "movimenti"]) {
    if (meta[campo] !== undefined) errore(`${campo} si ricava dagli shot: non scriverla a mano`);
  }
  if (!Array.isArray(meta.shot) || meta.shot.length === 0) errore("shot deve essere una lista non vuota");
  const numeri = new Set();
  meta.shot.forEach((s, i) => {
    const n = s?.n ?? i + 1;
    const err = (msg) => errore(`shot ${n}: ${msg}`);
    if (!s || typeof s !== "object" || Array.isArray(s)) err("deve essere un elenco di campi");
    for (const chiave of Object.keys(s)) if (!SHOT_CAMPI.has(chiave)) err(`campo sconosciuto "${chiave}"`);
    if (!Number.isInteger(s.n) || s.n < 1) err("n deve essere un intero da 1 in su");
    if (numeri.has(s.n)) err("numero ripetuto");
    numeri.add(s.n);
    if (typeof s.descrizione !== "string" || !s.descrizione.trim()) err("manca la descrizione");
    const p = s.provenienza;
    if (!p || typeof p !== "object") err("manca la provenienza");
    if (!PROVENIENZE.includes(p.tipo)) err(`provenienza.tipo deve essere ${PROVENIENZE.join(", ")}`);
    if (typeof p.riferimento !== "string" || !p.riferimento.trim()) err("provenienza senza riferimento");
    if (p.tipo === "modello" && !(typeof p.confidenza === "number" && p.confidenza >= 0 && p.confidenza <= 1)) {
      err("provenienza da modello vuole una confidenza tra 0 e 1");
    }
    const controlla = (campo, v) => {
      if (!vocabolario[campo]?.includes(v)) err(`${campo} "${v}" non è nel vocabolario`);
    };
    for (const campo of SHOT_CHIUSI) if (s[campo] !== undefined) controlla(campo, s[campo]);
    if (s.movimenti !== undefined) {
      if (!Array.isArray(s.movimenti)) err("movimenti deve essere una lista");
      for (const v of s.movimenti) controlla("movimenti", v);
    }
    for (const campo of SHOT_LIBERI) if (s[campo] !== undefined && typeof s[campo] !== "string") err(`${campo} deve essere testo`);
  });
}

// Con gli shot, inquadrature e movimenti della scena sono l'unione dei valori degli shot:
// quello che nessuno ha documentato resta fuori invece di essere inventato.
export function ricavaCampiScena(meta) {
  if (meta.tipo !== "scena" || meta.shot === undefined) return meta;
  const unici = (valori) => [...new Set(valori)];
  meta.inquadrature = unici(meta.shot.flatMap((s) => VERSO_INQUADRATURE.map((c) => s[c]).filter((v) => v !== undefined)));
  meta.movimenti = unici(meta.shot.flatMap((s) => s.movimenti ?? []));
  return meta;
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
  const chi = { scena: `${meta.film} (${meta.regista}, ${meta.anno})`, regola: `Grammatica del cinema, ${meta.elemento}` }[meta.tipo] ?? meta.regista;
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
  for (const campo of VERSO_INQUADRATURE) {
    for (const v of voc[campo] ?? []) {
      if (!voc.inquadrature.includes(v)) throw new ErroreCorpus(`${nome}: ${campo} "${v}" deve comparire anche in inquadrature`);
    }
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
      ricavaCampiScena(meta);
      if (meta.tipo !== tipoAtteso) throw new ErroreCorpus(`${file}: tipo "${meta.tipo}" non va in ${sotto}/`);
      if (visti.has(meta.id)) throw new ErroreCorpus(`${file}: id "${meta.id}" già usato in ${visti.get(meta.id)}`);
      visti.set(meta.id, file);
      documenti.push({ id: meta.id, tipo: meta.tipo, metadati: meta, testo, pezzi: dividiInPezzi(corpo, file) });
    }
  }
  return { documenti, vocabolario };
}
