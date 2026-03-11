chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scanCar') {
        fetch('http://localhost:3001/api/scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request.payload)
        })
            .then(response => response.json())
            .then(data => sendResponse({ success: true, data }))
            .catch(error => {
                console.error('Scan proxy error:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Keep the message channel open for the async response
    } else if (request.action === 'scanUrl') {
        fetch('http://localhost:3001/api/scan-url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: request.url })
        })
            .then(response => response.json())
            .then(data => sendResponse(data))
            .catch(error => {
                console.error('Scan URL proxy error:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true;
    } else if (request.action === 'updateBadge') {
        chrome.action.setBadgeText({ text: request.text || '' });
        if (request.color) {
            chrome.action.setBadgeBackgroundColor({ color: request.color });
        } else {
            chrome.action.setBadgeBackgroundColor({ color: '#4F46E5' }); // default blue
        }
        sendResponse({ success: true });
    }
});

chrome.action.onClicked.addListener((tab) => {
    // Open the local UI page included in the extension, or a file:// URL if preferred.
    // However, Chrome extensions can't easily open file:// URLs by default.
    // The easiest robust way for a local tool is to just host it via the Node server we already run!
    chrome.tabs.create({ url: 'http://localhost:3001/ui/index.html' });
});

// Create Context Menus
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "scan-listing",
        title: "Scan this Listing",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "scan-page",
        title: "Scan ALL Listings on Page (Max 20)",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "scan-search",
        title: "Scan ALL Listings in Search (All Pages)",
        contexts: ["all"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab || !tab.id) return;
    
    console.log("Context Menu Clicked:", info);

    if (info.menuItemId === "scan-listing") {
        const urlToScan = info.linkUrl;
        
        if (urlToScan) {
            triggerScanProcess(tab.id, urlToScan);
        } else {
            // Chrome didn't detect an <a> tag, ask our content script what the mouse is actively hovering over
            chrome.tabs.sendMessage(tab.id, { action: 'getHoveredLink' }, (response) => {
                if (chrome.runtime.lastError || !response || !response.url) {
                    // Fallback to the active page itself
                    chrome.tabs.sendMessage(tab.id, { action: 'triggerScan' });
                } else {
                    triggerScanProcess(tab.id, response.url);
                }
            });
        }
    } else if (info.menuItemId === "scan-page" || info.menuItemId === "scan-search") {
        chrome.tabs.sendMessage(tab.id, { action: 'triggerBatchStart' });
    }
});

function triggerScanProcess(tabId, urlToScan) {
    chrome.tabs.sendMessage(tabId, { action: 'showToast', message: 'Scanning link...' });
            
    fetch('http://localhost:3001/api/scan-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToScan })
    })
    .then(res => res.json())
    .then(data => {
        if (data && data.success) {
            chrome.tabs.sendMessage(tabId, { action: 'showToast', message: `Scanned! Score: ${data.car.analysis.score}`, success: true });
        } else {
            chrome.tabs.sendMessage(tabId, { action: 'showToast', message: `Scan failed`, success: false });
        }
    })
    .catch(err => {
        chrome.tabs.sendMessage(tabId, { action: 'showToast', message: `Error: ${err.message}`, success: false });
    });
}
