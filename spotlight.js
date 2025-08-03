
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const resultsList = document.getElementById('results-list');
    const container = document.getElementById('spotlight-container');
    const deviceFilterList = document.getElementById('device-filter-list');
    const sortContainer = document.getElementById('sort-container');
    const searchPill = document.getElementById('search-pill');

    let selectedIndex = 0;
    let currentResults = [];
    let currentDevices = [];
    let selectedDeviceId = 'all';
    let currentSort = 'timestamp';
    let currentSearchScope = 'all'; // 'all' or 'favorites'

    function closeSpotlight() {
        window.parent.postMessage({ type: 'CLOSE_SPOTLIGHT' }, '*');
    }

    function performSearch() {
        const query = searchInput.value;
        chrome.runtime.sendMessage({ type: 'SEARCH_TABS', query, searchScope: currentSearchScope }, (allResults) => {
            renderResults(allResults);
        });
    }

    function fetchDevices() {
        if (currentSearchScope === 'favorites') {
            deviceFilterList.innerHTML = '';
            return;
        };
        chrome.runtime.sendMessage({ type: 'GET_DEVICES' }, (devices) => {
            if (devices && devices.length > 0) {
                currentDevices = devices;
                renderDeviceFilters();
            }
        });
    }
    
    function renderDeviceFilters() {
        deviceFilterList.innerHTML = '';

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
            // Simplified icon logic for now, can be expanded
            icon.textContent = device.type === 'phone' ? '📱' : '💻';

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

    function updateSearchPill() {
        if (currentSearchScope === 'favorites') {
            searchPill.textContent = ''; // Clear previous content
            
            const text = document.createTextNode('Favorites ');
            const closeButton = document.createElement('span');
            closeButton.className = 'close-pill';
            closeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            closeButton.onclick = (e) => {
                e.stopPropagation();
                setSearchScope('all');
            };
            
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
        updateSearchPill();
        fetchDevices();
        performSearch();
        searchInput.focus();
    }


    function renderResults(results) {
        resultsList.innerHTML = '';
        currentResults = results || [];
        
        let filteredResults = currentResults;
        if (selectedDeviceId !== 'all' && currentSearchScope !== 'favorites') {
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
            filteredResults.forEach((tab, index) => {
                const li = document.createElement('li');
                li.className = 'result-item';
                li.dataset.url = tab.url;
                li.dataset.index = index;

                const favicon = document.createElement('img');
                favicon.className = 'favicon';
                favicon.src = tab.faviconUrl || 'images/icon16.png';
                favicon.onerror = () => { favicon.src = 'images/icon16.png'; };

                const details = document.createElement('div');
                details.className = 'result-details';
                
                const title = document.createElement('div');
                title.className = 'result-title';
                
                if (tab.isFavorite) {
                    const star = document.createElement('span');
                    star.className = 'favorite-icon';
                    star.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
                    title.appendChild(star);
                }

                const titleText = document.createElement('span');
                titleText.textContent = tab.title || "No Title";
                title.appendChild(titleText);
                
                const url = document.createElement('div');
                url.className = 'result-url';
                url.textContent = tab.url;

                details.appendChild(title);
                details.appendChild(url);
                
                const device = document.createElement('span');
                device.className = 'result-device';
                device.textContent = tab.deviceName || 'Unknown';

                li.appendChild(favicon);
                li.appendChild(details);
                li.appendChild(device);

                li.addEventListener('mouseover', () => updateSelection(index));
                li.addEventListener('click', () => {
                    chrome.tabs.create({ url: tab.url, active: true });
                    closeSpotlight();
                });

                resultsList.appendChild(li);
            });
            updateSelection(0);
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
        if (searchInput.value === 'f ') {
            setSearchScope('favorites');
            return;
        }
        performSearch();
    });


    searchInput.addEventListener('keydown', (e) => {
        const items = resultsList.getElementsByClassName('result-item');
        if (e.key === 'Escape') {
            closeSpotlight();
            return;
        }
        
        if (e.key === 'Backspace' && searchInput.value === '') {
            if (currentSearchScope === 'favorites') {
                setSearchScope('all');
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

    
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            closeSpotlight();
        }
    });

    window.addEventListener('message', (event) => {
        // Handle adding a favorite via shortcut
        if (event.data.type === 'ADD_TO_FAVORITES_COMMAND') {
            const items = resultsList.getElementsByClassName('result-item');
            if (selectedIndex > -1 && items[selectedIndex]) {
                const url = items[selectedIndex].dataset.url;
                // Find the tab data to send to the backend
                const tabData = currentResults.find(t => t.url === url);
                if (tabData) {
                    // This is a simplified "add" - ideally this would call a proper API.
                    // For now, we'll just log it. A full implementation would require
                    // sending a message to the background script to call the /api/favorites endpoint.
                    console.log("Favoriting via shortcut:", tabData.title);
                    
                    // Add visual feedback
                    const titleDiv = items[selectedIndex].querySelector('.result-title');
                    if (titleDiv && !titleDiv.querySelector('.favorite-icon')) {
                         const star = document.createElement('span');
                         star.className = 'favorite-icon';
                         star.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
                         titleDiv.prepend(star);
                    }
                }
            }
        }
    });

    fetchDevices();
    performSearch();
    searchInput.focus();
});

