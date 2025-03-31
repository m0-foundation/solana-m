export type Earn = {
  "version": "0.1.0",
  "name": "earn",
  "constants": [
    {
      "name": "EARNER_SEED",
      "type": "bytes",
      "value": "[101, 97, 114, 110, 101, 114]"
    },
    {
      "name": "GLOBAL_SEED",
      "type": "bytes",
      "value": "[103, 108, 111, 98, 97, 108]"
    },
    {
      "name": "TOKEN_AUTHORITY_SEED",
      "type": "bytes",
      "value": "[116, 111, 107, 101, 110, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]"
    }
  ],
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        {
          "name": "admin",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "mint",
          "type": "publicKey"
        },
        {
          "name": "earnAuthority",
          "type": "publicKey"
        },
        {
          "name": "initialIndex",
          "type": "u64"
        },
        {
          "name": "claimCooldown",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setEarnAuthority",
      "accounts": [
        {
          "name": "admin",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "newEarnAuthority",
          "type": "publicKey"
        }
      ]
    },
    {
      "name": "setClaimCooldown",
      "accounts": [
        {
          "name": "admin",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "claimCooldown",
          "type": "u64"
        }
      ]
    },
    {
      "name": "propagateIndex",
      "accounts": [
        {
          "name": "signer",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mint",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u64"
        },
        {
          "name": "earnerMerkleRoot",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "claimFor",
      "accounts": [
        {
          "name": "earnAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenAuthorityAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "userTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "earnerAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "mintMultisig",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "snapshotBalance",
          "type": "u64"
        }
      ]
    },
    {
      "name": "completeClaims",
      "accounts": [
        {
          "name": "earnAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "addRegistrarEarner",
      "accounts": [
        {
          "name": "signer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "userTokenAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "earnerAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "user",
          "type": "publicKey"
        },
        {
          "name": "proof",
          "type": {
            "vec": {
              "defined": "ProofElement"
            }
          }
        }
      ]
    },
    {
      "name": "removeRegistrarEarner",
      "accounts": [
        {
          "name": "signer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "earnerAccount",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "proofs",
          "type": {
            "vec": {
              "vec": {
                "defined": "ProofElement"
              }
            }
          }
        },
        {
          "name": "neighbors",
          "type": {
            "vec": {
              "array": [
                "u8",
                32
              ]
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "earner",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lastClaimIndex",
            "type": "u64"
          },
          {
            "name": "lastClaimTimestamp",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "user",
            "type": "publicKey"
          },
          {
            "name": "userTokenAccount",
            "type": "publicKey"
          }
        ]
      }
    },
    {
      "name": "global",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "publicKey"
          },
          {
            "name": "earnAuthority",
            "type": "publicKey"
          },
          {
            "name": "portalAuthority",
            "type": "publicKey"
          },
          {
            "name": "mint",
            "type": "publicKey"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "u64"
          },
          {
            "name": "claimCooldown",
            "type": "u64"
          },
          {
            "name": "maxSupply",
            "type": "u64"
          },
          {
            "name": "maxYield",
            "type": "u64"
          },
          {
            "name": "distributed",
            "type": "u64"
          },
          {
            "name": "claimComplete",
            "type": "bool"
          },
          {
            "name": "earnerMerkleRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "ProofElement",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "node",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "onRight",
            "type": "bool"
          }
        ]
      }
    }
  ],
  "events": [
    {
      "name": "RewardsClaim",
      "fields": [
        {
          "name": "tokenAccount",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "amount",
          "type": "u64",
          "index": false
        },
        {
          "name": "ts",
          "type": "u64",
          "index": false
        },
        {
          "name": "index",
          "type": "u64",
          "index": false
        }
      ]
    },
    {
      "name": "IndexUpdate",
      "fields": [
        {
          "name": "index",
          "type": "u64",
          "index": false
        },
        {
          "name": "ts",
          "type": "u64",
          "index": false
        },
        {
          "name": "supply",
          "type": "u64",
          "index": false
        },
        {
          "name": "maxYield",
          "type": "u64",
          "index": false
        }
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "AlreadyClaimed",
      "msg": "Already claimed for user."
    },
    {
      "code": 6001,
      "name": "ExceedsMaxYield",
      "msg": "Rewards exceed max yield."
    },
    {
      "code": 6002,
      "name": "NotAuthorized",
      "msg": "Invalid signer."
    },
    {
      "code": 6003,
      "name": "InvalidParam",
      "msg": "Invalid parameter."
    },
    {
      "code": 6004,
      "name": "AlreadyEarns",
      "msg": "User is already an earner."
    },
    {
      "code": 6005,
      "name": "NoActiveClaim",
      "msg": "There is no active claim to complete."
    },
    {
      "code": 6006,
      "name": "NotEarning",
      "msg": "User is not earning."
    },
    {
      "code": 6007,
      "name": "RequiredAccountMissing",
      "msg": "An optional account is required in this case, but not provided."
    },
    {
      "code": 6008,
      "name": "InvalidAccount",
      "msg": "Account does not match the expected key."
    },
    {
      "code": 6009,
      "name": "NotActive",
      "msg": "Account is not currently active."
    },
    {
      "code": 6010,
      "name": "InvalidProof",
      "msg": "Merkle proof verification failed."
    },
    {
      "code": 6011,
      "name": "MutableOwner",
      "msg": "Token account owner is required to be immutable."
    }
  ]
};

export const IDL: Earn = {
  "version": "0.1.0",
  "name": "earn",
  "constants": [
    {
      "name": "EARNER_SEED",
      "type": "bytes",
      "value": "[101, 97, 114, 110, 101, 114]"
    },
    {
      "name": "GLOBAL_SEED",
      "type": "bytes",
      "value": "[103, 108, 111, 98, 97, 108]"
    },
    {
      "name": "TOKEN_AUTHORITY_SEED",
      "type": "bytes",
      "value": "[116, 111, 107, 101, 110, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]"
    }
  ],
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        {
          "name": "admin",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "mint",
          "type": "publicKey"
        },
        {
          "name": "earnAuthority",
          "type": "publicKey"
        },
        {
          "name": "initialIndex",
          "type": "u64"
        },
        {
          "name": "claimCooldown",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setEarnAuthority",
      "accounts": [
        {
          "name": "admin",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "newEarnAuthority",
          "type": "publicKey"
        }
      ]
    },
    {
      "name": "setClaimCooldown",
      "accounts": [
        {
          "name": "admin",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "claimCooldown",
          "type": "u64"
        }
      ]
    },
    {
      "name": "propagateIndex",
      "accounts": [
        {
          "name": "signer",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mint",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u64"
        },
        {
          "name": "earnerMerkleRoot",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "claimFor",
      "accounts": [
        {
          "name": "earnAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenAuthorityAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "userTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "earnerAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "mintMultisig",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "snapshotBalance",
          "type": "u64"
        }
      ]
    },
    {
      "name": "completeClaims",
      "accounts": [
        {
          "name": "earnAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "addRegistrarEarner",
      "accounts": [
        {
          "name": "signer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "userTokenAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "earnerAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "user",
          "type": "publicKey"
        },
        {
          "name": "proof",
          "type": {
            "vec": {
              "defined": "ProofElement"
            }
          }
        }
      ]
    },
    {
      "name": "removeRegistrarEarner",
      "accounts": [
        {
          "name": "signer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "globalAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "earnerAccount",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "proofs",
          "type": {
            "vec": {
              "vec": {
                "defined": "ProofElement"
              }
            }
          }
        },
        {
          "name": "neighbors",
          "type": {
            "vec": {
              "array": [
                "u8",
                32
              ]
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "earner",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lastClaimIndex",
            "type": "u64"
          },
          {
            "name": "lastClaimTimestamp",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "user",
            "type": "publicKey"
          },
          {
            "name": "userTokenAccount",
            "type": "publicKey"
          }
        ]
      }
    },
    {
      "name": "global",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "publicKey"
          },
          {
            "name": "earnAuthority",
            "type": "publicKey"
          },
          {
            "name": "portalAuthority",
            "type": "publicKey"
          },
          {
            "name": "mint",
            "type": "publicKey"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "u64"
          },
          {
            "name": "claimCooldown",
            "type": "u64"
          },
          {
            "name": "maxSupply",
            "type": "u64"
          },
          {
            "name": "maxYield",
            "type": "u64"
          },
          {
            "name": "distributed",
            "type": "u64"
          },
          {
            "name": "claimComplete",
            "type": "bool"
          },
          {
            "name": "earnerMerkleRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "ProofElement",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "node",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "onRight",
            "type": "bool"
          }
        ]
      }
    }
  ],
  "events": [
    {
      "name": "RewardsClaim",
      "fields": [
        {
          "name": "tokenAccount",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "amount",
          "type": "u64",
          "index": false
        },
        {
          "name": "ts",
          "type": "u64",
          "index": false
        },
        {
          "name": "index",
          "type": "u64",
          "index": false
        }
      ]
    },
    {
      "name": "IndexUpdate",
      "fields": [
        {
          "name": "index",
          "type": "u64",
          "index": false
        },
        {
          "name": "ts",
          "type": "u64",
          "index": false
        },
        {
          "name": "supply",
          "type": "u64",
          "index": false
        },
        {
          "name": "maxYield",
          "type": "u64",
          "index": false
        }
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "AlreadyClaimed",
      "msg": "Already claimed for user."
    },
    {
      "code": 6001,
      "name": "ExceedsMaxYield",
      "msg": "Rewards exceed max yield."
    },
    {
      "code": 6002,
      "name": "NotAuthorized",
      "msg": "Invalid signer."
    },
    {
      "code": 6003,
      "name": "InvalidParam",
      "msg": "Invalid parameter."
    },
    {
      "code": 6004,
      "name": "AlreadyEarns",
      "msg": "User is already an earner."
    },
    {
      "code": 6005,
      "name": "NoActiveClaim",
      "msg": "There is no active claim to complete."
    },
    {
      "code": 6006,
      "name": "NotEarning",
      "msg": "User is not earning."
    },
    {
      "code": 6007,
      "name": "RequiredAccountMissing",
      "msg": "An optional account is required in this case, but not provided."
    },
    {
      "code": 6008,
      "name": "InvalidAccount",
      "msg": "Account does not match the expected key."
    },
    {
      "code": 6009,
      "name": "NotActive",
      "msg": "Account is not currently active."
    },
    {
      "code": 6010,
      "name": "InvalidProof",
      "msg": "Merkle proof verification failed."
    },
    {
      "code": 6011,
      "name": "MutableOwner",
      "msg": "Token account owner is required to be immutable."
    }
  ]
};
