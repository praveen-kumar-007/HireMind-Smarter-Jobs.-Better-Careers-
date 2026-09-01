/**
 * HireMind Extension - Popup Controller
 */

const PROD_URL = "https://hiremind-smarter-jobs-better-careers.onrender.com";
const LOCAL_URL = "http://localhost:8000";

document.addEventListener('DOMContentLoaded', async () => {
  const connectionBadge = document.getElementById('connection-badge');
  const connectionText = document.getElementById('connection-text');
  const userNameEl = document.getElementById('user-name');
  const userEmailEl = document.getElementById('user-email');
  const userAvatarEl = document.getElementById('user-avatar');
  const serverUrlInput = document.getElementById('server-url-input');
  const quickUrlInput = document.getElementById('quick-url-input');
  const quickApplyBtn = document.getElementById('quick-apply-btn');
  const toggleSettingsBtn = document.getElementById('toggle-settings-btn');
  const settingsDrawer = document.getElementById('settings-drawer');
  const setProdBtn = document.getElementById('set-prod-btn');
  const setLocalBtn = document.getElementById('set-local-btn');
  const saveServerBtn = document.getElementById('save-server-btn');
  const openDashboardBtn = document.getElementById('open-dashboard-btn');

  // Load config
  chrome.runtime.sendMessage({ action: 'GET_CONFIG' }, (res) => {
    const serverUrl = res?.serverUrl || PROD_URL;
    serverUrlInput.value = serverUrl;

    if (res?.currentUser) {
      const u = res.currentUser;
      userNameEl.innerText = u.profile?.full_name || u.email.split('@')[0];
      userEmailEl.innerText = u.email;
      userAvatarEl.innerText = (userNameEl.innerText[0] || 'U').toUpperCase();
    } else if (res?.authToken) {
      userNameEl.innerText = 'HireMind User';
      userEmailEl.innerText = 'Authenticated via Web App';
      userAvatarEl.innerText = '✓';
    } else {
      userNameEl.innerText = 'Not Synced';
      userEmailEl.innerText = 'Open HireMind web app to connect';
      userAvatarEl.innerText = '?';
    }

    checkServerConnection(serverUrl, res?.authToken);
  });

  // Toggle settings drawer
  toggleSettingsBtn.addEventListener('click', () => {
    settingsDrawer.classList.toggle('hidden');
  });

  // Preset buttons
  setProdBtn.addEventListener('click', () => {
    serverUrlInput.value = PROD_URL;
  });

  setLocalBtn.addEventListener('click', () => {
    serverUrlInput.value = LOCAL_URL;
  });

  // Save server setting
  saveServerBtn.addEventListener('click', () => {
    const val = serverUrlInput.value.trim();
    chrome.runtime.sendMessage({ action: 'SET_CONFIG', serverUrl: val }, () => {
      saveServerBtn.innerText = 'Saved!';
      setTimeout(() => { saveServerBtn.innerText = 'Save'; }, 1500);
      checkServerConnection(val);
    });
  });

  // Active Tab Detection
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      if (activeTab && activeTab.url && activeTab.url.includes('naukri.com')) {
        const activeCard = document.getElementById('active-tab-card');
        const activeBtn = document.getElementById('active-apply-btn');
        if (activeCard && activeBtn) {
          activeCard.classList.remove('hidden');
          activeBtn.addEventListener('click', () => {
            activeBtn.innerText = '⚡ Initiating Apply...';
            activeBtn.disabled = true;
            chrome.tabs.sendMessage(activeTab.id, {
              action: 'START_APPLY_NOW',
              appId: 'popup_active_' + Date.now()
            }, () => {
              window.close();
            });
          });
        }
      }
    });
  } catch (e) {}

  // Quick Apply
  quickApplyBtn.addEventListener('click', async () => {
    const url = quickUrlInput.value.trim();
    if (!url) return;

    quickApplyBtn.disabled = true;
    quickApplyBtn.innerText = 'Launching...';

    const appId = 'quick_' + Date.now();
    chrome.runtime.sendMessage({
      action: 'START_APPLY',
      appId,
      jobUrl: url
    }, () => {
      quickApplyBtn.disabled = false;
      quickApplyBtn.innerText = 'Apply';
      quickUrlInput.value = '';
    });
  });

  // Open Web App Dashboard
  openDashboardBtn.addEventListener('click', async () => {
    const res = await new Promise(r => chrome.runtime.sendMessage({ action: 'GET_CONFIG' }, r));
    const url = res?.serverUrl?.includes('localhost')
      ? 'http://localhost:5173'
      : 'https://hire-mind-praveen.vercel.app';
    chrome.tabs.create({ url, active: true });
  });

  async function checkServerConnection(serverUrl, token) {
    try {
      connectionText.innerText = 'Checking...';
      const cleanUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
      const res = await fetch(`${cleanUrl}/api/jobs?limit=1`, {
        method: 'GET',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (res.ok || res.status === 401 || res.status === 403) {
        connectionBadge.className = 'status-indicator status-online';
        connectionText.innerText = 'Connected';
      } else {
        connectionBadge.className = 'status-indicator status-offline';
        connectionText.innerText = 'Server Error';
      }
    } catch (e) {
      connectionBadge.className = 'status-indicator status-offline';
      connectionText.innerText = 'Offline';
    }
  }
});
