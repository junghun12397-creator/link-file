import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Dialog, errorMessage, fmt, percentage } from '../app/ui';
import { balances, dec, status, today } from '../domain/calculations';
import { duplicateExpense, expenseCategories, inPeriod, inventoryBasis, makeExpense, storeResult } from '../domain/operations';
import { AppError, type Data, type Expense, type ExpenseInput, type Snapshot } from '../domain/types';
import { changeExpenses, db } from '../storage/store';
import styles from '../styles/App.module.css';

function ExpenseForm({ snapshot, previous, date, onSaved, onClose }: { snapshot: Snapshot; previous?: Expense; date: string; onSaved: (s: Snapshot, e: Expense) => void; onClose: () => void }) {
  const defaults: ExpenseInput = previous ? { date: previous.date, category: previous.category, amount: previous.amount } : { date, category: '', amount: '' };
  const [input, setInput] = useState(defaults); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState(() => crypto.randomUUID()); const id = useRef(previous?.expense_id || crypto.randomUUID());
  const dirty = JSON.stringify(input) !== JSON.stringify(defaults);
  const close = () => { if (!busy && (!dirty || window.confirm('저장하지 않은 비용 입력을 버리고 닫을까요?'))) onClose(); };
  const update = (key: keyof ExpenseInput, value: string) => { setInput(i => ({ ...i, [key]: value })); setRequest(crypto.randomUUID()); setError(''); };
  const existing = snapshot.data.expenses.filter(e => e.date === input.date && (!input.category || e.category === input.category));
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    try {
      const expense = makeExpense(snapshot.data, input, previous, id.current);
      const duplicate = duplicateExpense(snapshot.data, expense);
      if (duplicate && !window.confirm('동일 날짜·항목·금액의 비용이 이미 있습니다. 별도 지출이 맞아 한 건 더 저장할까요?')) return;
      setBusy(true); setError('');
      const result = await changeExpenses(db, snapshot, request, { kind: 'save', input, previousId: previous?.expense_id, id: id.current, duplicateConfirmed: duplicate });
      onSaved(result, expense);
    } catch (e) { setError(errorMessage(e)); if (e instanceof AppError && e.field) document.getElementById('expense-' + e.field)?.focus(); }
    finally { setBusy(false); }
  };
  return <Dialog label={previous ? '비용 수정' : '비용 등록'} onClose={close}><header className={styles.dialogHeader}><div><h2>{previous ? '비용 기록 수정' : '비용 기록 등록'}</h2><p>귀속일은 이 비용을 어느 날짜의 실적으로 볼지 정하는 날입니다.</p></div><button aria-label="닫기" disabled={busy} onClick={close}>×</button></header>
    <form onSubmit={save} noValidate><div className={styles.formGrid}>
      <label>귀속일<input id="expense-date" type="date" min={snapshot.data.meta.start_date} max={today()} value={input.date} onChange={e => update('date', e.target.value)} disabled={busy}/></label>
      <label>비용항목<select id="expense-category" value={input.category} onChange={e => update('category', e.target.value)} disabled={busy}><option value="">항목 선택</option>{expenseCategories.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>금액 (원)<input id="expense-amount" inputMode="numeric" value={input.amount} onChange={e => update('amount', e.target.value)} disabled={busy}/><small>양의 정수 원 · 0원·환급·미래 비용계획은 입력하지 않습니다.</small></label>
    </div><section aria-label="비용 반영 안내" className={styles.preview}><h3>저장 시 반영</h3><p>{input.date || '선택 귀속일'}에 {input.amount ? fmt(input.amount) : '입력 금액'}원 전액 반영 · {status(snapshot.data, input.date)}. 자동 일할 배분하지 않습니다.</p>{previous && <p>기존 {previous.date} · {previous.category} · {fmt(previous.amount)}원을 교체합니다. 기존 배분기준: {previous.recognition || '기록 없음'} (보존).</p>}<p>재료 입고 대금과 이미 평가한 폐기 손실을 운영비로 다시 넣지 마세요. 월계획은 참고값입니다.</p>
      <details open><summary>같은 귀속일·항목의 기존 비용 {existing.length}건</summary>{existing.length ? <ul>{existing.map(e => <li key={e.expense_id}>{e.category} · {fmt(e.amount)}원 · {e.recognition || '기준 기록 없음'}{e.expense_id === previous?.expense_id ? ' (수정 대상)' : ''}</li>)}</ul> : <p>기존 비용 없음 · 추가 지출 여부를 확인하세요.</p>}</details>
    </section>{error && <p role="alert" className={styles.error}>{error}</p>}<footer className={styles.dialogFooter}><button type="button" onClick={close} disabled={busy}>취소</button><button className={styles.primary} disabled={busy} type="submit">{busy ? '실제 저장 중…' : '비용 기록 저장'}</button></footer></form></Dialog>;
}

export function Expenses({ snapshot, mode, period, newDate, onSaved }: { snapshot: Snapshot; mode: string; period: string; newDate: string; onSaved: (s: Snapshot, date?: string) => void }) {
  const [category, setCategory] = useState(''); const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ snapshot: Snapshot; expense?: Expense }>();
  const [deletion, setDeletion] = useState<{ snapshot: Snapshot; expense: Expense; request: string }>();
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const data = snapshot.data;
  const list = useMemo(() => data.expenses.filter(e => inPeriod(e.date, mode, period) && (!category || e.category === category)).sort((a, b) => b.date.localeCompare(a.date) || a.category.localeCompare(b.category) || a.expense_id.localeCompare(b.expense_id)), [data, mode, period, category]);
  const pages = Math.ceil(list.length / 8), current = Math.max(1, Math.min(page, pages || 1));
  const remove = async () => {
    if (!deletion || busy) return; setBusy(true); setError('');
    try { const result = await changeExpenses(db, deletion.snapshot, deletion.request, { kind: 'delete', previousId: deletion.expense.expense_id, confirmed: true }); setDeletion(undefined); onSaved(result); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return <>
    <section className={styles.toolbar} aria-label="비용 조건"><label>비용항목<select aria-label="비용항목 필터" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="">전체 비용항목</option>{expenseCategories.map(c => <option key={c}>{c}</option>)}</select></label><button onClick={() => { setCategory(''); setPage(1); }}>비용항목 초기화</button><button className={styles.primary} onClick={() => setForm({ snapshot })}>＋ 비용 기록 등록</button></section>
    <div className={styles.cards}>{[true, false].map(confirmed => { const group = list.filter(e => (status(data, e.date) === '확정') === confirmed); return <article key={String(confirmed)}><span>{confirmed ? '확정 운영비 합계' : '입력 운영비 합계 (미확정)'}</span><strong>{group.length ? fmt(group.reduce((s, e) => s.plus(e.amount), dec(0))) + '원' : '비용 기록 없음'}</strong><small>{group.length}건 · 선택 항목 기준 · 기록 없음은 확정 0원이 아님</small></article>; })}</div>
    <section className={styles.tableCard}><div className={styles.tableHeading}><h2>비용 원장</h2><span>{list.length.toLocaleString()}건 · 페이지당 8건</span></div><div className={styles.tableScroll}><table><thead><tr>{['귀속일 / 마감', '비용항목', '금액 (원)', '출처 / 배분기준', '관리'].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{list.slice((current - 1) * 8, current * 8).map(e => <tr key={e.expense_id}><td>{e.date}<small className={styles.block}>{status(data, e.date)}</small></td><td>{e.category}<small className={styles.block}>{e.expense_id}</small></td><td>{fmt(e.amount)}</td><td>{e.origin || '초기 자료'}<small className={styles.block}>{e.recognition || '기준 기록 없음'}</small></td><td className={styles.rowActions}><button aria-label={`${e.date} ${e.category} ${e.amount}원 수정`} onClick={() => setForm({ snapshot, expense: e })}>수정</button><button aria-label={`${e.date} ${e.category} ${e.amount}원 삭제`} onClick={() => { setError(''); setDeletion({ snapshot, expense: e, request: crypto.randomUUID() }); }}>삭제</button></td></tr>)}{!list.length && <tr><td colSpan={5} className={styles.empty}>비용 기록 없음 · 0건</td></tr>}</tbody></table></div><div className={styles.pagination}><span>{pages ? `${current} / ${pages} 페이지` : '0건 · 페이지 없음'}</span><div><button disabled={current <= 1} onClick={() => setPage(current - 1)}>이전 비용</button><button disabled={!pages || current >= pages} onClick={() => setPage(current + 1)}>다음 비용</button></div></div></section>
    <p className={styles.info}>선택 항목은 이 원장에만 적용됩니다. 전체 매장 손익과 재료 잔량을 제한하지 않습니다. 아래에서 전체 백업·복원을 사용할 수 있습니다.</p>
    {form && <ExpenseForm snapshot={form.snapshot} previous={form.expense} date={newDate} onClose={() => setForm(undefined)} onSaved={(result, expense) => { setForm(undefined); setPage(1); onSaved(result, expense.date); }}/ >}
    {deletion && <Dialog label="비용 삭제 확인" onClose={() => !busy && setDeletion(undefined)}><header className={styles.dialogHeader}><h2>비용 기록을 삭제할까요?</h2></header><div className={styles.confirmBody}><p>{deletion.expense.date} · {deletion.expense.category} · {fmt(deletion.expense.amount)}원</p><p>해당 비용 한 건만 제거합니다. 판매량·재료 잔량은 바뀌지 않습니다.</p>{error && <p role="alert" className={styles.error}>{error}</p>}</div><footer className={styles.dialogFooter}><button disabled={busy} onClick={() => setDeletion(undefined)}>취소</button><button disabled={busy} className={styles.danger} onClick={() => void remove()}>{busy ? '삭제 저장 중…' : '삭제 확인'}</button></footer></Dialog>}
  </>;
}

export function Dashboard({ data, mode, period }: { data: Data; mode: string; period: string }) {
  const groups = useMemo(() => [true, false].map(c => ({ confirmed: c, result: storeResult(data, mode, period, c) })), [data, mode, period]);
  const plans = data.monthly_expense_plan.filter(p => p.month === period.slice(0, 7));
  return <><div className={styles.toolbar}><a href="#/sales">판매 기록 확인 →</a><a href="#/profitability">수익성 상세 →</a><a href="#/inventory">같은 기간 재료 잔량 →</a><a href="#/expenses">운영비 확인 →</a></div>
    {groups.map(({ confirmed, result: r }) => <section key={String(confirmed)} aria-label={confirmed ? '확정 매장 손익' : '입력 매장 손익 (미확정)'} className={styles.summarySection}><h2>{confirmed ? '확정 매장 손익' : '입력 매장 손익 (미확정)'}</h2><p className={styles.subtle}>판매 {r.salesCount}건 · 귀속 비용 {r.expensesCount}건 · 폐기 {r.wasteCount}건 · 전체 매장 (메뉴·채널 필터 미적용)</p>
      {!r.count ? <p className={styles.info}>실적 기록 없음 · 확정 0원 또는 입력 완료라는 뜻이 아닙니다.</p> : <>
        <div className={styles.cards}>{[['순매출', r.net], ['식재료원가', r.food], ['포장원가', r.packaging], ['결제수수료', r.fee], ['운영비', r.operating], ['명시적 폐기 손실', r.wasteCost]].map(([label, value]) => <article key={String(label)}><span>{String(label)}</span><strong>{fmt(value as ReturnType<typeof dec> | null)} <small>원</small></strong></article>)}<article className={styles.darkCard}><span>매장 손익</span><strong>{fmt(r.profit)} <small>원</small></strong><small>손익률 {percentage(r.ratio)}</small></article></div>
        <p>메뉴 수익 {fmt(r.contribution)}원 − 운영비 {fmt(r.operating)}원 − 폐기 {fmt(r.wasteCost)}원 = 매장 손익 {fmt(r.profit)}원</p>
        {!r.complete && <p role="status" className={styles.error}>계산 근거 누락 · 손익 불완전. 누락분은 0원으로 처리하지 않습니다. {r.issues.join(' / ')}</p>}
        <details><summary>운영비 항목별 근거</summary><ul>{r.expenseBreakdown.map(e => <li key={e.category}>{e.category} {fmt(e.amount)}원</li>)}</ul></details>
      </>}
    </section>)}
    <section className={styles.info}><h3>{period.slice(0, 7)} 월비용계획 · 참고만</h3><p>{plans.length ? fmt(plans.reduce((s, p) => s.plus(p.amount), dec(0))) + '원' : '계획 기록 없음'} · 실제 비용에 다시 더하지 않습니다. 일간 조회에서도 월 전체 참고값입니다.</p><p>입고대금·실사 차이를 운영비나 폐기 손실로 자동 추가하지 않습니다. 이 결과는 관리용 손익이며 세금·감가상각을 포함한 회계 결산이 아닙니다. 미확정 입력은 미래 예측이 아닙니다.</p></section></>;
}

export function Inventory({ data, mode, period }: { data: Data; mode: string; period: string }) {
  const [material, setMaterial] = useState('');
  const basis = inventoryBasis(data, mode, period);
  const stock = useMemo(() => basis.date ? balances(data, basis.date) : null, [data, basis.date]);
  return <><section aria-label="재고 기준" className={styles.info}><h2>재고 기준일: {basis.date || '계산 불가'}</h2><p>실적 조회 기간: {period} · {basis.note}</p><p>초기재고 → 입고 → 저장 판매·폐기 → 마감 실측값 순으로 반영합니다. 미확정 판매도 차감합니다. 마지막 실측 이후의 미확정 사용량 포함 여부를 재료별로 표시합니다.</p></section><div className={styles.toolbar}><label>재료<select aria-label="재료 필터" value={material} onChange={e => setMaterial(e.target.value)}><option value="">전체 재료</option>{data.materials.map(m => <option value={m.material_id} key={m.material_id}>{m.name}</option>)}</select></label><a href="#/dashboard">같은 기간 매장 손익 →</a></div>
    <section className={styles.tableCard} aria-label="재료 잔량 표"><div className={styles.tableHeading}><h2>재료 잔량</h2><span>단위별 수량 · 서로 다른 단위를 합산하지 않음</span></div><div className={styles.tableScroll}><table><thead><tr>{['재료', '마감 잔량', '단위', '기록 상태'].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{data.materials.filter(m => !material || m.material_id === material).map(m => { const s = stock?.get(m.material_id); return <tr key={m.material_id}><td>{m.name}<small className={styles.block}>{m.material_id}</small></td><td className={s?.amount?.lt(0) ? styles.negative : ''}>{fmt(s?.amount, m.unit === '개' ? 0 : 3)}</td><td>{m.unit}</td><td>{!s || s.amount === null ? '근거 부족 · 계산 불가' : `${s.amount.lt(0) ? '음수 잔량 · 기록 확인 필요 / ' : ''}${s.provisional ? '미확정 입력 포함' : '미확정 입력 영향 없음 (입력 완료 보장 아님)'}`}</td></tr>; })}</tbody></table></div></section><p className={styles.info}>안전재고·부족 판단·발주량·예측은 2차 범위입니다. 초기재고·사용량 근거가 없으면 계산 불가로 표시하며, 이후 실측값부터 다시 계산할 수 있습니다.</p></>;
}
