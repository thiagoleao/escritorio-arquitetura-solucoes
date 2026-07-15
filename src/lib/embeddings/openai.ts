import OpenAI from "openai";

let cachedClient: OpenAI | null = null;

export async function createEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY não configurada — embedding não será gerado.");
    return null;
  }

  try {
    if (!cachedClient) {
      cachedClient = new OpenAI({ apiKey });
    }
    const model = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
    const response = await cachedClient.embeddings.create({ model, input: text });
    return response.data[0]?.embedding ?? null;
  } catch (error) {
    console.error("Falha ao gerar embedding", error);
    return null;
  }
}
