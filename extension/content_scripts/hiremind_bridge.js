/**
 * HireMind Extension Bridge
 * Injected into HireMind Web App pages to facilitate direct 1-click communication.
 */

(function () {
  function isExtensionValid() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  if (!isExtensionValid()) return;

  // Expose installation indicator in DOM
  window.__HIREMIND_EXTENSION_INSTALLED__ = true;
  document.documentElement.setAttribute('data-hiremind-extension', 'true');

  function notifyReady() {
    window.postMessage({
      type: 'HIREMIND_EXTENSION_READY',
      version: '1.0.0',
      installed: true
    }, '*');
  }

  notifyReady();
  window.addEventListener('DOMContentLoaded', notifyReady);
  window.addEventListener('load', notifyReady);

  // Listen for actions dispatched by HireMind web UI
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || !event.data.type) return;

    const { type, appId, job, token, serverUrl, user } = event.data;

    if (type === 'HIREMIND_PING') {
      window.postMessage({
        type: 'HIREMIND_PONG',
        installed: isExtensionValid(),
        version: '1.0.0'
      }, '*');
      return;
    }

    if (!isExtensionValid()) {
      if (type === 'HIREMIND_START_APPLY') {
        window.postMessage({
          type: 'HIREMIND_APPLY_ACK',
          appId,
          status: 'error',
          error: 'Extension was reloaded. Please refresh this page (Press F5) to reconnect.'
        }, '*');
      }
      return;
    }

    if (type === 'HIREMIND_SYNC_AUTH') {
      try {
        chrome.runtime.sendMessage({
          action: 'SYNC_AUTH',
          token,
          user,
          serverUrl: serverUrl || window.location.origin
        }, () => {
          if (chrome.runtime?.lastError) {}
        });
      } catch (e) {}
      return;
    }

    if (type === 'HIREMIND_START_APPLY') {
      try {
        chrome.runtime.sendMessage({
          action: 'START_APPLY',
          appId,
          jobUrl: job?.url || '',
          token,
          serverUrl: serverUrl || window.location.origin
        }, (response) => {
          if (chrome.runtime?.lastError) {
            window.postMessage({
              type: 'HIREMIND_APPLY_ACK',
              appId,
              status: 'error',
              error: chrome.runtime.lastError.message
            }, '*');
            return;
          }
          window.postMessage({
            type: 'HIREMIND_APPLY_ACK',
            appId,
            status: response?.status || 'started',
            response
          }, '*');
        });
      } catch (err) {
        window.postMessage({
          type: 'HIREMIND_APPLY_ACK',
          appId,
          status: 'error',
          error: err ? err.message : 'Failed to send message to extension'
        }, '*');
      }
    }
  });
})();
