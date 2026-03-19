# Stage 1: Build the frontend
FROM node:20-bookworm AS build-stage

WORKDIR /app

# Copy ONLY package.json to avoid host-side lockfile interference (e.g. Windows native pins)
COPY frontend/package.json ./

# Fresh install for the container environment
RUN npm install

# Copy the rest of the frontend source
COPY frontend/ ./

# Build the production application
RUN npm run build

# Stage 2: Serve the frontend using Nginx
FROM nginx:stable-alpine

# Copy the built assets from the build stage
COPY --from=build-stage /app/dist /usr/share/nginx/html

# Copy the Nginx configuration
COPY nginx/nginx_fixed.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
