import { test, expect } from '@playwright/test';

test('register, persist session, logout and sign in again through real forms', async ({ page }) => {
  const email=`browser-user-${Date.now()}@example.test`;
  const password='Browser test password 123!';
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Đăng ký',exact:true}).click();
  await page.getByLabel('Họ và tên').fill('Người dùng kiểm thử');
  await page.getByLabel('Email',{exact:true}).fill(email);
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
  await page.getByLabel('Xác nhận mật khẩu').fill('Different password 123!');
  await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Mật khẩu xác nhận chưa khớp');
  await page.getByLabel('Xác nhận mật khẩu').fill(password);
  await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Biến video thành tiếng Việt.'})).toBeVisible();
  await expect(page.locator('.account-button')).toContainText('Người dùng kiểm thử');
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Biến video thành tiếng Việt.'})).toBeVisible();
  await page.getByRole('button',{name:'Cài đặt',exact:true}).click();
  await expect(page.getByRole('button',{name:'Lưu cấu hình',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Chào mừng bạn trở lại'})).toBeVisible();
  await page.getByLabel('Email',{exact:true}).fill(email);
  await page.getByLabel('Mật khẩu',{exact:true}).fill('Wrong password 123!');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).last().click();
  await expect(page.getByRole('alert')).toContainText('Email hoặc mật khẩu chưa đúng');
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).last().click();
  await expect(page.getByRole('heading',{name:'Biến video thành tiếng Việt.'})).toBeVisible();
});

test('registration form is responsive on mobile', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Đăng ký',exact:true}).click();
  await expect(page.getByLabel('Xác nhận mật khẩu')).toBeVisible();
  await expect(page.getByRole('button',{name:'Tạo tài khoản',exact:true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
