const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const url = "https://www.autotrader.ca/offers/mini-3-door-all4-gasoline-black-b5397230-0430-419b-bdeb-44f27d29e6c9";
    console.log("Testing:", url);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(5000);
    
    await page.screenshot({ path: 'test_offer.png' });
    
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    fs.writeFileSync('test_offer.html', html);
    
    console.log("Saved test_offer.png and test_offer.html");
    await browser.close();
})();
