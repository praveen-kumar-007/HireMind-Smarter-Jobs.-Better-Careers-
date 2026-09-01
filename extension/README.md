# 🧩 HireMind Chrome Extension (Manifest V3)

> **1-Click AI-powered native job application agent for Naukri, LinkedIn, and Indeed.**

The **HireMind Chrome Extension** runs native browser automation directly on your computer. It uses your active login sessions and home residential IP to bypass Cloudflare/Akamai bot detection, mobile SMS OTP challenges, and CAPTCHAs with 100% reliability in production.

---

## 🚀 Quick 10-Second Installation

1. Open **Google Chrome** (or any Chromium browser: Brave, Edge, Opera).
2. Go to `chrome://extensions` in the address bar.
3. Enable **Developer mode** toggle in the top-right corner.
4. Click **"Load unpacked"** in the top-left corner.
5. Select the **`extension`** folder from this project directory:
   ```
   AI JOB WORK/extension
   ```
6. The **HireMind AI** extension is now installed! Pin it to your Chrome toolbar for quick access.

---

## ⚡ How to Use in Production

### Method 1: 1-Click Apply from HireMind Dashboard (Recommended)
1. Open your HireMind Web App (e.g. `https://hire-mind-praveen.vercel.app` or `http://localhost:5173`).
2. Log in with your account.
3. Go to the **Jobs** tab.
4. Click **"Quick Apply"** on any **Naukri**, **LinkedIn**, or **Indeed** job card.
5. The extension automatically:
   - Opens the job in a tab.
   - Detects your active login session.
   - Clicks Apply.
   - Generates AI answers for screening questions and types them into chatbot drawers.
   - Submits the application and marks it as **Applied** on your dashboard in real-time.

### Method 2: Direct Apply via Extension Popup
1. Click the **HireMind icon** in your Chrome toolbar.
2. Paste any **Naukri** or **LinkedIn** job URL into the **"1-Click Job Apply"** field.
3. Click **Apply**.

---

## ⚙️ Configuration & Backend Server URL
- By default, the extension connects to the production Render backend:
  `https://hiremind-smarter-jobs-better-careers.onrender.com`
- To test locally, click **Settings ⚙️** inside the extension popup and select **Local (8000)**.
