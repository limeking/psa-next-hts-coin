# automation/generate_nginx_conf.py
import os
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MODULES_DIR = BASE_DIR / 'backend/app/modules'
NGINX_DEV_CONF = BASE_DIR / 'nginx/nginx.dev.conf'
NGINX_PROD_CONF = BASE_DIR / 'nginx/nginx.prod.conf'

COMMON_PROXY_HEADERS = """
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
"""

WEBSOCKET_HEADERS = """
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_http_version 1.1;
"""

def load_modules_meta():
    modules = []
    for module_name in os.listdir(MODULES_DIR):
        module_path = MODULES_DIR / module_name
        info_path = module_path / 'module_info.json'
        if info_path.exists():
            with open(info_path, 'r', encoding='utf-8') as f:
                info = json.load(f)
                if info.get('enabled', True):
                    modules.append({
                        "name": module_name,
                        "ws_needed": info.get("ws_needed", False)
                    })
    return modules

def generate_nginx_dev_conf(modules):
    lines = ["server {", "    listen 80;"]
    for module in modules:
        lines.append(f"    location /api/{module['name']}/ {{")
        lines.append(f"        proxy_pass http://backend:8000/{module['name']}/;")
        lines.append(COMMON_PROXY_HEADERS.rstrip())
        if module.get("ws_needed"):
            lines.append(WEBSOCKET_HEADERS.rstrip())
        lines.append("    }")
    lines.append("    location / {")
    lines.append("        proxy_pass http://host.docker.internal:3000;")
    lines.append("    }")
    lines.append("}")
    with open(NGINX_DEV_CONF, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f"✅ {NGINX_DEV_CONF} regenerated.")

def generate_nginx_prod_conf(modules):
    lines = ["server {", "    listen 80;"]
    for module in modules:
        lines.append(f"    location /api/{module['name']}/ {{")
        lines.append(f"        proxy_pass http://backend:8000/{module['name']}/;")
        lines.append(COMMON_PROXY_HEADERS.rstrip())
        if module.get("ws_needed"):
            lines.append(WEBSOCKET_HEADERS.rstrip())
        lines.append("    }")
    lines.append("    location / {")
    lines.append("        root /usr/share/nginx/html;")
    lines.append("        try_files $uri /index.html;")
    lines.append("    }")
    lines.append("}")
    with open(NGINX_PROD_CONF, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f"✅ {NGINX_PROD_CONF} regenerated.")


def main():
    modules = load_modules_meta()
    print(f"[INFO] Enabled modules: {modules}")
    generate_nginx_dev_conf(modules)
    generate_nginx_prod_conf(modules)

if __name__ == '__main__':
    main()
