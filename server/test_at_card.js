const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Go to auto trader search page for Halifax
    await page.goto("https://www.autotrader.ca/cars/ns/halifax/?rcp=15&rcs=0&srt=39&yRng=%2C2020&prx=100&prv=Nova%20Scotia&loc=b3k3c3", { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(5000);
    
    // Dump the first search result card DOM
    const cardHtml = await page.evaluate(() => {
        const firstCard = document.querySelector('.result-item, [data-track-type="SRP_VEHICLE"]');
        return firstCard ? firstCard.outerHTML : "NO CARD FOUND";
    });
    
    require('fs').writeFileSync('at_card_dump.html', cardHtml);
    console.log("Dumped card DOM");
    await browser.close();
})();
