import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(PROJECT_ROOT)

FOLDERS = [
    "backend/app/modules",
    "backend/app/routers",
    "frontend/src/modules",
    "nginx",
    "db/modules",
    "db/data",
    "redis/data",
    "logs/backend",    
    "logs/nginx",      
    "logs/mysql",
    "backend/app/core"       
]

FILES = {
    ".gitignore": """
# --- Python ---
__pycache__/
*.py[cod]
*.pyo
*.pyd
.mypy_cache/
.pytest_cache/
.venv/
venv/
.eggs/
*.egg-info/

# --- Jupyter Notebook ---
.ipynb_checkpoints/

# --- Node/React ---
node_modules/
build/
dist/
frontend/build/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-lock.yaml

# --- Env/Secrets ---
.env
.env.*
frontend/.env
*.pem
*.key
*.crt

# --- Docker/DB/Redis ---
docker-compose.override.yml
*.pid
*.sock
db/data/
redis/data/
*.db
*.sqlite3
backup/

# --- IDE/OS/Editor ---
.DS_Store
Thumbs.db
.vscode/
.idea/
.history/
.AppleDouble
*.swp

# --- Coverage/Logs ---
coverage.xml
.coverage*
*.log

# --- Temp/Etc ---
automation/tmp/
automation/__pycache__/

# === PSA-NEXT 실무 스켈레톤 전용 ===
# 주의: 아래 항목들은 반드시 git에 포함시켜야 하니 .gitignore에서 제거하세요!
# !README.md
# !*.md
""",
    ".dockerignore": """
**/node_modules
**/build
.git
.gitignore
.env
.env.*
db/data
redis/data
__pycache__/
*.pyc
*.pyo
*.log
.vscode
.idea
README.md
*.md
Dockerfile
""",
    "README.md": "# PSA-NEXT 실무형 자동화 프로젝트 스켈레톤\n",
    "backend/app/core/logging_config.py": '''
import logging
from logging.handlers import RotatingFileHandler
import os

LOG_DIR = os.environ.get("BACKEND_LOG_DIR", "/var/log/psa-next")
LOG_FILE = os.path.join(LOG_DIR, "backend.log")

def setup_logging():
    os.makedirs(LOG_DIR, exist_ok=True)
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    handler = RotatingFileHandler(LOG_FILE, maxBytes=10*1024*1024, backupCount=5)
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    # stdout도 출력(운영환경 겸용)
    logging.basicConfig(level=logging.INFO)
''',
    "backend/app/main.py": '''
from backend.app.core.logging_config import setup_logging
setup_logging()
from fastapi import FastAPI


app = FastAPI()


@app.get("/api/ping")
def ping():
    return {"message": "pong"}
''',
    "backend/requirements.txt": """
fastapi
uvicorn[standard]
pymysql
bcrypt
docker
""",
    "backend/Dockerfile.dev": """
FROM python:3.11-slim
WORKDIR /app
COPY . /app
RUN pip install --no-cache-dir -r requirements.txt
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--reload"]
""",
    "backend/Dockerfile.prod": """
FROM python:3.11-slim
WORKDIR /app
COPY . /app
RUN pip install --no-cache-dir -r backend/requirements.txt
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0"]
""",
    "nginx/nginx.dev.conf": """
server {
    listen 80;
    location /api/ {
        proxy_pass http://backend:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {
        proxy_pass http://host.docker.internal:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
""",
    "nginx/nginx.prod.conf": """
server {
    listen 80;
    location /api/ {
        proxy_pass http://backend:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {
        root /usr/share/nginx/html;
        try_files $uri /index.html;
    }
}
""",
    "nginx/Dockerfile": """
FROM nginx:alpine
COPY nginx.dev.conf /etc/nginx/conf.d/default.conf
""",
    "docker-compose.dev.yml": """
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    volumes:
      - ./:/app
      - ./logs/backend:/var/log/psa-next
    environment:
      - PYTHONPATH=/app
    ports:
      - "8000:8000"
    depends_on:
      - db
      - redis

  db:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: psa_db
    volumes:
      - ./db/data:/var/lib/mysql
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql
      - ./logs/mysql:/var/log/mysql
    ports:
      - "13306:3306"

  redis:
    image: redis:7
    volumes:
      - ./redis/data:/data
    ports:
      - "6379:6379"

  nginx:
    build:
      context: ./nginx
      dockerfile: Dockerfile
    volumes:
      - ./nginx/nginx.dev.conf:/etc/nginx/conf.d/default.conf
      - ./logs/nginx:/var/log/nginx
    ports:
      - "80:80"
    depends_on:
      - backend
""",
    "docker-compose.prod.yml": """
services:
  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile.prod
    environment:
      - PYTHONPATH=/app
      - PSA_PRODUCTION=1 
    ports:
      - "8000:8000"
    depends_on:
      - db
      - redis

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    ports:
      - "3000:80"
    depends_on:
      - backend

  db:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: psa_db
    volumes:
      - ./db/data:/var/lib/mysql
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "13306:3306"

  redis:
    image: redis:7
    volumes:
      - ./redis/data:/data
    ports:
      - "6379:6379"

  nginx:
    build:
      context: ./nginx
      dockerfile: Dockerfile
    volumes:
      - ./nginx/nginx.prod.conf:/etc/nginx/conf.d/default.conf
      - ./frontend/build:/usr/share/nginx/html:ro  # frontend 컨테이너에서 빌드된 파일 마운트(혹은 COPY)
    ports:
      - "80:80"
    depends_on:
      - backend
      - frontend
""",
        "frontend/src/App.js": '''
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

function App() {
  return (
    <Router>
      <Routes>
        {/* Route will be auto-injected by automation */}
      </Routes>
    </Router>
  );
}
export default App;
''',
    ".env.dev": "EXAMPLE_KEY=dev\n",
    ".env.prod": "EXAMPLE_KEY=prod\n",
    "db/init.sql": "-- 필요시 개발용 초기 SQL 작성\n"
}

def make_folders():
    for folder in FOLDERS:
        os.makedirs(folder, exist_ok=True)
        print(f'[폴더 생성] {folder}')

def make_files():
    for filepath, content in FILES.items():
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content.lstrip('\n'))
        print(f'[파일 생성] {filepath}')

if __name__ == '__main__':
    make_folders()
    make_files()
    print("\n✅ PSA-NEXT 실무형 도커/자동화 스켈레톤 생성 완료!")
    print("→ docker-compose -f docker-compose.dev.yml up 으로 바로 개발환경 실행하세요.")
    print("→ 도커파일/컨텍스트는 backend, nginx, frontend로만 분리되어 꼬일 일이 없습니다.")
