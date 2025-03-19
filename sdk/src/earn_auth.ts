import { Connection, TransactionInstruction, PublicKey, AccountMeta } from '@solana/web3.js';
import { PROGRAM_ID, TOKEN_2022_ID } from '.';
import { Earner } from './earner';
import { Graph } from './graph';
import { EarnManager } from './earn_manager';
import { b58, deriveDiscriminator } from './utils';
import { GlobalAccountData, globalDecoder } from './accounts';
import * as spl from '@solana/spl-token';

class EarnAuthority {
  private connection: Connection;
  private global: GlobalAccountData;
  private managerCache: Map<PublicKey, EarnManager> = new Map();
  private mintMultisig: PublicKey;

  private constructor(connection: Connection, global: GlobalAccountData, mintMultisig: PublicKey) {
    this.connection = connection;
    this.global = global;
    this.mintMultisig = mintMultisig;
  }

  static async load(connection: Connection): Promise<EarnAuthority> {
    const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID);

    const accountInfo = await connection.getAccountInfo(globalAccount);
    const global = globalDecoder.decode(accountInfo!.data);

    // get mint multisig
    const mint = await spl.getMint(
      connection,
      new PublicKey(global.mint),
      connection.commitment,
      spl.TOKEN_2022_PROGRAM_ID,
    );

    return new EarnAuthority(connection, global, mint.mintAuthority!);
  }

  async getAllEarners(): Promise<Earner[]> {
    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
      filters: [{ memcmp: { offset: 0, bytes: b58(deriveDiscriminator('Earner')) } }],
    });
    return accounts.map(({ account, pubkey }) => Earner.fromAccountData(this.connection, pubkey, account.data));
  }

  async buildCompleteClaimCycleInstruction(): Promise<TransactionInstruction> {
    if (this.global.claimComplete) {
      throw new Error('No active claim cycle');
    }

    return new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        {
          pubkey: new PublicKey(this.global.earnAuthority),
          isWritable: false,
          isSigner: true,
        },
        {
          pubkey: PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID)[0],
          isWritable: true,
          isSigner: false,
        },
      ],
      data: deriveDiscriminator('complete_claims', 'global'),
    });
  }

  async buildClaimInstruction(earner: Earner): Promise<TransactionInstruction> {
    if (this.global.claimComplete) {
      throw new Error('No active claim cycle');
    }

    const weightedBalance = await new Graph().getTimeWeightedBalance(
      earner.userTokenAccount,
      earner.lastClaimTimestamp,
      this.global.timestamp,
    );

    const discriminator = deriveDiscriminator('claim_for', 'global');
    const data = Buffer.alloc(discriminator.length + 8);
    discriminator.copy(data);
    data.writeBigUInt64LE(weightedBalance, 8);

    let keys = this._getClaimForAccounts(earner.userTokenAccount);

    // earner might have a manager
    if (earner.earnManager) {
      let manager = this.managerCache.get(earner.earnManager);
      if (!manager) {
        manager = await EarnManager.fromManagerAddress(this.connection, earner.earnManager);
        this.managerCache.set(earner.earnManager, manager);
      }

      keys = this._getClaimForAccounts(earner.userTokenAccount, earner.earnManager, manager.feeTokenAccount);
    }

    return new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data,
    });
  }

  private _getClaimForAccounts(
    userTokenAccount: PublicKey,
    earnManagerAccount?: PublicKey,
    earnManagerTokenAccount?: PublicKey,
  ): AccountMeta[] {
    const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID);
    const [tokenAuthorityAccount] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAM_ID);
    const [earnerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earner'), userTokenAccount.toBuffer()],
      PROGRAM_ID,
    );
    if (earnManagerAccount) {
      earnManagerAccount = PublicKey.findProgramAddressSync(
        [Buffer.from('earn-manager'), earnManagerAccount.toBytes()],
        PROGRAM_ID,
      )[0];
    }
    return [
      {
        pubkey: new PublicKey(this.global.earnAuthority),
        isWritable: false,
        isSigner: true,
      },
      {
        pubkey: globalAccount,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: new PublicKey(this.global.mint),
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: tokenAuthorityAccount,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: userTokenAccount,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: earnerAccount,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: TOKEN_2022_ID,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: this.mintMultisig,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: earnManagerAccount || PROGRAM_ID,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: earnManagerTokenAccount || PROGRAM_ID,
        isWritable: !!earnManagerTokenAccount,
        isSigner: false,
      },
    ];
  }
}

export default EarnAuthority;
