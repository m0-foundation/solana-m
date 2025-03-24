import { PublicKey } from '@solana/web3.js';
import { createPublicClient, getContract, http } from 'viem';
import { sepolia } from 'viem/chains';

const REGISTRAR_LISTS = {
  earners: '0x736f6c616e612d6561726e657273000000000000000000000000000000000000' as `0x${string}`,
  managers: '0x736f6c616e612d6561726e2d6d616e6167657273000000000000000000000000' as `0x${string}`,
};

export class EvmCaller {
  private rpc_url: string;

  constructor(rpc_url: string) {
    this.rpc_url = rpc_url;
  }

  async getMerkleRoot(list: 'earners' | 'managers'): Promise<string> {
    const contract = this._getMerkleContract();
    return await contract.read.getRoot([REGISTRAR_LISTS[list]]);
  }

  async getList(list: 'earners' | 'managers'): Promise<PublicKey[]> {
    const contract = this._getMerkleContract();
    const earners = await contract.read.getList([REGISTRAR_LISTS[list]]);
    return earners.map((a: string) => new PublicKey(Buffer.from(a.slice(2), 'hex')));
  }

  private _getMerkleContract() {
    const abi = [
      {
        inputs: [{ internalType: 'bytes32', name: 'list', type: 'bytes32' }],
        name: 'getList',
        outputs: [{ internalType: 'bytes32[]', name: 'list', type: 'bytes32[]' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'bytes32', name: 'list', type: 'bytes32' }],
        name: 'getRoot',
        outputs: [{ internalType: 'bytes32', name: 'root', type: 'bytes32' }],
        stateMutability: 'view',
        type: 'function',
      },
    ] as const;

    return getContract({
      address: '0x050258e4761650ad774b5090a5DA0e204348Eb48',
      abi,
      client: createPublicClient({
        transport: http(this.rpc_url),
        chain: sepolia,
      }),
    });
  }
}
