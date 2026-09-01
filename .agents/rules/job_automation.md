# Job Automation & Screening Rules

Whenever automating job applications across platforms (Naukri, LinkedIn, Indeed) via the Chrome Extension or Backend Service:

1. **Pre-Check: Already Applied Detection**:
   - Check if already applied ("Applied", "Already applied", "Application sent").
   - Console log: `[HireMind] Already applied` & `[HireMind] Applied`.
   - Update DB status to `Applied` and exit.

2. **Company Site Detection**:
   - If button/link says "Apply on company site" or redirects externally:
   - Console log: `[HireMind] Company website detected - Sending to Manual Intervention`.
   - Update DB status to `Manual Intervention` and exit.

3. **Apply Trigger Words**:
   - Check words: "Apply", "Apply Now", "Quick Apply", "Easy Apply", "I am interested", "I'm interested", "Interested", "Interested to apply", "Express Apply", "Direct Apply".
   - Click with human-like interaction.

4. **Mandatory 5-Second Wait**:
   - MUST wait 5 seconds (5000ms) after clicking apply for page/drawer to render.
   - Console log: `[HireMind] Waiting 5 seconds for page response / questions...`.

5. **AI Screening Questionnaire & Chatbot**:
   - Detect chatbot drawer / questions, analyze with AI against candidate resume/profile.
   - Type experience years, notice period, CTC, custom answers, and select radio chips.
   - Click Save / Send / Submit.

6. **Success Verification**:
   - Confirm application submission.
   - Console log: `[HireMind] Successfully applied` & `[HireMind] Applied`.
   - Update DB status to `Applied`.
