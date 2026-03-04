(function () {
  const DEFAULT_APP_ID = 'com.tablicate.host';

  const hasNativeMessaging = () =>
    typeof chrome !== 'undefined' &&
    chrome.runtime &&
    typeof chrome.runtime.sendNativeMessage === 'function';

  const getNativeAppId = async () => {
    try {
      const result = await chrome.storage.sync.get(['nativeBridgeAppId']);
      return result.nativeBridgeAppId || DEFAULT_APP_ID;
    } catch {
      return DEFAULT_APP_ID;
    }
  };

  const send = async (type, payload = {}) => {
    if (!hasNativeMessaging()) {
      return { status: 'unavailable', reason: 'nativeMessagingNotSupported' };
    }

    const appId = await getNativeAppId();
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendNativeMessage(
          appId,
          { type, payload, source: 'tablicate-safari-extension', version: 1 },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({
                status: 'error',
                reason: 'nativeMessagingError',
                message: chrome.runtime.lastError.message,
              });
              return;
            }
            resolve(response || { status: 'ok' });
          }
        );
      } catch (error) {
        resolve({
          status: 'error',
          reason: 'nativeMessagingException',
          message: error?.message || String(error),
        });
      }
    });
  };

  const getRecentlyClosed = async (maxResults = 50) => {
    const response = await send('GET_RECENTLY_CLOSED', { maxResults });
    if (response?.status !== 'ok' || !Array.isArray(response.items)) return [];
    return response.items;
  };

  const restoreTab = async ({ sessionId, url }) => {
    const response = await send('RESTORE_TAB', { sessionId, url });
    if (response?.status === 'ok') return { status: 'success' };
    return {
      status: 'error',
      message: response?.message || 'Native restore failed',
    };
  };

  const openShortcutsPreferences = async () => {
    return send('OPEN_SHORTCUTS_PREFERENCES');
  };

  self.TablicateNativeBridge = {
    DEFAULT_APP_ID,
    hasNativeMessaging,
    send,
    getRecentlyClosed,
    restoreTab,
    openShortcutsPreferences,
  };
})();
