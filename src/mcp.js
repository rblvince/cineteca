import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { cercaScene, leggiScena, profiloRegista, ErroreRicerca } from "./ricerca.js";

const testo = (t) => ({ content: [{ type: "text", text: t }] });
const json = (v) => testo(JSON.stringify(v, null, 2));

// Gli errori della Cineteca tornano al chiamante come messaggio; gli altri sono bug e salgono.
const gestisci = (fn) => async (input) => {
  try {
    return await fn(input);
  } catch (e) {
    if (e instanceof ErroreRicerca) return { ...testo(e.message), isError: true };
    throw e;
  }
};

export function creaServer({ db, embedder }) {
  const server = new McpServer({ name: "cineteca", version: "0.1.0" });

  server.registerTool(
    "cerca_scene",
    {
      description:
        "Cerca scene di capolavori del cinema per significato (come sono girate, cosa fa la sceneggiatura, perché funzionano), con filtri facoltativi. Ogni scena compare una volta, con le fonti. pertinente=false vuol dire risultato debole: usalo con cautela.",
      inputSchema: {
        domanda: z.string().trim().min(1).describe("Cosa cerchi, in italiano. Es.: come mostrare l'isolamento di un personaggio in città"),
        regista: z.string().optional().describe("Nome del regista, es. Martin Scorsese"),
        film: z.string().optional().describe("Titolo italiano del film, es. Taxi Driver"),
        movimenti: z.array(z.string()).optional().describe("Movimenti di macchina richiesti tutti insieme, es. [\"steadicam\"]"),
        temi: z.array(z.string()).optional().describe("Temi richiesti tutti insieme, es. [\"solitudine\"]"),
        k: z.number().int().min(1).max(20).optional().describe("Quante scene al massimo (predefinito 5)"),
      },
    },
    gestisci(async (input) => {
      const { filtri, scene } = await cercaScene(db, embedder, input);
      return scene.length ? json(scene) : testo(`Nessuna scena trovata. Filtri usati: ${JSON.stringify(filtri)}`);
    }),
  );

  server.registerTool(
    "leggi_scena",
    { description: "Restituisce la scheda completa di una scena, dato il suo id.", inputSchema: { id: z.string().min(1) } },
    gestisci(async ({ id }) => testo(await leggiScena(db, id))),
  );

  server.registerTool(
    "profilo_regista",
    {
      description: "Profilo di stile di un regista più l'elenco degli id delle sue scene nella Cineteca.",
      inputSchema: { nome: z.string().min(1).describe("Nome del regista, es. Martin Scorsese") },
    },
    gestisci(async ({ nome }) => json(await profiloRegista(db, nome))),
  );

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { apriDb, inizializza } = await import("./db.js");
  const { creaEmbedder, DIM } = await import("./embed.js");
  const { PERCORSO_DB } = await import("./ingest.js");
  const db = await apriDb(PERCORSO_DB);
  await inizializza(db, DIM);
  await creaServer({ db, embedder: await creaEmbedder() }).connect(new StdioServerTransport());
}
