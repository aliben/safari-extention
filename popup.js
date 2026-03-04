
if (typeof globalThis.chrome === 'undefined' && typeof globalThis.browser !== 'undefined') {
    globalThis.chrome = globalThis.browser;
}

document.addEventListener('DOMContentLoaded', () => {

    // ── Views ──────────────────────────────────────────────────────────────
    const viewUrl    = document.getElementById('view-url');
    const viewAuth   = document.getElementById('view-auth');
    const viewE2ee   = document.getElementById('view-e2ee');
    const viewMain   = document.getElementById('view-main');
    const allViews   = [viewUrl, viewAuth, viewE2ee, viewMain];
    const stepDots   = document.getElementById('step-dots');
    const dots       = stepDots ? stepDots.querySelectorAll('.dot') : [];
    const ONBOARDING = [viewUrl, viewAuth, viewE2ee];

    // ── URL view ───────────────────────────────────────────────────────────
    const apiUrlInput   = document.getElementById('apiUrl');
    const saveUrlBtn    = document.getElementById('saveUrlButton');
    const urlStatusEl   = document.getElementById('url-status');

    // ── Auth view ──────────────────────────────────────────────────────────
    const emailInput    = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginBtn      = document.getElementById('loginButton');
    const backToUrlBtn  = document.getElementById('backToUrlButton');
    const authStatusEl  = document.getElementById('auth-status');

    // ── E2EE view ──────────────────────────────────────────────────────────
    const e2eePrompt    = document.getElementById('e2ee-prompt');
    const e2eeSetup     = document.getElementById('e2ee-setup');
    const e2eeExisting  = document.getElementById('e2ee-existing');
    const e2eeEnableBtn = document.getElementById('e2ee-enable-btn');
    const e2eeSkipBtn   = document.getElementById('e2ee-skip-btn');
    const e2eeDoneBtn   = document.getElementById('e2ee-done-btn');
    const e2eeRegenBtn  = document.getElementById('e2ee-regen-btn');
    const e2eeContBtn   = document.getElementById('e2ee-continue-btn');
    const e2eeRotateBtn = document.getElementById('e2ee-rotate-btn');
    const genKeyDisplay = document.getElementById('generatedKeyDisplay');
    const copyKeyBtn    = document.getElementById('copyKeyBtn');
    const copyStatusEl  = document.getElementById('copy-status');
    const pasteKeyInput = document.getElementById('pasteKeyInput');
    const useExistingBtn= document.getElementById('useExistingKeyBtn');
    const backendUrlLink= document.getElementById('backendUrlLink');

    // ── Main / Settings ────────────────────────────────────────────────────
    const loggedInUserEl    = document.getElementById('loggedInUser');
    const logoutBtn         = document.getElementById('logoutButton');
    const syncBtn           = document.getElementById('syncButton');
    const statusEl          = document.getElementById('status');
    const tabsListEl        = document.getElementById('tabsList');
    const tabButtons        = document.querySelectorAll('.tab-button');
    const tabContents       = document.querySelectorAll('.tab-content');
    const deviceNameInput   = document.getElementById('deviceNameInput');
    const saveSettingsBtn   = document.getElementById('saveSettingsButton');
    const settingsStatusEl  = document.getElementById('settings-status');
    const toggleSpotlightBtn= document.getElementById('toggleSpotlightButton');
    const encKeySection     = document.getElementById('encryption-key-section');
    const secretKeyInput    = document.getElementById('secretKeyInput');
    const generateKeyBtn    = document.getElementById('generateKeyButton');
    const saveKeyBtn        = document.getElementById('saveKeyButton');
    const keyStatusEl       = document.getElementById('key-status');
    const manageShortcutsBtn= document.getElementById('manageShortcutsButton');
    const spotlightShortcut = document.getElementById('spotlightShortcut');
    const favoriteShortcut  = document.getElementById('favoriteShortcut');
    const e2eeSettingsBlock = document.getElementById('e2ee-settings-block');
    const copySettingsKeyBtn= document.getElementById('copySettingsKeyBtn');
    const clearTabsCacheBtn      = document.getElementById('clearTabsCacheBtn');
    const clearBookmarksCacheBtn = document.getElementById('clearBookmarksCacheBtn');
    const clearCacheStatusEl     = document.getElementById('clear-cache-status');
    const lastSyncedAtEl           = document.getElementById('lastSyncedAt');

    // ── Helpers ────────────────────────────────────────────────────────────
    const sendMsg = (msg, cb) => chrome.runtime.sendMessage(msg, cb);
    const isBrowserInternalUrl = (url = '') =>
        /^chrome:\/\//i.test(url) ||
        /^about:/i.test(url) ||
        /^safari-web-extension:\/\//i.test(url) ||
        /^safari-extension:\/\//i.test(url);

    const SYMMETRIC_KEY_LENGTH = 32; // nacl.secretbox.keyLength

    const generateKey = () => {
        const b = new Uint8Array(SYMMETRIC_KEY_LENGTH);
        crypto.getRandomValues(b);
        return btoa(String.fromCharCode(...b));
    };

    const isValidKey = (key) => {
        if (!key) return false;
        try {
            const b = new Uint8Array([...atob(key)].map(c => c.charCodeAt(0)));
            return b.length === SYMMETRIC_KEY_LENGTH;
        } catch { return false; }
    };

    const copyText = (text, el) => {
        navigator.clipboard.writeText(text).then(() => {
            if (!el) return;
            const orig = el.textContent;
            el.textContent = '\u2713 Copied!';
            setTimeout(() => { el.textContent = orig; }, 2000);
        });
    };

    const formatRelativeTime = (iso) => {
        if (!iso) return '';
        const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
        if (diff < 60)    return 'Just now';
        if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return new Date(iso).toLocaleDateString();
    };

    const updateLastSyncedDisplay = () => {
        if (!lastSyncedAtEl) return;
        chrome.storage.local.get(['lastSyncedAt'], (r) => {
            lastSyncedAtEl.textContent = r.lastSyncedAt ? `Last synced: ${formatRelativeTime(r.lastSyncedAt)}` : '';
        });
    };

    // ── View navigation ────────────────────────────────────────────────────
    const showView = (view) => {
        allViews.forEach(v => v.classList.remove('active'));
        view.classList.add('active');
        const isOnboarding = ONBOARDING.includes(view);
        if (stepDots) stepDots.classList.toggle('hidden', !isOnboarding);
        if (isOnboarding) {
            const step = ONBOARDING.indexOf(view) + 1;
            dots.forEach((d, i) => d.classList.toggle('active', i < step));
        }
    };

    const switchTab = (tabId) => {
        tabContents.forEach(c => c.classList.remove('active'));
        tabButtons.forEach(b => b.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        document.querySelector(`.tab-button[data-tab="${tabId}"]`).classList.add('active');
    };

    // ── E2EE sub-states ────────────────────────────────────────────────────
    const showE2eeState = (state) => {
        if (e2eePrompt)   e2eePrompt.style.display   = state === 'prompt'   ? '' : 'none';
        if (e2eeSetup)    e2eeSetup.style.display     = state === 'setup'    ? '' : 'none';
        if (e2eeExisting) e2eeExisting.style.display  = state === 'existing' ? '' : 'none';
    };

    const openKeySetup = () => {
        const key = generateKey();
        if (key && genKeyDisplay) genKeyDisplay.value = key;
        showE2eeState('setup');
    };

    // ── Main panel helpers ─────────────────────────────────────────────────
    const triggerSync = () => {
        statusEl.textContent = 'Syncing\u2026';
        sendMsg({ type: 'SYNC_TABS' }, (r) => {
            if (chrome.runtime.lastError) { statusEl.textContent = 'Sync failed.'; return; }
            statusEl.textContent = r?.status === 'success' ? 'Synced!' : `Failed: ${r?.message || ''}`;
            if (r?.status === 'success') { listCurrentTabs(); updateLastSyncedDisplay(); }
            setTimeout(() => { statusEl.textContent = ''; }, 3000);
        });
    };

    const listCurrentTabs = () => {
        chrome.tabs.query({}, (tabs) => {
            tabsListEl.innerHTML = '';
            const filtered = tabs.filter(t => t.url && !isBrowserInternalUrl(t.url));
            if (!filtered.length) { tabsListEl.innerHTML = '<li class="no-tabs-message">No active tabs found.</li>'; return; }
            filtered.forEach(tab => {
                const li = document.createElement('li');
                const img = document.createElement('img');
                img.src = tab.favIconUrl || 'images/icon16.png';
                img.onerror = () => { img.src = 'images/icon16.png'; };
                const span = document.createElement('span');
                span.textContent = tab.title;
                li.appendChild(img); li.appendChild(span);
                tabsListEl.appendChild(li);
            });
        });
    };

    const loadShortcuts = () => {
        if (!chrome.commands) return;
        chrome.commands.getAll((cmds) => {
            for (const c of cmds) {
                if (c.name === 'toggle-search'    && spotlightShortcut) spotlightShortcut.value = c.shortcut || 'Not set';
                if (c.name === 'add-to-favorites' && favoriteShortcut)  favoriteShortcut.value  = c.shortcut || 'Not set';
            }
        });
    };

    const renderE2eeSettingsBlock = () => {
        if (!e2eeSettingsBlock) return;
        sendMsg({ type: 'GET_KEY', keyId: 'symmetricKey' }, (keyInfo) => {
            if (keyInfo) {
                if (encKeySection) { encKeySection.style.display = 'block'; secretKeyInput.value = keyInfo.key || ''; }
                e2eeSettingsBlock.innerHTML = `
                  <div class="e2ee-active-row">
                    <span><span class="active-dot"></span>E2EE active &mdash; key stored on this device</span>
                    <button id="settings-manage-key" class="secondary" style="width:auto;padding:4px 10px;font-size:12px;">Manage</button>
                  </div>`;
                document.getElementById('settings-manage-key')?.addEventListener('click', () => {
                    if (encKeySection) encKeySection.style.display = encKeySection.style.display === 'none' ? 'block' : 'none';
                });
            } else {
                if (encKeySection) encKeySection.style.display = 'none';
                e2eeSettingsBlock.innerHTML = `
                  <div class="e2ee-inactive-row">
                    <span>Encryption not enabled</span>
                    <button id="settings-enable-e2ee" class="link-btn">Enable</button>
                  </div>`;
                document.getElementById('settings-enable-e2ee')?.addEventListener('click', () => {
                    openKeySetup();
                    e2eeDoneBtn._backToSettings = true;
                    showView(viewE2ee);
                });
            }
        });
    };

    const enterMain = () => {
        showView(viewMain);
        switchTab('tabs-panel');
        listCurrentTabs();
        loadShortcuts();
        renderE2eeSettingsBlock();
        updateLastSyncedDisplay();
    };

    // ── Init ───────────────────────────────────────────────────────────────
    chrome.storage.sync.get(['apiUrl', 'userEmail', 'accessToken', 'deviceName', 'os'], (r) => {
        if (r.apiUrl) {
            apiUrlInput.value = r.apiUrl;
            setBackendLink(r.apiUrl);
            if (r.accessToken && r.userEmail) {
                loggedInUserEl.textContent = r.userEmail;
                deviceNameInput.value = r.deviceName || `Safari (${r.os || 'Unknown'})`;
                enterMain();
            } else {
                showView(viewAuth);
            }
        } else {
            showView(viewUrl);
        }
    });

    function setBackendLink(url) {
        if (!backendUrlLink) return;
        try { backendUrlLink.textContent = new URL(url).hostname; } catch { backendUrlLink.textContent = url; }
        backendUrlLink.style.cursor = 'pointer';
        backendUrlLink.onclick = () => chrome.tabs.create({ url: url + '/settings' });
    }

    // ── Step 1: URL ────────────────────────────────────────────────────────
    saveUrlBtn.addEventListener('click', () => {
        const url = apiUrlInput.value.trim().replace(/\/$/, '');
        if (!url) { urlStatusEl.textContent = 'Please enter a valid URL.'; return; }
        chrome.storage.sync.set({ apiUrl: url }, () => {
            setBackendLink(url);
            urlStatusEl.textContent = '';
            showView(viewAuth);
        });
    });
    apiUrlInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveUrlBtn.click(); });

    // ── Step 2: Login ──────────────────────────────────────────────────────
    backToUrlBtn.addEventListener('click', () => showView(viewUrl));

    loginBtn.addEventListener('click', () => {
        const email = emailInput.value.trim(), password = passwordInput.value;
        if (!email || !password) { authStatusEl.textContent = 'Please enter your email and password.'; return; }
        loginBtn.disabled = true;
        authStatusEl.textContent = 'Signing in\u2026';

        const showAuthFallbackError = (runtimeMessage = '') => {
            chrome.storage.local.get([
                'lastAuthStage',
                'lastAuthError',
                'lastAuthStatus',
                'lastAuthResponse',
                'lastAuthAt',
            ], (dbg) => {
                const stage = dbg?.lastAuthStage || 'unknown-stage';
                const err = dbg?.lastAuthError || 'No auth error payload received from background.';
                const status = dbg?.lastAuthStatus ? ` status=${dbg.lastAuthStatus}` : '';
                const at = dbg?.lastAuthAt ? ` at=${new Date(dbg.lastAuthAt).toLocaleTimeString()}` : '';
                if (runtimeMessage && stage === 'unknown-stage' && !dbg?.lastAuthError) {
                    authStatusEl.textContent = `Sign-in failed: ${runtimeMessage}`;
                    return;
                }
                const runtimePrefix = runtimeMessage ? ` runtime=${runtimeMessage};` : '';
                authStatusEl.textContent = `Sign-in failed [${stage}]${status}${at}:${runtimePrefix} ${err}`;
            });
        };

        sendMsg({ type: 'SIGN_IN', email, password }, (res) => {
            loginBtn.disabled = false;
            if (chrome.runtime.lastError) {
                const runtimeMsg = chrome.runtime.lastError.message;
                authStatusEl.textContent = `Error: ${runtimeMsg}`;
                showAuthFallbackError(runtimeMsg);
                return;
            }
            if (res?.status === 'success') {
                loggedInUserEl.textContent = res.email;
                chrome.storage.sync.get(['deviceName', 'os'], (r) => {
                    deviceNameInput.value = r.deviceName || `Safari (${r.os || 'Unknown'})`;
                });
                authStatusEl.textContent = res.syncWarning ? `Signed in. ${res.syncWarning}` : '';
                // Check if E2EE key already exists on this device
                sendMsg({ type: 'GET_KEY', keyId: 'symmetricKey' }, (keyInfo) => {
                    if (keyInfo) {
                        showE2eeState('existing');
                    } else {
                        showE2eeState('prompt');
                    }
                    showView(viewE2ee);
                });
            } else {
                if (!res || !res.message) {
                    showAuthFallbackError();
                    return;
                }
                const details = res?.details ? ` | ${JSON.stringify(res.details)}` : '';
                authStatusEl.textContent = (res?.message || 'Sign-in failed (no error details from background).') + details;
            }
        });
    });
    passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); });

    // ── Step 3: E2EE ──────────────────────────────────────────────────────
    e2eeEnableBtn.addEventListener('click', openKeySetup);
    e2eeSkipBtn.addEventListener('click', () => { e2eeDoneBtn._backToSettings = false; enterMain(); });

    e2eeRegenBtn.addEventListener('click', () => {
        const key = generateKey();
        if (key) { genKeyDisplay.value = key; copyStatusEl.textContent = '\u21bb New key generated.'; setTimeout(() => { copyStatusEl.textContent = ''; }, 1500); }
    });

    copyKeyBtn.addEventListener('click', () => copyText(genKeyDisplay.value, copyKeyBtn));

    useExistingBtn.addEventListener('click', () => {
        const k = pasteKeyInput.value.trim();
        if (!isValidKey(k)) { copyStatusEl.textContent = 'Invalid key \u2014 must be a 32-byte Base64 string.'; return; }
        genKeyDisplay.value = k;
        pasteKeyInput.value = '';
        copyStatusEl.textContent = '\u2713 Key applied.';
        setTimeout(() => { copyStatusEl.textContent = ''; }, 1500);
    });

    e2eeDoneBtn.addEventListener('click', () => {
        const key = genKeyDisplay.value.trim();
        if (!isValidKey(key)) { copyStatusEl.textContent = 'Generate or paste a valid key first.'; return; }
        sendMsg({ type: 'STORE_KEY', key: { id: 'symmetricKey', key } }, (res) => {
            if (res?.status === 'success') {
                if (res?.refresh?.status === 'failure') {
                    copyStatusEl.textContent = `Key saved, but refresh failed: ${res.refresh.message || 'Unknown error'}`;
                }
                const back = e2eeDoneBtn._backToSettings;
                e2eeDoneBtn._backToSettings = false;
                enterMain();
                if (back) switchTab('settings-panel');
            } else {
                copyStatusEl.textContent = `Failed to save: ${res?.message || 'Unknown error'}`;
            }
        });
    });

    e2eeContBtn.addEventListener('click', () => enterMain());
    e2eeRotateBtn.addEventListener('click', openKeySetup);

    // ── Logout ─────────────────────────────────────────────────────────────
    logoutBtn.addEventListener('click', () => {
        sendMsg({ type: 'SIGN_OUT' }, () => {
            emailInput.value = ''; passwordInput.value = '';
            showView(viewAuth);
        });
    });

    // ── Main panel ─────────────────────────────────────────────────────────
    syncBtn.addEventListener('click', triggerSync);
    tabButtons.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    toggleSpotlightBtn.addEventListener('click', () => sendMsg({ type: 'TRIGGER_SPOTLIGHT_TOGGLE' }, () => window.close()));

    saveSettingsBtn.addEventListener('click', () => {
        chrome.storage.sync.set({ deviceName: deviceNameInput.value.trim() }, () => {
            settingsStatusEl.textContent = 'Saved!';
            setTimeout(() => { settingsStatusEl.textContent = ''; }, 2000);
            triggerSync();
        });
    });

    copySettingsKeyBtn?.addEventListener('click', () => copyText(secretKeyInput.value, copySettingsKeyBtn));

    generateKeyBtn.addEventListener('click', () => {
        const k = generateKey();
        if (k) { secretKeyInput.value = k; keyStatusEl.textContent = 'New key generated \u2014 click Save Key.'; }
    });

    saveKeyBtn.addEventListener('click', () => {
        const key = secretKeyInput.value.trim();
        if (!isValidKey(key)) { keyStatusEl.textContent = 'Invalid key format.'; return; }
        sendMsg({ type: 'STORE_KEY', key: { id: 'symmetricKey', key } }, (res) => {
            if (res?.status === 'success') {
                keyStatusEl.textContent = res?.refresh?.status === 'failure'
                    ? `Key saved, but refresh failed: ${res.refresh.message || 'Unknown error'}`
                    : 'Key saved and data decrypted!';
                renderE2eeSettingsBlock();
            } else {
                keyStatusEl.textContent = `Error: ${res?.message}`;
            }
            setTimeout(() => { keyStatusEl.textContent = ''; }, 2500);
        });
    });

    manageShortcutsBtn.addEventListener('click', () => {
        sendMsg({ type: 'OPEN_SHORTCUTS_PREFERENCES' }, (res) => {
            if (res?.status === 'success') {
                settingsStatusEl.textContent = 'Opened Safari shortcut preferences.';
            } else {
                settingsStatusEl.textContent = 'Open Safari Settings → Extensions to manage shortcuts.';
            }
            setTimeout(() => { settingsStatusEl.textContent = ''; }, 3500);
        });
    });

    clearTabsCacheBtn?.addEventListener('click', () => {
        sendMsg({ type: 'CLEAR_TABS_CACHE' }, (res) => {
            clearCacheStatusEl.textContent = res?.status === 'success' ? '\u2713 Tabs cache cleared.' : 'Failed.';
            setTimeout(() => { clearCacheStatusEl.textContent = ''; }, 2500);
        });
    });

    clearBookmarksCacheBtn?.addEventListener('click', () => {
        sendMsg({ type: 'CLEAR_BOOKMARKS_CACHE' }, (res) => {
            clearCacheStatusEl.textContent = res?.status === 'success' ? '\u2713 Bookmarks cache cleared.' : 'Failed.';
            setTimeout(() => { clearCacheStatusEl.textContent = ''; }, 2500);
        });
    });
});
