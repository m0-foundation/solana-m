# M Portal

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

## Sending a message

Sending a bridge message involves calling 3 methods on the solana portal program. These 3 methods are transferBurn, insertIntoOutbound, and releaseOutbound. 

This lifecycle is outlined in [solana-message-lifecycle.md](https://github.com/wormhole-foundation/docs.wormhole.com/blob/main/docs/native-token-transfers/architecture/solana-message-lifecycle.md#1-transfer)

### TransferBurn
The client must specify the amount of the transfer, the recipient chain, the recipient address on the recipient chain, and the boolean flag should_queue.

### InsertIntoOutbound
Outbound transfers are added into an Outbox. This method checks the transfer against the configured outbound rate limit amount to determine whether the transfer should be rate limited.

### ReleaseOutbound
Request each Transceiver to send messages. To execute this instruction, the caller needs to pass the account of the Outbox item to be released. The instruction will then verify that the Transceiver is one of the specified senders for the message. Transceivers then send the messages based on the verification backend they are using.
