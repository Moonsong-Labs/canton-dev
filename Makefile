.PHONY: help dev-build dev-rebuild dev-shell build test clean verify

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
