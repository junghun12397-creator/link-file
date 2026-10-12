import { z } from 'zod';
import { balances, dec, status, today, validDate } from './calculations';
import { wasteAmount } from './operations';
import { AppError, type Data, type InventoryEvent, type InventoryInput } from './types';
const shape = z.object({ date: z.string(), material_id: z.string(), event_type: z.enum(['입고', '폐기', '실사조정']), quantity: z.string(), reason: z.string(), supplier_id: z.string(), unit_cost: z.string() });
export function makeInventory(data: Data, input: InventoryInput, id: string = crypto.randomUUID(), currentDate = today()): InventoryEvent {
  if (!shape.safeParse(input).success) throw new AppError('재고 입력 항목을 확인해 주세요.');
  if (!validDate(input.date) || input.date < data.meta.start_date || input.date > currentDate) throw new AppError(`기록일은 ${data.meta.start_date}부터 오늘까지 입력할 수 있습니다.`, 'VALIDATION', 'date');
  const material = data.materials.find(m => m.material_id === input.material_id);
  if (!material) throw new AppError('등록된 재료를 선택해 주세요.', 'VALIDATION', 'material_id');
  if (!/^\d+(?:\.\d{1,3})?$/.test(input.quantity)) throw new AppError('수량은 g·ml 소수 3자리까지, 개는 정수로 입력해 주세요.', 'VALIDATION', 'quantity');
  const quantity = dec(input.quantity);
  if (quantity.precision() > 18 || (material.unit === '개' && !quantity.isInteger()) || (input.event_type !== '실사조정' && !quantity.gt(0))) throw new AppError('입고·폐기는 양수, 실제 재고는 0 이상이며 개 단위는 정수여야 합니다.', 'VALIDATION', 'quantity');
  if (input.event_type === '폐기' && !input.reason.trim()) throw new AppError('폐기 사유를 입력해 주세요.', 'VALIDATION', 'reason');
  if (input.event_type === '입고' && input.supplier_id && !data.suppliers.some(s => s.supplier_id === input.supplier_id)) throw new AppError('등록된 공급사를 선택해 주세요.', 'VALIDATION', 'supplier_id');
  if (input.event_type === '입고' && input.unit_cost && (!/^\d+(?:\.\d+)?$/.test(input.unit_cost) || dec(input.unit_cost).precision() > 18)) throw new AppError('입고 단위원가는 0 이상 숫자로 입력하거나 비워 주세요.', 'VALIDATION', 'unit_cost');
  if (input.event_type === '실사조정' && data.inventory_events.some(e => e.date === input.date && e.material_id === input.material_id && e.counted_quantity != null)) throw new AppError('같은 날짜·재료의 실제 재고가 이미 있습니다. 하루 한 번의 마감 실측만 기록합니다.', 'DUPLICATE');
  const event: InventoryEvent = { event_id: id, date: input.date, material_id: material.material_id, event_type: input.event_type, unit: material.unit, quantity: input.event_type === '폐기' ? quantity.negated().toString() : quantity.toString(), reason: input.reason.trim(), origin: '직접 입력', recordVersion: 1 };
  if (input.event_type === '입고') { if (input.supplier_id) event.supplier_id = input.supplier_id; if (input.unit_cost) event.unit_cost = dec(input.unit_cost).toString(); }
  if (input.event_type === '폐기') {
    event.waste_cost_snapshot = wasteAmount(data, event).toString();
    const price = data.price_history.filter(p => p.material_id === material.material_id && p.effective_date <= event.date).sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
    event.cost_basis = [`${input.quantity}${material.unit} × (${price.pack_price}원 ÷ ${price.pack_quantity}${material.unit}), 적용일 ${price.effective_date}`];
  }
  if (input.event_type === '실사조정') { const before = balances(data, input.date).get(material.material_id)!.amount; event.counted_quantity = quantity.toString(); event.quantity = before == null ? null : quantity.minus(before).toString(); }
  return event;
}
const cache = new WeakMap<Data, Map<string, ReturnType<typeof balances>>>();
export function inventoryPreview(data: Data, event: InventoryEvent) {
  let dates = cache.get(data); if (!dates) { dates = new Map(); cache.set(data, dates); }
  let baseline = dates.get(event.date); if (!baseline) { baseline = balances(data, event.date); dates.set(event.date, baseline); }
  const before = baseline.get(event.material_id)!;
  const anchored = data.inventory_events.some(e => e.date === event.date && e.material_id === event.material_id && e.counted_quantity != null);
  const after = event.counted_quantity != null ? { amount: dec(event.counted_quantity), provisional: false } : anchored ? before : { amount: before.amount == null ? null : before.amount.plus(event.quantity!), provisional: before.provisional || status(data, event.date) !== '확정' };
  return { before, after };
}
export function inventoryWarnings(data: Data, event: InventoryEvent) {
  const preview = inventoryPreview(data, event);
  return preview.after.amount?.lt(0) ? ['계산 잔량이 음수입니다. 입고 누락·실제 수량을 확인한 뒤 저장할까요?'] : [];
}
