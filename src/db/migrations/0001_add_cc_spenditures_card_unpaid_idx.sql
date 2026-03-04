CREATE INDEX IF NOT EXISTS `idx_cc_spenditures_card_unpaid` ON `cc_spenditures` (`credit_card_id`, `is_paid_off`);
