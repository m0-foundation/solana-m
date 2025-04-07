.PHONY: test-yield-bot yield-bot-devnet test-local-validator test-sdk build-devnet upgrade-earn-devnet upgrade-portal-devnet upgrade-ext-earn-devnet deploy-yield-bot


#
# Test commands
#
test-yield-bot:
	yarn jest --preset ts-jest tests/unit/yieldbot.test.ts 

test-index-bot:
	yarn jest --preset ts-jest tests/unit/indexbot.test.ts

test-sdk:
	@anchor localnet --skip-build > /dev/null 2>&1 & \
	anvil -f https://gateway.tenderly.co/public/sepolia > /dev/null 2>&1 & \
	sleep 2 && \
	yarn jest --preset ts-jest tests/unit/sdk.test.ts ; \
	kill -9 $$(lsof -ti:8899) & kill -9 $$(lsof -ti:8545)

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
	--rpc $(shell op read "op://Solana Dev/Helius/dev rpc") \
	--keypair $(shell op read "op://Solana Dev/Solana Program Keys/devnet-authority") \
	--graphKey $(shell op read "op://Solana Dev/The Graph/credential") \
	--programID wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko \
	--dryRun


#
# Devnet upgrade commands
#
EARN_PROGRAM_ID := MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c
EXT_EARN_PROGRAM_ID := wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko
PORTAL_PROGRAM_ID := mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY
DEVNET_KEYPAIR := devnet-keypair.json
COMPUTE_UNIT_PRICE := 300000
MAX_SIGN_ATTEMPTS := 5

build-devnet:
	anchor build -- --features devnet --no-default-features

define build-verified-devnet
	@echo "Building verified $(1) program for devnet...\n"
	solana-verify build --library-name $(1) -- --features devnet --no-default-features
endef

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

upgrade-earn-devnet: 
	$(call build-verified-devnet,earn)
	$(call upgrade_program,earn,$(EARN_PROGRAM_ID))

upgrade-ext-earn-devnet:
	$(call build-verified-devnet,ext_earn)
	$(call upgrade_program,ext_earn,$(EXT_EARN_PROGRAM_ID))

upgrade-portal-devnet:
	$(call build-verified-devnet,portal)
	$(call upgrade_program,portal,$(PORTAL_PROGRAM_ID))


#
# Railway infra
#
deploy-yield-bot:
	railway environment development
	docker build --build-arg now="$$(date -u +"%Y-%m-%dT%H:%M:%SZ")" --platform linux/amd64 -t ghcr.io/m0-foundation/solana-m:yield-bot -f services/yield-bot/Dockerfile .
	docker push ghcr.io/m0-foundation/solana-m:yield-bot
	railway redeploy --service "yield bot - M" --yes
	railway redeploy --service "yield bot - wM" --yes

deploy-index-bot:
	railway environment development
	docker build --build-arg now="$$(date -u +"%Y-%m-%dT%H:%M:%SZ")" --platform linux/amd64 -t ghcr.io/m0-foundation/solana-m:index-bot -f services/index-bot/Dockerfile .
	docker push ghcr.io/m0-foundation/solana-m:index-bot
	railway redeploy --service "index bot" --yes

deploy-dashboard:
	cd dashboard && \
	op inject -i .env -o .env.production && \
	docker build --platform linux/amd64 -t ghcr.io/m0-foundation/solana-m:dashboard . && \
	rm .env.production
	docker push ghcr.io/m0-foundation/solana-m:dashboard
	railway redeploy --service dashboard --yes
