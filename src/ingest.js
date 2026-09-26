import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leggiCorpus, testoPezzo, hashTesto, ErroreCorpus } from "./corpus.js";
import { apriDb, inizializza, impronteEsistenti, applicaModifiche } from "./db.js";

const RADICE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const PERCORSO_DB = process.env.CINETECA_DB ?? path.join(RADICE, "data", "cineteca");
export const PERCORSO_CORPUS = path.join(RADICE, "corpus");

export async function eseguiIngest({ dirCorpus, db, embedder, lotto = 16 }) {
  // Si legge e si valida tutto prima di toccare il database: un errore non lascia niente a metà.
  const { documenti } = await leggiCorpus(dirCorpus);
  const esistenti = await impronteEsistenti(db);
  const daScrivere = [];
  let aggiunti = 0, aggiornati = 0, invariati = 0;
  for (const doc of documenti) {
    // Il modello entra nell'impronta: cambiarlo ricalcola tutto invece di mescolare vettori.
    const impronta = hashTesto(`${embedder.modello}\n${doc.testo}`);
    const vecchia = esistenti.get(doc.id);
    if (vecchia === impronta) {
      invariati++;
      continue;
    }
    vecchia === undefined ? aggiunti++ : aggiornati++;
    const testi = doc.pezzi.map((p) => testoPezzo(doc.metadati, p));
    const embeddings = [];
    for (let i = 0; i < testi.length; i += lotto) embeddings.push(...(await embedder.passaggi(testi.slice(i, i + lotto))));
    daScrivere.push({ doc, impronta, embeddings });
  }
  const presenti = new Set(documenti.map((d) => d.id));
  const daRimuovere = [...esistenti.keys()].filter((id) => !presenti.has(id));
  await applicaModifiche(db, { daScrivere, daRimuovere });
  return { aggiunti, aggiornati, rimossi: daRimuovere.length, invariati };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { creaEmbedder, DIM } = await import("./embed.js");
  try {
    const db = await apriDb(PERCORSO_DB);
    await inizializza(db, DIM);
    const esito = await eseguiIngest({ dirCorpus: PERCORSO_CORPUS, db, embedder: await creaEmbedder() });
    console.log(`Aggiunte ${esito.aggiunti}, aggiornate ${esito.aggiornati}, rimosse ${esito.rimossi}, invariate ${esito.invariati}.`);
    await db.close();
  } catch (e) {
    if (!(e instanceof ErroreCorpus)) throw e;
    console.error(`Corpus non valido, database non toccato.\n${e.message}`);
    process.exitCode = 1;
  }
}
