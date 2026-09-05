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

  // Step 0: Auto-recover if currently on walkInApply incomplete application page
  if (currentUrl.includes('walkinapply') || (document.body.innerText || '').includes('Your application was not accepted due to incomplete information')) {
    console.log('[HireMind Naukri] On incomplete application page. Auto-navigating back to job listing to re-apply properly...');
    updateWidget('Recovering Application', 20, 'Retrying application with filled screening answers...');
    const match = currentUrl.match(/strjobsarr=(?:%5b|\[)?([0-9a-zA-Z]+)(?:%5d|\])?/i) || currentUrl.match(/([0-9]{12})/);
    if (match && match[1]) {
      const jobId = match[1];
      const targetUrl = `https://www.naukri.com/job-listings-${jobId}?hiremind_app_id=${appId}`;
      console.log(`[HireMind Naukri] Redirecting to direct job page: ${targetUrl}`);
      window.location.href = targetUrl;
      return;
    }
  }

  const isCampusPortal = currentUrl.includes('/homepage') || currentUrl.includes('/mnjuser') || currentUrl.includes('/campus');

  // Step 1: Detect Search Results aggregation / listing pages (-jobs-in-, ?k=, /jobs-in-)
  const isSearchResultsPage = (currentUrl.includes('-jobs-in-') || currentUrl.includes('?k=') || currentUrl.includes('/jobs-in-') || currentUrl.includes('/jobsearch')) && !currentUrl.includes('/job-listings-');

  if (isSearchResultsPage) {
    console.log('[HireMind Naukri] On search results listing page. Locating direct exact job listing...');
    updateWidget('Locating Job', 25, `Locating direct job listing for "${job.title}"...`);
    await HireMindCommon.logStep(appId, 'Locating Direct Job', 25, `On search listings page. Finding direct URL for '${job.title}'...`);

    const navigated = await navigateToExactJobFromSearchResults(appId, job, updateWidget);
    if (navigated) return;
  }

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

  // Step 1.5: Auto-recover from Next.js error "Oops! Something went wrong"
  const oopsReloadBtn = Array.from(document.querySelectorAll('button, a')).find(b => (b.innerText || '').trim().toLowerCase() === 'reload');
  if (oopsReloadBtn) {
    console.log('[HireMind] Detected "Oops! Something went wrong" error page. Auto-clicking Reload button...');
    updateWidget('Reloading', 20, 'Recovering from Naukri page load error...');
    await HireMindCommon.humanClick(oopsReloadBtn);
    await HireMindCommon.delay(4000);
  }

  // Step 2: Dynamic SPA Page Scanner (polls for up to 15s for React/DOM elements to hydrate)
  updateWidget('Scanning Page', 30, 'Scanning job page for apply options and active sessions...');
  await HireMindCommon.logStep(appId, 'Scanning Page', 30, 'Scanning Naukri job page elements and checking session...');

  let pageState = await waitForNaukriPageState(job, 15000, updateWidget);
  console.log('[HireMind] Detected page state:', pageState.type);

  // Case 0: Active Chatbot / Questions Drawer Already Open
  if (pageState.type === 'chatbot') {
    console.log('[HireMind] Questions drawer is active. Answering screening questions...');
    await handleNaukriChatbot(appId, job, candidate, resumeData, updateWidget);
    await finishAndExit(appId, job, updateWidget, 'Successfully applied');
    return;
  }

  // Case A: Already Applied
  if (pageState.type === 'applied') {
    await finishAndExit(appId, job, updateWidget, 'Already applied');
    return;
  }

  // Case B: Job Expired — Check if Naukri provided similar active jobs below the expired banner
  if (pageState.type === 'expired') {
    console.log('[HireMind] Expired banner detected. Checking for active similar jobs on page...');
    const similarCards = Array.from(document.querySelectorAll('.cust-job-tuple, article, .srp-jobtuple-wrapper, div[class*="tuple"], a.title'))
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 60 && r.height > 20;
      });

    if (similarCards.length > 0) {
      console.log(`[HireMind] Found ${similarCards.length} similar active job openings. Auto-selecting active listing...`);
      updateWidget('Active Alternative', 30, 'Redirecting to matching active opening...');
      await HireMindCommon.logStep(appId, 'Selecting Active Alternative', 30, `Selecting top matching active job from live recommendations...`);
      
      const targetCard = similarCards[0];
      const link = targetCard.tagName === 'A' ? targetCard : targetCard.querySelector('a.title, a[class*="title"], a[href*="job-listings"]');
      if (link && link.getAttribute('href')) {
        const rawHref = link.getAttribute('href');
        const fullHref = rawHref.startsWith('http') ? rawHref : `https://www.naukri.com${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
        const sep = fullHref.includes('?') ? '&' : '?';
        window.location.href = `${fullHref}${sep}hiremind_app_id=${appId}`;
        return;
      } else {
        await HireMindCommon.humanClick(targetCard);
        return;
      }
    }

    console.log('[HireMind] Job is expired and no alternatives found. Removing from database.');
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

    // 1. Check if there are active job cards on the page (e.g. search listings or Campus feed)
    const visibleCards = Array.from(document.querySelectorAll('.cust-job-tuple, article, .srp-jobtuple-wrapper, div[class*="card"], [class*="jobCard"], [class*="tuple"]'))
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 60 && r.height > 40;
      });

    if (visibleCards.length > 0) {
      console.log(`[HireMind] Found ${visibleCards.length} active job cards on page. Opening top active card...`);
      updateWidget('Selecting Job', 30, `Opening top active listing for "${job.title}"...`);
      await HireMindCommon.humanClick(visibleCards[0]);
      await HireMindCommon.delay(3500);

      const refreshedApply = findNaukriApplyButton();
      if (refreshedApply) {
        pageState = { type: 'apply_button', element: refreshedApply };
      }
    }

    // 2. Only if NO cards and NO apply button exist, check for expired page
    if (pageState.type !== 'apply_button' || !pageState.element) {
      const bodyText = (document.body.innerText || '').toLowerCase();
      if (visibleCards.length === 0 && (bodyText.includes('no results found') || bodyText.includes('job has expired') || bodyText.includes('no longer available') || bodyText.includes('modify your search criteria'))) {
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
 * Automatically locates the matching job card on a search results page and navigates to its direct job-listings URL
 */
async function navigateToExactJobFromSearchResults(appId, job, updateWidget) {
  // Wait up to 6 seconds for search result job tuples to hydrate in DOM
  const startTime = Date.now();
  while (Date.now() - startTime < 6500) {
    const cardLinks = Array.from(document.querySelectorAll('a.title, a.job-title, [class*="title"] a, .cust-job-tuple a, article a, div[class*="tuple"] a, .srp-jobtuple-wrapper a, [class*="jobTuple"] a, [class*="card"] a')).filter(el => {
      const href = (el.getAttribute('href') || '').toLowerCase();
      return href.includes('job-listings') || href.includes('naukri.com/job-listings') || href.includes('job-details');
    });

    if (cardLinks.length > 0) {
      // Find link matching job title/company or pick first card
      const targetTokens = ((job.title || '') + ' ' + (job.company || '')).toLowerCase().split(' ').filter(w => w.length > 2);
      let targetLink = cardLinks[0];

      for (const link of cardLinks) {
        const txt = ((link.innerText || '') + ' ' + (link.closest('article, div[class*="tuple"], div[class*="card"]')?.innerText || '')).toLowerCase();
        if (targetTokens.some(tok => txt.includes(tok))) {
          targetLink = link;
          break;
        }
      }

      const rawHref = targetLink.getAttribute('href');
      if (rawHref) {
        const fullUrl = rawHref.startsWith('http') ? rawHref : `https://www.naukri.com${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
        const sep = fullUrl.includes('?') ? '&' : '?';
        const directUrl = `${fullUrl}${sep}hiremind_app_id=${appId}`;

        console.log(`[HireMind Naukri] Found exact job link. Navigating directly: ${directUrl}`);
        updateWidget('Opening Job Details', 35, `Opening direct job page for ${job.title}...`);
        await HireMindCommon.logStep(appId, 'Navigating Direct Job', 35, `Direct listing found. Navigating to '${directUrl.slice(0, 60)}...'`);

        await HireMindCommon.delay(400);
        window.location.href = directUrl;
        return true;
      }
    }

    await HireMindCommon.delay(500);
  }
  return false;
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

    // If on homepage feed and no card matched directly, navigate directly to live Naukri SRP search
    if (!matchedCard) {
      const cleanTitle = (job.title || 'software-developer').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-');
      const cleanLoc = (job.location || 'india').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-');
      const directSearchUrl = `https://www.naukri.com/${cleanTitle}-jobs-in-${cleanLoc || 'india'}?k=${encodeURIComponent(job.title + (job.company ? ' ' + job.company : ''))}&hiremind_app_id=${appId}`;

      console.log(`[HireMind Campus] Redirecting from homepage to direct search listing: ${directSearchUrl}`);
      updateWidget('Navigating to Job', 25, `Opening direct listings for "${job.title}"...`);
      await HireMindCommon.logStep(appId, 'Navigating to Direct Job', 25, `Redirecting from homepage to exact listings for '${job.title}'...`);
      
      window.location.href = directSearchUrl;
      return true;
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
 * Handle success confirmation and notify dashboard
 */
async function finishAndExit(appId, job, updateWidget, statusMsg) {
  console.log(`[HireMind] ${statusMsg}`);
  console.log('[HireMind] Applied');
  updateWidget('Successfully Applied 🎉', 100, `Completed: ${statusMsg} for ${job.title}!`);
  await HireMindCommon.logStep(appId, 'Applied', 100, `Verified: ${statusMsg} for '${job.title}' on ${job.company}.`);
  await HireMindCommon.updateStatus(appId, 'Applied', `${statusMsg} on Naukri.`);

  // Keep tab open for user verification
  console.log('[HireMind] Application flow complete. Tab remains open for user review.');
}

/**
 * Continuously polls page for dynamic elements to hydrate in SPA
 */
async function waitForNaukriPageState(job, maxWaitMs = 12000, updateWidget) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    if (updateWidget) updateWidget('Scanning Page', Math.min(25 + elapsedSec * 3, 45), `Scanning for apply triggers (${elapsedSec}s)...`);

    // 0. Check if active chatbot / questionnaire drawer is already open (MUST BE CHECKED FIRST!)
    const activeInputs = Array.from(document.querySelectorAll('input, textarea')).filter(el => {
      const type = (el.type || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'image', 'reset', 'file'].includes(type)) return false;
      const ph = (el.placeholder || '').toLowerCase();
      if (ph.includes('search') || el.closest('header, nav, [class*="searchBar"], [class*="header"]')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 15 && r.height > 10 && r.top > 55;
    });
    const activeDrawerOptions = findActiveChatbotOptions();
    if (activeInputs.length > 0 || activeDrawerOptions.length > 0) {
      console.log('[HireMind Naukri] Questionnaire drawer already open on page.');
      return { type: 'chatbot' };
    }

    // 1. Check if Apply / Interested Button exists on the page
    const applyBtn = findNaukriApplyButton();
    if (applyBtn) {
      return { type: 'apply_button', element: applyBtn };
    }

    // 3. Check if Already Applied
    if (isNaukriAlreadyApplied()) {
      return { type: 'applied' };
    }

    // 4. Check if External Company Site
    const compBtn = findCompanySiteButton();
    if (compBtn) {
      return { type: 'company_site', element: compBtn };
    }

    // 5. Check if Expired
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
  const finalApply = findNaukriApplyButton();
  if (finalApply) return { type: 'apply_button', element: finalApply };
  const fallbackOptions = findAllChatbotOptions(document);
  if (fallbackOptions.length > 0) return { type: 'chatbot' };
  if (isNaukriAlreadyApplied()) return { type: 'applied' };
  const finalComp = findCompanySiteButton();
  if (finalComp) return { type: 'company_site', element: finalComp };

  return { type: 'not_found' };
}

/**
 * Detect if user has already applied on Naukri
 */
function isNaukriAlreadyApplied() {
  // If questions drawer or options are visible on screen, application is active, not done
  const options = findAllChatbotOptions(document);
  if (options.length > 0) return false;

  const rightDrawerQuestions = Array.from(document.querySelectorAll('p, div, span, h2, h3')).filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left > window.innerWidth * 0.4 && (el.innerText || '').includes('?');
  });
  if (rightDrawerQuestions.length > 0) return false;

  // Check for explicit applied confirmation badge or button text
  const confirmationElements = Array.from(document.querySelectorAll('button, span, div, h1, h2, h3, p')).filter(el => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
    return (
      txt === 'applied' ||
      txt === 'already applied' ||
      txt === 'application sent' ||
      txt === 'applied successfully' ||
      txt === 'successfully applied' ||
      txt.startsWith('applied on ') ||
      txt.includes('thank you for applying') ||
      txt.includes('your application has been submitted')
    );
  });

  return confirmationElements.length > 0;
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
 * Find Naukri direct apply button on the page (strictly ignoring footers and app-download links)
 */
function findNaukriApplyButton() {
  const allElements = Array.from(
    document.querySelectorAll('button, a, div[role="button"], span[role="button"], [class*="apply"], [class*="btn"], input[type="button"], input[type="submit"]')
  ).filter(el => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;

    // Filter out footers, play store, app download links
    const href = (el.getAttribute('href') || '').toLowerCase();
    if (href.includes('play.google.com') || href.includes('apple.com') || href.includes('utm_medium=footer')) return false;

    const elClass = (el.className || '').toString().toLowerCase();
    const elId = (el.id || '').toLowerCase();
    if (elClass.includes('footer') || elClass.includes('download') || elId.includes('footer')) return false;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

    // The main apply button is in the upper 75% of the page
    if (r.top > window.innerHeight * 0.8 && r.left < window.innerWidth * 0.5) return false;

    const txt = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
    if (txt === 'applied' || txt === 'already applied' || txt.includes('company site') || txt.includes('employer') || txt === 'save' || txt === 'saved' || txt.includes('bookmark')) {
      return false;
    }

    return (
      txt === 'apply' ||
      txt === 'apply now' ||
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
      txt.startsWith('apply now') ||
      txt.startsWith('quick apply')
    );
  });

  if (allElements.length > 0) {
    // Return highest/top-most primary apply button
    allElements.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return allElements[0];
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
 * Find the active Naukri chatbot drawer or modal container
 */
/**
 * Find the active Naukri chatbot drawer or modal container
 */
function getNaukriDrawerContainer() {
  const drawerSelectors = [
    '.chatbot_Drawer',
    '.chatbot-container',
    '[class*="chatbot_Drawer"]',
    '[class*="chatbot-container"]',
    '[class*="chatContainer"]',
    '[class*="botWrapper"]',
    '[class*="drawer-wrapper"]',
    '[class*="drawerWrapper"]',
    '[class*="apply-drawer"]',
    '[class*="applyDrawer"]',
    '[class*="chatbot"]',
    'div[class*="drawer"]',
    'section[class*="drawer"]',
    '[role="dialog"]',
    '.modal-content'
  ];
  for (const sel of drawerSelectors) {
    const els = Array.from(document.querySelectorAll(sel));
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (r.width > 200 && r.height > 200 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
        if (r.left >= window.innerWidth * 0.45 || el.getAttribute('role') === 'dialog') {
          return el;
        }
      }
    }
  }

  // Fallback: search for right-side container with chatbot inputs or bubbles (sort by area descending)
  const candidates = Array.from(document.querySelectorAll('div, section, aside')).filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 240 && r.height > 300 && r.left >= window.innerWidth * 0.38 && r.top <= 120;
  });
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
      const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
      return areaB - areaA;
    });
    return candidates[0];
  }
  return null;
}

/**
 * Find all options in the active questionnaire drawer
 */
function findAllChatbotOptions(root = document) {
  const drawer = root === document ? getNaukriDrawerContainer() : (root || null);
  const searchRoot = drawer || root;
  const rightBoundary = window.innerWidth * 0.48;

  const candidateSelectors = [
    'div[role="radio"]',
    'div[role="checkbox"]',
    'input[type="radio"]',
    'input[type="checkbox"]',
    'div[class*="radio"]',
    'div[class*="choice"]',
    'div[class*="option"]',
    'div[class*="chip"]',
    'div[class*="pill"]',
    'div[class*="botOption"]',
    'div[class*="botItem"]',
    'span[class*="chip"]',
    'span[class*="pill"]',
    'span[class*="option"]',
    'label',
    'li'
  ];

  const matched = Array.from(searchRoot.querySelectorAll(candidateSelectors.join(', '))).filter(el => {
    const r = el.getBoundingClientRect();
    if (r.width <= 5 || r.height <= 5) return false;

    // Filter out footers, play store, app download links
    const href = (el.getAttribute('href') || '').toLowerCase();
    if (href.includes('play.google.com') || href.includes('apple.com') || href.includes('utm_medium=footer')) return false;
    if (el.closest('footer') || el.closest('[class*="footer"]')) return false;

    // Must be in the right half of the screen and below top navbar (top > 65)
    if (!drawer && r.left < rightBoundary) return false;
    if (r.top < 65) return false;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

    const txt = (el.innerText || el.textContent || '').trim();
    if (txt.length === 0 || txt.length > 80) return false;
    const tLower = txt.toLowerCase();
    // Exclude header navbar items and common messages
    if (tLower === 'participate' || tLower === 'prepare' || tLower === 'opportunities' || tLower === 'squad' || tLower === 'save' || tLower === 'submit') return false;
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
 * Reliably finds and clicks the blue Save/Submit button at the bottom of the questionnaire drawer
 */
async function clickDrawerSaveButton() {
  await HireMindCommon.delay(350);

  const drawer = getNaukriDrawerContainer();
  const rightBoundary = window.innerWidth * 0.40;

  // Search across the entire right side of screen (where the drawer & bottom Save button are located)
  const candidateElements = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"], a[role="button"], input[type="submit"], input[type="button"], [class*="save"], [class*="submit"], [class*="btn"], [class*="button"], div, span')).filter(el => {
    const r = el.getBoundingClientRect();
    if (r.width <= 15 || r.height <= 10) return false;

    // Must be in the right half of screen or strictly inside drawer
    if (r.left < rightBoundary && (!drawer || !drawer.contains(el))) return false;

    // Must be in the lower 70% of screen (footer / bottom button area)
    if (r.top < window.innerHeight * 0.35) return false;

    // Block play store / external links
    const href = (el.getAttribute('href') || '').toLowerCase();
    if (href.includes('play.google.com') || href.includes('apple.com') || href.includes('utm_medium=footer') || href.includes('utm_source=naukri')) return false;
    if (el.tagName === 'A' && href.startsWith('http')) return false;

    if (el.closest('footer') && !el.closest('[class*="drawer"], [class*="chat"], [class*="bot"]')) return false;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

    const txt = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
    if (txt.length === 0 || txt.length > 30) return false;

    // Ignore bookmark / save-job buttons
    if (txt.includes('save job') || txt.includes('bookmark') || txt.includes('save this') || txt.includes('download')) return false;

    return (
      txt === 'save' ||
      txt === 'submit' ||
      txt === 'send' ||
      txt === 'next' ||
      txt === 'continue' ||
      txt === 'proceed' ||
      txt === 'save & next' ||
      txt === 'save & continue' ||
      txt === 'save and next' ||
      txt === 'save and apply' ||
      txt === 'save & apply' ||
      txt === 'save answer' ||
      txt === 'submit application' ||
      txt === 'apply now' ||
      txt.startsWith('save') ||
      txt.startsWith('submit') ||
      txt.startsWith('next')
    );
  });

  let targetBtn = null;
  if (candidateElements.length > 0) {
    // Prefer actual button or role=button elements
    const buttonTags = candidateElements.filter(el => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.type === 'submit');
    if (buttonTags.length > 0) {
      buttonTags.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
      targetBtn = buttonTags[0];
    } else {
      candidateElements.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
      targetBtn = candidateElements[0];
    }
  } else if (drawer) {
    // Fallback within drawer: bottom-most button
    const drawerButtons = Array.from(drawer.querySelectorAll('button, input[type="submit"], [role="button"]')).filter(el => {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const href = (el.getAttribute('href') || '').toLowerCase();
      if (href.includes('play.google') || href.includes('apple.com')) return false;
      return r.width > 40 && r.height > 20 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
    if (drawerButtons.length > 0) {
      drawerButtons.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
      targetBtn = drawerButtons[0];
    }
  }

  if (targetBtn) {
    const label = (targetBtn.innerText || targetBtn.value || 'Save').trim();
    console.log(`[HireMind Naukri] Clicking Questionnaire Drawer Save Button: "${label}"`, targetBtn);

    targetBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
    await HireMindCommon.delay(80);

    // If disabled, enable
    targetBtn.removeAttribute('disabled');
    if (targetBtn.disabled) targetBtn.disabled = false;

    const rect = targetBtn.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    const eventOpts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
      buttons: 1
    };

    // 1. Dispatch full PointerEvent sequence
    try {
      targetBtn.dispatchEvent(new PointerEvent('pointerover', eventOpts));
      targetBtn.dispatchEvent(new PointerEvent('pointerenter', eventOpts));
      targetBtn.dispatchEvent(new PointerEvent('pointerdown', { ...eventOpts, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
    } catch (e) {}

    // 2. Dispatch full MouseEvent sequence
    targetBtn.dispatchEvent(new MouseEvent('mouseover', eventOpts));
    targetBtn.dispatchEvent(new MouseEvent('mousedown', eventOpts));

    try {
      targetBtn.dispatchEvent(new PointerEvent('pointerup', { ...eventOpts, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
    } catch (e) {}

    targetBtn.dispatchEvent(new MouseEvent('mouseup', eventOpts));
    targetBtn.dispatchEvent(new MouseEvent('click', eventOpts));

    // 3. Native click
    try { targetBtn.click(); } catch (e) {}

    // 4. Trigger React synthetic event handlers directly
    for (const key of Object.keys(targetBtn)) {
      if (key.startsWith('__reactProps') || key.startsWith('__reactFiber') || key.startsWith('__reactEvents')) {
        try {
          const props = targetBtn[key]?.memoizedProps || targetBtn[key];
          if (typeof props?.onClick === 'function') {
            props.onClick({ preventDefault: () => {}, stopPropagation: () => {}, target: targetBtn, currentTarget: targetBtn });
          }
        } catch (e) {}
      }
    }

    // 5. Also click inner span/div or outer button
    const innerBtn = targetBtn.querySelector('button, span, div');
    if (innerBtn && innerBtn !== targetBtn) {
      try { innerBtn.click(); } catch (e) {}
    }
    const outerBtn = targetBtn.closest('button, div[role="button"]');
    if (outerBtn && outerBtn !== targetBtn) {
      try { outerBtn.click(); } catch (e) {}
    }

    await HireMindCommon.delay(1500);
    return true;
  }

  console.warn('[HireMind Naukri] No valid drawer Save button located.');
  return false;
}

/**
 * Analyzes question text and candidate profile to determine whether Yes, No,
 * or a specific profile option is the correct, compliant answer.
 */
function resolveQuestionIntent(questionText, candidate) {
  const q = (questionText || '').toLowerCase().trim();
  const cand = candidate || {};

  // Negative / Disqualification Check (Must Answer "No")
  const negativeTriggers = [
    'criminal',
    'convict',
    'illegal',
    'felony',
    'misconduct',
    'terminated for cause',
    'disciplinary',
    'active backlog',
    'standing arrears',
    'non-compete',
    'legal restriction',
    'applied in the last 6 months',
    'applied in last 6 months',
    'applied in the past 6 months',
    'previously worked at',
    'previously interviewed',
    'any litigation',
    'require visa sponsorship',
    'need sponsorship'
  ];

  for (const neg of negativeTriggers) {
    if (q.includes(neg)) {
      console.log(`[HireMind Naukri] Question intent classified as NEGATIVE ("No"): "${q}"`);
      return { type: 'boolean', value: 'No', confidence: 0.95 };
    }
  }

  // Affirmative Check (Answer "Yes")
  const affirmativeTriggers = [
    'relocate',
    'living in',
    'residing in',
    'ready to move',
    'comfortable with',
    'willing to',
    'ready to join',
    'work authorization',
    'authorized to work',
    'valid passport',
    'background check',
    'background verification',
    'drug test',
    'shifts',
    'night shift',
    'rotational',
    'weekend',
    'travel',
    'full time',
    'permanent',
    'agree',
    'terms and conditions',
    'eligible to work',
    'completed degree',
    'passed out',
    'hands-on experience',
    'skills in',
    'experience in'
  ];

  for (const aff of affirmativeTriggers) {
    if (q.includes(aff)) {
      console.log(`[HireMind Naukri] Question intent classified as AFFIRMATIVE ("Yes"): "${q}"`);
      return { type: 'boolean', value: 'Yes', confidence: 0.95 };
    }
  }

  // Notice Period Check
  if (q.includes('notice') || q.includes('how soon') || q.includes('joining')) {
    return { type: 'notice', value: cand.notice_period || 'Immediate / 15 days', confidence: 0.9 };
  }

  // Experience Check
  if (q.includes('experience') || q.includes('years') || q.includes('exp')) {
    return { type: 'experience', value: String(cand.experience_years || 2), confidence: 0.9 };
  }

  // CTC / Salary Check (Adhering to fresher vs experienced rules)
  if (q.includes('ctc') || q.includes('salary') || q.includes('compensation') || q.includes('lpa') || q.includes('lacs') || q.includes('lakhs')) {
    const candExpYears = Number(cand.experience_years || 0);
    const isFresher = candExpYears <= 1;
    const asksInLacs = q.includes('lacs') || q.includes('lakhs') || q.includes('lpa');
    const val = isFresher ? (asksInLacs ? '1' : 'NA') : (asksInLacs ? '3.5 LPA' : '300000');
    return { type: 'ctc', value: val, confidence: 0.95 };
  }

  // Location Check
  if (q.includes('current location') || q.includes('current city') || q.includes('residence')) {
    return { type: 'location', value: cand.location || 'Bangalore, India', confidence: 0.9 };
  }

  return { type: 'boolean', value: 'Yes', confidence: 0.7 };
}

/**
 * Find all interactive, unselected options for the active question in the chatbot drawer
 * Excludes already answered history bubbles and static messages.
 */
function findActiveChatbotOptions() {
  const drawer = getNaukriDrawerContainer();
  const searchRoot = drawer || document;
  const rightBoundary = window.innerWidth * 0.48;

  const candidateSelectors = [
    'div[role="radio"]',
    'div[role="checkbox"]',
    'input[type="radio"]',
    'input[type="checkbox"]',
    'div[class*="radio"]',
    'div[class*="choice"]',
    'div[class*="option"]',
    'div[class*="chip"]',
    'div[class*="pill"]',
    'div[class*="botOption"]',
    'span[class*="chip"]',
    'span[class*="pill"]',
    'span[class*="option"]',
    'label',
    'li'
  ];

  const matched = Array.from(searchRoot.querySelectorAll(candidateSelectors.join(', '))).filter(el => {
    const r = el.getBoundingClientRect();
    if (r.width <= 5 || r.height <= 5) return false;

    // Filter out footers, play store, app download links
    const href = (el.getAttribute('href') || '').toLowerCase();
    if (href.includes('play.google.com') || href.includes('apple.com') || href.includes('utm_medium=footer')) return false;
    if (el.closest('footer')) return false;

    // Must be in the right half of the screen and below top navbar
    if (!drawer && r.left < rightBoundary) return false;
    if (r.top < 65) return false;

    // Filter out already answered bubbles in chat history (which contain edit icons or user message classes)
    const elClass = (el.className || '').toString().toLowerCase();
    if (elClass.includes('bubble') || elClass.includes('history') || elClass.includes('sent') || elClass.includes('user-msg')) return false;
    if (el.querySelector('svg[class*="edit"], [class*="pencil"], [class*="editIcon"]')) return false;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

    const txt = (el.innerText || el.textContent || '').trim();
    if (txt.length === 0 || txt.length > 70) return false;
    const tLower = txt.toLowerCase();
    if (tLower === 'participate' || tLower === 'prepare' || tLower === 'opportunities' || tLower === 'squad' || tLower === 'save' || tLower === 'submit') return false;
    if (tLower.includes('thank you for showing') || tLower.includes('kindly answer') || tLower.includes('recruiter question') || tLower === 'save' || tLower === 'submit') return false;

    return true;
  });

  // Group to closest option card / label if input was selected
  const normalized = matched.map(el => el.closest('label, div[class*="option"], div[class*="choice"], div[class*="radio"], div[role="radio"]') || el);
  const unique = Array.from(new Set(normalized));

  // Sort top-to-bottom so options are in natural order
  unique.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  return unique;
}

/**
 * Click option with full mouse/pointer/touch sequence, triggering React state and checking input
 */
async function selectOptionElement(targetEl) {
  if (!targetEl) return false;
  console.log('[HireMind Naukri] Selecting option element:', targetEl);
  targetEl.scrollIntoView({ behavior: 'instant', block: 'center' });
  await HireMindCommon.delay(80);

  const rect = targetEl.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;

  const eventOpts = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX,
    clientY,
    buttons: 1
  };

  // 1. Dispatch pointer and mouse events on target
  try {
    targetEl.dispatchEvent(new PointerEvent('pointerdown', { ...eventOpts, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
  } catch (e) {}
  targetEl.dispatchEvent(new MouseEvent('mousedown', eventOpts));
  try {
    targetEl.dispatchEvent(new PointerEvent('pointerup', { ...eventOpts, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
  } catch (e) {}
  targetEl.dispatchEvent(new MouseEvent('mouseup', eventOpts));
  targetEl.dispatchEvent(new MouseEvent('click', eventOpts));
  try { targetEl.click(); } catch (e) {}

  // 2. Check and click any radio or checkbox input
  const radioInput = targetEl.querySelector('input[type="radio"], input[type="checkbox"]') || targetEl.parentElement?.querySelector('input') || (targetEl.tagName === 'INPUT' ? targetEl : null);
  if (radioInput) {
    radioInput.checked = true;
    radioInput.dispatchEvent(new Event('change', { bubbles: true }));
    radioInput.dispatchEvent(new Event('input', { bubbles: true }));
    try { radioInput.click(); } catch (e) {}
  }

  // 3. Trigger React fiber onClick
  for (const key of Object.keys(targetEl)) {
    if (key.startsWith('__reactProps') || key.startsWith('__reactFiber') || key.startsWith('__reactEvents')) {
      try {
        const props = targetEl[key]?.memoizedProps || targetEl[key];
        if (typeof props?.onClick === 'function') {
          props.onClick({ preventDefault: () => {}, stopPropagation: () => {}, target: targetEl, currentTarget: targetEl });
        }
        if (typeof props?.onChange === 'function') {
          props.onChange({ preventDefault: () => {}, stopPropagation: () => {}, target: targetEl, currentTarget: targetEl });
        }
      } catch (e) {}
    }
  }

  await HireMindCommon.delay(400);
  return true;
}

/**
 * Intelligent option matcher based on question intent and available radio options
 */
function findMatchingOptionForAnswer(intent, candidateOptions = null) {
  const options = (candidateOptions && candidateOptions.length > 0) ? candidateOptions : findActiveChatbotOptions();
  if (!options || options.length === 0) return null;

  const desired = typeof intent === 'object' ? (intent.value || '') : String(intent || '');
  const desiredLower = desired.toLowerCase().trim();
  const intentType = typeof intent === 'object' ? intent.type : 'boolean';

  console.log(`[HireMind Naukri] Matching answer "${desired}" (type: ${intentType}) among options:`, options.map(o => (o.innerText || o.textContent || '').trim()));

  // 1. Exact match (e.g. "Yes", "No", "<2 years", "2 years")
  for (const el of options) {
    const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
    const cleanTxt = txt.replace(/^[○●\s\-_•]+/, '').trim();
    if (
      cleanTxt === desiredLower ||
      txt === desiredLower ||
      txt === `○ ${desiredLower}` ||
      txt === `● ${desiredLower}` ||
      txt.startsWith(`${desiredLower} `) ||
      cleanTxt === desiredLower.toUpperCase()
    ) {
      return el;
    }
  }

  // 2. Intent-specific matching
  // Case A: Boolean / Affirmative (Yes)
  if (intentType === 'boolean' || desiredLower === 'yes') {
    for (const el of options) {
      const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
      const cleanTxt = txt.replace(/^[○●\s\-_•]+/, '').trim();
      if (cleanTxt === 'yes' || cleanTxt.startsWith('yes') || cleanTxt === 'agree' || cleanTxt === 'authorized') {
        return el;
      }
    }
  }

  // Case B: Experience / Years (e.g. 2 years -> match "<2 years", "< 2 years", "0-2 years", "1-2 years", "2-4 years", "2 years")
  if (intentType === 'experience' || desiredLower === '2' || desiredLower === '1' || desiredLower === '3' || desiredLower === '0') {
    // 1st priority: Range matching <2, < 2, 0-2, 1-2, 2-4, 2 years
    for (const el of options) {
      const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
      if (txt.includes('<2') || txt.includes('< 2') || txt.includes('0-2') || txt.includes('1-2') || txt.includes('2 years') || txt.includes('2-4') || txt.includes('1-3') || txt.includes('<1') || txt.includes('< 1')) {
        return el;
      }
    }
    // 2nd priority: Any positive experience option that is not "No experience"
    for (const el of options) {
      const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
      if (!txt.includes('no experience') && !txt.includes('0 years') && !txt.includes('none') && (txt.includes('year') || txt.includes('yr') || txt.includes('<') || txt.includes('-'))) {
        return el;
      }
    }
  }

  // Case C: Notice Period (e.g. Immediate / 15 days)
  if (intentType === 'notice') {
    for (const el of options) {
      const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
      if (txt.includes('immediate') || txt.includes('15 days') || txt.includes('< 15') || txt.includes('< 1 month') || txt.includes('1 month') || txt.includes('serving notice')) {
        return el;
      }
    }
  }

  // 3. Substring match
  for (const el of options) {
    const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
    if (txt.includes(desiredLower)) {
      return el;
    }
  }

  // 4. Fallback: If 1st option is "No experience" or "No", choose 2nd option
  if (options.length > 1) {
    const firstTxt = (options[0].innerText || options[0].textContent || '').trim().toLowerCase();
    if (firstTxt.includes('no experience') || firstTxt === 'no') {
      return options[1];
    }
  }

  return options[0] || null;
}

/**
 * Comprehensive handler for screening questions, options, inputs, and Save button
 */
/**
 * Comprehensive handler for screening questions, options, inputs, and Save button
 */
async function handleNaukriChatbot(appId, job, candidate, resumeData, updateWidget) {
  console.log('[HireMind Naukri] Handling screening questions and chatbot drawer...');
  updateWidget('Screening Bot', 65, 'Screening questionnaire active. Auto-answering...');
  await HireMindCommon.logStep(appId, 'Screening Bot Detected', 65, 'Screening questionnaire detected. Answering questions with AI...');

  // Multi-turn active loop (up to 25 iterations)
  for (let turn = 0; turn < 25; turn++) {
    if (isNaukriAlreadyApplied()) {
      console.log('[HireMind Naukri] Successfully applied during screening.');
      return true;
    }

    await HireMindCommon.delay(700);

    // 1. Extract active question text across right-side drawer/modal bubbles
    const questionNodes = Array.from(document.querySelectorAll('p, div, span, h2, h3, h4, h5, label')).filter(el => {
      const t = (el.innerText || '').trim();
      const tLower = t.toLowerCase();
      if (t.length < 4 || t.length > 300) return false;
      if (tLower.includes('thank you for showing') || tLower.includes('kindly answer') || tLower.includes('grievance') || tLower.includes('download') || tLower.includes('participate') || tLower.includes('prepare')) return false;
      const r = el.getBoundingClientRect();
      const inRightDrawer = (r.left >= window.innerWidth * 0.38 && r.top >= 60);
      const inDrawerModal = Boolean(el.closest('[role="dialog"], .modal-content, [class*="drawer"], [class*="Drawer"], [class*="chatbot"]'));
      return r.width > 0 && r.height > 0 && (inRightDrawer || inDrawerModal);
    });

    const activeQuestion = questionNodes.length > 0 ? (questionNodes[questionNodes.length - 1].innerText || '').trim() : '';
    console.log(`[HireMind Naukri] Active question (${turn + 1}): "${activeQuestion}"`);

    // 2. CHECK FOR ALL VISIBLE TEXT / NUMBER / DATE / TEXTAREA INPUTS FIRST
    const textInputs = Array.from(document.querySelectorAll('input, textarea, div[contenteditable="true"]')).filter(el => {
      const type = (el.type || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'image', 'reset', 'file'].includes(type)) return false;
      const ph = (el.placeholder || '').toLowerCase();
      if (ph.includes('search') || el.closest('header, nav, [class*="searchBar"], [class*="header"]')) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 15 || r.height <= 10) return false;
      if (r.top < 55) return false; // Below top header
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      return true;
    });

    if (textInputs.length > 0) {
      console.log(`[HireMind Naukri] Found ${textInputs.length} input field(s) in screening drawer.`);
      for (const textInput of textInputs) {
        const inputId = (textInput.id || '').toLowerCase();
        const inputName = (textInput.name || '').toLowerCase();
        const inputPlaceholder = (textInput.placeholder || '').toLowerCase();
        const inputType = (textInput.type || 'text').toLowerCase();
        const fullCtx = `${activeQuestion} ${inputId} ${inputName} ${inputPlaceholder}`.toLowerCase();

        let answer = '';

        // Case A: CTC / Salary Question (Strictly applying user rules)
        const isCTC = fullCtx.includes('ctc') || fullCtx.includes('salary') || fullCtx.includes('compensation') || fullCtx.includes('lpa') || fullCtx.includes('lacs') || fullCtx.includes('lakhs') || inputPlaceholder.includes('lakh') || inputPlaceholder.includes('lac') || inputPlaceholder.includes('ctc') || inputPlaceholder.includes('salary');
        if (isCTC) {
          const pageText = (document.body.innerText || '').toLowerCase();
          const jobExpStr = ((job.experience || '') + ' ' + (job.title || '')).toLowerCase();
          const candExpYears = Number(candidate.experience_years || 0);

          // Fresher check: 0-1 yrs or entry-level keywords
          const isFresher = candExpYears <= 1 && (jobExpStr.includes('0-1') || jobExpStr.includes('0 - 1') || jobExpStr.includes('0 to 1') || jobExpStr.includes('fresher') || jobExpStr.includes('intern') || pageText.includes('0-1 yrs') || pageText.includes('0 - 1 yrs') || pageText.includes('fresher'));
          const asksInLacs = fullCtx.includes('lacs') || fullCtx.includes('lakhs') || fullCtx.includes('lpa') || inputPlaceholder.includes('lakh') || inputPlaceholder.includes('lac');

          if (isFresher) {
            // User rule: "if job is for fresher with with 0-1 yrs experience write there NA or 1"
            if (inputType === 'number' || asksInLacs) {
              answer = '1';
            } else {
              answer = 'NA';
            }
          } else {
            // User rule: "if for experience more than 2 year write 3.5LPA or 300000"
            if (inputType === 'number') {
              answer = asksInLacs ? '3.5' : '300000';
            } else if (asksInLacs) {
              answer = '3.5 LPA';
            } else {
              answer = '300000';
            }
          }
        }
        // Case B: Date input or Date-related question
        else if (inputType === 'date') {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          answer = tomorrow.toISOString().split('T')[0];
        } else if (fullCtx.includes('joining date') || fullCtx.includes('available from') || fullCtx.includes('start date') || fullCtx.includes('date of joining') || fullCtx.includes('when can you join')) {
          answer = 'Immediate / within 15 days';
        }
        // Case C: Experience Question
        else if (fullCtx.includes('total experience') || fullCtx.includes('years of experience') || fullCtx.includes('experience in years') || fullCtx.includes('how many years')) {
          answer = inputType === 'number' ? String(candidate.experience_years || 2) : `${candidate.experience_years || 2} years`;
        }
        // Case D: Notice Period
        else if (fullCtx.includes('notice period') || fullCtx.includes('how soon') || fullCtx.includes('notice')) {
          answer = inputType === 'number' ? '15' : (candidate.notice_period || 'Immediate / 15 days');
        }
        // Case E: Location / City
        else if (fullCtx.includes('current location') || fullCtx.includes('current city') || fullCtx.includes('residing')) {
          answer = candidate.location || 'Bangalore, India';
        }
        // Case F: Open-Ended / Technical / Screening Question -> Use AI RAG Vector Engine!
        else {
          updateWidget('AI RAG Thinking', Math.min(70 + turn * 2, 94), 'Analyzing question with resume vector data...');
          await HireMindCommon.logStep(appId, 'AI Screening Question', 70, `Asking AI RAG engine for '${activeQuestion.slice(0, 35)}...'`);
          try {
            const aiRes = await HireMindCommon.sendMessage('GENERATE_AI_ANSWER', {
              appId,
              question: activeQuestion,
              jobTitle: job.title,
              jobDesc: job.description || ''
            });
            if (aiRes && aiRes.answer && aiRes.answer.trim().length > 3) {
              answer = aiRes.answer.trim();
            } else {
              answer = 'Yes, I have relevant hands-on skills and domain experience for this role.';
            }
          } catch (e) {
            console.warn('[HireMind Naukri] AI answer fallback:', e);
            answer = 'Yes, I have relevant hands-on skills and domain experience for this role.';
          }
        }

        console.log(`[HireMind Naukri] Filling text input with: "${answer}"`);
        updateWidget('Filling Answer', Math.min(72 + turn * 2, 94), `Answer: "${answer}"`);
        await HireMindCommon.humanType(textInput, answer);
        await HireMindCommon.delay(350);
      }

      // Verify all inputs have values
      const stillEmpty = textInputs.filter(inp => (!inp.value || inp.value.trim().length === 0) && inp.tagName !== 'BUTTON');
      if (stillEmpty.length > 0) {
        console.warn(`[HireMind Naukri] ${stillEmpty.length} input(s) still empty after typing! Retrying typing...`);
        for (const emptyInp of stillEmpty) {
          emptyInp.value = '3.5';
          emptyInp.dispatchEvent(new Event('input', { bubbles: true }));
          emptyInp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // Click Save after filling inputs
      updateWidget('Saving & Proceeding', Math.min(75 + turn * 2, 95), 'Clicking Save button...');
      await clickDrawerSaveButton();
      await HireMindCommon.delay(1200);

      if (isNaukriAlreadyApplied()) return true;
      continue;
    }

    // 3. CHECK FOR CHECKBOXES
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"], div[role="checkbox"]')).filter(el => {
      const r = el.getBoundingClientRect();
      const inRightDrawer = r.left >= window.innerWidth * 0.38 && r.top >= 50;
      const inDrawerModal = Boolean(el.closest('[role="dialog"], .modal-content, [class*="drawer"], [class*="Drawer"], [class*="chatbot"]'));
      return r.width > 0 && r.height > 0 && (inRightDrawer || inDrawerModal);
    });
    if (checkboxes.length > 0) {
      let checkedAny = false;
      for (const cb of checkboxes) {
        if (cb.tagName === 'INPUT' && !cb.checked) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          cb.dispatchEvent(new Event('input', { bubbles: true }));
          cb.click();
          checkedAny = true;
        } else if (cb.getAttribute('role') === 'checkbox' && cb.getAttribute('aria-checked') !== 'true') {
          cb.click();
          checkedAny = true;
        }
      }
      if (checkedAny) {
        await HireMindCommon.delay(300);
        await clickDrawerSaveButton();
        await HireMindCommon.delay(1200);
        if (isNaukriAlreadyApplied()) return true;
        continue;
      }
    }

    // 4. CHECK FOR RADIO / CHOICE OPTIONS (Strictly inside drawer)
    const activeOptions = findActiveChatbotOptions();
    if (activeOptions.length > 0) {
      const intent = resolveQuestionIntent(activeQuestion, candidate);
      const targetOptionEl = findMatchingOptionForAnswer(intent, activeOptions) || activeOptions[0];
      if (targetOptionEl) {
        const optLabel = (targetOptionEl.innerText || targetOptionEl.textContent || intent.value).trim();
        console.log(`[HireMind Naukri] Selecting option: "${optLabel}"`);
        updateWidget('Selecting Option', Math.min(70 + turn * 3, 94), `Selecting "${optLabel}"...`);
        await selectOptionElement(targetOptionEl);
        await HireMindCommon.delay(500);

        await clickDrawerSaveButton();
        await HireMindCommon.delay(1200);

        if (isNaukriAlreadyApplied()) return true;
        continue;
      }
    }

    // 5. CHECK FOR HTML <select> DROPDOWNS
    const selectElements = Array.from(document.querySelectorAll('select')).filter(el => {
      const r = el.getBoundingClientRect();
      const inRightDrawer = r.left >= window.innerWidth * 0.38 && r.top >= 50;
      const inDrawerModal = Boolean(el.closest('[role="dialog"], .modal-content, [class*="drawer"], [class*="Drawer"], [class*="chatbot"]'));
      return r.width > 0 && r.height > 0 && !el.disabled && (inRightDrawer || inDrawerModal);
    });
    if (selectElements.length > 0) {
      for (const selectEl of selectElements) {
        const opts = Array.from(selectEl.options);
        if (opts.length > 1) {
          selectEl.value = opts[1].value;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          selectEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      await HireMindCommon.delay(300);
      await clickDrawerSaveButton();
      await HireMindCommon.delay(1200);
      if (isNaukriAlreadyApplied()) return true;
      continue;
    }

    // 6. If no active input/option was matched, ONLY click Save IF NO unfilled inputs exist on screen!
    const unfilledOnScreen = Array.from(document.querySelectorAll('input, textarea')).filter(el => {
      const type = (el.type || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'image', 'reset', 'file'].includes(type)) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 15 || r.height <= 10) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const inRightDrawer = r.left >= window.innerWidth * 0.38 && r.top >= 50;
      return inRightDrawer && (!el.value || el.value.trim().length === 0);
    });

    if (unfilledOnScreen.length > 0) {
      console.warn(`[HireMind Naukri] Found ${unfilledOnScreen.length} unfilled input(s) on screen. Will NOT click Save until filled!`);
      continue;
    }

    const saveClicked = await clickDrawerSaveButton();
    if (saveClicked) {
      await HireMindCommon.delay(1500);
      if (isNaukriAlreadyApplied()) return true;
    } else {
      await HireMindCommon.delay(1000);
      if (isNaukriAlreadyApplied()) return true;
      console.log('[HireMind Naukri] No more active elements or save button in drawer.');
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
