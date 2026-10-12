import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
async function start(page: Page, route = 'inventory') { await page.goto('/#/' + route); await expect(page.getByRole('heading', { name: route === 'inventory' ? '재료 잔량' : '비용 원장', exact: true })).toBeVisible(); }
async function date(page: Page, value = '2026-09-19') { await page.getByRole('button', { name: '일간', exact: true }).click(); await page.getByLabel('조회 기간').fill(value); }
const milk = (page: Page) => page.getByRole('region', { name: '재료 잔량 표', exact: true }).locator('tbody tr').filter({ hasText: '우유' });
async function stock(page: Page, kind = '입고', quantity = '1000', day = '2026-09-19') {
  await page.getByRole('button', { name: '＋ ' + kind + ' 기록', exact: true }).click(); await page.locator('#stock-date').fill(day); await page.locator('#stock-material_id').selectOption('I02'); await page.locator('#stock-quantity').fill(quantity); if (kind === '폐기') await page.locator('#stock-reason').fill('검사 폐기');
}
async function save(page: Page, kind = '입고') { await page.getByRole('button', { name: kind + ' 기록 저장', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); }
async function download(page: Page) { await page.getByRole('link', { name: '비용 & 데이터 보관', exact: true }).click(); const waiting = page.waitForEvent('download'); await page.getByRole('button', { name: '전체 백업 내려받기', exact: true }).click(); const result = await waiting; expect(result.suggestedFilename()).toMatch(/^프렙카페_전체백업_\d{8}_\d{6}\.json$/); const path = await result.path(); expect(path).toBeTruthy(); return readFile(path!, 'utf8'); }
async function select(page: Page, content: string, name = '검사백업.json') { await page.getByLabel('복원할 백업 파일', { exact: true }).setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content, 'utf8') }); }
const failPut = async (page: Page) => page.evaluate(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(...args: Parameters<typeof put>) { if (this.name === 'datasets') { IDBObjectStore.prototype.put = put; throw new DOMException('test quota', 'QuotaExceededError'); } return put.apply(this, args); }; });

test('receipt, waste and count persist and connect to stock and P&L exactly once', async ({ page }) => {
  await start(page); await date(page); await expect(milk(page)).toContainText('23,180.000');
  await stock(page); await page.locator('#stock-unit_cost').fill('9.99'); await expect(page.getByRole('region', { name: '재고 미리보기' })).toContainText('24,180.000'); await save(page);
  await expect(milk(page)).toContainText('24,180.000'); await expect(milk(page)).toContainText('미확정 입력 포함');
  await stock(page, '폐기', '100'); await expect(page.getByRole('region', { name: '재고 미리보기' })).toContainText('폐기 손실 313원'); await save(page, '폐기'); await expect(milk(page)).toContainText('24,080.000');
  await page.getByRole('link', { name: '대시보드 & 기간 손익', exact: true }).click(); await expect(page.getByRole('region', { name: '입력 매장 손익 (미확정)', exact: true })).toContainText('매장 손익 -313원');
  await page.getByRole('link', { name: '재고 기록 & 잔량', exact: true }).click(); await stock(page, '실제 재고', '24000'); await expect(page.getByRole('region', { name: '재고 미리보기' })).toContainText('실사 차이 -80.000ml'); await save(page, '실제 재고'); await expect(milk(page)).toContainText('24,000.000');
  await page.screenshot({ path: 'test-results/stock-records-desktop.png', fullPage: true }); await page.reload(); await expect(page.getByRole('heading', { name: '재료 잔량', exact: true })).toBeVisible(); await date(page); await expect(milk(page)).toContainText('24,000.000');
  await stock(page, '실제 재고', '24000'); await page.getByRole('button', { name: '실제 재고 기록 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('이미 있습니다');
});
test('stock invalid values/reason; cancel and failed save preserve original, retry creates once', async ({ page }) => {
  page.on('dialog', d => d.accept()); await start(page); await date(page); await stock(page, '폐기', '0'); await page.getByRole('button', { name: '폐기 기록 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('양수');
  await page.locator('#stock-quantity').fill('100'); await page.locator('#stock-reason').fill(''); await page.getByRole('button', { name: '폐기 기록 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('사유');
  await page.locator('#stock-reason').fill('검사'); await failPut(page); await page.getByRole('button', { name: '폐기 기록 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('기존 자료와 입력은 유지'); await expect(page.locator('#stock-quantity')).toHaveValue('100'); await expect(milk(page)).toContainText('23,180.000'); await save(page, '폐기'); await expect(milk(page)).toContainText('23,080.000');
  await stock(page, '입고', '1000'); await page.getByRole('button', { name: '취소', exact: true }).click(); await expect(milk(page)).toContainText('23,080.000');
});
test('count anchor zero and old sale changes recompute discrepancy without altering anchored stock', async ({ page }) => {
  page.on('dialog', d => d.accept()); await start(page); await date(page); await stock(page, '실제 재고', '0'); await save(page, '실제 재고'); await expect(milk(page)).toContainText('0.000');
  await page.getByRole('link', { name: '판매 기록 관리', exact: true }).click(); await page.getByRole('button', { name: '＋ 판매 기록 등록', exact: true }).click();
  await page.locator('#sale-date').fill('2026-09-19'); await page.locator('#sale-menu_id').selectOption('M02'); await page.getByRole('dialog').getByLabel('판매 채널').selectOption('매장'); await page.locator('#sale-quantity').fill('20'); await page.locator('#sale-payment_fee').fill('0'); await page.getByRole('button', { name: '판매 기록 저장', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: '재고 기록 & 잔량', exact: true }).click(); await expect(milk(page)).toContainText('0.000');
  const record = page.locator('tbody tr').filter({ hasText: '현재 원장 기준 차이' }); await expect(record).toContainText('-19,180.000'); await expect(record).toContainText('입력 당시 -23,180.000');
});
test('real backup download, restoration cancellation and whole-data roundtrip re-create recorded balances', async ({ page }) => {
  await start(page); await date(page); const content = await download(page); expect(content).toContain('"identifier":"prep-cafe-ops-backup"'); expect(content).toContain('"unit_food_cost_snapshot":460.0');
  await expect(page.getByText(/내려받기를 시작했습니다:/)).toBeVisible();
  await page.getByRole('link', { name: '재고 기록 & 잔량', exact: true }).click(); await stock(page); await save(page); await expect(milk(page)).toContainText('24,180.000');
  await page.getByRole('link', { name: '비용 & 데이터 보관', exact: true }).click(); await select(page, content); await expect(page.getByRole('dialog', { name: '전체 복원 확인' })).toContainText('추가·병합이 아닙니다'); await page.getByRole('button', { name: '취소', exact: true }).click();
  await page.getByRole('link', { name: '재고 기록 & 잔량', exact: true }).click(); await expect(milk(page)).toContainText('24,180.000');
  await page.getByRole('link', { name: '비용 & 데이터 보관', exact: true }).click(); await select(page, content); await page.screenshot({ path: 'test-results/restore-confirm-desktop.png', fullPage: true }); await page.getByRole('button', { name: '전체 대체 복원 확인', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: '재고 기록 & 잔량', exact: true }).click(); await date(page); await expect(milk(page)).toContainText('23,180.000'); await page.reload(); await expect(page.getByRole('heading', { name: '재료 잔량', exact: true })).toBeVisible(); await date(page); await expect(milk(page)).toContainText('23,180.000');
});
test('empty/damaged/unsafe/unsupported file leaves existing data, valid empty activities explicitly replace without reseeding', async ({ page }) => {
  await start(page, 'expenses'); const content = await download(page);
  for (const text of ['', '{', '{"data":{},"data":{}}', content.replace('"backupFormatVersion":1', '"backupFormatVersion":8'), content.replace('"settings":{}', '"settings":{"__proto__":{}}')]) { await select(page, text); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(0); }
  const empty = JSON.parse(content); empty.data.sales = []; empty.data.expenses = []; empty.data.inventory_events = []; await select(page, JSON.stringify(empty)); await expect(page.getByRole('dialog')).toContainText('활동 기록 없음으로 전체 대체'); await page.getByRole('button', { name: '전체 대체 복원 확인', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload(); await expect(page.getByRole('heading', { name: '비용 원장', exact: true })).toBeVisible(); await expect(page.getByText('비용 기록 없음 · 0건', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '판매 기록 관리', exact: true }).click(); await expect(page.getByText('판매 기록 없음 · 0건', { exact: true })).toBeVisible();
});
test('restore write failure retains complete prior state and retries safely', async ({ page }) => {
  await start(page); await date(page); const content = await download(page); await page.getByRole('link', { name: '재고 기록 & 잔량', exact: true }).click(); await stock(page); await save(page);
  await page.getByRole('link', { name: '비용 & 데이터 보관', exact: true }).click(); await select(page, content); await failPut(page); await page.getByRole('button', { name: '전체 대체 복원 확인', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('기존 자료와 입력은 유지'); await page.getByRole('button', { name: '취소', exact: true }).click();
  await page.getByRole('link', { name: '재고 기록 & 잔량', exact: true }).click(); await expect(milk(page)).toContainText('24,180.000'); await page.getByRole('link', { name: '비용 & 데이터 보관', exact: true }).click(); await select(page, content); await page.getByRole('button', { name: '전체 대체 복원 확인', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: '재고 기록 & 잔량', exact: true }).click(); await date(page); await expect(milk(page)).toContainText('23,180.000');
});
test('restore preview rejects concurrent tab changes, stock stale save retains draft', async ({ page, context }) => {
  await start(page, 'expenses'); const content = await download(page); await select(page, content);
  const other = await context.newPage(); await start(other); await date(other); await stock(other); await save(other); await page.bringToFront(); await page.getByRole('button', { name: '전체 대체 복원 확인', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('다른 창'); await page.getByRole('button', { name: '취소', exact: true }).click();
  await page.getByRole('link', { name: '재고 기록 & 잔량', exact: true }).click(); await date(page); await expect(milk(page)).toContainText('24,180.000'); await stock(page);
  await other.bringToFront(); await stock(other, '입고', '2000'); await save(other); await page.bringToFront(); await page.getByRole('button', { name: '입고 기록 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('다른 창'); await expect(page.locator('#stock-quantity')).toHaveValue('1000');
});
test('mobile input, focus restoration, file preparation error and no external transmission', async ({ page }) => {
  const remotes: string[] = []; page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:5173')) remotes.push(r.url()); }); await page.setViewportSize({ width: 390, height: 844 }); await start(page);
  const button = page.getByRole('button', { name: '＋ 입고 기록', exact: true }); await button.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible(); await page.screenshot({ path: 'test-results/receipt-form-mobile.png', fullPage: true }); await page.keyboard.press('Escape'); await expect(button).toBeFocused();
  await page.getByRole('link', { name: '비용 & 데이터 보관', exact: true }).click(); await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('test file error'); }; }); await page.getByRole('button', { name: '전체 백업 내려받기', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('기존 자료와 입력은 유지'); expect(remotes).toEqual([]);
});
