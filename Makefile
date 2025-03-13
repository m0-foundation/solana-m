.PHONY: test-local-validator

test-local-validator:
	solana-test-validator --deactivate-feature EenyoWx9UMXYKpR8mW5Jmfmy2fRjzUtM7NduYMY8bx33 -r \
		--account 2yVjuQwpsvdsrywzsJJVs9Ueh4zayyo5DYJbBNc3DDpn tests/accounts/core_bridge_config.json \
		--account 9bFNrXNb2WTx8fMHXCheaZqkLZ3YCCaiqTftHxeintHy tests/accounts/core_bridge_fee_collector.json \
		--account DS7qfSAgYsonPpKoAjcGhX9VFjXdGkiHjEDkTidf8H2P tests/accounts/guardian_set_0.json \
		--bpf-program worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth tests/programs/core_bridge.so > /dev/null 2>&1 & \
	pid=$$! && \
	sleep 5 && \
	solana airdrop 25 TEstCHtKciMYKuaXJK2ShCoD7Ey32eGBvpce25CQMpM -ul && \
	anchor test --skip-local-validator ; \
	kill $$pid

test-sdk:
	solana-test-validator -r --bpf-program MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c target/deploy/earn.so > /dev/null 2>&1 & \
	pid=$$! && \
	sleep 5 && \
	solana airdrop 25 TEstCHtKciMYKuaXJK2ShCoD7Ey32eGBvpce25CQMpM -ul && \
	yarn jest --preset ts-jest tests/unit/sdk.test.ts ; \
	kill $$pid
