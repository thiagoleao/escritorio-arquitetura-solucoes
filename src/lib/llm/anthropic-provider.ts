import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { architecturePlanSchema, type ArchitecturePlan } from "@/lib/schema";
import type { LLMProvider, PlanInput } from "@/lib/llm/provider";
import { SYSTEM_INSTRUCTIONS, buildUserPrompt } from "@/lib/llm/prompt";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 180_000 });
    this.model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
  }

  async generateArchitecturePlan(input: PlanInput): Promise<ArchitecturePlan> {
    let message;
    try {
      message = await this.client.messages.parse({
        model: this.model,
        max_tokens: 32000,
        system: SYSTEM_INSTRUCTIONS,
        messages: [{ role: "user", content: buildUserPrompt(input) }],
        output_config: {
          format: zodOutputFormat(architecturePlanSchema),
        },
      });
    } catch (error) {
      throw new Error(
        "Falha ao gerar o planejamento: a resposta do modelo foi interrompida antes de terminar. Tente novamente ou simplifique o pedido.",
        { cause: error }
      );
    }

    if (!message.parsed_output) {
      throw new Error("O modelo Claude não retornou uma resposta estruturada válida.");
    }
    return message.parsed_output;
  }
}
