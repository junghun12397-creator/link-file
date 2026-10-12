import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { CafeDB, changeExpenses, initialize } from '../src/storage/store';
import { fixture } from './fixture';
const databases: CafeDB[] = [];
const input = { date: '2026-09-19', category: '광고비', amount: '10000' };
function database() { const d = new CafeDB('expense-test-' + crypto.randomUUID()); databases.push(d); return d; }
afterEach(async () => { vi.restoreAllMocks(); for (const d of databases.splice(0)) await d.delete(); });
it('durably creates once, edit replaces/date moves, delete only target; sales/stock and source data untouched', async () => {
  const db = database(), initial = await initialize(db, fixture); const command = { kind: 'save' as const, input, id: 'e', duplicateConfirmed: false };
  const a = await changeExpenses(db, initial, 'a', command); const twice = await changeExpenses(db, initial, 'a', command); expect(twice.revision).toBe(a.revision); expect(a.data.expenses.length).toBe(initial.data.expenses.length + 1);
  expect(a.data.sales).toEqual(initial.data.sales); expect(a.data.inventory_events).toEqual(initial.data.inventory_events); expect(a.data.opening_inventory).toEqual(initial.data.opening_inventory);
  db.close(); await db.open(); expect((await db.datasets.get('active'))!.revision).toBe(a.revision);
  const b = await changeExpenses(db, a, 'b', { ...command, previousId: 'e', input: { ...input, date: '2026-09-20', amount: '15000' } });
  expect(b.data.expenses.find(e => e.expense_id === 'e')!.amount).toBe('15000'); expect(b.data.expenses.find(e => e.expense_id === 'e')!.date).toBe('2026-09-20');
  const c = await changeExpenses(db, b, 'c', { kind: 'delete', previousId: 'e', confirmed: true }); expect(c.data.expenses).toEqual(initial.data.expenses);
});
it('requires duplicate confirmation without prohibiting separate same-day payments', async () => {
  const db = database(), initial = await initialize(db, fixture);
  const a = await changeExpenses(db, initial, 'a', { kind: 'save', input, id: 'a', duplicateConfirmed: false });
  await expect(changeExpenses(db, a, 'b', { kind: 'save', input, id: 'b', duplicateConfirmed: false })).rejects.toThrow('동일');
  const b = await changeExpenses(db, a, 'b', { kind: 'save', input, id: 'b', duplicateConfirmed: true }); expect(b.data.expenses.length).toBe(a.data.expenses.length + 1);
  const c = await changeExpenses(db, b, 'c', { kind: 'save', input: { ...input, amount: '20000' }, id: 'c', duplicateConfirmed: false }); expect(c.revision).toBe(b.revision + 1);
});
it('rejects stale-tab updates and invalid data, missing delete target keeps original', async () => {
  const db = database(), initial = await initialize(db, fixture);
  const a = await changeExpenses(db, initial, 'a', { kind: 'save', input, id: 'a', duplicateConfirmed: false });
  await expect(changeExpenses(db, initial, 'b', { kind: 'save', input, id: 'b', duplicateConfirmed: false })).rejects.toThrow('다른 창');
  await expect(changeExpenses(db, a, 'c', { kind: 'save', input: { ...input, amount: '0' }, id: 'c', duplicateConfirmed: false })).rejects.toThrow();
  await expect(changeExpenses(db, a, 'd', { kind: 'delete', previousId: 'missing', confirmed: true })).rejects.toThrow('대상'); expect((await db.datasets.get('active'))!.revision).toBe(a.revision);
});
it('rollback on partial write failure preserves entire source and permits one retry', async () => {
  const db = database(), initial = await initialize(db, fixture); const command = { kind: 'save' as const, input, id: 'a', duplicateConfirmed: false };
  vi.spyOn(db.operations, 'add').mockRejectedValueOnce(new Error('quota'));
  await expect(changeExpenses(db, initial, 'a', command)).rejects.toThrow(); expect((await db.datasets.get('active'))!).toEqual(initial); expect(await db.operations.count()).toBe(0);
  const a = await changeExpenses(db, initial, 'a', command); expect(a.data.expenses.length).toBe(initial.data.expenses.length + 1);
});
