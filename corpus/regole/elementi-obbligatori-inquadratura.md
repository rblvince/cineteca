---
id: elementi-obbligatori-inquadratura
tipo: regola
elemento: generale
fonti:
  - titolo: "StudioBinder, Shot Designer e shot list: i campi di una shot list"
    url: "https://www.studiobinder.com/shot-designer/"
  - titolo: "ShotBench: Expert-Level Cinematic Understanding in Vision-Language Models"
    url: "https://vchitect.github.io/ShotBench-project/"
  - titolo: "CineTechBench: A Benchmark for Cinematographic Technique Understanding and Generation"
    url: "https://huggingface.co/datasets/Xinran0906/CineTechBench"
  - titolo: "StudioBinder, Film lighting techniques"
    url: "https://www.studiobinder.com/blog/film-lighting-techniques/"
  - titolo: "Wikipedia, 180-degree rule"
    url: "https://en.wikipedia.org/wiki/180-degree_rule"
  - titolo: "Higgsfield, Santiago: How To Direct an AI Short Film Like a Filmmaker"
    url: "https://higgsfield.ai/blog/Santiago-breakdown"
  - titolo: "Higgsfield, Meet Cinema Studio 4.0"
    url: "https://higgsfield.ai/blog/cinema-studio-4-0"
---
## Cos'è
La lista dei campi che ogni inquadratura della Cineteca e di ogni storyboard di Ultrarantino deve avere. È la somma di tre cose: i campi di una shot list professionale (StudioBinder: scala, angolo, movimento, obiettivo e focale, frame rate, attrezzatura, suono, luogo, cast, note di luce), le dimensioni su cui gli esperti annotano le inquadrature nei benchmark (ShotBench: scala, taglio, angolo, obiettivo, tipo di luce, condizione della luce, composizione, movimento; CineTechBench: scala, angolo, composizione, movimento, luce, colore, focale) e i controlli che un generatore video come Cinema Studio 4.0 chiede davvero (genere, epoca, ritmo del montaggio, camera, obiettivo, diaframma, movimento, palette, luce).

## Cosa comunica
I campi obbligatori, in sei gruppi:
- **Camera:** scala, angolo, movimento, obiettivo e focale, messa a fuoco e profondità di campo, composizione, inquadratura di relazione (singola, a due, sulla spalla, soggettiva), velocità (ralenti o normale), durata.
- **Luce:** chiave alta o bassa, qualità dura o morbida, direzione della luce principale, sorgente motivata o no, colore.
- **Regia:** soggetto e azione, blocking (dove sta e dove va ogni personaggio), lato dello schermo di ogni personaggio (regola dei 180°), direzione degli sguardi.
- **Colore:** palette dominante e suo significato.
- **Suono:** diegetico o no, cosa si sente e cosa sparisce.
- **Montaggio:** come si entra e come si esce dall'inquadratura (stacco, raccordo sul movimento, match cut, dissolvenza).

## Quando usarla
Sempre. Ogni valore porta la sua provenienza: fonte scritta, dataset, modello con confidenza, oppure visto e verificato da Vincent. Un campo che nessuno ha documentato si scrive come tale, non si inventa.

## Da portare in Ultrarantino
Lo SHOT_BRIEF dello storyboard usa questi campi, nello stesso ordine. Il formato di Santiago (SUBJECT / CAMERA / ACTION / CONSTRAINTS) è la traduzione per il generatore video: Camera e Luce vanno in CAMERA, Regia in SUBJECT e ACTION, lati dello schermo e continuità in CONSTRAINTS.
