# Solana M

A Solana-based system for managing and distributing yield to token holders through multiple coordinated programs.

## Design

The purpose of the system is to allow bridging M to Solana and maintaining the yield earning features found on EVM chains.

An updated M index will be propagated to Solana whenever M is bridged. This bridge event starts a new claim cycle for yield if (a) one is not currently active, (b) the claim cooldown period has passed, and (c) if the index is larger than the one stored at the beginning of the most recent claim cycle. We can use the timestamps of these index propagations to divide yield into chunks from the last update to the new one. The index is a multiplier that represents the increase in M tokens they would have if they held M from genesis. We can get the amount of M a user should have by multiplying their balance over the period by the new index and then dividing by the old index.

Yield is distributed in discrete batches and push manually by the "earn authority". Since user balances can change between claims, we will calculate weighted balances for the earner since the last time they claimed and use it to accurately distribute their yield once it reaches an amount worth sending (value > cost). Solana makes it fairly easy to get a list of token account balances for users offchain so we can use the RPC to collect this list when the index is propagated and have a permissioned address (aka “earn authority”) loop through them calling a “claim” function for each earner. The design for the off-chain portion still needs to be fleshed out.

In order to avoid this happening too often, a “cooldown” can be configured to limit how often the yield can be claimed. Additionally, the earn authority will need to “complete” the previous claim before a new one can be started.

Features

- Single, plain Token2022 representing M
- Earn authority performs yield claim for users automatically for improved UX. A fairly simple offchain program will need to be written to perform these claims.
- The token will use a multisig mint authority configured as a 1 of 2 where the signers are:
  - Earn Program PDA
  - Portal Program PDA
- A Merkle root for the earner list is propagated by cross-chain messages after being constructed from values set on the TTGRegistrar contract on Ethereum mainnet

We expect M earners to be other stablecoins built on top of M. These extensions are backed 1:1 with M and allow the owner of the extension to control the yield distribution, compliance, and other features of the asset. wM will be a first-party extension which demonstrates some of the functionality and will be integrated into the Solana DeFi ecosystem. It has a few differences from the base M asset:

- Single, plain Token2022 presenting wM (or another extension)
- Admin can delegated power to add/remove earners to earn managers
- Earners or their manager can set a different account to receive yield in from the principal
- Wrap/unwrap functionality
- Syncs index from base system and limits distribution of yield to amount of M held in its vault (the vault will receive M yield)

We established a few constraints on the design, which impacted the decisions made:

- Limit the amount of Portal customization to only storing specific data from other chains within a bridge transfer. The reason for this was to avoid complexity with our bridging existing systems while we wait for them to be upgraded to support more general message passing
- Avoid making M the primary asset integrated into Solana DeFi to preserve some flexibility in upgrading the yield distribution. We originally tried to maintain composability which is why the initial implementation looks similar to the extension yield distribution (which is supposed to be composable).

![Solana M Programs](assets/solana_m_programs.png)

## Programs

### Earn

Handles yield distribution logic and earner management for the M token. Features include:

- Yield distribution cycles
- Earner registration via merkle proofs
- Claim processing

Yield distribution is restricted to a permissioned `earn_authority`. The Portal starts a claim cycle by propagating the index and merkle root updates it receives from other chains and calling the Earn program initiate a claim cycle. The `earn_authority` calculates individual earner balances over the claim period and distributes using a crank-style mechanism. Yield doesn't have to be distributed for every user on each claim cycle since it is based on the last time they claimed. Once, the `earn_authority` has distributed all the yield for a claim cycle, it closes the cycle and waits for another index propagation. The frequency of the claims can be governed by the `claim_cooldown` period.

Earner management is based on proofs of membership in a merkle tree propagated via the Portal from Ethereum mainnet. The Solana earner tree is built from Governance-set values on the Ethereum TTGRegistrar contract, and therefore, the M Protocol decides who can be an M earner.

### Portal

The Portal is a fork of the Wormhole Native Token Transfer (NTT) program with a few modifications to suit our purposes:

- A custom `Payload` to be able to receive the M index as well as two merkle roots from other chains with each transfer.
- Utilitizing the newly added Token Multisig Mint Authority functionality to allow both the Portal and Earn programs to be able to mint M.
- Adding a couple accounts and a CPI call to the `Earn` program within the `ReleaseInboundMintMultisig` instruction to store the custom data sent in the `Payload`.

### ExtEarn

Handles wrapping/unwrapping M to wM as well as yield distribution and earner manager for the wM token. The yield distribution works in the same way as the Earn program, which minor differences in the constraints because it relies on the M index and cannot mint more wM as yield than M it has received as yield.

M can be wrapped 1:1 to the extension token (wM) and unwrapped as needed.

Extensions are not owned by the protocol. Therefore, Earner management is up to the entity which owns the extension. In this implementation, we use a two tier system where:

- The Admin can add and remove Earn Managers.
- Earn Managers can add and remove Earners. The Earn Manager has the option of charging a fee on the yield their earners earn.
- Earners or their earn manager can set a different token account to receive yield. This is useful for receiving and then distributing yield from DeFi applications that can't receive it directly (e.g. Liquidity or Lending pools)

## Development Setup

### Prerequisites

- Rust and Cargo
- Node.js and Yarn
- Solana CLI tools (Solana 1.18.10)
- Anchor CLI (Anchor 0.29.0)

### Install Dependencies

```bash
pnpm install
```

### Build Programs

```bash
anchor build
```

### Run Tests

```bash
anchor build && pnpm test
```

### Development Commands

These commands are defined in `package.json` and `Anchor.toml`:

```bash
# Run linting
pnpm lint

# Fix linting issues
pnpm lint:fix
```
