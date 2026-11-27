# Tangent User Manual

**Practical guide for project teams and guests**

Projects, chat, issues, milestones, My Work, roadmap, notes, and the client portal.

This manual describes the current Tangent interface. Some controls depend on your workspace role and project access.

## Contents

1. [Getting started](#1-getting-started)
2. [Workspace navigation](#2-workspace-navigation)
3. [Project chat and the Lounge](#3-project-chat-and-the-lounge)
4. [Issues](#4-issues)
5. [Milestones and the team roadmap](#5-milestones-and-the-team-roadmap)
6. [My Work](#6-my-work)
7. [Project Notes](#7-project-notes)
8. [The client portal](#8-the-client-portal)
9. [Workspace administration](#9-workspace-administration)
10. [Keyboard shortcuts](#10-keyboard-shortcuts)
11. [A simple team workflow](#11-a-simple-team-workflow)

## 1. Getting started

Tangent brings project conversation, issue tracking, planning, and client updates into one workspace. After signing in, internal team members use the workspace view. Invited guests use the separate client portal.

| Access type | Typical use |
| --- | --- |
| Admin | Manage workspace members, invites, projects, and guest access. Admins can also work in projects. |
| Developer | Work in projects you belong to: chat, issues, milestones, My Work, and the internal roadmap. |
| Guest | View assigned projects in the client portal, comment, and approve requests. Guests do not use internal workspace tools. |

### Sign in and choose a workspace

- Sign in opens your active default workspace when you belong to it. If that membership is inactive or missing, Tangent opens the first active workspace by name. You need an active membership in at least one workspace.
- Open the invitation link Tangent emails to your invited address. If you are new to Tangent, choose a password; if you already have an account, enter its current password to join the workspace.
- If your account belongs to more than one workspace, use the workspace picker at the top of the sidebar to switch.
- If **New project** is available to your role, select it from **Projects**, enter a name and optional description, then create the project.
- Choose a project from the **Projects** page or the project list in the sidebar. Your available projects depend on membership and access.
- Use the theme selector in the sidebar to change the appearance in this browser.
- The selector offers 30 machine-inspired themes. Recent additions are **PET & Phosphor** (Commodore PET 2001), **Membrane & Gold** (Atari 400), **White & Inverse** (Sinclair ZX80), and **Keys & Cartridge** (Sord M5). Other choices include **Switches & Steel** (Altair 8800), **Studio & Sound** (Atari ST), **Arcade & Towers** (Sharp X68000), **Kana & Keycaps** (NEC PC-8801), **Beehive & Beige** (Microbee), **Daisy & Data Pack** (Coleco ADAM), **Ivory & Ink** (Jupiter Ace), **Chroma & Charcoal** (Oric-1), **Wedge & Raster** (Dragon 32), **Color BASIC & RGB** (TRS-80 Color Computer 2), and **Ivory & Assembly** (Acorn Atom). **Clean** and **Clean (dark)** are the final two options, for 32 themes total.

> **Guest access:** Guests sign in to the client portal, which shows only the projects and shared information they have been granted access to.

## 2. Workspace navigation

The workspace sidebar is the main way to move between areas.

| Area | What you will find |
| --- | --- |
| Projects | Project list, project issues, chat, members, and Notes. |
| Roadmap | Milestones across accessible projects with progress and deadline signals. Internal team only. |
| My Work | Inbox updates and open issues assigned to you. |
| Scratchpad | One private quick note that saves when closed. |
| Lounge | Workspace-wide off-topic conversation for internal team members. |
| Workspace admin | For admins: members, invitations, coding agents, and workspaces. |

Open **Scratchpad** from workspace navigation, choose **Open Scratchpad** in the command palette, or press **g**, then **q**. Type a thought; close Scratchpad to save the note. It stays private to you in the current workspace.

Within a project, use the **Issues**, **Members**, and **Notes** tabs. Project chat is shown with project work on wide screens; on smaller screens, use the project navigation controls to focus Chat.

Project states include **Active**, **Paused**, **Completed**, and **Archived**. Completed and archived projects remain visible but are read-only; an admin can reopen or restore them.

> **Keep project context in the project:** Use project Notes for durable decisions, setup steps, and links. Use chat for conversation and issue discussion for work attached to a specific issue.

## 3. Project chat and the Lounge

Project chat keeps team conversation close to the work. Select a project to open its chat, then use the composer to send a message.

- Reply to a message to keep a discussion in a thread. Replies stay with their parent message.
- Threads support up to 32 messages, including the root message.
- Type `@` followed by a member name to mention someone. Select the matching suggestion to insert the mention and notify that person.
- The small presence indicator shows that another authorized viewer is active. It does not show names or a count. While the project chat is hidden (`b`), the indicator moves to the right end of the top bar so you can still see it.
- Select a chat message and create an issue from it when the message describes work to track. The issue keeps a link back to the source thread.
- Use the Lounge for workspace-wide off-topic conversation. It is internal and is not part of the client portal.

> **Guest conversations:** Guests write through the client portal. Their comments and replies in guest-visible threads are shown there; unrelated internal project chat stays private.

Press **Enter** to send from a message composer. Use **Shift+Enter** to add a new line.

## 4. Issues

Issues are the team's trackable work items. They can come from quick-add, a project chat message, or an existing issue discussion.

### Create an issue

- In a project, type a title in the **Add an issue** field and press **Enter**. Open **Details** to enter a description or set priority, due date, type, assignee, milestone, ongoing work, or guest sharing.
- You can enter supported values in the title itself. Tangent removes recognized tokens from the saved title and fills the matching fields.

| Token | Example |
| --- | --- |
| Priority | `priority:urgent` |
| Due date | `due:2026-12-02` |
| Type | `type:bug`, `type:feature`, or `type:maintenance` |
| Assignee | `@Mira` |
| Milestone | `milestone:"Beta launch"` |

Example title:

```text
Fix upload timeout type:bug priority:urgent due:2026-12-02 @Mira milestone:"Beta launch"
```

### Statuses

| Status | Use it when |
| --- | --- |
| Backlog | The issue is recorded but not yet selected for active work. |
| Todo | The issue is ready to start. |
| Doing | Someone is actively working on it. |
| Testing | Implementation is ready for verification. |
| Done | The work has passed verification. |
| Cancelled | The work is no longer needed. |

Open the status picker from an issue row or issue details to change status. Statuses are changed through the picker, not by dragging issues.

### Find and organize issues

- Filter by title, identifier, description, priority, due date, type, or assignee.
- Group by **Status** for a workflow view, or by **Milestone** to see planned delivery groups. Choose an order such as Updated, Priority, or Next up.
- Choose **Current work** or **History**. Archived milestone work is kept in History. Deleted issues appear in a separate list and can be restored.
- A share icon below an issue's status marker means it is shared with guests. To share or unshare several issues, choose **Select issues**, select up to 500 issues, and choose **Share** or **Unshare** in **Guest access**.
- For unassigned issues, use **Select issues** in **No milestone**, select several issues, choose an active milestone, and select **Move selected**. Up to 500 issues can be moved together.

> **Ongoing work:** Use Ongoing work for recurring or continuous tasks that do not finish with a milestone. These issues have a separate group, do not count toward planned progress, cannot be assigned to a milestone, and cannot be marked Done. Clear the Ongoing work setting before completing the issue. Ongoing issues remain internal and do not appear in the guest portal.

### Issue details and discussion

- Open an issue title to view its description, status history, discussion, and any link to its source chat thread.
- Use **Edit issue** to change fields. Use the discussion area for decisions and updates tied to that issue; reply to a discussion message to keep context in a thread.
- A small robot icon before an author name marks a message posted by a coding agent.
- Use **Prepare AI prompt** to enter context, expected outcome, and acceptance criteria. The preview can be copied or exported as Markdown. Tangent assembles this prompt in your browser and does not send the issue to an AI service.
- If GitHub is connected to the project, copy a branch name from the issue. Tangent automatically links a pull request opened from that branch; use **Link pull request** for a PR from another branch. Linked pull requests show recent CI check runs and their status. Commits pushed to the generated branch appear on the issue and send an internal inbox update. Guests do not see GitHub activity. Linking a pull request does not change the Tangent issue status.

## 5. Milestones and the team roadmap

Milestones group delivery work within a project. They can have an optional due date and can be archived when work is paused or moved out of current planning.

### Manage project milestones

- Select **Milestones** in the project progress area to add a milestone and optional due date, edit it, archive it, or restore it from History.
- Group the issue board by **Milestone** to see each milestone's issues and progress. Unplanned issues remain in **No milestone**; ongoing issues appear in **Ongoing**.
- Deleting a milestone clears its issue references. If the milestone should remain available for historical context, archive it instead.

Use the **Roadmap** page for a cross-project view of milestones visible to your account. It summarizes how many milestones remain and are complete, and highlights deadline status.

| Roadmap signal | Meaning |
| --- | --- |
| Complete | All planned, non-cancelled work in the milestone is done. |
| Missed deadline | The milestone is unfinished and its due date has passed. |
| Due soon | The due date is within seven days, without the workload condition for Needs attention. |
| Needs attention | A rough workload signal: the deadline is within seven days and work is unassigned to an active internal team member, or remaining work exceeds the team load threshold. |
| Upcoming / In progress / No deadline | Other milestone states based on due date and whether any work is complete. |

> **Treat Needs attention as a prompt to review:** It is a simple date-and-workload heuristic, not a delivery forecast. Check the milestone and its tasks with the team.

## 6. My Work

Open **My Work** from the workspace navigation. The **Inbox** tab is selected first.

| Tab | Purpose |
| --- | --- |
| Inbox | Mentions and project updates such as assignments, replies, status changes, and linked pull-request activity. Use the filters to focus on an update type or unread items. |
| Tasks | Open issues assigned to you across projects you can access. Tasks are grouped first by project, then by milestone, Ongoing, or No milestone. |

Tasks shows **Backlog**, **Todo**, **Doing**, and **Testing** issues. **Done** and **Cancelled** issues are not listed. My Work does not define a sprint; use project milestones to group sprint-sized work if your team uses them.

> **Inbox items are personal:** The Inbox is recipient-scoped. You see events addressed to you, not a shared workspace-wide notification feed.

## 7. Project Notes

Each project has one shared Markdown Notes page for durable team knowledge such as decisions, setup instructions, and useful links.

- Open a project and choose **Notes**.
- Choose **Write** to edit Markdown. Choose **Preview** to inspect the rendered version.
- Select **Save notes** to save your changes.

> **Internal team only:** Project Notes are not visible in the guest portal. Keep client-facing updates in shared issues or the guest conversation.

## 8. The client portal

Guests see a separate, read-only project overview with limited actions. The project selector appears when the guest has access to more than one project.

- The overview shows project progress, milestones, shared items, recent updates, and any approvals requested by the team.
- A guest can approve a shared issue when the team has requested approval for it.
- A guest can add a comment to the client conversation. Replies in that guest-visible thread remain visible in the portal.
- Guests do not see internal issues, ongoing issues, project Notes, the internal team roadmap, My Work, the Lounge, or ordinary project chat.
- From a project, workspace admins can open the command palette with **Ctrl/Cmd+K** and choose **Preview guest view** to inspect the portal as a guest sees it. If several guests have access, use **Preview as** to select whose conversation perspective to preview. The preview is read-only: approval and comment actions are disabled. Choose **Back to project** or press **Esc** to return.
- From a project, workspace admins can open the command palette with **Ctrl/Cmd+K** and choose **Generate summary**. Choose the last 7 days, last 30 days, or a custom date range; the range filters the client-visible issue status changes. The summary also includes the current shared project status and progress, the next milestone, and any approvals awaiting client input. Review and edit the generated text, then copy it.

> **Share deliberately:** For an issue to appear in the portal, an internal team member must share it with the guest. The portal does not expose internal issue fields or ongoing-work classification.

## 9. Workspace administration

Workspace admins use **Workspace admin** to manage members, invitations, coding agents, workspaces, and personal notification settings.

- Create an invite, choose **Developer** or **Guest**, and send it. Tangent emails a single-use link to the invited address; the link expires after seven days. Guest invites require at least one project to be selected.
- Use **Resend invite** to email a replacement link. This invalidates the previous link.
- Manage existing members and guest project access from the Members area. An account can be a member of more than one workspace.
- Use Agents to create coding-agent identities with access limited to selected active or paused projects and issue capabilities. The raw token appears once at creation or rotation; copy it to the agent's secret store before closing the dialog. The list shows each agent's grants and token activity. To change its grants, revoke the identity and create a replacement.
- Use Workspaces to create a separate workspace for another client, then switch to it from the workspace picker.
- Open **Notifications** to opt in to email summaries, choose Daily, Every other day, or Weekly, and set an IANA time zone. Summaries are scheduled for 09:00 in that zone and include unanswered guest conversations at least 24 hours old and issues blocked for at least 72 hours. Team replies, unblocking, terminal issue status, deletion, and archived projects clear the matching item. An unresolved item can appear in later summaries with its original waiting age. Each admin manages only their own subscription in the current workspace; subscriptions start opted out.

In an issue's detail view, workspace members can mark the issue **Blocked** and optionally enter a short reason. Blocking is independent of the issue's workflow status. Unblocking clears the current blocked period and reason; marking it blocked again starts a new period.

See [Coding agent access](AGENTS.md) for the available capabilities and REST API usage, and [MCP adapter setup](../tools/agent-mcp/README.md) for connecting a coding-agent host. The adapter's `list_projects` tool returns the project IDs and names granted to that agent, while `get_issue_prompt` returns the browser's copy-ready prompt from saved issue details and context.

> **Invite safety:** Tangent sends the single-use link to the address entered by the admin. Existing accounts must prove their identity with their current password.

## 10. Keyboard shortcuts

Keyboard shortcuts vary by view and pause while you type. In a member workspace, press **?** for the full list. Use **Ctrl/Cmd+K** to open the command palette. On short desktop windows (560 px high or less), hints start hidden to leave room for project links; press **h** to show or hide the compact row for the current layout. In taller desktop layouts, press **h** or choose the hint command in the palette; that preference is saved in this browser. Hints remain hidden on narrow or touch layouts. Guests can use **t** for the theme selector and **g**, then **w** to switch between workspaces when they belong to more than one.

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd+K | Open the command palette. |
| ? | Open keyboard shortcut help. |
| h | Show or hide keyboard hints. |
| b | In a project, show or hide the project chat panel. |
| g, then p / r / n / q / l | In a member workspace, open Projects / Roadmap / My Work / Scratchpad / Lounge. |
| g, then w | When you belong to multiple workspaces, open the workspace picker. |
| g, then i / c / m | In a project, focus Issues / Chat / Members. |
| / | Focus the issue filter. |
| c | Create an issue in the open project. |
| e | Edit the selected issue. |
| s | Open the selected issue's status picker. |
| j/k or Up/Down | Move through the focused list or messages. |
| Shift+Enter | Insert a new line in chat, discussion, or a description. |
| Esc | Close a dialog or leave the current field/view according to context. |

When a chat or discussion message is selected, **r** starts a reply. When a chat message is selected, **i** can create an issue from it. The selected item and current focus determine which shortcut is available.

## 11. A simple team workflow

1. Create a project and add the internal team members who will work in it.
2. Create milestones for deliverable-sized groups of work. Give them due dates when the team has agreed a target.
3. Capture new tasks from chat or quick-add. Use priorities, assignees, and due dates where they help the team decide what to do next.
4. Use Ongoing work for recurring project-wide work; keep delivery work in milestones.
5. Review My Work for personal assignments and Inbox updates. Review the roadmap with the team to spot overdue dates and upcoming workload.
6. Keep lasting decisions in project Notes. Share only the client-facing issues guests need, and use the client conversation for guest questions.

**Need more detail?** See [Issues and AI prompt builder](ISSUES.md), [GitHub pull-request tracking](GITHUB.md), and [Installation](../INSTALL.md).
