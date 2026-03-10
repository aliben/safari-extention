
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const resultsList = document.getElementById('results-list');
    const container = document.getElementById('spotlight-container');
    const deviceFilterContainer = document.getElementById('device-filter-container');
    const deviceFilterList = document.getElementById('device-filter-list');
    const sortContainer = document.getElementById('sort-container');
    const searchPill = document.getElementById('search-pill');
    const syncIndicator = document.getElementById('sync-indicator');
    const historyModeButton = document.getElementById('history-mode-button');
    const tabsModeButton = document.getElementById('tabs-mode-button');
    const bookmarksModeButton = document.getElementById('bookmarks-mode-button');
    const sendTabPanel = document.getElementById('send-tab-panel');
    const sendTabLabel = document.getElementById('send-tab-label');
    const sendDeviceList = document.getElementById('send-device-list');

    let selectedIndex = 0;
    let currentResults = [];
    let currentDevices = [];
    let selectedDeviceId = 'all';
    let currentSort = 'timestamp';
    let currentSearchScope = 'tabs'; // 'tabs', 'bookmarks', 'favorites', 'history', 'recentlyClosed'
    let sendPanelVisible = false;
    let sendPanelActiveItem = null;
    let cachedSubscription = null;

    // ── Subscription / Tier helpers ────────────────────────────────────
    function fetchSubscription(cb) {
        chrome.runtime.sendMessage({ type: 'FETCH_SUBSCRIPTION' }, (sub) => {
            cachedSubscription = sub || { tier: 'free', status: 'active', limits: {} };
            if (cb) cb(cachedSubscription);
        });
    }

    function isScopeGated(scope) {
        if (!cachedSubscription) return false;
        const tier = cachedSubscription.tier || 'free';
        const limits = cachedSubscription.limits || {};
        if (scope === 'bookmarks'  && !limits.bookmarkSync)  return true;
        if (scope === 'history'    && !limits.historySearch)  return true;
        return false;
    }

    function showUpgradeOverlay(scope) {
        // Remove any existing overlay
        hideUpgradeOverlay();
        const featureLabels = { bookmarks: 'Bookmark Sync', history: 'History Search', favorites: 'Favorites' };
        const overlay = document.createElement('div');
        overlay.id = 'upgrade-overlay';
        overlay.innerHTML = `
            <div class="upgrade-overlay-card">
                <div class="upgrade-overlay-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                </div>
                <div class="upgrade-overlay-title">${featureLabels[scope] || scope} requires an upgrade</div>
                <div class="upgrade-overlay-desc">This feature is available on the Plus or Pro plan. Upgrade from your Tablicate dashboard to unlock it.</div>
                <button class="upgrade-overlay-btn" id="upgrade-overlay-action">Upgrade Plan ↗</button>
                <button class="upgrade-overlay-dismiss" id="upgrade-overlay-dismiss">Back to Tabs</button>
            </div>`;
        const resultsContainer = document.getElementById('results-container');
        resultsContainer.appendChild(overlay);

        document.getElementById('upgrade-overlay-action').addEventListener('click', () => {
            chrome.storage.sync.get(['apiUrl'], (r) => {
                if (r.apiUrl) {
                    chrome.runtime.sendMessage({ type: 'OPEN_TAB', item: { url: r.apiUrl + '/settings' } });
                    closeSpotlight();
                }
            });
        });
        document.getElementById('upgrade-overlay-dismiss').addEventListener('click', () => {
            hideUpgradeOverlay();
            setSearchScope('tabs');
        });
    }

    function hideUpgradeOverlay() {
        const existing = document.getElementById('upgrade-overlay');
        if (existing) existing.remove();
    }

    function closeSpotlight() {
        window.parent.postMessage({ type: 'CLOSE_SPOTLIGHT' }, '*');
    }

    function performSearch() {
        const query = searchInput.value;
        // Map search scope to mode for background script
        const mode = (currentSearchScope === 'favorites') ? 'favorites' : currentSearchScope;
        chrome.runtime.sendMessage({ type: 'SEARCH', query, mode }, (allResults) => {
            renderResults(allResults);
        });
    }

    function fetchDevices() {
        // Show device filter for tabs and bookmarks modes
        if (currentSearchScope === 'tabs' || currentSearchScope === 'bookmarks') {
            const msgType = currentSearchScope === 'bookmarks' ? 'GET_BOOKMARK_DEVICES' : 'GET_DEVICES';
            chrome.runtime.sendMessage({ type: msgType }, (devices) => {
                if (devices && devices.length > 0) {
                    currentDevices = devices;
                    deviceFilterContainer.style.display = 'block';
                    renderDeviceFilters();
                } else {
                    deviceFilterContainer.style.display = 'none';
                }
            });
        } else {
            deviceFilterContainer.style.display = 'none';
        }
    }
    
    function renderDeviceFilters() {
        deviceFilterList.innerHTML = '';
        if (currentSearchScope !== 'tabs' && currentSearchScope !== 'bookmarks') return;

        // Add "All Devices" pill
        const allPill = document.createElement('div');
        allPill.className = 'device-pill selected';
        allPill.textContent = 'All Devices';
        allPill.dataset.deviceId = 'all';
        const totalCount = currentDevices.reduce((sum, dev) => sum + dev.count, 0);
        const allCountSpan = document.createElement('span');
        allCountSpan.className = 'tab-count';
        allCountSpan.textContent = totalCount;
        allPill.appendChild(allCountSpan);
        allPill.addEventListener('click', () => selectDevice('all'));
        deviceFilterList.appendChild(allPill);

        // Add individual device pills
        currentDevices.forEach(device => {
            const pill = document.createElement('div');
            pill.className = 'device-pill';
            pill.dataset.deviceId = device.id;
            
            const icon = document.createElement('span');
            // SVG device icons instead of emoji
            const isMobile = device.type === 'phone' || (device.name || '').toLowerCase().includes('android') || (device.name || '').toLowerCase().includes('iphone');
            if (isMobile) {
                icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><circle cx="12" cy="17" r="1"/></svg>`;
            } else {
                icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
            }

            const name = document.createElement('span');
            name.textContent = device.name;
            
            const countSpan = document.createElement('span');
            countSpan.className = 'tab-count';
            countSpan.textContent = device.count;

            pill.appendChild(icon);
            pill.appendChild(name);
            pill.appendChild(countSpan);
            pill.addEventListener('click', () => selectDevice(device.id));
            deviceFilterList.appendChild(pill);
        });
    }

    function selectDevice(deviceId) {
        selectedDeviceId = deviceId;
        const pills = deviceFilterList.querySelectorAll('.device-pill');
        pills.forEach(p => {
            if (p.dataset.deviceId === deviceId) {
                p.classList.add('selected');
            } else {
                p.classList.remove('selected');
            }
        });
        renderResults(currentResults); // Re-render with the new filter
    }

    function formatRelativeTime(isoStringOrMs) {
        const date = typeof isoStringOrMs === 'number' ? new Date(isoStringOrMs) : new Date(isoStringOrMs);
        const diff = Date.now() - date.getTime();
        const min  = Math.floor(diff / 60000);
        const hr   = Math.floor(min  / 60);
        const day  = Math.floor(hr   / 24);
        if (min < 1)  return 'just now';
        if (min < 60) return `${min}m ago`;
        if (hr  < 24) return `${hr}h ago`;
        if (day <  7) return `${day}d ago`;
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    function updateSearchPill() {
        const pillLabels = {
            favorites:      'Favorites',
            history:        'History',
            bookmarks:      'Bookmarks',
            recentlyClosed: 'Recent',
        };
        const label = pillLabels[currentSearchScope];
        if (label) {
            searchPill.textContent = '';
            const text = document.createTextNode(label + ' ');
            const closeButton = document.createElement('span');
            closeButton.className = 'close-pill';
            closeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            closeButton.onclick = (e) => { e.stopPropagation(); setSearchScope('tabs'); };
            searchPill.appendChild(text);
            searchPill.appendChild(closeButton);
            searchPill.classList.remove('hidden');
        } else {
            searchPill.classList.add('hidden');
        }
    }

    function setSearchScope(scope) {
        if (currentSearchScope === scope) return;

        // Tier gate: block access to gated scopes for free users
        if (isScopeGated(scope)) {
            // Still update the UI to show user tried to switch
            currentSearchScope = scope;
            searchInput.value = '';
            tabsModeButton.classList.toggle('active', scope === 'tabs');
            bookmarksModeButton.classList.toggle('active', scope === 'bookmarks');
            if (historyModeButton) historyModeButton.classList.toggle('active', scope === 'history');
            updateSearchPill();
            resultsList.innerHTML = '';
            showUpgradeOverlay(scope);
            return;
        }

        hideUpgradeOverlay();
        currentSearchScope = scope;
        searchInput.value = '';
        hideSendPanel();

        // Update active button
        tabsModeButton.classList.toggle('active', scope === 'tabs');
        bookmarksModeButton.classList.toggle('active', scope === 'bookmarks');
        if (historyModeButton) historyModeButton.classList.toggle('active', scope === 'history');
        
        // Update pill for shortcut-activated modes
        updateSearchPill();

        fetchDevices();
        performSearch();
        searchInput.focus();
    }

    // --- Send-to-Device Panel ---
    function showSendPanel(item) {
        sendPanelActiveItem = item;
        sendTabLabel.textContent = item.title || item.url;
        sendDeviceList.innerHTML = '';
        const otherDevices = currentDevices.filter(d => d.id !== item.deviceId);
        if (otherDevices.length === 0) {
            const note = document.createElement('div');
            note.className = 'send-no-devices';
            note.textContent = 'No other synced devices. Open Tablicate on another device first.';
            sendDeviceList.appendChild(note);
        } else {
            otherDevices.forEach((device, i) => {
                const btn = document.createElement('button');
                btn.className = 'send-device-btn';
                const numBadge = document.createElement('span');
                numBadge.className = 'send-device-num';
                numBadge.textContent = i + 1;
                const nameSpan = document.createElement('span');
                nameSpan.textContent = device.name;
                btn.appendChild(numBadge);
                btn.appendChild(nameSpan);
                btn.addEventListener('click', () => doSendTab(device.id, device.name));
                sendDeviceList.appendChild(btn);
            });
        }
        sendTabPanel.classList.remove('hidden');
        sendPanelVisible = true;
    }

    function hideSendPanel() {
        if (!sendPanelVisible && sendTabPanel) sendTabPanel.classList.add('hidden');
        sendPanelVisible = false;
        sendPanelActiveItem = null;
    }

    function doSendTab(targetDeviceId, deviceName) {
        if (!sendPanelActiveItem) return;
        chrome.runtime.sendMessage({ type: 'SEND_TAB', url: sendPanelActiveItem.url, targetDeviceId }, (response) => {
            hideSendPanel();
            const liItems = resultsList.getElementsByClassName('result-item');
            if (selectedIndex > -1 && liItems[selectedIndex]) {
                const feedback = document.createElement('div');
                if (response && response.status === 'error') {
                    feedback.className = 'copied-feedback error-feedback';
                    feedback.textContent = response.message || 'Upgrade to get more sends';
                    liItems[selectedIndex].appendChild(feedback);
                    setTimeout(() => feedback.remove(), 3000);
                } else {
                    feedback.className = 'copied-feedback';
                    feedback.textContent = `Sent to ${deviceName}!`;
                    liItems[selectedIndex].appendChild(feedback);
                    setTimeout(() => feedback.remove(), 1500);
                }
            }
        });
    }

    function renderResults(results) {
        resultsList.innerHTML = '';
        currentResults = results || [];
        
        let filteredResults = currentResults;
        
        // Filter by device in tabs and bookmarks modes
        if ((currentSearchScope === 'tabs' || currentSearchScope === 'bookmarks') && selectedDeviceId !== 'all') {
            filteredResults = filteredResults.filter(item => item.deviceId === selectedDeviceId);
        }

        // Add favorite marker to results
        filteredResults = filteredResults.map(res => ({ ...res, isFavorite: res.deviceName === 'Favorites' }));
        
        // Sorting
        filteredResults.sort((a, b) => {
            if (currentSort === 'alpha') {
                return (a.title || '').localeCompare(b.title || '');
            }
            return (b.timestamp || 0) - (a.timestamp || 0);
        });
        
        selectedIndex = -1;

        if (filteredResults.length > 0) {
            filteredResults.forEach((item, index) => {
                const li = document.createElement('li');
                li.className = 'result-item';
                li.dataset.url = item.url || '';
                li.dataset.openable = item.url ? '1' : '0';
                li.dataset.index = index;

                const favicon = document.createElement('img');
                favicon.className = 'favicon';
                const faviconSvg = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/></svg>`;
                favicon.src = item.isBookmark ? '' : (item.faviconUrl || faviconSvg);
                favicon.onerror = () => { favicon.src = faviconSvg; };
                if (item.isBookmark) {
                    favicon.style.opacity = '0';
                }

                const details = document.createElement('div');
                details.className = 'result-details';
                
                const title = document.createElement('div');
                title.className = 'result-title';
                
                if (item.isRecentlyClosed) {
                    const undo = document.createElement('span');
                    undo.className = 'favorite-icon';
                    undo.style.color = '#a78bfa';
                    undo.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
                    title.appendChild(undo);
                } else if (item.isHistory) {
                    const clock = document.createElement('span');
                    clock.className = 'favorite-icon';
                    clock.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
                    title.appendChild(clock);
                } else if (item.isLocked) {
                    const lock = document.createElement('span');
                    lock.className = 'favorite-icon';
                    lock.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
                    title.appendChild(lock);
                } else if (item.isFavorite || item.isBookmark) {
                    const star = document.createElement('span');
                    star.className = 'favorite-icon';
                    star.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
                    title.appendChild(star);
                }

                const titleText = document.createElement('span');
                titleText.textContent = item.title || "No Title";
                title.appendChild(titleText);
                
                const url = document.createElement('div');
                url.className = 'result-url';
                if (item.isLocked) {
                    url.textContent = 'Encrypted bookmark (sync key required)';
                } else {
                    try {
                        const parsed = new URL(item.url);
                        url.textContent = parsed.hostname.replace(/^www\./, '') + (parsed.pathname !== '/' ? parsed.pathname : '');
                    } catch (_) {
                        url.textContent = item.url;
                    }
                }

                details.appendChild(title);
                details.appendChild(url);

                // Device label — rendered above title, inside details (only for cross-device tabs)
                const device = document.createElement('span');
                device.className = 'result-device';
                if (item.isHistory && item.visitedAt) {
                    device.textContent = (item.deviceName || 'Unknown') + ' · ' + formatRelativeTime(item.visitedAt);
                } else {
                    device.textContent = item.deviceName || '';
                }
                // Show device label for remote bookmarks; hide it for local bookmarks ("This Device")
                const showDevice = device.textContent && !item.isFavorite && !item.isRecentlyClosed &&
                    !(item.isBookmark && item.deviceName === 'This Device');
                if (showDevice) {
                    details.insertBefore(device, title);
                }

                // Action buttons: send + close (only for open tabs)
                const actions = document.createElement('div');
                actions.className = 'result-actions';
                if (!item.isHistory && !item.isFavorite && !item.isBookmark && !item.isRecentlyClosed) {
                    const sendBtn = document.createElement('button');
                    sendBtn.className = 'action-btn send-btn';
                    sendBtn.title = 'Send to device (⌘→)';
                    sendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>⌘→`;
                    sendBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        updateSelection(index);
                        showSendPanel(item);
                    });
                    actions.appendChild(sendBtn);

                    const closeBtn = document.createElement('button');
                    closeBtn.className = 'action-btn close-btn';
                    closeBtn.title = 'Close tab (⌘⌫)';
                    closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>⌘⌫`;
                    closeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        chrome.runtime.sendMessage({ type: 'CLOSE_TAB', item }, (resp) => {
                            if (resp?.status === 'success') {
                                const feedback = document.createElement('div');
                                feedback.className = 'copied-feedback';
                                feedback.textContent = 'Close command sent!';
                                const li = resultsList.getElementsByClassName('result-item')[index];
                                if (li) { li.appendChild(feedback); setTimeout(() => feedback.remove(), 1500); }
                                const idx = currentResults.indexOf(item);
                                if (idx > -1) { currentResults.splice(idx, 1); setTimeout(() => renderResults(currentResults), 800); }
                            } else {
                                const feedback = document.createElement('div');
                                feedback.className = 'copied-feedback error-feedback';
                                feedback.textContent = resp?.message || 'Upgrade to get more sends';
                                const li = resultsList.getElementsByClassName('result-item')[index];
                                if (li) { li.appendChild(feedback); setTimeout(() => feedback.remove(), 3000); }
                            }
                        });
                    });
                    actions.appendChild(closeBtn);
                }

                li.appendChild(favicon);
                li.appendChild(details);
                li.appendChild(actions);

                li.addEventListener('mouseover', () => updateSelection(index));
                li.addEventListener('click', () => {
                    if (item.isRecentlyClosed) {
                        chrome.runtime.sendMessage({ type: 'RESTORE_TAB', sessionId: item.sessionId, url: item.url });
                        closeSpotlight();
                    } else if (item.url) {
                        chrome.runtime.sendMessage({ type: 'OPEN_TAB', item });
                        closeSpotlight();
                    }
                });

                resultsList.appendChild(li);
            });
            updateSelection(0);
        } else {
            const emptyState = document.createElement('li');
            emptyState.className = 'result-item empty-state';
            const scopeLabels = { tabs: 'open tabs', bookmarks: 'bookmarks', favorites: 'favorites', history: 'history', recentlyClosed: 'recently closed tabs' };
            const scopeLabel = scopeLabels[currentSearchScope] || 'results';
            emptyState.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <div>
                  <div class="empty-state-text">No ${scopeLabel} found</div>
                  ${searchInput.value ? `<div class="empty-state-sub">Try a different search term</div>` : `<div class="empty-state-sub">Nothing here yet</div>`}
                </div>`;
            resultsList.appendChild(emptyState);
        }
    }

    function updateSelection(newIndex) {
        const items = resultsList.getElementsByClassName('result-item');
        if (items.length === 0) return;

        if (selectedIndex >= 0 && items[selectedIndex]) {
            items[selectedIndex].classList.remove('selected');
        }
        
        selectedIndex = newIndex;
        
        if (selectedIndex >= 0 && items[selectedIndex]) {
            items[selectedIndex].classList.add('selected');
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
        }
    }
    
    function setSort(sortType) {
        currentSort = sortType;
        const buttons = sortContainer.querySelectorAll('.sort-button');
        buttons.forEach(button => {
            if (button.dataset.sort === sortType) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
        renderResults(currentResults); // Re-sort and re-render
    }


    searchInput.addEventListener('input', (e) => {
        if (searchInput.value === 'f ') { setSearchScope('favorites'); return; }
        if (searchInput.value === 'h ') { setSearchScope('history'); return; }
        if (searchInput.value === 'b ') { setSearchScope('bookmarks'); return; }
        if (searchInput.value === 'r ') { setSearchScope('recentlyClosed'); return; }
        performSearch();
    });


    searchInput.addEventListener('keydown', (e) => {
        const items = resultsList.getElementsByClassName('result-item');

        // Escape: cancel send panel first, then close spotlight
        if (e.key === 'Escape') {
            if (sendPanelVisible) { hideSendPanel(); return; }
            closeSpotlight();
            return;
        }

        // Number keys 1–9 select a device in the send panel
        if (sendPanelVisible && e.key >= '1' && e.key <= '9') {
            e.preventDefault();
            const idx = parseInt(e.key) - 1;
            const deviceBtns = sendDeviceList.querySelectorAll('.send-device-btn');
            if (deviceBtns[idx]) deviceBtns[idx].click();
            return;
        }

        // ⌘⌫ / Ctrl+Backspace — close the selected tab
        if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (selectedIndex > -1 && currentResults[selectedIndex]) {
                const item = currentResults[selectedIndex];
                const liItems = resultsList.getElementsByClassName('result-item');
                if (liItems[selectedIndex]) liItems[selectedIndex].style.opacity = '0.4';
                chrome.runtime.sendMessage({ type: 'CLOSE_TAB', item }, (resp) => {
                    if (resp?.status === 'success') {
                        const feedback = document.createElement('div');
                        feedback.className = 'copied-feedback';
                        feedback.textContent = 'Close command sent!';
                        const liEl = resultsList.getElementsByClassName('result-item')[selectedIndex];
                        if (liEl) { liEl.appendChild(feedback); setTimeout(() => feedback.remove(), 1500); }
                        currentResults.splice(selectedIndex, 1);
                        setTimeout(() => renderResults(currentResults), 800);
                    } else {
                        const li2 = resultsList.getElementsByClassName('result-item')[selectedIndex];
                        if (li2) {
                            li2.style.opacity = '';
                            const feedback = document.createElement('div');
                            feedback.className = 'copied-feedback error-feedback';
                            feedback.textContent = resp?.message || 'Upgrade to get more sends';
                            li2.appendChild(feedback);
                            setTimeout(() => feedback.remove(), 3000);
                        }
                    }
                });
            }
            return;
        }

        // ⌘→ / Ctrl+→ — toggle send-to-device panel
        if (e.key === 'ArrowRight' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (sendPanelVisible) {
                hideSendPanel();
            } else if (selectedIndex > -1 && currentResults[selectedIndex]) {
                showSendPanel(currentResults[selectedIndex]);
            }
            return;
        }

        if (e.key === 'Backspace' && searchInput.value === '') {
            if (['favorites', 'history', 'recentlyClosed', 'bookmarks'].includes(currentSearchScope)) {
                setSearchScope('tabs');
            }
        }

        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const newIndex = selectedIndex < items.length - 1 ? selectedIndex + 1 : 0;
            updateSelection(newIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const newIndex = selectedIndex > 0 ? selectedIndex - 1 : items.length - 1;
            updateSelection(newIndex);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex > -1 && items[selectedIndex]) {
                items[selectedIndex].click();
            }
        } else if (e.key === 'c' && (e.metaKey || e.ctrlKey)) { // Cmd+C or Ctrl+C
             e.preventDefault();
            if (selectedIndex > -1 && items[selectedIndex]) {
                const urlToCopy = items[selectedIndex].dataset.url;
                if (!urlToCopy) return;
                window.parent.postMessage({ type: 'COPY_TEXT', text: urlToCopy }, '*');
                
                // Show feedback
                const feedback = document.createElement('div');
                feedback.className = 'copied-feedback';
                feedback.textContent = 'Copied!';
                items[selectedIndex].appendChild(feedback);
                setTimeout(() => {
                    feedback.remove();
                }, 1000);
            }
        }
    });
    
    sortContainer.querySelectorAll('.sort-button').forEach(button => {
        button.addEventListener('click', () => setSort(button.dataset.sort));
    });

    tabsModeButton.addEventListener('click', () => setSearchScope('tabs'));
    bookmarksModeButton.addEventListener('click', () => setSearchScope('bookmarks'));
    
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            closeSpotlight();
        }
    });

    window.addEventListener('message', (event) => {
        // Handle sync completion — refresh results and hide spinner
        if (event.data.type === 'SYNC_COMPLETE') {
            performSearch();
            fetchDevices();
            if (syncIndicator) syncIndicator.classList.add('hidden');
            return;
        }
        // Handle adding a favorite via shortcut
        if (event.data.type === 'ADD_TO_FAVORITES_COMMAND') {
            const items = resultsList.getElementsByClassName('result-item');
            if (selectedIndex > -1 && items[selectedIndex]) {
                const url = items[selectedIndex].dataset.url;
                const tabData = currentResults.find(t => t.url === url);
                if (tabData) {
                    chrome.runtime.sendMessage({ type: 'ADD_FAVORITE', tabData }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error("Error adding favorite:", chrome.runtime.lastError.message);
                            return;
                        }
                        if (response.status === 'success') {
                            const titleDiv = items[selectedIndex].querySelector('.result-title');
                            if (titleDiv && !titleDiv.querySelector('.favorite-icon')) {
                                 const star = document.createElement('span');
                                 star.className = 'favorite-icon';
                                 star.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
                                 titleDiv.prepend(star);
                            }
                        } else {
                            const feedback = document.createElement('div');
                            feedback.className = 'copied-feedback error-feedback';
                            feedback.textContent = response.message || 'Failed to add favorite';
                            items[selectedIndex].appendChild(feedback);
                            setTimeout(() => feedback.remove(), 3000);
                        }
                    });
                }
            }
        }
    });

    // Listen for the parent frame telling us to take focus (Safari workaround)
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'FOCUS_INPUT') {
            searchInput.focus();
        }
    });

    // Safari blocks programmatic focus() without a user gesture.
    // Capture ANY click/touch on the spotlight wrapper and redirect focus to the input.
    document.getElementById('spotlight-wrapper').addEventListener('mousedown', (e) => {
        // Don't steal focus from buttons/links inside the results
        if (e.target.closest('.result-item, button, a, .sort-button, .tab-button, .device-pill, .send-device-btn')) return;
        e.preventDefault();
        searchInput.focus();
    });

    // Retry focus with increasing delays — Safari sometimes needs a tick
    [0, 50, 150, 300].forEach(delay => {
        setTimeout(() => searchInput.focus(), delay);
    });

    // Document-level Escape so it works even when input isn't focused
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (sendPanelVisible) { hideSendPanel(); return; }
            closeSpotlight();
        }
    });

    fetchSubscription(); // load tier data on spotlight open
    fetchDevices();
    performSearch();
    searchInput.focus();
});

