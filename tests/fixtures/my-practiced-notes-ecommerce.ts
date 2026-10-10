import type { PracticeQuestionContent, PracticeTable } from "../../src/types/sql-practice.js";

export const ecommerceTables: PracticeTable[] = [
  {
    name: "customers",
    columns: [
      { name: "customer_id", type: "INTEGER" },
      { name: "customer_name", type: "TEXT" },
    ],
    rows: [
      { customer_id: 1, customer_name: "Ava" },
      { customer_id: 2, customer_name: "Ben" },
      { customer_id: 3, customer_name: "Cleo" },
      { customer_id: 4, customer_name: "Diego" },
      { customer_id: 5, customer_name: "Eli" },
    ],
  },
  {
    name: "orders",
    columns: [
      { name: "order_id", type: "INTEGER" },
      { name: "customer_id", type: "INTEGER" },
      { name: "order_date", type: "TEXT" },
      { name: "status", type: "TEXT" },
    ],
    rows: [
      { order_id: 100, customer_id: 1, order_date: "2026-02-01", status: "completed" },
      { order_id: 101, customer_id: 1, order_date: "2026-03-15", status: "completed" },
      { order_id: 102, customer_id: 1, order_date: "2026-05-01", status: "pending" },
      { order_id: 200, customer_id: 2, order_date: "2026-02-10", status: "pending" },
      { order_id: 201, customer_id: 2, order_date: "2026-02-12", status: "cancelled" },
      { order_id: 300, customer_id: 4, order_date: "2026-04-01", status: "completed" },
      { order_id: 400, customer_id: 5, order_date: "2026-04-02", status: "completed" },
    ],
  },
  {
    name: "order_items",
    columns: [
      { name: "order_id", type: "INTEGER" },
      { name: "product_id", type: "INTEGER" },
      { name: "quantity", type: "INTEGER" },
      { name: "unit_price", type: "REAL" },
      { name: "discount_amount", type: "REAL" },
    ],
    rows: [
      { order_id: 100, product_id: 1, quantity: 2, unit_price: 100, discount_amount: 10 },
      { order_id: 100, product_id: 2, quantity: 1, unit_price: 50, discount_amount: null },
      { order_id: 101, product_id: 3, quantity: 3, unit_price: 100, discount_amount: 20 },
      { order_id: 102, product_id: 4, quantity: 1, unit_price: 75, discount_amount: 0 },
      { order_id: 300, product_id: 5, quantity: 12, unit_price: 100, discount_amount: 0 },
      { order_id: 400, product_id: 6, quantity: 2, unit_price: 200, discount_amount: 50 },
    ],
  },
];

export const ecommerceQuestion: PracticeQuestionContent = {
  title: "E-commerce customer order report",
  prompt: [
    "Report customers with at least one completed order or no orders; exclude customers whose orders are all non-completed.",
    "Count completed orders without multiplying counts by order items. Calculate completed-order spending as quantity * unit_price - COALESCE(discount_amount, 0).",
    "Show the latest date across all orders. Categorize spending of at least 1000 as VIP, at least 500 as Regular, and less than 500 as Standard.",
    "Sort by spending descending and customer name ascending.",
  ].join(" "),
  explanation: "Completed-order totals exclude discounts and preserve customers with no orders.",
  concepts: ["JOIN", "GROUP BY", "HAVING", "COALESCE", "CASE"],
  tables: ecommerceTables,
};

export const ecommerceReportSql = `WITH order_summary AS (
  SELECT
    customer_id,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_order_count,
    MAX(order_date) AS latest_order_date
  FROM orders
  GROUP BY customer_id
),
completed_spending AS (
  SELECT
    o.customer_id,
    SUM(oi.quantity * oi.unit_price - COALESCE(oi.discount_amount, 0)) AS spending
  FROM orders AS o
  JOIN order_items AS oi ON oi.order_id = o.order_id
  WHERE o.status = 'completed'
  GROUP BY o.customer_id
)
SELECT
  c.customer_id,
  c.customer_name,
  COALESCE(os.completed_order_count, 0) AS completed_order_count,
  os.latest_order_date,
  COALESCE(cs.spending, 0) AS completed_spending,
  CASE
    WHEN COALESCE(cs.spending, 0) >= 1000 THEN 'VIP'
    WHEN COALESCE(cs.spending, 0) >= 500 THEN 'Regular'
    ELSE 'Standard'
  END AS customer_category
FROM customers AS c
LEFT JOIN order_summary AS os ON os.customer_id = c.customer_id
LEFT JOIN completed_spending AS cs ON cs.customer_id = c.customer_id
WHERE EXISTS (
  SELECT 1 FROM orders AS completed
  WHERE completed.customer_id = c.customer_id AND completed.status = 'completed'
)
OR NOT EXISTS (
  SELECT 1 FROM orders AS any_order
  WHERE any_order.customer_id = c.customer_id
)
ORDER BY completed_spending DESC, c.customer_name ASC;`;

export const ecommerceExpectedRows = [
  {
    customer_id: 4,
    customer_name: "Diego",
    completed_order_count: 1,
    latest_order_date: "2026-04-01",
    completed_spending: 1200,
    customer_category: "VIP",
  },
  {
    customer_id: 1,
    customer_name: "Ava",
    completed_order_count: 2,
    latest_order_date: "2026-05-01",
    completed_spending: 520,
    customer_category: "Regular",
  },
  {
    customer_id: 5,
    customer_name: "Eli",
    completed_order_count: 1,
    latest_order_date: "2026-04-02",
    completed_spending: 350,
    customer_category: "Standard",
  },
  {
    customer_id: 3,
    customer_name: "Cleo",
    completed_order_count: 0,
    latest_order_date: null,
    completed_spending: 0,
    customer_category: "Standard",
  },
];
