FROM eclipse-temurin:17-jdk

# Build argument for SDK version - MUST be set by devcontainer.json
ARG DAML_SDK_VERSION

# Build arguments for the DAML Finance library build.
ARG DAML_FINANCE_REPO="https://github.com/digital-asset/daml-finance.git"
# Pin commit from "karen/daml-3.x-upgrade" branch
ARG DAML_FINANCE_REF="dd4e2a272fed7af0e5e4aba2efe5b5a6f129be6d"
ARG DAML_FINANCE_DIR="/home/daml/daml-finance"
ARG DAML_FINANCE_DPM_SDK_VERSION="3.4.9"
ARG DPM_CLI_VERSION="1.0.2"
ARG ORAS_VERSION="1.3.1"

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
        jq bc \
        locales \
        build-essential \
        make \
        sudo && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_VERSION}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends nodejs && \
    arch="$(dpkg --print-architecture)" && \
    case "$arch" in \
        amd64) oras_arch=amd64; yq_arch=amd64 ;; \
        arm64) oras_arch=arm64; yq_arch=arm64 ;; \
        *) echo "Unsupported architecture: $arch" && exit 1 ;; \
    esac && \
    curl -fsSL "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_${yq_arch}" -o /usr/local/bin/yq && \
    chmod +x /usr/local/bin/yq && \
    curl -fsSL "https://github.com/oras-project/oras/releases/download/v${ORAS_VERSION}/oras_${ORAS_VERSION}_linux_${oras_arch}.tar.gz" -o oras.tar.gz && \
    mkdir -p oras-install && \
    tar -zxf oras.tar.gz -C oras-install oras && \
    mv oras-install/oras /usr/local/bin/oras && \
    rm -rf oras.tar.gz oras-install && \
    npm install -g typescript ts-node react @tanstack/react-query vitest && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1001 -s /bin/bash daml || true && \
    echo "daml ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers && \
    mkdir -p /home/daml/.daml && \
    chown -R daml:daml /home/daml

USER daml
WORKDIR /home/daml

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Add Bun to PATH
ENV BUN_INSTALL="/home/daml/.bun"
ENV DPM_HOME="/home/daml/.dpm"
ENV PATH="${BUN_INSTALL}/bin:${DPM_HOME}/bin:/home/daml/.daml/bin:${PATH}"

# Install the DPM CLI from the same OCI artifact used by DAML Finance's Nix shell.
RUN mkdir -p "${DPM_HOME}/bin" && \
    tmp_dir="$(mktemp -d)" && \
    arch="$(dpkg --print-architecture)" && \
    case "$arch" in \
        amd64) dpm_platform=linux/amd64 ;; \
        arm64) dpm_platform=linux/arm64 ;; \
        *) echo "Unsupported architecture for dpm: $arch" && exit 1 ;; \
    esac && \
    oras pull --platform "${dpm_platform}" -o "${tmp_dir}" "europe-docker.pkg.dev/da-images/public/components/dpm:${DPM_CLI_VERSION}" && \
    install -m 755 "${tmp_dir}/dpm" "${DPM_HOME}/bin/dpm" && \
    rm -rf "${tmp_dir}" && \
    command -v dpm

# Install DAML SDK from GitHub releases
RUN echo "Installing DAML SDK version ${DAML_SDK_VERSION} from GitHub..." && \
    curl -fsSL -o daml-sdk.tar.gz \
        "https://github.com/digital-asset/daml/releases/download/v${DAML_SDK_VERSION}/daml-sdk-${DAML_SDK_VERSION}-linux.tar.gz" && \
    mkdir -p /home/daml/.daml/sdk/${DAML_SDK_VERSION} && \
    tar -xzf daml-sdk.tar.gz -C /home/daml/.daml/sdk/${DAML_SDK_VERSION} --strip-components=1 && \
    rm daml-sdk.tar.gz && \
    /home/daml/.daml/sdk/${DAML_SDK_VERSION}/daml/daml install /home/daml/.daml/sdk/${DAML_SDK_VERSION} --install-with-custom-version=${DAML_SDK_VERSION}

# Build DAML Finance once and keep the compiled DARs in the DAML Finance folder.
RUN mkdir -p "${DAML_FINANCE_DIR}" && \
    cd "${DAML_FINANCE_DIR}" && \
    git init && \
    git remote add origin "${DAML_FINANCE_REPO}" && \
    git fetch --depth 1 origin "${DAML_FINANCE_REF}" && \
    git checkout --detach FETCH_HEAD && \
    export REPO_ROOT="${DAML_FINANCE_DIR}" && \
    export DPM_REGISTRY="europe-docker.pkg.dev/da-images/public-all" && \
    export DPM_HOME="${DAML_FINANCE_DIR}/.dpm" && \
    export DPM_SDK_VERSION="${DAML_FINANCE_DPM_SDK_VERSION}" && \
    export DIRENV_DIR="${DAML_FINANCE_DIR}" && \
    export TMPDIR=/var/tmp && \
    dpm install "${DAML_FINANCE_DPM_SDK_VERSION}" && \
    make build-all

WORKDIR /workspaces
