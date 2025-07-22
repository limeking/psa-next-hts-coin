#!/bin/bash
# run_dev.sh: 개발 환경 실행

# Nginx 설정 dev/prod 모두 생성
python automation/generate_nginx_conf.py

# 개발용 docker-compose 실행
# docker-compose -f docker-compose.dev.yml up -d

docker-compose -f docker-compose.dev.yml up -d --build