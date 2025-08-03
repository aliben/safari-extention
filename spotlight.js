
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const resultsList = document.getElementById('results-list');
    const container = document.getElementById('spotlight-container');

    let selectedIndex = 0;
    let currentResults = [];

    function closeSpotlight() {
        window.parent.postMessage({ type: 'CLOSE_SPOTLIGHT' }, '*');
    }

    function performSearch() {
        const query = searchInput.value;
        chrome.runtime.sendMessage({ type: 'SEARCH_TABS', query }, renderResults);
    }
    
    function renderResults(results) {
        resultsList.innerHTML = '';
        selectedIndex = -1;
        currentResults = results || [];

        if (currentResults.length > 0) {
            currentResults.forEach((tab, index) => {
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
                title.textContent = tab.title;
                
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
                    chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: tab.url });
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

    searchInput.addEventListener('input', performSearch);

    searchInput.addEventListener('keydown', (e) => {
        const items = resultsList.getElementsByClassName('result-item');
        if (e.key === 'Escape') {
            closeSpotlight();
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

    performSearch();
    searchInput.focus();
});
