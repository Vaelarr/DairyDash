import { DAILY_SALES_GOAL, LOW_STOCK_THRESHOLD, REPORTING_TIME_ZONE } from '../src/app/data/admin-dashboard.ts';

const reportingDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORTING_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Summarize active orders without returning customer details to the dashboard. */
export function summarizeDashboard(orders, products, now = new Date()) {
  const date = reportingDate.format(now);
  const yesterday = reportingDate.format(new Date(now.getTime() - 86400000));
  const todayOrders = orders.filter((order) => reportingDate.format(new Date(order.createdAt)) === date);
  const yesterdayOrders = orders.filter((order) => reportingDate.format(new Date(order.createdAt)) === yesterday);
  // Round each persisted PHP amount back to centavos before summing.
  const sales = (entries) => entries.filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + Math.round(order.total * 100), 0) / 100;
  const todaySales = sales(todayOrders);
  const yesterdaySales = sales(yesterdayOrders);
  const tracked = products.filter((product) => Number.isInteger(product.stock));
  return {
    date,
    timeZone: REPORTING_TIME_ZONE,
    dailySalesGoal: DAILY_SALES_GOAL,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    today: {
      sales: todaySales,
      orderCount: todayOrders.length,
      completedCount: todayOrders.filter((order) => order.status === 'completed').length,
      openCount: todayOrders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length,
    },
    yesterday: { sales: yesterdaySales },
    salesChangePct: yesterdaySales > 0 ? ((todaySales - yesterdaySales) / yesterdaySales) * 100 : todaySales > 0 ? 100 : 0,
    dailyGoalPct: Math.max(0, Math.min(100, Math.round((todaySales / DAILY_SALES_GOAL) * 100))),
    pendingCount: orders.filter((order) => order.status === 'pending').length,
    preparingCount: orders.filter((order) => order.status === 'preparing').length,
    inventory: {
      unitsInStock: tracked.reduce((sum, product) => sum + product.stock, 0),
      trackedProductCount: tracked.length,
      lowStockProducts: tracked.filter((product) => product.stock <= LOW_STOCK_THRESHOLD)
        .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name))
        .map(({ id, name, stock }) => ({ id, name, stock })),
    },
  };
}
