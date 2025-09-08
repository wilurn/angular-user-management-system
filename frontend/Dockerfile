# Development Dockerfile for Angular Frontend
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Expose port
EXPOSE 4200

# Start the application in development mode
CMD ["npm", "start", "--", "--host", "0.0.0.0", "--poll", "2000"]