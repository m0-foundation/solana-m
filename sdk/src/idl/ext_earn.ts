export type ExtEarn = {
  version: '0.1.0';
  name: 'ext_earn';
  constants: [
    {
      name: 'EARN_MANAGER_SEED';
      type: 'bytes';
      value: '[101, 97, 114, 110, 95, 109, 97, 110, 97, 103, 101, 114]';
    },
    {
      name: 'EARNER_SEED';
      type: 'bytes';
      value: '[101, 97, 114, 110, 101, 114]';
    },
    {
      name: 'EXT_GLOBAL_SEED';
      type: 'bytes';
      value: '[103, 108, 111, 98, 97, 108]';
    },
    {
      name: 'M_VAULT_SEED';
      type: 'bytes';
      value: '[109, 95, 118, 97, 117, 108, 116]';
    },
    {
      name: 'MINT_AUTHORITY_SEED';
      type: 'bytes';
      value: '[109, 105, 110, 116, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]';
    },
  ];
  instructions: [
    {
      name: 'initialize';
      accounts: [
        {
          name: 'admin';
          isMut: true;
          isSigner: true;
        },
        {
          name: 'globalAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'mMint';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'extMint';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'mEarnGlobalAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'token2022';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'systemProgram';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [
        {
          name: 'earnAuthority';
          type: 'publicKey';
        },
      ];
    },
    {
      name: 'setEarnAuthority';
      accounts: [
        {
          name: 'admin';
          isMut: false;
          isSigner: true;
        },
        {
          name: 'globalAccount';
          isMut: true;
          isSigner: false;
        },
      ];
      args: [
        {
          name: 'newEarnAuthority';
          type: 'publicKey';
        },
      ];
    },
    {
      name: 'addEarnManager';
      accounts: [
        {
          name: 'admin';
          isMut: true;
          isSigner: true;
        },
        {
          name: 'globalAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'earnManagerAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'feeTokenAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'systemProgram';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [
        {
          name: 'earnManager';
          type: 'publicKey';
        },
        {
          name: 'feeBps';
          type: 'u64';
        },
      ];
    },
    {
      name: 'removeEarnManager';
      accounts: [
        {
          name: 'admin';
          isMut: false;
          isSigner: true;
        },
        {
          name: 'globalAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'earnManagerAccount';
          isMut: true;
          isSigner: false;
        },
      ];
      args: [];
    },
    {
      name: 'claimFor';
      accounts: [
        {
          name: 'earnAuthority';
          isMut: false;
          isSigner: true;
        },
        {
          name: 'globalAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'extMint';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'extMintAuthority';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'mVaultAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'vaultMTokenAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'userTokenAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'earnerAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'earnManagerAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'earnManagerTokenAccount';
          isMut: true;
          isSigner: false;
          docs: [
            'if the token account has been closed or is not initialized',
            'This prevents DoSing earner yield by closing this account',
          ];
        },
        {
          name: 'token2022';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [
        {
          name: 'snapshotBalance';
          type: 'u64';
        },
      ];
    },
    {
      name: 'sync';
      accounts: [
        {
          name: 'earnAuthority';
          isMut: false;
          isSigner: true;
        },
        {
          name: 'mEarnGlobalAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'globalAccount';
          isMut: true;
          isSigner: false;
        },
      ];
      args: [];
    },
    {
      name: 'addEarner';
      accounts: [
        {
          name: 'signer';
          isMut: true;
          isSigner: true;
        },
        {
          name: 'earnManagerAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'globalAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'userTokenAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'earnerAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'systemProgram';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [
        {
          name: 'user';
          type: 'publicKey';
        },
      ];
    },
    {
      name: 'removeEarner';
      accounts: [
        {
          name: 'signer';
          isMut: true;
          isSigner: true;
        },
        {
          name: 'earnerAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'earnManagerAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'systemProgram';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [];
    },
    {
      name: 'configureEarnManager';
      accounts: [
        {
          name: 'signer';
          isMut: true;
          isSigner: true;
        },
        {
          name: 'globalAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'earnManagerAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'feeTokenAccount';
          isMut: false;
          isSigner: false;
          isOptional: true;
        },
      ];
      args: [
        {
          name: 'feeBps';
          type: {
            option: 'u64';
          };
        },
      ];
    },
    {
      name: 'transferEarner';
      accounts: [
        {
          name: 'signer';
          isMut: false;
          isSigner: true;
        },
        {
          name: 'earnerAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'fromEarnManagerAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'toEarnManagerAccount';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [
        {
          name: 'toEarnManager';
          type: 'publicKey';
        },
      ];
    },
    {
      name: 'setRecipient';
      accounts: [
        {
          name: 'signer';
          isMut: false;
          isSigner: true;
        },
        {
          name: 'globalAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'earnerAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'recipientTokenAccount';
          isMut: false;
          isSigner: false;
          isOptional: true;
        },
      ];
      args: [];
    },
    {
      name: 'wrap';
      accounts: [
        {
          name: 'signer';
          isMut: false;
          isSigner: true;
        },
        {
          name: 'mMint';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'extMint';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'globalAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'mVault';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'extMintAuthority';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'fromMTokenAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'vaultMTokenAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'toExtTokenAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'token2022';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [
        {
          name: 'amount';
          type: 'u64';
        },
      ];
    },
    {
      name: 'unwrap';
      accounts: [
        {
          name: 'signer';
          isMut: false;
          isSigner: true;
        },
        {
          name: 'mMint';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'extMint';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'globalAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'mVault';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'toMTokenAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'vaultMTokenAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'fromExtTokenAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'token2022';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [
        {
          name: 'amount';
          type: 'u64';
        },
      ];
    },
    {
      name: 'removeOrphanedEarner';
      accounts: [
        {
          name: 'signer';
          isMut: true;
          isSigner: true;
        },
        {
          name: 'globalAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'earnerAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'earnManagerAccount';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'systemProgram';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [];
    },
  ];
  accounts: [
    {
      name: 'earnManager';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'earnManager';
            type: 'publicKey';
          },
          {
            name: 'isActive';
            type: 'bool';
          },
          {
            name: 'feeBps';
            type: 'u64';
          },
          {
            name: 'feeTokenAccount';
            type: 'publicKey';
          },
          {
            name: 'bump';
            type: 'u8';
          },
        ];
      };
    },
    {
      name: 'earner';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'lastClaimIndex';
            type: 'u64';
          },
          {
            name: 'lastClaimTimestamp';
            type: 'u64';
          },
          {
            name: 'bump';
            type: 'u8';
          },
          {
            name: 'user';
            type: 'publicKey';
          },
          {
            name: 'userTokenAccount';
            type: 'publicKey';
          },
          {
            name: 'earnManager';
            type: 'publicKey';
          },
          {
            name: 'recipientTokenAccount';
            type: {
              option: 'publicKey';
            };
          },
        ];
      };
    },
    {
      name: 'extGlobal';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'admin';
            type: 'publicKey';
          },
          {
            name: 'earnAuthority';
            type: 'publicKey';
          },
          {
            name: 'extMint';
            type: 'publicKey';
          },
          {
            name: 'mMint';
            type: 'publicKey';
          },
          {
            name: 'mEarnGlobalAccount';
            type: 'publicKey';
          },
          {
            name: 'index';
            type: 'u64';
          },
          {
            name: 'timestamp';
            type: 'u64';
          },
          {
            name: 'bump';
            type: 'u8';
          },
          {
            name: 'mVaultBump';
            type: 'u8';
          },
          {
            name: 'extMintAuthorityBump';
            type: 'u8';
          },
        ];
      };
    },
  ];
  events: [
    {
      name: 'SyncIndexUpdate';
      fields: [
        {
          name: 'index';
          type: 'u64';
          index: false;
        },
        {
          name: 'ts';
          type: 'u64';
          index: false;
        },
      ];
    },
  ];
  errors: [
    {
      code: 6000;
      name: 'AlreadyClaimed';
      msg: 'Already claimed for user.';
    },
    {
      code: 6001;
      name: 'NotAuthorized';
      msg: 'Invalid signer.';
    },
    {
      code: 6002;
      name: 'InvalidParam';
      msg: 'Invalid parameter.';
    },
    {
      code: 6003;
      name: 'InvalidAccount';
      msg: 'Account does not match the expected key.';
    },
    {
      code: 6004;
      name: 'Active';
      msg: 'Account is currently active.';
    },
    {
      code: 6005;
      name: 'NotActive';
      msg: 'Account is not currently active.';
    },
    {
      code: 6006;
      name: 'MutableOwner';
      msg: 'Token account owner is required to be immutable.';
    },
    {
      code: 6007;
      name: 'InsufficientCollateral';
      msg: 'Not enough M.';
    },
    {
      code: 6008;
      name: 'InvalidMint';
      msg: 'Invalid Mint.';
    },
  ];
};

export const IDL: ExtEarn = {
  version: '0.1.0',
  name: 'ext_earn',
  constants: [
    {
      name: 'EARN_MANAGER_SEED',
      type: 'bytes',
      value: '[101, 97, 114, 110, 95, 109, 97, 110, 97, 103, 101, 114]',
    },
    {
      name: 'EARNER_SEED',
      type: 'bytes',
      value: '[101, 97, 114, 110, 101, 114]',
    },
    {
      name: 'EXT_GLOBAL_SEED',
      type: 'bytes',
      value: '[103, 108, 111, 98, 97, 108]',
    },
    {
      name: 'M_VAULT_SEED',
      type: 'bytes',
      value: '[109, 95, 118, 97, 117, 108, 116]',
    },
    {
      name: 'MINT_AUTHORITY_SEED',
      type: 'bytes',
      value: '[109, 105, 110, 116, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]',
    },
  ],
  instructions: [
    {
      name: 'initialize',
      accounts: [
        {
          name: 'admin',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'globalAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'mMint',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'extMint',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'mEarnGlobalAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'token2022',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'systemProgram',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: 'earnAuthority',
          type: 'publicKey',
        },
      ],
    },
    {
      name: 'setEarnAuthority',
      accounts: [
        {
          name: 'admin',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'globalAccount',
          isMut: true,
          isSigner: false,
        },
      ],
      args: [
        {
          name: 'newEarnAuthority',
          type: 'publicKey',
        },
      ],
    },
    {
      name: 'addEarnManager',
      accounts: [
        {
          name: 'admin',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'globalAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'earnManagerAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'feeTokenAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'systemProgram',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: 'earnManager',
          type: 'publicKey',
        },
        {
          name: 'feeBps',
          type: 'u64',
        },
      ],
    },
    {
      name: 'removeEarnManager',
      accounts: [
        {
          name: 'admin',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'globalAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'earnManagerAccount',
          isMut: true,
          isSigner: false,
        },
      ],
      args: [],
    },
    {
      name: 'claimFor',
      accounts: [
        {
          name: 'earnAuthority',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'globalAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'extMint',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'extMintAuthority',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'mVaultAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'vaultMTokenAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'userTokenAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'earnerAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'earnManagerAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'earnManagerTokenAccount',
          isMut: true,
          isSigner: false,
          docs: [
            'if the token account has been closed or is not initialized',
            'This prevents DoSing earner yield by closing this account',
          ],
        },
        {
          name: 'token2022',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: 'snapshotBalance',
          type: 'u64',
        },
      ],
    },
    {
      name: 'sync',
      accounts: [
        {
          name: 'earnAuthority',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'mEarnGlobalAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'globalAccount',
          isMut: true,
          isSigner: false,
        },
      ],
      args: [],
    },
    {
      name: 'addEarner',
      accounts: [
        {
          name: 'signer',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'earnManagerAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'globalAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'userTokenAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'earnerAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'systemProgram',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: 'user',
          type: 'publicKey',
        },
      ],
    },
    {
      name: 'removeEarner',
      accounts: [
        {
          name: 'signer',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'earnerAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'earnManagerAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'systemProgram',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [],
    },
    {
      name: 'configureEarnManager',
      accounts: [
        {
          name: 'signer',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'globalAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'earnManagerAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'feeTokenAccount',
          isMut: false,
          isSigner: false,
          isOptional: true,
        },
      ],
      args: [
        {
          name: 'feeBps',
          type: {
            option: 'u64',
          },
        },
      ],
    },
    {
      name: 'transferEarner',
      accounts: [
        {
          name: 'signer',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'earnerAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'fromEarnManagerAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'toEarnManagerAccount',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: 'toEarnManager',
          type: 'publicKey',
        },
      ],
    },
    {
      name: 'setRecipient',
      accounts: [
        {
          name: 'signer',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'globalAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'earnerAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'recipientTokenAccount',
          isMut: false,
          isSigner: false,
          isOptional: true,
        },
      ],
      args: [],
    },
    {
      name: 'wrap',
      accounts: [
        {
          name: 'signer',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'mMint',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'extMint',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'globalAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'mVault',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'extMintAuthority',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'fromMTokenAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'vaultMTokenAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'toExtTokenAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'token2022',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: 'amount',
          type: 'u64',
        },
      ],
    },
    {
      name: 'unwrap',
      accounts: [
        {
          name: 'signer',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'mMint',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'extMint',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'globalAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'mVault',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'toMTokenAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'vaultMTokenAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'fromExtTokenAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'token2022',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: 'amount',
          type: 'u64',
        },
      ],
    },
    {
      name: 'removeOrphanedEarner',
      accounts: [
        {
          name: 'signer',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'globalAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'earnerAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'earnManagerAccount',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'systemProgram',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: 'earnManager',
      type: {
        kind: 'struct',
        fields: [
          {
            name: 'earnManager',
            type: 'publicKey',
          },
          {
            name: 'isActive',
            type: 'bool',
          },
          {
            name: 'feeBps',
            type: 'u64',
          },
          {
            name: 'feeTokenAccount',
            type: 'publicKey',
          },
          {
            name: 'bump',
            type: 'u8',
          },
        ],
      },
    },
    {
      name: 'earner',
      type: {
        kind: 'struct',
        fields: [
          {
            name: 'lastClaimIndex',
            type: 'u64',
          },
          {
            name: 'lastClaimTimestamp',
            type: 'u64',
          },
          {
            name: 'bump',
            type: 'u8',
          },
          {
            name: 'user',
            type: 'publicKey',
          },
          {
            name: 'userTokenAccount',
            type: 'publicKey',
          },
          {
            name: 'earnManager',
            type: 'publicKey',
          },
          {
            name: 'recipientTokenAccount',
            type: {
              option: 'publicKey',
            },
          },
        ],
      },
    },
    {
      name: 'extGlobal',
      type: {
        kind: 'struct',
        fields: [
          {
            name: 'admin',
            type: 'publicKey',
          },
          {
            name: 'earnAuthority',
            type: 'publicKey',
          },
          {
            name: 'extMint',
            type: 'publicKey',
          },
          {
            name: 'mMint',
            type: 'publicKey',
          },
          {
            name: 'mEarnGlobalAccount',
            type: 'publicKey',
          },
          {
            name: 'index',
            type: 'u64',
          },
          {
            name: 'timestamp',
            type: 'u64',
          },
          {
            name: 'bump',
            type: 'u8',
          },
          {
            name: 'mVaultBump',
            type: 'u8',
          },
          {
            name: 'extMintAuthorityBump',
            type: 'u8',
          },
        ],
      },
    },
  ],
  events: [
    {
      name: 'SyncIndexUpdate',
      fields: [
        {
          name: 'index',
          type: 'u64',
          index: false,
        },
        {
          name: 'ts',
          type: 'u64',
          index: false,
        },
      ],
    },
  ],
  errors: [
    {
      code: 6000,
      name: 'AlreadyClaimed',
      msg: 'Already claimed for user.',
    },
    {
      code: 6001,
      name: 'NotAuthorized',
      msg: 'Invalid signer.',
    },
    {
      code: 6002,
      name: 'InvalidParam',
      msg: 'Invalid parameter.',
    },
    {
      code: 6003,
      name: 'InvalidAccount',
      msg: 'Account does not match the expected key.',
    },
    {
      code: 6004,
      name: 'Active',
      msg: 'Account is currently active.',
    },
    {
      code: 6005,
      name: 'NotActive',
      msg: 'Account is not currently active.',
    },
    {
      code: 6006,
      name: 'MutableOwner',
      msg: 'Token account owner is required to be immutable.',
    },
    {
      code: 6007,
      name: 'InsufficientCollateral',
      msg: 'Not enough M.',
    },
    {
      code: 6008,
      name: 'InvalidMint',
      msg: 'Invalid Mint.',
    },
  ],
};
