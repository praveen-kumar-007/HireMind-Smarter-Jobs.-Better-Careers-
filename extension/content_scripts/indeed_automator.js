/**
 * HireMind Extension - Indeed Apply DOM Automator
 */

(async function () {
  console.log('[HireMind Indeed] Loaded on:', window.location.href);

  const { appId } = await HireMindCommon.sendMessage('GET_ACTIVE_APP_FOR_TAB');
  if (!appId) return;

  console.log(`[HireMind Indeed] Activating for App ID: ${appId}`);

  const contextRes = await HireMindCommon.sendMessage('GET_EXTENSION_CONTEXT', { appId });
  if (contextRes.status !== 'ok' || !contextRes.context) return;

  const { job, candidate, resume_data } = contextRes.context;

  await HireMindCommon.logStep(appId, 'Initializing', 15, 'Scanning Indeed job page and checking Easy Apply...');
  await HireMindCommon.delay(1500);

  // Check if already applied
  const bodyText = (document.body.innerText || '').toLowerCase();
  if (bodyText.includes('you have applied') || bodyText.includes('application submitted') || document.querySelector('.ia-AppliedState')) {
    await HireMindCommon.logStep(appId, 'Already Applied', 100, 'Already applied to this job on Indeed.');
    await HireMindCommon.updateStatus(appId, 'Applied', 'Already applied on Indeed.');
    return;
  }

  // Find Indeed Apply button
  const applyBtn = document.querySelector('#indeedApplyButton, button[id*="indeedApply"], .ia-IndeedApplyButton, button.jobsearch-IndeedApplyButton-contentWrapper');
  if (!applyBtn) {
    await HireMindCommon.logStep(appId, 'Manual Intervention Required', 100, 'No Indeed Apply button found (External company apply).');
    await HireMindCommon.updateStatus(appId, 'Manual Intervention', 'External company apply on Indeed.');
    return;
  }

  await HireMindCommon.logStep(appId, 'Clicking Indeed Apply', 35, `Clicking Apply on Indeed for ${job.company}...`);
  await HireMindCommon.humanClick(applyBtn);
  await HireMindCommon.delay(2500);

  await HireMindCommon.logStep(appId, 'Applied', 100, `Indeed application submitted for '${job.title}'!`);
  await HireMindCommon.updateStatus(appId, 'Applied', 'Indeed apply completed.');
})();
