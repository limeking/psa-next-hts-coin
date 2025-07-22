#!/bin/bash
docker-compose -f docker-compose.dev.yml down -v
sudo rm -rf db/data/* redis/data/*
echo "✅ 도커 컨테이너/볼륨/데이터 완전초기화!"
