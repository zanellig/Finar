CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL CHECK(`type` IN ('savings', 'checking', 'interest')),
	`balance` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'ARS' NOT NULL,
	`daily_extraction_limit` real,
	`monthly_maintenance_cost` real DEFAULT 0,
	`is_salary_account` integer DEFAULT false NOT NULL,
	`overdraft_limit` real DEFAULT 0,
	`tna_rate` real DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cc_spenditures` (
	`id` text PRIMARY KEY NOT NULL,
	`credit_card_id` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'ARS' NOT NULL CHECK(`currency` IN ('ARS', 'USD')),
	`installments` integer DEFAULT 1 NOT NULL,
	`monthly_amount` real DEFAULT 0 NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`remaining_installments` integer DEFAULT 1 NOT NULL,
	`is_paid_off` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`credit_card_id`) REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `credit_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`name` text NOT NULL,
	`spend_limit` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL CHECK(`type` IN ('bank', 'wallet', 'asset_manager')),
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`pair` text NOT NULL,
	`buy_rate` real NOT NULL,
	`sell_rate` real NOT NULL,
	`source` text DEFAULT 'blue' NOT NULL,
	`fetched_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`capital` real NOT NULL,
	`installments` integer NOT NULL,
	`cftea` real NOT NULL,
	`total_owed` real NOT NULL,
	`monthly_payment` real NOT NULL,
	`remaining_installments` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL CHECK(`type` IN ('cc', 'loan')),
	`target_id` text NOT NULL,
	`account_id` text NOT NULL,
	`amount` real NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
