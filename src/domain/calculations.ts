import Decimal from 'decimal.js';
import { z } from 'zod';
import { AppError, type Data, type Sale, type SaleInput } from './types';
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const dec = (n: string | number) => {
  const d = new Decimal(n);
  if (!d.isFinite() || d.precision() > 40 || d.abs().gt('1e24')) throw new AppError('정확히 처리할 수 있는 숫자 범위를 벗어났습니다.');
  return d;
};
export const won = (n: Decimal) => n.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
export const sum = (v: Decimal[]) => v.reduce((a, b) => a.plus(b), new Decimal(0));
export const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function status(data: Data, date: string) {
  const day = data.calendar.find(x => x.date === date);
  return day?.record_complete ? '확정' : day ? '미확정' : '마감 정보 없음';
}
export function defaultMonth(data: Data) {
  return (data.sales.reduce((a, s) => s.date > a ? s.date : a, '') || today()).slice(0, 7);
}
export function recipeFor(data: Data, sale: Pick<Sale, 'menu_id' | 'channel' | 'recipe_version'>) {
  const rows = data.recipes.filter(r => r.menu_id === sale.menu_id && r.recipe_version === sale.recipe_version && (!r.channel_only || r.channel_only === sale.channel));
  if (!rows.length) throw new AppError('해당 메뉴의 레시피를 찾을 수 없습니다.', 'CALCULATION');
  return rows;
}
export function unitCost(data: Data, date: string, menuId: string, channel: string) {
  const menu = data.menus.find(m => m.menu_id === menuId);
  if (!menu) throw new AppError('메뉴를 선택해 주세요.', 'VALIDATION', 'menu_id');
  let food = dec(0), packaging = dec(0);
  const basis: string[] = [];
  for (const r of recipeFor(data, { menu_id: menuId, channel, recipe_version: menu.recipe_version })) {
    const material = data.materials.find(m => m.material_id === r.material_id);
    const price = data.price_history.filter(p => p.material_id === r.material_id && p.effective_date <= date).sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
    if (!material || !price || !dec(price.pack_quantity).gt(0) || material.unit !== r.unit || !dec(r.quantity).gt(0)) {
      throw new AppError(`${material?.name || r.material_id}의 ${date} 레시피·가격·구매용량 근거를 확인할 수 없습니다.`, 'CALCULATION');
    }
    const amount = dec(price.pack_price).div(price.pack_quantity).times(r.quantity);
    if (['I10', 'I11'].includes(r.material_id)) packaging = packaging.plus(amount); else food = food.plus(amount);
    basis.push(`${material.name} ${r.quantity}${r.unit} × (${price.pack_price}원 ÷ ${price.pack_quantity}${material.unit}), 적용일 ${price.effective_date}`);
  }
  return { food, packaging, basis, version: menu.recipe_version };
}
const inputSchema = z.object({ date: z.string(), menu_id: z.string(), channel: z.enum(['매장', '포장']), quantity: z.string(), unit_price: z.string(), discount_amount: z.string(), payment_fee: z.string() });
export function validateInput(data: Data, raw: SaleInput, excludeId?: string, currentDate = today()) {
  if (!inputSchema.safeParse(raw).success) throw new AppError('메뉴와 매장/포장을 선택해 주세요.');
  if (!validDate(raw.date) || raw.date < data.meta.start_date || raw.date > currentDate) throw new AppError(`판매일은 ${data.meta.start_date}부터 오늘까지 입력할 수 있습니다.`, 'VALIDATION', 'date');
  if (!data.menus.some(m => m.menu_id === raw.menu_id)) throw new AppError('메뉴를 선택해 주세요.', 'VALIDATION', 'menu_id');
  const labels: Record<string, string> = { quantity: '수량', unit_price: '판매단가', discount_amount: '총 할인', payment_fee: '실제 결제수수료' };
  for (const field of ['quantity', 'unit_price', 'discount_amount', 'payment_fee'] as const) {
    const value = raw[field];
    if (!/^(?:\d+)(?:\.\d+)?$/.test(value)) throw new AppError(`${labels[field]}에 0 이상의 숫자를 입력해 주세요.`, 'VALIDATION', field);
    const n = dec(value);
    if (n.precision() > 18) throw new AppError(`${labels[field]}의 자릿수가 정확히 처리할 수 있는 범위를 벗어났습니다.`, 'VALIDATION', field);
    if (field !== 'unit_price' && !n.isInteger()) throw new AppError(`${labels[field]}는 정수로 입력해 주세요.`, 'VALIDATION', field);
    if (field === 'quantity' && !n.gt(0)) throw new AppError('수량은 1 이상 정수로 입력해 주세요.', 'VALIDATION', field);
  }
  if (dec(raw.discount_amount).gt(won(dec(raw.quantity).times(raw.unit_price)))) throw new AppError('총 할인은 정상 판매액보다 클 수 없습니다.', 'VALIDATION', 'discount_amount');
  if (data.sales.some(s => s.sale_id !== excludeId && s.date === raw.date && s.menu_id === raw.menu_id && s.channel === raw.channel)) throw new AppError('같은 날짜·메뉴·채널의 판매가 있습니다. 기존 기록을 수정해 주세요.', 'DUPLICATE');
}
export function makeSale(data: Data, input: SaleInput, previous?: Sale, id: string = crypto.randomUUID(), currentDate = today()): Sale {
  validateInput(data, input, previous?.sale_id, currentDate);
  const changed = !previous || ['date', 'menu_id', 'channel'].some(k => previous[k as keyof Sale] !== input[k as keyof SaleInput]);
  const cost = changed ? unitCost(data, input.date, input.menu_id, input.channel) : null;
  if (!changed && (previous!.unit_food_cost_snapshot == null || previous!.unit_packaging_cost_snapshot == null)) throw new AppError('당시 원가가 누락되어 수정 계산을 할 수 없습니다.', 'CALCULATION');
  const result: Sale = {
    sale_id: previous?.sale_id || id, ...input,
    net_sales: won(dec(input.quantity).times(input.unit_price)).minus(input.discount_amount).toString(),
    recipe_version: cost?.version || previous!.recipe_version,
    unit_food_cost_snapshot: cost?.food.toString() ?? previous!.unit_food_cost_snapshot,
    unit_packaging_cost_snapshot: cost?.packaging.toString() ?? previous!.unit_packaging_cost_snapshot,
    origin: previous?.origin || '직접 입력', recordVersion: (previous?.recordVersion || 0) + 1,
    cost_basis: cost?.basis || previous?.cost_basis,
  };
  if (previous) result.original = previous.original || { ...previous };
  recipeFor(data, result);
  saleAmounts(result);
  return result;
}
export function saleAmounts(s: Sale) {
  if (s.unit_food_cost_snapshot == null || s.unit_packaging_cost_snapshot == null) throw new AppError('당시 원가가 누락되었습니다.', 'CALCULATION');
  const gross = won(dec(s.quantity).times(s.unit_price));
  const net = dec(s.net_sales), food = won(dec(s.quantity).times(s.unit_food_cost_snapshot)), packaging = won(dec(s.quantity).times(s.unit_packaging_cost_snapshot));
  const fee = dec(s.payment_fee), profit = net.minus(food).minus(packaging).minus(fee);
  return { gross, net, food, packaging, fee, profit };
}
export function aggregate(sales: Sale[]) {
  let gross = dec(0), net = dec(0), food = dec(0), packaging = dec(0), fee = dec(0), quantity = dec(0), store = dec(0), discount = dec(0);
  let complete = true;
  for (const s of sales) {
    quantity = quantity.plus(s.quantity); gross = gross.plus(won(dec(s.quantity).times(s.unit_price))); net = net.plus(s.net_sales); fee = fee.plus(s.payment_fee);
    if (s.channel === '매장') store = store.plus(s.quantity);
    discount = discount.plus(s.discount_amount);
    try { const a = saleAmounts(s); food = food.plus(a.food); packaging = packaging.plus(a.packaging); } catch { complete = false; }
  }
  const profit = complete ? net.minus(food).minus(packaging).minus(fee) : null;
  return { gross, net, food: complete ? food : null, packaging: complete ? packaging : null, fee, quantity, profit, discount,
    ratio: profit && !net.isZero() ? profit.div(net).times(100) : null,
    average: quantity.gt(0) ? gross.div(quantity) : null,
    storeShare: quantity.gt(0) ? store.div(quantity).times(100) : null, complete };
}
// One replay per revision/date; snapshots and counts anchor the balance, never double deduct.
type LedgerAction = { date: string; rank: number; id: string; material: string; delta?: Decimal; count?: Decimal; unknown?: boolean; provisional?: boolean };
const ledgerCache = new WeakMap<Data, { sales: Data['sales']; events: Data['inventory_events']; opening: Data['opening_inventory']; actions: LedgerAction[] }>();
function ledger(data: Data) {
  const found = ledgerCache.get(data);
  if (found && found.sales === data.sales && found.events === data.inventory_events && found.opening === data.opening_inventory) return found.actions;
  const actions: LedgerAction[] = [];
  const closedDates = new Map(data.calendar.map(c => [c.date, c.record_complete]));
  for (const o of data.opening_inventory) actions.push({ date: o.date, rank: 0, id: o.material_id, material: o.material_id, count: dec(o.quantity) });
  for (const e of data.inventory_events) actions.push({ date: e.date, rank: e.event_type === '입고' ? 1 : e.event_type === '실사조정' ? 3 : 2, id: e.event_id, material: e.material_id,
    ...(e.counted_quantity != null ? { count: dec(e.counted_quantity) } : { delta: dec(e.quantity!) }), provisional: e.counted_quantity == null && !closedDates.get(e.date) });
  for (const s of data.sales) {
    try {
      for (const r of recipeFor(data, s)) actions.push({ date: s.date, rank: 2, id: s.sale_id, material: r.material_id, delta: dec(r.quantity).times(s.quantity).negated(), provisional: !closedDates.get(s.date) });
    } catch {
      // Unknown recipe may affect any material. Later physical counts can restore certainty.
      for (const m of data.materials) actions.push({ date: s.date, rank: 2, id: s.sale_id, material: m.material_id, unknown: true, provisional: true });
    }
  }
  actions.sort((a, b) => a.date.localeCompare(b.date) || a.rank - b.rank || a.id.localeCompare(b.id));
  ledgerCache.set(data, { sales: data.sales, events: data.inventory_events, opening: data.opening_inventory, actions });
  return actions;
}
export function balances(data: Data, date: string, excludeCountId?: string) {
  const state = new Map<string, { amount: Decimal | null; provisional: boolean }>();
  for (const m of data.materials) state.set(m.material_id, { amount: null, provisional: false });
  for (const a of ledger(data)) {
    if (a.date > date) break;
    if (excludeCountId && a.rank === 3 && a.id === excludeCountId) continue;
    const s = state.get(a.material); if (!s) continue;
    if (a.unknown) s.amount = null;
    else if (a.count !== undefined) { s.amount = a.count; s.provisional = false; }
    else if (s.amount !== null) s.amount = s.amount.plus(a.delta || 0);
    if (a.provisional) s.provisional = true;
  }
  return state;
}
// Data bundles are immutable per persisted revision. Cache the baseline, then apply only
// this sale's deltas that are not superseded by a later end-of-day count.
const previewCache = new WeakMap<Data, Map<string, ReturnType<typeof balances>>>();
export function affectedStock(data: Data, sale: Sale, before?: Sale) {
  const at = sale.date > (before?.date || '') ? sale.date : before!.date;
  let cache = previewCache.get(data); if (!cache) { cache = new Map(); previewCache.set(data, cache); }
  let original = cache.get(at); if (!original) { original = balances(data, at); cache.set(at, original); }
  const newRecipe = recipeFor(data, sale), oldRecipe = before ? recipeFor(data, before) : [];
  const ids = new Set([...newRecipe, ...oldRecipe].map(r => r.material_id));
  const stateByDate = new Map(data.calendar.map(c => [c.date, c.record_complete]));
  return [...ids].map(id => {
    const previous = original!.get(id)!;
    const countDate = data.inventory_events.filter(e => e.material_id === id && e.date <= at && e.counted_quantity != null).reduce((a, e) => e.date > a ? e.date : a, '');
    const openingDate = data.opening_inventory.filter(e => e.material_id === id && e.date <= at).reduce((a, e) => e.date > a ? e.date : a, '');
    const applies = (date: string) => date <= at && date > countDate && date >= openingDate;
    const usage = sum(newRecipe.filter(r => r.material_id === id).map(r => dec(r.quantity).times(sale.quantity)));
    let amount = previous.amount;
    if (amount !== null && before && applies(before.date)) amount = amount.plus(sum(oldRecipe.filter(r => r.material_id === id).map(r => dec(r.quantity).times(before.quantity))));
    if (amount !== null && applies(sale.date)) amount = amount.minus(usage);
    const provisional = (!stateByDate.get(sale.date) && applies(sale.date) && newRecipe.some(r => r.material_id === id)) || data.sales.some(s => {
      if (s.sale_id === sale.sale_id || stateByDate.get(s.date) || !applies(s.date)) return false;
      try { return recipeFor(data, s).some(r => r.material_id === id); } catch { return true; }
    });
    return { material: data.materials.find(m => m.material_id === id)!, before: previous, after: { amount, provisional }, at, usage };
  });
}
export function warnings(data: Data, sale: Sale, previous?: Sale) {
  const list: string[] = [];
  if (data.calendar.find(x => x.date === sale.date)?.is_open === false) list.push('영업달력상 휴무일입니다. 실제 판매가 맞습니까?');
  if (dec(sale.payment_fee).gt(sale.net_sales)) list.push('실제 결제수수료가 순매출보다 큽니다. 음의 수익을 그대로 저장합니까?');
  const stock = affectedStock(data, sale, previous);
  const negatives = stock.filter(s => s.after.amount?.lt(0)).map(s => s.material.name);
  if (negatives.length) list.push(`${negatives.join(', ')} 계산 잔량이 음수입니다. 입고 누락·재고를 확인한 뒤 실제 판매를 저장합니까?`);
  if (stock.some(s => s.after.amount === null)) list.push('일부 재료 잔량은 계산 근거가 부족합니다. 실제 판매를 저장합니까?');
  return list;
}
