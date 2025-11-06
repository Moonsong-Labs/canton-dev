.PHONY: help dev-build dev-rebuild dev-shell build test clean verify localnet deploy nav json-api

PROJECT_PATH = examples/invoice-workflow
CONTAINER_NAME = canton-daml-dev
IMAGE_NAME = canton-daml-dev:latest

help:
	@echo "Canton DAML Development Environment"
	@echo "===================================="
	@echo ""
	@echo "VS Code Dev Container (Recommended):"
	@echo "  1. Open this folder in VS Code"
	@echo "  2. Install 'Remote - Containers' extension"
	@echo "  3. Click 'Reopen in Container' when prompted"
	@echo ""
	@echo "Command Line Usage:"
	@echo "  make dev-build    - Build dev container image"
	@echo "  make dev-rebuild  - Clean rebuild container image"
	@echo "  make dev-shell    - Open shell in dev container"
	@echo "  make build        - Build DAML contracts"
	@echo "  make test         - Run DAML tests"
	@echo "  make clean        - Clean build artifacts"
	@echo "  make verify       - Verify container setup"
	@echo "  make localnet     - Start Canton local network (p1, p2, local synchronizer)"
	@echo "  make deploy       - Upload DAR to ledger (DAR=path [SCRIPT=Module:setup] [LEDGER_HOST] [LEDGER_PORT])"
	@echo "  make nav          - Start Daml Navigator (NAV_PORT=7500 [LEDGER_HOST] [LEDGER_PORT])"
	@echo "  make json-api     - Start Daml JSON API (HTTP_PORT=7575 [LEDGER_HOST] [LEDGER_PORT])"
	@echo ""

dev-build:
	@echo "Building dev container..."
	docker build -t $(IMAGE_NAME) -f .devcontainer/Dockerfile .

dev-rebuild:
	@echo "Rebuilding dev container (clean)..."
	docker rmi $(IMAGE_NAME) 2>/dev/null || true
	docker build --no-cache -t $(IMAGE_NAME) -f .devcontainer/Dockerfile .

dev-shell:
	@echo "Starting dev container shell..."
	docker run -it --rm \
		-v "$(PWD):/workspaces/canton-dev:cached" \
		-w /workspaces/canton-dev \
		--name $(CONTAINER_NAME) \
		$(IMAGE_NAME) /bin/bash

build:
	@echo "Building DAML project..."
	docker run --rm \
		-v "$(PWD):/workspaces/canton-dev:cached" \
		-w /workspaces/canton-dev \
		$(IMAGE_NAME) \
		bash -c "cd $(PROJECT_PATH) && daml build"

test:
	@echo "Running DAML tests..."
	docker run --rm \
		-v "$(PWD):/workspaces/canton-dev:cached" \
		-w /workspaces/canton-dev \
		$(IMAGE_NAME) \
		bash -c "cd $(PROJECT_PATH) && daml test"

clean:
	@echo "Cleaning build artifacts..."
	docker run --rm \
		-v "$(PWD):/workspaces/canton-dev:cached" \
		-w /workspaces/canton-dev \
		$(IMAGE_NAME) \
		bash -c "cd $(PROJECT_PATH) && daml clean"

verify:
	@echo "Verifying container setup..."
	docker run --rm \
		-v "$(PWD):/workspaces/canton-dev:cached" \
		-w /workspaces/canton-dev \
		$(IMAGE_NAME) \
		bash -c "./verify-setup.sh"

localnet:
	@echo "Starting Canton local network..."
	canton daemon --auto-connect-local -c infra/canton/localnet.conf

deploy:
	@if [ -z "$(DAR)" ]; then \
		echo "Usage: make deploy DAR=path/to.dar [SCRIPT=Module:setup] [LEDGER_HOST=localhost LEDGER_PORT=5011]"; \
		exit 2; \
	fi
	@SCRIPT_ARG=""; \
	if [ -n "$(SCRIPT)" ]; then SCRIPT_ARG="--script $(SCRIPT)"; fi; \
	LEDGER_HOST="$(LEDGER_HOST)" LEDGER_PORT="$(LEDGER_PORT)" \
	bash scripts/deploy_dar.sh "$(DAR)" $$SCRIPT_ARG

nav:
	@LEDGER_HOST="$(LEDGER_HOST)" LEDGER_PORT="$(LEDGER_PORT)" NAV_PORT="$(NAV_PORT)" \
	bash scripts/start_navigator.sh

json-api:
	@LEDGER_HOST="$(LEDGER_HOST)" LEDGER_PORT="$(LEDGER_PORT)" HTTP_PORT="$(HTTP_PORT)" \
	bash scripts/start_json_api.sh
