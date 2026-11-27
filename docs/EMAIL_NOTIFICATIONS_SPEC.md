# Email notification summaries

**Status:** Implemented MVP. The recommended defaults below are in effect.

## Goal

Help workspace admins notice important project situations that still need attention, without sending an email for every activity event.

## Product rules

- Send summaries only. Do not send one email per issue or chat event.
- Email is opt-in for each active workspace admin. An admin manages only their own subscription in the current workspace.
- Send a summary only when it contains at least one qualifying item.
- Group items by project. Keep the email short and show how long each item has been waiting.
- Repeating an unresolved item is expected; its age must continue from the original wait period so it is not presented as new activity.
- Link to the relevant conversation or issue. Do not include a message excerpt in email.

## Recommended MVP scope

### Included: unanswered customer conversation

- A conversation is a project-chat thread rooted in a client-visible message. Treat the root and its replies as one item, even if the customer sends several messages.
- The item qualifies when the latest message in the thread was written by a guest and is at least **24 elapsed hours old**. This threshold includes weekends and public holidays.
- A reply from an active team member clears the item. If the customer posts again afterward, the wait period starts from that latest customer message.
- Include conversations from active projects only.
- Show the project, conversation link, and elapsed wait time. Do not include message text.

### Included: blocked issue

- Add blocking as a marker independent of workflow status. Blocking does not add a new issue status; an issue may be blocked while in Backlog, Todo, Doing, or Testing.
- A blocked issue qualifies after it has remained blocked for **72 elapsed hours**.
- An optional short blocking reason may be shown in the email.
- Unblocking clears the item. Marking it blocked again starts a new 72-hour wait period.
- Exclude Done, Cancelled, deleted, and archived-project issues.
- Show the project, issue link, and time blocked.

### Excluded from MVP

- Invitation acceptance. It is informational and does not necessarily need action.
- Per-event emails, developer or guest subscriptions, cross-workspace digests, and per-category subscription controls.

## Subscription and delivery

- Place settings under **Workspace admin → Notifications**.
- Each active admin can enable or disable only their own subscription for the current workspace.
- When enabled, the admin chooses **Daily**, **Every other day**, or **Weekly**. The default is opted out; selecting Daily is the default frequency when opting in.
- The admin can select an IANA time zone. Default to UTC; send at **09:00 in the selected time zone**.
- Daily means every local calendar day. Every other day means every two local calendar days, anchored to the date the admin enabled that frequency. Weekly means Monday. The first email is sent at the next scheduled slot; enabling a subscription does not send immediately.
- A missed scheduler run produces at most one current summary at the next run. Do not send a backlog of missed summaries. Changing frequency or time zone takes effect at the next future slot under the new setting.
- If a due slot has no qualifying items, send nothing and advance to the next slot.
- If delivery fails, leave the slot retryable on the next scheduler run. Record the slot as sent only when the configured mailer reports success.

## Email content

- Subject identifies the workspace and that the message is a notification summary.
- Body starts with a short explanation and groups qualifying items under project names, with a link and waiting age for every item.
- Include a link to the admin's notification settings so they can change frequency or opt out.
- Use the existing plain-text mail transport and configured sender address.

## Access and data rules

- Store preferences per `(workspace_id, user_id)`; do not let one admin change another admin's setting.
- Send only to active admins who opted in for that workspace. Developers, guests, inactive members, and users who are no longer admins receive no summary.
- Scope every lookup and delivery record to the workspace. Do not combine items across workspaces, even when the same account administers several.
- Build links to the existing authenticated project conversation or issue views; normal API permission checks remain authoritative when a link is opened.
- Do not store email bodies or customer message text in the delivery record.

## Scheduling and implementation constraints

- Use the existing `Mailer`/`NativeMailer` path and its configured `mail.from` value. No runtime package or external mail service is required by this spec.
- Provide a PHP CLI command that the self-hosting operator can invoke from cron. Run it hourly so a delayed run can pick up due subscriptions without a long-running worker.
- For hosts that cannot schedule PHP CLI commands, provide an optional HTTP trigger enabled in private config. It must require a dedicated bearer token, store only the token hash, use the same serialized runner, and remain disabled by default.
- Make the runner safe against overlapping invocations and duplicate sends for the same recipient and scheduled slot. Persist enough per-subscription schedule and delivery state to retry a failed send and prevent a successful send from repeating.
- Keep business logic in the owning modules and use public module APIs across module boundaries. All preference and item queries must be tenant-scoped and use prepared statements.
- The blocked marker needs a migration and issue API/UI support. The customer-conversation item should use existing client visibility and thread data.

## Acceptance criteria

1. A workspace admin can opt in, opt out, select a frequency and time zone, and see only their own settings.
2. Changing one admin's settings has no effect on any other admin or workspace.
3. Only unanswered client-visible threads meeting the 24-hour rule and blocked, non-terminal issues meeting the 72-hour rule appear.
4. Team replies, unblocking, terminal issue status, deletion, or project archival remove the corresponding item from later summaries.
5. Unresolved items may appear in later summaries with their continuing wait age; customer messages or a new blocking period do not appear as a fresh item until their threshold is met.
6. Items are grouped by project and link to the relevant conversation or issue. The email contains no message excerpt.
7. No email is sent for an empty summary. A successful delivery is not repeated for the same scheduled slot, including when cron runs concurrently.
8. Failed delivery remains retryable, and a delayed cron run sends at most one current summary rather than multiple historical emails.
9. Only opted-in, active workspace admins receive email. Guests, developers, inactive members, and former admins do not.

## Decisions in effect

The MVP includes unanswered customer conversations and blocked issues; uses 24-hour and 72-hour elapsed-time thresholds; repeats unresolved items with their continuing age; excludes invitation acceptance; and sends at 09:00 in each admin's selected time zone. These defaults resolve the candidate choices in the discussion draft.
