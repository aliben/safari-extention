
// This is the background service worker for the extension.
self.importScripts('./lib/tweetnacl.min.js');

// --- IndexedDB for Keys ---
const DB_NAME = 'ReplicaCryptoDB';
const DB_VERSION = 1;
const KEY_STORE_NAME = 'keys';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

async function saveKey(keyObject) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(KEY_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(KEY_STORE_NAME);
    const request = store.put(keyObject);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getKey(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(KEY_STORE_NAME, 'readonly');
    const store = transaction.objectStore(KEY_STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteKey(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(KEY_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(KEY_STORE_NAME, 'readwrite');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}


// --- Encoding Helpers ---
function encodeUTF8(str) {
    return new TextEncoder().encode(str);
}
function decodeUTF8(arr) {
    return new TextDecoder().decode(arr);
}
function encodeBase64(arr) {
    return btoa(String.fromCharCode.apply(null, arr));
}
function decodeBase64(str) {
    var binary = atob(str);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function encryptSymmetric(message, keyB64) {
    if (!keyB64) return message;
    const key = decodeBase64(keyB64);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const messageUint8 = encodeUTF8(JSON.stringify(message));
    const box = nacl.secretbox(messageUint8, nonce, key);
    const fullMessage = new Uint8Array(nonce.length + box.length);
    fullMessage.set(nonce);
    fullMessage.set(box, nonce.length);
    return encodeBase64(fullMessage);
}

function decryptSymmetric(messageWithNonceB64, keyB64) {
    if (!keyB64) return messageWithNonceB64;
    try {
        const key = decodeBase64(keyB64);
        const messageWithNonce = decodeBase64(messageWithNonceB64);
        const nonce = messageWithNonce.slice(0, nacl.secretbox.nonceLength);
        const message = messageWithNonce.slice(nacl.secretbox.nonceLength);
        const decrypted = nacl.secretbox.open(message, nonce, key);
        if (!decrypted) throw new Error("Failed to decrypt symmetric message");
        return JSON.parse(decodeUTF8(decrypted));
    } catch (e) {
        console.error("Decryption failed:", e);
        // Return a structure that indicates failure but doesn't crash the app
        return { title: "[Decryption Failed]", url: "about:blank" };
    }
}

// --- Main Extension Logic ---
let syncTimeout;
let allTabsCache = [];
let allBookmarksCache = [];

const generateUniqueId = () => 'device-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

const getDeviceType = (os = '', deviceName = '') => {
    const lowerOs = os.toLowerCase();
    const lowerDeviceName = deviceName.toLowerCase();
    if (lowerOs.includes('android') || lowerDeviceName.includes('phone') || lowerDeviceName.includes('pixel') || lowerDeviceName.includes('iphone')) return 'phone';
    return 'computer';
};

const handleCommands = (commands) => {
    if (!commands || commands.length === 0) return;
    console.log(`Received ${commands.length} command(s) from server.`);
    for (const command of commands) {
        if (command.type === 'OPEN_TABS' && command.payload?.urls) {
            for (const url of command.payload.urls) {
                chrome.tabs.create({ url: url, active: false });
            }
        }
    }
};

const getBookmarks = (tree) => (tree.length > 0 && tree[0].children) ? tree[0].children : tree;

function recursiveEncryptBookmarks(nodes, symmetricKey) {
    return nodes.map(node => {
        const payload = { title: node.title };
        if (node.url) payload.url = node.url;

        const encryptedNode = {
            id: node.id,
            isEncrypted: true,
            payload: encryptSymmetric(payload, symmetricKey),
        };

        if (node.children) {
            encryptedNode.children = recursiveEncryptBookmarks(node.children, symmetricKey);
        }
        return encryptedNode;
    });
}

function recursiveDecryptBookmarks(nodes, symmetricKey) {
    if (!nodes || !Array.isArray(nodes)) return [];
    return nodes.map(node => {
        let decryptedNode = { ...node };
        if (node.isEncrypted && node.payload) {
            const decryptedPayload = decryptSymmetric(node.payload, symmetricKey);
            decryptedNode = { ...node, ...decryptedPayload, isEncrypted: true };
        }
        if (decryptedNode.children) {
            decryptedNode.children = recursiveDecryptBookmarks(decryptedNode.children, symmetricKey);
        }
        return decryptedNode;
    });
}

function flattenBookmarks(bookmarkNodes, deviceName, os, deviceId) {
    let bookmarks = [];
    for (const node of bookmarkNodes) {
        if (node.url) {
            bookmarks.push({
                ...node,
                id: node.id || node.url,
                deviceName: deviceName,
                os: os,
                deviceId: deviceId,
                isBookmark: true,
                faviconUrl: 'images/bookmark-icon.png' // Generic bookmark icon
            });
        }
        if (node.children) {
            bookmarks = bookmarks.concat(flattenBookmarks(node.children, deviceName, os, deviceId));
        }
    }
    return bookmarks;
}


const syncTabs = async () => {
    console.log('Syncing tabs...');
    try {
        const { apiUrl, deviceName, os, userId } = await chrome.storage.sync.get(['apiUrl', 'deviceName', 'os', 'userId']);
        const { persistentDeviceId } = await chrome.storage.local.get('persistentDeviceId');
        const keyInfo = await getKey('symmetricKey');
        const symmetricKey = keyInfo ? keyInfo.key : null;

        if (!apiUrl || !userId || !persistentDeviceId) {
            console.log('Backend URL, UserID, or DeviceID not set. Skipping sync.');
            return { status: 'failure', message: 'Configuration missing.' };
        }

        const tabs = await chrome.tabs.query({});
        let tabsPayload = tabs
            .filter(tab => tab.url && !tab.url.startsWith('chrome://'))
            .map(tab => ({
                id: `${tab.windowId}-${tab.id}`,
                title: tab.title,
                url: tab.url,
                faviconUrl: tab.favIconUrl,
                windowId: tab.windowId,
                timestamp: Date.now(),
            }));
        
        if (symmetricKey) {
            tabsPayload = tabsPayload.map(tab => ({
                id: tab.id,
                isEncrypted: true,
                payload: encryptSymmetric({
                    title: tab.title,
                    url: tab.url,
                    faviconUrl: tab.faviconUrl,
                    windowId: tab.windowId,
                    timestamp: tab.timestamp,
                }, symmetricKey),
            }));
        }

        const bookmarkTree = await chrome.bookmarks.getTree();
        let bookmarksPayload = getBookmarks(bookmarkTree);
        if (symmetricKey) {
            bookmarksPayload = recursiveEncryptBookmarks(bookmarksPayload, symmetricKey);
        }

        const finalUrl = new URL('/api/sync', apiUrl).href;
        const response = await fetch(finalUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tabs: tabsPayload,
                bookmarks: bookmarksPayload,
                deviceId: persistentDeviceId,
                deviceName: deviceName || 'Chrome Browser',
                os,
                userId
            }),
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        console.log('Sync successful:', data);

        // Decrypt and cache data
        const localTabsForCache = tabsPayload.map(t => {
            const content = symmetricKey && t.isEncrypted ? decryptSymmetric(t.payload, symmetricKey) : t;
            return { ...content, id: t.id, os, deviceName: 'This Device', deviceId: persistentDeviceId };
        });

        const remoteTabsForCache = (data.remoteTabs || []).map(t => {
            const content = symmetricKey && t.isEncrypted ? decryptSymmetric(t.payload, symmetricKey) : t;
            return { ...content, id: t.id, deviceId: t.deviceId, deviceName: t.deviceName, os: t.os };
        });

        allTabsCache = [...localTabsForCache, ...remoteTabsForCache];
        
        const remoteBookmarksForCache = [];
        if (data.remoteBookmarks && typeof data.remoteBookmarks === 'object') {
             for (const deviceId in data.remoteBookmarks) {
                const deviceBookmarks = data.remoteBookmarks[deviceId];
                const decryptedBookmarks = symmetricKey ? recursiveDecryptBookmarks(deviceBookmarks, symmetricKey) : deviceBookmarks;
                // Find device info from remote tabs
                const deviceInfoTab = remoteTabsForCache.find(t => t.deviceId === deviceId);
                const deviceName = deviceInfoTab ? deviceInfoTab.deviceName : 'Unknown Device';
                const os = deviceInfoTab ? deviceInfoTab.os : 'unknown';
                remoteBookmarksForCache.push(...flattenBookmarks(decryptedBookmarks, deviceName, os, deviceId));
            }
        }
        allBookmarksCache = remoteBookmarksForCache;
        
        if (data.commands) handleCommands(data.commands);
        return { status: 'success' };
    } catch (error) {
        console.error('Error syncing data:', error);
        return { status: 'failure', message: error.message };
    }
};

const debouncedSync = () => {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(syncTabs, 1000);
};

const initializeExtensionState = () => {
    return new Promise((resolve) => {
        chrome.runtime.getPlatformInfo(info => {
            chrome.storage.sync.set({ os: info.os }, () => {
                chrome.storage.local.get('persistentDeviceId', (data) => {
                    if (!data.persistentDeviceId) {
                        chrome.storage.local.set({ persistentDeviceId: generateUniqueId() }, resolve);
                    } else {
                        resolve();
                    }
                });
            });
        });
    });
};

async function toggleSpotlight() {
    await syncTabs();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
        try {
            await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SPOTLIGHT" });
        } catch (err) {
            console.log("Content script not injected yet, injecting now.");
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
            await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SPOTLIGHT" });
        }
    }
}

async function triggerFavoriteInActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
        try {
            // First check if spotlight is open, if so, send message to it
            await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_FAVORITE" });
        } catch (err) {
            console.warn("Could not send 'TRIGGER_FAVORITE' message to active tab's content script.", err);
        }
    }
}


// --- Event Listeners ---
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('Extension installed or updated:', details.reason);
    await initializeExtensionState();
    await syncTabs();
});

chrome.runtime.onStartup.addListener(async () => {
    console.log('Extension started.');
    await initializeExtensionState();
    await syncTabs();
});

chrome.tabs.onCreated.addListener(debouncedSync);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => { if (changeInfo.status === 'complete' || changeInfo.title || changeInfo.url) debouncedSync(); });
chrome.tabs.onRemoved.addListener(debouncedSync);
chrome.tabs.onReplaced.addListener(debouncedSync);
chrome.bookmarks.onCreated.addListener(debouncedSync);
chrome.bookmarks.onRemoved.addListener(debouncedSync);
chrome.bookmarks.onChanged.addListener(debouncedSync);
chrome.bookmarks.onMoved.addListener(debouncedSync);
chrome.bookmarks.onChildrenReordered.addListener(debouncedSync);
chrome.bookmarks.onImportEnded.addListener(debouncedSync);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        try {
            if (request.type === 'SYNC_TABS') {
                const response = await syncTabs();
                sendResponse(response);
            } else if (request.type === 'GET_DEVICES') {
                const devices = allTabsCache.reduce((acc, tab) => {
                    if (!acc[tab.deviceId]) {
                        acc[tab.deviceId] = { id: tab.deviceId, name: tab.deviceName, type: getDeviceType(tab.os, tab.deviceName), count: 0 };
                    }
                    acc[tab.deviceId].count++;
                    return acc;
                }, {});
                sendResponse(Object.values(devices));
            } else if (request.type === 'SEARCH_TABS') {
                const { apiUrl, userId } = await chrome.storage.sync.get(['apiUrl', 'userId']);
                const query = request.query.toLowerCase();
                let searchSource = [...allTabsCache, ...allBookmarksCache];

                if (request.searchScope === 'favorites') {
                    if (apiUrl && userId) {
                        try {
                            const favResponse = await fetch(`${new URL('/api/favorites', apiUrl).href}?userId=${encodeURIComponent(userId)}`);
                            if (favResponse.ok) {
                                let { favorites } = await favResponse.json();
                                const keyInfo = await getKey('symmetricKey');
                                const symmetricKey = keyInfo ? keyInfo.key : null;
                                if (symmetricKey) {
                                    favorites = favorites.map(fav => {
                                        if (fav.isEncrypted && fav.payload) {
                                            const decrypted = decryptSymmetric(fav.payload, symmetricKey);
                                            return {...fav, ...decrypted};
                                        }
                                        return fav;
                                    })
                                }
                                searchSource = (favorites || []).map(fav => ({...fav, id: fav.url, deviceName: 'Favorites'}));
                            }
                        } catch (e) {
                            console.error("Failed to fetch favorites:", e);
                            searchSource = [];
                        }
                    } else {
                       searchSource = [];
                    }
                }

                let filtered = searchSource;
                if (query) {
                    filtered = filtered.filter(item => (item.title || '').toLowerCase().includes(query) || (item.url || '').toLowerCase().includes(query));
                }
                sendResponse(filtered.slice(0, 50));

            } else if (request.type === 'TRIGGER_SPOTLIGHT_TOGGLE') {
                await toggleSpotlight();
                sendResponse({ status: 'done' });
            } else if (request.type === 'ADD_FAVORITE') {
                const { tabData } = request;
                const { apiUrl, userId } = await chrome.storage.sync.get(['apiUrl', 'userId']);
                const keyInfo = await getKey('symmetricKey');
                const symmetricKey = keyInfo ? keyInfo.key : null;

                if (!apiUrl || !userId) {
                    sendResponse({ status: 'error', message: 'User or API URL not configured.' });
                    return;
                }
                
                let favoritePayload = {
                    title: tabData.title,
                    url: tabData.url,
                    faviconUrl: tabData.faviconUrl,
                    timestamp: tabData.timestamp,
                };
                
                let body = { ...favoritePayload, isEncrypted: false };

                if (symmetricKey) {
                    const encryptedPayload = encryptSymmetric(favoritePayload, symmetricKey);
                    body = { payload: encryptedPayload, isEncrypted: true, url: tabData.url, timestamp: tabData.timestamp };
                }

                try {
                    const response = await fetch(`${new URL('/api/favorites', apiUrl).href}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tabs: [body], userId }),
                    });
                    if (response.ok) {
                        sendResponse({ status: 'success' });
                    } else {
                        const errorData = await response.json();
                        sendResponse({ status: 'error', message: errorData.message || 'API error' });
                    }
                } catch(e) {
                    sendResponse({ status: 'error', message: e.message });
                }
            } else if (request.type === 'STORE_KEY') {
                await saveKey(request.key);
                sendResponse({ status: 'success' });
            } else if (request.type === 'GET_KEY') {
                const key = await getKey(request.keyId);
                sendResponse(key);
            } else if (request.type === 'DELETE_KEY') {
                await deleteKey(request.keyId);
                sendResponse({ status: 'success' });
            }
        } catch (error) {
            console.error("Error in message listener:", error);
            sendResponse({ status: 'error', message: error.message });
        }
    })();
    return true; // Indicates that the response is sent asynchronously
});

chrome.commands.onCommand.addListener(async (command) => {
    if (command === "toggle-search") {
        await toggleSpotlight();
    } else if (command === "add-to-favorites") {
        await triggerFavoriteInActiveTab();
    }
});

console.log('Replica background script loaded and listeners attached.');
