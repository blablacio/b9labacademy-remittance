FROM node:alpine

WORKDIR /remittance

ADD package.json .

RUN npm i

ADD . .
