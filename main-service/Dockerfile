FROM node:22.3.0

WORKDIR /main-service

COPY package.json /main-service

RUN npm install

COPY . /main-service

RUN npm run build

CMD [ "sh", "-c", "if [ \"$NODE_ENV\" = 'development' ]; then npm run dev; else npm start; fi" ]