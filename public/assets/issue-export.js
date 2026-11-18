const statusLabels = {
    backlog: 'Backlog',
    todo: 'To do',
    doing: 'In progress',
    testing: 'Testing',
    done: 'Done',
    cancelled: 'Cancelled',
};
function label(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
function content(value) {
    return value.trim().replace(/\r\n?/g, '\n');
}
function sections(issue) {
    const result = [];
    const description = content(issue.description);
    const context = content(issue.context);
    const outcome = content(issue.expected_outcome);
    const criteria = content(issue.acceptance_criteria);
    if (description !== '')
        result.push(`## Description\n${description}`);
    if (context !== '')
        result.push(`## Context\n${context}`);
    if (outcome !== '')
        result.push(`## Expected outcome\n${outcome}`);
    if (criteria !== '') {
        const checklist = criteria.split('\n')
            .map((line) => line.trim())
            .filter((line) => line !== '')
            .map((line) => `- [ ] ${line.replace(/^(?:[-*+]\s+)?(?:\[[ xX]\]\s*)?/, '')}`)
            .join('\n');
        if (checklist !== '')
            result.push(`## Acceptance criteria\n${checklist}`);
    }
    return result;
}
export function formatIssueMarkdown(issue) {
    const title = content(issue.title).replace(/\n+/g, ' ');
    const metadata = [
        `- Status: ${statusLabels[issue.status] ?? label(issue.status)}`,
        `- Priority: ${label(issue.priority)}`,
        `- Type: ${label(issue.type)}`,
    ];
    if (issue.due_date !== null)
        metadata.push(`- Due date: ${issue.due_date}`);
    return [
        `# Issue #${issue.id}: ${title}`,
        metadata.join('\n'),
        ...sections(issue),
    ].join('\n\n');
}
export function formatIssuePrompt(issue) {
    return [
        [
            'Implement this issue in the current codebase.',
            '',
            '## Working approach',
            `- Inspect the relevant code and tests, then follow the project's conventions.`,
            '- Use TDD: add or update a test for the desired behavior, verify it fails when practical, implement the change, and run the relevant tests.',
            '- Treat the acceptance criteria as required outcomes.',
            '',
            '## Completion report',
            'Summarize the changes and test results.',
        ].join('\n'),
        formatIssueMarkdown(issue),
    ].join('\n\n');
}
