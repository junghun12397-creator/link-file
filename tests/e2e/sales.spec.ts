import { test, expect, type Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('/#/sales');
  await expect(page.getByRole('heading', { name: '판매 집계 원장' })).toBeVisible();
}
async function fillSale(page: Page, quantity = '20') {
  await page.getByRole('button', { name: '＋ 판매 기록 등록' }).click();
  await page.locator('#sale-date').fill('2026-09-19');
  await page.locator('#sale-menu_id').selectOption('M02');
  await page.getByRole('dialog').getByLabel('판매 채널').selectOption('포장');
  await page.locator('#sale-quantity').fill(quantity);
  await page.locator('#sale-unit_price').fill('5000');
  await page.locator('#sale-discount_amount').fill('2000');
  await page.locator('#sale-payment_fee').fill('1500');
}
test('initial load filters, 8 rows, page totals and menu navigation', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page);
  await expect(page.getByLabel('조회 기간')).toHaveValue('2026-09');
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(page.getByText(/2 \/ \d+ 페이지/)).toBeVisible();
  await page.getByLabel('메뉴 필터').selectOption('M02');
  await expect(page.getByText(/1 \/ \d+ 페이지/)).toBeVisible();
  await page.getByLabel('채널 필터').selectOption('포장');
  for (const row of await page.locator('tbody tr').all()) { await expect(row).toContainText('카페라떼'); await expect(row).toContainText('포장'); }
  await page.getByRole('button', { name: '필터 초기화' }).click();
  await page.getByRole('link', { name: '메뉴별 수익성' }).click();
  await expect(page.getByLabel('조회 기간')).toHaveValue('2026-09');
  await expect(page.getByRole('heading', { name: '확정 메뉴 실적', exact: true })).toBeVisible();
  await page.getByLabel('분류 필터').selectOption('디저트');
  await expect(page.locator('tbody tr')).toHaveCount(4);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/profitability-desktop.png', fullPage: true });
});
test('create, source recipe preview, persisted reload and profitability agree', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await start(page); await fillSale(page);
  const preview = page.getByRole('region', { name: '판매 미리보기' });
  await expect(preview).toContainText('98,000원');
  await expect(preview).toContainText('4,000.000ml');
  await expect(preview).toContainText('400.000g');
  await expect(preview).toContainText('20개');
  await page.screenshot({ path: 'test-results/sales-form-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '판매 기록 저장', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('미확정');
  await expect(page.locator('tbody tr')).toContainText('98,000');
  await page.reload(); await expect(page.getByRole('heading', { name: '판매 집계 원장' })).toBeVisible();
  await page.getByRole('button', { name: '일간', exact: true }).click();
  await page.getByLabel('조회 기간').fill('2026-09-19');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  const amount = await page.getByRole('region', { name: '입력 실적 (미확정)' }).innerText();
  await page.getByRole('link', { name: '메뉴별 수익성' }).click();
  expect(await page.getByRole('region', { name: '입력 실적 (미확정)' }).innerText()).toBe(amount);
});
test('invalid missing fee, excessive discount, duplicate and cancelled drafts do not save', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await start(page); await fillSale(page);
  await page.locator('#sale-payment_fee').fill('');
  await page.getByRole('button', { name: '판매 기록 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('수수료');
  await page.locator('#sale-payment_fee').fill('0'); await page.locator('#sale-discount_amount').fill('100001');
  await page.getByRole('button', { name: '판매 기록 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('정상 판매액');
  await page.locator('#sale-discount_amount').fill('2000'); await page.getByRole('button', { name: '판매 기록 저장', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await fillSale(page);
  await page.getByRole('button', { name: '판매 기록 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('기존 기록');
  await page.getByRole('button', { name: '취소', exact: true }).click(); await expect(page.locator('tbody tr')).toHaveCount(1);
});
test('edit quantity, channel and date, then delete cancel/confirm remain durable', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await start(page); await fillSale(page); await page.getByRole('button', { name: '판매 기록 저장', exact: true }).click();
  await page.getByRole('button', { name: '2026-09-19 M02 포장 수정' }).click();
  await page.locator('#sale-quantity').fill('25');
  await expect(page.locator('#sale-payment_fee')).toHaveValue('1500');
  await expect(page.getByRole('region', { name: '판매 미리보기' })).toContainText('123,000원');
  await page.getByRole('button', { name: '판매 기록 저장', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1); await expect(page.locator('tbody tr')).toContainText('25잔');
  await page.getByRole('button', { name: '2026-09-19 M02 포장 수정' }).click();
  await page.locator('#sale-date').fill('2026-09-20'); await page.getByRole('dialog').getByLabel('판매 채널').selectOption('매장');
  await expect(page.getByRole('region', { name: '판매 미리보기' })).toContainText('포장컵세트 0개 사용');
  await page.getByRole('button', { name: '판매 기록 저장', exact: true }).click();
  await expect(page.locator('tbody tr')).toContainText('2026-09-20');
  await page.getByRole('button', { name: '2026-09-20 M02 매장 삭제' }).click();
  await page.getByRole('button', { name: '취소', exact: true }).click(); await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '2026-09-20 M02 매장 삭제' }).click(); await page.getByRole('button', { name: '삭제 확인' }).click();
  await expect(page.getByText('판매 기록 없음 · 0건', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: '판매 집계 원장' })).toBeVisible();
  await page.getByRole('button', { name: '일간', exact: true }).click(); await page.getByLabel('조회 기간').fill('2026-09-20');
  await expect(page.getByText('판매 기록 없음 · 0건', { exact: true })).toBeVisible();
});
test('zero revenue is allowed and ratio is unavailable', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept()); await start(page); await fillSale(page);
  await page.locator('#sale-unit_price').fill('0'); await page.locator('#sale-discount_amount').fill('0'); await page.locator('#sale-payment_fee').fill('0');
  await expect(page.getByRole('region', { name: '판매 미리보기' })).toContainText('계산 대상 없음');
  await page.getByRole('button', { name: '판매 기록 저장', exact: true }).click();
  await expect(page.getByRole('region', { name: '입력 실적 (미확정)' })).toContainText('계산 대상 없음');
  await expect(page.locator('tbody tr')).toHaveCount(1);
});
test('actual IndexedDB save error keeps input and original data, retry creates once', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept()); await start(page); await fillSale(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<typeof original>) { if (this.name === 'datasets') { IDBObjectStore.prototype.put = original; throw new DOMException('test quota', 'QuotaExceededError'); } return original.apply(this, args); };
  });
  await page.getByRole('button', { name: '판매 기록 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('기존 자료와 입력은 유지');
  await expect(page.locator('#sale-quantity')).toHaveValue('20');
  await page.getByRole('button', { name: '판매 기록 저장', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.locator('tbody tr')).toHaveCount(1);
});
test('two tabs reject stale save, retaining both draft and latest record', async ({ page, context }) => {
  page.on('dialog', dialog => dialog.accept()); await start(page); await fillSale(page);
  const other = await context.newPage(); other.on('dialog', dialog => dialog.accept()); await start(other); await fillSale(other, '30');
  await other.getByRole('button', { name: '판매 기록 저장', exact: true }).click(); await expect(other.getByRole('dialog')).toHaveCount(0);
  await page.bringToFront();
  await page.getByRole('button', { name: '판매 기록 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('다른 창'); await expect(page.locator('#sale-quantity')).toHaveValue('20');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await page.getByRole('button', { name: '일간', exact: true }).click(); await page.getByLabel('조회 기간').fill('2026-09-19');
  await expect(page.locator('tbody tr')).toHaveCount(1); await expect(page.locator('tbody tr')).toContainText('30잔');
});
test('narrow layout and keyboard focus remain usable; only localhost requests', async ({ page }) => {
  const remotes: string[] = []; page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:5173') && !r.url().startsWith('ws://127.0.0.1:5173')) remotes.push(r.url()); });
  await page.setViewportSize({ width: 390, height: 844 }); await start(page);
  await expect(page.getByRole('button', { name: '＋ 판매 기록 등록' })).toBeVisible();
  await page.getByRole('button', { name: '＋ 판매 기록 등록' }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '＋ 판매 기록 등록' })).toBeFocused();
  await page.screenshot({ path: 'test-results/sales-mobile.png', fullPage: true });
  expect(remotes).toEqual([]);
});
