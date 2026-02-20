
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
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
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
    const saveSettingsButton = document.getElementById('saveSettingsButton');
    const settingsStatusEl = document.getElementById('settings-status');
    const toggleSpotlightButton = document.getElementById('toggleSpotlightButton');
    
    // Encryption
    const encryptionToggle = document.getElementById('encryptionToggle');
    const encryptionKeySection = document.getElementById('encryption-key-section');
    const secretKeyInput = document.getElementById('secretKeyInput');
    const generateKeyButton = document.getElementById('generateKeyButton');
    const saveKeyButton = document.getElementById('saveKeyButton');
    const keyStatusEl = document.getElementById('key-status');

    // Shortcuts
    const manageShortcutsButton = document.getElementById('manageShortcutsButton');
    const spotlightShortcutInput = document.getElementById('spotlightShortcut');
    const favoriteShortcutInput = document.getElementById('favoriteShortcut');

    const showView = (viewToShow) => {
        allViews.forEach(view => view.classList.remove('active'));
        viewToShow.classList.add('active');
    };

    const switchTab = (tabId) => {
      tabContents.forEach(content => content.classList.remove('active'));
      tabButtons.forEach(button => button.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      document.querySelector(`.tab-button[data-tab="${tabId}"]`).classList.add('active');
    };
    
    const triggerSync = () => {
        if (!chrome.runtime?.sendMessage) return;
        statusEl.textContent = 'Syncing...';
        chrome.runtime.sendMessage({ type: 'SYNC_TABS' }, (response) => {
             if (chrome.runtime.lastError) {
                statusEl.textContent = `Sync failed: ${chrome.runtime.lastError.message}`;
                return;
            }
            if (response?.status === 'success') {
                statusEl.textContent = `Sync successful.`;
                listCurrentTabs();
            } else {
                statusEl.textContent = `Sync failed: ${response?.message || 'Unknown error'}`;
            }
            setTimeout(() => { statusEl.textContent = ''; }, 3000);
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
        if (chrome.commands) {
            chrome.commands.getAll((commands) => {
                for (const command of commands) {
                    if (command.name === 'toggle-search') {
                        spotlightShortcutInput.value = command.shortcut || 'Not set';
                    } else if (command.name === 'add-to-favorites') {
                        favoriteShortcutInput.value = command.shortcut || 'Not set';
                    }
                }
            });
        }
    };

    // Initialization
    chrome.storage.sync.get(['apiUrl', 'userEmail', 'accessToken', 'deviceName', 'os'], (result) => {
        if (result.apiUrl) {
            apiUrlInput.value = result.apiUrl;
            if (result.accessToken && result.userEmail) {
                loggedInUserEl.textContent = result.userEmail;
                deviceNameInput.value = result.deviceName || `Chrome (${result.os || 'Unknown'})`;
                showView(mainContent);
                switchTab('tabs-panel');
                listCurrentTabs();
                loadShortcuts();
            } else {
                showView(authSection);
            }
        } else {
            showView(urlSection);
        }
    });

    // Load encryption state
    chrome.runtime.sendMessage({ type: 'GET_KEY', keyId: 'symmetricKey' }, (keyInfo) => {
        if (keyInfo) {
            encryptionToggle.checked = true;
            encryptionKeySection.style.display = 'block';
            secretKeyInput.value = keyInfo.key || '';
        }
    });


    // Event Listeners
    saveUrlButton.addEventListener('click', () => {
        const url = apiUrlInput.value.trim();
        if (url) {
            chrome.storage.sync.set({ apiUrl: url }, () => showView(authSection));
        } else {
            urlStatusEl.textContent = 'Please enter a valid URL.';
        }
    });

    backToUrlButton.addEventListener('click', () => showView(urlSection));

    loginButton.addEventListener('click', () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        if (!email || !password) {
            authStatusEl.textContent = 'Please enter your email and password.';
            return;
        }
        loginButton.disabled = true;
        authStatusEl.textContent = 'Signing in...';
        chrome.runtime.sendMessage({ type: 'SIGN_IN', email, password }, (response) => {
            loginButton.disabled = false;
            if (chrome.runtime.lastError) {
                authStatusEl.textContent = `Error: ${chrome.runtime.lastError.message}`;
                return;
            }
            if (response?.status === 'success') {
                loggedInUserEl.textContent = response.email;
                chrome.storage.sync.get(['deviceName', 'os'], (result) => {
                    deviceNameInput.value = result.deviceName || `Chrome (${result.os || 'Unknown'})`;
                });
                showView(mainContent);
                switchTab('tabs-panel');
                listCurrentTabs();
                loadShortcuts();
            } else {
                authStatusEl.textContent = response?.message || 'Sign-in failed. Check your credentials.';
            }
        });
    });

    // Allow Enter key to trigger login
    passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginButton.click();
    });

    logoutButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, () => {
            emailInput.value = '';
            passwordInput.value = '';
            showView(authSection);
        });
    });

    syncButton.addEventListener('click', triggerSync);
    tabButtons.forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
    toggleSpotlightButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'TRIGGER_SPOTLIGHT_TOGGLE' }, () => window.close());
    });

    saveSettingsButton.addEventListener('click', () => {
        const newDeviceName = deviceNameInput.value.trim();
        chrome.storage.sync.set({ deviceName: newDeviceName }, () => {
            settingsStatusEl.textContent = 'Settings saved!';
            setTimeout(() => { settingsStatusEl.textContent = ''; }, 2000);
            triggerSync();
        });
    });

    // --- Encryption Listeners ---
    encryptionToggle.addEventListener('change', async (e) => {
        encryptionKeySection.style.display = e.target.checked ? 'block' : 'none';
        if (!e.target.checked) {
            // Remove keys if encryption is disabled
            await chrome.runtime.sendMessage({ type: 'DELETE_KEY', keyId: 'symmetricKey' });
            secretKeyInput.value = '';
            keyStatusEl.textContent = 'Encryption disabled. Key removed.';
            setTimeout(() => { keyStatusEl.textContent = ''; }, 2000);
            triggerSync();
        }
    });

    generateKeyButton.addEventListener('click', () => {
        if (typeof nacl === 'undefined') {
            keyStatusEl.textContent = 'Encryption library not loaded.';
            return;
        }
        const keyBytes = nacl.randomBytes(nacl.secretbox.keyLength);
        const key = btoa(String.fromCharCode(...keyBytes));
        secretKeyInput.value = key;
        keyStatusEl.textContent = 'New key generated. Click "Save Key".';
    });

    saveKeyButton.addEventListener('click', () => {
        if (typeof nacl === 'undefined') {
            keyStatusEl.textContent = 'Encryption library not loaded.';
            return;
        }
        const decodeBase64 = (b64) => new Uint8Array([...atob(b64)].map(c => c.charCodeAt(0)));
        const key = secretKeyInput.value.trim();
        if (key) {
            // Basic validation: Check if it's a valid Base64 string of the right length
            try {
                const keyUint8 = decodeBase64(key);
                if (keyUint8.length !== nacl.secretbox.keyLength) {
                    keyStatusEl.textContent = `Invalid key length. Must be ${nacl.secretbox.keyLength} bytes.`;
                    return;
                }
            } catch (e) {
                keyStatusEl.textContent = 'Invalid Base64 key format.';
                return;
            }

            chrome.runtime.sendMessage({ type: 'STORE_KEY', key: { id: 'symmetricKey', key: key } }, (response) => {
                if (response.status === 'success') {
                    keyStatusEl.textContent = 'Key saved successfully!';
                    triggerSync();
                } else {
                    keyStatusEl.textContent = `Error saving key: ${response.message}`;
                }
                setTimeout(() => { keyStatusEl.textContent = ''; }, 2000);
            });
        } else {
            keyStatusEl.textContent = 'Secret key cannot be empty.';
        }
    });

    // --- Shortcut Listeners ---
    manageShortcutsButton.addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
});
