#!/bin/bash

echo "🚀 Starting User Management System Development Environment"

# Start infrastructure services
echo "📦 Starting infrastructure services (PostgreSQL, Redis, MinIO)..."
docker-compose up -d postgres redis minio

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are healthy
echo "🔍 Checking service health..."
docker-compose ps

echo "✅ Infrastructure services are ready!"
echo ""
echo "🔧 To start the applications:"
echo "  Backend:  cd backend && npm run start:dev"
echo "  Frontend: cd frontend && npm start"
echo ""
echo "🌐 Access URLs:"
echo "  Frontend:     http://localhost:4200"
echo "  Backend API:  http://localhost:3000"
echo "  MinIO Console: http://localhost:9001 (minioadmin/minioadmin)"
echo ""
echo "📊 Database:"
echo "  PostgreSQL:   localhost:5432"
echo "  Redis:        localhost:6379"