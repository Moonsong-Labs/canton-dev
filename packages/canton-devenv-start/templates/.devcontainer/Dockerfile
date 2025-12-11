FROM eclipse-temurin:17-jdk

# Build argument for SDK version - MUST be set by devcontainer.json
ARG DAML_SDK_VERSION

# Validate that DAML_SDK_VERSION is provided
RUN if [ -z "$DAML_SDK_VERSION" ]; then \
      echo "ERROR: DAML_SDK_VERSION build argument is required" && exit 1; \
    fi

# Persist DAML_SDK_VERSION as ENV for runtime use
ENV DAML_SDK_VERSION=${DAML_SDK_VERSION}

ENV DEBIAN_FRONTEND=noninteractive \
    TERM=dumb \
    NODE_VERSION=22

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
    npm install -g typescript ts-node react @tanstack/react-query vitest && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1001 -s /bin/bash daml || true && \
    mkdir -p /home/daml/.daml && \
    chown -R daml:daml /home/daml

USER daml
WORKDIR /home/daml

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Add Bun to PATH
ENV BUN_INSTALL="/home/daml/.bun"
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

# Install DAML SDK from GitHub releases
RUN echo "Installing DAML SDK version ${DAML_SDK_VERSION} from GitHub..." && \
    curl -sSL "https://github.com/digital-asset/daml/releases/download/v${DAML_SDK_VERSION}/daml-sdk-${DAML_SDK_VERSION}-linux.tar.gz" -o daml-sdk.tar.gz && \
    mkdir -p /home/daml/.daml/sdk/${DAML_SDK_VERSION} && \
    tar -xzf daml-sdk.tar.gz -C /home/daml/.daml/sdk/${DAML_SDK_VERSION} --strip-components=1 && \
    rm daml-sdk.tar.gz && \
    /home/daml/.daml/sdk/${DAML_SDK_VERSION}/daml/daml install /home/daml/.daml/sdk/${DAML_SDK_VERSION} --install-with-custom-version=${DAML_SDK_VERSION}

WORKDIR /workspaces
