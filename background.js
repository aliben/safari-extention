
// This is the background service worker for the extension.

let syncTimeout;
let allTabsCache = []; // In-memory cache for all synced tabs

// Function to generate a unique ID for the device
const generateUniqueId = () => {
    return 'device-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
};

// Function to determine device type
const getDeviceType = (os = '', deviceName = '') => {
    const lowerOs = os.toLowerCase();
    const lowerDeviceName = deviceName.toLowerCase();

    if (lowerOs.includes('android') || lowerDeviceName.includes('phone') || lowerDeviceName.includes('pixel') || lowerDeviceName.includes('iphone')) {
        return 'phone';
    }
    // Assume computer for others like win, mac, linux, cros
    return 'computer';
};


// Function to handle commands received from the server
const handleCommands = (commands) => {
    if (!commands || commands.length === 0) {
        return;
    }

    console.log(`Received ${commands.length} command(s) from server.`);

    for (const command of commands) {
        if (command.type === 'OPEN_TABS' && command.payload?.urls) {
            console.log('Executing OPEN_TABS command for URLs:', command.payload.urls);
            for (const url of command.payload.urls) {
                chrome.tabs.create({ url: url, active: false });
            }
        }
    }
};

// Function to get bookmarks recursively, preserving structure
const getBookmarks = (tree) => {
    // The tree from chrome.bookmarks.getTree() is already in the format we want.
    // We just need to filter out the root node if it's a container with no real title.
    if (tree.length > 0 && tree[0].children) {
        return tree[0].children;
    }
    return tree;
};


// Function to get all tabs and send them to the backend
const syncTabs = async () => {
  console.log('Syncing tabs...');
  try {
    const { apiUrl, deviceName, os, userId } = await chrome.storage.sync.get(['apiUrl', 'deviceName', 'os', 'userId']);
    const localData = await chrome.storage.local.get('persistentDeviceId');
    const finalDeviceId = localData.persistentDeviceId;

    if (!apiUrl) {
      console.log('Backend URL not set. Skipping sync.');
      return { status: 'failure', message: 'Backend URL not set.' };
    }
    
    if (!userId) {
      console.log('User not logged in. Skipping sync.');
      return { status: 'failure', message: 'User not logged in.' };
    }

    if (!finalDeviceId) {
      console.log('Device ID not set. This should not happen after installation.');
      return { status: 'failure', message: 'Device ID not found.' };
    }

    // Get Tabs
    const tabs = await chrome.tabs.query({});
    const finalDeviceName = deviceName || 'Chrome Browser'; 
    const tabsPayload = tabs
      .filter(tab => tab.url && !tab.url.startsWith('chrome://'))
      .map(tab => ({
        id: `${tab.windowId}-${tab.id}`,
        title: tab.title,
        url: tab.url,
        faviconUrl: tab.favIconUrl,
        windowId: tab.windowId,
        timestamp: Date.now(),
      }));
    
    // Get Bookmarks
    const bookmarkTree = await chrome.bookmarks.getTree();
    const bookmarksPayload = getBookmarks(bookmarkTree);

    const finalUrl = new URL('/api/sync', apiUrl).href;

    const response = await fetch(finalUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
          tabs: tabsPayload, 
          bookmarks: bookmarksPayload,
          deviceId: finalDeviceId, 
          deviceName: finalDeviceName, 
          os, 
          userId 
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Sync successful:', data);

    // Cache all tabs for spotlight search
    if (data.remoteTabs) {
        allTabsCache = [...tabsPayload.map(t => ({...t, os, deviceName: 'This Device', deviceId: finalDeviceId})), ...data.remoteTabs];
    } else {
        allTabsCache = [...tabsPayload.map(t => ({...t, os, deviceName: 'This Device', deviceId: finalDeviceId}))];
    }

    // Handle any commands from the server
    if (data.commands) {
      handleCommands(data.commands);
    }

    return { status: 'success', count: tabsPayload.length, bookmarksCount: bookmarksPayload.length };

  } catch (error) {
    console.error('Error syncing data:', error);
    return { status: 'failure', message: error.message };
  }
};

// Debounced sync function to avoid spamming the server
const debouncedSync = () => {
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(syncTabs, 1000); // 1-second debounce
};

// Store platform info and persistent ID on installation/startup
const initializeExtensionState = () => {
    chrome.runtime.getPlatformInfo(info => {
        chrome.storage.sync.set({ os: info.os });
    });
    chrome.storage.local.get('persistentDeviceId', (data) => {
        if (!data.persistentDeviceId) {
            const newId = generateUniqueId();
            chrome.storage.local.set({ persistentDeviceId: newId }, () => {
                console.log('New persistent device ID generated:', newId);
            });
        } else {
            console.log('Existing persistent device ID found:', data.persistentDeviceId);
        }
    });
};

chrome.runtime.onStartup.addListener(() => {
    initializeExtensionState();
    syncTabs(); // Sync on startup
});

chrome.runtime.onInstalled.addListener(() => {
    initializeExtensionState();
});

// Reusable function to toggle spotlight
async function toggleSpotlight() {
  // Sync tabs to ensure data is fresh when spotlight opens
  syncTabs();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SPOTLIGHT" });
    } catch (err) {
      console.error('Failed to send toggle message to content script. Injecting script first.', err);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        // Now send the message again after successful injection
        await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SPOTLIGHT" });
      } catch(injectErr) {
         console.error('Failed to inject content script:', injectErr);
      }
    }
  }
}

// Listen for tab events
chrome.tabs.onCreated.addListener(debouncedSync);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // We only sync on status complete to avoid multiple syncs per page load
  if (changeInfo.status === 'complete' || changeInfo.title) {
    debouncedSync();
  }
});
chrome.tabs.onRemoved.addListener(debouncedSync);
chrome.tabs.onReplaced.addListener(debouncedSync);
chrome.bookmarks.onCreated.addListener(debouncedSync);
chrome.bookmarks.onRemoved.addListener(debouncedSync);
chrome.bookmarks.onChanged.addListener(debouncedSync);
chrome.bookmarks.onMoved.addListener(debouncedSync);
chrome.bookmarks.onChildrenReordered.addListener(debouncedSync);
chrome.bookmarks.onImportEnded.addListener(debouncedSync);


// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SYNC_TABS') {
    syncTabs().then(sendResponse);
    return true; // Indicates that the response is sent asynchronously
  } else if (request.type === 'GET_DEVICES') {
    const devices = allTabsCache.reduce((acc, tab) => {
        if (!acc[tab.deviceId]) {
            acc[tab.deviceId] = { 
                id: tab.deviceId, 
                name: tab.deviceName,
                type: getDeviceType(tab.os, tab.deviceName),
                count: 0 
            };
        }
        acc[tab.deviceId].count++;
        return acc;
    }, {});
    sendResponse(Object.values(devices));
    return true;
  } else if (request.type === 'SEARCH_TABS') {
    const query = request.query.toLowerCase();
    const deviceIds = request.deviceIds || [];
    const sortBy = request.sortBy || 'timestamp';

    chrome.storage.sync.get(['showThisDeviceInSpotlight'], async (settings) => {
        const localData = await chrome.storage.local.get('persistentDeviceId');
        const localDeviceId = localData.persistentDeviceId;
        const showThisDevice = settings.showThisDeviceInSpotlight !== false; // default to true

        let filteredTabs = allTabsCache;
        
        // Filter out local device if setting is false
        if (!showThisDevice) {
            filteredTabs = filteredTabs.filter(tab => tab.deviceId !== localDeviceId);
        }

        if(deviceIds.length > 0) {
            filteredTabs = filteredTabs.filter(tab => deviceIds.includes(tab.deviceId));
        }

        if (query) {
             filteredTabs = filteredTabs.filter(tab => 
                tab.title.toLowerCase().includes(query) || tab.url.toLowerCase().includes(query)
            );
        }

        // Sort results
        filteredTabs.sort((a, b) => {
            switch (sortBy) {
                case 'alpha-asc':
                    return a.title.localeCompare(b.title);
                case 'alpha-desc':
                    return b.title.localeCompare(a.title);
                case 'timestamp':
                default:
                    return (b.timestamp || 0) - (a.timestamp || 0);
            }
        });
        
        sendResponse(filteredTabs.slice(0, 50));
    });
    return true; // async

  } else if (request.type === 'SEARCH_FAVORITES') {
    const query = request.query.toLowerCase();
    chrome.storage.sync.get(['apiUrl', 'userId']).then(({ apiUrl, userId }) => {
        if (!apiUrl || !userId) {
            sendResponse([]);
            return;
        }
        const favUrl = new URL('/api/favorites', apiUrl).href;
        fetch(`${favUrl}?userId=${encodeURIComponent(userId)}`)
            .then(res => res.json())
            .then(data => {
                const favorites = data.favorites || [];
                const results = favorites.filter(tab => 
                    tab.title.toLowerCase().includes(query) || tab.url.toLowerCase().includes(query)
                );
                sendResponse(results.slice(0, 10));
            })
            .catch(err => {
                console.error('Failed to fetch favorites:', err);
                sendResponse([]);
            });
    });
    return true; // async
  } else if (request.type === 'OPEN_TAB') {
    chrome.tabs.create({ url: request.url, active: true });
  } else if (request.type === 'TRIGGER_SPOTLIGHT_TOGGLE') {
    toggleSpotlight().then(() => sendResponse({status: 'done'}));
    return true; // async
  }
  return true; // Keep message channel open for async responses
});

// Spotlight search functionality
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-search") {
    toggleSpotlight();
  } else if (command === "add-to-favorites") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      try {
        // First, try sending the message directly.
        await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_FAVORITE" });
      } catch (err) {
        // If it fails, the content script is likely not injected.
        console.error('Failed to send favorite trigger. Injecting script first.', err);
        try {
          // Inject the content script.
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          // And now send the message again.
          await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_FAVORITE" });
        } catch(injectErr) {
           console.error('Failed to inject content script for favorite action:', injectErr);
        }
      }
    }
  }
});


console.log('Replica background script loaded.');

    