import { TokenInstruction, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { struct, u8 } from "@solana/buffer-layout";
import { publicKey } from "@solana/buffer-layout-utils";

interface InitializeConfidentialTransferMintInstructionData {
    instruction: TokenInstruction.ConfidentialTransferExtension;
    confidentialTransferInstruction: 0;
    authority: PublicKey | null;
    autoApproveNewAccounts: boolean;
    auditorElgamalPubkey: PublicKey | null;
}

const initializeConfidentialTransferMintInstructionData =
    struct<InitializeConfidentialTransferMintInstructionData>([
        u8("instruction"),
        u8("confidentialTransferInstruction"),
        publicKey("authority"),
        u8("autoApproveNewAccounts"),
        publicKey("auditorElgamalPubkey"),
    ]);

/*
 * Confidential tranfers are not yet supported. However, we should still set up the extension in the event they are supported and we want to use them.
 * Note: when both TransferFeeConfig and ConfidentialTransferMint are enabled, ConfidentialTransferFeeConfig is also required.
 * Reference: https://github.com/jup-ag/jup-lock/blob/main/tests/locker_utils/token_2022/confidential_transfer.ts
*/
export function createInitializeConfidentialTransferMintInstruction(
    mint: PublicKey,
    authority: PublicKey,
    autoApproveNewAccounts: boolean = true,
    auditorElgamalPubkey: PublicKey = PublicKey.default,
    programId: PublicKey = TOKEN_2022_PROGRAM_ID
) {
    const keys = [{ pubkey: mint, isSigner: false, isWritable: true }];
    const data = Buffer.alloc(
        initializeConfidentialTransferMintInstructionData.span
    );
    initializeConfidentialTransferMintInstructionData.encode(
        {
            instruction: TokenInstruction.ConfidentialTransferExtension,
            confidentialTransferInstruction: 0,
            authority,
            auditorElgamalPubkey,
            autoApproveNewAccounts,
        },
        data
    );

    return new TransactionInstruction({ keys, programId, data });
}
