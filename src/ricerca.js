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
