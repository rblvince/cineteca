import { mkdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const CAMPI_SCALARI = ["regista", "film"];
const CAMPI_LISTA = ["movimenti", "temi", "inquadrature"];

export async function apriDb(cartella) {
  const opzioni = { extensions: { vector } };
  if (cartella) await mkdir(cartella, { recursive: true });
  const db = cartella ? new PGlite(cartella, opzioni) : new PGlite(opzioni);
  await db.waitReady;
  return db;
}

export async function inizializza(db, dim) {
  if (!Number.isInteger(dim) || dim <= 0) throw new Error(`dimensione non valida: ${dim}`);
  await db.exec(`
    create extension if not exists vector;
    create table if not exists documenti (
      id        text primary key,
      tipo      text not null check (tipo in ('scena','regista','regola')),
      metadati  jsonb not null,
      testo     text not null,
      impronta  text not null
    );
    create table if not exists pezzi (
      id         bigserial primary key,
      documento  text not null references documenti(id) on delete cascade,
      sezione    text not null,
      testo      text not null,
      embedding  vector(${dim}) not null
    );`);
}

export async function impronteEsistenti(db) {
  const { rows } = await db.query("select id, impronta from documenti");
  return new Map(rows.map((r) => [r.id, r.impronta]));
}

export async function applicaModifiche(db, { daScrivere, daRimuovere }) {
  await db.transaction(async (tx) => {
    if (daRimuovere.length) await tx.query("delete from documenti where id = any($1)", [daRimuovere]);
    for (const { doc, impronta, embeddings } of daScrivere) {
      if (embeddings.length !== doc.pezzi.length) throw new Error(`${doc.id}: ${doc.pezzi.length} pezzi ma ${embeddings.length} embedding`);
      await tx.query("delete from documenti where id = $1", [doc.id]);
      await tx.query(
        "insert into documenti (id, tipo, metadati, testo, impronta) values ($1, $2, $3::jsonb, $4, $5)",
        [doc.id, doc.tipo, JSON.stringify(doc.metadati), doc.testo, impronta],
      );
      for (const [i, p] of doc.pezzi.entries()) {
        await tx.query(
          "insert into pezzi (documento, sezione, testo, embedding) values ($1, $2, $3, $4::vector)",
          [doc.id, p.sezione, p.testo, JSON.stringify(embeddings[i])],
        );
      }
    }
  });
}

// Per ogni documento che passa i filtri tiene il pezzo più vicino alla domanda,
// poi restituisce i k documenti migliori. Nessun indice: con poche centinaia di
// pezzi la scansione completa è istantanea.
export async function cercaDocumenti(db, { embedding, filtri, k }) {
  const { rows } = await db.query(
    `select * from (
       select distinct on (p.documento)
              p.documento, p.sezione, p.testo, d.metadati,
              1 - (p.embedding <=> $1::vector) as somiglianza
         from pezzi p join documenti d on d.id = p.documento
        where d.metadati @> $2::jsonb
        order by p.documento, p.embedding <=> $1::vector
     ) migliori
     order by somiglianza desc
     limit $3`,
    [JSON.stringify(embedding), JSON.stringify(filtri), k],
  );
  return rows;
}

export async function valoriDistinti(db, campo, tipo = "scena") {
  let sql;
  if (CAMPI_SCALARI.includes(campo)) {
    sql = "select distinct metadati->>$1 as v from documenti where tipo = $2 and metadati ? $1 order by v";
  } else if (CAMPI_LISTA.includes(campo)) {
    sql = "select distinct v from documenti, jsonb_array_elements_text(metadati->$1) as v where tipo = $2 order by v";
  } else {
    throw new Error(`campo non ammesso: ${campo}`);
  }
  const { rows } = await db.query(sql, [campo, tipo]);
  return rows.map((r) => r.v);
}

export async function leggiDocumento(db, id) {
  const { rows } = await db.query("select id, tipo, metadati, testo from documenti where id = $1", [id]);
  return rows[0] ?? null;
}

export async function idDove(db, filtri) {
  const { rows } = await db.query("select id from documenti where metadati @> $1::jsonb order by id", [JSON.stringify(filtri)]);
  return rows.map((r) => r.id);
}
