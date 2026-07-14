import type { ArchitecturePlan } from "@/lib/schema";

export interface PlanInput {
  context: string;
  objective: string;
  deliverables: string;
  constraints: string;
  extractedFilesText: string;
}

export interface LLMProvider {
  generateArchitecturePlan(input: PlanInput): Promise<ArchitecturePlan>;
}
