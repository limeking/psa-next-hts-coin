import os
import sys
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(PROJECT_ROOT)

def make_dockerfiles(frontend_path):
    dev = '''FROM node:18
WORKDIR /app
COPY package.json .
COPY package-lock.json .
RUN npm install
COPY . .
CMD ["npm", "start"]
'''
    prod = '''FROM node:18 AS build
WORKDIR /app
COPY package.json .
COPY package-lock.json .
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
HEALTHCHECK --interval=30s --timeout=10s CMD curl -f http://localhost/ || exit 1
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
'''
    dockerignore = '''node_modules
build
dist
.git
.gitignore
.env
.env.*
'''
    with open(os.path.join(frontend_path, "Dockerfile.dev"), "w", encoding="utf-8") as f:
        f.write(dev)
    with open(os.path.join(frontend_path, "Dockerfile.prod"), "w", encoding="utf-8") as f:
        f.write(prod)
    with open(os.path.join(frontend_path, ".dockerignore"), "w", encoding="utf-8") as f:
        f.write(dockerignore)
    print(f"✅ Dockerfile.dev, Dockerfile.prod, .dockerignore 자동 생성: {frontend_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python automation/add_frontend_dockerfiles.py [프론트엔드폴더경로]")
        exit(1)
    make_dockerfiles(sys.argv[1])
