/**
 * HireMind AI Extension - Background Service Worker (Manifest V3)
 */

const DEFAULT_SERVER_URL = "https://hiremind-smarter-jobs-better-careers.onrender.com";

// In-memory mapping of active tab to application ID
const activeTabAppMap = new Map();
let lastDashboardTabId = null;

/**
 * Get configured server URL from storage
 */
async function getServerUrl() {
  const data = await chrome.storage.local.get(['serverUrl']);
  let url = (data.serverUrl || DEFAULT_SERVER_URL).trim();
  if (url.endsWith('/')) url = url.slice(0, -1);
  return url;
}

/**
 * Get stored JWT auth token
 */
async function getAuthToken() {
  const data = await chrome.storage.local.get(['authToken']);
  return data.authToken || '';
}

/**
 * Handle messages from Content Scripts and Popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  if (action === 'PING') {
    sendResponse({ status: 'ok', version: '1.0.0', installed: true });
    return true;
  }

  if (action === 'SYNC_AUTH') {
    const { token, user, serverUrl } = message;
    const toSet = {};
    if (token) toSet.authToken = token;
    if (user) toSet.currentUser = user;
    if (serverUrl) toSet.serverUrl = serverUrl;

    chrome.storage.local.set(toSet, () => {
      console.log('[HireMind Background] Auth synced successfully');
      sendResponse({ status: 'ok' });
    });
    return true;
  }

  if (action === 'START_APPLY') {
    if (sender.tab && sender.tab.id) {
      lastDashboardTabId = sender.tab.id;
    }
    handleStartApply(message, sendResponse);
    return true;
  }

  if (action === 'FOCUS_DASHBOARD_TAB') {
    handleFocusDashboard(sendResponse);
    return true;
  }

  if (action === 'CLOSE_TAB_AFTER_DELAY') {
    const tabIdToClose = sender.tab ? sender.tab.id : null;
    const delay = message.delayMs || 5000;
    if (tabIdToClose) {
      setTimeout(() => {
        chrome.tabs.get(tabIdToClose, (t) => {
          if (!chrome.runtime.lastError && t) {
            chrome.tabs.remove(tabIdToClose, () => {
              console.log(`[HireMind Background] Closed job tab #${tabIdToClose}`);
            });
          }
        });
      }, delay);
    }
    sendResponse({ status: 'ok', delay });
    return true;
  }

  if (action === 'GET_ACTIVE_APP_FOR_TAB') {
    const tabId = sender.tab ? sender.tab.id : null;
    const appId = tabId ? activeTabAppMap.get(tabId) : null;
    sendResponse({ appId });
    return true;
  }

  if (action === 'GET_EXTENSION_CONTEXT') {
    handleGetContext(message, sender, sendResponse);
    return true;
  }

  if (action === 'LOG_EVENT') {
    handleLogEvent(message, sendResponse);
    return true;
  }

  if (action === 'GENERATE_AI_ANSWER') {
    handleGenerateAIAnswer(message, sendResponse);
    return true;
  }

  if (action === 'UPDATE_APPLICATION_STATUS') {
    handleUpdateStatus(message, sendResponse);
    return true;
  }

  if (action === 'GET_CONFIG') {
    chrome.storage.local.get(['serverUrl', 'authToken', 'currentUser'], (res) => {
      sendResponse({
        serverUrl: res.serverUrl || DEFAULT_SERVER_URL,
        authToken: res.authToken || '',
        currentUser: res.currentUser || null
      });
    });
    return true;
  }

  if (action === 'SET_CONFIG') {
    const { serverUrl, authToken } = message;
    const updates = {};
    if (serverUrl !== undefined) updates.serverUrl = serverUrl;
    if (authToken !== undefined) updates.authToken = authToken;
    chrome.storage.local.set(updates, () => {
      sendResponse({ status: 'ok' });
    });
    return true;
  }

  sendResponse({ status: 'unhandled_action' });
  return true;
});

/**
 * Focus HireMind Dashboard tab
 */
function handleFocusDashboard(sendResponse) {
  if (lastDashboardTabId) {
    chrome.tabs.update(lastDashboardTabId, { active: true }, (tab) => {
      if (!chrome.runtime.lastError && tab) {
        if (sendResponse) sendResponse({ status: 'ok', tabId: lastDashboardTabId });
        return;
      }
      findAndFocusDashboard(sendResponse);
    });
  } else {
    findAndFocusDashboard(sendResponse);
  }
}

function findAndFocusDashboard(sendResponse) {
  chrome.tabs.query({}, (tabs) => {
    const dashboardTab = tabs.find(t => 
      t.url && (t.url.includes('localhost:5173') || t.url.includes('vercel.app') || t.url.includes('/jobs'))
    );
    if (dashboardTab && dashboardTab.id) {
      lastDashboardTabId = dashboardTab.id;
      chrome.tabs.update(dashboardTab.id, { active: true }, () => {
        if (sendResponse) sendResponse({ status: 'ok', tabId: dashboardTab.id });
      });
    } else {
      if (sendResponse) sendResponse({ status: 'not_found' });
    }
  });
}

/**
 * Start apply workflow: opens the job URL in a tab and associates it with appId
 */
async function handleStartApply({ appId, jobUrl, token, serverUrl }, sendResponse) {
  try {
    if (token) {
      await chrome.storage.local.set({ authToken: token });
    }
    if (serverUrl) {
      await chrome.storage.local.set({ serverUrl });
    }

    console.log(`[HireMind Background] Starting native apply for App #${appId} on URL: ${jobUrl}`);

    // Create a new foreground tab for applying
    chrome.tabs.create({ url: jobUrl, active: true }, (tab) => {
      if (tab && tab.id) {
        activeTabAppMap.set(tab.id, appId);
        sendResponse({ status: 'started', tabId: tab.id, appId });
      } else {
        sendResponse({ status: 'error', message: 'Failed to create browser tab.' });
      }
    });
  } catch (err) {
    console.error('[HireMind Background] Start apply error:', err);
    sendResponse({ status: 'error', message: err.message });
  }
}

/**
 * Fetch candidate profile, resume, and job details from backend
 */
async function handleGetContext({ appId }, sender, sendResponse) {
  try {
    const targetAppId = appId || (sender.tab ? activeTabAppMap.get(sender.tab.id) : null);
    if (!targetAppId) {
      return sendResponse({ status: 'error', message: 'No active application ID found for this tab.' });
    }

    const serverUrl = await getServerUrl();
    const token = await getAuthToken();

    const response = await fetch(`${serverUrl}/api/applications/${targetAppId}/extension-context`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return sendResponse({ status: 'error', message: `Backend error (${response.status}): ${errText}` });
    }

    const context = await response.json();
    sendResponse({ status: 'ok', context });
  } catch (err) {
    console.error('[HireMind Background] Get context error:', err);
    sendResponse({ status: 'error', message: err.message });
  }
}

/**
 * Log progress events back to the backend
 */
async function handleLogEvent({ appId, step, progress, statusText, isError }, sendResponse) {
  try {
    const serverUrl = await getServerUrl();
    const token = await getAuthToken();

    const response = await fetch(`${serverUrl}/api/applications/${appId}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({
        step: step || 'Processing',
        progress: progress || 50,
        status_text: statusText || '',
        is_error: !!isError
      })
    });

    const data = await response.json();
    sendResponse({ status: 'ok', data });
  } catch (err) {
    console.warn('[HireMind Background] Log event error:', err);
    sendResponse({ status: 'error', message: err.message });
  }
}

/**
 * Request instant AI answer for screening questions
 */
async function handleGenerateAIAnswer({ appId, question, jobTitle, jobDesc }, sendResponse) {
  try {
    const serverUrl = await getServerUrl();
    const token = await getAuthToken();

    const response = await fetch(`${serverUrl}/api/applications/qa/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({
        question: question || '',
        job_title: jobTitle || 'Software Engineer',
        job_description: jobDesc || '',
        max_words: 50
      })
    });

    if (response.ok) {
      const data = await response.json();
      sendResponse({ status: 'ok', answer: data.answer || '' });
    } else {
      // Fallback to /answer endpoint
      const fallbackRes = await fetch(`${serverUrl}/api/applications/${appId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          question: question,
          answer: ''
        })
      });
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        const latestAns = (fallbackData.answers && fallbackData.answers.length > 0)
          ? fallbackData.answers[fallbackData.answers.length - 1].answer
          : '';
        sendResponse({ status: 'ok', answer: latestAns });
      } else {
        sendResponse({ status: 'error', answer: 'Yes, I have relevant experience in this area.' });
      }
    }
  } catch (err) {
    console.warn('[HireMind Background] AI Answer error:', err);
    sendResponse({ status: 'error', answer: 'Yes, I have extensive hands-on experience matching these requirements.' });
  }
}

/**
 * Update application status on completion
 */
async function handleUpdateStatus({ appId, status, notes }, sendResponse) {
  try {
    const serverUrl = await getServerUrl();
    const token = await getAuthToken();

    const response = await fetch(`${serverUrl}/api/applications/${appId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({
        status: status || 'Applied',
        notes: notes || ''
      })
    });

    const data = await response.json();
    sendResponse({ status: 'ok', data });
  } catch (err) {
    console.error('[HireMind Background] Status update error:', err);
    sendResponse({ status: 'error', message: err.message });
  }
}

// Clean up closed tabs from active mapping
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeTabAppMap.has(tabId)) {
    activeTabAppMap.delete(tabId);
  }
});
