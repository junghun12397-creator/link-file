import { z } from 'zod';
import { AppError, type Data, type Sale } from '../domain/types';
import { validDate, dec } from '../domain/calculations';
const numberText = z.string().refine(n => { try { return dec(n).gte(0); } catch { return false; } });
const dateText = z.string().refine(validDate);
const shape = z.object({
  meta: z.object({ data_class: z.string(), store_name: z.string(), start_date: dateText, as_of: dateText }).passthrough(),
  suppliers: z.array(z.object({ supplier_id: z.string(), name: z.string() }).passthrough()),
  menus: z.array(z.object({ menu_id: z.string(), name: z.string(), price: numberText, category: z.string(), recipe_version: z.string() }).passthrough()),
  materials: z.array(z.object({ material_id: z.string(), name: z.string(), unit: z.enum(['g', 'ml', '개']), pack_quantity: numberText, base_pack_price: numberText, supplier_id: z.string() }).passthrough()),
  recipes: z.array(z.object({ recipe_version: z.string(), menu_id: z.string(), material_id: z.string(), quantity: numberText, unit: z.string(), channel_only: z.string().optional() }).passthrough()),
  price_history: z.array(z.object({ material_id: z.string(), effective_date: dateText, pack_price: numberText, pack_quantity: numberText }).passthrough()),
  calendar: z.array(z.object({ date: dateText, is_open: z.boolean(), record_complete: z.boolean() }).passthrough()),
  sales: z.array(z.object({ sale_id: z.string(), date: dateText, menu_id: z.string(), channel: z.enum(['매장', '포장']), quantity: numberText, unit_price: numberText, discount_amount: numberText, net_sales: numberText, payment_fee: numberText, recipe_version: z.string(), unit_food_cost_snapshot: numberText.nullable(), unit_packaging_cost_snapshot: numberText.nullable() }).passthrough()),
  opening_inventory: z.array(z.object({ material_id: z.string(), date: dateText, quantity: numberText, unit: z.string() }).passthrough()),
  inventory_events: z.array(z.object({ event_id: z.string(), material_id: z.string(), date: dateText, event_type: z.enum(['입고', '폐기', '실사조정']), quantity: z.string().refine(n => { try { dec(n); return true; } catch { return false; } }).nullable(), unit: z.string(), counted_quantity: numberText.nullable().optional() }).passthrough()),
  expenses: z.array(z.object({ expense_id: z.string(), date: dateText, category: z.string(), amount: numberText }).passthrough()),
  monthly_expense_plan: z.array(z.object({ month: z.string(), category: z.string(), amount: numberText }).passthrough()),
  settings: z.record(z.string(), z.unknown()),
});
export function validateSaleRecord(candidate: unknown): Sale {
  const result = shape.shape.sales.element.safeParse(candidate);
  if (!result.success) throw new AppError('보존된 원본 판매 구조가 올바르지 않습니다.', 'BACKUP_FORMAT');
  return result.data as Sale;
}
export function validateData(candidate: unknown): Data {
  const parsed = shape.safeParse(candidate);
  if (!parsed.success) throw new AppError('자료 구조가 올바르지 않습니다: ' + parsed.error.issues[0]?.path.join('.'), 'VALIDATION');
  const data = parsed.data as Data;
  const unique = (values: string[], label: string) => { if (new Set(values).size !== values.length) throw new AppError(`${label} 중복을 확인했습니다.`, 'DUPLICATE'); };
  unique(data.sales.map(s => s.sale_id), '판매번호'); unique(data.sales.map(s => `${s.date}/${s.menu_id}/${s.channel}`), '판매 집계키');
  unique(data.menus.map(x => x.menu_id), '메뉴번호'); unique(data.materials.map(x => x.material_id), '재료번호'); unique(data.suppliers.map(x => x.supplier_id), '공급사번호');
  unique(data.inventory_events.map(x => x.event_id), '재고번호'); unique(data.expenses.map(x => x.expense_id), '비용번호'); unique(data.calendar.map(x => x.date), '달력 날짜');
  const menu = new Set(data.menus.map(x => x.menu_id)), materials = new Map(data.materials.map(x => [x.material_id, x]));
  if (data.sales.some(s => !menu.has(s.menu_id))) throw new AppError('판매가 알 수 없는 메뉴를 참조합니다.');
  if (data.recipes.some(r => !menu.has(r.menu_id) || materials.get(r.material_id)?.unit !== r.unit || !dec(r.quantity).gt(0))) throw new AppError('레시피의 메뉴·재료·단위가 올바르지 않습니다.');
  if (data.price_history.some(p => !materials.has(p.material_id) || !dec(p.pack_quantity).gt(0))) throw new AppError('가격이력의 재료·구매용량이 올바르지 않습니다.');
  if ([...data.inventory_events, ...data.opening_inventory].some(e => materials.get(e.material_id)?.unit !== e.unit)) throw new AppError('재고의 재료·단위 연결이 올바르지 않습니다.');
  return data;
}
