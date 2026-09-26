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
