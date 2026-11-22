import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5055',
    headless: true,
  },
  webServer: {
    command: 'cd backend && PORT=5055 NODE_ENV=test DATABASE_PATH=./database/playwright.db JWT_SECRET=test_secret_for_mrv_bookhub_1234567890 LOG_TO_FILE=false node --no-warnings=ExperimentalWarning -e "require(\'./config/database\').initializeDatabase(); require(\'./database/seed.js\').seedDatabase().then(()=>{require(\'./server.js\')}).catch(e=>{console.error(e);process.exit(1)})"',
    url: 'http://127.0.0.1:5055/api/health',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
