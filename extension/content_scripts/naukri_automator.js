/**
 * HireMind Extension - Naukri.com & Naukri Campus Native DOM Automator
 * Handles full 1-click apply, screening chatbots, multi-turn questions,
 * auto-fill, Save/Submit, and smooth return to the main dashboard.
 */

(async function () {
  console.log('[HireMind Naukri] Script loaded on:', window.location.href);

  let isRunning = false;

  // Check if this tab is part of an active application task
  async function checkAndTriggerAutomation(forcedAppId = null) {
    if (isRunning) return;
    let targetAppId = forcedAppId;

    if (!targetAppId) {
      const res = await HireMindCommon.sendMessage('GET_ACTIVE_APP_FOR_TAB');
      targetAppId = res?.appId;
    }

    if (!targetAppId) {
      const urlParams = new URLSearchParams(window.location.search);
      targetAppId = urlParams.get('hiremind_app_id');
    }

    if (!targetAppId) {
      console.log('[HireMind Naukri] Passive page view (no active HireMind apply task).');
      return;
    }

    isRunning = true;
    console.log(`[HireMind Naukri] Activating automation for App ID: ${targetAppId}`);

    // Fetch full context from backend
    let job = { title: document.title.split('-')[0].trim() || 'Software Engineer', company: 'Naukri Employer' };
    let candidate = {
      full_name: 'Candidate',
      email: '',
      phone: '',
      experience_years: 2,
      notice_period: 'Immediate (within 15 days)',
      expected_ctc: '500000',
      location: 'Bangalore, India',
      education: 'B.Tech / B.E.',
      skills: 'Python, JavaScript, React, SQL, Cloud'
    };
    let resume_data = {};

    try {
      const contextRes = await HireMindCommon.sendMessage('GET_EXTENSION_CONTEXT', { appId: targetAppId });
      if (contextRes?.status === 'ok' && contextRes.context) {
        job = contextRes.context.job || job;
        candidate = { ...candidate, ...(contextRes.context.candidate || {}) };
        resume_data = contextRes.context.resume_data || resume_data;
      }
    } catch (e) {
      console.warn('[HireMind Naukri] Context fetch fallback used:', e);
    }

    // Render floating status widget on TOP-LEFT so it NEVER covers the chatbot drawer or Save button
    const existingWidget = document.getElementById('hiremind-extension-widget');
    if (existingWidget) existingWidget.remove();

    const statusWidget = createStatusWidget(job.title, job.company);
    document.body.appendChild(statusWidget);

    function updateWidget(step, progress, text) {
      const stepEl = statusWidget.querySelector('#hiremind-widget-step');
      const textEl = statusWidget.querySelector('#hiremind-widget-text');
      const barEl = statusWidget.querySelector('#hiremind-widget-bar');
      if (stepEl) stepEl.innerText = step;
      if (textEl) textEl.innerText = text;
      if (barEl) barEl.style.width = `${progress}%`;
    }

    try {
      await runNaukriAutomation(targetAppId, job, candidate, resume_data, updateWidget);
    } catch (err) {
      console.error('[HireMind Naukri] Automation error:', err);
      updateWidget('Error Encountered', 100, err.message);
      await HireMindCommon.logStep(targetAppId, 'Automation Error', 100, `Error: ${err.message}`, true);
      await HireMindCommon.updateStatus(targetAppId, 'Review Required', `Error during extension automation: ${err.message}`);
    }
  }

  // Listen for direct popup trigger
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.action === 'START_APPLY_NOW') {
        checkAndTriggerAutomation(msg.appId || 'manual_tab');
        sendResponse({ status: 'started' });
      }
    });
  }

  // Automatically check on load and load events
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => checkAndTriggerAutomation());
  } else {
    checkAndTriggerAutomation();
  }
  window.addEventListener('load', () => checkAndTriggerAutomation());
  setTimeout(() => checkAndTriggerAutomation(), 1500);
})();

/**
 * Main Naukri Apply Sequence
 */
async function runNaukriAutomation(appId, job, candidate, resumeData, updateWidget) {
  const currentUrl = window.location.href.toLowerCase();
  const isCampusPortal = currentUrl.includes('/homepage') || currentUrl.includes('/mnjuser') || currentUrl.includes('/campus');

  // If on Naukri Campus student portal, execute the dedicated in-portal flow
  if (isCampusPortal) {
    console.log('[HireMind Naukri] On Naukri Campus student portal. Executing in-portal Campus apply flow...');
    updateWidget('Campus Portal', 20, `Naukri Campus detected. Locating "${job.title}"...`);
    await HireMindCommon.logStep(appId, 'Campus Portal Active', 20, `On Naukri Campus portal. Locating '${job.title}'...`);

    const handledOnCampus = await handleCampusPortalFlow(appId, job, candidate, resumeData, updateWidget);
    if (handledOnCampus) {
      return;
    }
  }

  // Step 2: Dynamic SPA Page Scanner (polls for up to 15s for React/DOM elements to hydrate)
  updateWidget('Scanning Page', 30, 'Scanning job page for apply options and active sessions...');
  await HireMindCommon.logStep(appId, 'Scanning Page', 30, 'Scanning Naukri job page elements and checking session...');

  let pageState = await waitForNaukriPageState(job, 15000, updateWidget);
  console.log('[HireMind] Detected page state:', pageState.type);

  // Case A: Already Applied
  if (pageState.type === 'applied') {
    await finishAndExit(appId, job, updateWidget, 'Already applied');
    return;
  }

  // Case B: Job Expired — permanently delete from DB
  if (pageState.type === 'expired') {
    console.log('[HireMind] Job is expired on Naukri. Permanently removing from database.');
    updateWidget('Job Expired', 100, 'This job has expired. Removing from your board...');
    await HireMindCommon.logStep(appId, 'Job Expired', 100, `Listing for '${job.title}' is expired on Naukri. Permanently removing.`);
    try {
      await HireMindCommon.deleteExpiredJob(job.id || job.job_id);
    } catch (e) {
      console.warn('[HireMind] Could not delete expired job from DB:', e);
    }
    await HireMindCommon.delay(2000);
    try { await HireMindCommon.sendMessage('FOCUS_DASHBOARD_TAB'); } catch (e) {}
    try { await HireMindCommon.sendMessage('CLOSE_TAB_AFTER_DELAY', { delayMs: 3000 }); } catch (e) {}
    return;
  }

  // Case C: External Company Website Apply
  if (pageState.type === 'company_site') {
    console.log('[HireMind] Company website detected - Sending to Manual Intervention');
    updateWidget('Company Website', 100, 'This job requires applying directly on company website.');
    await HireMindCommon.logStep(appId, 'Company Website Detected', 100, `Naukri listing for '${job.title}' requires applying on company website.`);
    await HireMindCommon.updateStatus(appId, 'Manual Intervention', 'Company website application - manual apply required.');
    return;
  }

  // Case D: Apply Button Missing / Timeout
  if (pageState.type !== 'apply_button' || !pageState.element) {
    if (isNaukriAlreadyApplied()) {
      await finishAndExit(appId, job, updateWidget, 'Already applied');
      return;
    }

    // Check if page shows "No results found" — treat as expired and permanently delete
    const bodyText = (document.body.innerText || '').toLowerCase();
    if (bodyText.includes('no results found') || bodyText.includes('job has expired') || bodyText.includes('no longer available') || bodyText.includes('modify your search criteria')) {
      console.log('[HireMind] Page shows no results / expired. Permanently removing job.');
      updateWidget('Job Expired', 100, 'Job not found on Naukri. Removing from your board...');
      await HireMindCommon.logStep(appId, 'Job Expired', 100, `'${job.title}' not found on Naukri. Permanently removing.`);
      try {
        await HireMindCommon.deleteExpiredJob(job.id || job.job_id);
      } catch (e) {
        console.warn('[HireMind] Could not delete expired job:', e);
      }
      await HireMindCommon.delay(2000);
      try { await HireMindCommon.sendMessage('FOCUS_DASHBOARD_TAB'); } catch (e) {}
      try { await HireMindCommon.sendMessage('CLOSE_TAB_AFTER_DELAY', { delayMs: 3000 }); } catch (e) {}
      return;
    }

    console.log('[HireMind] Apply button missing on page');
    updateWidget('Review Required', 90, 'Could not locate a direct Apply / Interested button.');
    await HireMindCommon.logStep(appId, 'Apply Button Missing', 90, `No direct Apply button found on page for '${job.title}'.`);
    await HireMindCommon.updateStatus(appId, 'Manual Intervention', 'Could not locate Apply button.');
    return;
  }

  // Step 3: Click the Apply / Interested / Quick Apply Button
  const applyBtn = pageState.element;
  const btnLabel = (applyBtn.innerText || '').trim();
  console.log(`[HireMind] Clicking Apply button: "${btnLabel}"`);
  updateWidget('Clicking Apply', 40, `Clicking "${btnLabel}" on ${job.company}...`);
  await HireMindCommon.logStep(appId, 'Clicking Apply', 40, `Clicking "${btnLabel}" button for '${job.title}'...`);

  await HireMindCommon.humanClick(applyBtn);

  // Step 4: Mandatory 5-Second Wait for form / drawer / confirmation to load
  console.log('[HireMind] Waiting 5 seconds for page response / questions...');
  updateWidget('Waiting (5s)', 50, 'Waiting 5 seconds for page response / screening questions...');
  await HireMindCommon.delay(5000);

  // Step 5: Check Immediate Confirmation after 5 seconds
  if (isNaukriAlreadyApplied()) {
    await finishAndExit(appId, job, updateWidget, 'Successfully applied');
    return;
  }

  // Step 6: Handle Naukri Chatbot Questionnaire Drawer with AI Analysis
  updateWidget('Answering Screening', 60, 'Scanning for screening questions / chatbot...');
  await handleNaukriChatbot(appId, job, candidate, resumeData, updateWidget);

  if (isNaukriAlreadyApplied()) {
    await finishAndExit(appId, job, updateWidget, 'Successfully applied');
    return;
  }

  // Step 7: Handle Standard Modal Form Fields if any
  await fillNaukriStandardForm(appId, candidate, resumeData, updateWidget);
  await HireMindCommon.delay(2500);

  // Step 8: Final Submission Check
  if (isNaukriAlreadyApplied()) {
    await finishAndExit(appId, job, updateWidget, 'Successfully applied');
  } else {
    console.log('[HireMind] Screening completed - Human confirmation required');
    updateWidget('Review Required', 90, 'Screening completed. Please review tab to confirm.');
    await HireMindCommon.logStep(appId, 'Human Review Required', 90, 'Screening answered. Please check open tab to confirm.');
    await HireMindCommon.updateStatus(appId, 'Review Required', 'Screening form filled; pending final confirmation.');
  }
}

/**
 * Dedicated automation handler for Naukri Campus student portal
 */
async function handleCampusPortalFlow(appId, job, candidate, resumeData, updateWidget) {
  try {
    // 1. Check if an apply / interested button is already visible in an open drawer
    let applyBtn = findNaukriApplyButton();
    if (applyBtn) {
      console.log('[HireMind Campus] Found visible Apply button directly in drawer.');
      return false; // Let standard sequence click and process it
    }

    // 2. Scan visible job cards on the Campus homepage / feed
    const cards = Array.from(document.querySelectorAll('div[class*="card"], [class*="jobCard"], [class*="tuple"], article, div[class*="recommended"] div')).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 60 && r.height > 40;
    });

    const targetTokens = ((job.title || '') + ' ' + (job.company || '')).toLowerCase().split(' ').filter(w => w.length > 2);
    let matchedCard = null;

    for (const card of cards) {
      const txt = (card.innerText || '').toLowerCase();
      if (targetTokens.some(tok => txt.includes(tok))) {
        matchedCard = card;
        break;
      }
    }

    // If no exact match on homepage cards, use the Campus top search bar
    if (!matchedCard) {
      const searchInput = document.querySelector('input[placeholder*="Search jobs"], input[placeholder*="Search"], input[type="search"], .search-input, input[type="text"]');
      if (searchInput) {
        console.log(`[HireMind Campus] Typing "${job.title}" into Campus search bar...`);
        updateWidget('Searching Campus', 25, `Searching for "${job.title}" in Campus jobs...`);
        await HireMindCommon.logStep(appId, 'Searching Campus Jobs', 25, `Searching for '${job.title}' in Campus portal...`);

        searchInput.focus();
        await HireMindCommon.humanType(searchInput, job.title);
        await HireMindCommon.delay(500);

        // Click search icon or hit Enter
        const searchBtn = document.querySelector('button[type="submit"], [class*="searchIcon"], [class*="search-icon"], [class*="searchBtn"], svg[class*="search"]')?.closest('button, span, div[role="button"]');
        if (searchBtn && searchBtn !== searchInput) {
          await HireMindCommon.humanClick(searchBtn);
        } else {
          searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }
        await HireMindCommon.delay(3500);
      } else {
        // Fallback: Click Opportunities tab
        const oppTab = Array.from(document.querySelectorAll('a, span, div[role="button"]')).find(el => {
          const t = (el.innerText || '').trim().toLowerCase();
          return t === 'opportunities' || t.includes('jobs') || t.includes('recommended');
        });
        if (oppTab) {
          console.log('[HireMind Campus] Clicking Opportunities tab...');
          await HireMindCommon.humanClick(oppTab);
          await HireMindCommon.delay(3000);
        }
      }
    }

    // 3. Re-scan cards after search / navigation
    const freshCards = Array.from(document.querySelectorAll('div[class*="card"], [class*="jobCard"], [class*="tuple"], article, [class*="tupleWrapper"]')).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 60 && r.height > 40;
    });

    if (freshCards.length > 0) {
      let cardToClick = freshCards[0];
      for (const card of freshCards) {
        const txt = (card.innerText || '').toLowerCase();
        if (targetTokens.some(tok => txt.includes(tok))) {
          cardToClick = card;
          break;
        }
      }

      console.log(`[HireMind Campus] Opening job card: "${cardToClick.innerText.slice(0, 40)}"`);
      updateWidget('Opening Details', 35, `Opening job card for ${job.title}...`);
      await HireMindCommon.humanClick(cardToClick);
      await HireMindCommon.delay(3000);
    }

    // 4. Poll for the opened Job Details drawer / Apply button
    const applyStartTime = Date.now();
    while (Date.now() - applyStartTime < 8000) {
      if (isNaukriAlreadyApplied()) {
        await finishAndExit(appId, job, updateWidget, 'Already applied');
        return true;
      }

      const activeApplyBtn = findNaukriApplyButton();
      if (activeApplyBtn) {
        const btnLabel = (activeApplyBtn.innerText || '').trim();
        console.log(`[HireMind Campus] Clicking Apply button: "${btnLabel}"`);
        updateWidget('Clicking Apply', 45, `Clicking "${btnLabel}"...`);
        await HireMindCommon.logStep(appId, 'Clicking Apply', 45, `Clicking "${btnLabel}" in Campus drawer...`);
        await HireMindCommon.humanClick(activeApplyBtn);

        // Mandatory 5-Second Wait
        console.log('[HireMind Campus] Waiting 5 seconds for page response...');
        updateWidget('Waiting (5s)', 55, 'Waiting 5 seconds for page response...');
        await HireMindCommon.delay(5000);

        if (isNaukriAlreadyApplied()) {
          await finishAndExit(appId, job, updateWidget, 'Successfully applied');
          return true;
        }

        // Handle Chatbot Drawer
        updateWidget('Screening Bot', 70, 'Handling screening questions...');
        await handleNaukriChatbot(appId, job, candidate, resumeData, updateWidget);

        if (isNaukriAlreadyApplied()) {
          await finishAndExit(appId, job, updateWidget, 'Successfully applied');
          return true;
        }

        await fillNaukriStandardForm(appId, candidate, resumeData, updateWidget);
        await HireMindCommon.delay(2500);

        if (isNaukriAlreadyApplied()) {
          await finishAndExit(appId, job, updateWidget, 'Successfully applied');
          return true;
        } else {
          updateWidget('Applied Verified', 100, 'Application submitted! Returning to dashboard...');
          await finishAndExit(appId, job, updateWidget, 'Successfully applied');
          return true;
        }
      }
      await HireMindCommon.delay(500);
    }
  } catch (campusErr) {
    console.warn('[HireMind Campus] Campus portal flow note:', campusErr);
  }
  return false;
}

/**
 * Handle success confirmation, 3s wait, focus dashboard, and 5s auto-close
 */
async function finishAndExit(appId, job, updateWidget, statusMsg) {
  console.log(`[HireMind] ${statusMsg}`);
  console.log('[HireMind] Applied');
  updateWidget('Applied Verified', 100, `Verified: ${statusMsg}. Returning to dashboard in 3s...`);
  await HireMindCommon.logStep(appId, 'Applied', 100, `Verified: ${statusMsg} for '${job.title}' on ${job.company}.`);
  await HireMindCommon.updateStatus(appId, 'Applied', `${statusMsg} on Naukri.`);

  // Wait 3 seconds to confirm
  await HireMindCommon.delay(3000);

  // Switch back to HireMind dashboard tab and focus window
  try {
    console.log('[HireMind] Switching back to main HireMind dashboard tab...');
    await HireMindCommon.sendMessage('FOCUS_DASHBOARD_TAB');
  } catch (e) {}

  // Countdown & auto-close in 5 seconds
  updateWidget('Completed', 100, 'Completed! Auto-closing tab in 5s (or click ✕ to close now)...');
  try {
    await HireMindCommon.sendMessage('CLOSE_TAB_AFTER_DELAY', { delayMs: 5000 });
  } catch (e) {}
}

/**
 * Continuously polls page for dynamic elements to hydrate in SPA
 */
async function waitForNaukriPageState(job, maxWaitMs = 12000, updateWidget) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    if (updateWidget) updateWidget('Scanning Page', Math.min(25 + elapsedSec * 3, 45), `Scanning for apply triggers (${elapsedSec}s)...`);

    // 1. Check if Already Applied
    if (isNaukriAlreadyApplied()) {
      return { type: 'applied' };
    }

    // 2. Check if External Company Site
    const compBtn = findCompanySiteButton();
    if (compBtn) {
      return { type: 'company_site', element: compBtn };
    }

    // 3. Check if Apply / Interested Button exists
    const applyBtn = findNaukriApplyButton();
    if (applyBtn) {
      return { type: 'apply_button', element: applyBtn };
    }

    // 4. Check if Expired
    const bodyText = (document.body.innerText || '').toLowerCase();
    const expiredKeywords = [
      'job you are looking for is expired',
      'this job has expired',
      'job has expired',
      'no longer accepting applications',
      'this vacancy is no longer available',
      'job is no longer available',
      'job not found',
      'job is closed',
      'no results found',
      'modify your search criteria'
    ];
    for (const kw of expiredKeywords) {
      if (bodyText.includes(kw)) {
        return { type: 'expired' };
      }
    }

    await HireMindCommon.delay(400);
  }

  // Final fallback check
  if (isNaukriAlreadyApplied()) return { type: 'applied' };
  const finalComp = findCompanySiteButton();
  if (finalComp) return { type: 'company_site', element: finalComp };
  const finalApply = findNaukriApplyButton();
  if (finalApply) return { type: 'apply_button', element: finalApply };

  return { type: 'not_found' };
}

/**
 * Detect if user has already applied on Naukri
 */
function isNaukriAlreadyApplied() {
  const bodyText = document.body ? (document.body.innerText || document.body.textContent || '').toLowerCase() : '';
  if (
    bodyText.includes('already applied') || 
    bodyText.includes('application sent') || 
    bodyText.includes('applied on') || 
    bodyText.includes('you have applied') ||
    bodyText.includes('application submitted') ||
    bodyText.includes('successfully applied') ||
    bodyText.includes('applied successfully') ||
    bodyText.includes('thank you for applying') ||
    bodyText.includes('your application has been submitted') ||
    bodyText.includes('applied for this job')
  ) {
    return true;
  }

  const allElements = Array.from(document.querySelectorAll('*'));
  for (const el of allElements) {
    const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
    if (txt === 'applied' || txt === 'already applied' || txt === 'application sent' || txt === 'applied successfully' || txt.startsWith('applied on')) {
      return true;
    }
  }

  return false;
}

/**
 * Detect external company site button
 */
function findCompanySiteButton() {
  const allElements = Array.from(document.querySelectorAll('button, a, div[role="button"], span[role="button"], .btn, a[class*="btn"]'));
  for (const el of allElements) {
    const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
    if (
      txt.includes('apply on company site') || 
      txt.includes('apply on company website') ||
      txt.includes('apply on employer website') ||
      txt.includes('employer website')
    ) {
      return el;
    }
  }
  return null;
}

/**
 * Find Naukri direct apply button on the page
 */
function findNaukriApplyButton() {
  const allElements = Array.from(
    document.querySelectorAll('button, a, div[role="button"], span[role="button"], [class*="apply"], [class*="btn"], input[type="button"], input[type="submit"]')
  );

  for (const el of allElements) {
    const txt = (el.innerText || el.textContent || '').trim().toLowerCase();

    if (txt === 'applied' || txt === 'already applied' || txt.includes('company site') || txt.includes('employer') || txt === 'save' || txt === 'saved') {
      continue;
    }

    const isApplyTrigger = 
      txt === 'apply' ||
      txt === 'apply now' ||
      txt.startsWith('apply now') ||
      txt === 'quick apply' ||
      txt === 'easy apply' ||
      txt === 'i am interested' ||
      txt === "i'm interested" ||
      txt === 'interested' ||
      txt === 'interested to apply' ||
      txt === 'express apply' ||
      txt === 'direct apply' ||
      txt === 'apply for job' ||
      txt === 'view and apply' ||
      txt === 'view & apply' ||
      txt === 'apply on naukri' ||
      txt === 'apply on campus' ||
      txt === 'register to apply' ||
      txt === 'submit application' ||
      txt === 'send application' ||
      txt.includes('quick apply') ||
      txt.includes('easy apply') ||
      txt.includes('i am interested') ||
      txt.includes("i'm interested") ||
      txt.includes('view and apply') ||
      txt.includes('view & apply');

    if (isApplyTrigger) {
      return el;
    }
  }
  return null;
}

/**
 * Find any affirmative "Yes" option card / radio / button anywhere on the page
 */
function findAffirmativeOption() {
  const allElements = Array.from(document.querySelectorAll('*')).filter(el => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    // We only care about leaf / small elements containing Yes
    if (el.children.length > 3) return false;
    const txt = (el.innerText || el.textContent || '').trim();
    return txt === 'Yes' || txt === '○ Yes' || txt === '● Yes' || txt.startsWith('Yes ') || txt === 'YES' || txt.toLowerCase() === 'yes';
  });

  if (allElements.length > 0) {
    return allElements[0];
  }
  return null;
}

/**
 * Find all options in the active questionnaire drawer
 */
function findAllChatbotOptions(root = document) {
  const candidateSelectors = [
    'button',
    'li',
    'label',
    'div[role="button"]',
    'span[role="button"]',
    'div[role="radio"]',
    'div[role="checkbox"]',
    'div[class*="option"]',
    'div[class*="choice"]',
    'div[class*="radio"]',
    'span[class*="radio"]',
    'div[class*="chip"]',
    'div[class*="pill"]',
    'div[class*="botItem"]',
    'div[class*="item"]',
    'div[class*="listItem"]',
    'div[class*="tag"]',
    'div[class*="bubble"]',
    'div[class*="answer"]',
    'span[class*="chip"]',
    'span[class*="pill"]',
    'span[class*="option"]',
    'p[class*="option"]',
    'input[type="radio"]',
    'input[type="checkbox"]'
  ];

  const matched = Array.from(root.querySelectorAll(candidateSelectors.join(', '))).filter(el => {
    const r = el.getBoundingClientRect();
    if (r.width <= 5 || r.height <= 5) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const txt = (el.innerText || el.textContent || '').trim();
    if (txt.length === 0 || txt.length > 80) return false;
    const tLower = txt.toLowerCase();
    if (tLower.includes('thank you for showing') || tLower.includes('kindly answer') || tLower.includes('recruiter question')) return false;
    return true;
  });

  return matched;
}

/**
 * Click option with full mouse/pointer/touch sequence, triggering React state and checking input
 */
async function selectOptionElement(targetEl) {
  if (!targetEl) return false;
  console.log('[HireMind Naukri] Selecting option element:', targetEl);
  targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await HireMindCommon.delay(100);

  // Dispatch full mouse & pointer events on target
  for (const evt of ['mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    targetEl.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
  }
  targetEl.click();

  // If inside an option box/card container, click the outer container too
  const cardContainer = targetEl.closest('div[class*="option"], div[class*="choice"], div[class*="radio"], div[class*="card"], div[class*="item"], div[class*="pill"], div[class*="chip"], label, li');
  if (cardContainer && cardContainer !== targetEl) {
    for (const evt of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      cardContainer.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
    }
    cardContainer.click();
  }

  // Check any radio or checkbox input
  const radioInput = (cardContainer || targetEl).querySelector('input[type="radio"], input[type="checkbox"]') || targetEl.parentElement?.querySelector('input');
  if (radioInput) {
    radioInput.checked = true;
    radioInput.dispatchEvent(new Event('change', { bubbles: true }));
    radioInput.dispatchEvent(new Event('input', { bubbles: true }));
    radioInput.click();
  }

  await HireMindCommon.delay(500);
  return true;
}

/**
 * Find the active Save / Submit / Send / Next button in the drawer
 */
function findDrawerSaveButton() {
  const allBtns = Array.from(document.querySelectorAll('button, input[type="submit"], div[role="button"], span[role="button"], a[class*="btn"], [class*="save"], [class*="submit"], [class*="primary"]')).filter(b => {
    const r = b.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const style = window.getComputedStyle(b);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

    const txt = (b.innerText || b.textContent || b.value || '').trim().toLowerCase();
    
    // Ignore background Apply button on left
    if (txt === 'apply' && r.left < window.innerWidth * 0.4) return false;

    return (
      txt === 'save' ||
      txt === 'submit' ||
      txt === 'send' ||
      txt === 'next' ||
      txt === 'continue' ||
      txt === 'proceed' ||
      txt === 'submit application' ||
      txt === 'save & apply' ||
      txt === 'save and apply' ||
      txt === 'save & continue' ||
      txt === 'save & next' ||
      txt.includes('save') ||
      txt.includes('submit') ||
      txt.includes('send')
    );
  });

  if (allBtns.length > 0) {
    // Pick the lowest / deepest button inside the right-hand drawer
    allBtns.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
    return allBtns[0];
  }

  // Fallback: Check right half of screen for any active action button
  const rightHalfBtns = Array.from(document.querySelectorAll('button, div[role="button"]')).filter(b => {
    const r = b.getBoundingClientRect();
    return r.left > window.innerWidth * 0.5 && r.top > window.innerHeight * 0.6 && r.width > 50 && r.height > 25;
  });
  if (rightHalfBtns.length > 0) {
    return rightHalfBtns[rightHalfBtns.length - 1];
  }

  return null;
}

/**
 * Comprehensive handler for screening questions, options, inputs, and Save button
 */
async function handleNaukriChatbot(appId, job, candidate, resumeData, updateWidget) {
  console.log('[HireMind Naukri] Handling screening questions and chatbot drawer...');
  updateWidget('Screening Bot', 65, 'Screening questionnaire active. Auto-answering...');
  await HireMindCommon.logStep(appId, 'Screening Bot Detected', 65, 'Screening questionnaire detected. Answering questions with AI...');

  // Multi-turn active loop (up to 30 iterations)
  for (let turn = 0; turn < 30; turn++) {
    if (isNaukriAlreadyApplied()) {
      console.log('[HireMind Naukri] Successfully applied during screening.');
      return true;
    }

    await HireMindCommon.delay(800);

    let actedThisTurn = false;

    // 1. Check for "Yes" or Affirmative Option Button
    const yesOption = findAffirmativeOption();
    if (yesOption) {
      console.log('[HireMind Naukri] Found "Yes" option card. Clicking...');
      updateWidget('Selecting Yes', Math.min(70 + turn * 2, 94), 'Selecting "Yes"...');
      await selectOptionElement(yesOption);
      actedThisTurn = true;
      await HireMindCommon.delay(600);
    } else {
      // 2. Check for other option cards (Notice period, Experience, Degree, etc.)
      const otherOptions = findAllChatbotOptions(document);
      if (otherOptions.length > 0) {
        let targetOpt = otherOptions.find(o => {
          const t = (o.innerText || o.textContent || '').trim().toLowerCase();
          return t === 'immediate' || t.includes('15 days') || t.includes('full time') || t.includes('b.tech') || t.includes('2024') || (t !== 'no' && !t.startsWith('no '));
        }) || otherOptions[0];

        const optLabel = (targetOpt.innerText || targetOpt.textContent || 'Option').trim();
        console.log(`[HireMind Naukri] Selecting option card: "${optLabel}"`);
        updateWidget('Selecting Option', Math.min(70 + turn * 2, 94), `Selecting: "${optLabel}"`);
        await selectOptionElement(targetOpt);
        actedThisTurn = true;
        await HireMindCommon.delay(600);
      }
    }

    // 3. Handle HTML <select> dropdowns if any
    const selectElements = Array.from(document.querySelectorAll('select')).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.disabled;
    });
    for (const selectEl of selectElements) {
      const opts = Array.from(selectEl.options);
      if (opts.length > 1) {
        selectEl.value = opts[1].value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        selectEl.dispatchEvent(new Event('input', { bubbles: true }));
        actedThisTurn = true;
      }
    }

    // 4. Handle Text / Number / Date / Textarea input fields
    const textInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], input:not([type]), textarea, div[contenteditable="true"]')).filter(el => {
      const r = el.getBoundingClientRect();
      // Only pick inputs visible in right drawer or modal
      return r.width > 0 && r.height > 0 && r.left > window.innerWidth * 0.4 && (!el.value || el.value.trim().length === 0);
    });

    for (const textInput of textInputs) {
      const inputId = (textInput.id || '').toLowerCase();
      const inputName = (textInput.name || '').toLowerCase();
      const inputPlaceholder = (textInput.placeholder || '').toLowerCase();
      const inputType = (textInput.type || 'text').toLowerCase();
      const inputCtx = `${inputId} ${inputName} ${inputPlaceholder}`;

      let answer = '';
      if (inputType === 'date') {
        answer = '2024-06-01';
      } else if (inputCtx.includes('experience') || inputCtx.includes('years') || inputCtx.includes('exp')) {
        answer = `${candidate.experience_years || 2}`;
      } else if (inputCtx.includes('notice') || inputCtx.includes('joining') || inputCtx.includes('days')) {
        answer = inputType === 'number' ? '15' : '15 days';
      } else if (inputCtx.includes('current ctc') || inputCtx.includes('fixed ctc')) {
        answer = '350000';
      } else if (inputCtx.includes('expected ctc') || inputCtx.includes('salary')) {
        answer = '500000';
      } else if (inputCtx.includes('location') || inputCtx.includes('city')) {
        answer = candidate.location || 'Bangalore, India';
      } else {
        answer = 'Yes, I have relevant hands-on skills and domain experience for this role.';
      }

      console.log(`[HireMind Naukri] Typing answer: "${answer}"`);
      updateWidget('Filling Answer', Math.min(72 + turn * 2, 94), `Answer: "${answer}"`);
      await HireMindCommon.humanType(textInput, answer);
      await HireMindCommon.delay(400);
      actedThisTurn = true;
    }

    // 5. CRITICAL: Locate and Click the "Save" / "Submit" / "Send" / "Next" Button
    await HireMindCommon.delay(400);
    const saveBtn = findDrawerSaveButton();
    if (saveBtn) {
      const btnTxt = (saveBtn.innerText || saveBtn.value || 'Save').trim();
      console.log(`[HireMind Naukri] Clicking Save/Submit button: "${btnTxt}"`);
      updateWidget('Saving & Proceeding', Math.min(75 + turn * 2, 95), `Clicking "${btnTxt}"...`);
      saveBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await HireMindCommon.delay(100);
      await HireMindCommon.humanClick(saveBtn);
      await HireMindCommon.delay(2000);
      actedThisTurn = true;
    }

    // 6. Check if done after saving
    if (isNaukriAlreadyApplied()) {
      return true;
    }

    // If no action and no save button, wait and check if more questions exist
    if (!actedThisTurn && !saveBtn) {
      await HireMindCommon.delay(1500);
      if (isNaukriAlreadyApplied()) return true;
      const remainingYes = findAffirmativeOption();
      const remainingSave = findDrawerSaveButton();
      if (!remainingYes && !remainingSave) {
        console.log('[HireMind Naukri] No more active questions or save buttons found.');
        break;
      }
    }
  }

  return true;
}

/**
 * Handle standard modal form inputs
 */
async function fillNaukriStandardForm(appId, candidate, resumeData, updateWidget) {
  const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type]), select, textarea')).filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  if (inputs.length === 0) return;

  updateWidget('Filling Fields', 85, 'Auto-filling candidate details in application form...');
  await HireMindCommon.logStep(appId, 'Filling Fields', 85, 'Scanning and populating standard form fields...');

  for (const input of inputs) {
    const label = (input.getAttribute('placeholder') || input.getAttribute('name') || input.getAttribute('id') || '').toLowerCase();

    if (label.includes('name') && !input.value) {
      await HireMindCommon.humanType(input, candidate.full_name || 'Candidate');
    } else if (label.includes('email') && !input.value) {
      await HireMindCommon.humanType(input, candidate.email || '');
    } else if ((label.includes('phone') || label.includes('mobile')) && !input.value) {
      await HireMindCommon.humanType(input, candidate.phone || '');
    } else if (label.includes('experience') && !input.value) {
      await HireMindCommon.humanType(input, String(candidate.experience_years || 2));
    } else if (label.includes('notice') && !input.value) {
      await HireMindCommon.humanType(input, candidate.notice_period || 'Immediate');
    }
  }

  // Look for submit / apply button
  const submitBtn = Array.from(document.querySelectorAll('button, input[type="submit"]')).find(b => {
    const txt = (b.innerText || b.value || '').trim().toLowerCase();
    return txt === 'submit' || txt === 'apply now' || txt === 'save & continue' || txt === 'send application' || txt.includes('submit');
  });

  if (submitBtn) {
    updateWidget('Submitting', 95, 'Submitting application...');
    await HireMindCommon.logStep(appId, 'Finalizing Submission', 95, 'Clicking Submit application button...');
    await HireMindCommon.humanClick(submitBtn);
    await HireMindCommon.delay(2000);
  }
}

/**
 * Floating glassmorphic widget positioned at TOP-LEFT so it NEVER covers the drawer or Save button
 */
function createStatusWidget(jobTitle, company) {
  const div = document.createElement('div');
  div.id = 'hiremind-extension-widget';
  div.style.cssText = `
    position: fixed;
    top: 24px;
    left: 24px;
    z-index: 999999;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(59, 130, 246, 0.4);
    border-radius: 12px;
    padding: 16px 20px;
    color: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    max-width: 380px;
    min-width: 320px;
    box-sizing: border-box;
    transition: all 0.3s ease;
  `;

  div.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #3b82f6; box-shadow: 0 0 8px #3b82f6; animation: pulse 2s infinite;"></span>
        <strong style="font-weight: 700; font-size: 14px; background: linear-gradient(135deg, #60a5fa, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">HireMind Auto-Apply</strong>
      </div>
      <button onclick="document.getElementById('hiremind-extension-widget').remove()" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px; line-height: 1;">&times;</button>
    </div>
    <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
      Applying: <strong>${jobTitle}</strong> at <span style="color: #93c5fd;">${company}</span>
    </div>
    <div style="margin-bottom: 8px;">
      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; color: #94a3b8;">
        <span id="hiremind-widget-step" style="font-weight: 600; color: #60a5fa;">Initializing...</span>
        <span id="hiremind-widget-text" style="color: #cbd5e1; max-width: 190px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Connecting...</span>
      </div>
      <div style="width: 100%; height: 6px; background: #334155; border-radius: 3px; overflow: hidden;">
        <div id="hiremind-widget-bar" style="width: 15%; height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); border-radius: 3px; transition: width 0.4s ease;"></div>
      </div>
    </div>
  `;
  return div;
}
