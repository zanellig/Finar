import { getDb } from "../db/database";

export function getDashboardRoutes() {
  return {
    "/api/dashboard": {
      GET: () => {
        const db = getDb();

        // Net worth: sum of all account balances
        const netWorthResult = db
          .query("SELECT COALESCE(SUM(balance), 0) as net_worth FROM accounts")
          .get() as any;

        // Total debt: sum of remaining loan amounts + CC spenditures
        const loanDebt = db
          .query(
            `SELECT COALESCE(SUM(monthly_payment * remaining_installments), 0) as total
             FROM loans WHERE remaining_installments > 0`,
          )
          .get() as any;

        const ccDebt = db
          .query(
            `SELECT COALESCE(SUM(monthly_amount * remaining_installments), 0) as total
             FROM cc_spenditures WHERE is_paid_off = 0`,
          )
          .get() as any;

        // Monthly obligations: loan payments + CC minimum payments
        const monthlyLoanPayments = db
          .query(
            `SELECT COALESCE(SUM(monthly_payment), 0) as total
             FROM loans WHERE remaining_installments > 0`,
          )
          .get() as any;

        const monthlyCCPayments = db
          .query(
            `SELECT COALESCE(SUM(monthly_amount), 0) as total
             FROM cc_spenditures WHERE is_paid_off = 0 AND remaining_installments > 0`,
          )
          .get() as any;

        // Accounts breakdown
        const accounts = db
          .query(
            `SELECT a.id, a.name, a.type, a.balance, a.currency, a.tna_rate, e.name as entity_name
             FROM accounts a JOIN entities e ON a.entity_id = e.id
             ORDER BY a.balance DESC`,
          )
          .all();

        // Entities summary
        const entities = db
          .query(
            `SELECT e.*, 
             (SELECT COUNT(*) FROM accounts WHERE entity_id = e.id) as account_count,
             (SELECT COUNT(*) FROM loans WHERE entity_id = e.id) as loan_count,
             (SELECT COUNT(*) FROM credit_cards WHERE entity_id = e.id) as card_count
             FROM entities e ORDER BY e.name ASC`,
          )
          .all();

        // Active loans
        const loans = db
          .query(
            `SELECT l.*, e.name as entity_name
             FROM loans l JOIN entities e ON l.entity_id = e.id
             WHERE l.remaining_installments > 0
             ORDER BY l.monthly_payment DESC`,
          )
          .all();

        // Credit cards with available limits
        const creditCards = db
          .query(
            `SELECT cc.*, e.name as entity_name
             FROM credit_cards cc JOIN entities e ON cc.entity_id = e.id
             ORDER BY cc.spend_limit DESC`,
          )
          .all();

        const cardsWithLimits = (creditCards as any[]).map((card) => {
          const spent = db
            .query(
              `SELECT COALESCE(SUM(total_amount), 0) as total
               FROM cc_spenditures WHERE credit_card_id = $cardId AND is_paid_off = 0`,
            )
            .get({ cardId: card.id }) as any;
          return {
            ...card,
            total_spent: spent?.total || 0,
            available_limit: card.spend_limit - (spent?.total || 0),
          };
        });

        // Recent payments
        const recentPayments = db
          .query(
            `SELECT p.*, a.name as account_name
             FROM payments p JOIN accounts a ON p.account_id = a.id
             ORDER BY p.created_at DESC LIMIT 10`,
          )
          .all();

        // Exchange rates
        const rates = db
          .query("SELECT * FROM exchange_rates ORDER BY source ASC")
          .all();

        return Response.json({
          net_worth: netWorthResult.net_worth,
          total_debt: loanDebt.total + ccDebt.total,
          monthly_obligations:
            monthlyLoanPayments.total + monthlyCCPayments.total,
          loan_debt: loanDebt.total,
          cc_debt: ccDebt.total,
          monthly_loan_payments: monthlyLoanPayments.total,
          monthly_cc_payments: monthlyCCPayments.total,
          accounts,
          entities,
          loans,
          credit_cards: cardsWithLimits,
          recent_payments: recentPayments,
          exchange_rates: rates,
        });
      },
    },
  };
}
