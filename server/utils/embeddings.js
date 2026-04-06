import { Pinecone } from '@pinecone-database/pinecone';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const EMBED_MODEL = process.env.PINECONE_EMBED_MODEL || 'multilingual-e5-large';

export async function embedTexts(texts, inputType = 'passage') {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const response = await pinecone.inference.embed(EMBED_MODEL, texts, {
    inputType,
    truncate: 'END',
  });
  return response.data?.map((entry) => entry.values || []) || [];
}

export function getEmbeddingModel() {
  return EMBED_MODEL;
}

