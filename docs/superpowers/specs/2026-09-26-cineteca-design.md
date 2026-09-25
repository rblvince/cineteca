# Cineteca — design

Data: 2026-09-26. Stato: approvata da Vincent. Repo: https://github.com/rblvince/cineteca (privato).

## Scopo

Un archivio interrogabile di scene tratte da capolavori del cinema: come sono girate (inquadrature, movimenti, obiettivi, luce, montaggio), cosa fa la sceneggiatura in quel punto e perché funzionano. Serve al Regista di Ultrarantino (Ultron) per scrivere SHOT_BRIEF migliori. È anche un pezzo del portfolio di Vincent.

**Criterio di successo:** gli 8 SHOT_BRIEF di *Ricominciare* riscritti con la Cineteca battono i vecchi in un confronto alla cieca giudicato da Vincent. Se non li battono, la Cineteca non serve e lo si dice.

## Decisioni già prese (con Vincent, 26/09)

| Tema | Decisione |
|---|---|
| Rapporto con Bandi Cinema AI | Progetti separati, nessun codice in comune. |
| Chi scrive il codice | Ultron. Per ogni parte da colloquio, Ultron prepara un artefatto che spiega passo passo cosa ha fatto, con domande da colloquio in fondo. |
| Chi scrive le analisi | Ultron, solo da fonti vere con link. Mai analisi a memoria. |
| Chi sceglie i film | Vincent. |
| Linguaggio | JavaScript (Node). |
| Database | PGlite (Postgres in Node) con pgvector. Non Supabase: i 2 progetti gratuiti sono già presi e il piano gratuito va in pausa dopo 7 giorni. |
| Embedding | Modello locale multilingue con Transformers.js. Candidato: `multilingual-e5-small` (384 dimensioni). |
| LLM dentro la Cineteca | Nessuno. Il Regista che la interroga via MCP è già un LLM. Un LLM servirà solo per la demo web, da decidere più avanti. |
| OpenRouter | Non si usa: è riservato a Jev. |
| Lingua delle analisi | Italiano. |

## Corpus

**Film (11, scelti da Vincent):** Persona, Taxi Driver, Manchester by the Sea, Quei bravi ragazzi, Shining, Il padrino, 2001: Odissea nello spazio, Quarto potere, Apocalypse Now, Il petroliere, Parasite. Vincent ha lasciato una nota su tre di questi:
- Persona: "Introspezione del personaggio"
- Taxi Driver: "Come la solitudine cambia una persona"
- Manchester by the Sea: "La rovina di una persona in medias res"

**Registi (12, scelti da Vincent):** Bergman, Hitchcock, Welles, Leone, Kubrick, Scorsese, Coppola, Tarantino, Villeneuve, Nolan, Bong Joon-ho, Park Chan-wook.

**Unità di base: la scena.** Da 3 a 5 scene per film. Ogni regista ha un profilo di stile. I 6 registi senza un film nella lista (Hitchcock, Leone, Tarantino, Villeneuve, Nolan, Park) ricevono in più 2-3 scene prese dai loro film più noti. In totale sono circa 50-70 schede di scena più 12 profili.

**Scelta delle scene.** Per ogni film Ultron propone le scene in una pagina interattiva, come quella usata per scegliere film e registi. Vincent le tiene o le scarta, e solo dopo Ultron scrive le analisi.

### Formato di una scheda scena

File `corpus/scene/<id>.md`, con i campi in testa (YAML) e le sezioni sotto:

```yaml
---
id: taxi-driver-telefonata          # unico, minuscole e trattini
tipo: scena
film: Taxi Driver
regista: Martin Scorsese
anno: 1976
dop: Michael Chapman
minutaggio: "~01:03"                # indicativo
inquadrature: [campo medio]
movimenti: [carrello laterale]
temi: [solitudine, rifiuto]
fonti:                              # almeno una, con url
  - titolo: "..."
    url: "https://..."
sguardo_vincent: "..."              # facoltativo
---
## Cosa succede
## Come è girata
## Cosa fa la sceneggiatura
## Perché funziona
## Da portare in Ultrarantino
```

**Profilo di un regista:** file `corpus/registi/<id>.md` con `tipo: regista`, `regista`, `fonti` (obbligatorie) e le sezioni `## La firma`, `## Come muove la macchina`, `## Come scrive o sceglie le storie`, `## Da portare in Ultrarantino`.

**Vocabolari chiusi.** `inquadrature`, `movimenti` e `temi` accettano solo valori presi da `corpus/vocabolario.yaml`. Se i valori fossero liberi, un filtro su "carrello" non troverebbe mai una scheda scritta con "carrellata".

**Fonti accettate:** interviste a registi e direttori della fotografia, articoli di American Cinematographer, saggi Criterion, libri e articoli di critica, la sceneggiatura letta per studio. Le sceneggiature non si copiano nel corpus: al massimo una citazione breve.

## Architettura

```
cineteca/
  corpus/                scene/, registi/, vocabolario.yaml        (Ultron, contenuti)
  src/
    corpus.js            legge e valida le schede, divide in pezzi
    embed.js             embedding locali (Transformers.js)
    db.js                PGlite: schema, inserimento, ricerca
    ingest.js            comando: corpus → database, solo le schede cambiate
    mcp.js               server MCP (stdio)
  eval/                  domande.json, eval.js, risultati
  test/                  node:test
  data/                  cartella del database PGlite (fuori da git)
  docs/spiegazioni/      artefatti di spiegazione (copie locali)
```

Ogni file ha un solo compito. `mcp.js` e `eval/` usano `db.js` ed `embed.js`, e non parlano mai direttamente con PGlite.

### Flusso di caricamento (`ingest`)

1. Legge ogni file del corpus e ne valida i campi: campi obbligatori presenti, almeno una fonte con `url`, `id` unico, valori dei vocabolari validi. **Al primo errore si ferma**, dicendo in quale file e quale campo.
2. Calcola l'hash di ogni file. Le schede che non sono cambiate si saltano, quelle cambiate si ricaricano e quelle cancellate si tolgono dal database.
3. Divide ogni scheda **sulle sue sezioni `##`**, un pezzo per sezione. Ogni pezzo eredita tutti i campi della scheda.
4. Calcola l'embedding di ogni pezzo con il prefisso `passage: ` (è la convenzione dei modelli e5; le domande usano `query: `).
5. Scrive tutto in una sola transazione.

### Schema (PGlite)

```sql
create extension if not exists vector;

create table documenti (
  id        text primary key,
  tipo      text not null check (tipo in ('scena','regista')),
  metadati  jsonb not null,
  testo     text not null,
  hash      text not null
);

create table pezzi (
  id         bigserial primary key,
  documento  text not null references documenti(id) on delete cascade,
  sezione    text not null,
  testo      text not null,
  embedding  vector(384) not null
);
```

La ricerca è una sola query: filtra con `documenti.metadati @> $filtri`, ordina per distanza coseno (`<=>`) e restituisce i primi `k * 3` pezzi. Il JS poi li raggruppa per scena e tiene i primi `k`. **Non si mette un indice HNSW**: con circa 300 pezzi la scansione completa è istantanea. L'indice si aggiunge quando le misure lo chiederanno.

### Server MCP

Trasporto stdio, SDK ufficiale `@modelcontextprotocol/sdk`.

| Strumento | Input | Output |
|---|---|---|
| `cerca_scene` | `domanda` (obbligatoria); `regista`, `film`, `movimenti`, `temi`, `k` (predefinito 5), tutti facoltativi | scene uniche ordinate per pertinenza: `id`, film, regista, sezione che ha fatto scattare il risultato, estratto, punteggio, `pertinente` (vero/falso), fonti |
| `leggi_scena` | `id` | la scheda completa |
| `profilo_regista` | `nome` | il profilo del regista più l'elenco dei suoi `id` di scena |

**Casi di errore:**
- **Nessun risultato:** "nessuna scena", con i filtri che sono stati usati. La ricerca non si allarga mai di nascosto.
- **Punteggio sotto la soglia:** il risultato si restituisce lo stesso, con `pertinente: false`. La soglia si fissa con la valutazione.
- **Valore di filtro sconosciuto:** errore con l'elenco dei valori validi letti dal database.
- **`id` o regista inesistente:** errore con i 3 valori più simili.

Per registrare il server in Claude Code serve una modifica di configurazione. Prima di farla, Ultron mostra la riga esatta e aspetta l'ok di Vincent.

## Test

`node:test`, senza librerie di test aggiuntive.
- **Unitari**, con un modello di embedding finto e deterministico: validazione delle schede (ogni regola ha il suo caso di errore), divisione in pezzi, confronto degli hash, costruzione dei filtri, raggruppamento per scena, messaggi di errore.
- **Integrazione:** un corpus di prova con 3 schede, su PGlite vero e con il modello vero. Una domanda nota deve restituire la scheda giusta al primo posto.

## Valutazione

- **30 domande** scritte da Ultron e controllate da Vincent, ciascuna con le scene attese. In `eval/domande.json`.
- **Metriche:** hit@5 (la scena giusta è tra le prime 5) e MRR (quanto in alto compare).
- **Tre versioni a confronto:**
  1. solo vettori;
  2. vettori più filtri;
  3. "tutto nel contesto": `claude -p` riceve l'intero corpus e la domanda e restituisce gli `id`. Usa l'abbonamento di Vincent, nessuna chiave API.
- **Per ogni versione si misura anche** il tempo per domanda e, per la terza, i token consumati.
- **Risultati** in `eval/risultati.md`, con una tabella che va nel README.
- **Soglia di pertinenza:** si sceglie guardando la distribuzione dei punteggi nelle risposte giuste e in quelle sbagliate.

**Prova finale:** Ultron riscrive gli 8 SHOT_BRIEF di *Ricominciare* usando la Cineteca. Vincent li confronta coppia per coppia con i vecchi, senza sapere quale è quale (ordine casuale, la chiave resta a Ultron fino al verdetto).

## Ordine di lavoro

1. **Fondamenta.**
   - Verificare che PGlite supporti pgvector e che `multilingual-e5-small` giri in Transformers.js.
   - Se una delle due verifiche fallisce, ci si ferma e si riporta a Vincent con un'alternativa.
   - Poi: schema, `corpus.js`, `ingest`, test.
   - → Artefatto 1: database, embedding, divisione in pezzi.
2. **Un film da cima a fondo: Taxi Driver.**
   - Scelta delle scene insieme a Vincent, analisi da fonti, caricamento.
   - Il formato delle schede si corregge qui, prima di scrivere il resto.
3. **Ricerca e server MCP.**
   - → Artefatto 2: ricerca ibrida e MCP.
4. **Il resto del corpus:** 10 film, i 12 profili dei registi e le scene dei 6 registi senza film.
5. **Valutazione.**
   - → Artefatto 3: come si misura un RAG.
6. **Prova alla cieca su *Ricominciare*.**
7. **Più avanti:** demo web, con la scelta dell'LLM e dell'hosting (lo schema si sposta su un Postgres online).

## Artefatti di spiegazione

Uno per ogni fase indicata sopra. Ogni artefatto:
- spiega le **scelte e il loro perché**, non solo cosa fa il codice, con le parti di codice che contano;
- chiude con **5-6 domande da colloquio**. Vincent risponde e Ultron lo corregge.

**Regola:** una parte entra nel portfolio solo quando Vincent ha superato le sue domande.

## Fuori da questa versione

- La demo web e qualunque LLM per le risposte.
- L'hosting online.
- Le modifiche al codice Python di Ultrarantino: il Regista usa la Cineteca via MCP mentre scrive gli SHOT_BRIEF.
- L'estrazione automatica di dati dai video.
- I dataset pubblici etichettati (MovieNet, MovieShots).
