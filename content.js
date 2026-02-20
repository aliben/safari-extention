
(() => {
  const IFRAME_ID = 'tabsync-spotlight-iframe';
  let isSpotlightVisible = false;

  function toggleSpotlight() {
    const existingIframe = document.getElementById(IFRAME_ID);
    if (existingIframe) {
      existingIframe.remove();
      document.body.style.overflow = '';
      isSpotlightVisible = false;
    } else {
      const iframe = document.createElement('iframe');
      iframe.id = IFRAME_ID;
      iframe.src = chrome.runtime.getURL('spotlight.html');
      iframe.style.position = 'fixed';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.style.zIndex = '2147483647'; // Max z-index
      iframe.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
      
      document.body.appendChild(iframe);
      document.body.style.overflow = 'hidden';
      
      iframe.onload = () => {
        iframe.contentWindow.focus();
      };
      isSpotlightVisible = true;
    }
  }

  // Listen for messages from the background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'TOGGLE_SPOTLIGHT') {
      toggleSpotlight();
      sendResponse({ status: 'done' });
    } else if (request.type === 'TRIGGER_FAVORITE') {
        const iframe = document.getElementById(IFRAME_ID);
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'ADD_TO_FAVORITES_COMMAND' }, '*');
        }
    } else if (request.type === 'SYNC_COMPLETE') {
        const iframe = document.getElementById(IFRAME_ID);
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'SYNC_COMPLETE' }, '*');
        }
        sendResponse({ status: 'done' });
    }
    return true;
  });

  // Listen for messages from the iframe
  window.addEventListener('message', (event) => {
    // Basic security check
    const iframe = document.getElementById(IFRAME_ID);
    if (!iframe || event.source !== iframe.contentWindow) {
      return;
    }

    if (event.data.type === 'CLOSE_SPOTLIGHT') {
      if (iframe) {
        iframe.remove();
        document.body.style.overflow = '';
        isSpotlightVisible = false;
      }
    } else if (event.data.type === 'COPY_TEXT') {
        if (event.data.text) {
            navigator.clipboard.writeText(event.data.text).then(() => {
                // Optionally send confirmation back to iframe
                event.source.postMessage({ type: 'COPY_SUCCESS' }, event.origin);
            }).catch(err => console.error('Failed to copy text:', err));
        }
    }
  });

})();
