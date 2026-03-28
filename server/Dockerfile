FROM node:18-bullseye

# Install system dependencies for node-canvas
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and models
COPY . .

# Expose the API port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
