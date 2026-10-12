import { test, expect, type Page } from '@playwright/test';
async function start(page: Page, route = 'expenses') { await page.goto('/#/' + route); await expect(page.getByRole('heading', { name: route === 'expenses' ? '비용 원장' : route === 'inventory' ? '재료 잔량' : '확정 매장 손익', exact: true })).toBeVisible(); }
async function day(page: Page, date = '2026-09-19') { await page.getByRole('button', { name: '일간', exact: true }).click(); await page.getByLabel('조회 기간').fill(date); }
async function expense(page: Page, amount = '10000', date = '2026-09-19') {
  await page.getByRole('button', { name: '＋ 비용 기록 등록' }).click(); await page.locator('#expense-date').fill(date); await page.locator('#expense-category').selectOption('광고비'); await page.locator('#expense-amount').fill(amount);
}
async function save(page: Page) { await page.getByRole('button', { name: '비용 기록 저장', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); }
const provisional = (page: Page) => page.getByRole('region', { name: '입력 매장 손익 (미확정)', exact: true });

test('source September whole-store P&L matches independent amounts; expense filters never restrict store', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page, 'dashboard');
  const closed = page.getByRole('region', { name: '확정 매장 손익', exact: true });
  for (const amount of ['13,968,930', '3,259,810', '286,826', '209,565', '3,798,010', '21,534', '6,393,185']) await expect(closed).toContainText(amount);
  await expect(provisional(page)).toContainText('실적 기록 없음');
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await page.getByRole('link', { name: '판매 기록 관리', exact: true }).click(); await page.getByLabel('메뉴 필터').selectOption('M02'); await page.getByLabel('채널 필터').selectOption('포장');
  await page.getByRole('link', { name: '메뉴별 수익성', exact: true }).click(); await page.getByLabel('분류 필터').selectOption('디저트');
  await page.getByRole('link', { name: '비용 & 데이터 보관', exact: true }).click(); await page.getByLabel('비용항목 필터').selectOption('광고비');
  await page.getByRole('link', { name: '대시보드 & 기간 손익', exact: true }).click(); await expect(closed).toContainText('6,393,185'); expect(errors).toEqual([]);
});
test('expense create, edit/date move, reload, cancel/confirm delete only affect attributable P&L', async ({ page }) => {
  page.on('dialog', d => d.accept()); await start(page); await day(page);
  await expense(page); await expect(page.getByRole('region', { name: '비용 반영 안내' })).toContainText('자동 일할 배분하지 않습니다'); await save(page);
  await expect(page.locator('tbody tr')).toHaveCount(1); await expect(page.locator('tbody tr')).toContainText('직접 입력');
  await page.getByRole('link', { name: '대시보드 & 기간 손익', exact: true }).click(); await expect(page.getByLabel('조회 기간')).toHaveValue('2026-09-19'); await expect(provisional(page)).toContainText('− 운영비 10,000원'); await expect(provisional(page)).toContainText('-10,000'); await expect(provisional(page)).toContainText('계산 대상 없음');
  await page.getByRole('link', { name: '비용 & 데이터 보관', exact: true }).click(); await page.getByRole('button', { name: '2026-09-19 광고비 10000원 수정', exact: true }).click(); await page.locator('#expense-amount').fill('15000'); await page.locator('#expense-date').fill('2026-09-20'); await save(page);
  await expect(page.locator('tbody tr')).toHaveCount(1); await expect(page.locator('tbody tr')).toContainText('15,000');
  await page.getByRole('link', { name: '대시보드 & 기간 손익', exact: true }).click(); await expect(provisional(page)).toContainText('-15,000'); await page.getByLabel('조회 기간').fill('2026-09-19'); await expect(provisional(page)).toContainText('실적 기록 없음');
  await page.reload(); await expect(page.getByRole('heading', { name: '확정 매장 손익', exact: true })).toBeVisible(); await day(page, '2026-09-20'); await expect(provisional(page)).toContainText('-15,000');
  await page.getByRole('link', { name: '비용 & 데이터 보관', exact: true }).click(); await page.getByRole('button', { name: '2026-09-20 광고비 15000원 삭제', exact: true }).click(); await page.getByRole('button', { name: '취소', exact: true }).click(); await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '2026-09-20 광고비 15000원 삭제', exact: true }).click(); await page.getByRole('button', { name: '삭제 확인', exact: true }).click(); await expect(page.getByText('비용 기록 없음 · 0건', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: '비용 원장', exact: true })).toBeVisible(); await day(page, '2026-09-20'); await expect(page.getByText('비용 기록 없음 · 0건', { exact: true })).toBeVisible();
});
test('expense invalid zero/negative/future and duplicate cancellation keep draft; explicit separate payment allowed', async ({ page }) => {
  await start(page); await day(page); await expense(page, '0');
  await page.getByRole('button', { name: '비용 기록 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('양의 정수');
  await page.locator('#expense-amount').fill('-1'); await page.getByRole('button', { name: '비용 기록 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('양의 정수');
  await page.locator('#expense-amount').fill('10000'); await page.locator('#expense-date').fill('2099-01-01'); await page.getByRole('button', { name: '비용 기록 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('미래 비용계획');
  await page.locator('#expense-date').fill('2026-09-19'); await save(page);
  await expense(page); page.once('dialog', d => d.dismiss()); await page.getByRole('button', { name: '비용 기록 저장', exact: true }).click(); await expect(page.locator('#expense-amount')).toHaveValue('10000'); await expect(page.locator('tbody tr')).toHaveCount(1);
  page.once('dialog', d => d.accept()); await save(page); await expect(page.locator('tbody tr')).toHaveCount(2);
  await expense(page, '20000'); await save(page); await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/expenses-desktop.png', fullPage: true });
});
test('expense actual storage error preserves draft, retry once; deletion failure keeps record', async ({ page }) => {
  await start(page); await day(page); await expense(page);
  const failNextPut = async () => page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(...args: Parameters<typeof original>) { if (this.name === 'datasets') { IDBObjectStore.prototype.put = original; throw new DOMException('test quota', 'QuotaExceededError'); } return original.apply(this, args); }; });
  await failNextPut(); await page.getByRole('button', { name: '비용 기록 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('기존 자료와 입력은 유지'); await expect(page.locator('#expense-amount')).toHaveValue('10000'); await save(page); await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '2026-09-19 광고비 10000원 삭제', exact: true }).click(); await failNextPut(); await page.getByRole('button', { name: '삭제 확인' }).click(); await expect(page.getByRole('alert')).toContainText('기존 자료와 입력은 유지'); await expect(page.locator('tbody tr')).toHaveCount(1); await page.getByRole('button', { name: '삭제 확인' }).click(); await expect(page.getByText('비용 기록 없음 · 0건', { exact: true })).toBeVisible();
});
test('expense stale tab cannot overwrite newer data', async ({ page, context }) => {
  await start(page); await day(page); await expense(page);
  const other = await context.newPage(); await start(other); await day(other); await expense(other, '20000'); await save(other);
  await page.bringToFront(); await page.getByRole('button', { name: '비용 기록 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('다른 창'); await expect(page.locator('#expense-amount')).toHaveValue('10000');
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '취소', exact: true }).click(); await expect(page.locator('tbody tr')).toHaveCount(1); await expect(page.locator('tbody tr')).toContainText('20,000');
});
test('sales to profitability to store profit to actual stock; expenses never change stock', async ({ page }) => {
  page.on('dialog', d => d.accept()); await page.goto('/#/sales'); await expect(page.getByRole('heading', { name: '판매 집계 원장' })).toBeVisible();
  await page.getByRole('button', { name: '＋ 판매 기록 등록' }).click();
  for (const [field, value] of Object.entries({ date: '2026-09-19', quantity: '20', unit_price: '5000', discount_amount: '2000', payment_fee: '1500' })) await page.locator('#sale-' + field).fill(value);
  await page.locator('#sale-menu_id').selectOption('M02'); await page.locator('#sale-unit_price').fill('5000'); await page.getByRole('dialog').getByLabel('판매 채널').selectOption('포장');
  await page.getByRole('button', { name: '판매 기록 저장', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: '메뉴별 수익성', exact: true }).click(); await expect(page.getByRole('region', { name: '입력 실적 (미확정)', exact: true })).toContainText('70,708');
  await page.getByRole('link', { name: '대시보드 & 기간 손익', exact: true }).click(); await expect(provisional(page)).toContainText('매장 손익 70,708원');
  await page.getByRole('link', { name: '같은 기간 재료 잔량 →', exact: true }).first().click(); await expect(page.getByRole('region', { name: '재고 기준' })).toContainText('2026-09-19');
  const milk = page.getByRole('region', { name: '재료 잔량 표', exact: true }).locator('tbody tr').filter({ hasText: '우유' }); await expect(milk).toContainText('19,180.000'); await expect(milk).toContainText('미확정 입력 포함');
  await page.getByLabel('재료 필터', { exact: true }).selectOption('I10'); await expect(page.getByRole('region', { name: '재료 잔량 표', exact: true }).locator('tbody tr')).toContainText('194');
  await page.getByRole('link', { name: '비용 & 데이터 보관', exact: true }).click(); await expense(page); await save(page);
  await page.getByRole('link', { name: '대시보드 & 기간 손익', exact: true }).click(); await expect(provisional(page)).toContainText('매장 손익 60,708원');
  await page.getByRole('link', { name: '재고 기록 & 잔량', exact: true }).click(); await expect(milk).toContainText('19,180.000');
  await page.screenshot({ path: 'test-results/inventory-desktop.png', fullPage: true });
});
test('stock monthly basis, empty month carry, future/start guard and mobile keyboard without external requests', async ({ page }) => {
  const remotes: string[] = []; page.on('request', r => { if (!/^https?:\/\/127\.0\.0\.1:5173/.test(r.url())) remotes.push(r.url()); });
  await start(page, 'inventory'); await expect(page.getByRole('region', { name: '재고 기준' })).toContainText('2026-09-18');
  await page.getByLabel('조회 기간').fill('2026-10'); await expect(page.getByRole('region', { name: '재고 기준' })).toContainText('활동 기록 없음');
  await day(page, '2099-01-01'); await expect(page.getByRole('region', { name: '재고 기준' })).toContainText('미래 날짜'); await expect(page.locator('tbody tr').first()).toContainText('계산 불가');
  await page.getByLabel('조회 기간').fill('2025-06-30'); await expect(page.getByRole('region', { name: '재고 기준' })).toContainText('시작 재고 이전');
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('link', { name: '비용 & 데이터 보관', exact: true }).click(); const button = page.getByRole('button', { name: '＋ 비용 기록 등록' }); await button.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible(); await page.screenshot({ path: 'test-results/expense-form-mobile.png', fullPage: true }); await page.keyboard.press('Escape'); await expect(button).toBeFocused(); expect(remotes).toEqual([]);
});
