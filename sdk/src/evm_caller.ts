import { PublicKey } from '@solana/web3.js';
import { getContract, PublicClient } from 'viem';
import { ETH_M_ADDRESS, ETH_MERKLE_TREE_BUILDER } from '.';
import BN from 'bn.js';

const REGISTRAR_LISTS = {
  earners: '0x736f6c616e612d6561726e657273000000000000000000000000000000000000' as `0x${string}`,
  managers: '0x736f6c616e612d6561726e2d6d616e6167657273000000000000000000000000' as `0x${string}`,
};

export class EvmCaller {
  private client: PublicClient;
  private mTokenAddress: `0x${string}`;
  private merkleTreeAddress: `0x${string}`;
  
  constructor(client: PublicClient, mTokenAddress: `0x${string}` = ETH_M_ADDRESS, merkleTreeAddress: `0x${string}` = ETH_MERKLE_TREE_BUILDER) {
    this.client = client;
    this.mTokenAddress = mTokenAddress;
    this.merkleTreeAddress = merkleTreeAddress;
  }

  async getMerkleRoot(list: 'earners' | 'managers'): Promise<string> {
    const contract = this._getMerkleContract();
    return await contract.read.getRoot([REGISTRAR_LISTS[list]]);
  }

  async getEarners(): Promise<PublicKey[]> {
    return this.getList('earners');
  }

  async getManagers(): Promise<PublicKey[]> {
    return this.getList('managers');
  }

  async getCurrentIndex(): Promise<BN> {
    const contract = this._getMTokenContract();
    return new BN((await contract.read.currentIndex()).toString());
  }

  private async getList(list: 'earners' | 'managers'): Promise<PublicKey[]> {
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
      address: this.merkleTreeAddress,
      abi,
      client: this.client,
    });
  }

  private _getMTokenContract() {
    const abi = [
      {
        inputs: [],
        name: 'currentIndex',
        outputs: [{ internalType: 'uint256', name: 'currentIndex', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      }
    ] as const;

    return getContract({
      address: this.mTokenAddress,
      abi,
      client: this.client
    });
  }

}
