# Solana M

A Solana-based system for managing and distributing yield to token holders through multiple coordinated programs.

## Design

The purpose of the system is to allow bridging M to Solana and maintaining the yield earning features found on EVM chains.

An updated M index will be propagated to Solana whenever M is bridged or a specific “update index” message is sent. We can use the timestamps of these index propagations to divide yield into chunks from the last update to the new one. By comparing the new index to the previous one and knowing the current supply of M we can determine a “rewards per token” value. This can be multiplied by earner balances at the timestamp to distribute rewards. The rewards will not be exactly correct for a user if their balance changes between epochs, but a future version can work to make this more accurate.

Solana makes it fairly easy to get a list of token account balances for users offchain so we can use the RPC to collect this list when the index is propagated and have a permissioned address (aka “earn authority”) loop through them calling a “claim” function for each earner. The design for the off-chain portion still needs to be fleshed out.

In order to avoid this happening too often, a “cooldown” can be configured to limit how often the yield can be claimed. Additionally, the earn authority will need to “complete” the previous claim before a new one can be started.
Features
- Single, plain Token2022 representing $M
- Earn authority performs yield claim for users automatically for improved UX. A fairly simple offchain program will need to be written to perform these claims.
- Earn Managers are supported, but must be approved by TTG on mainnet
- Mint Master program allows minting from both Portal and Earn programs, but minting by the - Earn program is restricted to an amount calculated from the index updates. This keeps the supply capped to what is on Ethereum mainnet
- Registrar replicates TTGRegistrar design on Ethereum mainnet and allows storage & reading of Governance set values

A key goal for the design was to limit the amount of Portal customization to only propagating custom messages from other chains. Additionally, learnings from the prototype development effort of the previous designs informed inclusion of the Mint Master, Registrar, and the Account structure.

![Solana M Programs](assets/solana_m_programs.png)

## Programs

### Common (`37Bvn81nj7sgETZQxy2vpKjTSR6tGtuGy4gNJhC19F14`)
Shared utilities, constants, and error types used across other programs.

### Mint Master (`7j9tN2dS7CuPfKPFvhh8HWWNgsPgN7jsDdDiPXMrjemb`)
Controls token minting permissions and manages authorized minting entities (portal and distributor).

### Earn (`Ea18o3BKAQD8p3DTZ1mabgJiRM7XkoYtmh9TWgxFv6gh`)
Handles yield distribution logic and earner management. Features include:
- Yield distribution cycles
- Earner registration
- Claim processing
- Earn manager configuration

Yield distribution is restricted to a permissioned `earn_authority`. The Portal starts a claim cycle by propagating the index updates it receives from other chains and calling the Earn program to calculate max yield for the claim cycle. The `earn_authority` calculates individual earner balances over the claim period and distributes using a crank-style mechanism. Once, the `earn_authority` has distributed all the yield for a claim cycle, it closes the cycle and waits for another index propagation. The frequency of the claims can be governed by the `claim_cooldown` period.

### Registrar (`DJ3kM7oLuua6NZjnYgCA8SMFhYc1MJMAZ21HmP52ugD1`)
Manages system configuration through key-value storage and access control lists. These values are set by an admin, which will be configured as the Portal receiving messages from Ethereum mainnet.

### Portal
An external program not included in this repository. It is a fork of the Wormhole Native Token Transfer (NTT) Manager program, customized to allow passing generic messages and a payload with transfers.

## Development Setup

### Prerequisites
- Rust and Cargo
- Node.js and Yarn
- Solana CLI tools
- Anchor CLI

### Install Dependencies
```bash
yarn install
```

### Build Programs
```bash
anchor build
```

### Run Tests
```bash
anchor test
```

### Development Commands
These commands are defined in `package.json` and `Anchor.toml`:

```bash
# Run linting
yarn lint

# Fix linting issues
yarn lint:fix
