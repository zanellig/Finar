CREATE TABLE `paycheck_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`paycheck_id` text NOT NULL,
	`run_at` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`account_balance_before` real NOT NULL,
	`account_balance_after` real NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text NOT NULL,
	`failure_reason` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`paycheck_id`) REFERENCES `paychecks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_paycheck_runs_paycheck_run_at` ON `paycheck_runs` (`paycheck_id`,`run_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_paycheck_runs_idempotency_key` ON `paycheck_runs` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `paychecks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`account_id` text NOT NULL,
	`currency` text NOT NULL,
	`amount` real NOT NULL,
	`frequency` text NOT NULL,
	`next_run_at` text NOT NULL,
	`last_run_at` text,
	`is_active` integer DEFAULT true NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_paychecks_account` ON `paychecks` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_paychecks_active_next_run` ON `paychecks` (`is_active`,`next_run_at`);