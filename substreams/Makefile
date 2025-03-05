protogen:
	substreams protogen /Users/kurtis.streutker/Documents/github/solana-m/substreams/substreams.yaml --exclude-paths sf,types.proto,instructions.proto,transactions.proto,google && \
	mv src/pb/transfers.v1.rs src/pb/transfers.rs && \
	echo 'pub mod transfers;\n\npub use transfers::*;' > src/pb/mod.rs

build:
	cargo build --target wasm32-unknown-unknown --release
