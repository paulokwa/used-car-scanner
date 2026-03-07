// Batch Scanning Logic
// For scanning multiple cars on a search results page

function injectBatchScanButton() {
    if (document.getElementById('ucs-batch-btn')) return;

    const batchPanel = document.createElement('div');
    batchPanel.id = 'ucs-batch-panel';
    batchPanel.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    z-index: 999999;
    background: white;
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    color: black;
    font-family: sans-serif;
  `;

    batchPanel.innerHTML = `
    <h3 style="margin: 0 0 10px 0; font-size: 16px;">Batch Scanner</h3>
    <div style="display:flex; gap: 10px; margin-bottom: 10px;">
      <button id="ucs-btn-start" style="padding: 5px 10px; cursor: pointer;">Start Batch</button>
      <button id="ucs-btn-pause" style="padding: 5px 10px; cursor: pointer;" disabled>Pause</button>
      <button id="ucs-btn-stop" style="padding: 5px 10px; cursor: pointer;" disabled>Stop</button>
    </div>
    <div style="font-size: 14px; margin-bottom: 5px;">Progress: <span id="ucs-progress">0/0</span></div>
    <div id="ucs-status" style="font-size: 12px; color: gray;">Ready</div>
  `;

    document.body.appendChild(batchPanel);

    let isScanning = false;
    let isPaused = false;

    const btnStart = document.getElementById('ucs-btn-start');
    const btnPause = document.getElementById('ucs-btn-pause');
    const btnStop = document.getElementById('ucs-btn-stop');
    const progressEl = document.getElementById('ucs-progress');
    const statusEl = document.getElementById('ucs-status');

    btnStart.onclick = async () => {
        if (isPaused) {
            isPaused = false;
            btnPause.innerText = 'Pause';
            statusEl.innerText = 'Resuming...';
            return;
        }

        isScanning = true;
        btnStart.disabled = true;
        btnPause.disabled = false;
        btnStop.disabled = false;

        // VERY naive logic to find all links to listings on the current page
        // Some sites like AutoTrader hide links inside a specific class or data attribute
        let allAnchors = Array.from(document.querySelectorAll('a, a[data-anchor-overlay="true"]'));
        let links = allAnchors
            .map(a => a.href)
            .filter(href => href && (
                href.includes('/item/') || // FB Marketplace
                href.includes('/cto/') || // Craigslist
                href.includes('/ctd/') || // Craigslist (dealer)
                href.includes('/a/') || // AutoTrader.ca
                href.includes('/offers/') || // AutoTrader.ca
                href.includes('cars-for-sale/vehicledetails') // AutoTrader.com
            ));

        // Deduplicate
        links = [...new Set(links)];

        progressEl.innerText = `0/${links.length}`;
        statusEl.innerText = 'Scanning...';
        chrome.runtime.sendMessage({ action: 'updateBadge', text: `0/${links.length}` });

        for (let i = 0; i < links.length; i++) {
            if (!isScanning) {
                statusEl.innerText = 'Stopped';
                break;
            }

            while (isPaused) {
                await new Promise(r => setTimeout(r, 500));
            }

            statusEl.innerText = `Fetching car ${i + 1}...`;

            try {
                // Send URL to background script which proxies to Playwright backend
                const response = await new Promise(resolve => {
                    chrome.runtime.sendMessage({ action: 'scanUrl', url: links[i] }, resolve);
                });
                if (!response || !response.success) {
                    console.error("Batch scan failed for URL", links[i], response?.error);
                }
                progressEl.innerText = `${i + 1}/${links.length}`;
                chrome.runtime.sendMessage({ action: 'updateBadge', text: `${i + 1}/${links.length}` });
            } catch (e) {
                console.error(e);
            }
        }

        isScanning = false;
        btnStart.disabled = false;
        btnPause.disabled = true;
        btnStop.disabled = true;
        if (statusEl.innerText !== 'Stopped') {
            statusEl.innerText = 'Completed';
            chrome.runtime.sendMessage({ action: 'updateBadge', text: 'Done', color: '#10B981' });
            setTimeout(() => chrome.runtime.sendMessage({ action: 'updateBadge', text: '' }), 3000);
        } else {
            chrome.runtime.sendMessage({ action: 'updateBadge', text: '' });
        }
    };

    btnPause.onclick = () => {
        isPaused = !isPaused;
        btnPause.innerText = isPaused ? 'Resume' : 'Pause';
        statusEl.innerText = isPaused ? 'Paused' : 'Scanning...';
    };

    btnStop.onclick = () => {
        isScanning = false;
        isPaused = false;
        btnStart.disabled = false;
        btnPause.disabled = true;
        btnStop.disabled = true;
        btnPause.innerText = 'Pause';
        chrome.runtime.sendMessage({ action: 'updateBadge', text: '' });
    };
}

injectBatchScanButton();

// Listen for Context Menu messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'triggerBatchStart') {
        const btn = document.getElementById('ucs-btn-start');
        if (btn) btn.click();
        sendResponse({ received: true });
    }
});
