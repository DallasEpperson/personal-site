#!/bin/bash

# Configuration
BUCKET_NAME="dallasepperson-web"
DIST_DIR="dist"

# Function to display help
usage() {
    echo "Usage: ./deploy.sh [AWS_PROFILE]"
    echo ""
    echo "Arguments:"
    echo "  AWS_PROFILE    The name of the AWS CLI profile to use for deployment."
    echo "                 If not provided, the script will show this help menu."
    echo ""
    echo "Options:"
    echo "  --help, -h     Show this help message and exit."
    echo ""
    echo "Example:"
    echo "  ./deploy.sh my-dev-profile"
    echo ""
    exit 1
}

if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]] || [[ -z "$1" ]]; then
    usage
fi

PROFILE=$1

echo "🔍 Validating environment..."

if ! command -v aws &> /dev/null; then
    echo "❌ Error: AWS CLI is not installed."
    exit 1
fi

if ! aws configure list-profiles | grep -wq "$PROFILE"; then
    echo "❌ Error: AWS profile '$PROFILE' not found in local configuration."
    echo "Available profiles: $(aws configure list-profiles | xargs)"
    echo ""
    usage
fi

echo "✅ Profile '$PROFILE' validated."
echo "🚀 Starting deployment..."

echo "📦 Building project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Aborting deployment."
    exit 1
fi

echo "☁️ Syncing application to S3..."
aws s3 sync $DIST_DIR s3://$BUCKET_NAME \
    --profile $PROFILE \
    --delete \
    --exclude "data/*" \
    --cache-control "max-age=31536000, public"

echo "📊 Syncing track data..."
aws s3 sync public/data/ s3://$BUCKET_NAME/data/ \
    --profile $PROFILE \
    --cache-control "max-age=3600, public"

echo "---"
echo "✅ Deployment complete!"
echo "🔗 Site URL: http://$BUCKET_NAME.s3-website-us-east-1.amazonaws.com"