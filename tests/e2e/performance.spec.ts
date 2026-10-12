import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('20-run source-scale measurements: first load, filter, preview, save', async ({ browser }) => {
  test.setTimeout(180000);
  const startup: number[] = [], filter: number[] = [], preview: number[] = [], save: number[] = [];
  for (let i = 0; i < 20; i++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(); page.on('dialog', d => d.accept());
    const start = Date.now(); await page.goto('http://127.0.0.1:5173/#/sales'); await expect(page.getByRole('heading', { name: '판매 집계 원장' })).toBeVisible(); startup.push(Date.now() - start);
    await page.getByLabel('메뉴 필터').selectOption('M02');
    await page.getByRole('button', { name: '＋ 판매 기록 등록' }).click();
    await page.locator('#sale-date').fill('2026-09-19'); await page.locator('#sale-menu_id').selectOption('M02'); await page.getByRole('dialog').getByLabel('판매 채널').selectOption('포장');
    await page.locator('#sale-quantity').fill('20'); await page.locator('#sale-unit_price').fill('5000'); await page.locator('#sale-discount_amount').fill('2000');
    const previewStart = Date.now(); await page.locator('#sale-payment_fee').fill('1500'); await expect(page.getByRole('region', { name: '판매 미리보기' })).toContainText('70,708원'); preview.push(Date.now() - previewStart);
    const saveStart = Date.now(); await page.getByRole('button', { name: '판매 기록 저장', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); save.push(Date.now() - saveStart);
    const filterStart = Date.now(); await page.getByLabel('메뉴 필터').selectOption('M01'); await expect(page.getByText('판매 기록 없음 · 0건', { exact: true })).toBeVisible(); filter.push(Date.now() - filterStart);
    await context.close();
  }
  const stats = (items: number[]) => { const sorted = [...items].sort((a, b) => a - b); return { count: items.length, p95: sorted[Math.ceil(items.length * 0.95) - 1], max: sorted[sorted.length - 1], min: sorted[0] }; };
  console.log('PERFORMANCE_MS', JSON.stringify({ browser: browser.version(), environment: 'Windows Edge headless, localhost Vite dev, 1440x1000, full source data; automation and initial download included', startup: stats(startup), filter: stats(filter), preview: stats(preview), save: stats(save) }));
  expect(stats(startup).p95).toBeLessThanOrEqual(5000); expect(stats(filter).p95).toBeLessThanOrEqual(500); expect(stats(preview).p95).toBeLessThanOrEqual(150); expect(stats(save).p95).toBeLessThanOrEqual(1000);
});

test('20-run EPIC3 inventory preview/save and complete backup/restore preparation', async ({ page, browser }) => {
  test.setTimeout(360000); await page.goto('/#/inventory'); await expect(page.getByRole('heading', { name: '재료 잔량', exact: true })).toBeVisible();
  const stockPreview: number[] = [], stockSave: number[] = [], backup: number[] = [], restore: number[] = [];
  for (let i = 0; i < 20; i++) {
    await page.getByRole('button', { name: '＋ 입고 기록', exact: true }).click(); await page.locator('#stock-date').fill('2026-09-19'); await page.locator('#stock-material_id').selectOption('I02');
    const previewStart = Date.now(); await page.locator('#stock-quantity').fill('1000'); await expect(page.getByRole('region', { name: '재고 미리보기', exact: true })).toContainText((24180 + i * 1000).toLocaleString('en-US') + '.000'); stockPreview.push(Date.now() - previewStart);
    const saveStart = Date.now(); await page.getByRole('button', { name: '입고 기록 저장', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); stockSave.push(Date.now() - saveStart);
  }
  await page.getByRole('link', { name: '비용 & 데이터 보관', exact: true }).click();
  for (let i = 0; i < 20; i++) {
    const waiting = page.waitForEvent('download'); const backupStart = Date.now(); await page.getByRole('button', { name: '전체 백업 내려받기', exact: true }).click(); const file = await waiting; backup.push(Date.now() - backupStart);
    const content = await readFile((await file.path())!, 'utf8');
    await page.getByLabel('복원할 백업 파일', { exact: true }).setInputFiles({ name: 'speed.json', mimeType: 'application/json', buffer: Buffer.from(content) });
    await expect(page.getByRole('dialog', { name: '전체 복원 확인', exact: true })).toBeVisible();
    // Preparation and commit measured separately to exclude user's confirmation wait.
    const commitStart = Date.now(); await page.getByRole('button', { name: '전체 대체 복원 확인', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); const commit = Date.now() - commitStart;
    const prepStart = Date.now(); await page.getByLabel('복원할 백업 파일', { exact: true }).setInputFiles({ name: 'speed.json', mimeType: 'application/json', buffer: Buffer.from(content) }); await expect(page.getByRole('dialog', { name: '전체 복원 확인', exact: true })).toBeVisible(); restore.push(Date.now() - prepStart + commit); await page.getByRole('button', { name: '취소', exact: true }).click();
  }
  const stats = (items: number[]) => { const sorted = [...items].sort((a, b) => a - b); return { count: items.length, p95: sorted[Math.ceil(items.length * .95) - 1], min: sorted[0], max: sorted[sorted.length - 1] }; };
  console.log('EPIC3_PERFORMANCE_MS', JSON.stringify({ browser: browser.version(), environment: 'Windows Edge headless, localhost Vite dev, 1440x1000, source data plus20receipts; automated file transfer included, user confirmation wait excluded', stockPreview: stats(stockPreview), stockSave: stats(stockSave), backup: stats(backup), restore: stats(restore) }));
  expect(stats(stockPreview).p95).toBeLessThanOrEqual(150); expect(stats(stockSave).p95).toBeLessThanOrEqual(1000); expect(stats(backup).p95).toBeLessThanOrEqual(3000); expect(stats(restore).p95).toBeLessThanOrEqual(5000);
});

test('20-run EPIC2 period queries, expense guidance and durable saves', async ({ page, browser }) => {
  test.setTimeout(180000);
  await page.goto('/#/dashboard'); await expect(page.getByRole('heading', { name: '확정 매장 손익', exact: true })).toBeVisible();
  const dashboard: number[] = [], inventory: number[] = [], expenseSave: number[] = [], expensePreview: number[] = [];
  for (let i = 0; i < 20; i++) {
    const period = i % 2 ? '2026-09' : '2026-08';
    const start = Date.now(); await page.getByLabel('조회 기간').fill(period); await expect(page.getByRole('region', { name: '확정 매장 손익', exact: true })).toContainText('매장 손익'); dashboard.push(Date.now() - start);
  }
  await page.getByRole('link', { name: '재고 기록 & 잔량', exact: true }).click();
  for (let i = 0; i < 20; i++) { const start = Date.now(); const period = i % 2 ? '2026-09' : '2026-08'; await page.getByLabel('조회 기간').fill(period); await expect(page.getByRole('region', { name: '재고 기준' })).toContainText(period); inventory.push(Date.now() - start); }
  await page.getByRole('link', { name: '비용 & 데이터 보관', exact: true }).click();
  for (let i = 0; i < 20; i++) {
    await page.getByRole('button', { name: '＋ 비용 기록 등록' }).click(); await page.locator('#expense-date').fill('2026-09-19'); await page.locator('#expense-category').selectOption('광고비');
    const previewStart = Date.now(); await page.locator('#expense-amount').fill(String(10000 + i)); await expect(page.getByRole('region', { name: '비용 반영 안내' })).toContainText((10000 + i).toLocaleString('en-US')); expensePreview.push(Date.now() - previewStart);
    const start = Date.now(); await page.getByRole('button', { name: '비용 기록 저장', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); expenseSave.push(Date.now() - start);
  }
  const stats = (items: number[]) => { const sorted = [...items].sort((a, b) => a - b); return { count: items.length, p95: sorted[Math.ceil(items.length * .95) - 1], min: sorted[0], max: sorted[sorted.length - 1] }; };
  console.log('EPIC2_PERFORMANCE_MS', JSON.stringify({ browser: browser.version(), environment: 'Windows Edge headless, localhost Vite dev, 1440x1000, full source data; automation included', dashboard: stats(dashboard), inventory: stats(inventory), expensePreview: stats(expensePreview), expenseSave: stats(expenseSave) }));
  expect(stats(dashboard).p95).toBeLessThanOrEqual(500); expect(stats(inventory).p95).toBeLessThanOrEqual(500); expect(stats(expensePreview).p95).toBeLessThanOrEqual(150); expect(stats(expenseSave).p95).toBeLessThanOrEqual(1000);
});
