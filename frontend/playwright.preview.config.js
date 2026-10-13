import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'preview.spec.js',use:{baseURL:'http://127.0.0.1:5175',channel:'chrome'},webServer:{command:'npm run preview -- --port 5175 --strictPort',url:'http://127.0.0.1:5175'},reporter:'list'});
