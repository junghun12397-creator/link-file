import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Dialog, errorMessage, fmt } from '../app/ui';
import { balances, dec, status, today } from '../domain/calculations';
import { inventoryPreview, inventoryWarnings, makeInventory } from '../domain/inventory';
import { inPeriod } from '../domain/operations';
import { AppError, type InventoryEvent, type InventoryInput, type Snapshot } from '../domain/types';
import { changeInventory, db } from '../storage/store';
import styles from '../styles/App.module.css';
function currentAdjustment(snapshot: Snapshot, event: InventoryEvent) {
  if (event.counted_quantity == null) return event.quantity;
  const before = balances(snapshot.data, event.date, event.event_id).get(event.material_id)!.amount;
  return before == null ? null : dec(event.counted_quantity).minus(before);
}
const labels = { 입고: '입고', 폐기: '폐기', 실사조정: '실제 재고' };
function StockForm({ snapshot, kind, date, onClose, onSaved }: { snapshot: Snapshot; kind: InventoryInput['event_type']; date: string; onClose: () => void; onSaved: (s: Snapshot, date: string) => void }) {
  const defaults: InventoryInput = { date, material_id: '', event_type: kind, quantity: '', reason: '', supplier_id: '', unit_cost: '' };
  const [input, setInput] = useState(defaults); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [request, setRequest] = useState(() => crypto.randomUUID()); const id = useRef(crypto.randomUUID());
  const dirty = JSON.stringify(input) !== JSON.stringify(defaults);
  const close = () => { if (!busy && (!dirty || window.confirm('저장하지 않은 재고 입력을 버리고 닫을까요?'))) onClose(); };
  const update = (key: keyof InventoryInput, value: string) => { setInput(i => ({ ...i, [key]: value })); setError(''); setRequest(crypto.randomUUID()); };
  const preview = useMemo(() => { try { const event = makeInventory(snapshot.data, input, id.current); return { event, ...inventoryPreview(snapshot.data, event), error: '' }; } catch (e) { return { error: errorMessage(e), event: null }; } }, [snapshot, input]);
  const material = snapshot.data.materials.find(m => m.material_id === input.material_id);
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return;
    try {
      const event = makeInventory(snapshot.data, input, id.current), warnings = inventoryWarnings(snapshot.data, event);
      for (const warning of warnings) if (!window.confirm(warning)) return;
      setBusy(true); setError(''); const result = await changeInventory(db, snapshot, request, input, id.current, warnings); onSaved(result, event.date);
    } catch (e) { setError(errorMessage(e)); if (e instanceof AppError && e.field) document.getElementById('stock-' + e.field)?.focus(); } finally { setBusy(false); }
  };
  return <Dialog label={`${labels[kind]} 기록`} onClose={close}><header className={styles.dialogHeader}><div><h2>{labels[kind]} 기록</h2><p>실제 기록만 입력합니다. 저장 전에는 원장과 잔량이 바뀌지 않습니다.</p></div><button disabled={busy} aria-label="닫기" onClick={close}>×</button></header><form onSubmit={save} noValidate><div className={styles.formGrid}>
    <label>기록일<input id="stock-date" type="date" min={snapshot.data.meta.start_date} max={today()} value={input.date} onChange={e => update('date', e.target.value)} disabled={busy}/></label>
    <label>재료<select id="stock-material_id" value={input.material_id} onChange={e => update('material_id', e.target.value)} disabled={busy}><option value="">재료 선택</option>{snapshot.data.materials.map(m => <option value={m.material_id} key={m.material_id}>{m.name}</option>)}</select></label>
    <label>{kind === '실사조정' ? '직접 센 마감 수량' : kind + ' 수량'} ({material?.unit || '재료 선택'})<input id="stock-quantity" inputMode={material?.unit === '개' ? 'numeric' : 'decimal'} value={input.quantity} onChange={e => update('quantity', e.target.value)} disabled={busy}/><small>단위 자동 적용 · g/ml 소수 3자리 · 개는 정수{kind === '실사조정' ? ' · 실제 0 허용' : ' · 양의 수량'}</small></label>
    <label>{kind === '폐기' ? '폐기 사유 (필수)' : '사유 (선택)'}<input id="stock-reason" value={input.reason} onChange={e => update('reason', e.target.value)} disabled={busy}/><small>불필요한 개인정보를 입력하지 마세요.</small></label>
    {kind === '입고' && <><label>공급사 (선택)<select id="stock-supplier_id" value={input.supplier_id} onChange={e => update('supplier_id', e.target.value)} disabled={busy}><option value="">미입력</option>{snapshot.data.suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.name}</option>)}</select></label><label>입고 단위원가 (원/{material?.unit || '기준단위'}, 선택)<input id="stock-unit_cost" inputMode="decimal" value={input.unit_cost} onChange={e => update('unit_cost', e.target.value)} disabled={busy}/><small>기록용입니다. 날짜별 가격이력이나 판매 원가를 바꾸지 않습니다.</small></label></>}
    </div><section aria-label="재고 미리보기" className={styles.preview}><h3>저장 전 미리보기 · {status(snapshot.data, input.date)}</h3>{preview.event ? <><p>기준일 {input.date} · 이전 {fmt(preview.before!.amount, material?.unit === '개' ? 0 : 3)}{material?.unit} → 저장 후 {fmt(preview.after!.amount, material?.unit === '개' ? 0 : 3)}{material?.unit}</p>{kind === '폐기' && <p>명시적 폐기 손실 {fmt(preview.event.waste_cost_snapshot)}원 · 메뉴 수익 불변, 매장 손익에서 한 번 차감</p>}{kind === '실사조정' && <p>실사 차이 {fmt(preview.event.quantity, material?.unit === '개' ? 0 : 3)}{material?.unit} · 마감 잔량을 실측값으로 교체, 자동 폐기 비용 없음</p>}{preview.event.cost_basis?.map(b => <p key={b}>{b}</p>)}</> : <p>{preview.error}</p>}<p>{kind === '입고' ? '입고대금을 운영비로 자동 추가하지 않습니다. 같은 날 마감 실측이 있으면 그 실측값이 최종 잔량입니다.' : kind === '폐기' ? '폐기 수량은 양수로 입력하며 저장할 때 감소량으로 기록합니다. 같은 날 실측 이후의 마감 잔량은 실측값을 따릅니다.' : '하루·재료별 마감 실측은 한 번입니다. 이후에 입력한 과거 판매도 해당 실측값을 소급 변경하지 않습니다.'}</p></section>{error && <p role="alert" className={styles.error}>{error}</p>}<footer className={styles.dialogFooter}><button type="button" onClick={close} disabled={busy}>취소</button><button type="submit" className={styles.primary} disabled={busy}>{busy ? '실제 저장 중…' : labels[kind] + ' 기록 저장'}</button></footer></form></Dialog>;
}
export function StockRecords({ snapshot, mode, period, newDate, onSaved }: { snapshot: Snapshot; mode: string; period: string; newDate: string; onSaved: (s: Snapshot, date: string) => void }) {
  const [form, setForm] = useState<{ snapshot: Snapshot; kind: InventoryInput['event_type'] }>(); const [page, setPage] = useState(1);
  const [material, setMaterial] = useState('');
  const records = snapshot.data.inventory_events.filter(e => inPeriod(e.date, mode, period) && (!material || e.material_id === material)).sort((a, b) => b.date.localeCompare(a.date) || b.event_id.localeCompare(a.event_id));
  const pages = Math.ceil(records.length / 8), current = Math.max(1, Math.min(page, pages || 1));
  return <><section className={styles.toolbar} aria-label="재고 기록 입력">{(['입고', '폐기', '실사조정'] as const).map(kind => <button key={kind} className={kind === '입고' ? styles.primary : ''} onClick={() => setForm({ snapshot, kind })}>＋ {labels[kind]} 기록</button>)}</section>
    <section className={styles.tableCard}><div className={styles.tableHeading}><h2>재고 기록 원장</h2><span>{records.length}건 · 입고/폐기/실측은 하루의 처리 순서로 집계</span><label>기록 재료<select aria-label="재고 기록 재료 필터" value={material} onChange={e => { setMaterial(e.target.value); setPage(1); }}><option value="">전체 재료</option>{snapshot.data.materials.map(m => <option key={m.material_id} value={m.material_id}>{m.name}</option>)}</select></label></div><div className={styles.tableScroll}><table><thead><tr>{['기록일 / 상태', '재료', '유형', '증감량 / 실사 차이', '실측 마감 수량', '사유 / 출처', '원가 근거'].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{records.slice((current - 1) * 8, current * 8).map(e => <tr key={e.event_id}><td>{e.date}<small className={styles.block}>{status(snapshot.data, e.date)}</small></td><td>{snapshot.data.materials.find(m => m.material_id === e.material_id)?.name}</td><td>{e.event_type === '실사조정' ? '실제 재고 / 조정' : e.event_type}</td><td>{fmt(currentAdjustment(snapshot, e), e.unit === '개' ? 0 : 3)}{e.unit}<small className={styles.block}>{e.counted_quantity != null ? `현재 원장 기준 차이 · 입력 당시 ${fmt(e.quantity, e.unit === '개' ? 0 : 3)}${e.unit}` : ''}</small></td><td>{e.counted_quantity != null ? `${fmt(e.counted_quantity, e.unit === '개' ? 0 : 3)}${e.unit}` : '—'}</td><td>{e.reason || '—'}<small className={styles.block}>{e.origin || '초기 자료'} · {e.event_id}</small></td><td>{e.waste_cost_snapshot != null ? `폐기 손실 ${fmt(e.waste_cost_snapshot)}원` : e.unit_cost != null ? `입고 ${fmt(e.unit_cost, 4)}원/${e.unit}` : '—'}{e.cost_basis?.map(b => <small className={styles.block} key={b}>{b}</small>)}</td></tr>)}{!records.length && <tr><td colSpan={7} className={styles.empty}>재고 기록 없음 · 0건</td></tr>}</tbody></table></div><div className={styles.pagination}><span>{pages ? `${current} / ${pages} 페이지` : '0건 · 페이지 없음'}</span><div><button disabled={current <= 1} onClick={() => setPage(current - 1)}>이전 재고 기록</button><button disabled={!pages || current >= pages} onClick={() => setPage(current + 1)}>다음 재고 기록</button></div></div></section><p className={styles.subtle}>1차에는 재고 기록 수정·삭제 기능이 없습니다. 실사 차이는 현재 원장 기준으로 다시 계산하며 입력 당시 차이도 보존합니다. 과거 판매 수정 시 마감 잔량은 실측값을 유지합니다.</p>
    {form && <StockForm snapshot={form.snapshot} kind={form.kind} date={newDate} onClose={() => setForm(undefined)} onSaved={(s, date) => { setForm(undefined); setPage(1); onSaved(s, date); }}/>}</>;
}
