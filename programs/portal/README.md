## Receiving a message
Receiving a bridge message involves calling 3 methods on the solana portal program. These 3 methods are called by each transceiver and are receiveWormholeMessage, redeem, and releaseInboundMintMultisig. 

This lifecycle is outlined in [solana-message-lifecycle.md](https://github.com/wormhole-foundation/docs.wormhole.com/blob/main/docs/native-token-transfers/architecture/solana-message-lifecycle.md#4-receive)

### ReceiveWormholeMessage
Example implementation
The wormhole transceiver receives a verified wormhole message on Solana via the receive_wormhole_message instruction. The instruction verifies the Wormhole VAA and stores it in a VerifiedTransceiverMessage account.

### Redeem
Example implementation
Redeem checks the inbound rate limit and places the message in an Inbox. If a rate limit is reached then the message will have a release_timestamp on it unless shouldQueue is false then it gets reverted.

### ReleaseInboundMintMultisig
Example implementation
This method takes a released inbox item and mints and transfers the inbox item amount.
