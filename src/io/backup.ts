import { isLosslessNumber, LosslessNumber, parse, stringify } from 'lossless-json';
import { aggregate, balances, dec, recipeFor, today } from '../domain/calculations';
import { expenseCategories } from '../domain/operations';
import { AppError, type Data, type Snapshot } from '../domain/types';
import { validateData, validateSaleRecord } from './validation';

export const backupIdentifier = 'prep-cafe-ops-backup';
export interface Backup { identifier: typeof backupIdentifier; backupFormatVersion: 1; dataSchemaVersion: 1; calculationVersion: 1; createdAt: string; data: Data }
const numeric = new Set(['quantity', 'price', 'unit_price', 'discount_amount', 'net_sales', 'payment_fee', 'unit_food_cost_snapshot', 'unit_packaging_cost_snapshot', 'pack_quantity', 'base_pack_price', 'lead_days', 'safety_days', 'pack_price', 'counted_quantity', 'unit_cost', 'amount', 'seed', 'waste_cost_snapshot']);
// Only a successfully decoded, deeply immutable object can reuse validation.
const verified = new WeakMap<object, string>();
function freezeTree(value: unknown) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
}
function wire(value: unknown, key = ''): unknown {
  if (value == null) return value;
  if (typeof value === 'string' && numeric.has(key)) { dec(value); return new LosslessNumber(value); }
  if (Array.isArray(value)) return value.map(v => wire(v));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, wire(v, k)]));
  return value;
}
function internal(value: unknown, key = ''): unknown {
  if (isLosslessNumber(value)) {
    if (key === 'recordVersion') { const n = dec(value.value); if (!n.isInteger() || n.lt(0) || n.gt(Number.MAX_SAFE_INTEGER)) throw new AppError('기록 버전이 올바르지 않습니다.', 'BACKUP_FORMAT'); return Number(value.value); }
    return value.value;
  }
  if (Array.isArray(value)) return value.map(v => internal(v));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, internal(v, k)]));
  return value;
}
function keys(value: unknown, allowed: string[], path: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(`${path} 자료 구조가 올바르지 않습니다.`, 'BACKUP_FORMAT');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new AppError(`${path}.${key}: 허용하지 않은 항목입니다.`, 'BACKUP_FORMAT');
}
const allowedRows: Record<string, string[]> = {
  suppliers: ['supplier_id', 'name', 'data_class'], materials: ['material_id', 'name', 'unit', 'pack_quantity', 'base_pack_price', 'lead_days', 'safety_days', 'supplier_id'],
  menus: ['menu_id', 'name', 'price', 'category', 'recipe_version'], recipes: ['recipe_version', 'menu_id', 'material_id', 'quantity', 'unit', 'channel_only'],
  price_history: ['material_id', 'effective_date', 'pack_price', 'pack_quantity'], calendar: ['date', 'is_open', 'record_complete', 'weather', 'note'],
  sales: ['sale_id', 'date', 'menu_id', 'channel', 'quantity', 'unit_price', 'discount_amount', 'net_sales', 'payment_fee', 'recipe_version', 'unit_food_cost_snapshot', 'unit_packaging_cost_snapshot', 'origin', 'recordVersion', 'original', 'cost_basis'],
  opening_inventory: ['material_id', 'date', 'quantity', 'unit'], inventory_events: ['event_id', 'date', 'material_id', 'event_type', 'quantity', 'counted_quantity', 'unit', 'reason', 'unit_cost', 'supplier_id', 'origin', 'recordVersion', 'waste_cost_snapshot', 'cost_basis'],
  expenses: ['expense_id', 'date', 'category', 'amount', 'recognition', 'origin', 'recordVersion'], monthly_expense_plan: ['month', 'category', 'amount'],
};
function safeTree(value: unknown, depth = 0) {
  if (depth > 100) throw new AppError('자료 중첩 구조가 지나치게 깊습니다.', 'BACKUP_FORMAT');
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new AppError('안전하지 않은 자료 항목을 발견했습니다.', 'BACKUP_FORMAT');
    safeTree(child, depth + 1);
  }
}
export function validateBackupData(candidate: unknown): Data {
  if (candidate && typeof candidate === 'object' && verified.get(candidate) === today()) return candidate as Data;
  safeTree(candidate);
  keys(candidate, ['meta', ...Object.keys(allowedRows), 'settings'], 'data');
  const raw = candidate as Record<string, unknown>;
  keys(raw.meta, ['dataset_id', 'version', 'data_class', 'store_name', 'start_date', 'as_of', 'currency', 'amount_basis', 'source', 'seed'], 'meta');
  for (const [table, allowed] of Object.entries(allowedRows)) {
    if (!Array.isArray(raw[table])) throw new AppError(`${table} 목록이 없습니다.`, 'BACKUP_FORMAT');
    for (const row of raw[table] as Record<string, unknown>[]) {
      keys(row, allowed, table);
      if (table === 'sales' && row.original != null) { keys(row.original, allowed.filter(k => k !== 'original'), 'sales.original'); }
      for (const key of ['reason', 'supplier_id', 'origin', 'recognition']) if (row[key] !== undefined && typeof row[key] !== 'string') throw new AppError(`${table}.${key}는 문자여야 합니다.`, 'BACKUP_FORMAT');
      if (row.recordVersion !== undefined && (!Number.isSafeInteger(row.recordVersion) || Number(row.recordVersion) < 0)) throw new AppError('기록 버전이 올바르지 않습니다.', 'BACKUP_FORMAT');
      if (row.cost_basis !== undefined && (!Array.isArray(row.cost_basis) || !row.cost_basis.every(v => typeof v === 'string'))) throw new AppError('원가 근거 형식이 올바르지 않습니다.', 'BACKUP_FORMAT');
    }
  }
  const data = validateData(candidate);
  if (!data.menus.length || !data.materials.length || !data.suppliers.length || !data.recipes.length) throw new AppError('필수 메뉴·재료·공급사·레시피가 없습니다.', 'BACKUP_FORMAT');
  if (data.meta.currency !== 'KRW' || data.meta.start_date > data.meta.as_of) throw new AppError('통화·자료 기간을 확인해 주세요.', 'BACKUP_FORMAT');
  const unique = (values: string[], name: string) => { if (new Set(values).size !== values.length) throw new AppError(`${name} 중복입니다.`, 'BACKUP_FORMAT'); };
  const supplier = new Set(data.suppliers.map(s => s.supplier_id));
  if (data.materials.some(m => !supplier.has(m.supplier_id) || !dec(m.pack_quantity).gt(0))) throw new AppError('재료의 공급사·구매용량 연결이 올바르지 않습니다.', 'BACKUP_FORMAT');
  unique(data.recipes.map(r => `${r.recipe_version}/${r.menu_id}/${r.material_id}/${r.channel_only || ''}`), '레시피');
  unique(data.price_history.map(p => `${p.material_id}/${p.effective_date}`), '가격 적용일');
  unique(data.opening_inventory.map(o => o.material_id), '초기재고 재료');
  unique(data.inventory_events.filter(e => e.counted_quantity != null).map(e => `${e.date}/${e.material_id}`), '실측 날짜·재료');
  unique(data.monthly_expense_plan.map(e => `${e.month}/${e.category}`), '월비용계획');
  const actualDates = [...data.sales, ...data.expenses, ...data.inventory_events, ...data.opening_inventory].map(r => r.date);
  if (actualDates.some(date => date < data.meta.start_date || date > today())) throw new AppError('실제 기록에 시작 전·미래 날짜가 있습니다.', 'BACKUP_FORMAT');
  for (const menu of data.menus) if (!data.recipes.some(r => r.menu_id === menu.menu_id && r.recipe_version === menu.recipe_version)) throw new AppError('메뉴의 현재 레시피 연결이 없습니다.', 'BACKUP_FORMAT');
  for (const s of data.sales) {
    const records = s.original ? [s, validateSaleRecord(s.original)] : [s];
    for (const sale of records) { recipeFor(data, sale); if (!dec(sale.quantity).isInteger() || !dec(sale.quantity).gt(0) || dec(sale.discount_amount).gt(dec(sale.quantity).times(sale.unit_price).toDecimalPlaces(0))) throw new AppError('판매 수량·할인 수치가 올바르지 않습니다.', 'BACKUP_FORMAT'); }
  }
  for (const e of data.inventory_events) {
    if (e.quantity == null && e.counted_quantity == null) throw new AppError('실측값과 조정량이 모두 없습니다.', 'BACKUP_FORMAT');
    if ((e.event_type === '입고' && (e.quantity == null || !dec(e.quantity).gt(0))) || (e.event_type === '폐기' && (e.quantity == null || !dec(e.quantity).lt(0))) || (e.event_type !== '실사조정' && e.counted_quantity != null)) throw new AppError('재고 유형·증감 방향·실측값이 맞지 않습니다.', 'BACKUP_FORMAT');
    if (e.supplier_id && !supplier.has(e.supplier_id)) throw new AppError('알 수 없는 입고 공급사입니다.', 'BACKUP_FORMAT');
    for (const value of [e.unit_cost, e.waste_cost_snapshot]) if (value != null && dec(value).lt(0)) throw new AppError('재고 원가가 음수입니다.', 'BACKUP_FORMAT');
  }
  if (data.expenses.some(e => !expenseCategories.includes(e.category as typeof expenseCategories[number]) || !dec(e.amount).gt(0) || !dec(e.amount).isInteger())) throw new AppError('비용 항목·금액이 올바르지 않습니다.', 'BACKUP_FORMAT');
  if (data.monthly_expense_plan.some(p => !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month) || !expenseCategories.includes(p.category as typeof expenseCategories[number]))) throw new AppError('월비용계획 기간·항목이 올바르지 않습니다.', 'BACKUP_FORMAT');
  aggregate(data.sales); balances(data, today()); // Check replay without changing the records or filling missing costs with zero.
  return data;
}
export function encodeBackup(snapshot: Snapshot, timestamp = new Date()): string {
  const backup: Backup = { identifier: backupIdentifier, backupFormatVersion: 1, dataSchemaVersion: 1, calculationVersion: 1, createdAt: timestamp.toISOString(), data: snapshot.data };
  const encoded = stringify(wire(backup));
  if (!encoded) throw new AppError('백업 파일을 준비하지 못했습니다.', 'BACKUP_FORMAT');
  return encoded;
}
export function decodeBackup(text: string): Backup {
  if (!text.trim()) throw new AppError('비어 있는 백업 파일입니다.', 'BACKUP_FORMAT');
  let raw: unknown;
  try {
    const normalized = text.replace(/^\uFEFF/, '');
    // Safety-only pass: never use these Number values for data or calculations.
    // Native JSON.parse retains __proto__ as an own key, including Unicode escapes.
    JSON.parse(normalized, (key, value: unknown) => { if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new AppError('안전하지 않은 자료 항목을 발견했습니다.', 'BACKUP_FORMAT'); return value; });
    raw = internal(parse(normalized, undefined, { onDuplicateKey: () => { throw new Error('duplicate'); } }));
  }
  catch (e) { if (e instanceof AppError) throw e; throw new AppError('JSON이 손상됐거나 중복 속성명이 있습니다. 원본은 유지합니다.', 'BACKUP_FORMAT'); }
  keys(raw, ['identifier', 'backupFormatVersion', 'dataSchemaVersion', 'calculationVersion', 'createdAt', 'data'], 'backup');
  const parsed = raw as Record<string, unknown>;
  if (parsed.identifier !== backupIdentifier || parsed.backupFormatVersion !== '1' || parsed.dataSchemaVersion !== '1' || parsed.calculationVersion !== '1') throw new AppError('제품 백업이 아니거나 지원하지 않는 버전입니다. 원본 운영 JSON은 복원 파일이 아닙니다.', 'BACKUP_FORMAT');
  if (typeof parsed.createdAt !== 'string' || !Number.isFinite(Date.parse(parsed.createdAt))) throw new AppError('백업 생성시각을 확인할 수 없습니다.', 'BACKUP_FORMAT');
  const data = validateBackupData(parsed.data);
  freezeTree(data); verified.set(data, today());
  return { identifier: backupIdentifier, backupFormatVersion: 1, dataSchemaVersion: 1, calculationVersion: 1, createdAt: parsed.createdAt, data };
}
export function backupFileName(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(date).replace(/[-:]/g, '').replace(' ', '_');
  return `프렙카페_전체백업_${parts}.json`;
}
export function dataDescription(data: Data) {
  const dates = [...data.sales, ...data.expenses, ...data.inventory_events].map(e => e.date).sort();
  return `판매 ${data.sales.length.toLocaleString()}건 · 비용 ${data.expenses.length.toLocaleString()}건 · 재고 ${data.inventory_events.length.toLocaleString()}건 · ${dates.length ? dates[0] + '~' + dates[dates.length - 1] : '활동 기록 없음'} · 메뉴 ${data.menus.length}개 / 재료 ${data.materials.length}개`;
}
