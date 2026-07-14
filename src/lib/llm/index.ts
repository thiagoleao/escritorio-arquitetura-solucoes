import type { LLMProvider } from "@/lib/llm/provider";
import { OpenAIProvider } from "@/lib/llm/openai-provider";
import { AnthropicProvider } from "@/lib/llm/anthropic-provider";

export type { LLMProvider, PlanInput } from "@/lib/llm/provider";

export function getLLMProvider(): LLMProvider {
  const provider = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();

  switch (provider) {
    case "openai":
      return new OpenAIProvider();
    case "anthropic":
      return new AnthropicProvider();
    default:
      throw new Error(`LLM_PROVIDER desconhecido: "${provider}". Use "openai" ou "anthropic".`);
  }
}
