-- Phase 1: Add column as nullable so existing rows are not rejected.
ALTER TABLE `cc_spenditures` ADD `due_date` text;--> statement-breakpoint
-- Phase 2: Backfill existing rows with a safe default derived from created_at.
UPDATE `cc_spenditures` SET `due_date` = date(`created_at`) WHERE `due_date` IS NULL;