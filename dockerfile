FROM node:latest

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build TS → build/
RUN npm run build

# Cloud Run uses PORT
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
