// Wait for elements to load
console.log("Used Car Scanner Content Script Loaded");

// Target Facebook Marketplace primarily as assumed
function extractCarData() {
    const url = window.location.href;

    // These selectors are generic and would need updates based on actual site structure
    let title = document.querySelector('h1')?.innerText || "Unknown Title";
    let price = "Unknown";
    let mileage = "Unknown";
    let description = "No description found";
    let id = btoa(url).replace(/=/g, '').slice(-15); // generate quick ID from url

    // Very basic FB Marketplace heuristic
    if (url.includes("facebook.com/marketplace")) {
        const mainTexts = document.querySelectorAll('span');

        // Find generic identifiers for price and description
        // This is pseudo-code for a real scraper. 
        // Usually need complex aria-label or specific classes
        const priceEl = Array.from(document.querySelectorAll('span')).find(el => el.innerText.startsWith('$'));
        if (priceEl) price = priceEl.innerText;

        // Attempting to find description box (Facebook hides it deeply)
        const descEl = document.querySelector('div[dir="auto"] > span');
        if (descEl) description = descEl.innerText;
    } else {
        // Craigslist basics
        title = document.querySelector('#titletextonly')?.innerText || title;
        price = document.querySelector('.price')?.innerText || price;
        mileage = document.querySelector('.attrgroup')?.innerText || mileage; // Just grabbing block
        description = document.querySelector('#postingbody')?.innerText || description;
    }

    return {
        id,
        url,
        title,
        price,
        mileage,
        description
    };
}

function injectScanButton() {
    if (document.getElementById('ucs-scan-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'ucs-scan-btn';
    btn.innerText = 'Scan Car';
    btn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 999999;
    padding: 15px 25px;
    background-color: #4F46E5;
    color: white;
    font-size: 16px;
    font-weight: bold;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  `;

    btn.onclick = () => {
        btn.innerText = 'Scanning...';
        btn.disabled = true;
        const carData = extractCarData();
        chrome.runtime.sendMessage({ action: 'scanCar', payload: carData }, (response) => {
            if (response && response.success) {
                btn.innerText = `Scanned! Score: ${response.data.analysis.score}`;
                btn.style.backgroundColor = response.data.analysis.score > 50 ? '#10B981' : '#EF4444';
            } else {
                btn.innerText = 'Scan Failed';
                btn.style.backgroundColor = '#6B7280';
            }
            setTimeout(() => {
                btn.innerText = 'Scan Car';
                btn.disabled = false;
                btn.style.backgroundColor = '#4F46E5';
            }, 3000);
        });
    };

    document.body.appendChild(btn);
}

// Initial injection and observe changes for SPA
injectScanButton();
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        injectScanButton();
    }
}).observe(document, { subtree: true, childList: true });

// Listen for Context Menu messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'triggerScan') {
        const btn = document.getElementById('ucs-scan-btn');
        if (btn) btn.click();
        sendResponse({ received: true });
    }
});
