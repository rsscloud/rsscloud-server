#!/bin/bash

# Docker Build and Push Script for rsscloud-server
# Builds and pushes the Docker image to andrewshell/rsscloud-server on Docker Hub

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_REPO="andrewshell/rsscloud-server"
DOCKERFILE_PATH="apps/server/Dockerfile"
# The published version comes from the server package, not the private monorepo
# root (which stays at 0.0.0).
VERSION_PACKAGE_JSON="apps/server/package.json"

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Parse command line arguments
SKIP_QUALITY=false
CUSTOM_TAG=""
DRY_RUN=false

# Check for help first
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    show_usage() {
        echo "Usage: $0 [OPTIONS] [CUSTOM_TAG]"
        echo ""
        echo "Options:"
        echo "  --skip-quality    Skip quality checks (typecheck, lint, unit tests)"
        echo "  --dry-run         Show what would be done without executing"
        echo "  -h, --help        Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0                        # Build and push with version + latest tags"
        echo "  $0 beta                   # Build and push with version + latest + beta tags"
        echo "  $0 --skip-quality         # Build and push without running quality checks"
        echo "  $0 --skip-quality v1.2.3  # Build and push with custom tag, skip quality checks"
        echo ""
    }
    show_usage
    exit 0
fi

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-quality)
            SKIP_QUALITY=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            CUSTOM_TAG="$1"
            shift
            ;;
    esac
done

# Function to check if Docker is running
check_docker() {
    log_info "Checking if Docker is running..."
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    log_success "Docker is running"
}

# Function to check Docker Hub login
check_docker_login() {
    log_info "Checking Docker Hub authentication..."
    if ! docker info | grep -q "Username:"; then
        log_warning "Not logged into Docker Hub. Attempting login..."
        if ! docker login; then
            log_error "Failed to login to Docker Hub. Please run 'docker login' manually."
            exit 1
        fi
    fi
    log_success "Docker Hub authentication verified"
}

# Function to run quality checks
run_quality_checks() {
    if [ "$SKIP_QUALITY" = true ]; then
        log_warning "Skipping quality checks as requested"
        return 0
    fi

    log_info "Running quality checks..."

    log_info "Running TypeScript type checking..."
    if ! pnpm typecheck; then
        log_error "TypeScript type checking failed"
        exit 1
    fi

    log_info "Running ESLint..."
    if ! pnpm lint; then
        log_error "ESLint checks failed"
        exit 1
    fi

    log_info "Running unit tests..."
    if ! pnpm test:unit; then
        log_error "Unit tests failed"
        exit 1
    fi

    log_success "All quality checks passed"
}

# Function to get version from the server package.json
get_version() {
    node -p "require('./${VERSION_PACKAGE_JSON}').version"
}

# Function to build Docker image
build_image() {
    local version=$(get_version)

    log_info "Building Docker image..."
    log_info "Version: $version"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would build image with tag: ${DOCKER_REPO}:${version}"
        log_info "[DRY RUN] Would tag as latest: ${DOCKER_REPO}:latest"
        if [ -n "$CUSTOM_TAG" ]; then
            log_info "[DRY RUN] Would tag with custom tag: ${DOCKER_REPO}:${CUSTOM_TAG}"
        fi
        log_success "[DRY RUN] Docker image build simulation completed"
        return 0
    fi

    # Build multi-platform image with version tag
    log_info "Building multi-platform image with tag: ${DOCKER_REPO}:${version}"
    log_info "Building for platforms: linux/amd64,linux/arm64"

    # Create buildx builder if it doesn't exist
    if ! docker buildx ls | grep -q multiplatform; then
        log_info "Creating multiplatform buildx builder..."
        docker buildx create --name multiplatform --use
    else
        docker buildx use multiplatform
    fi

    # Build all tags at once
    local tags="-t ${DOCKER_REPO}:${version} -t ${DOCKER_REPO}:latest"
    if [ -n "$CUSTOM_TAG" ]; then
        tags="$tags -t ${DOCKER_REPO}:${CUSTOM_TAG}"
    fi

    # Build and push multi-platform image with all tags
    # Using --no-cache to ensure fresh builds
    if ! docker buildx build -f "$DOCKERFILE_PATH" \
        --platform linux/amd64,linux/arm64 \
        $tags \
        --no-cache \
        --push .; then
        log_error "Docker multi-platform build failed"
        exit 1
    fi

    log_success "Docker image built successfully"
}

# Function to push Docker image (now handled in build step for multi-platform)
push_image() {
    local version=$(get_version)

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would push ${DOCKER_REPO}:${version}"
        log_info "[DRY RUN] Would push ${DOCKER_REPO}:latest"
        if [ -n "$CUSTOM_TAG" ]; then
            log_info "[DRY RUN] Would push ${DOCKER_REPO}:${CUSTOM_TAG}"
        fi
        log_success "[DRY RUN] All tags push simulation completed"
        return 0
    fi

    # Multi-platform images are pushed during build step
    log_success "Multi-platform images already pushed to Docker Hub during build"
}


# Function to display image info
show_image_info() {
    local version=$(get_version)

    echo ""
    log_success "🐳 Docker image build and push completed!"
    echo ""
    echo "📦 Image Repository: ${DOCKER_REPO}"
    echo "🏷️  Tags pushed:"
    echo "   • ${DOCKER_REPO}:${version}"
    echo "   • ${DOCKER_REPO}:latest"
    if [ -n "$CUSTOM_TAG" ]; then
        echo "   • ${DOCKER_REPO}:${CUSTOM_TAG}"
    fi
    echo ""
    echo "🚀 To run the image:"
    echo "   docker run -d -p 5337:5337 \\"
    echo "     -e DOMAIN=cloud.example.com \\"
    echo "     -e HUB_URL=https://cloud.example.com/websub \\"
    echo "     -v rsscloud-data:/app/apps/server/data \\"
    echo "     ${DOCKER_REPO}:latest"
    echo ""
}

# Main execution
main() {
    echo "🐳 rsscloud-server Docker Build & Push Script"
    echo "============================================="
    echo ""


    # Verify we're in the right directory
    if [ ! -f "package.json" ] || [ ! -f "$DOCKERFILE_PATH" ]; then
        log_error "Please run this script from the project root directory"
        exit 1
    fi

    # Run all checks and build steps
    check_docker
    check_docker_login
    run_quality_checks
    build_image
    push_image
    show_image_info
}

# Run main function with all arguments
main "$@"
