
document.addEventListener('DOMContentLoaded', () => {
    // Views
    const urlSection = document.getElementById('url-section');
    const authSection = document.getElementById('auth-section');
    const mainContent = document.getElementById('main-content');
    const allViews = [urlSection, authSection, mainContent];

    // URL View
    const apiUrlInput = document.getElementById('apiUrl');
    const saveUrlButton = document.getElementById('saveUrlButton');
    const urlStatusEl = document.getElementById('url-status');

    // Auth View
    const userIdInput = document.getElementById('userId');
    const loginButton = document.getElementById('loginButton');
    const backToUrlButton = document.getElementById('backToUrlButton');
    const authStatusEl = document.getElementById('auth-status');

    // Main Content View
    const loggedInUserEl = document.getElementById('loggedInUser');
    const logoutButton = document.getElementById('logoutButton');
    const syncButton = document.getElementById('syncButton');
    const statusEl = document.getElementById('status');
    const tabsListEl = document.getElementById('tabsList');
    
    // Tabs in Main View
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // Settings Panel
    const deviceNameInput = document.getElementById('deviceNameInput');
    const apiUrlInputSettings = document.getElementById('apiUrlInput');
    const saveSettingsButton = document.getElementById('saveSettingsButton');
    const settingsStatusEl = document.getElementById('settings-status');
    const spotlightShortcutInput = document.getElementById('spotlightShortcut');
    const favoriteShortcutInput = document.getElementById('favoriteShortcut');
    const toggleSpotlightButton = document.getElementById('toggleSpotlightButton');
    const showThisDeviceToggle = document.getElementById('showThisDeviceToggle');

    const showView = (viewToShow) => {
        allViews.forEach(view => {
            view.classList.remove('active');
        });
        viewToShow.classList.add('active');
    };

    const switchTab = (tabId) => {
      tabContents.forEach(content => content.classList.remove('active'));
      tabButtons.forEach(button => button.classList.remove('active'));

      document.getElementById(tabId).classList.add('active');
      document.querySelector(`.tab-button[data-tab="${tabId}"]`).classList.add('active');
      
      if (tabId === 'settings-panel') {
        loadShortcuts();
      }
    };
    
    const triggerSync = () => {
        if (!chrome.runtime?.sendMessage) return;
        
        statusEl.textContent = 'Syncing...';
        chrome.runtime.sendMessage({ type: 'SYNC_TABS' }, (response) => {
            if (chrome.runtime.lastError) {
                statusEl.textContent = 'Sync failed. Check background logs.';
                console.error('Error sending message:', chrome.runtime.lastError.message);
                return;
            }
            if (response) {
                if (response.status === 'success') {
                    statusEl.textContent = `Synced ${response.count} tabs.`;
                    listCurrentTabs();
                    setTimeout(() => { statusEl.textContent = ''; }, 3000);
                } else {
                    statusEl.textContent = `Sync failed: ${response.message}`;
                }
            } else {
                statusEl.textContent = 'Sync failed. No response from background.';
            }
        });
    };
    
    const listCurrentTabs = () => {
        chrome.tabs.query({}, (tabs) => {
            tabsListEl.innerHTML = '';
            const filteredTabs = tabs.filter(tab => tab.url && !tab.url.startsWith('chrome://'));

            if (filteredTabs.length === 0) {
                tabsListEl.innerHTML = '<li class="no-tabs-message">No active tabs found.</li>';
                return;
            }
            
            filteredTabs.forEach(tab => {
                const li = document.createElement('li');
                const favicon = document.createElement('img');
                favicon.src = tab.favIconUrl || 'images/icon16.png';
                favicon.onerror = () => { favicon.src = 'images/icon16.png'; };
                const title = document.createElement('span');
                title.textContent = tab.title;

                li.appendChild(favicon);
                li.appendChild(title);
                tabsListEl.appendChild(li);
            });
        });
    };

    const loadShortcuts = () => {
      chrome.commands.getAll((commands) => {
        const toggleSearch = commands.find(c => c.name === 'toggle-search');
        spotlightShortcutInput.value = toggleSearch?.shortcut || 'Not set';

        const addToFavorites = commands.find(c => c.name === 'add-to-favorites');
        favoriteShortcutInput.value = addToFavorites?.shortcut || 'Not set';
      });
    };

    // Initialization logic
    chrome.storage.sync.get(['apiUrl', 'userId', 'deviceName', 'os', 'showThisDeviceInSpotlight'], (result) => {
        if (result.apiUrl) {
            apiUrlInput.value = result.apiUrl;
            apiUrlInputSettings.value = result.apiUrl;
            if (result.userId) {
                loggedInUserEl.textContent = result.userId;
                deviceNameInput.value = result.deviceName || `Chrome (${result.os || 'Unknown'})`;
                showThisDeviceToggle.checked = result.showThisDeviceInSpotlight !== false; // default to true
                showView(mainContent);
                switchTab('tabs-panel');
                listCurrentTabs();
            } else {
                showView(authSection);
            }
        } else {
            showView(urlSection);
        }
    });

    // Event Listeners
    saveUrlButton.addEventListener('click', () => {
        const url = apiUrlInput.value.trim();
        if (url) {
            chrome.storage.sync.set({ apiUrl: url }, () => {
                apiUrlInputSettings.value = url;
                showView(authSection);
            });
        } else {
            urlStatusEl.textContent = 'Please enter a valid URL.';
            urlStatusEl.classList.add('error-text');
        }
    });

    backToUrlButton.addEventListener('click', () => {
        showView(urlSection);
    });

    loginButton.addEventListener('click', () => {
        const user = userIdInput.value.trim();
        if (user) {
            chrome.storage.sync.set({ userId: user }, () => {
                loggedInUserEl.textContent = user;
                showView(mainContent);
                switchTab('tabs-panel');
                triggerSync(); // Auto-sync after login
            });
        } else {
            authStatusEl.textContent = 'Please enter a username.';
            authStatusEl.classList.add('error-text');
        }
    });

    logoutButton.addEventListener('click', () => {
        chrome.storage.sync.remove('userId', () => {
            userIdInput.value = '';
            showView(authSection);
        });
    });

    syncButton.addEventListener('click', triggerSync);

    tabButtons.forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    saveSettingsButton.addEventListener('click', () => {
        const newUrl = apiUrlInputSettings.value.trim();
        const newDeviceName = deviceNameInput.value.trim();
        const showThisDevice = showThisDeviceToggle.checked;
        
        chrome.storage.sync.set({ apiUrl: newUrl, deviceName: newDeviceName, showThisDeviceInSpotlight: showThisDevice }, () => {
            apiUrlInput.value = newUrl;
            settingsStatusEl.textContent = 'Settings saved!';
            setTimeout(() => { settingsStatusEl.textContent = ''; }, 3000);
            triggerSync(); // Sync to update device name on server
        });
    });

    showThisDeviceToggle.addEventListener('change', () => {
        const showThisDevice = showThisDeviceToggle.checked;
        chrome.storage.sync.set({ showThisDeviceInSpotlight: showThisDevice }, () => {
             settingsStatusEl.textContent = 'Settings saved!';
            setTimeout(() => { settingsStatusEl.textContent = ''; }, 2000);
        });
    });

    const openShortcutsPage = () => {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    };

    spotlightShortcutInput.addEventListener('click', openShortcutsPage);
    favoriteShortcutInput.addEventListener('click', openShortcutsPage);

    toggleSpotlightButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'TRIGGER_SPOTLIGHT_TOGGLE' }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error toggling spotlight:', chrome.runtime.lastError.message);
                settingsStatusEl.textContent = 'Could not toggle Spotlight.';
            } else {
                window.close();
            }
        });
    });

    // Update tab list on browser tab changes
    const updatePopupOnTabChange = () => {
        chrome.storage.sync.get('userId', (result) => {
            if(result.userId) {
                listCurrentTabs();
            }
        });
    };
    chrome.tabs.onUpdated.addListener(updatePopupOnTabChange);
    chrome.tabs.onRemoved.addListener(updatePopupOnTabChange);
    chrome.tabs.onCreated.addListener(updatePopupOnTabChange);
    chrome.tabs.onReplaced.addListener(updatePopupOnTabChange);
});
