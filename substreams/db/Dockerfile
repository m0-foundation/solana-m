FROM alpine:3.21

WORKDIR /app

# Install required dependencies
RUN apk add --no-cache curl tar

# Download and install the pre-built binary
RUN curl -L https://github.com/streamingfast/substreams-sink-mongodb/releases/download/v2.1.0/substreams-sink-mongodb_linux_x86_64.tar.gz -o substreams-sink-mongodb.tar.gz && \
    tar -xzf substreams-sink-mongodb.tar.gz && \
    rm substreams-sink-mongodb.tar.gz && \
    chmod +x substreams-sink-mongodb

# Copy required files
COPY ./substreams/db .

# expects SUBSTREAMS_API_TOKEN
CMD ["sh", "-c", "./substreams-sink-mongodb run \"$MONGO_DNS\" solana-m-substream schema.json mainnet.sol.streamingfast.io:443 m-token-transactions.spkg map_transfer_events_to_db 335850995:335850999"]
