import type { ArchitecturePlan } from "@/lib/schema";
import type { ReferenceCase } from "@/lib/llm/references";

export interface PlanInput {
  context: string;
  objective: string;
  deliverables: string;
  constraints: string;
  extractedFilesText: string;
  referenceCases?: ReferenceCase[];
}

export interface LLMProvider {
  generateArchitecturePlan(input: PlanInput): Promise<ArchitecturePlan>;
}
