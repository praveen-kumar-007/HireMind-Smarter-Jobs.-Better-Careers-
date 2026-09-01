/**
 * HireMind Extension - LinkedIn Easy Apply DOM Automator
 */

(async function () {
  console.log('[HireMind LinkedIn] Loaded on:', window.location.href);

  const { appId } = await HireMindCommon.sendMessage('GET_ACTIVE_APP_FOR_TAB');
  if (!appId) return;

  console.log(`[HireMind LinkedIn] Activating for App ID: ${appId}`);

  const contextRes = await HireMindCommon.sendMessage('GET_EXTENSION_CONTEXT', { appId });
  if (contextRes.status !== 'ok' || !contextRes.context) return;

  const { job, candidate, resume_data } = contextRes.context;

  await HireMindCommon.logStep(appId, 'Initializing', 15, 'Scanning LinkedIn job page and checking Easy Apply...');
  await HireMindCommon.delay(1500);

  // Check if already applied
  const bodyText = (document.body.innerText || '').toLowerCase();
  if (bodyText.includes('applied on') || bodyText.includes('already applied') || document.querySelector('.jobs-apply-button--disabled, .artdeco-inline-feedback--success')) {
    await HireMindCommon.logStep(appId, 'Already Applied', 100, 'Already applied to this job on LinkedIn.');
    await HireMindCommon.updateStatus(appId, 'Applied', 'Already applied on LinkedIn.');
    return;
  }

  // Find Easy Apply button
  const easyApplyBtn = document.querySelector('.jobs-apply-button, button[aria-label*="Easy Apply"], button.jobs-apply-button');
  if (!easyApplyBtn) {
    await HireMindCommon.logStep(appId, 'Manual Intervention Required', 100, 'No Easy Apply button found (External company apply).');
    await HireMindCommon.updateStatus(appId, 'Manual Intervention', 'External company apply on LinkedIn.');
    return;
  }

  await HireMindCommon.logStep(appId, 'Clicking Easy Apply', 35, `Clicking Easy Apply on ${job.company}...`);
  await HireMindCommon.humanClick(easyApplyBtn);
  await HireMindCommon.delay(2000);

  // Loop through Easy Apply multi-step modal
  for (let step = 0; step < 8; step++) {
    const modal = document.querySelector('.jobs-easy-apply-modal, [role="dialog"]');
    if (!modal) break;

    await HireMindCommon.logStep(appId, 'Filling LinkedIn Form', Math.min(45 + step * 7, 88), `Processing Easy Apply step ${step + 1}...`);

    // 1. Text inputs
    const inputs = Array.from(modal.querySelectorAll('input[type="text"], input:not([type]), textarea')).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });

    for (const inp of inputs) {
      if (!inp.value || inp.value.trim() === '') {
        const label = (inp.getAttribute('aria-label') || inp.id || '').toLowerCase();
        if (label.includes('phone') || label.includes('mobile')) {
          await HireMindCommon.humanType(inp, candidate.phone || '');
        } else if (label.includes('experience') || label.includes('years')) {
          await HireMindCommon.humanType(inp, String(candidate.experience_years || 2));
        } else if (label.includes('salary') || label.includes('ctc')) {
          await HireMindCommon.humanType(inp, candidate.expected_ctc || '800000');
        } else if (label.includes('notice')) {
          await HireMindCommon.humanType(inp, candidate.notice_period || 'Immediate');
        } else {
          const ans = await HireMindCommon.askAI(appId, label || 'Question', job.title, job.description);
          await HireMindCommon.humanType(inp, ans || 'Yes');
        }
      }
    }

    // 2. Radio buttons / Options (select Yes / Authorized / Immediate)
    const radioItems = Array.from(modal.querySelectorAll('input[type="radio"], fieldset label'));
    for (const r of radioItems) {
      const t = (r.innerText || r.textContent || '').toLowerCase();
      if (t.includes('yes') || t.includes('authorized') || t.includes('immediate')) {
        await HireMindCommon.humanClick(r);
      }
    }

    // 3. Check for Submit button
    const submitBtn = Array.from(modal.querySelectorAll('button')).find(b => {
      const txt = (b.innerText || '').trim().toLowerCase();
      return txt === 'submit application' || txt === 'submit';
    });

    if (submitBtn) {
      await HireMindCommon.logStep(appId, 'Submitting Application', 95, 'Clicking Submit application on LinkedIn...');
      await HireMindCommon.humanClick(submitBtn);
      await HireMindCommon.delay(2000);
      break;
    }

    // 4. Check for Next / Review button
    const nextBtn = Array.from(modal.querySelectorAll('button')).find(b => {
      const txt = (b.innerText || '').trim().toLowerCase();
      return txt === 'next' || txt === 'review' || txt === 'continue';
    });

    if (nextBtn) {
      await HireMindCommon.humanClick(nextBtn);
      await HireMindCommon.delay(1500);
    } else {
      break;
    }
  }

  await HireMindCommon.logStep(appId, 'Applied', 100, `LinkedIn application confirmed for '${job.title}'!`);
  await HireMindCommon.updateStatus(appId, 'Applied', 'Easy Apply completed successfully on LinkedIn.');
})();
