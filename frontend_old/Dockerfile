FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3000

ENV HOSTNAME=0.0.0.0 \
    PORT=3000

CMD ["npm", "run", "dev"]
