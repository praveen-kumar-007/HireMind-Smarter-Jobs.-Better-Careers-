# 🛠️ HireMind — Complete Installation & Setup Guide

This guide provides step-by-step instructions to set up, configure, and run the HireMind platform on your local machine.

---

## 👨‍💻 Credits & Author
- **Designed & Developed by**: Praveen Kumar
- **Contact**: praveen.pr105@gmail.com | +91 9504904499
- **Location**: Dhanbad, Jharkhand, India

---

## 📋 System Requirements & Dependencies

Before setting up, ensure the following applications are installed:

| Dependency | Purpose | Download Link |
|------------|---------|---------------|
| **Python 3.11+** | Backend execution runtime | [Python Downloads](https://www.python.org/downloads/) |
| **Node.js 18+** | Frontend compilation and runtime | [NodeJS Downloads](https://nodejs.org/) |
| **MySQL Server 8.0+** | Main application database | [MySQL Installer](https://dev.mysql.com/downloads/installer/) |
| **Ollama** | Local offline AI inference engine | [Ollama.ai](https://ollama.com/) |
| **Google Chrome** | Active browser used for Playwright automation | [Google Chrome](https://www.google.com/chrome/) |

---

## 🤖 Required AI Models

HireMind uses a hybrid AI model approach: **Ollama** runs smaller models locally for basic form intelligence, while **NVIDIA NIM** acts as a high-speed fallback and runs reasoning models for complex questionnaire parsing.

### 1. Local Ollama Models (Required for Local Inference)
Open your terminal/command prompt and run the following command to download the required models:

```powershell
# Pull the primary lightweight model (Qwen 2.5/3 or Llama-3)
ollama pull qwen3:4b
```
*(Make sure the model name matches the `OLLAMA_PRIMARY_MODEL` configuration in your `.env` file).*

### 2. NVIDIA NIM Models (Required for Advanced/Fallback Reasoning)
Ensure you have an active NVIDIA Developer account and API Key. The platform utilizes:
- **Primary Engine**: `nvidia/nemotron-3-ultra-550b-a55b`
- **Fast Reasoning Engine**: `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`

---

## 🗄️ Database Setup

1. Open your MySQL Command Line Client or MySQL Workbench.
2. Run the following query to create the database:
   ```sql
   CREATE DATABASE IF NOT EXISTS job_assistant;
   ```
3. Ensure your MySQL username is `root` and the password matches your local MySQL server configuration.

---

## 🛠️ Step-by-Step Installation

### Step 1: Clone and Open Project
Open PowerShell or Command Prompt and navigate to the project directory:
```powershell
cd "c:\Users\impra\OneDrive\Desktop\AI JOB WORK"
```

### Step 2: Configure Environment Variables
Create or verify the `.env` file in the root directory. Populate it with the following configuration:

```env
# Database Configuration
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DB=job_assistant
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
DATABASE_URL=mysql+pymysql://root:your_mysql_password@127.0.0.1:3306/job_assistant

# JWT Config
JWT_SECRET=supersecretjwtkeythatisextremelysecureandhardtohack123456!
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# AI & LLM Service Config
AI_PROVIDER=ollama
NVIDIA_API_KEY=your-nvapi-key-here
NVIDIA_API_KEY_FALLBACK=your-fallback-nvapi-key-here
NVIDIA_PRIMARY_MODEL=nvidia/nemotron-3-ultra-550b-a55b
NVIDIA_FAST_MODEL=nvidia/nemotron-3-nano-omni-30b-a3b-reasoning

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_PRIMARY_MODEL=qwen3:4b
OLLAMA_FAST_MODEL=qwen3:4b
OLLAMA_TIMEOUT=30
EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2

# Playwright Browser Configuration
PLAYWRIGHT_HEADLESS=true
PORT=8000
HOST=0.0.0.0
```

### Step 3: Backend Setup
1. Navigate to the backend folder:
   ```powershell
   cd backend
   ```
2. Create a virtual environment:
   ```powershell
   python -m venv venv
   ```
3. Activate the virtual environment:
   ```powershell
   venv\Scripts\activate
   ```
4. Install all Python dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
5. Install Playwright browser engines:
   ```powershell
   playwright install chromium
   ```

### Step 4: Frontend Setup
1. Open a new terminal tab and navigate to the frontend folder:
   ```powershell
   cd "c:\Users\impra\OneDrive\Desktop\AI JOB WORK\frontend"
   ```
2. Install all Node.js dependencies:
   ```powershell
   npm install
   ```

---

## 🏃 Running the Application

Always start the backend first to ensure the API server and database connections are ready.

### 1. Start Backend Server
```powershell
cd "c:\Users\impra\OneDrive\Desktop\AI JOB WORK\backend"
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```
- **API URL**: `http://localhost:8000`
- **Swagger Docs**: `http://localhost:8000/docs`

### 2. Start Frontend Dev Server
```powershell
cd "c:\Users\impra\OneDrive\Desktop\AI JOB WORK\frontend"
npm run dev
```
- **Local Application URL**: `http://localhost:5173`

---

## 🌐 Remote Access (ngrok Setup)

To access your local dashboard on another device (such as a mobile phone or secondary computer):

1. Start ngrok forwarding to the frontend port:
   ```powershell
   ngrok http 5173
   ```
2. Copy the public forwarding address (e.g., `https://xxxx.ngrok-free.dev`).
3. Open the link on any device to access the live dashboard.
4. When finished, kill the ngrok process to stop public access:
   ```powershell
   taskkill /F /IM ngrok.exe
   ```

---

## 🤖 Playwright Browser Configurations
To view the browser automation live while it applies to jobs:
1. Open `.env` in the root folder.
2. Edit the following variable:
   ```env
   PLAYWRIGHT_HEADLESS=false
   ```
3. Save the file. When you trigger "Auto-Apply", a headed Chrome window will pop up showing the forms being filled and submitted.

---

## 👨‍💻 Development Credits
**Praveen Kumar** — Lead Designer and Developer. All rights reserved.
