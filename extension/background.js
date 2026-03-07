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

    let action = '';
    if (info.menuItemId === "scan-listing") {
        action = 'triggerScan';
    } else if (info.menuItemId === "scan-page" || info.menuItemId === "scan-search") {
        action = 'triggerBatchStart';
    }

    if (action) {
        chrome.tabs.sendMessage(tab.id, { action: action }, (response) => {
            // Handle the "receiving end does not exist" error gracefully
            if (chrome.runtime.lastError) {
                console.log("Could not establish connection to content script. Make sure you are on a supported car listing page.");
            }
        });
    }
});
