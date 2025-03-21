import {
  AccountMeta,
  Connection,
  GetProgramAccountsFilter,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import BN from 'bn.js';
import * as spl from '@solana/spl-token';
import { MINT, PROGRAM_ID } from '.';
import { Earner } from './earner';
import { earnManagerDecoder } from './accounts';
import { b58, deriveDiscriminator } from './utils';
import {
  fixEncoderSize,
  getArrayEncoder,
  getBooleanEncoder,
  getBytesEncoder,
  getStructEncoder,
  getU32Codec,
  getU64Decoder,
  getU64Encoder,
  ReadonlyUint8Array,
  VariableSizeEncoder,
} from '@solana/codecs';
import { MerkleTree } from './merkle';

export class EarnManager {
  private connection: Connection;

  manager: PublicKey;
  pubkey: PublicKey;
  isActive: boolean;
  feeBps: number;
  feeTokenAccount: PublicKey;

  private constructor(connection: Connection, manager: PublicKey, pubkey: PublicKey, data: Buffer) {
    this.connection = connection;
    this.manager = manager;
    this.pubkey = pubkey;

    const values = earnManagerDecoder.decode(data);
    this.isActive = values.isActive;
    this.feeBps = new BN(values.feeBps.toString()).toNumber();
    this.feeTokenAccount = new PublicKey(values.feeTokenAccount);
  }

  static async fromManagerAddress(connection: Connection, manager: PublicKey): Promise<EarnManager> {
    const [earnManagerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earn-manager'), manager.toBytes()],
      PROGRAM_ID,
    );

    const account = await connection.getAccountInfo(earnManagerAccount);
    if (!account) throw new Error(`Unable to find EarnManager account at ${earnManagerAccount}`);

    return new EarnManager(connection, manager, earnManagerAccount, account.data);
  }

  async refresh() {
    Object.assign(this, await EarnManager.fromManagerAddress(this.connection, this.manager));
  }

  async buildConfigureInstruction(feeBPS: bigint, feeTokenAccount: PublicKey): Promise<TransactionInstruction> {
    // get all earn managers for proof
    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
      filters: [{ memcmp: { offset: 0, bytes: b58(deriveDiscriminator('EarnManager')) } }],
    });

    const addresses = accounts.map(({ account }) => {
      const values = earnManagerDecoder.decode(account.data);
      return new PublicKey(values.owner);
    });

    // build proof
    const tree = new MerkleTree(addresses);
    const { proof } = tree.getInclusionProof(this.manager);

    // encode instruction data
    const data = getConfigureEncoder().encode({
      disciminator: deriveDiscriminator('configure_earn_manager', 'global'),
      feeBPS,
      proof: proof.map(({ node, onRight }) => ({ node: Buffer.from(node), onRight })),
    });

    return new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: this._getConfigureAccounts(feeTokenAccount),
      data: Buffer.from(data),
    });
  }

  async getEarners(): Promise<Earner[]> {
    return this._getEarners(this.manager);
  }

  async buildAddEarnerInstruction(user: PublicKey, tokenAccount?: PublicKey): Promise<TransactionInstruction> {
    // get all registrar earners for proof
    const registrarEarners = await this._getEarners();
    const tree = new MerkleTree(registrarEarners.map((earner) => earner.user));
    const { proofs, neighbors } = tree.getExclusionProof(user);

    // encode instruction data
    const data = getAddEarnerEncoder().encode({
      disciminator: deriveDiscriminator('add_earner', 'global'),
      user: user.toBuffer(),
      proofs: proofs.map((p) => p.map(({ node, onRight }) => ({ node: Buffer.from(node), onRight }))),
      neighbors: neighbors.map((n) => Buffer.from(n)),
    });

    // derive ata if token account not provided
    if (!tokenAccount) {
      tokenAccount = spl.getAssociatedTokenAddressSync(MINT, user, true, spl.TOKEN_2022_PROGRAM_ID);
    }

    return new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: this._getAddEarnerAccounts(tokenAccount),
      data: Buffer.from(data),
    });
  }

  private async _getEarners(manager?: PublicKey): Promise<Earner[]> {
    const filters: GetProgramAccountsFilter[] = [{ memcmp: { offset: 0, bytes: b58(deriveDiscriminator('Earner')) } }];

    if (manager) {
      // earners under manager
      filters.push({ memcmp: { offset: 9, bytes: manager.toBase58() } });
    } else {
      // registrar earners
      filters.push({ memcmp: { offset: 8, bytes: '1' } });
    }

    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, { filters });

    return accounts.map(({ account, pubkey }) => Earner.fromAccountData(this.connection, pubkey, account.data));
  }

  private _getAddEarnerAccounts(tokenAccount: PublicKey): AccountMeta[] {
    const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID);

    const [earnManagerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earn-manager'), this.manager.toBytes()],
      PROGRAM_ID,
    );
    const [earnerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earner'), tokenAccount.toBytes()],
      PROGRAM_ID,
    );

    return [
      {
        pubkey: this.manager,
        isWritable: true,
        isSigner: true,
      },
      {
        pubkey: earnManagerAccount,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: globalAccount,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: tokenAccount,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: earnerAccount,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: SystemProgram.programId,
        isWritable: false,
        isSigner: false,
      },
    ];
  }

  private _getConfigureAccounts(feeTokenAccount: PublicKey): AccountMeta[] {
    const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID);

    const [earnManagerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earn-manager'), this.manager.toBytes()],
      PROGRAM_ID,
    );

    return [
      {
        pubkey: this.manager,
        isWritable: true,
        isSigner: true,
      },
      {
        pubkey: globalAccount,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: earnManagerAccount,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: feeTokenAccount,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: SystemProgram.programId,
        isWritable: false,
        isSigner: false,
      },
    ];
  }
}

interface AddEarnerData {
  disciminator: ReadonlyUint8Array;
  user: ReadonlyUint8Array;
  proofs: {
    node: ReadonlyUint8Array;
    onRight: boolean;
  }[][];
  neighbors: ReadonlyUint8Array[];
}

function getAddEarnerEncoder(): VariableSizeEncoder<AddEarnerData> {
  const encoder: VariableSizeEncoder<AddEarnerData> = getStructEncoder([
    ['disciminator', fixEncoderSize(getBytesEncoder(), 8)],
    ['user', fixEncoderSize(getBytesEncoder(), 32)],
    [
      'proofs',
      getArrayEncoder(
        getArrayEncoder(
          getStructEncoder([
            ['node', fixEncoderSize(getBytesEncoder(), 32)],
            ['onRight', getBooleanEncoder()],
          ]),
          { size: getU32Codec() },
        ),
        { size: getU32Codec() },
      ),
    ],
    ['neighbors', getArrayEncoder(fixEncoderSize(getBytesEncoder(), 32), { size: getU32Codec() })],
  ]);
  return encoder;
}

interface ConfigureManagerData {
  disciminator: ReadonlyUint8Array;
  feeBPS: bigint;
  proof: {
    node: ReadonlyUint8Array;
    onRight: boolean;
  }[];
}

function getConfigureEncoder(): VariableSizeEncoder<ConfigureManagerData> {
  const encoder: VariableSizeEncoder<ConfigureManagerData> = getStructEncoder([
    ['disciminator', fixEncoderSize(getBytesEncoder(), 8)],
    ['feeBPS', getU64Encoder()],
    [
      'proof',
      getArrayEncoder(
        getStructEncoder([
          ['node', fixEncoderSize(getBytesEncoder(), 32)],
          ['onRight', getBooleanEncoder()],
        ]),
        { size: getU32Codec() },
      ),
    ],
  ]);
  return encoder;
}
