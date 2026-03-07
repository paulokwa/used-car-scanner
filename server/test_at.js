const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto('https://www.autotrader.ca/offers/volvo-xc90-inscription-gasoline-grey-6f1a39ae-339e-40ed-8188-4450b01da40d', { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) { }

    const data = await page.evaluate(() => {
        const metaDesc = document.querySelector('meta[name="description"]');
        return metaDesc ? metaDesc.content : 'NOT FOUND';
    });

    console.log("DESCRIPTION: ", data);
    await browser.close();
})();
