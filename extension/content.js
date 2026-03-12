let lastHoveredLink = "";

// Track mouse movements to capture AutoTrader's custom link elements
document.addEventListener('mouseover', (e) => {
    let url = "";

    // 1. Try finding a wrapper anchor
    let linkEl = e.target.closest('a, [href]');
    if (linkEl && linkEl.getAttribute('href')) {
        url = new URL(linkEl.getAttribute('href'), document.baseURI).href;
    } else {
        // 2. We might be inside a React <div> card without an href wrapper.
        // Traverse up to find the card container, then look DOWN for the first valid vehicle link.
        let cardContainer = e.target.closest('div[class*="result-item"], div[class*="listing"], [data-track-type]');
        if (cardContainer) {
            let innerLink = cardContainer.querySelector('a[href*="/cars/"], a[href*="/offers/"], a[href*="/item/"], a[href*="/a/"]');
            if (innerLink && innerLink.getAttribute('href')) {
                url = new URL(innerLink.getAttribute('href'), document.baseURI).href;
            }
        }
    }

    // Only update if we found a distinct path, otherwise leave it empty so the background script knows the hover failed.
    if (url && !url.includes('javascript:') && url !== window.location.href) {
        lastHoveredLink = url;
    } else {
        lastHoveredLink = "";
    }
}, { passive: true });

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
    } else if (request.action === 'showToast') {
        let btn = document.getElementById('ucs-scan-btn');
        if (!btn) {
            injectScanButton();
            btn = document.getElementById('ucs-scan-btn');
        }
        if (btn) {
            btn.innerText = request.message;
            if (request.success === true) {
                btn.style.backgroundColor = '#10B981';
            } else if (request.success === false) {
                btn.style.backgroundColor = '#EF4444';
            } else {
                btn.style.backgroundColor = '#6B7280';
            }
            if (request.success !== undefined) {
                setTimeout(() => {
                    btn.innerText = 'Scan Car';
                    btn.disabled = false;
                    btn.style.backgroundColor = '#4F46E5';
                }, 3000);
            }
        }
        sendResponse({ received: true });
    } else if (request.action === 'getHoveredLink') {
        sendResponse({ url: lastHoveredLink });
    } else if (request.action === 'fetchAndScanUrl') {
        // Authenticated client-side fetch to bypass Bot Detectors
        fetch(request.url)
            .then(res => res.text())
            .then(html => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                
                let description = '';
                const script = doc.getElementById('__NEXT_DATA__');
                if (script) {
                    try {
                        const data = JSON.parse(script.textContent);
                        const listingDetails = data?.props?.pageProps?.listingDetails || data?.props?.pageProps?.listing;
                        if (listingDetails?.description) {
                            const tmp = document.createElement('div');
                            tmp.innerHTML = listingDetails.description;
                            description = tmp.innerText;
                        }
                    } catch (err) {}
                }
                
                if (!description) {
                    const descEl = doc.querySelector('[data-cy="vehicle-description"], [data-testid="vehicle-description"], [data-test="vehicleDescription"], .VehicleDescription_container__rajO2');
                    if (descEl) description = descEl.innerText;
                }
                
                if (!description) {
                    const mainEl = doc.querySelector('main');
                    if (mainEl) description = mainEl.innerText;
                }
                
                if (!description) description = doc.body.innerText;
                
                let title = doc.querySelector('h1, h2')?.innerText || doc.title || 'Unknown Car';
                
                let price = doc.querySelector('[data-testid="vehicle-price"]')?.innerText || 'Unknown price';
                let mileage = doc.querySelector('[data-testid="vehicleMileage"]')?.innerText || 'Unknown mileage';

                const payload = {
                    id: request.url.substring(request.url.length - 15),
                    url: request.url,
                    title: title.trim(),
                    price: price.trim(),
                    mileage: mileage.trim(),
                    description: description.trim().slice(0, 4000)
                };

                chrome.runtime.sendMessage({ action: 'scanCar', payload: payload }, (response) => {
                    if (chrome.runtime.lastError || !response) {
                        sendResponse({ success: false, error: 'Extension error' });
                    } else if (response.success && response.data?.analysis) {
                        sendResponse({ success: true, car: response.data });
                    } else {
                        sendResponse({ success: false, error: response.error || 'Extraction failed' });
                    }
                });
            })
            .catch(err => sendResponse({ success: false, error: err.message }));
            
        return true; 
    }
});
