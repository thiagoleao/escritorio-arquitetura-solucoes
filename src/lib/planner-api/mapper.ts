import type { ArchitecturePlan } from "@/lib/schema";
import type { PlanningDetail } from "@/lib/planner-api/client";

export function planningDetailToArchitecturePlan(detail: PlanningDetail): ArchitecturePlan {
  return {
    summary: detail.version.summary,
    assumptions: detail.version.assumptions,
    missing_information: detail.version.missing_information,
    milestones: detail.milestones.map((milestone) => ({
      id: milestone.external_id,
      title: milestone.title,
      objective: milestone.objective,
      completion_criteria: milestone.completion_criteria,
    })),
    activities: detail.activities.map((activity) => ({
      id: activity.external_id,
      title: activity.title,
      description: activity.description,
      milestone_id: activity.milestone_external_id,
      dependencies: activity.dependencies,
      status: activity.status,
      expected_output: activity.expected_output,
    })),
    blockers: detail.blockers.map((blocker) => ({
      description: blocker.description,
      related_activity_ids: blocker.related_activity_external_ids,
    })),
  };
}
