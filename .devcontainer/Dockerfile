# syntax=docker/dockerfile:1.7
#
# canton-dev JetBrains devcontainer image.
#
# Two stages:
#   1. plugin-builder — JDK 21 + Gradle wrapper, compiles
#      packages/canton-jetbrains-plugin/ into a .zip.
#   2. runtime — JDK 17 + DAML SDK (via dpm), with the plugin .zip extracted
#      into /opt/jetbrains-plugins so the JetBrains backend loads it via
#      idea.plugins.path. Mirrors packages/canton-devenv-start/templates/
#      .devcontainer/latest/Dockerfile so the user-visible UX stays consistent.

# ─────────────────────────────────────────────────────────────────────────
# Stage 1: build the plugin .zip with Gradle.
# ─────────────────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jdk AS plugin-builder

WORKDIR /src

# Cache-friendly: copy build files first so Gradle's dependency resolution
# layer is reused across plugin source edits.
COPY packages/canton-jetbrains-plugin/gradle/ /src/gradle/
COPY packages/canton-jetbrains-plugin/gradlew /src/gradlew
COPY packages/canton-jetbrains-plugin/gradlew.bat /src/gradlew.bat
COPY packages/canton-jetbrains-plugin/settings.gradle.kts /src/settings.gradle.kts
COPY packages/canton-jetbrains-plugin/build.gradle.kts /src/build.gradle.kts
COPY packages/canton-jetbrains-plugin/gradle.properties /src/gradle.properties
RUN chmod +x /src/gradlew

# Sources after build files (changes more often, hits a deeper cache layer).
COPY packages/canton-jetbrains-plugin/src/ /src/src/

# Build. --no-daemon because daemon would just exit at stage end.
RUN ./gradlew --no-daemon buildPlugin

# Sanity: exactly one zip should land in build/distributions/.
RUN ls -1 /src/build/distributions/canton-jetbrains-plugin-*.zip

# ─────────────────────────────────────────────────────────────────────────
# Stage 2: runtime image. Mirrors the existing canton-devenv-start
# /templates/.devcontainer/latest/Dockerfile (eclipse-temurin:17-jdk +
# `daml` non-root user + dpm-installed DAML SDK) and adds JetBrains
# plugin staging.
# ─────────────────────────────────────────────────────────────────────────
FROM eclipse-temurin:17-jdk

ARG DAML_SDK_VERSION=3.4.11
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
    npm install -g typescript ts-node react @tanstack/react-query vitest && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Non-root developer user (uid 1001 matches the existing canton-dev pattern).
RUN useradd -m -u 1001 -s /bin/bash daml || true && \
    echo "daml ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers && \
    mkdir -p /home/daml/.daml && \
    chown -R daml:daml /home/daml

# JetBrains plugin staging.
#
# /opt/jetbrains-plugins is what idea.plugins.path will point to. The IDE
# backend reads $IDEA_PROPERTIES at JVM startup and overrides its plugin
# directory accordingly. World-readable (a+rX) so any container user the
# RemoteDev backend chooses can load it.
#
# Reference:
# https://www.jetbrains.com/help/idea/directories-used-by-the-ide-to-store-settings-caches-plugins-and-logs.html
COPY --from=plugin-builder /src/build/distributions/canton-jetbrains-plugin-*.zip /tmp/plugin.zip
RUN mkdir -p /opt/jetbrains-plugins && \
    unzip -q /tmp/plugin.zip -d /opt/jetbrains-plugins && \
    rm /tmp/plugin.zip && \
    chmod -R a+rX /opt/jetbrains-plugins
RUN mkdir -p /etc/idea && \
    printf 'idea.plugins.path=/opt/jetbrains-plugins\n' > /etc/idea/idea.properties

USER daml
WORKDIR /home/daml

# Bun (parity with the existing latest template; harmless if unused).
RUN curl -fsSL https://bun.sh/install | bash
ENV BUN_INSTALL="/home/daml/.bun"
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

# DAML SDK install via dpm (parity with the existing latest template).
ENV DPM_HOME="/home/daml/.dpm"
ENV PATH="${DPM_HOME}/bin:/home/daml/.daml/bin:${PATH}"
RUN echo "Installing dpm and SDK version ${DAML_SDK_VERSION}..." && \
    curl -fsSL https://get.digitalasset.com/install/install.sh | sh && \
    dpm install ${DAML_SDK_VERSION}

WORKDIR /workspaces
