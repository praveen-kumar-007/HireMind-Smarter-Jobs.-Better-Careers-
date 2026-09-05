/**
 * HireMind Extension - Common DOM & Communication Utilities
 */

const HireMindCommon = {
  /**
   * Sleep for ms milliseconds
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Random jitter delay between min and max ms
   */
  async randomDelay(min = 200, max = 500) {
    const time = Math.floor(Math.random() * (max - min + 1)) + min;
    return this.delay(time);
  },

  /**
   * Human-like typing into input or textarea with native event dispatch and React controlled state support
   */
  async humanType(element, text) {
    if (!element) return;
    const strText = String(text !== undefined && text !== null ? text : '');
    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.delay(100);
      element.focus();
      element.click();
      await this.delay(80);

      // React controlled input helper: invoke prototype value setter to trigger internal tracker
      const proto = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

      if (nativeSetter) {
        nativeSetter.call(element, '');
      } else {
        element.value = '';
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));

      // Type each character or set value
      if (strText.length > 60) {
        if (nativeSetter) {
          nativeSetter.call(element, strText);
        } else {
          element.value = strText;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        let current = '';
        for (let i = 0; i < strText.length; i++) {
          current += strText[i];
          if (nativeSetter) {
            nativeSetter.call(element, current);
          } else {
            element.value = current;
          }
          element.dispatchEvent(new Event('input', { bubbles: true }));
          await this.delay(15);
        }
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
      element.dispatchEvent(new Event('blur', { bubbles: true }));
      await this.delay(100);
    } catch (err) {
      console.warn('[HireMind Common] Type error:', err);
      try {
        element.value = strText;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {}
    }
  },

  /**
   * Human-like click with hover and mouse events
   */
  async humanClick(element) {
    if (!element) return;
    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.delay(150);

      const mouseOverEvent = new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window });
      const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });

      element.dispatchEvent(mouseOverEvent);
      await this.delay(50);
      element.dispatchEvent(mouseDownEvent);
      await this.delay(50);
      element.dispatchEvent(mouseUpEvent);
      element.dispatchEvent(clickEvent);
      element.click();
      await this.delay(200);
    } catch (err) {
      console.warn('[HireMind Common] Click error:', err);
      try {
        element.click();
      } catch (e) {}
    }
  },

  /**
   * Wait for element matching selector to appear in DOM
   */
  waitForSelector(selector, timeoutMs = 10000, root = document) {
    return new Promise((resolve) => {
      const existing = root.querySelector(selector);
      if (existing) return resolve(existing);

      const startTime = Date.now();
      const interval = setInterval(() => {
        const el = root.querySelector(selector);
        if (el) {
          clearInterval(interval);
          resolve(el);
        } else if (Date.now() - startTime >= timeoutMs) {
          clearInterval(interval);
          resolve(null);
        }
      }, 200);
    });
  },

  /**
   * Find first visible element matching an array of candidate selectors
   */
  findVisibleElement(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const matches = root.querySelectorAll(sel);
        for (const el of matches) {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
            return el;
          }
        }
      } catch (e) {}
    }
    return null;
  },

  /**
   * Send message to background service worker
   */
  sendMessage(action, payload = {}) {
    return new Promise((resolve) => {
      try {
        if (!chrome || !chrome.runtime || !chrome.runtime.id) {
          return resolve({ status: 'error', error: 'Extension context invalidated' });
        }
        chrome.runtime.sendMessage({ action, ...payload }, (response) => {
          if (chrome.runtime?.lastError) {
            resolve({ status: 'error', error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { status: 'ok' });
          }
        });
      } catch (err) {
        resolve({ status: 'error', error: err ? err.message : 'Message failed' });
      }
    });
  },

  /**
   * Telemetry step logging back to HireMind backend
   */
  async logStep(appId, step, progress, statusText, isError = false) {
    console.log(`[HireMind Telemetry] [${progress}%] ${step}: ${statusText}`);
    return this.sendMessage('LOG_EVENT', {
      appId,
      step,
      progress,
      statusText,
      isError
    });
  },

  /**
   * Request AI answer for screening questions
   */
  async askAI(appId, question, jobTitle, jobDesc = '') {
    const res = await this.sendMessage('GENERATE_AI_ANSWER', {
      appId,
      question,
      jobTitle,
      jobDesc
    });
    return res?.answer || '';
  },

  /**
   * Update final application status in HireMind backend
   */
  async updateStatus(appId, status, notes = '') {
    return this.sendMessage('UPDATE_APPLICATION_STATUS', {
      appId,
      status,
      notes
    });
  },

  /**
   * Permanently delete an expired job from the database
   */
  async deleteExpiredJob(jobId) {
    console.log(`[HireMind] Sending DELETE_EXPIRED_JOB for job #${jobId}`);
    return this.sendMessage('DELETE_EXPIRED_JOB', { jobId });
  }
};

window.HireMindCommon = HireMindCommon;
