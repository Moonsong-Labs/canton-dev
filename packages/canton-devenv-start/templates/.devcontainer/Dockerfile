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

# Install DAML SDK
ARG DAML_VERSION=2.10.2
ARG DAML_PLATFORM=linux
RUN curl -L "https://github.com/digital-asset/daml/releases/download/v${DAML_VERSION}/daml-sdk-${DAML_VERSION}-${DAML_PLATFORM}.tar.gz" -o daml.tar.gz && \
    mkdir -p /home/daml/daml-sdk && \
    tar -xzf daml.tar.gz -C /home/daml/daml-sdk --strip-components=1 && \
    rm daml.tar.gz && \
    /home/daml/daml-sdk/install.sh

# Pre-seed the VS Code server extensions with the DAML extension
RUN mkdir -p /home/daml/.vscode-server/extensions && \
    tmp=$(mktemp -d) && \
    unzip -q "/home/daml/.daml/sdk/${DAML_VERSION}/studio/daml-bundled.vsix" -d "$tmp" && \
    id=$(node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(`${j.publisher}.${j.name}-${j.version}`);' "$tmp/extension/package.json") && \
    rm -rf "/home/daml/.vscode-server/extensions/$id" && \
    mkdir -p "/home/daml/.vscode-server/extensions/$id" && \
    cp -a "$tmp/extension/." "/home/daml/.vscode-server/extensions/$id/" && \
    rm -rf "$tmp" && \
    echo "✓ DAML extension pre-installed in VS Code server"

# Copy VSIX to home directory for easy manual installation if needed
RUN cp "/home/daml/.daml/sdk/${DAML_VERSION}/studio/daml-bundled.vsix" /home/daml/daml-bundled.vsix && \
    echo "✓ VSIX copied to /home/daml/daml-bundled.vsix for manual installation"

# Install Canton (open-source)
ARG CANTON_VERSION=2.10.2
ENV CANTON_HOME=/home/daml/canton
RUN curl -L "https://github.com/digital-asset/canton/releases/download/v${CANTON_VERSION}/canton-open-source-${CANTON_VERSION}.tar.gz" -o canton.tgz && \
    mkdir -p "${CANTON_HOME}" && \
    tar -xzf canton.tgz -C "${CANTON_HOME}" --strip-components=1 && \
    rm canton.tgz

ENV PATH="/home/daml/.daml/bin:${CANTON_HOME}/bin:${PATH}"

WORKDIR /workspaces
