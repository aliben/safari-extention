
// This is the background service worker for the extension.
self.importScripts('./lib/tweetnacl.min.js');

// ---------------------------------------------------------------------------
// Supabase Auth helpers (direct REST calls — no SDK needed in service worker)
// ---------------------------------------------------------------------------
// These values are safe to embed in the extension: the anon key is public and
// Row-Level Security policies on the server restrict what it can access.
const SUPABASE_URL = 'https://vtrceupoiaisfhejlbjm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmNldXBvaWFpc2ZoZWpsYmptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTI1MTIsImV4cCI6MjA4NzE4ODUxMn0.gm4SO4G2Q7cEMk28t7CCwRquB-HBRZrQIkujVhN64wA';

async function signInWithPassword(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error_description || err.msg || 'Sign-in failed');
    }
    return res.json(); // { access_token, refresh_token, expires_in, user }
}

async function refreshSession(refreshToken) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    return res.json(); // { access_token, refresh_token, expires_in }
}

async function signOut(accessToken) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'apikey': SUPABASE_ANON_KEY,
        },
    }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Token lifecycle: get a valid access token, refreshing if needed
// ---------------------------------------------------------------------------
async function getValidAccessToken() {
    const { accessToken, refreshToken, tokenExpiresAt } = await chrome.storage.sync.get([
        'accessToken', 'refreshToken', 'tokenExpiresAt',
    ]);
    if (!accessToken || !refreshToken) return null;

    // Refresh 60 seconds before expiry
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (tokenExpiresAt && nowSeconds < tokenExpiresAt - 60) {
        return accessToken;
    }

    console.log('Token expiring soon, refreshing...');
    const newSession = await refreshSession(refreshToken);
    if (!newSession) {
        // Refresh failed — clear stored session
        await chrome.storage.sync.remove(['accessToken', 'refreshToken', 'tokenExpiresAt', 'userId', 'userEmail']);
        return null;
    }

    const newExpiresAt = Math.floor(Date.now() / 1000) + (newSession.expires_in || 3600);
    await chrome.storage.sync.set({
        accessToken: newSession.access_token,
        refreshToken: newSession.refresh_token,
        tokenExpiresAt: newExpiresAt,
    });
    return newSession.access_token;
}

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

// Restore persisted cache immediately so spotlight shows results on first open
chrome.storage.local.get(['tabsCache', 'bookmarksCache'], (data) => {
    if (data.tabsCache) allTabsCache = data.tabsCache;
    if (data.bookmarksCache) allBookmarksCache = data.bookmarksCache;
});

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
        } else if (command.type === 'CLOSE_TAB' && command.payload?.url) {
            chrome.tabs.query({ url: command.payload.url }, (tabs) => {
                tabs.forEach(t => chrome.tabs.remove(t.id));
            });
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
    if (!bookmarkNodes) return bookmarks;
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
        const { apiUrl, deviceName, os } = await chrome.storage.sync.get(['apiUrl', 'deviceName', 'os']);
        const { persistentDeviceId } = await chrome.storage.local.get('persistentDeviceId');
        const keyInfo = await getKey('symmetricKey');
        const symmetricKey = keyInfo ? keyInfo.key : null;

        const accessToken = await getValidAccessToken();
        if (!apiUrl || !accessToken || !persistentDeviceId) {
            console.log('Backend URL, access token, or DeviceID not set. Skipping sync.');
            return { status: 'failure', message: 'Configuration missing.' };
        }

        // Try to get/use the symmetric key from the key exchange if not manually set
        let effectiveSymmetricKey = symmetricKey;
        if (!effectiveSymmetricKey) {
            const grantedKey = await getKey('grantedSymmetricKey');
            if (grantedKey) effectiveSymmetricKey = grantedKey.key;
        }

        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        };

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
        
        if (effectiveSymmetricKey) {
            tabsPayload = tabsPayload.map(tab => ({
                id: tab.id,
                isEncrypted: true,
                payload: encryptSymmetric({
                    title: tab.title,
                    url: tab.url,
                    faviconUrl: tab.faviconUrl,
                    windowId: tab.windowId,
                    timestamp: tab.timestamp,
                }, effectiveSymmetricKey),
            }));
        }

        const bookmarkTree = await chrome.bookmarks.getTree();
        let bookmarksPayload = getBookmarks(bookmarkTree);
        if (effectiveSymmetricKey) {
            bookmarksPayload = recursiveEncryptBookmarks(bookmarksPayload, effectiveSymmetricKey);
        }

        const finalUrl = new URL('/api/sync', apiUrl).href;
        const response = await fetch(finalUrl, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                tabs: tabsPayload,
                bookmarks: bookmarksPayload,
                deviceId: persistentDeviceId,
                deviceName: deviceName || 'Chrome Browser',
                os,
            }),
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        console.log('Sync successful:', data);

        // Flush queued history visits to the API
        const { historyQueue = [] } = await chrome.storage.local.get('historyQueue');
        if (historyQueue.length > 0) {
            try {
                const histFlush = await fetch(new URL('/api/history', apiUrl).href, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({ entries: historyQueue }),
                });
                if (histFlush.ok) await chrome.storage.local.remove('historyQueue');
            } catch (e) {
                console.error('Failed to flush history queue:', e);
            }
        }

        // Decrypt and cache data
        const localTabsForCache = tabsPayload.map(t => {
            const content = effectiveSymmetricKey && t.isEncrypted ? decryptSymmetric(t.payload, effectiveSymmetricKey) : t;
            return { ...content, id: t.id, os, deviceName: 'This Device', deviceId: persistentDeviceId };
        });

        const remoteTabsForCache = (data.remoteTabs || []).map(t => {
            const content = effectiveSymmetricKey && t.isEncrypted ? decryptSymmetric(t.payload, effectiveSymmetricKey) : t;
            return { ...content, id: t.id, deviceId: t.deviceId, deviceName: t.deviceName, os: t.os };
        });

        allTabsCache = [...localTabsForCache, ...remoteTabsForCache];
        
        let flatBookmarks = [];
        if (data.remoteBookmarks && typeof data.remoteBookmarks === 'object') {
             for (const deviceId in data.remoteBookmarks) {
                const deviceBookmarks = data.remoteBookmarks[deviceId];
                const decryptedBookmarks = effectiveSymmetricKey ? recursiveDecryptBookmarks(deviceBookmarks, effectiveSymmetricKey) : deviceBookmarks;
                // Find device info from remote tabs
                const deviceInfoTab = allTabsCache.find(t => t.deviceId === deviceId);
                const deviceName = deviceInfoTab ? deviceInfoTab.deviceName : 'Unknown Device';
                const os = deviceInfoTab ? deviceInfoTab.os : 'unknown';
                flatBookmarks.push(...flattenBookmarks(decryptedBookmarks, deviceName, os, deviceId));
            }
        }
        allBookmarksCache = flatBookmarks;

        // Persist for instant spotlight on re-open
        chrome.storage.local.set({ tabsCache: allTabsCache, bookmarksCache: allBookmarksCache }).catch(() => {});
        
        if (data.commands) handleCommands(data.commands);

        // --- E2EE Key Exchange ---
        // After a successful sync, handle automatic key exchange for new devices
        await handleKeyExchange(apiUrl, accessToken, persistentDeviceId);

        return { status: 'success' };
    } catch (error) {
        console.error('Error syncing data:', error);
        return { status: 'failure', message: error.message };
    }
};

// ---------------------------------------------------------------------------
// E2EE Asymmetric Key Exchange
// ---------------------------------------------------------------------------
// On first run, generate a nacl.box keypair and store the private key in IndexedDB.
// Register the device with our public key via POST /api/devices.
// If a symmetric key grant exists for us, decrypt it and cache it.
// If we are an existing device with a symmetric key, grant it to any new devices.
// ---------------------------------------------------------------------------

async function getOrCreateAsymmetricKeypair() {
    let privKeyEntry = await getKey('asymmetricPrivateKey');
    let pubKeyEntry = await getKey('asymmetricPublicKey');
    if (privKeyEntry && pubKeyEntry) {
        return {
            privateKey: decodeBase64(privKeyEntry.key),
            publicKey: decodeBase64(pubKeyEntry.key),
        };
    }
    // Generate new X25519 keypair
    const keypair = nacl.box.keyPair();
    await saveKey({ id: 'asymmetricPrivateKey', key: encodeBase64(keypair.secretKey) });
    await saveKey({ id: 'asymmetricPublicKey', key: encodeBase64(keypair.publicKey) });
    return keypair;
}

async function handleKeyExchange(apiUrl, accessToken, persistentDeviceId) {
    try {
        const keypair = await getOrCreateAsymmetricKeypair();
        const { deviceName, os } = await chrome.storage.sync.get(['deviceName', 'os']);

        // Register / refresh device registration with our public key
        const regRes = await fetch(new URL('/api/devices', apiUrl).href, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify({
                deviceId: persistentDeviceId,
                deviceName: deviceName || 'Chrome Browser',
                os: os || 'unknown',
                publicKey: encodeBase64(keypair.publicKey),
            }),
        });

        if (!regRes.ok) return;
        const regData = await regRes.json(); // { grant, otherDevices }

        // --- If we received a key grant, decrypt and store the symmetric key ---
        if (regData.grant && !await getKey('grantedSymmetricKey')) {
            try {
                const { ciphertext, nonce, ephemeralPublicKey } = regData.grant.encrypted_symmetric_key;
                const decryptedBytes = nacl.box.open(
                    decodeBase64(ciphertext),
                    decodeBase64(nonce),
                    decodeBase64(ephemeralPublicKey),
                    keypair.privateKey,
                );
                if (decryptedBytes) {
                    const symmetricKeyB64 = decodeUTF8(decryptedBytes);
                    await saveKey({ id: 'grantedSymmetricKey', key: symmetricKeyB64 });
                    console.log('Symmetric key received via key exchange and stored.');
                }
            } catch (e) {
                console.error('Failed to decrypt key grant:', e);
            }
        }

        // --- If we have a symmetric key, grant it to devices that don't have one ---
        const keyInfo = await getKey('symmetricKey') || await getKey('grantedSymmetricKey');
        if (!keyInfo || !regData.otherDevices || regData.otherDevices.length === 0) return;

        const symmetricKeyB64 = keyInfo.key;
        const grantUrl = new URL('/api/keys/grant', apiUrl).href;

        for (const device of regData.otherDevices) {
            if (!device.public_key || device.has_grant) continue;
            try {
                // Encrypt the symmetric key for this device using nacl.box
                const recipientPublicKey = decodeBase64(device.public_key);
                const ephemeralKeypair = nacl.box.keyPair();
                const nonce = nacl.randomBytes(nacl.box.nonceLength);
                const messageBytes = encodeUTF8(symmetricKeyB64);
                const ciphertext = nacl.box(messageBytes, nonce, recipientPublicKey, ephemeralKeypair.secretKey);

                await fetch(grantUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                    body: JSON.stringify({
                        targetDeviceId: device.device_id,
                        encryptedSymmetricKey: {
                            ciphertext: encodeBase64(ciphertext),
                            nonce: encodeBase64(nonce),
                            ephemeralPublicKey: encodeBase64(ephemeralKeypair.publicKey),
                        },
                    }),
                });
                console.log(`Key granted to device ${device.device_id}`);
            } catch (e) {
                console.error(`Failed to grant key to device ${device.device_id}:`, e);
            }
        }
    } catch (e) {
        console.error('Key exchange error:', e);
    }
}

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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    // Open spotlight immediately — shows cached results right away
    try {
        await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SPOTLIGHT" });
    } catch (err) {
        console.log("Content script not injected yet, injecting now.");
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SPOTLIGHT" });
    }

    // Sync in background; notify spotlight to refresh when done
    syncTabs()
        .catch(err => console.error('Background sync error:', err))
        .finally(() => {
            chrome.tabs.sendMessage(tab.id, { type: "SYNC_COMPLETE" }).catch(() => {});
        });
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
            } else if (request.type === 'SEARCH') {
                const { apiUrl } = await chrome.storage.sync.get(['apiUrl']);
                const accessToken = await getValidAccessToken();
                const query = request.query.toLowerCase();
                const mode = request.mode || 'tabs'; // 'tabs', 'bookmarks', or 'favorites'

                let searchSource = [];
                
                if (mode === 'tabs') {
                    searchSource = allTabsCache;
                } else if (mode === 'bookmarks') {
                    searchSource = allBookmarksCache;
                } else if (mode === 'favorites') {
                    if (apiUrl && accessToken) {
                        try {
                            const favResponse = await fetch(new URL('/api/favorites', apiUrl).href, {
                                headers: { 'Authorization': `Bearer ${accessToken}` },
                            });
                            if (favResponse.ok) {
                                let { favorites } = await favResponse.json();
                                const keyInfo = await getKey('symmetricKey') || await getKey('grantedSymmetricKey');
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
                } else if (mode === 'history') {
                    if (apiUrl && accessToken) {
                        try {
                            const histUrl = new URL(
                                `/api/history?limit=200${query ? '&q=' + encodeURIComponent(query) : ''}`,
                                apiUrl
                            ).href;
                            const histResponse = await fetch(histUrl, {
                                headers: { 'Authorization': `Bearer ${accessToken}` },
                            });
                            if (histResponse.ok) {
                                const { history } = await histResponse.json();
                                searchSource = (history || []).map(e => ({
                                    id: String(e.id),
                                    url: e.url,
                                    title: e.title || e.url,
                                    faviconUrl: e.faviconUrl,
                                    deviceId: e.deviceId,
                                    deviceName: e.deviceName || 'Unknown',
                                    os: e.os,
                                    timestamp: new Date(e.visitedAt).getTime(),
                                    visitedAt: e.visitedAt,
                                    isHistory: true,
                                }));
                            }
                        } catch (e) {
                            console.error('Failed to fetch history:', e);
                            searchSource = [];
                        }
                    }
                } else if (mode === 'recentlyClosed') {
                    try {
                        const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 50 });
                        searchSource = sessions
                            .filter(s => s.tab && s.tab.url && !s.tab.url.startsWith('chrome://') && !s.tab.url.startsWith('about:'))
                            .map(s => ({
                                id: String(s.tab.sessionId || s.tab.url),
                                url: s.tab.url,
                                title: s.tab.title || s.tab.url,
                                faviconUrl: (s.tab.favIconUrl && !s.tab.favIconUrl.startsWith('chrome://')) ? s.tab.favIconUrl : null,
                                deviceId: 'local',
                                deviceName: 'This Device',
                                timestamp: s.lastModified ? s.lastModified * 1000 : Date.now(),
                                isRecentlyClosed: true,
                                sessionId: s.tab.sessionId,
                            }));
                    } catch(e) {
                        console.error('Failed to get recently closed:', e);
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
                const { apiUrl } = await chrome.storage.sync.get(['apiUrl']);
                const accessToken = await getValidAccessToken();
                const keyInfo = await getKey('symmetricKey') || await getKey('grantedSymmetricKey');
                const symmetricKey = keyInfo ? keyInfo.key : null;

                if (!apiUrl || !accessToken) {
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
                    const response = await fetch(new URL('/api/favorites', apiUrl).href, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${accessToken}`,
                        },
                        body: JSON.stringify({ tabs: [body] }),
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
            } else if (request.type === 'SEND_TAB') {
                const { url, targetDeviceId } = request;
                const { apiUrl } = await chrome.storage.sync.get(['apiUrl']);
                const accessToken = await getValidAccessToken();
                if (!apiUrl || !accessToken) { sendResponse({ status: 'error', message: 'Not configured.' }); return; }
                try {
                    const res = await fetch(new URL('/api/sync', apiUrl).href, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                        body: JSON.stringify({ command: { type: 'OPEN_TABS', payload: { urls: [url] } }, targetDeviceId }),
                    });
                    sendResponse(res.ok ? { status: 'success' } : { status: 'error', message: 'API error' });
                } catch(e) { sendResponse({ status: 'error', message: e.message }); }
            } else if (request.type === 'CLOSE_TAB') {
                const { item } = request;
                const { persistentDeviceId } = await chrome.storage.local.get('persistentDeviceId');
                if (item.deviceId === persistentDeviceId || item.deviceId === 'local') {
                    // Local: parse rawTabId from composite id (format: windowId-tabId)
                    const rawTabId = parseInt(item.id.split('-').pop());
                    if (!isNaN(rawTabId)) await chrome.tabs.remove(rawTabId).catch(() => {});
                    allTabsCache = allTabsCache.filter(t => t.id !== item.id);
                    sendResponse({ status: 'success' });
                } else {
                    // Remote: queue a CLOSE_TAB command to the target device
                    const { apiUrl } = await chrome.storage.sync.get(['apiUrl']);
                    const accessToken = await getValidAccessToken();
                    if (!apiUrl || !accessToken) { sendResponse({ status: 'error', message: 'Not configured.' }); return; }
                    try {
                        const res = await fetch(new URL('/api/sync', apiUrl).href, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                            body: JSON.stringify({ command: { type: 'CLOSE_TAB', payload: { url: item.url } }, targetDeviceId: item.deviceId }),
                        });
                        if (res.ok) {
                            allTabsCache = allTabsCache.filter(t => t.id !== item.id);
                            sendResponse({ status: 'success' });
                        } else { sendResponse({ status: 'error', message: 'Failed to send close command.' }); }
                    } catch(e) { sendResponse({ status: 'error', message: e.message }); }
                }
            } else if (request.type === 'RESTORE_TAB') {
                const { sessionId, url } = request;
                try {
                    if (sessionId) {
                        await chrome.sessions.restore(sessionId);
                    } else if (url) {
                        await chrome.tabs.create({ url, active: true });
                    }
                    sendResponse({ status: 'success' });
                } catch(e) { sendResponse({ status: 'error', message: e.message }); }
            } else if (request.type === 'SIGN_IN') {
                try {
                    const session = await signInWithPassword(request.email, request.password);
                    const expiresAt = Math.floor(Date.now() / 1000) + (session.expires_in || 3600);
                    await chrome.storage.sync.set({
                        accessToken: session.access_token,
                        refreshToken: session.refresh_token,
                        tokenExpiresAt: expiresAt,
                        userId: session.user.id,
                        userEmail: session.user.email,
                    });
                    // Trigger first sync after sign-in
                    await syncTabs();
                    sendResponse({ status: 'success', email: session.user.email });
                } catch (e) {
                    sendResponse({ status: 'error', message: e.message });
                }
            } else if (request.type === 'SIGN_OUT') {
                const { accessToken } = await chrome.storage.sync.get('accessToken');
                if (accessToken) await signOut(accessToken);
                await chrome.storage.sync.remove([
                    'accessToken', 'refreshToken', 'tokenExpiresAt', 'userId', 'userEmail',
                ]);
                allTabsCache = [];
                allBookmarksCache = [];
                sendResponse({ status: 'success' });
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

// --- History Tracking ---
// Record every HTTP/HTTPS page load to a local queue; flushed to /api/history during sync.
chrome.webNavigation.onCompleted.addListener(async (details) => {
    if (details.frameId !== 0) return; // main frame only
    if (!details.url || details.url.startsWith('chrome://') || details.url.startsWith('about:')) return;

    try {
        const { persistentDeviceId } = await chrome.storage.local.get('persistentDeviceId');
        const { deviceName, os } = await chrome.storage.sync.get(['deviceName', 'os']);
        if (!persistentDeviceId) return;

        const tab = await chrome.tabs.get(details.tabId).catch(() => null);
        const entry = {
            url:        details.url,
            title:      tab?.title || details.url,
            faviconUrl: (tab?.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) ? tab.favIconUrl : null,
            deviceId:   persistentDeviceId,
            deviceName: deviceName || `Chrome (${os || 'Unknown'})`,
            os:         os || null,
            visitedAt:  Date.now(),
        };

        const { historyQueue = [] } = await chrome.storage.local.get('historyQueue');
        historyQueue.push(entry);
        // Keep queue bounded to 500 entries in case sync is delayed
        if (historyQueue.length > 500) historyQueue.splice(0, historyQueue.length - 500);
        await chrome.storage.local.set({ historyQueue });
    } catch (e) {
        console.error('History tracking error:', e);
    }
}, { url: [{ schemes: ['http', 'https'] }] });

console.log('Replica background script loaded and listeners attached.');

