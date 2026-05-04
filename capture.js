const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  console.log('Logging in...');
  await page.goto('http://localhost:3000/login');
  await page.type('#email', 'admin');
  await page.type('#password', 'admin');
  await page.click('button[type="submit"]');
  await page.waitForNavigation();

  console.log('Capturing dashboard...');
  await page.waitForTimeout(2000); // wait for data to load
  await page.screenshot({ path: path.join(__dirname, 'website/assets/dashboard.png') });

  console.log('Capturing bar display...');
  await page.setViewport({ width: 720, height: 1560 }); // Vertical display
  await page.goto('http://localhost:3000/display/mock-display');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(__dirname, 'website/assets/display_vertical.png') });

  await browser.close();
  console.log('Screenshots captured successfully.');
})();
