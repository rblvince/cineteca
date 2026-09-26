import { pipeline } from "@huggingface/transformers";

export const MODELLO = "Xenova/multilingual-e5-small";
export const DIM = 384;

export async function creaEmbedder({ modello = MODELLO } = {}) {
  const estrai = await pipeline("feature-extraction", modello, { dtype: "q8" });
  const vettori = async (testi) => {
    const t = await estrai(testi, { pooling: "mean", normalize: true });
    const [n, d] = t.dims;
    if (d !== DIM) throw new Error(`il modello ${modello} dà vettori da ${d}, attesi ${DIM}`);
    return Array.from({ length: n }, (_, i) => Array.from(t.data.slice(i * d, (i + 1) * d)));
  };
  return {
    modello,
    dim: DIM,
    // Convenzione dei modelli e5: "passage: " per i testi, "query: " per le domande.
    passaggi: (testi) => vettori(testi.map((t) => `passage: ${t}`)),
    domanda: async (testo) => (await vettori([`query: ${testo}`]))[0],
  };
}
