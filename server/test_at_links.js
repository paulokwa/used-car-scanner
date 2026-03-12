const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Go to auto trader search page for Halifax
    await page.goto("https://www.autotrader.ca/cars/ns/halifax/?rcp=15&rcs=0&srt=39&yRng=%2C2020&prx=100&prv=Nova%20Scotia&loc=b3k3c3", { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(5000);
    
    // Dump all links on the cards
    const results = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors.map(a => a.href).filter(h => h.includes('autotrader.ca/a/') || h.includes('/cars/') || h.includes('/offers/'));
    });
    
    console.log(JSON.stringify(results, null, 2));
    await browser.close();
})();
