/**
 * HireMind Extension - Naukri.com Native DOM Automator
 * Runs directly in the user's logged-in browser session.
 */

(async function () {
  console.log('[HireMind Naukri] Script loaded on:', window.location.href);

  // Check if this tab is part of an active application task
  async function checkAndTriggerAutomation(forcedAppId = null) {
    let targetAppId = forcedAppId;

    if (!targetAppId) {
      const { appId } = await HireMindCommon.sendMessage('GET_ACTIVE_APP_FOR_TAB');
      targetAppId = appId;
    }

    if (!targetAppId) {
      const urlParams = new URLSearchParams(window.location.search);
      targetAppId = urlParams.get('hiremind_app_id');
    }

    if (!targetAppId) {
      console.log('[HireMind Naukri] Passive page view (no active HireMind apply task).');
      return;
    }

    console.log(`[HireMind Naukri] Activating automation for App ID: ${targetAppId}`);

    // Fetch full context from backend
    let job = { title: document.title.split('-')[0].trim() || 'Software Engineer', company: 'Naukri Employer' };
    let candidate = { full_name: 'Candidate', experience_years: 2, notice_period: 'Immediate (within 15 days)', expected_ctc: 'Negotiable', location: 'India' };
    let resume_data = {};

    try {
      const contextRes = await HireMindCommon.sendMessage('GET_EXTENSION_CONTEXT', { appId: targetAppId });
      if (contextRes?.status === 'ok' && contextRes.context) {
        job = contextRes.context.job || job;
        candidate = contextRes.context.candidate || candidate;
        resume_data = contextRes.context.resume_data || resume_data;
      }
    } catch (e) {
      console.warn('[HireMind Naukri] Context fetch fallback used:', e);
    }

    // Render floating status widget
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
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'START_APPLY_NOW') {
      checkAndTriggerAutomation(msg.appId || 'manual_tab');
      sendResponse({ status: 'started' });
    }
  });

  // Automatically check on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => checkAndTriggerAutomation());
  } else {
    checkAndTriggerAutomation();
  }
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

  // Case B: Job Expired
  if (pageState.type === 'expired') {
    console.log('[HireMind] Job is expired on Naukri.');
    updateWidget('Job Expired', 100, 'This job posting has expired on Naukri.');
    await HireMindCommon.logStep(appId, 'Job Expired', 100, `Listing for '${job.title}' is expired on Naukri.`);
    await HireMindCommon.updateStatus(appId, 'Dismissed', 'Job expired on Naukri.');
    await HireMindCommon.delay(3000);
    try { await HireMindCommon.sendMessage('FOCUS_DASHBOARD_TAB'); } catch (e) {}
    try { await HireMindCommon.sendMessage('CLOSE_TAB_AFTER_DELAY', { delayMs: 5000 }); } catch (e) {}
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
  updateWidget('Checking Questionnaire', 65, 'Scanning for screening questions / chatbot...');
  const drawerHandled = await handleNaukriChatbot(appId, job, candidate, resumeData, updateWidget);

  if (isNaukriAlreadyApplied()) {
    await finishAndExit(appId, job, updateWidget, 'Successfully applied');
    return;
  }

  // Step 7: Handle Standard Modal Form Fields
  await fillNaukriStandardForm(appId, candidate, resumeData, updateWidget);
  await HireMindCommon.delay(3000);

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
          return t === 'opportunities' || t === 'view all';
        });
        if (oppTab) {
          console.log('[HireMind Campus] Clicking Opportunities navigation link...');
          updateWidget('Opening Opportunities', 25, 'Opening Opportunities job feed...');
          await HireMindCommon.humanClick(oppTab);
          await HireMindCommon.delay(3000);
        }
      }
    }

    // 3. Now find the job card to open its detail drawer
    const freshCards = Array.from(document.querySelectorAll('div[class*="card"], [class*="jobCard"], [class*="tuple"], article, div[class*="recommended"] div, .srp-jobtuple-wrapper')).filter(el => {
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

  // Step 3: Dynamic SPA Page Scanner (polls for up to 15s for React/DOM elements to hydrate)
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
  updateWidget('Checking Questionnaire', 65, 'Scanning for screening questions / chatbot...');
  const drawerHandled = await handleNaukriChatbot(appId, job, candidate, resumeData, updateWidget);

  if (isNaukriAlreadyApplied()) {
    await finishAndExit(appId, job, updateWidget, 'Successfully applied');
    return;
  }

  // Step 7: Handle Standard Modal Form Fields
  await fillNaukriStandardForm(appId, candidate, resumeData, updateWidget);
  await HireMindCommon.delay(3000);

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
 * Handle navigation when landing on Naukri Campus homepage or recommended jobs feed
 */
async function navigateToJobFromCampusOrFeed(job, updateWidget) {
  try {
    const currentUrl = window.location.href.toLowerCase();
    const isFeedOrHome = currentUrl.includes('/homepage') || currentUrl.includes('/mnjuser') || currentUrl.includes('/campus') || currentUrl.includes('/recommended');

    if (isFeedOrHome) {
      console.log(`[HireMind Naukri] On Campus/Feed page (${window.location.href}). Finding job...`);

      // 1. Check if any visible job card matches target company or title
      const visibleCards = Array.from(document.querySelectorAll('.card, [class*="card"], [class*="tuple"], article, div[class*="recommended"] div, div[class*="job"]')).filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 50 && r.height > 30;
      });

      const targetTitleTokens = (job.title || '').toLowerCase().split(' ').filter(w => w.length > 2);
      const targetCompTokens = (job.company || '').toLowerCase().split(' ').filter(w => w.length > 2);

      for (const card of visibleCards) {
        const txt = (card.innerText || '').toLowerCase();
        const titleMatches = targetTitleTokens.some(tok => txt.includes(tok));
        const compMatches = targetCompTokens.some(tok => txt.includes(tok));

        if (titleMatches || compMatches) {
          console.log(`[HireMind Naukri] Clicking matching job card on homepage: "${card.innerText.slice(0, 50)}"`);
          updateWidget('Opening Job', 20, `Opening job card for ${job.title}...`);
          await HireMindCommon.humanClick(card);
          await HireMindCommon.delay(3000);
          return true;
        }
      }

      // 2. Use top search input on Campus homepage: "Search jobs here"
      const searchInput = document.querySelector('input[placeholder*="Search jobs"], input[placeholder*="Search"], input[type="search"], input[name="keyword"], .search-input, #qsb-keyskill-sugg, input[type="text"]');
      if (searchInput) {
        console.log(`[HireMind Naukri] Searching for "${job.title}" via top search bar...`);
        updateWidget('Searching Jobs', 20, `Searching for "${job.title}" on Naukri Campus...`);
        await HireMindCommon.humanType(searchInput, job.title);
        await HireMindCommon.delay(600);

        const searchBtn = document.querySelector('button[type="submit"], [class*="searchIcon"], [class*="search-icon"], [class*="searchBtn"], svg[class*="search"]')?.closest('button, span, div[role="button"]') || searchInput;
        
        if (searchBtn && searchBtn !== searchInput) {
          await HireMindCommon.humanClick(searchBtn);
        } else {
          searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }
        await HireMindCommon.delay(3500);
      } else {
        // Fallback: Click "Opportunities" or "View all"
        const oppLink = Array.from(document.querySelectorAll('a, button, span, div[role="button"]')).find(el => {
          const t = (el.innerText || '').trim().toLowerCase();
          return t === 'opportunities' || t === 'view all' || t.includes('recommended jobs');
        });

        if (oppLink) {
          console.log('[HireMind Naukri] Clicking Opportunities / View all...');
          updateWidget('Opening Feed', 20, 'Opening Opportunities job feed...');
          await HireMindCommon.humanClick(oppLink);
          await HireMindCommon.delay(3000);
        }
      }
    }

    // 3. If now on a search results page or job listings feed, select the best matching job card
    const hasJobCards = document.querySelector('.srp-jobtuple-wrapper, .cust-job-tuple, article, [class*="jobTuple"], [class*="tupleWrapper"], [class*="card"]');
    if (hasJobCards) {
      console.log('[HireMind Naukri] Scanning job listing cards on page...');
      updateWidget('Selecting Listing', 22, `Opening listing for ${job.title}...`);

      const cards = Array.from(document.querySelectorAll('.srp-jobtuple-wrapper, .cust-job-tuple, article, [class*="jobTuple"], [class*="tupleWrapper"], [class*="tuple"], div[class*="job-card"]')).filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 50 && r.height > 30;
      });

      if (cards.length > 0) {
        let targetCard = cards[0];
        const targetTokens = ((job.title || '') + ' ' + (job.company || '')).toLowerCase().split(' ').filter(w => w.length > 2);

        for (const card of cards) {
          const txt = (card.innerText || '').toLowerCase();
          if (targetTokens.some(tok => txt.includes(tok))) {
            targetCard = card;
            break;
          }
        }

        // Check if there is an inner Apply / Interested button
        const innerApplyBtn = targetCard.querySelector('button, a, div[role="button"], span[role="button"], [class*="apply"], [class*="btn"]');
        const innerTxt = innerApplyBtn ? (innerApplyBtn.innerText || '').trim().toLowerCase() : '';
        if (innerTxt.includes('apply') || innerTxt.includes('interested')) {
          console.log('[HireMind Naukri] Clicking inner apply button on card:', innerTxt);
          await HireMindCommon.humanClick(innerApplyBtn);
          await HireMindCommon.delay(2500);
          return true;
        }

        // Otherwise click title or card to open the job details view
        const titleLink = targetCard.querySelector('a.title, a.job-title, [class*="title"] a, a') || targetCard;
        console.log('[HireMind Naukri] Clicking job card title to open details...');
        await HireMindCommon.humanClick(titleLink);
        await HireMindCommon.delay(3000);
        return true;
      }
    }
  } catch (err) {
    console.warn('[HireMind Naukri] Feed navigation note:', err);
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

  // Switch back to HireMind dashboard tab
  try {
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
  // 1. Check full page text for specific confirmation phrases
  const bodyText = document.body ? (document.body.innerText || document.body.textContent || '').toLowerCase() : '';
  if (
    bodyText.includes('already applied') || 
    bodyText.includes('application sent') || 
    bodyText.includes('applied on') || 
    bodyText.includes('you have applied') ||
    bodyText.includes('application submitted') ||
    bodyText.includes('successfully applied')
  ) {
    return true;
  }

  // 2. Check all visible elements on the page for exact word 'applied'
  const allElements = Array.from(document.querySelectorAll('*'));
  for (const el of allElements) {
    const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
    
    // Ignore long text paragraphs or the word 'applicants'
    if (txt === 'applied' || txt === 'already applied' || txt === 'application sent' || txt.startsWith('applied on')) {
      return true;
    }

    // Direct text node match
    const directText = Array.from(el.childNodes)
      .filter(n => n.nodeType === 3)
      .map(n => n.nodeValue.trim().toLowerCase())
      .filter(Boolean)
      .join(' ');

    if (directText === 'applied' || directText === 'already applied') {
      return true;
    }

    // Class name match
    const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
    if (
      cls.includes('applied-btn') || 
      cls.includes('appliedtext') || 
      cls.includes('appliedbadge') || 
      cls === 'applied' ||
      cls.includes('applied_btn') ||
      cls.includes('isapplied')
    ) {
      if (!txt.includes('applicant') && !txt.includes('application fee')) {
        return true;
      }
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
 * Find Naukri direct apply button
 */
function findNaukriApplyButton() {
  const allElements = Array.from(
    document.querySelectorAll('button, a, div[role="button"], span[role="button"], [class*="apply"], [class*="btn"], input[type="button"], input[type="submit"]')
  );

  for (const el of allElements) {
    const txt = (el.innerText || el.textContent || '').trim().toLowerCase();

    // Skip if already applied or company website or save
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
 * Handle Naukri Chatbot Drawer Screening Questionnaire
 */
async function handleNaukriChatbot(appId, job, candidate, resumeData, updateWidget) {
  console.log('[HireMind Naukri] Checking for screening chatbot / questions...');
  
  // Try detecting chatbot drawer or full page questionnaire container
  let container = document.querySelector('.chatbot_Drawer, .chatbot-container, [class*="chatbot_Drawer"], [class*="chatContainer"], [class*="botWrapper"], [role="dialog"], div[class*="drawer"], div[class*="drawer-wrapper"], div[class*="chatbot"]');
  if (!container) {
    // Check if there are screening question elements anywhere on the page
    const hasQuestions = Array.from(document.querySelectorAll('*')).some(el => {
      const t = (el.innerText || '').toLowerCase();
      return (t.includes('kindly answer') || t.includes('relocate to') || t.includes('total experience') || t.includes('notice period')) && el.clientHeight > 0;
    });
    if (hasQuestions) {
      container = document.body;
    }
  }

  if (!container) return false;

  console.log('[HireMind Naukri] Screening container detected! Processing questions...');
  updateWidget('Screening Chatbot', 70, 'Naukri screening bot detected. Answering questions with AI...');
  await HireMindCommon.logStep(appId, 'Screening Bot Detected', 70, 'Screening questionnaire detected. Generating AI answers...');

  for (let turn = 0; turn < 15; turn++) {
    if (isNaukriAlreadyApplied()) {
      console.log('[HireMind Naukri] Already applied during screening questionnaire.');
      return true;
    }

    await HireMindCommon.delay(1000);

    // 1. Locate Question Text
    const allTextEls = Array.from(container.querySelectorAll('p, div, span, h2, h3, h4, h5, label')).filter(el => {
      const t = (el.innerText || '').trim();
      const tLower = t.toLowerCase();
      if (t.length < 5 || t.length > 250) return false;
      if (tLower.includes('grievance') || tLower.includes('terms') || tLower.includes('privacy') || tLower.includes('copyright') || tLower.includes('thank you for showing')) return false;
      return t.includes('?') || tLower.includes('experience') || tLower.includes('relocate') || tLower.includes('living in') || tLower.includes('salary') || tLower.includes('notice') || tLower.includes('skills');
    });

    const questionText = allTextEls.length > 0 ? (allTextEls[allTextEls.length - 1].innerText || '').trim() : 'Recruiter Screening Question';
    const qLower = questionText.toLowerCase();

    updateWidget('AI Answering', Math.min(72 + turn * 3, 90), `Q: "${questionText.slice(0, 45)}..."`);
    await HireMindCommon.logStep(appId, 'AI Analyzing Question', Math.min(72 + turn * 3, 90), `Question (${turn + 1}): '${questionText}'`);

    // 2. Check for Radio / Option Buttons (e.g. Yes / No, Relocation, Full Time)
    const radioElements = Array.from(container.querySelectorAll('label, div[class*="radio"], span[class*="radio"], [class*="option"], [class*="choice"], input[type="radio"], button[class*="chip"]')).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 10 && r.height > 10;
    });

    let handledInThisTurn = false;

    if (radioElements.length > 0) {
      console.log(`[HireMind Naukri] Found ${radioElements.length} option/radio elements.`);
      // Priority 1: Affirmative matches ("Yes", "Immediate", "Full Time", "Authorized", "Ready")
      let targetOption = null;
      for (const opt of radioElements) {
        const optText = (opt.innerText || opt.textContent || '').trim().toLowerCase();
        if (optText === 'yes' || optText.startsWith('yes') || optText.includes('immediate') || optText.includes('full time') || optText.includes('authorized') || optText.includes('ready')) {
          targetOption = opt;
          break;
        }
      }

      if (!targetOption) {
        targetOption = radioElements[0];
      }

      console.log(`[HireMind Naukri] Clicking radio option: "${targetOption.innerText || 'Selected'}"`);
      await HireMindCommon.humanClick(targetOption);
      await HireMindCommon.delay(800);
      handledInThisTurn = true;
    }

    // 3. Check for Text Input Fields (Experience, CTC, Notice Period, Custom Answer)
    const textInput = container.querySelector('input[type="text"], input[type="number"], input:not([type]), textarea, div[contenteditable="true"]');
    if (textInput && textInput.offsetParent !== null) {
      let answer = '';
      if (qLower.includes('experience') || qLower.includes('years')) {
        answer = `${candidate.experience_years || 2}`;
      } else if (qLower.includes('notice') || qLower.includes('how soon')) {
        answer = candidate.notice_period || 'Immediate / 15 days';
      } else if (qLower.includes('ctc') || qLower.includes('salary')) {
        answer = candidate.expected_ctc || 'Negotiable';
      } else if (qLower.includes('location') || qLower.includes('city') || qLower.includes('residing') || qLower.includes('relocate')) {
        answer = candidate.location || 'Bangalore, India';
      } else {
        answer = await HireMindCommon.askAI(appId, questionText, job.title, job.description);
        if (!answer || answer.length < 2) {
          answer = 'Yes, I have hands-on experience and skills matching this requirement.';
        }
      }

      console.log(`[HireMind Naukri] Typing answer: "${answer}"`);
      await HireMindCommon.humanType(textInput, answer);
      await HireMindCommon.delay(600);
      handledInThisTurn = true;
    }

    // 4. CRITICAL: Click the "Save" / "Submit" / "Send" / "Next" Action Button
    await HireMindCommon.delay(500);
    const actionBtns = Array.from(document.querySelectorAll('button, input[type="submit"], div[role="button"], span[role="button"], a[class*="btn"]')).filter(b => {
      const r = b.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const txt = (b.innerText || b.textContent || b.value || '').trim().toLowerCase();
      return txt === 'save' || txt === 'submit' || txt === 'send' || txt === 'next' || txt === 'continue' || txt === 'apply' || txt.includes('save') || txt.includes('submit');
    });

    if (actionBtns.length > 0) {
      // Click the deepest / last save button (usually inside the drawer)
      const saveBtn = actionBtns[actionBtns.length - 1];
      const btnTxt = (saveBtn.innerText || saveBtn.value || 'Save').trim();
      console.log(`[HireMind Naukri] Clicking screening action button: "${btnTxt}"`);
      await HireMindCommon.humanClick(saveBtn);
      await HireMindCommon.delay(1800);
    } else if (textInput) {
      textInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      await HireMindCommon.delay(1500);
    }

    if (!handledInThisTurn && actionBtns.length === 0) {
      console.log('[HireMind Naukri] No more active inputs or save buttons found in screening drawer.');
      break;
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
    return txt === 'submit' || txt === 'apply now' || txt === 'save & continue' || txt === 'send application';
  });

  if (submitBtn) {
    updateWidget('Submitting', 95, 'Submitting application...');
    await HireMindCommon.logStep(appId, 'Finalizing Submission', 95, 'Clicking Submit application button...');
    await HireMindCommon.humanClick(submitBtn);
    await HireMindCommon.delay(2000);
  }
}

/**
 * Floating glassmorphic widget to show live status on page
 */
function createStatusWidget(jobTitle, company) {
  const div = document.createElement('div');
  div.id = 'hiremind-extension-widget';
  div.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
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
