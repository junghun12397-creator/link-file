import { describe, expect, it } from 'vitest';
import { balances, makeSale } from '../src/domain/calculations';
import { duplicateExpense, inventoryBasis, makeExpense, storeResult, wasteAmount } from '../src/domain/operations';
import { seedData } from '../src/io/seed';
import { fixture, input } from './fixture';
const expenseInput = { date: '2026-09-19', category: '광고비', amount: '10000' };

describe('expense validation and preservation', () => {
  it.each(['', '0', '-1', '1.1', '1e3', '100원', '1000000000000000001', '9999999999999999999999999999'])('rejects invalid amount %s', amount => { expect(() => makeExpense(fixture(), { ...expenseInput, amount })).toThrow(); });
  it.each(['2025-06-30', '2026-02-30', '2099-01-01', ''])('rejects invalid date %s', date => { expect(() => makeExpense(fixture(), { ...expenseInput, date })).toThrow(); });
  it('rejects extra categories, creates provenance and positive integer', () => {
    const d = fixture(); expect(() => makeExpense(d, { ...expenseInput, category: '재료구매' })).toThrow();
    const e = makeExpense(d, expenseInput); expect(e.amount).toBe('10000'); expect(e.origin).toBe('직접 입력'); expect(e.recognition).toBe('지정 귀속일 전액 반영');
  });
  it('preserves source recognition and metadata, exact duplicates need confirmation but different payments do not', () => {
    const d = fixture(); d.expenses = [{ expense_id: 'e', ...expenseInput, recognition: '월비용 일할 배분', note: '원본' }];
    const e = makeExpense(d, { ...expenseInput, amount: '15000' }, d.expenses[0]);
    expect(e.recognition).toBe('월비용 일할 배분'); expect(e.note).toBe('원본'); expect(e.expense_id).toBe('e'); expect(e.origin).toBe('초기 자료');
    expect(duplicateExpense(d, makeExpense(d, expenseInput))).toBe(true); expect(duplicateExpense(d, e)).toBe(false);
  });
});
describe('management P&L from actual same-date groups', () => {
  function scenario() {
    const d = fixture(); d.expenses = [{ expense_id: 'e', ...expenseInput, amount: '30000' }];
    d.sales = [makeSale(d, input)]; d.inventory_events = [{ event_id: 'w', date: input.date, material_id: 'I02', event_type: '폐기', quantity: '-1000', unit: 'ml' }]; return d;
  }
  it('FRD example 73500 - 30000 - 2000 = 41500; sales ratio unchanged', () => {
    const d = scenario(), r = storeResult(d, 'day', input.date, false);
    expect(r.net.toString()).toBe('98000'); expect(r.food!.toString()).toBe('20000'); expect(r.packaging!.toString()).toBe('3000'); expect(r.fee.toString()).toBe('1500'); expect(r.profit!.toString()).toBe('41500'); expect(r.wasteCost!.toString()).toBe('2000'); expect(r.operating.toString()).toBe('30000');
  });
  it('does not add monthly plans, receipt payments, or count discrepancies as cost', () => {
    const d = scenario(); d.monthly_expense_plan = [{ month: '2026-09', category: '광고비', amount: '999999' }];
    d.inventory_events.push({ event_id: 'r', date: input.date, material_id: 'I02', event_type: '입고', quantity: '2000', unit: 'ml' }, { event_id: 'c', date: input.date, material_id: 'I02', event_type: '실사조정', quantity: '-50000', counted_quantity: '500', unit: 'ml' });
    expect(storeResult(d, 'day', input.date, false).profit!.toString()).toBe('41500');
  });
  it('exact same date sets across sales, expenses, waste, closure and missing calendar', () => {
    const d = scenario(); d.calendar = [{ date: input.date, is_open: true, record_complete: true }];
    expect(storeResult(d, 'month', '2026-09', true).profit!.toString()).toBe('41500'); expect(storeResult(d, 'day', input.date, false).count).toBe(0);
    d.calendar = []; expect(storeResult(d, 'day', input.date, false).profit!.toString()).toBe('41500'); expect(storeResult(d, 'day', input.date, true).count).toBe(0);
  });
  it('missing waste price or historical sale cost makes total incomplete, never zero', () => {
    const d = scenario(); d.price_history = d.price_history.filter(p => p.material_id !== 'I02');
    let r = storeResult(d, 'day', input.date, false); expect(r.complete).toBe(false); expect(r.profit).toBeNull(); expect(r.wasteCost).toBeNull(); expect(r.issues).toHaveLength(1);
    d.inventory_events = []; d.sales[0].unit_food_cost_snapshot = null; r = storeResult(d, 'day', input.date, false); expect(r.profit).toBeNull(); expect(r.food).toBeNull();
  });
  it('sales-free expense is a loss, 0 revenue ratio unavailable, no records distinct', () => {
    const d = scenario(); d.sales = []; d.inventory_events = [];
    const r = storeResult(d, 'day', input.date, false); expect(r.profit!.toString()).toBe('-30000'); expect(r.ratio).toBeNull(); expect(r.count).toBe(1); expect(storeResult(d, 'day', '2026-09-20', false).count).toBe(0);
  });
  it('waste absolute quantity, date-effective price, record HALF_UP before sum', () => {
    const d = scenario(); d.price_history = [{ material_id: 'I02', effective_date: '2025-07-01', pack_price: '1', pack_quantity: '2' }, { material_id: 'I02', effective_date: '2026-09-20', pack_price: '10', pack_quantity: '1' }];
    const e = { ...d.inventory_events[0], quantity: '-1' }; expect(wasteAmount(d, e).toString()).toBe('1'); expect(wasteAmount(d, { ...e, quantity: '1' }).toString()).toBe('1');
    d.inventory_events = [e, { ...e, event_id: 'w2' }]; expect(storeResult(d, 'day', input.date, false).wasteCost!.toString()).toBe('2');
  });
  it('original September independently aggregated operating/waste/profit expectations', () => {
    const d = seedData(); const r = storeResult(d, 'month', '2026-09', true);
    expect(r.net.toString()).toBe('13968930'); expect(r.food!.toString()).toBe('3259810'); expect(r.packaging!.toString()).toBe('286826'); expect(r.fee.toString()).toBe('209565');
    expect(r.operating.toString()).toBe('3798010'); expect(r.wasteCost!.toString()).toBe('21534'); expect(r.profit!.toString()).toBe('6393185');
    expect(r.complete).toBe(true); expect(storeResult(d, 'month', '2026-09', false).count).toBe(0);
  });
});
describe('read-only inventory basis and real ledger', () => {
  it('latest sale or event in month, expenses cannot advance inventory date', () => {
    const d = fixture(); d.sales = [makeSale(d, input)]; d.expenses = [makeExpense(d, { ...expenseInput, date: '2026-09-25' })];
    expect(inventoryBasis(d, 'month', '2026-09').date).toBe('2026-09-19');
    d.inventory_events = [{ event_id: 'r', date: '2026-09-20', material_id: 'I02', event_type: '입고', quantity: '1', unit: 'ml' }]; expect(inventoryBasis(d, 'month', '2026-09').date).toBe('2026-09-20');
  });
  it('no activity month carries to month end, current month capped today; invalid/future/start blocked', () => {
    const d = fixture();
    expect(inventoryBasis(d, 'month', '2026-08').date).toBe('2026-08-31'); expect(inventoryBasis(d, 'month', '2026-10', '2026-10-12').date).toBe('2026-10-12');
    for (const [m, p] of [['month', '2025-06'], ['month', '2026-13'], ['month', '2099-01'], ['day', '2025-06-30'], ['day', '2099-01-01'], ['day', '2026-02-30']]) expect(inventoryBasis(d, m, p).date).toBeNull();
  });
  it('unclosed latte deducts milk4000, packaging20; later count anchors; unknown start stays unknown', () => {
    const d = fixture(); d.sales = [makeSale(d, input)];
    expect(balances(d, input.date).get('I02')!.amount!.toString()).toBe('96000'); expect(balances(d, input.date).get('I02')!.provisional).toBe(true); expect(balances(d, input.date).get('I10')!.amount!.toString()).toBe('99980');
    d.inventory_events = [{ event_id: 'c', date: '2026-09-20', material_id: 'I02', event_type: '실사조정', quantity: '-123', counted_quantity: '800', unit: 'ml' }]; expect(balances(d, '2026-09-20').get('I02')!.amount!.toString()).toBe('800');
    d.opening_inventory = []; expect(balances(d, input.date).get('I02')!.amount).toBeNull(); expect(balances(d, '2026-09-20').get('I02')!.amount!.toString()).toBe('800');
  });
});
