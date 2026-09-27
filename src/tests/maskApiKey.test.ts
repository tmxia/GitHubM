import { describe, it, expect } from 'vitest';

function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '*'.repeat(key.length);
  return key.slice(0, 4) + '*'.repeat(Math.min(key.length - 8, 20)) + key.slice(-4);
}

describe('maskApiKey', () => {

  it('空字符串返回空字符串', () => {
    expect(maskApiKey('')).toBe('');
  });

  it('长度为1的key全部掩码', () => {
    expect(maskApiKey('a')).toBe('*');
  });

  it('长度为4的key全部掩码', () => {
    expect(maskApiKey('abcd')).toBe('****');
  });

  it('长度为8的key全部掩码', () => {
    expect(maskApiKey('12345678')).toBe('********');
  });

  it('长度为9时中间只有1个星号', () => {
    expect(maskApiKey('123456789')).toBe('1234*6789');
  });

  it('长度为12时中间有4个星号', () => {
    expect(maskApiKey('abcdefghijkl')).toBe('abcd****ijkl');
  });

  it('长度为16时中间有8个星号', () => {
    const key = 'a'.repeat(4) + 'b'.repeat(8) + 'c'.repeat(4);
    const masked = maskApiKey(key);
    expect(masked).toBe('aaaa' + '********' + 'cccc');
  });

  it('中间掩码长度上限为20个星号', () => {
    const key = 'A'.repeat(4) + 'x'.repeat(24) + 'Z'.repeat(4);
    const masked = maskApiKey(key);
    expect(masked).toBe('AAAA' + '*'.repeat(20) + 'ZZZZ');
  });

  it('超长key（64字符）中间掩码不超过20个', () => {
    const key = 'HEAD' + 'x'.repeat(56) + 'TAIL';
    const masked = maskApiKey(key);
    const middlePart = masked.slice(4, masked.length - 4);
    expect(middlePart.length).toBeLessThanOrEqual(20);
    expect(middlePart).toMatch(/^\*+$/);
  });

  it('典型 GitHub Token（ghp_ 前缀）掩码后保留前缀', () => {
    const token = 'ghp_AbCdEfGhIjKlMnOpQrSt';
    const masked = maskApiKey(token);
    expect(masked.startsWith('ghp_')).toBe(true);
    expect(masked.endsWith('QrSt')).toBe(true);
    expect(masked).toContain('*');
  });

  it('典型 OpenAI API Key（sk- 前缀）掩码后格式正确', () => {
    const key = 'sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz';
    const masked = maskApiKey(key);
    expect(masked.startsWith('sk-p')).toBe(true);
    expect(masked).toContain('*');
    expect(masked.slice(-4)).toBe(key.slice(-4));
  });

  it('掩码不改变前4位和后4位的明文内容', () => {
    const key = 'FIRST_PART_middle_END1';
    const masked = maskApiKey(key);
    expect(masked.slice(0, 4)).toBe(key.slice(0, 4));
    expect(masked.slice(-4)).toBe(key.slice(-4));
  });
});
