# Issues and AI prompts

Issues can be created from the project issue list or from a chat message. An issue created from chat keeps a link to its source thread. Issue details include status, priority, due date, type, assignee, milestone, description, and an issue discussion.

Issue statuses are **Backlog**, **Todo**, **Doing**, **Testing**, **Done**, and **Cancelled**. Move an issue to **Testing** when implementation is ready for verification; move it to **Done** after it passes.

Milestones can be archived at any point, including while work is unfinished. Archived milestones and their issues move out of **Current work** and remain available in **History**. Restore a milestone to return it and its issues to the active board; archiving does not change issue statuses or client-visible history.

## Quick-add issues

Enter a title in the issue quick-add field. You can add priority and due date tokens directly to the title:

```text
Fix the upload timeout priority:urgent due:2026-12-02
```

Supported priority values are `low`, `medium`, `high`, and `urgent`. Due dates use `YYYY-MM-DD`. The tokens are removed from the saved title and applied to the issue. Open **Details** for the description and other issue fields.

## Prepare an AI prompt

Open an issue and choose **Prepare AI prompt**. The guided flow asks about:

1. **Context:** relevant background, existing behavior, and constraints to preserve.
2. **Expected outcome:** what someone should be able to observe when the work is complete.
3. **Acceptance criteria:** specific outcomes that can be verified, one per line.

All three sections are optional. Leave an answer blank or skip to the preview. The preview combines the issue details with any prompt context you entered.

From the preview you can:

- **Save context** on the issue to reuse it later. Saved context appears in a collapsed section on the issue detail page.
- **Copy prompt** for a coding assistant.
- **Copy Markdown** or **Download Markdown** for a portable issue description. Acceptance criteria are formatted as unchecked checklist items.

The builder assembles text in the browser. Tangent does not send the issue to an AI service.

The prompt context does not affect issue creation or tracking. To update it later, reopen **Prepare AI prompt**; it is separate from the ordinary issue edit form.

For the API fields and limits, see the [OpenAPI description](openapi.yaml).
