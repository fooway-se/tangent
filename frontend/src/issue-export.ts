export interface IssueExportData {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string | null;
  type: string;
  context: string;
  expected_outcome: string;
  acceptance_criteria: string;
}

const statusLabels: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  doing: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

function label(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function content(value: string): string {
  return value.trim().replace(/\r\n?/g, '\n');
}

function sections(issue: IssueExportData): string[] {
  const result: string[] = [];
  const description = content(issue.description);
  const context = content(issue.context);
  const outcome = content(issue.expected_outcome);
  const criteria = content(issue.acceptance_criteria);

  if (description !== '') result.push(`## Description\n${description}`);
  if (context !== '') result.push(`## Context\n${context}`);
  if (outcome !== '') result.push(`## Expected outcome\n${outcome}`);
  if (criteria !== '') {
    const checklist = criteria.split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .map((line) => `- [ ] ${line.replace(/^(?:[-*+]\s+)?(?:\[[ xX]\]\s*)?/, '')}`)
      .join('\n');
    if (checklist !== '') result.push(`## Acceptance criteria\n${checklist}`);
  }

  return result;
}

export function formatIssueMarkdown(issue: IssueExportData): string {
  const title = content(issue.title).replace(/\n+/g, ' ');
  const metadata = [
    `- Status: ${statusLabels[issue.status] ?? label(issue.status)}`,
    `- Priority: ${label(issue.priority)}`,
    `- Type: ${label(issue.type)}`,
  ];
  if (issue.due_date !== null) metadata.push(`- Due date: ${issue.due_date}`);

  return [
    `# Issue #${issue.id}: ${title}`,
    metadata.join('\n'),
    ...sections(issue),
  ].join('\n\n');
}

export function formatIssuePrompt(issue: IssueExportData): string {
  return [
    'Implement this issue in the current codebase. Treat the acceptance criteria as required outcomes. Inspect the relevant implementation and tests, make the necessary changes, and run relevant tests.',
    formatIssueMarkdown(issue),
  ].join('\n\n');
}
