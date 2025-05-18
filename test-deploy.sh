#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting test deployment pipeline..."

# Step 1: Install dependencies
echo "📦 Installing dependencies..."
bun install

# Step 2: Type check and test
echo "🧪 Running type check and tests..."
bun run typecheck
bun test

# Step 3: Build
echo "🔨 Building project..."
bun run build

# Step 4: Create deployment package
echo "📦 Creating deployment package..."
mkdir -p deploy
cp -r dist/* deploy/
cp lambda.js deploy/
cp package.json deploy/
cp bun.lockb deploy/
cd deploy
bun install --production
zip -r ../function.zip .
cd ..

# Step 5: Cleanup
echo "🧹 Cleaning up..."
rm -rf deploy

echo "✅ Test deployment pipeline completed successfully!"
echo "📦 Deployment package created: function.zip"
echo ""
echo "To deploy to AWS Lambda, you would need to:"
echo "1. Configure AWS credentials"
echo "2. Run: aws lambda update-function-code --function-name calfire-gis-mcp-server --zip-file fileb://function.zip"
echo "3. Run: aws lambda update-function-configuration --function-name calfire-gis-mcp-server --environment Variables={NODE_ENV=production,VERSION=$(node -p "require('./package.json').version")} --timeout 30 --memory-size 512" 