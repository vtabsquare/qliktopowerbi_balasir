# Build Stage for .NET (TomTmdlBridge)
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS dotnet-builder
WORKDIR /app
COPY tools/TomTmdlBridge/ ./tools/TomTmdlBridge/
RUN dotnet build ./tools/TomTmdlBridge/TomTmdlBridge.csproj -c Release

# Build Stage for Node (Vite/React)
FROM node:20-slim AS node-builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# Copy the compiled .NET bridge from the previous stage
COPY --from=dotnet-builder /app/tools/TomTmdlBridge/bin/Release/net8.0 /app/tools/TomTmdlBridge/bin/Release/net8.0
RUN npm run build

# Production Stage
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
COPY package.json package-lock.json* ./
RUN npm install --production
COPY --from=node-builder /app/dist ./dist
# If you are using a server file or Start server, copy it too
# COPY --from=node-builder /app/server.js ./server.js (modify as needed)
COPY --from=node-builder /app/tools/TomTmdlBridge/bin/Release/net8.0 ./tools/TomTmdlBridge/bin/Release/net8.0
COPY --from=node-builder /app/scripts ./scripts
# Start the server (modify according to your production start script)
CMD ["npm", "run", "start"]
