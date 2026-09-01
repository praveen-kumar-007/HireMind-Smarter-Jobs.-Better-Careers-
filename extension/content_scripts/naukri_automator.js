/**
 * HireMind Extension - Naukri.com Native DOM Automator
 * Runs directly in the user's logged-in browser session.
 */

(async function () {
  console.log('[HireMind Naukri] Script loaded on:', window.location.href);

  // Check if this tab is part of an active application task
  const { appId } = await HireMindCommon.sendMessage('GET_ACTIVE_APP_FOR_TAB');
  if (!appId) {
    // Check if auto-apply triggered via URL param ?hiremind_app_id=...
    const urlParams = new URLSearchParams(window.location.search);
    const paramAppId = urlParams.get('hiremind_app_id');
    if (!paramAppId) {
      console.log('[HireMind Naukri] Passive page view (no active HireMind apply task).');
      return;
    }
  }

  const targetAppId = appId || new URLSearchParams(window.location.search).get('hiremind_app_id');
  console.log(`[HireMind Naukri] Activating automation for App ID: ${targetAppId}`);

  // Fetch full context from backend
  const contextRes = await HireMindCommon.sendMessage('GET_EXTENSION_CONTEXT', { appId: targetAppId });
  if (contextRes.status !== 'ok' || !contextRes.context) {
    console.error('[HireMind Naukri] Could not load application context:', contextRes);
    return;
  }

  const { job, candidate, resume_data } = contextRes.context;

  // Render floating status widget
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
})();

/**
 * Main Naukri Apply Sequence
 */
async function runNaukriAutomation(appId, job, candidate, resumeData, updateWidget) {
  // Step 1: Dynamic SPA Page Scanner (polls for up to 12s for React/DOM elements to hydrate)
  updateWidget('Scanning Page', 15, 'Scanning job page for apply options and active sessions...');
  await HireMindCommon.logStep(appId, 'Initializing', 15, 'Scanning Naukri job page elements and checking session...');

  const pageState = await waitForNaukriPageState(12000, updateWidget);
  console.log('[HireMind] Detected initial page state:', pageState.type);

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

  // Step 2: Click the Apply / Interested / Quick Apply Button
  const applyBtn = pageState.element;
  const btnLabel = (applyBtn.innerText || '').trim();
  console.log(`[HireMind] Clicking Apply button: "${btnLabel}"`);
  updateWidget('Clicking Apply', 40, `Clicking "${btnLabel}" on ${job.company}...`);
  await HireMindCommon.logStep(appId, 'Clicking Apply', 40, `Clicking "${btnLabel}" button for '${job.title}'...`);

  await HireMindCommon.humanClick(applyBtn);

  // Step 3: Mandatory 5-Second Wait for form / drawer / confirmation to load
  console.log('[HireMind] Waiting 5 seconds for page response / questions...');
  updateWidget('Waiting (5s)', 50, 'Waiting 5 seconds for page response / screening questions...');
  await HireMindCommon.delay(5000);

  // Step 4: Check Immediate Confirmation after 5 seconds
  if (isNaukriAlreadyApplied()) {
    await finishAndExit(appId, job, updateWidget, 'Successfully applied');
    return;
  }

  // Step 5: Handle Naukri Chatbot Questionnaire Drawer with AI Analysis
  updateWidget('Checking Questionnaire', 65, 'Scanning for screening questions / chatbot...');
  const drawerHandled = await handleNaukriChatbot(appId, job, candidate, resumeData, updateWidget);

  if (isNaukriAlreadyApplied()) {
    await finishAndExit(appId, job, updateWidget, 'Successfully applied');
    return;
  }

  // Step 6: Handle Standard Modal Form Fields
  await fillNaukriStandardForm(appId, candidate, resumeData, updateWidget);
  await HireMindCommon.delay(3000);

  // Step 7: Final Submission Check
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
async function waitForNaukriPageState(maxWaitMs = 12000, updateWidget) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    if (updateWidget) updateWidget('Scanning Page', Math.min(15 + elapsedSec * 3, 38), `Scanning page elements (${elapsedSec}s)...`);

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
      'job is closed'
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
      txt.includes('quick apply') ||
      txt.includes('easy apply') ||
      txt.includes('i am interested') ||
      txt.includes("i'm interested");

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
  const drawerSelector = '.chatbot_Drawer, .chatbot-container, [class*="chatbot_Drawer"], [class*="chatContainer"], [class*="botWrapper"], [role="dialog"], div[class*="drawer"]';
  const drawer = document.querySelector(drawerSelector);
  if (!drawer) return false;

  const rect = drawer.getBoundingClientRect();
  if (rect.width <= 50 || rect.height <= 50) return false;

  console.log('[HireMind Naukri] Chatbot drawer detected!');
  updateWidget('Screening Chatbot', 70, 'Naukri screening bot detected. Answering questions with AI...');
  await HireMindCommon.logStep(appId, 'Screening Bot Detected', 70, 'Screening questionnaire detected. Generating AI answers...');

  for (let turn = 0; turn < 10; turn++) {
    if (isNaukriAlreadyApplied()) return true;

    await HireMindCommon.delay(1200);

    // Check active inputs inside drawer
    const textInput = drawer.querySelector('input[type="text"], input:not([type]), textarea, div[contenteditable="true"]');
    const radioItems = Array.from(drawer.querySelectorAll('input[type="radio"], label, [class*="radio"], [class*="option"], button[class*="chip"]')).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });

    if (!textInput && radioItems.length === 0) {
      // Check for Save / Submit button inside drawer
      const submitBtns = Array.from(drawer.querySelectorAll('button, input[type="submit"], a[class*="btn"]'));
      for (const btn of submitBtns) {
        const txt = (btn.innerText || '').toLowerCase();
        if (txt.includes('save') || txt.includes('submit') || txt.includes('apply') || txt.includes('send')) {
          await HireMindCommon.humanClick(btn);
          await HireMindCommon.delay(1500);
          break;
        }
      }
      break;
    }

    // Extract question text
    const msgs = Array.from(drawer.querySelectorAll('p, div, span, h2, h3, h4, h5')).filter(el => {
      const t = (el.innerText || '').trim();
      const tLower = t.toLowerCase();
      if (t.length < 5 || t.length > 250) return false;
      if (tLower.includes('grievance') || tLower.includes('terms') || tLower.includes('privacy') || tLower.includes('copyright')) return false;
      return t.includes('?') || tLower.includes('experience') || tLower.includes('relocate') || tLower.includes('salary') || tLower.includes('notice') || tLower.includes('skills');
    });

    const questionText = msgs.length > 0 ? (msgs[msgs.length - 1].innerText || '').trim() : 'Screening Question';

    updateWidget('AI Answering', Math.min(72 + turn * 3, 90), `Q: "${questionText.slice(0, 45)}..."`);
    await HireMindCommon.logStep(appId, 'AI Analyzing Question', Math.min(72 + turn * 3, 90), `Question (${turn + 1}): '${questionText}'`);

    if (textInput) {
      // Generate AI answer
      let answer = '';
      const qLower = questionText.toLowerCase();

      if (qLower.includes('experience') || qLower.includes('years')) {
        answer = `${candidate.experience_years || 2} years`;
      } else if (qLower.includes('notice') || qLower.includes('how soon')) {
        answer = candidate.notice_period || 'Immediate (within 15 days)';
      } else if (qLower.includes('ctc') || qLower.includes('salary')) {
        answer = candidate.expected_ctc || 'Negotiable as per company standards';
      } else if (qLower.includes('location') || qLower.includes('city') || qLower.includes('residing')) {
        answer = candidate.location || 'Bangalore, India';
      } else {
        answer = await HireMindCommon.askAI(appId, questionText, job.title, job.description);
        if (!answer || answer.length < 2) {
          answer = 'Yes, I have relevant hands-on experience and skills matching this requirement.';
        }
      }

      await HireMindCommon.humanType(textInput, answer);
      await HireMindCommon.delay(500);

      // Click send/save inside drawer
      const sendBtn = drawer.querySelector('button[type="submit"], button.send-btn, button:has-text("Save"), button:has-text("Send")') ||
        Array.from(drawer.querySelectorAll('button')).find(b => (b.innerText || '').toLowerCase().includes('save') || (b.innerText || '').toLowerCase().includes('send'));

      if (sendBtn) {
        await HireMindCommon.humanClick(sendBtn);
      } else {
        textInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      }
      await HireMindCommon.delay(1000);
    } else if (radioItems.length > 0) {
      // Select best option
      let chosenOption = radioItems[0];
      for (const item of radioItems) {
        const txt = (item.innerText || item.textContent || '').trim().toLowerCase();
        if (txt.includes('yes') || txt.includes('immediate') || txt.includes('full time') || txt.includes('authorized')) {
          chosenOption = item;
          break;
        }
      }
      await HireMindCommon.humanClick(chosenOption);
      await HireMindCommon.delay(1000);
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
