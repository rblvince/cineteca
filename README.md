<p align="center">
  <img src="docs/brand/banner.png" alt="Cineteca: film scenes an AI director can search." width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/MCP-server-3446c4" alt="MCP server">
  <img src="https://img.shields.io/badge/PGlite-pgvector-3446c4" alt="PGlite with pgvector">
  <img src="https://img.shields.io/badge/embeddings-local-3446c4" alt="Local embeddings">
  <img src="https://img.shields.io/badge/tests-160%20passing-1e7a4f" alt="160 tests passing">
</p>

> **Logline.** An AI agent that plans a short film should learn from the masters, not invent
> them. Cineteca is a searchable archive of 50 scenes from 11 landmark films, each broken down
> shot by shot (scale, angle, movement, light, what the script is doing), with every claim tied
> to its source. Agents query it through an MCP server. The corpus is in Italian.

## On screen

A real scene card from the archive (`corpus/scene/apocalypse-elicotteri.md`, abridged):

```yaml
id: apocalypse-elicotteri
film: "Apocalypse Now"
regista: Francis Ford Coppola
anno: 1979
dop: Vittorio Storaro
shot:
  - n: 1
    descrizione: "L'attacco degli elicotteri al villaggio sulla musica di Wagner"
    provenienza: {tipo: fonte, riferimento: "Scraps from the Loft (Coppola a Storaro: ...)"}
  - n: 2
    descrizione: "La formazione di elicotteri sul mare e sulle nuvole, vista da un altro elicottero"
    scala: campo lunghissimo
    angolo: aerea
    provenienza: {tipo: modello, riferimento: "Ultron (Claude) sui fotogrammi della clip ...", confidenza: 0.85}
```

Every shot says where it comes from: a cited source (`fonte`) or a model's reading of the frames
(`modello`) with its confidence. An agent asking "how was this shot" gets the answer and how much
to trust it.

The archive covers *2001: A Space Odyssey*, *Apocalypse Now*, *Citizen Kane*, *The Godfather*,
*Goodfellas*, *Manchester by the Sea*, *Parasite*, *Persona*, *The Shining*, *Taxi Driver* and
*There Will Be Blood*, plus style profiles of six directors and 20 cinematography rules.

## Cast

| Role | Technology |
|---|---|
| Interface | MCP server (`@modelcontextprotocol/sdk`), tool inputs validated with Zod |
| Search | PGlite + pgvector, embeddings computed locally with Transformers.js (`multilingual-e5-small`) |
| Corpus | Markdown + YAML scene cards, director profiles, cinematography rules, a shared vocabulary |
| Enrichment | Anthropic SDK for drafting cards from frames and screenplays, always marked as model output |
| Tests | Node's built-in test runner |

### The MCP tools

| Tool | What it gives the agent |
|---|---|
| `cerca_scene` | scenes by meaning (how they are shot, what the script does, why they work), with optional filters by director, film, camera movement and theme; each scene once, with its sources |
| `leggi_scena` | the full card of one scene |
| `profilo_regista` | a director's style profile and the ids of their scenes in the archive |

## Behind the scenes

- **Provenance is part of the data.** Each shot carries `provenienza`: a source, or a model with a
  confidence score. Nothing an AI drafted can pass as a fact.
- **The search admits when it is unsure.** Results below a similarity threshold come back with
  `pertinente: false`, so the agent knows a match is weak instead of trusting it.
- **Postgres without a server.** PGlite runs Postgres with pgvector inside the Node process: the
  whole archive is a folder, no database to install.
- **Embeddings on the laptop.** Transformers.js computes vectors locally, with no API key and no
  per-query cost.
- **A quality gate, not a feeling.** `npm run cancello` scores retrieval against a set of known
  question-to-scene pairs and fails under a fixed threshold.
- **Helpful errors.** A wrong scene id or director name comes back with "did you mean" suggestions,
  so an agent can correct itself.

## Shoot it yourself

Requirements: Node.js ≥ 20.

```sh
npm install
npm run ingest   # reads corpus/, embeds it and fills the local database
npm run mcp      # starts the MCP server on stdio
```

To use it from Claude Code or another MCP client, register `node src/mcp.js` (from this folder)
as a stdio server. The scripts that draft new cards (`npm run schede`) need an Anthropic API key
in `.env`; searching the archive needs none.

## Dailies

```sh
npm test                     # 160 unit tests (node --test)
npm run test:integrazione    # integration tests on the real database
npm run cancello             # retrieval quality gate
```

## Credits

Written and directed by **Vincent** ([@rblvince](https://github.com/rblvince)), built with
Claude Code as an AI pair programmer. Scene analyses are original writing that cite their
sources; film titles and stills belong to their respective owners.

<p align="center"><img src="docs/brand/logo.png" alt="rblvince clapperboard mark" width="32"></p>
