# 🧠 HireMind — AI-Powered Job Hunting Platform

> Automated job discovery, AI-powered resume tailoring, one-click applications, and recruiter outreach — all from one dashboard.

---

## 📋 Table of Contents

- [Prerequisites](#-prerequisites)
- [Project Structure](#-project-structure)
- [Environment Setup](#-environment-setup)
- [Start Everything](#-start-everything)
- [Stop Everything](#-stop-everything)
- [Ngrok (Remote Access)](#-ngrok-remote-access)
- [Quick Reference Commands](#-quick-reference-commands)
- [Troubleshooting](#-troubleshooting)

---

## 🔧 Prerequisites

Make sure these are installed on your machine before starting:

| Tool | Version | Check Command |
|------|---------|---------------|
| **Python** | 3.11+ | `python --version` |
| **Node.js** | 18+ | `node --version` |
| **MySQL** | 8.0+ | `mysql --version` |
| **ngrok** | Latest | `ngrok version` |
| **Playwright** | Latest | `playwright --version` |

---

## 📁 Project Structure

```
AI JOB WORK/
├── .env                    # Environment variables (DB, API keys, JWT)
├── docker-compose.yml      # Docker setup (optional)
├── backend/                # FastAPI + Python backend
│   ├── app/
│   │   ├── main.py         # FastAPI app entry point
│   │   ├── routers/        # API route handlers
│   │   ├── models/         # SQLAlchemy DB models
│   │   ├── services/       # Business logic & automation
│   │   └── db/             # Database session & config
│   ├── venv/               # Python virtual environment
│   └── requirements.txt    # Python dependencies
├── frontend/               # React + TypeScript frontend
│   ├── src/
│   │   ├── pages/          # Dashboard, Jobs, Applications, etc.
│   │   ├── components/     # Modals, Sidebar, Cards, etc.
│   │   └── services/       # API client (Axios)
│   └── package.json        # Node dependencies
├── Praveen_Resume.pdf      # Active resume file
└── Resume Praveen Kumar.html  # Resume HTML template (for PDF tailoring)
```

---

## ⚙️ Environment Setup

### 1. Clone / Open the project

```powershell
cd "c:\Users\impra\OneDrive\Desktop\AI JOB WORK"
```

### 2. Backend setup (first time only)

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
```

### 3. Frontend setup (first time only)

```powershell
cd frontend
npm install
```

### 4. Database setup (first time only)

Open MySQL and create the database:

```sql
CREATE DATABASE IF NOT EXISTS job_assistant;
```

The backend auto-creates all tables on first startup.

### 5. Configure `.env`

The `.env` file is in the project root. Key settings:

```env
# Database
DATABASE_URL=mysql+pymysql://root:your_password_here@127.0.0.1:3306/job_assistant

# AI Engine (NVIDIA NIM + Ollama)
NVIDIA_API_KEY=nvapi-xxxxx
OLLAMA_BASE_URL=http://localhost:11434

# Browser Automation
PLAYWRIGHT_HEADLESS=true   # Set to false for visible browser
```

---

## 🚀 Start Everything

Open **3 separate terminals** in VS Code (or PowerShell):

### Terminal 1 — Backend (FastAPI)

```powershell
cd "c:\Users\impra\OneDrive\Desktop\AI JOB WORK\backend"
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

✅ Backend is running at: **http://localhost:8000**
📖 API Docs available at: **http://localhost:8000/docs**

### Terminal 2 — Frontend (Vite + React)

```powershell
cd "c:\Users\impra\OneDrive\Desktop\AI JOB WORK\frontend"
npm run dev
```

✅ Frontend is running at: **http://localhost:5173**

### Terminal 3 — Ngrok (Optional — Remote Access)

```powershell
ngrok http 5173
```

✅ This gives you a public URL like: `https://xxxx-xxx.ngrok-free.dev`

> **Note:** Share this link to access HireMind from any device (phone, another PC, etc.)

---

## 🛑 Stop Everything

### Stop Backend

Press `Ctrl + C` in the backend terminal.

### Stop Frontend

Press `Ctrl + C` in the frontend terminal.

### Stop Ngrok

Press `Ctrl + C` in the ngrok terminal.

**OR** force-kill ngrok from any terminal:

```powershell
taskkill /F /IM ngrok.exe
```

### Stop All At Once (Nuclear Option)

```powershell
# Kill all related processes
taskkill /F /IM ngrok.exe 2>$null
taskkill /F /IM node.exe 2>$null
taskkill /F /IM python.exe 2>$null
```

> ⚠️ **Warning:** This kills ALL Python and Node processes on your machine, not just HireMind.

---

## 🌐 Ngrok (Remote Access)

### Start Ngrok Tunnel

```powershell
ngrok http 5173
```

### Get the Live Link

After running, ngrok shows output like:

```
Forwarding    https://repayment-gracious-overdue.ngrok-free.dev -> http://localhost:5173
```

Copy the `https://...ngrok-free.dev` URL — that's your live public link.

### Stop Ngrok Tunnel

```powershell
# Option 1: Ctrl+C in the ngrok terminal

# Option 2: Force kill from any terminal
taskkill /F /IM ngrok.exe
```

### Verify Ngrok is Stopped

```powershell
tasklist | findstr ngrok
```

If no output, ngrok is fully stopped.

### Ngrok Dashboard

While running, view tunnel stats at: **http://localhost:4040**

---

## 📌 Quick Reference Commands

| Action | Command | Terminal |
|--------|---------|----------|
| **Start Backend** | `cd backend && venv\Scripts\activate && uvicorn app.main:app --reload --port 8000` | Terminal 1 |
| **Start Frontend** | `cd frontend && npm run dev` | Terminal 2 |
| **Start Ngrok** | `ngrok http 5173` | Terminal 3 |
| **Stop Backend** | `Ctrl + C` | Terminal 1 |
| **Stop Frontend** | `Ctrl + C` | Terminal 2 |
| **Stop Ngrok** | `Ctrl + C` or `taskkill /F /IM ngrok.exe` | Terminal 3 |
| **Build Frontend** | `cd frontend && npm run build` | Any |
| **Check Backend Health** | Open `http://localhost:8000/` | Browser |
| **View API Docs** | Open `http://localhost:8000/docs` | Browser |
| **Ngrok Dashboard** | Open `http://localhost:4040` | Browser |

---

## 🔍 Troubleshooting

### Backend won't start

```
Error: Can't connect to MySQL server
```

→ Make sure MySQL is running. Open Services (Win+R → `services.msc`) and start **MySQL80**.

### Frontend shows blank page

→ Check that the backend is running on port 8000. The frontend calls `http://localhost:8000/api/`.

### Ngrok link not working after stop

→ Run `taskkill /F /IM ngrok.exe` to make sure the process is fully dead.

### Browser automation not working

→ Make sure Playwright browsers are installed:

```powershell
cd backend
venv\Scripts\activate
playwright install chromium
```

→ For visible browser (debugging), set in `.env`:

```env
PLAYWRIGHT_HEADLESS=false
```

### Port already in use

```powershell
# Find what's using port 8000
netstat -ano | findstr :8000

# Kill by PID
taskkill /F /PID <PID_NUMBER>
```

---

## 🏗️ Docker (Alternative Setup)

If you prefer Docker instead of manual setup:

```powershell
cd "c:\Users\impra\OneDrive\Desktop\AI JOB WORK"
docker-compose up -d
```

This starts:
- **Backend** on port `8000`
- **Frontend** on port `3000`
- **Redis** on port `6379`

Stop with:

```powershell
docker-compose down
```

---

## 📞 Ports Summary

| Service | Port | URL |
|---------|------|-----|
| Frontend (Vite) | 5173 | http://localhost:5173 |
| Backend (FastAPI) | 8000 | http://localhost:8000 |
| API Docs (Swagger) | 8000 | http://localhost:8000/docs |
| Ngrok Dashboard | 4040 | http://localhost:4040 |
| MySQL | 3306 | localhost:3306 |
| Ollama AI | 11434 | http://localhost:11434 |
| Redis | 6379 | localhost:6379 |

---

## 👨‍💻 Credits

**Designed & Developed by Praveen Kumar**

📧 praveen.pr105@gmail.com
📱 +91 9504904499
📍 Dhanbad, India

© 2026 Praveen Kumar. All rights reserved.
