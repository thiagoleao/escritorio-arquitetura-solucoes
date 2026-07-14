import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { architecturePlanSchema, type ArchitecturePlan } from "@/lib/schema";
import type { LLMProvider, PlanInput } from "@/lib/llm/provider";
import { SYSTEM_INSTRUCTIONS, buildUserPrompt } from "@/lib/llm/prompt";

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = process.env.OPENAI_MODEL ?? "gpt-5.5";
  }

  async generateArchitecturePlan(input: PlanInput): Promise<ArchitecturePlan> {
    const completion = await this.client.chat.completions.parse({
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTIONS },
        { role: "user", content: buildUserPrompt(input) },
      ],
      response_format: zodResponseFormat(architecturePlanSchema, "architecture_plan"),
    });

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
      throw new Error("O modelo OpenAI não retornou uma resposta estruturada válida.");
    }
    return parsed;
  }
}
