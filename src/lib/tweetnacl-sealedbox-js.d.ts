declare module 'tweetnacl-sealedbox-js' {
  /** 密封消息：使用接收方公钥加密，返回含公钥前缀的密文。 */
  export function seal(message: Uint8Array, publicKey: Uint8Array): Uint8Array;
  /** 解密密封消息。 */
  export function open(
    ciphertext: Uint8Array,
    nonce: Uint8Array,
    publicKey: Uint8Array,
    secretKey: Uint8Array,
  ): Uint8Array;
  /** 密文相较明文的额外字节长度。 */
  export const overheadLength: number;

  const sealedbox: {
    seal: typeof seal;
    open: typeof open;
    overheadLength: typeof overheadLength;
  };
  export default sealedbox;
}
