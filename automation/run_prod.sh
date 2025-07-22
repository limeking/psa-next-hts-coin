#!/bin/bash
# run_prod.sh: 운영 환경 실행

# Nginx 설정 dev/prod 모두 생성
python automation/generate_nginx_conf.py

# 운영용 docker-compose 실행
docker-compose -f docker-compose.prod.yml --env-file .env.prod up --build -d