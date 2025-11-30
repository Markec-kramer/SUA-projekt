FROM node:18-alpine

WORKDIR /app

COPY package.json package.json
RUN npm install --production

COPY . .

EXPOSE 4004

CMD ["node", "index.js"]

