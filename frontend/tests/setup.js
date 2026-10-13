import { request } from '@playwright/test';
export const ADMIN = { name: 'Browser Test Admin', email: 'browser-admin@example.test', password: 'Test-only password 123!' };
export default async function setup() {
  const client=await request.newContext({baseURL:'http://127.0.0.1:5174'});
  const response=await client.post('/api/auth/register',{data:ADMIN});
  if(response.status() !== 201) throw new Error('Cannot create isolated browser test account');
  await client.dispose();
}
