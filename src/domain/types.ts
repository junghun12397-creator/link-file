export type Num = string;
export interface Menu { menu_id: string; name: string; price: Num; category: string; recipe_version: string }
export interface Material { material_id: string; name: string; unit: string; pack_quantity: Num; base_pack_price: Num; supplier_id: string }
export interface Recipe { recipe_version: string; menu_id: string; material_id: string; quantity: Num; unit: string; channel_only?: string }
export interface Price { material_id: string; effective_date: string; pack_price: Num; pack_quantity: Num }
export interface Sale {
  sale_id: string; date: string; menu_id: string; channel: string; quantity: Num; unit_price: Num;
  discount_amount: Num; net_sales: Num; payment_fee: Num; recipe_version: string;
  unit_food_cost_snapshot: Num | null; unit_packaging_cost_snapshot: Num | null;
  origin?: string; recordVersion?: number;
  original?: Omit<Sale, 'original'>; cost_basis?: string[];
}
export interface Calendar { date: string; is_open: boolean; record_complete: boolean }
export interface Expense { expense_id: string; date: string; category: string; amount: Num; recognition?: string; origin?: string; recordVersion?: number; [key: string]: unknown }
export interface ExpenseInput { date: string; category: string; amount: string }
export interface InventoryEvent { event_id: string; date: string; material_id: string; event_type: string; quantity: Num | null; counted_quantity?: Num | null; unit: string; reason?: string; supplier_id?: string; unit_cost?: Num | null; origin?: string; recordVersion?: number; waste_cost_snapshot?: Num; cost_basis?: string[] }
export interface InventoryInput { date: string; material_id: string; event_type: '입고' | '폐기' | '실사조정'; quantity: string; reason: string; supplier_id: string; unit_cost: string }
export interface Data {
  meta: { data_class: string; start_date: string; as_of: string; store_name: string; [key: string]: unknown };
  suppliers: { supplier_id: string; name: string }[]; materials: Material[]; menus: Menu[];
  recipes: Recipe[]; price_history: Price[]; calendar: Calendar[]; sales: Sale[];
  opening_inventory: { material_id: string; date: string; quantity: Num; unit: string }[];
  inventory_events: InventoryEvent[];
  expenses: Expense[];
  monthly_expense_plan: { month: string; category: string; amount: Num }[];
  settings: Record<string, unknown>;
}
export interface Snapshot { key: 'active'; data: Data; revision: number; initializationComplete: true; lastSuccess: string; dataSchemaVersion: 1; calculationVersion: 1 }
export interface SaleInput { date: string; menu_id: string; channel: string; quantity: string; unit_price: string; discount_amount: string; payment_fee: string }
export class AppError extends Error {
  constructor(message: string, public code = 'VALIDATION', public field?: string) { super(message); }
}
