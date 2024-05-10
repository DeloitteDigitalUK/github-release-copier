FROM node:20

COPY . /
RUN npm ci
RUN npm run build

ENTRYPOINT ["node", "/dist/index.js"]
