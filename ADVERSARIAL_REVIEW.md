# Tangent adversarial code review

Reviewed 22 November 2026 at commit `b2976ed7dbf8e7ff0b07928171af3083e97e7184`. This report contains security, correctness, reliability, and maintainability findings. Handle the security findings privately according to [SECURITY.md](SECURITY.md).

## How to work through the findings

Every finding is open. Pick one numbered finding or subtask per change. **Ready** means the behavior is specified below. **Decision required** means the owner must settle the listed contract before implementation. Work on an independent ready item while a decision or test environment is pending.

Start with F13a for a small performance change, F17 for a small UI change, or F19 for a small backend change. F01–F04 are the highest-priority findings. Review F01/F02 together before changing account identity or recovery. Implement F07 before F08. Cover F04 before making changes that depend on issue revisions in F13c. Use the behavior tests from F08, F16, and F17 to support the refactor in F22.

### Test-driven development for every change

1. **Red.** Read the linked code and find the nearest existing test. Add the acceptance check as a focused test and run it against the current code. Confirm it fails for the described behavior. A connection error, broken fixture, or compilation error does not count as red.
2. **Green.** Make the smallest change that satisfies that check. Run the exact same test again and confirm it passes.
3. **Refactor.** Clean up the code touched by the change. Rerun the focused test and the affected suite. Update the API contract or user documentation when the behavior changes.
4. **Record the result.** Include the finding ID, test name, red and green outcomes, and any checks that could not run. If the current code already passes the acceptance check, investigate whether the finding was fixed or the test misses it before making an implementation change.

For a pure refactor such as F22, run the existing behavior checks before and after the change. Add passing characterization tests for uncovered behavior before moving code. Any intentional behavior change still starts with a failing test.

Use PHP unit tests for pure logic and the existing gateway harness with real MySQL or MariaDB for API behavior. For commit order, locking, and migration recovery, use a dedicated disposable schema and independent connections. The usual per-test transaction cannot exercise committed changes across connections. For UI state, use a browser behavior test or extract a small unit that can be exercised with controlled promises. A source-text match alone cannot establish async behavior. Use deterministic fixtures and synchronization in place of timing sleeps. Exercise integrations through the existing client seam with synthetic responses. See [development and test setup](docs/DEVELOPMENT.md#test-driven-development) and [the API test harness](tests/Support/ApiTestCase.php#L29-L59).

**Test commands.** Use `npm test` for the frontend. Use `vendor/bin/phpunit tests/Unit` for PHP unit tests. With the documented Compose environment and test databases configured, run `docker compose exec php vendor/bin/phpunit --filter TestClass::testMethod` for a focused backend check and `docker compose exec php composer test` for the suite. Substitute the actual test class and method name. Keep changes that need unavailable integration checks marked as unverified.

## Findings

### High priority

#### F01 — Accepting an invite can authenticate an existing global account

The existing-account branch links the account and issues a browser session without verifying the account password or proving control of its email address. The workspace admin who creates the invite receives the same credential that serves as proof of identity. If the invited email belongs to an account in another workspace, the resulting membership shares that account ID, which workspace switching accepts as the basis for accessing other memberships. This includes any higher-privileged membership the account already has. Existing-account invite acceptance is documented behavior, so the fix needs to change the contract as well as the implementation.

**Decision required.** Choose how Tangent verifies email ownership for new accounts and how an existing account signs in before accepting an invite. Coordinate this with F02 and F07.

1. Add a test for the identity check using the agreed contract.
2. Separate invitation validation from global authentication in `CredentialService`. Link an existing account only after the invite has been matched to its independently verified identity.
3. Create the membership and mark the invite used in the same transaction. Update the credential flow UI and API contract together.

**Acceptance.** An existing account must prove its identity before a membership is attached or a session is issued. Verified acceptance links the intended membership once. A new global identity requires the agreed email verification.

[Invite issuance](src/Modules/Auth/CredentialService.php#L38-L89) · [Existing-account acceptance and session creation](src/Modules/Auth/CredentialService.php#L183-L215) · [Workspace switching](src/Modules/Workspaces/WorkspaceService.php#L69-L96)

#### F02 — Workspace admins can reset account-wide credentials

Reset authorization checks that the caller is an admin of the workspace and the target is an active member there. The caller receives a reset credential whose scope is the global account. Redemption replaces the global password and revokes sessions and API tokens across all workspaces, including ones where the issuing admin has no membership. The API explicitly documents this behavior, but the authority to trigger it crosses the workspace trust boundary.

**Decision required.** Choose the recovery authority and delivery mechanism for global accounts. Decide how to retire outstanding links issued under the old policy.

1. Add tests for the agreed distinction between initiating recovery and authorizing a global password change.
2. Update the issuance route and UI to return only what the caller is entitled to receive. Enforce the new recovery proof in the service.
3. Keep password replacement, global token revocation, and token consumption atomic. Update operator and user documentation.

**Acceptance.** Workspace administration alone cannot authorize an account-wide password change. Recovery approved by the chosen authority succeeds once and revokes the account's sessions and API tokens.

[Reset issuance and redemption](src/Modules/Auth/CredentialService.php#L222-L277) · [Account-wide token revocation](src/Modules/Auth/TokenRepository.php#L143-L152) · [Documented reset contract](docs/openapi.yaml#L618-L623)

#### F03 — GitHub installation setup verifies the App but skips the user's GitHub authority

The completion handler accepts an installation ID from the callback query and proves only that the installation belongs to Tangent's GitHub App. The state proves that a Tangent workspace admin started a flow. Neither check establishes that the current GitHub user is authorized to connect that installation. An installation that belongs to the App and has yet to be claimed by a Tangent workspace can expose private repository metadata and pull-request details to the wrong workspace.

**Decision required.** Choose the GitHub user authorization flow and what an operator must do with existing installation associations.

1. Add service tests with a fake GitHub client for authorized and unauthorized installation association.
2. Bind setup state to the initiating Tangent session. Verify the user's GitHub authority over the installation before writing an association.
3. Enforce a single workspace owner in the persistence method and handle a concurrent claim explicitly.

**Acceptance.** The installation is associated only after the user authorization check passes. Expired or reused state is rejected, and the database retains at most one owner per installation.

[Callback input](src/Modules/GitHub/GitHubRoutes.php#L32-L38) · [State and verification](src/Modules/GitHub/GitHubService.php#L59-L86) · [App-level installation lookup](src/Modules/GitHub/GitHubAppClient.php#L22-L25)

#### F04 — Concurrent issue edits can undo sharing changes and corrupt history

The issue PATCH reads the full row before opening its write transaction, copies fields omitted by the caller from that snapshot, and rewrites those fields unconditionally. A concurrent edit can restore an older sharing state or erase a guest approval. Status history and inbox changes are also computed from the older snapshot, and the repository does not report whether the issue still existed when the write ran. The same stale-write pattern exists for project metadata, including archive status and GitHub repository assignment.

**Ready.** Split issue and project PATCH into separate changes.

1. **F04a — Issues.** Add a two-connection regression for preserving independent edits and recording status history from the effective prior state. Start the transaction before the issue read, lock the row, and derive the write and events from that locked state. Confirm the update outcome before recording events.
2. **F04b — Projects.** Add a regression for concurrent metadata and lifecycle changes. Re-read and validate current state under the write lock or use an explicit version check. Keep remote GitHub calls outside the lock and revalidate the connection before saving.

**Acceptance.** Independent changes survive. A single-field issue edit preserves a concurrently recorded approval and current sharing state. History matches actual transitions, and a skipped issue write emits no event. A project metadata edit preserves concurrent lifecycle changes or returns a conflict.

[Issue snapshot and merge](src/Modules/Issues/IssuesService.php#L287-L322) · [Issue transaction and events](src/Modules/Issues/IssuesService.php#L412-L436) · [Issue SQL](src/Modules/Issues/IssueRepository.php#L214-L245) · [Project PATCH](src/Modules/Projects/ProjectService.php#L131-L203)

### Medium priority

#### F05 — Password reset can race with an old-password login

Login verifies a previously fetched hash and then issues a session without checking that the credential is still current. A reset can commit after the old password was verified and before the session is inserted, leaving that session outside the reset's revocation. The opportunistic rehash is also unconditional, so a concurrent login that decides to rehash can replace the newly reset password.

**Ready after F02 establishes the reset contract.**

1. Add a concurrency test for an in-flight login crossing a credential change. Include the old-hash upgrade branch as a separate case.
2. Make reset and session issuance coordinate through the same account lock or credential version. Recheck the verified credential under that guarantee before issuing the session.
3. Apply the same check before persisting an upgraded hash.

**Acceptance.** After reset commits, a verification result from the old credential cannot issue a valid session or overwrite the reset credential. Normal login and opportunistic rehash still succeed.

[Login and session creation](src/Modules/Auth/AuthService.php#L60-L87) · [Password write](src/Modules/Auth/UserRepository.php#L187-L192) · [Reset transaction](src/Modules/Auth/CredentialService.php#L253-L277)

#### F06 — Archived and completed guest access cannot be revoked through the guest access editor

The editor derives both its displayed selections and its removal set from project memberships filtered to active and paused projects. Guests can still read shared items and client conversation for completed and archived projects. Setting the guest's selected project list to empty leaves those memberships in place. Relatedly, accepting a pending guest invite uses the stored project IDs without rechecking their current lifecycle state, even though invite creation only allows active or paused projects.

**Ready.** Implement revocation and invite validation as separate changes.

1. Add an API regression for removing a guest from a completed or archived project. Load all current guest memberships for display and revocation, and validate active or paused status only for additions. Update the editor to allow removing existing read-only projects.
2. Add an invite test where all selected projects become ineligible before acceptance. Revalidate project eligibility at redemption, omit ineligible grants, and roll back if a guest invite has no eligible project left.

**Acceptance.** A removed guest loses read access while retained memberships remain intact. New access is granted only to eligible projects. An invite with zero eligible projects creates no membership or session.

[Access editor](src/Modules/Projects/ProjectService.php#L254-L323) · [Membership status filter](src/Modules/Projects/ProjectRepository.php#L72-L82) · [Client-view permission](src/Modules/Projects/ClientViewService.php#L58-L66) · [Invite acceptance](src/Modules/Auth/CredentialService.php#L203-L209)

#### F07 — Users with only a secondary-workspace membership cannot sign in again

Invite acceptance creates a session for the invited workspace. After logout or expiry, login looks up that email only in the configured default workspace. An account with an active membership exclusively outside that workspace has no sign-in route back to it. This also affects users whose default-workspace membership is inactive but whose other memberships remain active.

**Ready.** Use the active default membership when available. Otherwise use the first active membership in the order already defined by `WorkspaceRepository::listForAccount`.

1. Add integration tests for secondary-only membership, an inactive default with an active secondary membership, and an account with no active memberships.
2. Authenticate against the global account, then resolve the selected active membership and issue its scoped session. Reuse the existing cookie response and failure format.
3. Update sign-in documentation and verify default-workspace users keep their existing landing behavior.

**Acceptance.** A user with an active secondary membership can sign in after logout or expiry. An account with no active memberships receives the normal credentials error.

[Default-workspace login](src/Modules/Auth/AuthService.php#L60-L67) · [Invite session scope](src/Modules/Auth/CredentialService.php#L207-L215) · [Active account memberships](src/Modules/Workspaces/WorkspaceRepository.php#L15-L25)

#### F08 — Entering a guest workspace can strand a multi-workspace user

The switch service allows an internal session to enter a guest membership and revokes the source session. From the resulting guest session, the permission allowlist denies workspace listing and switching, and the frontend skips loading the workspace selector. The account loses the ability to return to an active internal workspace through normal navigation.

**Ready after F07.**

1. Add an API test for an account with both a guest and an internal membership. Assert that the workspace list includes only the authenticated account's active memberships.
2. Allow browser sessions in either role to select among that account's active memberships. Scope the returned session to the selected role.
3. Add the workspace selector to the guest view and exercise a round trip in a UI behavior test.

**Acceptance.** The same user can switch into and out of a guest workspace. Account membership visibility and project access still follow their respective permissions.

[Switch and source-session revocation](src/Modules/Workspaces/WorkspaceService.php#L69-L96) · [Guest permission allowlist](src/Core/Permissions.php#L9-L25) · [Frontend switch flow](frontend/src/app.ts#L1160-L1173)

#### F09 — Reactivating a member restores old API tokens

Deactivation revokes browser sessions only. API tokens are rejected while the member is inactive, then become usable again on reactivation because their records were never revoked. Tokens have no expiration by default, and authentication derives privileges from the member's current role, so old deployment credentials can recover access with the reactivated role's current permissions.

**Ready.**

1. Add an integration test that creates an API token, deactivates and reactivates that membership, and checks the old token and a newly issued token.
2. Add a membership-scoped revocation method in `TokenRepository` and call it inside the existing deactivation transaction for both token types.
3. Update the member-management wording and OpenAPI description.

**Acceptance.** Old API tokens and browser sessions remain revoked after reactivation. A newly issued token works, and tokens for the account's other workspaces are unaffected.

[Deactivation and reactivation](src/Modules/Auth/AuthService.php#L183-L196) · [Session-only revocation](src/Modules/Auth/TokenRepository.php#L154-L165) · [Unexpiring API token creation](src/Modules/Auth/AuthService.php#L116-L127)

#### F10 — Chat polling can permanently skip a newly committed message

Project chat inserts the message and its inbox events in one transaction, while the reader uses a strict greater-than cursor on the auto-increment message ID. The cursor can advance past an earlier allocated ID while that message's transaction is still open. If that transaction commits after a later message has already been seen, subsequent polls cannot return the earlier message. A history reload can recover it if it is still in the recent window.

**Decision required.** Choose a commit-ordered feed cursor for a strict delivery guarantee, or document the maximum tolerated delay if using a bounded overlap. Decide how existing clients will handle the cursor.

1. Add a two-connection regression for messages committed in a different order from ID allocation.
2. Implement the selected feed contract in the repository, endpoint, and browser. Keep workspace and project visibility checks in the feed query.
3. Cover page boundaries, repeated polls, and duplicate delivery in the browser.

**Acceptance.** Within the agreed delivery contract, both committed messages are rendered once. Existing history and pagination remain usable.

[Message and inbox transaction](src/Modules/Chat/ChatService.php#L201-L207) · [Cursor query](src/Modules/Chat/ChatRepository.php#L195-L210) · [Client cursor advancement](frontend/src/app.ts#L3737-L3757)

#### F11 — Deep chat threads can exceed the database recursion limit

The bounded-write fix is implemented for project and Lounge chat. Threads support at most 32 messages, including the root, well below MySQL and MariaDB recursive-query limits. Parent ancestry and recipient discovery are bounded before a reply is inserted; attempts above the limit return a 422 validation error.

Integration coverage reads and polls a 32-message project thread, reads a legacy 33-message thread from history and events, rejects a reply to its over-depth leaf, and permits a reply on its valid root. Lounge coverage verifies nested parent persistence, readability at depth 32, and rejection at depth 33. The history and event queries still use recursive SQL so the legacy 33-message case remains readable.

**Recovery follow-up.** No root-ID storage or repair of pre-existing over-depth rows is included. A legacy chain deeper than the database recursion cap can still make history or event polling fail for a batch containing that thread. Deployments with such data need a depth scan and repair or a root-ID backfill before those reads can be guaranteed. The bounded-write fix does not close that recovery work.

**Acceptance.** Replies at the supported limit remain readable. New replies above it are rejected cleanly, and ordinary threads still load and paginate.

[Depth validation](src/Modules/Chat/ChatService.php) · [Bounded ancestry and recipient queries](src/Modules/Chat/ChatRepository.php) · [Project boundary tests](tests/Integration/ProjectChatTest.php) · [Lounge reply tests](tests/Integration/LoungeChatTest.php)

#### F12 — The inbox silently drops older unread events from view

The server returns only the newest 200 events across all states. The browser filters that slice into Unread, Mentions, All, and Done, and derives badge counts from the same slice. New done or read events can push unread items out of the UI entirely. Mark all read also updates unread events beyond that window, including events the user never saw in the list.

**Ready.** Keep Mark all read scoped to all visible unread events and make that scope explicit in the UI.

1. Add a repository test with more than 200 events and an older unread event. Add a browser or state-level test for loading subsequent pages.
2. Filter by tab state before applying the limit. Add a stable ID cursor and a separate count for tabs that show badges. Keep the existing response usable during client rollout.
3. Have the UI load the matching tab and page rather than filtering the same global slice for every tab.

**Acceptance.** Newer read or done events cannot hide older unread items. Pagination has no duplicates across pages, and counts and bulk read respect recipient and project visibility.

[Inbox query and bulk read](src/Modules/Inbox/InboxEventRepository.php#L90-L106) · [Bulk read condition](src/Modules/Inbox/InboxEventRepository.php#L128-L137) · [Client filtering and counts](frontend/src/inbox-events.ts#L36-L49)

#### F13 — Issue and task ETags save bandwidth while leaving polling work unbounded

The issue endpoints fetch and normalize all active or deleted rows, including long text and per-issue discussion counts, before checking the ETag. The browser requests both collections on every issue poll regardless of which one is displayed. Even when both return `304`, it walks both cached arrays and builds ID maps. The tasks inbox follows the same server-side pattern for assigned issues. The cost of an idle poll therefore grows with the project's active and deleted history.

**Ready.** Complete F13a, F13b, and F13c as separate changes in that order.

1. **F13a — Skip unchanged browser diffs.** Test two `304` responses and a mixed `200`/`304` response in `pollProjectIssues`. Diff only collections that contain a body. Preserve validators and deferred refresh handling.
2. **F13b — Avoid polling inactive trash.** Test that the active view makes no trash poll and that opening trash fetches it immediately. Keep refresh behavior for a displayed trash view.
3. **F13c — Short-circuit unchanged server polls.** Start with one endpoint. Add tests that an unchanged revision bypasses collection loading and that a visible field, discussion count, or scope change invalidates the revision. Advance the validator in the relevant writes and keep it scoped to the represented data. Extend this to the other issue and task endpoints in separate patches.

**Acceptance.** A `304` collection triggers no browser diff. Mixed responses update only the changed collection. A matching server revision bypasses full list materialization; relevant changes still reach the browser. Treat pagination or incremental feeds as a follow-up contract change.

[Active issue query](src/Modules/Issues/IssueRepository.php#L17-L32) · [Trash query](src/Modules/Issues/IssueRepository.php#L67-L82) · [Issue validator](src/Modules/Issues/IssuesRoutes.php#L216-L225) · [Inbox validator](src/Modules/Inbox/InboxRoutes.php#L20-L49) · [Paired browser polls and diffs](frontend/src/app.ts#L2350-L2368)

#### F14 — Failed or concurrent migrations can leave the schema stranded

The migration runner executes individual statements and records the migration only after the entire file completes. MySQL-family DDL can commit before that record exists. If an upgrade fails after adding a column, a retry can hit a duplicate-column error before reaching the failed step. The web upgrader has a filesystem lock, but the CLI bypasses it and the runner has no shared database lock.

**Decision required for recovery.** Choose how to resume databases already left in a partial state. The locking change can land independently.

1. **F14a — Locking.** Add a two-connection test, then put the lock inside `MigrationRunner` so web and CLI share it. Hold it across migration discovery and application, and release it on success and failure.
2. **F14b — Recovery.** Add tests using an interrupted multi-step migration and a previously applied schema. Implement restart-safe steps or explicit schema-state reconciliation for the agreed recovery cases.
3. Validate both fresh installation and upgrade using dedicated disposable databases.

**Acceptance.** Concurrent invocations cannot apply the same migration twice. Restarting from the covered partial state reaches the intended schema without manual edits or duplicate changes.

[Migration execution and bookkeeping](src/Core/MigrationRunner.php#L18-L52) · [Multi-step schema change](migrations/009_guest_role_client_view.sql#L18-L32) · [Web lock](src/Modules/Installer/UpgradeService.php#L27-L46) · [CLI entry point](bin/migrate.php#L8-L12)

#### F15 — Outdated GitHub links can shadow current webhook targets

The schema allows the same repository and PR number to be linked once per workspace. The webhook query picks one row with an unqualified `LIMIT 1` and the service then checks that row's installation. If a repository moves between installations and an older workspace retains a link, delivery can be applied to a retained link or discarded after inspecting it while a valid current link stays stale. Separately, the SQL timestamp guard can reject an update after the service's initial read, yet the service can still emit an inbox event for that update.

**Ready.** Split target lookup from notification correctness.

1. Add a repository test with historical and current installation associations. Filter by the delivery's verified installation and the live project connection in the query. Discard a delivery without a verified matching target.
2. Add a separate regression for an update rejected by the timestamp guard. Return the outcome of the guarded write and gate inbox creation on an accepted change.
3. Update the existing GitHub integration tests using the fake client and fixture data.

**Acceptance.** Only the current matching association is updated. Ignored stale updates emit no inbox event, and delivery deduplication still works.

[PR link uniqueness](migrations/019_github_pull_request_tracking.sql#L50-L60) · [Webhook lookup and guarded write](src/Modules/GitHub/GitHubPullRequestRepository.php#L70-L111) · [Webhook checks and notification](src/Modules/GitHub/GitHubService.php#L196-L227)

#### F16 — Late project responses can overwrite newer browser navigation

`loadProjectDetail` awaits project and milestone requests before updating shared UI state. The continuation does not check whether the user has selected another project, switched workspaces, or signed out. A slower response can replace the newer project and reopen its chat, and a stale failure can send the user back to the list. This can also leave previously authorized workspace data visible in the wrong client-side session context.

**Ready.**

1. Add UI behavior tests using deferred responses. Cover rapid project changes, stale rejection, and a completed request after sign-out.
2. Capture a navigation generation and session identity before loading. Invalidate the generation on a newer navigation or session change.
3. Guard both success and error paths before updating the DOM, history, or polling. Abort obsolete fetches where practical.

**Acceptance.** Late responses cannot change the current project, restore a signed-out view, or restart old polling. The latest request still renders and handles failures normally.

[Project navigation](frontend/src/app.ts#L5649-L5721) · [Session and view resets](frontend/src/app.ts#L1050-L1079) · [An existing request generation check](frontend/src/app.ts#L4913-L4924)

#### F17 — Failed logout is presented as a signed-out state

The frontend clears its signed-in display in a `finally` block. If the logout request fails before the server revokes the session and sends expired cookies, reopening or reloading the page can restore the session. The rejected promise is also left unhandled by the click handler.

**Ready.**

1. Add UI behavior tests for a rejected logout request, a successful logout, and an already-expired session.
2. Move `showSignedOut` out of `finally`. Transition to signed out on success or a confirmed `401` from logout. Handle connection and server errors as retryable failures.
3. Prevent duplicate submissions while pending and restore the control when retry is possible.

**Acceptance.** Failure leaves a visible retry action and no unhandled rejection. Successful logout survives reload, and a confirmed expired session returns to sign-in.

[Frontend logout](frontend/src/app.ts#L8665-L8673) · [Server revocation and cookie expiry](src/Modules/Auth/AuthRoutes.php#L51-L60)

#### F18 — The release archive inherits arbitrary files from the working directory

The release script recursively packages its selected directories from disk, regardless of whether a file is tracked or intended for distribution. A local backup or configuration artifact inside `public/` gets copied to the deployable public tree. The builder also does not verify that browser assets match the TypeScript it is releasing. A dirty or stale checkout can therefore yield a materially different release from the reviewed commit.

**Ready.**

1. Add a release smoke test in a temporary checkout with an extra local file and stale compiled assets. Inspect the resulting archive or expected build error.
2. Package from a tracked or explicit file manifest. Require verified, fresh browser output before creating the archive.
3. Validate the archive entries before publication, including the expected public rewrite file, app bootstrap, migrations, and compiled assets.

**Acceptance.** Unlisted local files are absent, stale assets cannot ship, and the archive still contains the expected install layout.

[Recursive packaging and public tree](bin/build-release.php#L43-L89) · [Release install workflow](INSTALL.md#L7-L10)

### Low priority

#### F19 — Approvals validate ongoing status outside the atomic write

The service rejects ongoing issues before it opens the write transaction. The repository rechecks sharing, deletion, cancellation, and approval state in the write predicate, but omits `is_ongoing`. A status change between validation and the write can leave an approved issue that was already ongoing when it was approved.

**Ready.**

1. Add a repository regression for the approval write against an ongoing issue, plus an ordinary approval case.
2. Add the ongoing eligibility condition to the atomic SQL predicate and keep the service's existing failure handling.
3. Verify that the service emits an inbox event only after the guarded write succeeds.

**Acceptance.** An ongoing issue cannot be approved by the repository, while an eligible shared issue still can.

[Approval preflight](src/Modules/Issues/IssuesService.php#L616-L643) · [Guarded approval SQL](src/Modules/Issues/IssueRepository.php#L609-L617)

#### F20 — Unexpected API errors disappear without a diagnostic trail

Both the gateway and public entry point catch unexpected exceptions and return a generic 500 without logging the exception. The generic response protects internal details, but operators have no application-level request ID or error record to correlate with it. Constraint errors, migration mismatches, and coding bugs are indistinguishable at the point where the application handles them.

**Ready.**

1. Add a focused test that captures the logger for an unexpected error and for a normal `ApiException`.
2. Generate a request correlation ID and include it on the generic 500 response and the matching log entry. Log unexpected failures once at the boundary that handles them.
3. Allowlist diagnostic metadata and avoid raw headers, request bodies, credential values, and user-supplied exception messages.

**Acceptance.** A generic 500 can be matched to one server log record. Expected validation failures produce no unexpected-error log, and the test confirms sensitive fixture data stays out of logs and responses.

[Gateway exception handling](src/Core/Gateway.php#L47-L55) · [Public entry point exception handling](public/index.php#L85-L92)

#### F21 — Duplicated route validation has already diverged

Nine route classes define a `positiveId` helper. Some use digit checks followed by an integer cast, while others use `FILTER_VALIDATE_INT`. They disagree on leading zeros and values outside PHP's integer range. This lets resource paths with equivalent validation requirements behave differently across the API and makes any parser correction a multi-file change. The body parser similarly treats top-level JSON arrays as valid JSON objects because it decodes to associative arrays before checking their type.

**Ready.** Treat route IDs and JSON bodies as separate changes.

1. Add table-driven tests for valid positive IDs, leading zeros, zero, and overflow. Preserve digit-only IDs with leading zeros by normalizing them before a range check, then use that parser across routes.
2. Add request tests for a JSON object, an empty object, a top-level list, and an empty body. Check the top-level JSON type before converting a valid object into the representation handlers already use.

**Acceptance.** All affected routes accept the same bounded positive ID syntax. Overflow and invalid IDs yield the normal 404. Top-level JSON lists yield the standard invalid-body response, and existing empty-body behavior remains available.

[Cast-based helper](src/Modules/Projects/ProjectRoutes.php#L82-L88) · [Range-checking helper](src/Modules/Inbox/InboxRoutes.php#L63-L68) · [JSON body parser](src/Core/Request.php#L63-L78)

#### F22 — Frontend state ownership is fragmented and many tests assert source text

The 8,713-line `app.ts` owns authentication, workspace navigation, project state, dialogs, and several polling loops. Those flows share mutable state but use different approaches to cancellation and reset. Tests such as `project-management.test.mjs` assert patterns in source text and markup. They can enforce the presence of a condition or element while missing the navigation and session races described above.

**Ready after F08, F16, and F17 supply behavior tests.** Limit the first change to navigation request ownership.

1. Run the existing race tests and add a focused test for any state transition the extraction would otherwise leave uncovered.
2. Move the navigation generation and cancellation logic into a small module. Keep DOM event bindings at their current entry points in this patch.
3. Migrate one further consumer only after the extracted code passes the same checks and demonstrably replaces duplicate logic.

**Acceptance.** Navigation and session behavior tests still pass against compiled code. The first extraction has a single owner for the affected navigation requests, with no unrelated UI changes.

[Sign-out state reset](frontend/src/app.ts#L1050-L1120) · [Polling generations](frontend/src/app.ts#L4869-L4876) · [Project management source assertions](tests/Frontend/project-management.test.mjs#L1-L28)

### Additional performance findings

#### F23 — Project chat polls process traffic from other projects

The browser polls the workspace-wide events feed for one open project and discards events for other projects. Every poll first reads every project in the workspace to build the visibility filter, even when the response is `304`. When other visible projects are busy, their events also consume slots in the 100-message response and reset this browser's polling delay to one second. A quiet project can therefore keep polling at the shortest interval due to unrelated traffic.

**Ready.** Preserve the workspace-wide feed for existing consumers and add project scope for the project chat client.

1. Add an integration test with two visible projects and an inaccessible project. Verify that traffic elsewhere does not change the quiet project's response validator and that access is checked for the requested project.
2. Add a project-scoped query and validator to the chat route used by the browser, then switch the project chat client to it.
3. Add a frontend polling test for unchanged and active project feeds.

**Acceptance.** Project chat receives only events for the open authorized project. Unrelated events cannot use its page capacity or reset its polling backoff. Existing workspace-feed clients retain their behavior.

[Workspace visibility query](src/Modules/Projects/ProjectRepository.php#L85-L99) · [Events validation and retrieval](src/Modules/Chat/ChatService.php#L155-L169) · [Response limit](src/Modules/Chat/ChatRepository.php#L195-L210) · [Browser filtering and polling delay](frontend/src/app.ts#L3737-L3762)

#### F24 — Presence cleanup runs at heartbeat frequency

Each project or Lounge heartbeat runs a deletion for rows older than one day, performs an upsert, and queries active presence. The browser schedules these heartbeats every 15 seconds while the corresponding view is active. Stale-row cleanup therefore grows with the number of active viewers, even though one-day-old rows already fall outside the 45-second active window.

**Ready.** Retain the 45-second read filter and keep the solution usable on shared hosts.

1. Add a test for cleanup eligibility using a controllable clock or explicit timestamps. Cover consecutive heartbeats and an eligible cleanup interval.
2. Throttle bounded cleanup by workspace for the Lounge and by workspace/project for project presence. Keep heartbeat upserts and presence reads on their current path.
3. Check both presence views for expired rows and cleanup after the interval elapses.

**Acceptance.** Each heartbeat refreshes active presence. Consecutive normal heartbeats do not repeatedly run cleanup, and expired rows never appear in the active roster.

[Lounge and project heartbeat queries](src/Modules/Chat/ChatRepository.php#L84-L159) · [Heartbeat intervals](frontend/src/app.ts#L892-L893)

#### F25 — Saving a GitHub repository selection repeats remote catalogue lookups

The repository picker fetches a token and enumerates pages for each connected installation. When a project is saved with a new selection, the server repeats catalogue enumeration to resolve that single repository ID. Requests run serially, with up to 20 repository pages per installation, so large installations can increase response time and occupy a PHP worker across multiple remote round trips.

**Ready for the save path.** Picker pagination can follow separately.

1. Add a fake-client test that counts requests made by a project save. Include a repository outside the authorized installation.
2. Carry the selected installation ID with the repository ID. Validate that the installation belongs to the active workspace before a targeted GitHub lookup, and verify the repository is accessible through that installation. Handle existing clients or saved settings that lack the new field.
3. Update the picker and project save contract together. Work on on-demand picker pagination only after the targeted save is covered.

**Acceptance.** Saving a selection from the updated picker does not enumerate repository-list pages. A repository unavailable through a workspace-authorized installation cannot be saved.

[Picker and save lookup](src/Modules/GitHub/GitHubService.php#L34-L49) · [Repository resolution](src/Modules/GitHub/GitHubService.php#L89-L101) · [Serial remote pagination](src/Modules/GitHub/GitHubAppClient.php#L27-L53) · [Project save call site](src/Modules/Projects/ProjectService.php#L166-L175)

## Verification and limits

- Reviewed the application PHP, TypeScript, SQL migrations, test harness, and deployment and release paths. Findings are based on source inspection. Timing-dependent behavior and environment-specific effects remain unverified at runtime.
- Frontend TypeScript compiled successfully, and a clean build in a temporary directory matched the checked-in JavaScript byte for byte. All 246 frontend tests passed.
- PHP unit tests passed with 40 tests and 154 assertions. The full PHPUnit run reported 103 integration setup errors because it could not connect to the test database. Docker daemon access was denied, and the available PHP 8.5.4 runtime is outside Tangent's declared support range. Validation against a supported PHP and database combination remains outstanding.
- The performance findings describe work visible in the request paths. Latency, database query plans, and throughput were not measured.
