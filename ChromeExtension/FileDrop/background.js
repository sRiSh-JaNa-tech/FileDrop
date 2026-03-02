const IDLE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

// Initialize alarm on install or start
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('idleCheck', { periodInMinutes: 1 });
});

// Handle heartbeats from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'HEARTBEAT') {
        chrome.storage.local.set({ lastActivity: Date.now() });
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'idleCheck') {
        checkIdleStatus();
    }
});

async function checkIdleStatus() {
    chrome.storage.local.get(['userId', 'isActive', 'lastActivity'], async (result) => {
        if (result.isActive && result.userId && result.lastActivity) {
            const idleTime = Date.now() - result.lastActivity;
            if (idleTime > IDLE_THRESHOLD_MS) {
                console.log('User idle for 3 minutes, deactivating...');
                await performDeactivation(result.userId);
            }
        }
    });
}

async function performDeactivation(userId) {
    try {
        const response = await fetch(`https://filedropserver-96q5.onrender.com/user/${userId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            console.log(`[Auto-Deactivation] Successfully de-registered user ID: ${userId} (${Date.now()})`);
            chrome.storage.local.set({ isActive: false });
            // Notify popup if it's open
            chrome.runtime.sendMessage({ type: 'DEACTIVATED' }).catch(() => {
                // Ignore error if popup is closed
            });
        }
    } catch (error) {
        console.error(`[Auto-Deactivation Error] Failed to de-register ID: ${userId}:`, error);
    }
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'popup') {
        // Reset last activity when popup opens
        chrome.storage.local.set({ lastActivity: Date.now() });

        port.onDisconnect.addListener(async () => {
            console.log('Popup closed, starting 3-minute grace period...');
            chrome.storage.local.set({ lastActivity: Date.now() });
        });
    }
});
