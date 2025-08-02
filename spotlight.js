
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const resultsList = document.getElementById('results-list');
    const container = document.getElementById('spotlight-container');
    const searchPill = document.getElementById('search-pill');
    const deviceFilterList = document.getElementById('device-filter-list');
    const sortContainer = document.getElementById('sort-container');

    let selectedIndex = 0;
    let searchMode = 'tabs'; // 'tabs' or 'favorites'
    let sortBy = 'timestamp'; // 'timestamp', 'alpha-asc', 'alpha-desc'
    let selectedDeviceIds = new Set();
    let initialLoad = true;
    let currentResults = []; // Cache current results
    
    const ICONS = {
        computer: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"></path></svg>`,
        phone: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"></rect><path d="M12 18h.01"></path></svg>`,
    };

    function closeSpotlight() {
        window.parent.postMessage({ type: 'CLOSE_SPOTLIGHT' }, '*');
    }

    function performSearch() {
        let query = searchInput.value;
        
        if (searchMode === 'favorites') {
            const finalQuery = query.replace(/^(f|favorite)\s*/i, '');
            chrome.runtime.sendMessage({ type: 'SEARCH_FAVORITES', query: finalQuery }, renderResults);
        } else {
            chrome.runtime.sendMessage({ type: 'SEARCH_TABS', query: query, deviceIds: Array.from(selectedDeviceIds), sortBy: sortBy }, renderResults);
        }
    }
    
    function renderResults(results) {
        resultsList.innerHTML = '';
        selectedIndex = -1;
        currentResults = results || [];

        if (currentResults.length > 0) {
            initialLoad = false; // Data has been received
            currentResults.forEach((tab, index) => {
                const li = document.createElement('li');
                li.className = 'result-item';
                li.dataset.url = tab.url;
                li.dataset.index = index; // Store index for later retrieval

                const favicon = document.createElement('img');
                favicon.className = 'favicon';
                favicon.src = tab.faviconUrl || 'images/icon16.png';
                favicon.onerror = () => { favicon.src = 'images/icon16.png'; };

                const details = document.createElement('div');
                details.className = 'result-details';
                
                const title = document.createElement('div');
                title.className = 'result-title';
                 if (tab.isFavorite) {
                    title.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="favorite-icon"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> <span>${tab.title}</span>`;
                } else {
                    title.textContent = tab.title;
                }
                
                const url = document.createElement('div');
                url.className = 'result-url';
                url.textContent = tab.url;

                details.appendChild(title);
                details.appendChild(url);
                
                const device = document.createElement('span');
                device.className = 'result-device';
                device.textContent = tab.deviceName || 'Favorite';

                li.appendChild(favicon);
                li.appendChild(details);
                 if (tab.deviceName || searchMode === 'favorites') {
                    li.appendChild(device);
                }

                li.addEventListener('mouseover', () => {
                    updateSelection(index);
                });

                li.addEventListener('click', () => {
                    chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: tab.url });
                    closeSpotlight();
                });

                resultsList.appendChild(li);
            });
            updateSelection(0);
        } else if (initialLoad) {
             // If this is the first load and we get no results, try again shortly.
             setTimeout(() => {
                if (initialLoad) { // check again in case a previous timeout succeeded
                    initialize();
                }
             }, 750);
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

    function showFeedback(itemElement, text) {
        const feedbackEl = document.createElement('div');
        feedbackEl.className = 'copied-feedback'; // Re-use the same style
        feedbackEl.textContent = text;
        itemElement.appendChild(feedbackEl);
        setTimeout(() => {
            feedbackEl.remove();
        }, 1000);
    }

    function switchToFavoritesMode() {
        searchMode = 'favorites';
        searchPill.innerHTML = `Favorites <span class="close-pill"><svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122.88 122.88"><path fill="currentColor" fill-rule="evenodd" d="M61.44,0A61.44,61.44,0,1,1,0,61.44,61.44,61.44,0,0,1,61.44,0ZM74.58,36.8c1.74-1.77,2.83-3.18,5-1l7,7.13c2.29,2.26,2.17,3.58,0,5.69L73.33,61.83,86.08,74.58c1.77,1.74,3.18,2.83,1,5l-7.13,7c-2.26,2.29-3.58,2.17-5.68,0L61.44,73.72,48.63,86.53c-2.1,2.15-3.42,2.27-5.68,0l-7.13-7c-2.2-2.15-.79-3.24,1-5l12.73-12.7L36.35,48.64c-2.15-2.11-2.27-3.43,0-5.69l7-7.13c2.15-2.2,3.24-.79,5,1L61.44,49.94,74.58,36.8Z"/></svg></span>`;
        searchPill.classList.remove('hidden');
        searchInput.placeholder = "Search your favorites...";
        searchInput.value = '';
        searchInput.focus();
        
        const closePillBtn = searchPill.querySelector('.close-pill');
        closePillBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            switchToTabsMode();
            performSearch();
        });
        document.getElementById('device-filter-container').style.display = 'none';
        sortContainer.style.display = 'none';
    }

    function switchToTabsMode() {
        searchMode = 'tabs';
        searchPill.classList.add('hidden');
        searchInput.placeholder = "Search tabs or type f + space for favorites...";
        searchInput.focus();
        document.getElementById('device-filter-container').style.display = 'block';
        sortContainer.style.display = 'flex';
    }


    searchInput.addEventListener('input', () => {
        const value = searchInput.value.toLowerCase();
        if (searchMode === 'tabs' && (value.startsWith('f ') || value.startsWith('favorite '))) {
            switchToFavoritesMode();
            performSearch(); // Immediately search for all favorites
        } else {
            performSearch();
        }
    });

    searchInput.addEventListener('keydown', (e) => {
        const items = resultsList.getElementsByClassName('result-item');

        if (e.key === 'Escape') {
            closeSpotlight();
            return;
        }

        if (e.key === 'Backspace' && searchInput.value === '' && searchMode === 'favorites') {
            e.preventDefault();
            switchToTabsMode();
            performSearch();
            return;
        }

        if (e.key === 'c' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (selectedIndex > -1 && items[selectedIndex]) {
                const urlToCopy = items[selectedIndex].dataset.url;
                if (urlToCopy) {
                    // Send message to parent (content script) to copy text
                    window.parent.postMessage({ type: 'COPY_TEXT', text: urlToCopy }, '*');
                }
            }
            return;
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
        }
    });
    
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            closeSpotlight();
        }
    });
    
    async function handleAddToFavorites() {
        if (selectedIndex < 0 || selectedIndex >= currentResults.length) return;

        const tab = currentResults[selectedIndex];
        const itemElement = resultsList.children[selectedIndex];
        
        if (tab.isFavorite) {
            showFeedback(itemElement, 'Already a Favorite!');
            return;
        }

        console.log('Attempting to add favorite for tab:', tab);

        try {
            const { userId, apiUrl } = await chrome.storage.sync.get(['userId', 'apiUrl']);
            console.log('Retrieved from storage:', { userId, apiUrl });

            if (!userId || !apiUrl) {
                console.error('Login information (userId or apiUrl) is missing.');
                showFeedback(itemElement, 'Login Required');
                return;
            }

            const favoritePayload = {
                tabs: [{ ...tab, timestamp: Date.now() }],
                userId: userId
            };
            console.log('Sending payload to backend:', JSON.stringify(favoritePayload, null, 2));

            const response = await fetch(new URL('/api/favorites', apiUrl).href, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(favoritePayload),
            });

            console.log('Backend response status:', response.status);

            if (response.ok) {
                showFeedback(itemElement, 'Favorited!');
                tab.isFavorite = true; // Update local state
                const titleEl = itemElement.querySelector('.result-title');
                if (titleEl) {
                    titleEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="favorite-icon"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> <span>${tab.title}</span>`;
                }
            } else {
                 const errorData = await response.json().catch(() => ({ message: 'Could not parse error response.' }));
                 console.error('Failed to add favorite. Server responded with:', response.status, errorData);
                 showFeedback(itemElement, `Error: ${errorData.message || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('An unexpected error occurred while adding favorite:', err);
            showFeedback(itemElement, 'Error!');
        }
    }


    // Listen for messages from content script or background
    window.addEventListener('message', (event) => {
        const items = resultsList.getElementsByClassName('result-item');
        if (event.data.type === 'COPY_SUCCESS') {
            if (selectedIndex > -1 && items[selectedIndex]) {
                showFeedback(items[selectedIndex], 'Copied!');
            }
        } else if (event.data.type === 'ADD_TO_FAVORITES_COMMAND') {
            handleAddToFavorites();
        }
    });

    function renderDeviceFilters(devices) {
        deviceFilterList.innerHTML = '';
        devices.sort((a, b) => a.name.localeCompare(b.name)).forEach(device => {
            const pill = document.createElement('div');
            pill.className = 'device-pill';
            pill.dataset.deviceId = device.id;
            const icon = ICONS[device.type] || ICONS['computer'];
            pill.innerHTML = `
                ${icon}
                <span>${device.name}</span>
                <span class="tab-count">${device.count}</span>
            `;
            pill.addEventListener('click', () => {
                if (selectedDeviceIds.has(device.id)) {
                    selectedDeviceIds.delete(device.id);
                    pill.classList.remove('selected');
                } else {
                    selectedDeviceIds.add(device.id);
                    pill.classList.add('selected');
                }
                performSearch();
            });
            deviceFilterList.appendChild(pill);
        });
    }

    const sortButtons = sortContainer.querySelectorAll('.sort-button');
    sortButtons.forEach(button => {
        button.addEventListener('click', () => {
            const currentSort = button.dataset.sort;
            
            // Toggle alpha sort
            if (currentSort === 'alpha') {
                if (sortBy === 'alpha-asc') {
                    sortBy = 'alpha-desc';
                    // Optional: change icon to indicate descending
                } else {
                    sortBy = 'alpha-asc';
                    // Optional: change icon to indicate ascending
                }
            } else {
                 sortBy = 'timestamp';
            }
            
            // Update active class
            sortButtons.forEach(btn => btn.classList.remove('active'));
            if (sortBy.startsWith('alpha')) {
                sortContainer.querySelector('[data-sort="alpha"]').classList.add('active');
            } else {
                sortContainer.querySelector('[data-sort="timestamp"]').classList.add('active');
            }

            performSearch();
        });
    });

    // Initial setup
    function initialize() {
        searchInput.focus();
        chrome.runtime.sendMessage({ type: 'GET_DEVICES' }, (devices) => {
            if (devices && devices.length > 0) {
                initialLoad = false; // Data received
                renderDeviceFilters(devices);
            }
        });
        performSearch();
    }
    
    initialize();
});
