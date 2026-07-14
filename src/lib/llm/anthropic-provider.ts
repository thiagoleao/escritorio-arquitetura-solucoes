import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { architecturePlanSchema, type ArchitecturePlan } from "@/lib/schema";
import type { LLMProvider, PlanInput } from "@/lib/llm/provider";
import { SYSTEM_INSTRUCTIONS, buildUserPrompt } from "@/lib/llm/prompt";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
  }

  async generateArchitecturePlan(input: PlanInput): Promise<ArchitecturePlan> {
    const message = await this.client.messages.parse({
      model: this.model,
      max_tokens: 16384,
      system: SYSTEM_INSTRUCTIONS,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      output_config: {
        format: zodOutputFormat(architecturePlanSchema),
      },
    });

    if (!message.parsed_output) {
      throw new Error("O modelo Claude não retornou uma resposta estruturada válida.");
    }
    return message.parsed_output;
  }
}
