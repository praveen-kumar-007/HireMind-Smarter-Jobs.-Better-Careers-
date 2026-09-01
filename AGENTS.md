# 🤖 HireMind Job Application & Automation Agent Rules (AGENTS.md)

This file contains persistent, permanent instructions and behavioral rules for all AI agents working on this codebase.

---

## 🎯 Job Application Flow & Automation Rules

Whenever automating job applications across platforms (**Naukri**, **LinkedIn**, **Indeed**, etc.) via the **Chrome Extension** or **Backend Automation Service**, the agent MUST strictly follow these rules:

### 1. Pre-Check: Already Applied Detection
* Before clicking any apply buttons, inspect the page for indicators that the user has already applied.
* **Keywords**: `"Applied"`, `"Already applied"`, `"Application sent"`, `"You have applied"`, `"Applied on"`.
* **Action**:
  - Console Log:
    ```javascript
    console.log("[HireMind] Already applied");
    console.log("[HireMind] Applied");
    ```
  - Mark status as **`Applied`** in the database.
  - Terminate the application flow immediately.

---

### 2. Company Website Detection (Manual Intervention)
* If the job listing directs the applicant to an external company site rather than 1-click apply:
* **Keywords**: `"Apply on company site"`, `"Apply on Company Site"`, `"Apply on Employer Website"`, `"Company Website"`, or external domain redirects.
* **Action**:
  - Console Log:
    ```javascript
    console.log("[HireMind] Company website detected - Sending to Manual Intervention");
    ```
  - Mark status as **`Manual Intervention`** with notes.
  - Terminate the automation cleanly.

---

### 3. Apply Trigger Keywords & Button Clicking
* Locate and click the primary apply button matching any of these trigger terms:
  - `"Apply"`
  - `"Apply Now"`
  - `"Quick Apply"`
  - `"Easy Apply"`
  - `"I am interested"`
  - `"I'm interested"`
  - `"Interested"`
  - `"Interested to apply"`
  - `"Express Apply"`
  - `"Direct Apply"`
  - `"Apply for job"`
* **Action**: Dispatches human-like hover and click events.

---

### 4. Mandatory 5-Second Wait Rule
* **CRITICAL**: After clicking the Apply / Interested button, the agent **MUST wait 5 full seconds (5000 ms)** for the page modal, chatbot drawer, or confirmation to settle.
* **Console Log**:
  ```javascript
  console.log("[HireMind] Waiting 5 seconds for page response / questions...");
  ```

---

### 5. AI Screening Questionnaire & Chatbot Answering
* When a screening questionnaire drawer (e.g. Naukri Chatbot Drawer) or modal is displayed:
  - Extract the question text accurately.
  - Analyze the question using the AI backend (`/api/applications/qa/generate` or `/api/applications/{app_id}/answer`) against candidate profile and parsed resume.
  - Automatically fill inputs:
    - **Experience**: Candidate's total experience years (e.g. `2 years`).
    - **Notice Period**: Candidate's notice period (e.g. `Immediate / 15 days`).
    - **CTC / Salary**: Candidate's expected salary / negotiable.
    - **Open-ended Questions**: AI-generated tailored answer.
    - **Radio / Options**: Select affirmative choices (`"Yes"`, `"Authorized"`, `"Immediate"`, `"Full Time"`).
  - Click `"Save"`, `"Send"`, `"Submit"`, or `"Next"`.

---

### 6. Success Verification & Confirmation
* Once the submission is confirmed (e.g. button changes to `"Applied"` or `"Successfully Applied"` message appears):
* **Action**:
  - Console Log:
    ```javascript
    console.log("[HireMind] Successfully applied");
    console.log("[HireMind] Applied");
    ```
  - Mark status as **`Applied`** in the database with current timestamp.
  - Show user-facing confirmation: `"Successfully Applied!"`.

---

## 🛠️ Architecture Guidelines
* **Chrome Extension (`extension/`)**: Uses Manifest V3 and runs in the user's active browser on their residential IP with active session cookies.
* **Backend Playwright Service (`backend/app/services/automation_service.py`)**: Server-side and local CDP fallback for automated applications.
* **Telemetry**: All steps must log real-time progress events via `POST /api/applications/{app_id}/events` to update `LiveApplicationModal`.
