import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { liveQuery } from 'dexie';
import { affectedStock, aggregate, balances, dec, defaultMonth, makeSale, recipeFor, saleAmounts, status, today, unitCost, validDate, warnings } from './domain/calculations';
import { AppError, type Sale, type SaleInput, type Snapshot } from './domain/types';
import { changeSales, db, initialize } from './storage/store';
import { Dashboard, Expenses, Inventory } from './features/operations';
import { StockRecords } from './features/stock-input';
import { DataTools } from './features/data';
import { Dialog, errorMessage, fmt, percentage } from './app/ui';
import styles from './styles/App.module.css';

type Route = 'sales' | 'profitability' | 'dashboard' | 'inventory' | 'expenses';
const readRoute = (): Route => { const route = window.location.hash.slice(2); return ['sales', 'profitability', 'dashboard', 'inventory', 'expenses'].includes(route) ? route as Route : 'sales'; };
const routeTitles: Record<Route, string> = { sales: '판매 기록 관리', profitability: '메뉴별 수익성', dashboard: '대시보드 & 기간 손익', inventory: '재고 기록 & 잔량', expenses: '비용 & 데이터 보관' };
function Tag({ label }: { label: string }) { return <span className={label === '확정' ? styles.closed : styles.pending}>{label}</span>; }
function Summary({ sales, title }: { sales: Sale[]; title: string }) {
  const a = useMemo(() => aggregate(sales), [sales]);
  if (!sales.length) return <section aria-label={title} className={styles.summarySection}><h2>{title}</h2><p className={styles.subtle}>판매 기록 없음 · 이 범위의 실적이 모두 입력됐거나 0원으로 확정됐다는 뜻은 아닙니다.</p></section>;
  return <section aria-label={title} className={styles.summarySection}><h2>{title} <span className={styles.subtle}>판매 집계 {sales.length.toLocaleString()}건</span></h2>
    <div className={styles.cards}>
      <article><span>판매수량</span><strong>{fmt(a.quantity)} <small>잔/개</small></strong><small>주문 건수가 아닌 판매수량</small></article>
      <article><span>순매출</span><strong>{fmt(a.net)} <small>원</small></strong><small>정상 판매액에서 총 할인 차감</small></article>
      <article><span>식재료 · 포장 · 수수료</span><strong>{a.complete ? fmt(a.food!.plus(a.packaging!).plus(a.fee)) : '불완전'} <small>원</small></strong><small>식재료 {fmt(a.food)} / 포장 {fmt(a.packaging)} / 수수료 {fmt(a.fee)}</small></article>
      <article className={styles.darkCard}><span>메뉴 수익 · 공헌이익</span><strong>{fmt(a.profit)} <small>원</small></strong><small>{percentage(a.ratio)} · 운영비·폐기 손실 차감 전</small></article>
    </div>{!a.complete && <p role="status" className={styles.error}>당시 원가가 없는 기록이 있습니다. 관련 합계는 불완전하며 누락분을 0으로 계산하지 않습니다.</p>}</section>;
}
function SaleForm({ snapshot, previous, date, onSaved, onClose }: { snapshot: Snapshot; previous?: Sale; date: string; onSaved: (s: Snapshot, sale: Sale) => void; onClose: () => void }) {
  const data = snapshot.data;
  const defaults: SaleInput = previous ? { date: previous.date, menu_id: previous.menu_id, channel: previous.channel, quantity: previous.quantity, unit_price: previous.unit_price, discount_amount: previous.discount_amount, payment_fee: previous.payment_fee } : { date, menu_id: '', channel: '', quantity: '', unit_price: '', discount_amount: '0', payment_fee: '' };
  const [input, setInput] = useState<SaleInput>(defaults);
  const [error, setError] = useState(''); const [errorField, setErrorField] = useState<string>(); const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState(() => crypto.randomUUID());
  const id = useRef(previous?.sale_id || crypto.randomUUID());
  const dirty = JSON.stringify(input) !== JSON.stringify(defaults);
  const preview = useMemo(() => { try { return { sale: makeSale(data, input, previous, id.current), error: '' }; } catch (e) { return { sale: null, error: e instanceof Error ? e.message : '계산 불가' }; } }, [data, input, previous]);
  const stock = useMemo(() => preview.sale ? affectedStock(data, preview.sale, previous) : [], [data, preview.sale, previous]);
  const amounts = preview.sale ? saleAmounts(preview.sale) : null;
  const update = (key: keyof SaleInput, value: string) => {
    setInput(current => ({ ...current, [key]: value, ...(key === 'menu_id' ? { unit_price: data.menus.find(m => m.menu_id === value)?.price || '' } : {}) }));
    setRequest(crypto.randomUUID()); setError(''); setErrorField(undefined);
  };
  const close = () => { if (!busy && (!dirty || window.confirm('저장하지 않은 입력을 버리고 닫을까요?'))) onClose(); };
  const reset = () => { if (!dirty || window.confirm('입력을 초기화할까요? 저장된 기록은 바뀌지 않습니다.')) { setInput(defaults); setError(''); setRequest(crypto.randomUUID()); } };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return;
    try {
      const sale = makeSale(data, input, previous, id.current);
      if (previous && !window.confirm(`실제 결제수수료 ${fmt(input.payment_fee)}원을 확인했습니다. 수정 내용을 저장할까요? 수수료는 자동 비례 변경하지 않습니다.`)) return;
      const notices = warnings(data, sale, previous);
      for (const note of notices) if (!window.confirm(note)) return;
      setBusy(true); setError('');
      const result = await changeSales(db, snapshot, request, { kind: 'save', input, previousId: previous?.sale_id, id: id.current, confirmedWarnings: notices });
      onSaved(result, sale);
    } catch (e) { setError(errorMessage(e)); if (e instanceof AppError) { setErrorField(e.field); if (e.field) document.getElementById('sale-' + e.field)?.focus(); } }
    finally { setBusy(false); }
  };
  const numeric = (key: 'quantity' | 'unit_price' | 'discount_amount' | 'payment_fee', label: string, hint: string) => <label>{label}<input id={'sale-' + key} value={input[key]} inputMode={key === 'unit_price' ? 'decimal' : 'numeric'} onChange={e => update(key, e.target.value)} disabled={busy} aria-invalid={errorField === key} aria-describedby={errorField === key ? 'sale-error' : undefined}/><small>{hint}</small></label>;
  return <Dialog label={previous ? '판매 기록 수정' : '신규 판매 기록 등록'} onClose={close}>
    <header className={styles.dialogHeader}><div><span className={styles.eyebrow}>DAILY SALES RECORD</span><h2>{previous ? '판매 기록 수정' : '신규 판매 기록 등록'}</h2><p>하루 동안 판매한 메뉴의 매장/포장별 합계를 입력하세요.</p></div><button aria-label="닫기" onClick={close} disabled={busy}>×</button></header>
    <form onSubmit={save} noValidate>
      <div className={styles.formGrid}>
        <label>판매일<input id="sale-date" type="date" min={data.meta.start_date} max={today()} value={input.date} onChange={e => update('date', e.target.value)} disabled={busy} aria-invalid={errorField === 'date'}/><small>미마감·마감 정보 없는 실제 판매는 미확정으로 보관</small></label>
        <label>메뉴<select id="sale-menu_id" value={input.menu_id} onChange={e => update('menu_id', e.target.value)} disabled={busy}><option value="">메뉴 선택</option>{data.menus.map(m => <option key={m.menu_id} value={m.menu_id}>{m.name} · 기준가 {fmt(m.price)}원</option>)}</select><small>제공된 메뉴·레시피 사용</small></label>
        <label>판매 채널<select value={input.channel} onChange={e => update('channel', e.target.value)} disabled={busy}><option value="">매장/포장 선택</option><option>매장</option><option>포장</option></select><small>포장 전용 재료는 포장 판매에만 적용</small></label>
        <div>{numeric('quantity', '판매수량', '1 이상 정수 · 음료는 잔, 디저트는 개')}<div className={styles.quick}>{[1, 5, 10].map(n => <button type="button" key={n} disabled={busy} onClick={() => { if (input.quantity && !/^\d+$/.test(input.quantity)) { setError('수량을 정수로 먼저 수정해 주세요.'); return; } try { update('quantity', dec(input.quantity || '0').plus(n).toString()); } catch (e) { setError(errorMessage(e)); } }}>+{n}</button>)}</div></div>
        {numeric('unit_price', '판매단가 (원)', '수정 가능 · 여러 단가는 총 정상 판매액 ÷ 총수량')}
        {numeric('discount_amount', '총 할인 (원)', '기록 전체의 할인금액 · 정수 원')}
        {numeric('payment_fee', '실제 결제수수료 (원)', '필수 · 수수료가 없으면 0 입력 · 자동 비율 미적용')}
      </div>
      <section className={styles.preview} aria-label="판매 미리보기" aria-live="polite"><h3>저장 전 미리보기 <span className={styles.subtle}>아직 기록에 반영되지 않았습니다</span></h3>
        {amounts && preview.sale ? <><div className={styles.previewNumbers}><span>순매출<strong>{fmt(amounts.net)}원</strong></span><span>식재료 / 포장<strong>{fmt(amounts.food)} / {fmt(amounts.packaging)}원</strong></span><span>실제 수수료<strong>{fmt(amounts.fee)}원</strong></span><span>메뉴 수익<strong>{fmt(amounts.profit)}원 <small>{amounts.net.isZero() ? '계산 대상 없음' : percentage(amounts.profit.div(amounts.net).times(100))}</small></strong></span></div>
          <p>{previous && ['date', 'menu_id', 'channel'].every(k => previous[k as keyof Sale] === input[k as keyof SaleInput]) ? '당시 개당 원가·레시피 유지' : '판매일 가격이력·메뉴 레시피·채널로 원가 산정'} · {preview.sale.recipe_version}</p>
          <ul>{stock.map(s => <li key={s.material.material_id}>{s.material.name} {fmt(s.usage, s.material.unit === '개' ? 0 : 3)}{s.material.unit} 사용 · {s.at} 마감 잔량 {fmt(s.before.amount, s.material.unit === '개' ? 0 : 3)} → <strong>{fmt(s.after.amount, s.material.unit === '개' ? 0 : 3)}{s.material.unit}</strong>{s.after.provisional ? ' · 미확정 입력 포함' : ''}</li>)}</ul><p className={styles.subtle}>이후 실측 재고가 있으면 그 기준을 유지하므로 현재 잔량은 과거 사용량 차이와 다르게 변할 수 있습니다.</p>
        </> : <p>{preview.error || '필수 항목을 입력하면 계산 결과를 표시합니다.'}</p>}
      </section>
      {error && <p id="sale-error" role="alert" className={styles.error}>{error}</p>}
      <footer className={styles.dialogFooter}><button type="button" onClick={reset} disabled={busy}>입력 초기화</button><div><button type="button" onClick={close} disabled={busy}>취소</button><button className={styles.primary} type="submit" disabled={busy}>{busy ? '실제 저장 중…' : '판매 기록 저장'}</button></div></footer>
    </form>
  </Dialog>;
}
function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(); const [loadError, setLoadError] = useState(''); const [retry, setRetry] = useState(0);
  const [route, setRoute] = useState(readRoute); const [mode, setMode] = useState('month'); const [period, setPeriod] = useState('');
  const [channel, setChannel] = useState(''); const [menu, setMenu] = useState(''); const [category, setCategory] = useState(''); const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ snapshot: Snapshot; sale?: Sale }>(); const [deletion, setDeletion] = useState<{ snapshot: Snapshot; sale: Sale; request: string }>();
  const [detail, setDetail] = useState<string>(); const [notice, setNotice] = useState(''); const [mutationError, setMutationError] = useState(''); const [busy, setBusy] = useState(false);
  const periodRef = useRef(false);
  const persistenceRequested = useRef(false);
  const requestPersistence = () => {
    if (persistenceRequested.current) return; persistenceRequested.current = true;
    if (!navigator.storage?.persist) { setNotice(n => n + ' 장기 보관 지원을 확인할 수 없습니다. 브라우저 자료 삭제에 주의하세요.'); return; }
    void navigator.storage.persist().then(allowed => setNotice(n => n + (allowed ? ' 브라우저의 지속 보관이 허용됐지만 파일 백업을 대신하지는 않습니다.' : ' 지속 보관 요청이 허용되지 않았습니다. 저장은 성공했지만 브라우저 자료 삭제에 주의하세요.'))).catch(() => setNotice(n => n + ' 지속 보관 상태 확인에 실패했습니다. 파일 백업을 대신하지 않습니다.'));
    void navigator.storage.estimate().catch(() => undefined);
  };
  useEffect(() => { const handle = () => { setRoute(readRoute()); setPage(1); }; window.addEventListener('hashchange', handle); return () => window.removeEventListener('hashchange', handle); }, []);
  useEffect(() => {
    let cancelled = false; let subscription: { unsubscribe(): void } | undefined;
    setLoadError('');
    void (async () => {
      const found = await db.datasets.get('active');
      const loader = found ? () => found.data : (await import('./io/seed')).seedData;
      await initialize(db, loader);
      if (cancelled) return;
      subscription = liveQuery(() => db.datasets.get('active')).subscribe({ next: result => {
        if (!result) { setLoadError('저장 자료를 찾을 수 없습니다. 샘플로 덮어쓰지 않습니다.'); return; }
        balances(result.data, today());
        setSnapshot(result);
        if (!periodRef.current) { periodRef.current = true; setPeriod(defaultMonth(result.data)); }
      }, error: () => setLoadError('저장 자료를 읽지 못했습니다. 기존 자료를 초기화하지 않습니다. 다시 시도해 주세요.') });
    })().catch(e => !cancelled && setLoadError(errorMessage(e)));
    return () => { cancelled = true; subscription?.unsubscribe(); };
  }, [retry]);
  const data = snapshot?.data;
  const periodValid = mode === 'month' ? /^\d{4}-(0[1-9]|1[0-2])$/.test(period) : validDate(period);
  const sales = useMemo(() => !data || !periodValid ? [] : data.sales.filter(s => (mode === 'month' ? s.date.startsWith(period + '-') : s.date === period) && (route !== 'sales' || (!channel || s.channel === channel) && (!menu || s.menu_id === menu)) && (route !== 'profitability' || !category || data.menus.find(m => m.menu_id === s.menu_id)?.category === category)).sort((a, b) => b.date.localeCompare(a.date) || a.menu_id.localeCompare(b.menu_id) || a.channel.localeCompare(b.channel) || a.sale_id.localeCompare(b.sale_id)), [data, periodValid, mode, period, route, channel, menu, category]);
  const confirmed = useMemo(() => data ? sales.filter(s => status(data, s.date) === '확정') : [], [data, sales]);
  const provisional = useMemo(() => data ? sales.filter(s => status(data, s.date) !== '확정') : [], [data, sales]);
  const pages = Math.ceil(sales.length / 8); const shownPage = Math.max(1, Math.min(page, pages || 1)); const rows = sales.slice((shownPage - 1) * 8, shownPage * 8);
  const currentTotals = aggregate(rows);
  const newDate = mode === 'day' && periodValid && data && period >= data.meta.start_date && period <= today() ? period : mode === 'month' && period === today().slice(0, 7) ? today() : mode === 'month' && data ? sales[0]?.date || (periodValid && `${period}-01` >= data.meta.start_date && `${period}-01` <= today() ? `${period}-01` : today()) : today();
  const setCondition = (callback: () => void) => { callback(); setPage(1); };
  const resetFilters = () => { if (data) { setMode('month'); setPeriod(defaultMonth(data)); setChannel(''); setMenu(''); setCategory(''); setPage(1); } };
  const remove = async () => {
    if (!deletion || busy) return; setBusy(true); setMutationError('');
    try { const result = await changeSales(db, deletion.snapshot, deletion.request, { kind: 'delete', previousId: deletion.sale.sale_id, confirmed: true }); setSnapshot(result); setDeletion(undefined); setNotice('판매 기록을 삭제하고 관련 집계를 갱신했습니다.'); }
    catch (e) { setMutationError(errorMessage(e)); } finally { setBusy(false); }
  };
  return <div className={styles.shell}>
    <aside className={styles.sidebar}><a href="#/sales" className={styles.brand}><span className={styles.logo}>P</span><div>프렙 카페<small>STORE COCKPIT</small></div></a><div className={styles.navLabel}>매장 관리</div><nav>
      <a href="#/dashboard" aria-label="대시보드 & 기간 손익" aria-current={route === 'dashboard' ? 'page' : undefined}>◫ <span>대시보드 & 기간 손익</span></a>
      <a href="#/sales" aria-label="판매 기록 관리" aria-current={route === 'sales' ? 'page' : undefined}>▤ <span>판매 기록 관리</span></a>
      <a href="#/profitability" aria-label="메뉴별 수익성" aria-current={route === 'profitability' ? 'page' : undefined}>◉ <span>메뉴별 수익성</span></a>
      <a href="#/inventory" aria-label="재고 기록 & 잔량" aria-current={route === 'inventory' ? 'page' : undefined}>▥ <span>재고 기록 & 잔량</span></a>
      <a href="#/expenses" aria-label="비용 & 데이터 보관" aria-current={route === 'expenses' ? 'page' : undefined}>▣ <span>비용 & 데이터 보관</span></a>
    </nav><div className={styles.storageNote}><strong>이 브라우저에 저장</strong><p>다른 기기·브라우저와 자동 공유되지 않습니다.</p><p>비용 & 데이터 보관에서 전체 파일 백업을 받으세요. 비공개 창은 장기 보관에 사용하지 마세요.</p></div></aside>
    <div className={styles.workspace}><header className={styles.topbar}><span>프렙 카페 · 한 매장</span><span className={styles.localBadge}>● 브라우저 로컬 보관</span><span className={styles.saved}>최근 보관 {snapshot ? new Date(snapshot.lastSuccess).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '불러오는 중'}</span></header>
      <main className={styles.main}><div className={styles.heading}><div><span className={styles.eyebrow}>OPERATIONS / {route.toUpperCase()}</span><h1>{routeTitles[route]}</h1><p>{route === 'sales' ? '날짜·메뉴·매장/포장별 실제 판매를 기록하고 남는 금액을 확인하세요.' : route === 'profitability' ? '식재료·포장재·실제 결제수수료를 차감한 메뉴 수익입니다.' : '같은 기록으로 비용·매장 손익·재료 잔량을 확인하세요.'}</p></div><span className={styles.version}>EPIC 1·2 확인 완료 · EPIC 3 확인 대기</span></div>
        {notice && <p role="status" className={styles.success}>{notice}<button aria-label="안내 닫기" onClick={() => setNotice('')}>×</button></p>}
        {loadError ? <section role="alert" className={styles.error}><h2>자료를 열지 못했습니다</h2><p>{loadError}</p><button onClick={() => setRetry(x => x + 1)}>다시 시도</button></section> : !data ? <p role="status">가상 운영 자료를 확인하고 저장소를 여는 중입니다…</p> : <>
          <section className={styles.toolbar} aria-label="조회 조건"><div className={styles.tabs}><button className={mode === 'day' ? styles.selected : ''} onClick={() => setCondition(() => { setMode('day'); setPeriod(period.length === 7 ? `${period}-01` : period); })}>일간</button><button className={mode === 'month' ? styles.selected : ''} onClick={() => setCondition(() => { setMode('month'); setPeriod(period.slice(0, 7)); })}>월간</button></div>
            <label>조회 {mode === 'month' ? '월' : '날짜'}<input aria-label="조회 기간" type={mode === 'month' ? 'month' : 'date'} value={period} onChange={e => setCondition(() => setPeriod(e.target.value))}/></label>
            {route === 'sales' ? <><label>채널<select aria-label="채널 필터" value={channel} onChange={e => setCondition(() => setChannel(e.target.value))}><option value="">전체 채널</option><option>매장</option><option>포장</option></select></label><label>메뉴<select aria-label="메뉴 필터" value={menu} onChange={e => setCondition(() => setMenu(e.target.value))}><option value="">전체 메뉴</option>{data.menus.map(m => <option value={m.menu_id} key={m.menu_id}>{m.name}</option>)}</select></label></> : route === 'profitability' ? <label>분류<select value={category} aria-label="분류 필터" onChange={e => setCondition(() => setCategory(e.target.value))}><option value="">전체 메뉴</option><option>음료</option><option>디저트</option></select></label> : null}
            <button onClick={resetFilters}>필터 초기화</button>{route === 'sales' && <button className={styles.primary} onClick={() => setForm({ snapshot: snapshot! })}>＋ 판매 기록 등록</button>}</section>
          {!periodValid && <p role="alert" className={styles.error}>올바른 조회 기간을 선택해 주세요. 조회를 중단했습니다.</p>}
          <div className={styles.info}><strong>{periodValid ? period : '기간 선택 필요'} · {route === 'sales' ? `${channel || '전체 채널'} / ${data.menus.find(m => m.menu_id === menu)?.name || '전체 메뉴'}` : route === 'profitability' ? category || '전체 메뉴' : '전체 매장 기준'}</strong><p>가상 자료: {data.meta.start_date}~{data.meta.as_of}. 확정 실적과 입력 실적(미확정)을 따로 표시합니다. 기록 없음은 입력 누락이 없다는 뜻이 아닙니다. 달력이 없는 날도 자동 마감하지 않습니다.</p></div>
          {periodValid && (route === 'sales' || route === 'profitability') && <><Summary sales={confirmed} title="확정 실적"/><Summary sales={provisional} title="입력 실적 (미확정)"/>
            {route === 'sales' ? <section className={styles.tableCard}><div className={styles.tableHeading}><h2>판매 집계 원장</h2><span>{sales.length ? `${(shownPage - 1) * 8 + 1}~${Math.min(shownPage * 8, sales.length)} / ` : ''}{sales.length.toLocaleString()}건 · 페이지당 8건</span></div>
              <div className={styles.tableScroll}><table><thead><tr>{['판매일 / 마감', '메뉴', '채널', '수량', '단가', '총 할인(차감)', '순매출', '수수료', '식재료원가', '포장원가', '관리'].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(s => {
                let a: ReturnType<typeof saleAmounts> | undefined; try { a = saleAmounts(s); } catch { /* show missing, never zero */ }
                return <tr key={s.sale_id}><td>{s.date}<br/><Tag label={status(data, s.date)}/></td><td>{data.menus.find(m => m.menu_id === s.menu_id)?.name}<small className={styles.block}>{data.menus.find(m => m.menu_id === s.menu_id)?.category} · {s.sale_id}</small></td><td><span className={s.channel === '포장' ? styles.takeout : styles.closed}>{s.channel}</span></td><td>{fmt(s.quantity)}{data.menus.find(m => m.menu_id === s.menu_id)?.category === '음료' ? '잔' : '개'}</td><td>{fmt(s.unit_price, dec(s.unit_price).isInteger() ? 0 : 3)}</td><td>−{fmt(s.discount_amount)}</td><td>{fmt(s.net_sales)}</td><td>{fmt(s.payment_fee)}</td><td>{fmt(a?.food)}</td><td>{fmt(a?.packaging)}</td><td className={styles.rowActions}><button aria-label={`${s.date} ${s.menu_id} ${s.channel} 수정`} onClick={() => setForm({ snapshot: snapshot!, sale: s })}>수정</button><button aria-label={`${s.date} ${s.menu_id} ${s.channel} 삭제`} onClick={() => { setMutationError(''); setDeletion({ snapshot: snapshot!, sale: s, request: crypto.randomUUID() }); }}>삭제</button></td></tr>;
              })}{!rows.length && <tr><td colSpan={11} className={styles.empty}>판매 기록 없음 · 0건</td></tr>}</tbody><tfoot><tr><th colSpan={3}>현재 페이지 합계 (확정·미확정 포함)</th><td>{fmt(currentTotals.quantity)}</td><td>—</td><td>−{fmt(currentTotals.discount)}</td><td>{fmt(currentTotals.net)}</td><td>{fmt(currentTotals.fee)}</td><td>{fmt(currentTotals.food)}</td><td>{fmt(currentTotals.packaging)}</td><td>전체 합계는 위 카드</td></tr></tfoot></table></div>
              <div className={styles.pagination}><span>{pages ? `${shownPage} / ${pages} 페이지` : '0건 · 페이지 없음'}</span><div><button aria-label="첫 페이지" disabled={shownPage <= 1 || !pages} onClick={() => setPage(1)}>«</button><button aria-label="이전 페이지" disabled={shownPage <= 1 || !pages} onClick={() => setPage(shownPage - 1)}>이전</button><button aria-label="다음 페이지" disabled={shownPage >= pages || !pages} onClick={() => setPage(shownPage + 1)}>다음</button><button aria-label="마지막 페이지" disabled={shownPage >= pages || !pages} onClick={() => setPage(pages)}>»</button></div></div>
            </section> : <>{['확정', '미확정'].map(group => {
              const groupSales = group === '확정' ? confirmed : provisional;
              const total = aggregate(groupSales);
              return <section key={group} className={styles.tableCard}><div className={styles.tableHeading}><h2>{group === '확정' ? '확정 메뉴 실적' : '입력 실적 (미확정)'}</h2><span>기록별 반올림 후 합계 · 임대료·인건비 미배분</span></div><div className={styles.tableScroll}><table><thead><tr>{['메뉴', '수량', '평균 판매단가', '순매출', '식재료', '포장', '수수료', '메뉴 수익', '수익률', '매장 수량 비중', '근거'].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{data.menus.filter(m => !category || m.category === category).map(m => {
                const list = groupSales.filter(s => s.menu_id === m.menu_id); const a = aggregate(list);
                return <tr key={m.menu_id}><td>{m.name}<small className={styles.block}>{m.category}</small></td><td>{fmt(a.quantity)}</td><td>{fmt(a.average, 2)}</td><td>{fmt(a.net)}</td><td>{fmt(a.food)}</td><td>{fmt(a.packaging)}</td><td>{fmt(a.fee)}</td><td className={a.profit?.lt(0) ? styles.negative : ''}>{fmt(a.profit)}{!list.length && <small className={styles.block}>실적 없음</small>}</td><td>{percentage(a.ratio)}</td><td>{percentage(a.storeShare)}</td><td><button onClick={() => setDetail(m.menu_id)}>원가 근거</button></td></tr>;
              })}</tbody><tfoot><tr><th>합계</th><td>{fmt(total.quantity)}</td><td>{fmt(total.average, 2)}</td><td>{fmt(total.net)}</td><td>{fmt(total.food)}</td><td>{fmt(total.packaging)}</td><td>{fmt(total.fee)}</td><td>{fmt(total.profit)}</td><td>{percentage(total.ratio)}</td><td>{percentage(total.storeShare)}</td><td>같은 판매 원장 집계</td></tr></tfoot></table></div></section>;
            })}</>}
          </>}
          {periodValid && route === 'dashboard' && <Dashboard data={data} mode={mode} period={period}/>}
          {periodValid && route === 'inventory' && <Inventory data={data} mode={mode} period={period}/>}
          {periodValid && route === 'inventory' && <StockRecords snapshot={snapshot!} mode={mode} period={period} newDate={newDate} onSaved={(result, date) => { setSnapshot(result); setNotice('재고 기록을 실제 저장하고 잔량·관련 손익을 갱신했습니다.'); setMode('day'); setPeriod(date); requestPersistence(); }}/>}
          {periodValid && route === 'expenses' && <Expenses snapshot={snapshot!} mode={mode} period={period} newDate={newDate} onSaved={(result, date) => { setSnapshot(result); setNotice(date ? '비용을 실제 저장하고 해당 귀속일 손익을 갱신했습니다.' : '비용을 삭제하고 관련 손익을 갱신했습니다.'); if (date) { setMode('day'); setPeriod(date); } requestPersistence(); }}/>}
          {route === 'expenses' && <DataTools onSaved={result => { setSnapshot(result); setMode('month'); setPeriod(defaultMonth(result.data)); setChannel(''); setMenu(''); setCategory(''); setPage(1); setNotice('백업에서 전체 자료를 복원했습니다.'); }}/ >}
          <section className={styles.bottomNotes}><article><h3>한 기록은 하루의 메뉴·채널별 합계</h3><p>주문 한 건씩 관리하지 않습니다. 같은 날짜·메뉴·채널의 추가 판매는 기존 기록을 수정하세요.</p><a href="#/dashboard">같은 기간 매장 손익 →</a><p><a href="#/inventory">같은 기간 재료 잔량 →</a></p></article><article><h3>이번 단계는 EPIC 3</h3><p>입고·폐기·실제 재고 기록과 전체 백업·복원을 연결했습니다. 엑셀·예측·발주 추천은 2차입니다. 외부 배포는 아직 수행하지 않았습니다.</p></article></section>
        </>}
      </main>
    </div>
    {form && <SaleForm snapshot={form.snapshot} previous={form.sale} date={newDate} onClose={() => setForm(undefined)} onSaved={(result, sale) => { setSnapshot(result); setForm(undefined); setNotice('판매 기록이 실제 저장되었습니다. 관련 메뉴 수익성을 갱신했습니다.'); setMode('day'); setPeriod(sale.date); setChannel(''); setMenu(''); setPage(1); requestPersistence(); }}/ >}
    {deletion && <Dialog label="판매 삭제 확인" onClose={() => !busy && setDeletion(undefined)}><header className={styles.dialogHeader}><h2>판매 기록을 삭제할까요?</h2></header><div className={styles.confirmBody}><p>{deletion.sale.date} · {data?.menus.find(m => m.menu_id === deletion.sale.menu_id)?.name} · {deletion.sale.channel} · {fmt(deletion.sale.quantity)}잔/개</p><p>이 기록의 판매·수익성·재료 사용 영향을 제거합니다. 이후 실측 재고가 있다면 그 기준은 유지됩니다.</p>{mutationError && <p role="alert" className={styles.error}>{mutationError}</p>}</div><footer className={styles.dialogFooter}><button disabled={busy} onClick={() => setDeletion(undefined)}>취소</button><button className={styles.danger} disabled={busy} onClick={() => void remove()}>{busy ? '삭제 저장 중…' : '삭제 확인'}</button></footer></Dialog>}
    {detail && data && <Dialog label="메뉴 원가 근거" onClose={() => setDetail(undefined)}><header className={styles.dialogHeader}><h2>{data.menus.find(m => m.menu_id === detail)?.name} · 원가 근거</h2><button aria-label="닫기" onClick={() => setDetail(undefined)}>×</button></header><div className={styles.confirmBody}><p>{period} · {category || '전체'} · 확정/미확정은 각 기록에 표시합니다. 당시 원가를 보존하며 현재 원가로 덮어쓰지 않습니다.</p>{sales.filter(s => s.menu_id === detail).map(s => {
      let basis: string[] = s.cost_basis || []; if (!basis.length) { try { basis = unitCost(data, s.date, s.menu_id, s.channel).basis; } catch { basis = ['해당 날짜 가격 근거 조회 불가']; } }
      let recipe = ''; try { recipe = recipeFor(data, s).map(r => `${data.materials.find(m => m.material_id === r.material_id)?.name} ${r.quantity}${r.unit}`).join(' + '); } catch { recipe = '레시피 근거 없음'; }
      return <article className={styles.basis} key={s.sale_id}><strong>{s.date} · {s.channel} · <Tag label={status(data, s.date)}/></strong><p>저장된 개당 식재료 {fmt(s.unit_food_cost_snapshot, 4)}원 / 포장 {fmt(s.unit_packaging_cost_snapshot, 4)}원 · 레시피 {s.recipe_version}</p><p>{recipe}</p><details><summary>판매일 가격이력 참고 (당시 저장 원가의 대체값 아님)</summary><ul>{basis.map((b, i) => <li key={i}>{b}</li>)}</ul></details></article>;
    })}{!sales.some(s => s.menu_id === detail) && <p>선택 기간에 판매 기록이 없습니다.</p>}</div></Dialog>}
  </div>;
}
class ErrorBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <main className={styles.main}><h1>화면을 표시하지 못했습니다</h1><p>저장 자료를 자동 초기화하지 않았습니다. 다시 열어 주세요.</p><button onClick={() => window.location.reload()}>다시 열기</button></main> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App/></ErrorBoundary>);
