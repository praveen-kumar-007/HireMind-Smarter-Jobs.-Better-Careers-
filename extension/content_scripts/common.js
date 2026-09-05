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
    let strText = String(text !== undefined && text !== null ? text : '');
    
    // If number input or numeric mode, sanitize to numbers & decimals only
    const inputType = (element.type || '').toLowerCase();
    const isNumeric = inputType === 'number' || element.getAttribute('inputmode') === 'numeric';
    if (isNumeric) {
      strText = strText.replace(/[^0-9.]/g, '');
      if (!strText) strText = '1';
    }

    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.delay(80);
      element.focus();
      element.click();
      await this.delay(60);

      // 1. Reset React internal value tracker if present
      if (element._valueTracker) {
        element._valueTracker.setValue('');
      }

      // 2. Use native prototype descriptor setter to trigger React 17/18 synthetic change listeners
      const proto = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

      if (nativeSetter) {
        nativeSetter.call(element, strText);
      } else {
        element.value = strText;
      }
      element.value = strText;

      // 3. Dispatch full event suite
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      try {
        element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: strText }));
      } catch (e) {}
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      // 4. Dispatch keydown / keyup
      element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));

      // 5. Blur to trigger form validation
      element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
      await this.delay(120);

      // 6. Verification fallback: If text contains letters and element stripped it to empty (e.g. custom numeric mask)
      if (!element.value || element.value.trim().length === 0) {
        const fallbackNum = strText.replace(/[^0-9.]/g, '');
        if (fallbackNum) {
          console.warn(`[HireMind Common] Input was empty after typing "${strText}". Fallback typing numeric "${fallbackNum}"...`);
          if (nativeSetter) nativeSetter.call(element, fallbackNum);
          element.value = fallbackNum;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.dispatchEvent(new Event('blur', { bubbles: true }));
        }
      }
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
