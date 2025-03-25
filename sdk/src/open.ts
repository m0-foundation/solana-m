import {
  AccountMeta,
  Connection,
  GetProgramAccountsFilter,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { EvmCaller } from './evm_caller';
import { Earner } from './earner';
import { MINT, PROGRAM_ID } from '.';
import { MerkleTree } from './merkle';
import { b58, deriveDiscriminator } from './utils';
import { address, Address, getAddressEncoder } from '@solana/addresses';
import {
  ReadonlyUint8Array,
  VariableSizeEncoder,
  getStructEncoder,
  fixEncoderSize,
  getBytesEncoder,
  getArrayEncoder,
  getBooleanEncoder,
  getU32Codec,
} from '@solana/codecs';
import * as spl from '@solana/spl-token';

class Open {
  private connection: Connection;
  evmRPC: string;

  private constructor(connection: Connection, evmRPC: string) {
    this.connection = connection;
    this.evmRPC = evmRPC;
  }

  async buildMissingEarnersInstructions(signer: PublicKey): Promise<TransactionInstruction[]> {
    // get all earners that should be registered
    const evmCaller = new EvmCaller(this.evmRPC);
    const earners = await evmCaller.getEarners();

    const ixs: TransactionInstruction[] = [];
    for (const user of earners) {
      const eaners = await Earner.fromUserAddress(this.connection, user);
      if (eaners.length > 0) {
        continue;
      }

      // build proof
      const tree = new MerkleTree(earners);
      const { proof } = tree.getInclusionProof(user);

      // encode instruction data
      const data = getAddRegistrarEarnerEncoder().encode({
        disciminator: deriveDiscriminator('add_registrar_earner', 'global'),
        user: address(user.toBase58()),
        proof: proof.map(({ node, onRight }) => ({ node: Buffer.from(node), onRight })),
      });

      // derive ata if token account
      const tokenAccount = spl.getAssociatedTokenAddressSync(MINT, user, true, spl.TOKEN_2022_PROGRAM_ID);

      ixs.push(
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: this._getAddEarnerAccounts(signer, tokenAccount),
          data: Buffer.from(data),
        }),
      );
    }

    return ixs;
  }

  async buildRemovedEarnersInstructions(signer: PublicKey): Promise<TransactionInstruction[]> {
    // get all earners on registrar
    const evmCaller = new EvmCaller(this.evmRPC);
    const earners = await evmCaller.getEarners();

    // get all eaners on the earn program
    const programEarners = await this.getRegistrarEarners();

    const ixs: TransactionInstruction[] = [];
    for (const earner of programEarners) {
      if (earners.includes(earner.user)) {
        continue;
      }
    }

    return ixs;
  }

  async getRegistrarEarners(): Promise<Earner[]> {
    const filters: GetProgramAccountsFilter[] = [
      { memcmp: { offset: 0, bytes: b58(deriveDiscriminator('Earner')) } },
      { memcmp: { offset: 8, bytes: '2' } }, // no manager set
    ];

    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, { filters });
    return accounts.map(({ account, pubkey }) => Earner.fromAccountData(this.connection, pubkey, account.data));
  }

  private _getAddEarnerAccounts(signer: PublicKey, tokenAccount: PublicKey): AccountMeta[] {
    const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID);

    const [earnerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earner'), tokenAccount.toBytes()],
      PROGRAM_ID,
    );

    return [
      {
        pubkey: signer,
        isWritable: true,
        isSigner: true,
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
}

interface AddRegistrarEarnerData {
  disciminator: ReadonlyUint8Array;
  user: Address;
  proof: {
    node: ReadonlyUint8Array;
    onRight: boolean;
  }[];
}

function getAddRegistrarEarnerEncoder(): VariableSizeEncoder<AddRegistrarEarnerData> {
  const encoder: VariableSizeEncoder<AddRegistrarEarnerData> = getStructEncoder([
    ['disciminator', fixEncoderSize(getBytesEncoder(), 8)],
    ['user', getAddressEncoder()],
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

interface AddEarnerData {
  disciminator: ReadonlyUint8Array;
  user: ReadonlyUint8Array;
  proofs: {
    node: ReadonlyUint8Array;
    onRight: boolean;
  }[][];
  neighbors: ReadonlyUint8Array[];
}
