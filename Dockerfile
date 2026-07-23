# Build Stage for .NET (TomTmdlBridge)
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS dotnet-builder
WORKDIR /app
COPY tools/TomTmdlBridge/ ./tools/TomTmdlBridge/
RUN dotnet build ./tools/TomTmdlBridge/TomTmdlBridge.csproj -c Release

# Production Stage (Node + .NET Runtime)
FROM node:20-slim
# Install .NET Runtime (required to run the DLL)
RUN apt-get update && apt-get install -y wget \
    && wget https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb -O packages-microsoft-prod.deb \
    && dpkg -i packages-microsoft-prod.deb \
    && rm packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y aspnetcore-runtime-8.0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

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
