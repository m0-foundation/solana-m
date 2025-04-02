.PHONY: test-yield-bot yield-bot-devnet test-local-validator test-sdk build-devnet upgrade-earn-devnet upgrade-portal-devnet


#
# Test commands
#
test-yield-bot:
	yarn jest --preset ts-jest tests/unit/yieldbot.test.ts 

test-sdk:
	@anchor localnet --skip-build > /dev/null 2>&1 & \
	anvil > /dev/null 2>&1 & \
	sleep 2 && \
	yarn jest --preset ts-jest tests/unit/sdk.test.ts ; \
	kill -9 $$(lsof -ti:8899)

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


#
# Devnet commands
#
yield-bot-devnet:
	@yarn --silent ts-node services/yield-bot/main.ts distribute \
	--rpc $(shell op read "op://Solana Dev/RPCs/helius-devnet") \
	--keypair $(shell op read "op://Solana Dev/Solana Program Keys/devnet-authority") \
	--dryRun


#
# Devnet upgrade commands
#
EARN_PROGRAM_ID := MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c
PORTAL_PROGRAM_ID := mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY
DEVNET_KEYPAIR := devnet-keypair.json
COMPUTE_UNIT_PRICE := 300000
MAX_SIGN_ATTEMPTS := 5

build-devnet:
	anchor build -- --features devnet --no-default-features

define upgrade_program
	@solana-keygen new --no-bip39-passphrase --force -s --outfile=temp-buffer.json
	@echo "\nWriting buffer for $(1) program..."
	@solana program write-buffer \
		--with-compute-unit-price $(COMPUTE_UNIT_PRICE) \
		--keypair $(DEVNET_KEYPAIR) \
		--max-sign-attempts $(MAX_SIGN_ATTEMPTS) \
		--buffer temp-buffer.json \
		target/deploy/$(1).so 
	@echo "Upgrading program with buffer $$(solana address --keypair temp-buffer.json)" 
	@solana program upgrade \
		--keypair $(DEVNET_KEYPAIR) \
		$$(solana address --keypair temp-buffer.json) \
		$(2) 
	@rm temp-buffer.json
endef

upgrade-earn-devnet: build-devnet
	$(call upgrade_program,earn,$(EARN_PROGRAM_ID))

upgrade-portal-devnet: build-devnet
	$(call upgrade_program,portal,$(PORTAL_PROGRAM_ID))
