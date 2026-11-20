import { groupIssuesByMilestone, type BoardIssue, type BoardMilestone } from './issue-board.js';

export interface MyWorkTask extends BoardIssue {
  project_id: number;
  project_name: string;
  milestone_id: number | null;
  milestone_name?: string | null;
  milestone_due_date?: string | null;
}

export interface MyWorkMilestoneGroup<T extends MyWorkTask = MyWorkTask> {
  key: string;
  milestoneId: number | null;
  name: string;
  dueDate: string | null;
  tasks: T[];
}

export interface MyWorkProjectGroup<T extends MyWorkTask = MyWorkTask> {
  projectId: number;
  projectName: string;
  milestones: MyWorkMilestoneGroup<T>[];
}

export function groupMyWorkTasks<T extends MyWorkTask>(tasks: readonly T[]): MyWorkProjectGroup<T>[] {
  const tasksByProject = new Map<number, T[]>();
  for (const task of tasks) {
    const projectTasks = tasksByProject.get(task.project_id) ?? [];
    projectTasks.push(task);
    tasksByProject.set(task.project_id, projectTasks);
  }

  return [...tasksByProject.entries()]
    .map(([projectId, projectTasks]) => {
      const milestonesById = new Map<number, BoardMilestone>();
      for (const task of projectTasks) {
        if (task.milestone_id === null) continue;
        milestonesById.set(task.milestone_id, {
          id: task.milestone_id,
          name: task.milestone_name ?? `Milestone ${task.milestone_id}`,
          due_date: task.milestone_due_date ?? null,
        });
      }

      const firstTask = projectTasks[0]!;
      return {
        projectId,
        projectName: firstTask.project_name,
        milestones: groupIssuesByMilestone(projectTasks, [...milestonesById.values()]).map((group) => ({
          key: `${projectId}:${group.milestoneId ?? 'none'}`,
          milestoneId: group.milestoneId,
          name: group.name,
          dueDate: group.dueDate,
          tasks: group.issues,
        })),
      };
    })
    .sort((left, right) => left.projectName.localeCompare(right.projectName, undefined, { sensitivity: 'base' })
      || left.projectId - right.projectId);
}
