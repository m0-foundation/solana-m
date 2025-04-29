FROM golang:1.24-alpine

WORKDIR /app
COPY ./substreams/db . 

RUN go install github.com/streamingfast/substreams-sink-mongodb/cmd/substreams-sink-mongodb@fd2965d  

CMD ["sh", "-c", "substreams-sink-mongodb run \"$MONGO_DNS\" solana-m-substream schema.json https://mainnet.sol.streamingfast.io:443 m-token-transactions.spkg map_transfer_events_to_db 335850995:335850999"]
