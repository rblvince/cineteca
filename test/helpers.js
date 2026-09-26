import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Embedder deterministico per i test: ogni parola finisce in un "cassetto"
// del vettore, così testi con parole in comune risultano simili.
export function embedderFinto(dim = 384) {
  let chiamate = 0;
  const vettore = (testo) => {
    const v = new Array(dim).fill(0);
    const pulito = testo.toLowerCase().replace(/^(passage|query): /, "");
    for (const parola of pulito.match(/\p{L}+/gu) ?? []) {
      let h = 0;
      for (const c of parola) h = (h * 31 + c.codePointAt(0)) >>> 0;
      v[h % dim] += 1;
    }
    const norma = Math.hypot(...v) || 1;
    return v.map((x) => x / norma);
  };
  return {
    modello: "finto",
    dim,
    passaggi: async (testi) => {
      chiamate += testi.length;
      return testi.map(vettore);
    },
    domanda: async (testo) => vettore(testo),
    get chiamate() {
      return chiamate;
    },
  };
}

const VOCABOLARIO = `inquadrature: [campo medio, primo piano, campo lungo]
movimenti: [carrello laterale, steadicam, camera fissa]
temi: [solitudine, rifiuto, potere, famiglia]
`;

export const SCENA_TAXI = `---
id: taxi-driver-telefonata
tipo: scena
film: Taxi Driver
regista: Martin Scorsese
anno: 1976
dop: Michael Chapman
minutaggio: "~01:03"
inquadrature: [campo medio]
movimenti: [carrello laterale]
temi: [solitudine, rifiuto]
fonti:
  - titolo: Fonte di prova
    url: https://example.com/taxi
sguardo_vincent: Come la solitudine cambia una persona
---
## Cosa succede
Travis telefona a Betsy da un telefono pubblico e viene respinto.

## Come è girata
La macchina da presa si allontana lateralmente verso un corridoio vuoto, come se non sopportasse di guardare.

## Perché funziona
Il rifiuto diventa spazio vuoto: la solitudine si vede invece di dirla.
`;

export const SCENA_COPACABANA = `---
id: quei-bravi-ragazzi-copacabana
tipo: scena
film: Quei bravi ragazzi
regista: Martin Scorsese
anno: 1990
dop: Michael Ballhaus
inquadrature: [campo medio]
movimenti: [steadicam]
temi: [potere]
fonti:
  - titolo: Fonte di prova
    url: https://example.com/copacabana
---
## Cosa succede
Henry porta Karen al Copacabana entrando dal retro, attraverso la cucina.

## Come è girata
Una steadicam segue la coppia senza stacchi dalla strada fino al tavolo davanti al palco.

## Perché funziona
Il piano sequenza mostra il potere di Henry: tutte le porte si aprono per lui.
`;

export const PROFILO_SCORSESE = `---
id: martin-scorsese
tipo: regista
regista: Martin Scorsese
fonti:
  - titolo: Fonte di prova
    url: https://example.com/scorsese
---
## La firma
Camera energica, voce narrante, musica pop sopra le scene, la colpa come motore.
`;

export async function scriviCorpusProva(dir) {
  await mkdir(path.join(dir, "scene"), { recursive: true });
  await mkdir(path.join(dir, "registi"), { recursive: true });
  await writeFile(path.join(dir, "vocabolario.yaml"), VOCABOLARIO);
  await writeFile(path.join(dir, "scene", "taxi-driver-telefonata.md"), SCENA_TAXI);
  await writeFile(path.join(dir, "scene", "quei-bravi-ragazzi-copacabana.md"), SCENA_COPACABANA);
  await writeFile(path.join(dir, "registi", "martin-scorsese.md"), PROFILO_SCORSESE);
}
