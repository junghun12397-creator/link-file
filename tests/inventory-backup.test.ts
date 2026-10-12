import { describe, expect, it } from 'vitest';
import { aggregate, balances, makeSale } from '../src/domain/calculations';
import { inventoryPreview, inventoryWarnings, makeInventory } from '../src/domain/inventory';
import { storeResult } from '../src/domain/operations';
import { type InventoryInput, type Snapshot } from '../src/domain/types';
import { backupFileName, decodeBackup, encodeBackup, validateBackupData } from '../src/io/backup';
import { seedData } from '../src/io/seed';
import { fixture, input } from './fixture';
export const stockInput: InventoryInput = { date: '2026-09-19', material_id: 'I02', event_type: '입고', quantity: '1000', reason: '', supplier_id: '', unit_cost: '' };
function snap(data = seedData()): Snapshot { return { key: 'active', data, revision: 7, initializationComplete: true, lastSuccess: new Date().toISOString(), dataSchemaVersion: 1, calculationVersion: 1 }; }
describe('inventory records', () => {
  it('receipt increases quantity only; optional unit cost and supplier do not alter prices/P&L', () => {
    const d = fixture(), before = storeResult(d, 'day', stockInput.date, false); const event = makeInventory(d, { ...stockInput, unit_cost: '2.5', supplier_id: 'V01' });
    expect(event.unit).toBe('ml'); expect(event.quantity).toBe('1000'); expect(event.unit_cost).toBe('2.5'); expect(inventoryPreview(d, event).after.amount!.toString()).toBe('101000');
    expect(storeResult({ ...d, inventory_events: [event] }, 'day', stockInput.date, false).profit!.eq(before.profit!)).toBe(true); expect(d.inventory_events).toHaveLength(0);
  });
  it('waste positive input stores negative delta, requires reason and dated price; only store loss once', () => {
    const d = fixture(), e = makeInventory(d, { ...stockInput, event_type: '폐기', quantity: '100', reason: '유통기한' });
    expect(e.quantity).toBe('-100'); expect(e.waste_cost_snapshot).toBe('200'); expect(e.cost_basis?.[0]).toContain('2000원'); d.inventory_events = [e];
    expect(balances(d, e.date).get('I02')!.amount!.toString()).toBe('99900'); expect(storeResult(d, 'day', e.date, false).profit!.toString()).toBe('-200'); expect(aggregate(d.sales).profit!.toString()).toBe('0');
    expect(() => makeInventory(d, { ...stockInput, event_type: '폐기' })).toThrow('사유'); d.price_history = []; expect(() => makeInventory(d, { ...stockInput, event_type: '폐기', reason: '파손' })).toThrow('근거');
  });
  it('count is an anchor, zero allowed, duplicate blocked, missing starting balance repaired without fake difference', () => {
    const d = fixture(); d.opening_inventory.find(o => o.material_id === 'I02')!.quantity = '900';
    const e = makeInventory(d, { ...stockInput, event_type: '실사조정', quantity: '800' }); expect(e.quantity).toBe('-100'); expect(e.counted_quantity).toBe('800'); d.inventory_events = [e];
    expect(balances(d, e.date).get('I02')!.amount!.toString()).toBe('800'); expect(() => makeInventory(d, { ...stockInput, event_type: '실사조정', quantity: '0' })).toThrow('이미');
    d.inventory_events = []; d.opening_inventory = []; const zero = makeInventory(d, { ...stockInput, event_type: '실사조정', quantity: '0' }); expect(zero.quantity).toBeNull(); expect(inventoryPreview(d, zero).after.amount!.toString()).toBe('0');
  });
  it.each([{ quantity: '' }, { quantity: '-1' }, { quantity: '0' }, { quantity: '1.0001' }, { quantity: 'abc' }, { quantity: '1e5' }, { material_id: 'I10', quantity: '1.5' }, { date: '2025-06-30' }, { date: '2099-01-01' }, { date: '2026-02-30' }, { material_id: 'x' }, { supplier_id: 'unknown' }, { unit_cost: '-1' }])('rejects invalid stock %j', patch => { expect(() => makeInventory(fixture(), { ...stockInput, ...patch })).toThrow(); });
  it('optimized preview equals full replay for receipt/waste/count, with same-day later count', () => {
    for (const anchored of [true, false]) for (const kind of ['입고', '폐기', '실사조정'] as const) {
      if (anchored && kind === '실사조정') continue;
      const d = fixture(); if (anchored) d.inventory_events = [{ event_id: 'count', date: stockInput.date, material_id: 'I02', event_type: '실사조정', quantity: '-99200', counted_quantity: '800', unit: 'ml' }];
      const e = makeInventory(d, { ...stockInput, event_type: kind, reason: '검사', quantity: '500' }); const p = inventoryPreview(d, e), full = balances({ ...d, inventory_events: [...d.inventory_events, e] }, e.date).get('I02')!;
      expect(p.after.amount!.eq(full.amount!)).toBe(true); expect(p.after.provisional).toBe(full.provisional);
    }
  });
  it('negative balance needs confirmation, count after old sale protects balance but changes current count discrepancy', () => {
    const d = fixture(); d.opening_inventory.find(o => o.material_id === 'I02')!.quantity = '900';
    const waste = makeInventory(d, { ...stockInput, event_type: '폐기', quantity: '1000', reason: '검사' }); expect(inventoryWarnings(d, waste)).toHaveLength(1);
    d.sales = [makeSale(d, { ...input, quantity: '1' })]; const count = makeInventory(d, { ...stockInput, event_type: '실사조정', quantity: '800' }); expect(count.quantity).toBe('100'); d.inventory_events = [count];
    d.sales = [{ ...d.sales[0], quantity: '2' }]; expect(balances(d, stockInput.date).get('I02')!.amount!.toString()).toBe('800'); expect(balances(d, stockInput.date, count.event_id).get('I02')!.amount!.toString()).toBe('500');
    expect(storeResult(d, 'day', stockInput.date, false).wasteCost!.toString()).toBe('0');
  });
});
describe('full numeric JSON backup and strict restore validation', () => {
  it('round-trips all source fields, numeric tokens, raw precision, null and zero', () => {
    const data = seedData(); data.sales[0].unit_food_cost_snapshot = '460.1234567890123456789012345'; data.sales[1].unit_packaging_cost_snapshot = null;
    const encoded = encodeBackup(snap(data)); expect(encoded).toContain('"unit_food_cost_snapshot":460.1234567890123456789012345'); expect(encoded).toContain('"unit_packaging_cost_snapshot":null'); expect(encoded).not.toContain('"amount":"');
    expect(decodeBackup(encoded).data).toEqual(data);
  });
  it('preserves edited sale original, new stock basis, expenses metadata and product settings', () => {
    const data = fixture(); const sale = makeSale(data, input); data.sales = [sale]; data.sales = [makeSale(data, { ...input, quantity: '25' }, sale)]; data.inventory_events = [makeInventory(data, { ...stockInput, event_type: '폐기', reason: '검사' })]; data.settings = { timezone: 'Asia/Seoul', sample: true };
    expect(decodeBackup(encodeBackup(snap(data))).data).toEqual(data);
  });
  it('allows valid activity-empty state without reseeding, rejects absent master references', () => {
    const data = seedData(); data.sales = []; data.expenses = []; data.inventory_events = [];
    expect(decodeBackup(encodeBackup(snap(data))).data.sales).toHaveLength(0); data.menus = []; expect(() => validateBackupData(data)).toThrow();
  });
  it.each(['', ' ', '{', '{"x":1,"x":2}', '{"data":{},"data":{}}'])('rejects empty, damaged or duplicate JSON %s', text => { expect(() => decodeBackup(text)).toThrow(); });
  it('rejects normal operating JSON, versions, unsafe and unknown fields', () => {
    const encoded = encodeBackup(snap()); expect(() => decodeBackup(JSON.stringify(seedData()))).toThrow();
    expect(() => decodeBackup(encoded.replace('"backupFormatVersion":1', '"backupFormatVersion":2'))).toThrow('버전');
    expect(() => decodeBackup(encoded.replace('"settings":{}', '"settings":{"__proto__":{}}'))).toThrow('안전');
    expect(() => decodeBackup(encoded.replace('"settings":{}', '"settings":{},"extra":true'))).toThrow('허용');
  });
  it.each(['recipe', 'supplier', 'sale-key', 'count-key', 'unit', 'future', 'amount'])('rejects broken %s before writing', issue => {
    const d = seedData();
    if (issue === 'recipe') d.sales[0].recipe_version = 'missing';
    if (issue === 'supplier') d.materials[0].supplier_id = 'missing';
    if (issue === 'sale-key') d.sales.push({ ...d.sales[0], sale_id: 'other' });
    if (issue === 'count-key') { const count = d.inventory_events.find(e => e.counted_quantity != null)!; d.inventory_events.push({ ...count, event_id: 'other' }); }
    if (issue === 'unit') d.inventory_events[0].unit = 'g';
    if (issue === 'future') d.expenses[0].date = '2099-01-01';
    if (issue === 'amount') d.expenses[0].amount = '-1';
    expect(() => validateBackupData(d)).toThrow();
  });
  it('Korean timezone filename, midnight day rollover', () => { expect(backupFileName(new Date('2026-10-11T15:00:00Z'))).toBe('프렙카페_전체백업_20261012_000000.json'); });
});
