FROM ubuntu:16.04
COPY . /home/bitswap
WORKDIR /home/bitswap
RUN apt-get -y update
ENV NODE_VERSION=12.17.0
RUN apt install -y curl
RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.34.0/install.sh | bash
ENV NVM_DIR=/root/.nvm
RUN . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm use v${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm alias default v${NODE_VERSION}
ENV PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"
RUN cat /etc/os-release
RUN npm -v
RUN node -v
RUN npm install && npm run test:node
