ALTER TABLE issues
    ADD COLUMN context TEXT NULL AFTER description,
    ADD COLUMN expected_outcome TEXT NULL AFTER context,
    ADD COLUMN acceptance_criteria TEXT NULL AFTER expected_outcome;
