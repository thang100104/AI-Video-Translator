import { test, expect } from '@playwright/test';
import { ADMIN } from './setup';

test.beforeEach(async ({ context }) => {
  const response=await context.request.post('/api/auth/login',{data:{email:ADMIN.email,password:ADMIN.password}});
  expect(response.ok()).toBeTruthy();
});

test('dashboard pages use real backend state and expose working controls', async ({ page, context }) => {
  const request=context.request;
  const errors=[];
  page.on('pageerror',error => errors.push(error.message));
  const health=await request.get('/api/health');
  expect(health.ok()).toBeTruthy();
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Biến video thành tiếng Việt.'})).toBeVisible();
  await expect(page.getByText('Backend đã kết nối')).toBeVisible();
  await expect(page.getByRole('button',{name:'Bắt đầu dịch video',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Tổng quan',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Không giới hạn ngôn ngữ.'})).toBeVisible();
  await page.getByRole('button',{name:'Lịch sử',exact:true}).click();
  await page.getByRole('textbox',{name:'Tìm video'}).fill('no-matching-video-check');
  await expect(page.getByRole('textbox',{name:'Tìm video'})).toHaveValue('no-matching-video-check');
  await page.getByRole('button',{name:'Giọng đọc AI',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Thư viện giọng tiếng Việt'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Nghe thử Hoài My',exact:true}).first()).toBeEnabled();
  await page.getByRole('button',{name:'Cài đặt',exact:true}).click();
  await expect(page.getByLabel('Địa chỉ API')).toBeVisible();
  await expect(page.getByRole('button',{name:'Lưu cấu hình',exact:true})).toBeEnabled();
  const before=(await (await request.get('/api/settings')).json()).translation_model;
  const mutations=[];
  page.on('request',req => { if (req.method() === 'PUT' && req.url().endsWith('/api/settings')) mutations.push(req); });
  await page.getByLabel('Tên model').fill('unsaved-model-check');
  await Promise.all([page.waitForResponse(response => response.url().endsWith('/api/health')),page.locator('.system-status').getByRole('button',{name:'Kiểm tra lại'}).click()]);
  expect(mutations).toHaveLength(0);
  expect((await (await request.get('/api/settings')).json()).translation_model).toBe(before);
  expect(errors).toEqual([]);
});

test('mobile menu and video selection stay usable without overflowing', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Mở menu'}).click();
  await page.getByRole('button',{name:'Giọng đọc AI',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Một giọng đọc. Nhiều cảm xúc.'})).toBeVisible();
  await page.getByRole('button',{name:'Dịch video mới',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles({name:'wrong-format.txt',mimeType:'text/plain',buffer:Buffer.from('invalid')});
  await expect(page.getByRole('alert')).toContainText('Chỉ hỗ trợ tệp MP4, MOV và WebM');
  const overflow=await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('plans show real account entitlement and unconfigured payment state', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Gói dịch vụ',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Nâng cấp không gian sáng tạo.'})).toBeVisible();
  await expect(page.getByText('Chưa kết nối PayOS',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Đã có quyền 1 GB',exact:true})).toBeDisabled();
  await expect(page.getByText('Chưa có đơn thanh toán.',{exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
});
