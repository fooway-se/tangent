ALTER TABLE issue_pull_requests
    ADD KEY ix_issue_pull_requests_webhook (github_repository_id, pull_number);
