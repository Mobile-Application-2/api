FROM node:22.3.0

WORKDIR /game-service

COPY package.json /game-service

RUN npm install

COPY . /game-service

CMD ["npm", "start"]