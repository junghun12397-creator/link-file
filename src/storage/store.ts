import Dexie, { type Table } from 'dexie';
import { AppError, type Data, type Sale, type SaleInput, type Snapshot, type ExpenseInput, type InventoryInput } from '../domain/types';
import { makeSale, warnings } from '../domain/calculations';
import { duplicateExpense, makeExpense } from '../domain/operations';
import { inventoryWarnings, makeInventory } from '../domain/inventory';
import { validateBackupData } from '../io/backup';
export class CafeDB extends Dexie {
  datasets!: Table<Snapshot, string>;
  operations!: Table<{ id: string; revision: number }, string>;
  constructor(name = 'prep-cafe-ops') { super(name); this.version(1).stores({ datasets: 'key', operations: 'id' }); }
}
export const db = new CafeDB();
export async function changeInventory(database: CafeDB, expected: Snapshot, requestId: string, input: InventoryInput, id: string, confirmedWarnings: string[]) {
  const event = makeInventory(expected.data, input, id);
  if (inventoryWarnings(expected.data, event).some(w => !confirmedWarnings.includes(w))) throw new AppError('음수 잔량 주의사항을 확인해 주세요.');
  return database.transaction('rw', database.datasets, database.operations, async () => {
    const current = await database.datasets.get('active');
    if (!current) throw new AppError('저장 자료를 읽을 수 없습니다.', 'STORAGE');
    if (await database.operations.get(requestId)) return current;
    if (current.revision !== expected.revision) throw new AppError('다른 창에서 자료가 변경되었습니다. 입력은 유지했습니다. 취소 후 최신 목록에서 다시 열어 주세요.', 'CONFLICT');
    if (current.data.inventory_events.some(e => e.event_id === event.event_id)) throw new AppError('이미 사용한 재고 기록번호입니다.', 'DUPLICATE');
    const result: Snapshot = { ...current, data: { ...current.data, inventory_events: [...current.data.inventory_events, event] }, revision: current.revision + 1, lastSuccess: new Date().toISOString() };
    await database.datasets.put(result); await database.operations.add({ id: requestId, revision: result.revision }); return result;
  });
}
export async function restoreBackup(database: CafeDB, expected: Snapshot, requestId: string, candidate: Data, confirmed: boolean): Promise<Snapshot> {
  if (!confirmed) throw new AppError('전체 대체 확인이 필요합니다.');
  const data = validateBackupData(candidate);
  return database.transaction('rw', database.datasets, database.operations, async () => {
    const current = await database.datasets.get('active');
    if (!current) throw new AppError('저장 자료를 읽을 수 없습니다.', 'STORAGE');
    if (await database.operations.get(requestId)) return current;
    if (current.revision !== expected.revision) throw new AppError('파일 확인 중 다른 창에서 기록이 바뀌었습니다. 기존 자료를 유지했습니다. 최신 자료에서 파일을 다시 선택해 주세요.', 'CONFLICT');
    const result: Snapshot = { ...current, data, revision: current.revision + 1, initializationComplete: true, lastSuccess: new Date().toISOString() };
    await database.datasets.put(result); await database.operations.clear(); await database.operations.add({ id: requestId, revision: result.revision }); return result;
  });
}
export type ExpenseCommand = { kind: 'save'; input: ExpenseInput; previousId?: string; id: string; duplicateConfirmed: boolean } | { kind: 'delete'; previousId: string; confirmed: true };
export async function changeExpenses(database: CafeDB, expected: Snapshot, requestId: string, command: ExpenseCommand): Promise<Snapshot> {
  const previous = command.previousId ? expected.data.expenses.find(e => e.expense_id === command.previousId) : undefined;
  if (command.previousId && !previous) throw new AppError('대상이 없습니다. 최신 목록을 확인해 주세요.', 'CONFLICT');
  const next = command.kind === 'save' ? makeExpense(expected.data, command.input, previous, command.id) : undefined;
  if (next && duplicateExpense(expected.data, next) && command.kind === 'save' && !command.duplicateConfirmed) throw new AppError('동일 날짜·항목·금액의 비용이 있습니다. 별도 지출인지 확인해 주세요.', 'DUPLICATE');
  const expenses = expected.data.expenses.filter(e => e.expense_id !== previous?.expense_id);
  if (next) expenses.push(next);
  return database.transaction('rw', database.datasets, database.operations, async () => {
    const current = await database.datasets.get('active');
    if (!current) throw new AppError('저장 자료를 읽을 수 없습니다.', 'STORAGE');
    if (await database.operations.get(requestId)) return current;
    if (current.revision !== expected.revision) throw new AppError('다른 창에서 자료가 변경되었습니다. 입력은 유지했습니다. 취소 후 최신 목록에서 다시 열어 주세요.', 'CONFLICT');
    const result: Snapshot = { ...current, data: { ...current.data, expenses }, revision: current.revision + 1, lastSuccess: new Date().toISOString() };
    await database.datasets.put(result); await database.operations.add({ id: requestId, revision: result.revision }); return result;
  });
}
export async function initialize(database: CafeDB, load: () => Data) {
  const found = await database.datasets.get('active');
  if (found) { if (!found.initializationComplete || found.dataSchemaVersion !== 1 || found.calculationVersion !== 1) throw new AppError('저장 상태 또는 버전을 확인할 수 없습니다. 기존 자료는 유지합니다.'); return found; }
  const seed = load();
  return database.transaction('rw', database.datasets, async () => {
    const existing = await database.datasets.get('active');
    if (existing) return existing;
    const snapshot: Snapshot = { key: 'active', data: seed, revision: 1, initializationComplete: true, lastSuccess: new Date().toISOString(), dataSchemaVersion: 1, calculationVersion: 1 };
    await database.datasets.add(snapshot); return snapshot;
  });
}
export type SaleCommand = { kind: 'save'; input: SaleInput; previousId?: string; id: string; confirmedWarnings: string[] } | { kind: 'delete'; previousId: string; confirmed: true };
export async function changeSales(database: CafeDB, expected: Snapshot, requestId: string, command: SaleCommand): Promise<Snapshot> {
  let next: Sale | undefined;
  const previous = command.previousId ? expected.data.sales.find(s => s.sale_id === command.previousId) : undefined;
  if (command.previousId && !previous) throw new AppError('대상이 없습니다. 목록을 다시 확인해 주세요.', 'CONFLICT');
  if (command.kind === 'save') {
    next = makeSale(expected.data, command.input, previous, command.id);
    if (warnings(expected.data, next, previous).some(w => !command.confirmedWarnings.includes(w))) throw new AppError('주의사항을 확인한 뒤 저장해 주세요.');
  }
  const sales = expected.data.sales.filter(s => s.sale_id !== previous?.sale_id);
  if (next) sales.push(next);
  return database.transaction('rw', database.datasets, database.operations, async () => {
    const current = await database.datasets.get('active');
    if (!current) throw new AppError('저장 자료를 읽을 수 없습니다.', 'STORAGE');
    if (await database.operations.get(requestId)) return current;
    if (current.revision !== expected.revision) throw new AppError('다른 창에서 자료가 변경되었습니다. 입력은 유지했습니다. 취소 후 최신 목록에서 다시 열어 주세요.', 'CONFLICT');
    const result: Snapshot = { ...current, data: { ...current.data, sales }, revision: current.revision + 1, lastSuccess: new Date().toISOString() };
    await database.datasets.put(result); await database.operations.add({ id: requestId, revision: result.revision }); return result;
  });
}
