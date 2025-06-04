FROM node:22

COPY . /
RUN npm ci
RUN npm run build

ENTRYPOINT ["node", "/dist/index.js"]
