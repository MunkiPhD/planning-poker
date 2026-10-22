FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
# tsx is a production dependency because `npm start` runs the TypeScript server via tsx
RUN npm ci --omit=dev
COPY src ./src
COPY tsconfig.json ./
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
