import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { CafeDB, changeInventory, initialize, restoreBackup, changeExpenses } from '../src/storage/store';
import { fixture } from './fixture';
import type { InventoryInput } from '../src/domain/types';
const input: InventoryInput = { date: '2026-09-19', material_id: 'I02', event_type: '입고', quantity: '1000', reason: '', supplier_id: '', unit_cost: '' };
const databases: CafeDB[] = [];
function database() { const d = new CafeDB('stock-' + crypto.randomUUID()); databases.push(d); return d; }
afterEach(async () => { vi.restoreAllMocks(); for (const d of databases.splice(0)) await d.delete(); });
it('stock durable once, leaves sales/expenses/prices untouched, rejects stale draft', async () => {
  const db = database(), a = await initialize(db, fixture); const b = await changeInventory(db, a, 'r', input, 'stock', []); expect(b.data.inventory_events).toHaveLength(1); expect(b.data.sales).toEqual(a.data.sales); expect(b.data.expenses).toEqual(a.data.expenses); expect(b.data.price_history).toEqual(a.data.price_history);
  expect((await changeInventory(db, a, 'r', input, 'stock', [])).revision).toBe(b.revision); db.close(); await db.open(); expect((await db.datasets.get('active'))!.data.inventory_events).toHaveLength(1);
  await expect(changeInventory(db, a, 'other', input, 'stock2', [])).rejects.toThrow('다른 창');
});
it('stock error fully rolls back, retains request for one retry; negative confirmation enforced', async () => {
  const db = database(), a = await initialize(db, fixture); vi.spyOn(db.operations, 'add').mockRejectedValueOnce(new Error('quota'));
  await expect(changeInventory(db, a, 'r', input, 's', [])).rejects.toThrow(); expect(await db.datasets.get('active')).toEqual(a); await changeInventory(db, a, 'r', input, 's', []);
  const latest = (await db.datasets.get('active'))!; await expect(changeInventory(db, latest, 'x', { ...input, event_type: '폐기', quantity: '9999999', reason: '검사' }, 'w', [])).rejects.toThrow('주의');
});
it('restore atomic full replacement increments local revision, clears receipts, retries once and survives reopen', async () => {
  const db = database(), a = await initialize(db, fixture); const b = await changeInventory(db, a, 'stock', input, 's', []); const data = fixture(); data.sales = []; data.expenses = []; data.inventory_events = [];
  const c = await restoreBackup(db, b, 'restore', data, true); expect(c.revision).toBe(b.revision + 1); expect(c.data).toEqual(data); expect(await db.operations.count()).toBe(1); expect((await restoreBackup(db, b, 'restore', data, true)).revision).toBe(c.revision);
  db.close(); await db.open(); expect((await initialize(db, () => { throw new Error('must not reseed'); })).data.sales).toHaveLength(0);
  await expect(changeExpenses(db, b, 'stale', { kind: 'save', input: { date: input.date, category: '광고비', amount: '10000' }, id: 'e', duplicateConfirmed: false })).rejects.toThrow('다른 창');
});
it('restore cancellation, invalid file and concurrent edit make no change', async () => {
  const db = database(), a = await initialize(db, fixture); await expect(restoreBackup(db, a, 'x', fixture(), false)).rejects.toThrow('확인');
  const invalid = fixture(); invalid.menus = []; await expect(restoreBackup(db, a, 'x', invalid, true)).rejects.toThrow(); expect(await db.datasets.get('active')).toEqual(a);
  const b = await changeInventory(db, a, 'stock', input, 's', []); await expect(restoreBackup(db, a, 'x', fixture(), true)).rejects.toThrow('다른 창'); expect(await db.datasets.get('active')).toEqual(b);
});
it('restore failure after replacement/receipt-clear preserves both old dataset and old receipts', async () => {
  const db = database(), a = await initialize(db, fixture); const b = await changeInventory(db, a, 'stock', input, 's', []);
  vi.spyOn(db.operations, 'add').mockRejectedValueOnce(new Error('quota')); await expect(restoreBackup(db, b, 'r', fixture(), true)).rejects.toThrow(); expect(await db.datasets.get('active')).toEqual(b); expect(await db.operations.get('stock')).toBeDefined(); expect(await db.operations.get('r')).toBeUndefined();
});
