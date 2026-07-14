import { z } from "zod";

export const milestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  objective: z.string(),
  completion_criteria: z.array(z.string()),
});

export const activitySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  milestone_id: z.string(),
  dependencies: z.array(z.string()),
  status: z.enum(["ready", "blocked"]),
  expected_output: z.string(),
});

export const blockerSchema = z.object({
  description: z.string(),
  related_activity_ids: z.array(z.string()),
});

export const architecturePlanSchema = z.object({
  summary: z.string(),
  assumptions: z.array(z.string()),
  missing_information: z.array(z.string()),
  milestones: z.array(milestoneSchema),
  activities: z.array(activitySchema),
  blockers: z.array(blockerSchema),
});

export type ArchitecturePlan = z.infer<typeof architecturePlanSchema>;
export type Milestone = z.infer<typeof milestoneSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type Blocker = z.infer<typeof blockerSchema>;
