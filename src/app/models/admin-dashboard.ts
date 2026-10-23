export interface AdminDashboard {
  date: string;
  timeZone: string;
  dailySalesGoal: number;
  lowStockThreshold: number;
  today: { sales: number; orderCount: number; completedCount: number; openCount: number };
  yesterday: { sales: number };
  salesChangePct: number;
  dailyGoalPct: number;
  pendingCount: number;
  preparingCount: number;
  inventory: {
    unitsInStock: number;
    trackedProductCount: number;
    lowStockProducts: { id: string; name: string; stock: number }[];
  };
}
