# Museo della Cineteca — design

Data: 2026-09-30. Stato: design approvato da Vincent a voce, spec in revisione. Prototipi: https://claude.ai/artifact/VUnWSetoT3Bt9KmpkLgTHH (architettura), https://claude.ai/artifact/VS4GYpryDa9FtkL79qm9fj (layout), https://claude.ai/artifact/B7yUN6ngQXvMRMnjD7bdhL (la spec in figura).

## Scopo

Un sito pubblico dove si sfoglia un catalogo dei migliori film al mondo e, per i film allestiti, se ne leggono le scene migliori spiegate. È un pezzo del portfolio 2027 di Vincent. I dati li legge dal vivo da Supabase.

**Criterio di successo:** una persona che non conosce la Cineteca apre il sito sul telefono e in due tocchi legge per intero una scena spiegata di un film scelto da lei, con la clip a portata di mano. Trova qualunque film del catalogo in pochi secondi cercandolo per titolo o regista. Ogni scena pubblicata ha una funzione narrativa e un tono, e il sito dice se li ha assegnati un modello. Nessun testo privato (sezione "Da portare in Ultrarantino", `sguardo_vincent`) compare mai sul sito.

## Due livelli

Vincent vuole poter aggiungere film fino ad avere un catalogo intero, non solo 11 film e 6 registi (30/09). Le scene però si scrivono a mano da fonti vere e non scalano in automatico. Per questo il museo ha due livelli:

| | Catalogo | Sale allestite |
|---|---|---|
| Cosa contiene | Titolo, anno, regista, direttore della fotografia, paese, durata, formato quando c'è | Tutto il catalogo, più scene spiegate, clip, colore e numero di collezione |
| Da dove viene | Wikidata, importato da uno script | Le schede in `corpus/scene/`, scritte da Ultron dalle fonti |
| Quanti | Si parte con circa 1000 film, poi si allarga | 11 oggi, crescono a lotti scelti da Vincent |
| Come cresce | Si rilancia l'importazione con una lista più lunga | Vincent sceglie i film, Ultron propone le scene, Vincent le approva, Ultron scrive le schede |

Un film passa da catalogo ad allestito quando ha almeno una scena pubblicata. Non serve altro: lo stato si ricava dai dati.

### Le fonti

- **Wikidata** per i dati del catalogo. Licenza CC0, interrogabile con SPARQL (`query.wikidata.org`). Ogni film tiene il suo identificativo Wikidata.
- **Quali film entrano:** la lista aggregata *They Shoot Pictures, Don't They?* "1000 Greatest Films" e il sondaggio *Sight and Sound* 2022, usate come criterio di scelta e citate nella pagina "Come è fatto il catalogo". Il sito non ripubblica le loro classifiche né le loro posizioni.
- **Da non usare:** i dataset IMDb (licenza solo per uso personale e non commerciale). TMDB non serve, perché il museo non mostra locandine.
- I termini di Wikidata, TSPDT e Sight and Sound vanno ricontrollati sulle pagine ufficiali al passo 1, prima di scrivere codice. Se una fonte non si può usare, lo si dice e si sceglie un'altra lista.

## Decisioni prese (con Vincent, 30/09)

| Tema | Decisione |
|---|---|
| Dove vive | Dentro il repo `cineteca`, cartella `museo/` per il sito e `museo/scripts/` per importazione e pubblicazione. |
| Database | Nuovo progetto Supabase `cineteca` (EU, piano gratuito). Prende il secondo slot gratuito, prima pensato per il gemello pubblico della Baracca. Qualche migliaio di righe sta largo nei 500 MB del piano. |
| Museo e creazione separati | Schema `museo`: pubblico, sola lettura. Schema `officina`: privato, vuoto per ora, mai esposto all'API. Servirà a embedding, regole e consigliere della camera per Ultrarantino. |
| Pubblico | Portfolio, online. |
| Immagini | Clip YouTube incorporate (46 scene su 50 ne hanno una) e tipografia forte. Niente fotogrammi, niente locandine, niente immagini AI. |
| Stack | React + Vite + TypeScript + React Router, `supabase-js` in lettura. |
| Deploy | Vercel, solo dopo che Vincent ha visto il sito e dato l'ok. |
| Layout | **B · Collezione** (da Criterion) con due pezzi di **A · Archivio** (da Harvard Film Archive): la grana della pellicola e il riquadro della clip nel formato originale del film. Vincent: "mi piace come unisci il vecchio con il layout dei libri". |
| Interazione | I film si aprono nella stessa finestra: niente pagina separata per il film. |
| Catalogo | Due livelli, catalogo da Wikidata e sale allestite con scene (Vincent, 30/09). |
| Montaggio | Le scene hanno una categoria (funzione narrativa e tono) da questo lavoro; la sala Montaggio ha una sua spec dopo il lancio. Strada E+B, votata con Jev e scelta da Vincent (30/09). |

## Il sito

### Struttura

Una pagina sola che scorre, più una sala dei registi.

1. **Testata.** "Cineteca" in un serif classico, i conteggi (es. 11 sale allestite · 1000 film in catalogo · 50 scene), i link al catalogo e alla sala dei registi.
2. **Scaffale delle sale allestite.** I film allestiti come dorsi di libro, in ordine d'anno, con numero di collezione (001, 002…), titolo in verticale e cognome del regista. Ogni film ha il suo colore. L'altezza del dorso cresce col numero di scene. Quando i film allestiti diventano tanti, lo scaffale scorre di lato; oltre i 40 si divide in ripiani per decennio.
3. **Edizione.** Sotto lo scaffale si apre il film scelto: numero grande, titolo, regista, anno, direttore della fotografia. Poi l'elenco delle scene.
4. **Scena.** Numero d'inventario (es. `N. 005.5`), titolo, prima frase del "Perché funziona" come citazione. "Leggi la scheda" apre sul posto le quattro sezioni (Cosa succede, Come è girata, Cosa fa la sceneggiatura, Perché funziona), il numero di inquadrature, i temi, la funzione narrativa e il tono, più la clip. Se la categoria l'ha data un modello, accanto c'è una nota breve ("categoria assegnata da un modello, rivista").
5. **Catalogo.** Sotto l'edizione, l'indice di tutti i film, nello stile dell'indice di A: una riga per film con anno, titolo, regista, paese e formato. In cima una ricerca per titolo o regista e tre filtri (decennio, paese, regista). I film allestiti hanno il loro colore e il numero di collezione e aprono l'edizione. Gli altri aprono sul posto una scheda breve con i dati e la fonte, con la scritta "Sala non ancora allestita". Il catalogo si carica a pagine da 50 righe.
6. **Sala dei registi.** Tutti i registi del catalogo, con il numero dei loro film. Chi ha un profilo scritto (oggi 6) ha una pagina col profilo; gli altri hanno la sola lista dei film.

### I pezzi presi da A

- **Grana.** Un velo di rumore generato una volta su canvas, a bassa opacità, animato a scatti. Fermo con `prefers-reduced-motion`.
- **Formato originale.** Il riquadro della clip ha le proporzioni in cui il film è stato girato (1.37, 1.85, 2.20, 2.39). Anche l'anteprima nell'edizione usa quelle proporzioni. Per i film allestiti il formato va preso da una fonte citata; nel catalogo si mostra solo se Wikidata lo ha.
- **Indice.** La lista del catalogo riprende le righe dell'indice di A.

### URL e stato

- `/` apre lo scaffale con *Taxi Driver* aperto, il film di riferimento della Cineteca (come nel prototipo).
- `/film/:slug` apre lo stesso scaffale con quell'edizione aperta, oppure la scheda breve se il film è solo in catalogo: è la stessa pagina, l'URL serve solo a condividere e a far funzionare il tasto indietro.
- `/film/:slug/:scena` apre anche quella scheda e ci scorre sopra.
- `/catalogo?q=…&decennio=…&paese=…&regista=…` porta al catalogo con la ricerca e i filtri già impostati.
- `/registi` e `/registi/:slug` per la sala dei registi.

### Clip

La facciata mostra il riquadro nel formato del film con un tasto play. L'iframe `youtube-nocookie.com` si carica solo al click. Le scene senza clip mostrano "Nessuna clip" nel riquadro, senza buchi nella pagina.

### Accessibilità e telefono

- I dorsi sono pulsanti con `aria-expanded` e si usano da tastiera. Sul telefono lo scaffale scorre di lato, e l'edizione scorre in verticale sotto.
- Le schede aperte usano `aria-expanded` sul pulsante; il focus resta dove si trova.
- La ricerca del catalogo ha un'etichetta vera e annuncia il numero di risultati con `aria-live`.
- Contrasti AA su tutti i colori dei dorsi (testo bianco): da verificare uno per uno.
- Progettato e rifinito con Impeccable (`/impeccable audit`, `polish`), verificato con Playwright sulla build di produzione. Favicon, `robots.txt`, dimensioni delle immagini dalla prima bozza.

## Dati

### Schema `museo` (pubblico)

- `museo.film`: slug, wikidata_id, titolo, titolo_originale, anno, paesi (array), durata, dop, formato (numero o null), fonte_selezione (TSPDT, Sight and Sound, scelta di Vincent), più colore e numero_collezione solo per i film allestiti.
- `museo.film_registi`: film_slug, regista_slug. Serve perché un film può avere più registi.
- `museo.scene`: id, film_slug, ordine, titolo, temi (array), funzione, tono, categoria_fonte (`modello` o `vincent`), clip (id YouTube o null), n_shot, succede, girata, sceneggiatura, perche.
- `museo.registi`: slug, wikidata_id, nome, profilo (testo o null).
- Vista `museo.film_allestiti`: i film con almeno una scena, col conteggio delle scene.
- Indici su titolo e regista per la ricerca (trigram con `pg_trgm`).

RLS attiva su tutte le tabelle, con una sola policy: `select` per `anon`. Nessun `insert`, `update` o `delete` per `anon`. Lo schema `museo` va esposto nelle impostazioni della Data API; `officina` no.

### Schema `officina` (privato)

Creato vuoto, non esposto. Nessun ruolo pubblico ha permessi. Il contenuto si decide con il consigliere della camera.

### Importazione: `museo/scripts/importa-catalogo.js`

- Parte da una lista di titoli in `corpus/catalogo/lista.yaml` (titolo, anno, regista e da quale fonte viene).
- Per ogni riga cerca il film su Wikidata con titolo, anno e regista, e ne prende i dati.
- Scrive il risultato in `corpus/catalogo/film.json`, che sta nel repo: ogni importazione si può rileggere e confrontare con `git diff` prima di pubblicarla.
- I film che non trova, o che trova due volte, finiscono in un elenco da rivedere a mano. Non li indovina.
- Rispetta i limiti di Wikidata: poche richieste per volta e uno User-Agent con un contatto.

### Pubblicazione: `museo/scripts/pubblica.js`

- Legge `corpus/catalogo/film.json`, `corpus/film.yaml`, i profili e le schede scena. Le schede passano da `parseScheda` e `validaScheda` di `src/corpus.js`, senza riscriverli.
- **Toglie sempre** la sezione "Da portare in Ultrarantino" e il campo `sguardo_vincent`.
- Un film allestito deve esistere nel catalogo: se una scheda scena parla di un film che non c'è, la pubblicazione si ferma e lo dice.
- Fa l'upsert delle righe e cancella quelle che non esistono più nel corpus.
- Legge la service key dal Portachiavi di macOS e non la stampa mai.
- Il sito usa solo la anon key.

### Cosa manca nel corpus

- **Titoli delle scene.** Le schede non hanno `titolo:`. Si aggiunge a tutti e 50 i file: Ultron propone la lista, Vincent la approva prima di toccare i file.
- **Formato e colore dei film allestiti.** Nuovo file `corpus/film.yaml` con formato (e fonte), colore e numero di collezione.
- **La lista del catalogo.** `corpus/catalogo/lista.yaml`, da costruire dalle fonti scelte. Vincent la vede prima dell'importazione.
- **Due profili.** P.T. Anderson e Lonergan non hanno un profilo. Il sito regge senza; scriverli è un lavoro a parte.

### Categorie delle scene

Servono perché un giorno il visitatore possa montare scene di film diversi in una storia, e perché la Cineteca possa analizzarle per categoria. Due campi per scena, ognuno da una lista chiusa in `corpus/vocabolario.yaml`:

- **funzione**, cosa fa la scena nella storia. Proposta: presentazione, innesco, crescita, confronto, svolta, culmine, scioglimento.
- **tono**. Proposta: teso, cupo, malinconico, euforico, ironico, inquietante, tenero.

Le due liste sono proposte di Ultron: Vincent le approva o le cambia prima che si classifichi qualcosa.

**Chi le assegna: `museo/scripts/classifica-scene.js`.** Per ogni scena chiede a Jev (TypeSafe, via OpenRouter, l'unico uso ammesso di OpenRouter) due domande a scelta, una per campo, con le opzioni del vocabolario. Jev legge il titolo e le quattro sezioni pubbliche della scheda; la sezione "Da portare in Ultrarantino" e `sguardo_vincent` non partono mai.

- Il risultato va in `corpus/scene/categorie.yaml`, una voce per scena: funzione, tono, probabilità di ciascuno e `fonte: modello` oppure `fonte: vincent`. Sta nel repo e si rilegge con `git diff`. Le 50 schede non si toccano, quindi `validaScheda` resta com'è.
- Sopra una soglia di probabilità (0,8 di partenza) la categoria entra come `modello`. Sotto, finisce in un elenco che Vincent rivede; quello che decide lui diventa `vincent`.
- Una categoria `vincent` non viene mai sovrascritta da una nuova classificazione.
- **Prima si misura:** Vincent assegna a mano la categoria a 10 scene, Jev classifica le stesse 10. Se su quelle 10 sbaglia spesso, la soglia sale o si torna alle categorie a mano (strada A). La forma esatta della domanda a scelta si verifica sulla doc ufficiale di Jev prima di scrivere lo script.
- La chiave è quella nel Portachiavi (servizio `openrouter`) e la usa solo lo script, in locale. Il sito non chiama Jev.
- `pubblica.js` si ferma se una scena non ha una categoria o ne ha una fuori vocabolario.

## Sicurezza

Regole "Code security" di CLAUDE.md (30/09), applicate qui:

- **Chiavi.** Nel sito solo `VITE_SUPABASE_URL` e la anon key. La service key vive nel Portachiavi e la usa solo `pubblica.js`, in locale.
- **Permessi.** Oltre alla RLS, `grant usage` sullo schema `museo` e `grant select` sulle tabelle ad `anon`, nient'altro. `revoke all` su `officina` per `anon` e `authenticated`.
- **Clip.** `pubblica.js` estrae l'id YouTube dall'URL della fonte e lo accetta solo se rispetta `^[A-Za-z0-9_-]{11}$`, altrimenti `clip` resta null. Il sito lo ricontrolla prima di costruire l'URL `https://www.youtube-nocookie.com/embed/<id>`.
- **Testi.** Le quattro sezioni e i dati di Wikidata vanno in pagina come testo, dentro elementi React. Niente `dangerouslySetInnerHTML`, niente HTML grezzo. I dati importati sono dati, mai istruzioni.
- **Ricerca.** Il testo cercato passa a `supabase-js` come parametro, mai incollato dentro una query.
- **Header.** Su Vercel: Content-Security-Policy con `frame-src https://www.youtube-nocookie.com`, `connect-src` solo verso il progetto Supabase, niente script inline; più `X-Content-Type-Options: nosniff` e `Referrer-Policy: strict-origin-when-cross-origin`.
- **Jev.** Legge solo testi scritti da Ultron e pubblici, mai contenuti dei visitatori: il rischio di istruzioni nascoste nel testo resta fuori. La chiave non lascia il Mac.
- **Prima di ogni push:** `/security-review`, `gitleaks git . --redact`, `npm audit`.

## Test

- `importa-catalogo.js`: con risposte di Wikidata registrate in un file, un titolo trovato una volta entra; uno trovato zero o due volte finisce tra quelli da rivedere; nessun film compare due volte in `film.json`.
- `pubblica.js`: un test che fallisce se "Da portare in Ultrarantino" o `sguardo_vincent` finiscono nelle righe da pubblicare. Un test che l'upsert cancella gli orfani. Un test che si ferma se una scena parla di un film fuori catalogo.
- `classifica-scene.js`: con risposte di Jev registrate in un file, una categoria sotto soglia finisce tra quelle da rivedere; una categoria `vincent` non viene sovrascritta; il corpo della richiesta non contiene mai la sezione privata né `sguardo_vincent`. `pubblica.js` si ferma su una scena senza categoria.
- SQL: con la anon key si legge `museo`, non si scrive, e `officina` non risponde.
- Sito: Playwright sulla build di produzione. Apre un film dallo scaffale, apre una scheda, carica una clip, cerca un film nel catalogo e ne apre la scheda breve, usa i link diretti `/film/:slug/:scena` e `/catalogo?q=…`, controlla la larghezza del telefono.

## Ordine di lavoro

1. Termini delle fonti ricontrollati; titoli delle 50 schede e `corpus/film.yaml`: lista a Vincent, poi modifica.
2. Categorie: Vincent approva il vocabolario di funzione e tono e ne assegna a mano 10; `classifica-scene.js` con i suoi test; prova sulle 10, poi classificazione delle 50 e revisione di quelle sotto soglia.
3. `corpus/catalogo/lista.yaml` e `importa-catalogo.js` con i suoi test. Vincent vede la lista e i film da rivedere prima che entrino.
4. Vincent fa il login a Supabase; si crea il progetto `cineteca`.
5. Schemi, RLS e test SQL.
6. `pubblica.js` e i suoi test.
7. Il sito `museo/` con Impeccable.
8. Vincent lo vede girare; dopo il suo ok, deploy su Vercel.

Dopo il lancio, il museo cresce così: Vincent sceglie un lotto di film da allestire, Ultron propone le scene per ogni film, Vincent le approva, Ultron scrive le schede, `classifica-scene.js` assegna le categorie e si rilancia `pubblica.js`.

Ogni modifica al codice, commit e push passa dalla conferma di Vincent.

## Fuori da questo lavoro

- Il contenuto dello schema `officina` e il consigliere della camera.
- I profili di P.T. Anderson e Lonergan, e degli altri registi del catalogo.
- Le scene dei film oltre gli 11 di oggi: ogni lotto è un lavoro a sé.
- La ricerca per temi o per contenuto delle scene.
- **La sala Montaggio**, con una sua spec dopo il lancio: il visitatore sceglie scene di film diversi, le mette in fila, le clip partono una dopo l'altra, la sequenza vive nell'URL, e controlli a regole segnalano i buchi (manca una presentazione, due culmini). Niente AI chiamata dal sito. Strade scartate con Jev (30/09): Jev dal vivo sul sito (costi e abusi di un endpoint pubblico) e la storia montata in automatico dal sito (toglie al visitatore l'atto di montare).
