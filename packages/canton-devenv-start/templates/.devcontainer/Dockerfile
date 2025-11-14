FROM eclipse-temurin:17-jdk

ENV DEBIAN_FRONTEND=noninteractive \
    TERM=dumb \
    NODE_VERSION=18

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        git \
        curl \
        ca-certificates \
        gnupg \
        bash \
        unzip \
        locales \
        build-essential \
        make && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_VERSION}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1001 -s /bin/bash daml || true && \
    mkdir -p /home/daml/.daml && \
    chown -R daml:daml /home/daml

USER daml
WORKDIR /home/daml

# Install DAML SDK via dpm
ENV DPM_HOME=/home/daml/.dpm
ENV PATH="${DPM_HOME}/bin:/home/daml/.daml/bin:${PATH}"
RUN curl -sSL https://get.digitalasset.com/install/install.sh | sh

WORKDIR /workspaces
