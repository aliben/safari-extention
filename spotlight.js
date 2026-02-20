
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
        // Only fetch and show devices if we are in tabs mode
        if (currentSearchScope === 'tabs') {
            deviceFilterContainer.style.display = 'block';
            chrome.runtime.sendMessage({ type: 'GET_DEVICES' }, (devices) => {
                if (devices && devices.length > 0) {
                    currentDevices = devices;
                    renderDeviceFilters();
                }
            });
        } else {
            deviceFilterContainer.style.display = 'none';
        }
    }
    
    function renderDeviceFilters() {
        deviceFilterList.innerHTML = '';
        if (currentSearchScope !== 'tabs') return;

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
            note.textContent = 'No other synced devices. Open Replica on another device first.';
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
        chrome.runtime.sendMessage({ type: 'SEND_TAB', url: sendPanelActiveItem.url, targetDeviceId }, () => {
            hideSendPanel();
            const liItems = resultsList.getElementsByClassName('result-item');
            if (selectedIndex > -1 && liItems[selectedIndex]) {
                const feedback = document.createElement('div');
                feedback.className = 'copied-feedback';
                feedback.textContent = `Sent to ${deviceName}!`;
                liItems[selectedIndex].appendChild(feedback);
                setTimeout(() => feedback.remove(), 1500);
            }
        });
    }

    function renderResults(results) {
        resultsList.innerHTML = '';
        currentResults = results || [];
        
        let filteredResults = currentResults;
        
        // Only filter by device if in 'tabs' mode
        if (currentSearchScope === 'tabs' && selectedDeviceId !== 'all') {
            filteredResults = filteredResults.filter(tab => tab.deviceId === selectedDeviceId);
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
                li.dataset.url = item.url;
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
                try {
                    const parsed = new URL(item.url);
                    url.textContent = parsed.hostname.replace(/^www\./, '') + (parsed.pathname !== '/' ? parsed.pathname : '');
                } catch (_) {
                    url.textContent = item.url;
                }

                details.appendChild(title);
                details.appendChild(url);
                
                const device = document.createElement('span');
                device.className = 'result-device';
                if (item.isHistory && item.visitedAt) {
                    device.textContent = (item.deviceName || 'Unknown') + ' · ' + formatRelativeTime(item.visitedAt);
                } else {
                    device.textContent = item.deviceName || 'Unknown';
                }

                // Action buttons: send + close (only for open tabs)
                const actions = document.createElement('div');
                actions.className = 'result-actions';
                if (!item.isHistory && !item.isFavorite && !item.isBookmark && !item.isRecentlyClosed) {
                    const sendBtn = document.createElement('button');
                    sendBtn.className = 'action-btn send-btn';
                    sendBtn.title = 'Send to device (\u2318\u2192)';
                    sendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
                    sendBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        updateSelection(index);
                        showSendPanel(item);
                    });
                    actions.appendChild(sendBtn);

                    const closeBtn = document.createElement('button');
                    closeBtn.className = 'action-btn close-btn';
                    closeBtn.title = 'Close tab (\u2318\u232b)';
                    closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
                    closeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        chrome.runtime.sendMessage({ type: 'CLOSE_TAB', item }, (resp) => {
                            if (resp?.status === 'success') {
                                const idx = currentResults.indexOf(item);
                                if (idx > -1) { currentResults.splice(idx, 1); renderResults(currentResults); }
                            }
                        });
                    });
                    actions.appendChild(closeBtn);
                }

                li.appendChild(favicon);
                li.appendChild(details);
                li.appendChild(device);
                li.appendChild(actions);

                li.addEventListener('mouseover', () => updateSelection(index));
                li.addEventListener('click', () => {
                    if (item.isRecentlyClosed) {
                        chrome.runtime.sendMessage({ type: 'RESTORE_TAB', sessionId: item.sessionId, url: item.url });
                        closeSpotlight();
                    } else if (item.url) {
                        chrome.tabs.create({ url: item.url, active: true });
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
                        currentResults.splice(selectedIndex, 1);
                        renderResults(currentResults);
                    } else {
                        const li2 = resultsList.getElementsByClassName('result-item')[selectedIndex];
                        if (li2) li2.style.opacity = '';
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

        if (items.length === 0 || !items[0].dataset.url) return;

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
                            console.error("Failed to add favorite:", response.message);
                        }
                    });
                }
            }
        }
    });

    fetchDevices();
    performSearch();
    searchInput.focus();
});

