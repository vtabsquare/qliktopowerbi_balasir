# Build Stage for .NET (TomTmdlBridge)
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS dotnet-builder
WORKDIR /app
COPY tools/TomTmdlBridge/ ./tools/TomTmdlBridge/
RUN dotnet build ./tools/TomTmdlBridge/TomTmdlBridge.csproj -c Release

# Production Stage (Node only - deliberately missing .NET SDK)
FROM node:22-slim

WORKDIR /app
# Install Node dependencies
COPY package.json package-lock.json* ./
COPY scripts/ scripts/
RUN npm install

# Copy rest of the application
COPY . .

# Copy the compiled .NET bridge from the first stage
COPY --from=dotnet-builder /app/tools/TomTmdlBridge/bin/Release/net8.0 ./tools/TomTmdlBridge/bin/Release/net8.0

# Build the Vite/React app
RUN npm run build

# Start the server
CMD ["npm", "run", "start"]
