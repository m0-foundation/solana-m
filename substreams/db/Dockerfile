FROM golang:1.24-alpine

RUN go install github.com/streamingfast/substreams-sink-mongodb/cmd/substreams-sink-mongodb@latest

WORKDIR /app

CMD ["substreams-sink-mongodb", "run", "${MONGO_DNS}", "solana-m-substream", "schema.json", "https://mainnet.sol.streamingfast.io:443", "my.spkg", "db_out", "335850995:335850999"]
