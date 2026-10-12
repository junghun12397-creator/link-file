import { z } from 'zod';
import { aggregate, dec, status, today, validDate, won } from './calculations';
import { AppError, type Data, type Expense, type ExpenseInput, type InventoryEvent } from './types';

export const expenseCategories = ['임차료', '인건비', '사업주 부담 보험료', '관리비', '수도광열비', '통신·소프트웨어', '광고비', '소모품·청소비'] as const;
const expenseSchema = z.object({ date: z.string(), category: z.enum(expenseCategories), amount: z.string() });
export function makeExpense(data: Data, input: ExpenseInput, previous?: Expense, id: string = crypto.randomUUID(), currentDate = today()): Expense {
  if (!expenseSchema.safeParse(input).success) throw new AppError('귀속일과 원본 8개 비용항목을 선택해 주세요.');
  if (!validDate(input.date) || input.date < data.meta.start_date || input.date > currentDate) throw new AppError(`귀속일은 ${data.meta.start_date}부터 오늘까지 입력할 수 있습니다. 미래 비용계획은 2차입니다.`, 'VALIDATION', 'date');
  if (!/^\d+$/.test(input.amount) || !dec(input.amount).gt(0) || dec(input.amount).precision() > 18) throw new AppError('금액은 정확히 처리 가능한 양의 정수 원으로 입력해 주세요. 0원·음수·소수는 저장하지 않습니다.', 'VALIDATION', 'amount');
  return { ...previous, expense_id: previous?.expense_id || id, ...input, amount: dec(input.amount).toString(), origin: previous?.origin || (previous ? '초기 자료' : '직접 입력'), recognition: previous?.recognition || '지정 귀속일 전액 반영', recordVersion: (previous?.recordVersion || 0) + 1 };
}
export function duplicateExpense(data: Data, expense: Expense) {
  return data.expenses.some(e => e.expense_id !== expense.expense_id && e.date === expense.date && e.category === expense.category && dec(e.amount).eq(expense.amount));
}
export function inPeriod(date: string, mode: string, period: string) { return mode === 'month' ? date.startsWith(period + '-') : date === period; }
export function validPeriod(mode: string, period: string) { return mode === 'month' ? /^\d{4}-(0[1-9]|1[0-2])$/.test(period) : validDate(period); }
export function wasteAmount(data: Data, event: InventoryEvent) {
  const material = data.materials.find(m => m.material_id === event.material_id);
  const price = data.price_history.filter(p => p.material_id === event.material_id && p.effective_date <= event.date).sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
  if (!material || material.unit !== event.unit || !price || !dec(price.pack_quantity).gt(0) || dec(price.pack_price).lt(0)) throw new AppError(`${event.date} ${material?.name || event.material_id} 폐기 가격·단위 근거가 부족합니다.`, 'CALCULATION');
  if (event.quantity == null) throw new AppError('폐기 수량 근거가 없습니다.', 'CALCULATION');
  return won(dec(event.quantity).abs().times(price.pack_price).div(price.pack_quantity));
}
export function storeResult(data: Data, mode: string, period: string, confirmed: boolean) {
  const includes = (date: string) => inPeriod(date, mode, period) && (status(data, date) === '확정') === confirmed;
  const sales = data.sales.filter(s => includes(s.date));
  const expenses = data.expenses.filter(e => includes(e.date));
  const waste = data.inventory_events.filter(e => e.event_type === '폐기' && includes(e.date));
  const amounts = aggregate(sales);
  const operating = expenses.reduce((s, e) => s.plus(e.amount), dec(0));
  let wasteCost = dec(0); const issues: string[] = [];
  for (const event of waste) { try { wasteCost = wasteCost.plus(wasteAmount(data, event)); } catch (e) { issues.push(e instanceof Error ? e.message : '폐기 원가 계산 불가'); } }
  const complete = amounts.complete && !issues.length;
  const profit = complete ? amounts.profit!.minus(operating).minus(wasteCost) : null;
  const expenseBreakdown = expenseCategories.map(category => ({ category, amount: expenses.filter(e => e.category === category).reduce((s, e) => s.plus(e.amount), dec(0)) }));
  return { ...amounts, contribution: amounts.profit, complete, profit, ratio: profit && !amounts.net.isZero() ? profit.div(amounts.net).times(100) : null, operating, wasteCost: issues.length ? null : wasteCost, expenseBreakdown, issues, count: sales.length + expenses.length + waste.length, salesCount: sales.length, expensesCount: expenses.length, wasteCount: waste.length };
}
export function inventoryBasis(data: Data, mode: string, period: string, currentDate = today()): { date: string | null; note: string } {
  if (!validPeriod(mode, period)) return { date: null, note: '올바른 기간을 선택해 주세요.' };
  if (mode === 'day') {
    if (period < data.meta.start_date) return { date: null, note: '시작 재고 이전으로 계산할 수 없습니다.' };
    if (period > currentDate) return { date: null, note: '미래 날짜의 실제 재고는 표시하지 않습니다.' };
    return { date: period, note: '선택한 날짜의 마감 시점 잔량' };
  }
  if (period > currentDate.slice(0, 7)) return { date: null, note: '미래 월의 실제 재고는 표시하지 않습니다.' };
  const dates = [...data.sales, ...data.inventory_events].filter(e => inPeriod(e.date, mode, period) && e.date <= currentDate).map(e => e.date).sort();
  if (dates.length) return { date: dates[dates.length - 1], note: '선택 월의 마지막 판매·재고 기록일 기준 (비용 귀속일은 제외)' };
  const [year, month] = period.split('-').map(Number);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const date = end < currentDate ? end : currentDate;
  if (date < data.meta.start_date) return { date: null, note: '시작 재고 이전으로 계산할 수 없습니다.' };
  return { date, note: `선택 월에 판매·재고 활동 기록 없음 · ${end > currentDate ? '오늘까지만' : '월말까지'} 이전 잔량 이월. 실제 무활동을 보장하지 않습니다.` };
}
