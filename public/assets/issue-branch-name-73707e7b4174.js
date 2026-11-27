export function issueBranchName(issueId, title) {
    const slug = title
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/g, '');
    return `tangent/issue-${issueId}${slug === '' ? '' : `-${slug}`}`;
}
