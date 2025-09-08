# User Management System

A comprehensive full-stack user management application built with Angular 17, NestJS, PostgreSQL, and Redis.

## Features

- Complete user CRUD operations
- JWT-based authentication
- Role-based access control (Admin, Manager, User)
- User profile management with file uploads
- Password reset functionality
- Dashboard with analytics and statistics
- Audit logging for all user activities
- Bulk administrative operations
- User impersonation for support
- GDPR compliance features
- Responsive UI with Angular Material

## Technology Stack

### Frontend
- Angular 17 with TypeScript
- Angular Material for UI components
- NgRx for state management
- Chart.js for analytics visualization
- Reactive Forms for form handling

### Backend
- NestJS with TypeScript
- Prisma ORM for database operations
- Passport.js for authentication
- JWT for token-based auth
- bcrypt for password hashing
- Class-validator for input validation

### Database & Storage
- PostgreSQL for primary database
- Redis for caching and session storage
- MinIO for file storage (S3 compatible)

### Infrastructure
- Docker & Docker Compose
- Environment-based configuration

## Quick Start

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd user-management-system
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Start the development environment:
```bash
docker-compose up -d
```

4. Install dependencies:
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

5. Run database migrations:
```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

6. Start the applications:
```bash
# Backend (in backend directory)
npm run start:dev

# Frontend (in frontend directory)
npm start
```

### Access the Application

- Frontend: http://localhost:4200
- Backend API: http://localhost:3000
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- MinIO Console: http://localhost:9001

## Development

### Project Structure
```
├── backend/                 # NestJS backend application
│   ├── src/                # Source code
│   ├── prisma/             # Database schema and migrations
│   └── Dockerfile          # Backend Docker configuration
├── frontend/               # Angular frontend application
│   ├── src/                # Source code
│   └── Dockerfile          # Frontend Docker configuration
├── docker-compose.yml      # Development environment setup
├── .env                    # Environment variables
└── README.md              # This file
```

### Available Scripts

#### Backend
```bash
npm run start:dev          # Start development server
npm run build              # Build for production
npm run test               # Run unit tests
npm run test:e2e           # Run e2e tests
npx prisma migrate dev     # Run database migrations
npx prisma studio          # Open Prisma Studio
```

#### Frontend
```bash
npm start                  # Start development server
npm run build              # Build for production
npm run test               # Run unit tests
npm run e2e                # Run e2e tests
npm run lint               # Run linting
```

### Database Management

#### Migrations
```bash
cd backend
npx prisma migrate dev --name <migration-name>
npx prisma generate
```

#### Reset Database
```bash
cd backend
npx prisma migrate reset
```

#### Seed Database
```bash
cd backend
npx prisma db seed
```

## Environment Variables

See `.env.example` for all available environment variables.

Key variables:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for JWT tokens
- `REDIS_URL`: Redis connection string
- `API_URL`: Backend API URL for frontend

## API Documentation

Once the backend is running, API documentation is available at:
- Swagger UI: http://localhost:3000/api

## Testing

### Backend Testing
```bash
cd backend
npm run test              # Unit tests
npm run test:e2e          # Integration tests
npm run test:cov          # Coverage report
```

### Frontend Testing
```bash
cd frontend
npm run test              # Unit tests
npm run e2e               # E2E tests
```

## Production Deployment

### Docker Production Build
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Manual Deployment
1. Build applications:
```bash
cd backend && npm run build
cd ../frontend && npm run build
```

2. Set production environment variables
3. Run database migrations
4. Start applications with PM2 or similar process manager

## Security Considerations

- Change default passwords in production
- Use strong JWT secrets
- Enable HTTPS in production
- Configure proper CORS settings
- Set up rate limiting
- Regular security updates

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License.