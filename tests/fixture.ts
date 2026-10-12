import { seedData } from '../src/io/seed';
import type { SaleInput } from '../src/domain/types';
export const input: SaleInput = { date: '2026-09-19', menu_id: 'M02', channel: '포장', quantity: '20', unit_price: '5000', discount_amount: '2000', payment_fee: '1500' };
export function fixture() {
  const data = seedData(); data.sales = []; data.inventory_events = [];
  data.opening_inventory = data.materials.map(m => ({ material_id: m.material_id, date: '2025-07-01', quantity: '100000', unit: m.unit }));
  for (const p of data.price_history) { if (p.material_id === 'I01') { p.pack_price = '30000'; p.pack_quantity = '1000'; } if (p.material_id === 'I02') { p.pack_price = '2000'; p.pack_quantity = '1000'; } if (p.material_id === 'I10') { p.pack_price = '15000'; p.pack_quantity = '100'; } }
  return data;
}
