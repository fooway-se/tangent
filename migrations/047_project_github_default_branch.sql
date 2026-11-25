ALTER TABLE projects
    ADD COLUMN github_repository_default_branch VARCHAR(255) NULL AFTER github_repository_url;
