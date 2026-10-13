import { test, expect } from '@playwright/test';
for (const width of [375, 390, 430, 1440]) {
  test(`preview without backend at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const requests = [];
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url()); });
    await page.goto('/');
    await expect(page.getByText('Chế độ xem trước – Backend chưa được kết nối', {exact:true})).toBeVisible();
    for (const name of ['Tổng quan', 'Dịch video', 'Lịch sử', 'Giọng đọc AI', 'Cài đặt', 'Gói dịch vụ']) {
      if (width < 1000) await page.getByRole('button', {name:'Mở menu',exact:true}).click();
      await page.getByRole('navigation').getByRole('button', {name,exact:true}).click();
      await expect(page.locator('.page-heading')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (name === 'Dịch video') await expect(page.getByRole('button',{name:'Bắt đầu dịch video'})).toBeDisabled();
      if (name === 'Giọng đọc AI') {
        for (const button of await page.getByRole('button',{name:/Nghe thử/}).all()) await expect(button).toBeDisabled();
      }
      if (name === 'Cài đặt') await expect(page.getByRole('button',{name:'Lưu cấu hình'})).toBeDisabled();
    }
    expect(requests).toEqual([]);
  });
}
