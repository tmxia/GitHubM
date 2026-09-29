import { translateText, TranslateLang } from './api/translation';

function shouldTranslate(text: string, targetLang: TranslateLang): boolean {
  if (!text || text.length < 2) return false;
  if (!/[a-zA-Z\u4e00-\u9fa5\u0800-\u4e00]/.test(text)) return false;

  if (targetLang === 'zh') {
    if (/[\u4e00-\u9fa5]/.test(text)) return false;
    return true;
  }

  if (targetLang === 'en') {
    if (/[\u4e00-\u9fa5\u0800-\u4e00]/.test(text)) return true;
    return false;
  }

  return false;
}

const MAX_FAIL_ROUNDS = 4;
const MAX_BATCH = 50;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8000;

class ViewportTranslator {
  private targetLang: TranslateLang | 'off' = 'off';
  private observer: IntersectionObserver | null = null;
  private mutationObserver: MutationObserver | null = null;

  private pendingNodes: Set<Text> = new Set();
  private translating: boolean = false;
  private originalTextMap: WeakMap<Text, string> = new WeakMap();
  private translatedNodes: Set<Text> = new Set();
  private timer: number | null = null;

  private translationCache: Map<string, string> = new Map();

  private failRounds = 0;

  constructor() {
    this.observer = new IntersectionObserver(this.handleIntersection.bind(this), {
      rootMargin: '100px',
    });

    this.mutationObserver = new MutationObserver(this.handleMutations.bind(this));
  }

  public setConfig(targetLang: TranslateLang | 'off') {
    if (this.targetLang === targetLang) return;
    this.targetLang = targetLang;

    if (targetLang === 'off') {
      this.stop();
      this.restoreAll();
    } else {
      this.failRounds = 0;
      this.start();
    }
  }

  private start() {
    if (!this.observer || !this.mutationObserver) return;
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.scanAndObserve(document.body);
  }

  private stop() {
    this.observer?.disconnect();
    this.mutationObserver?.disconnect();
    this.pendingNodes.clear();
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private restoreAll() {
    this.translatedNodes.forEach((node) => {
      const original = this.originalTextMap.get(node);
      if (original !== undefined) {
        node.nodeValue = original;
      }
    });
    this.translatedNodes.clear();
    this.pendingNodes.clear();
  }

  private pruneDetachedNodes() {
    if (this.translatedNodes.size < 200) return;
    let pruned = 0;
    this.translatedNodes.forEach((node) => {
      if (!node.isConnected) {
        this.translatedNodes.delete(node);
        pruned++;
      }
    });
    if (pruned > 0) {
      console.debug('[Translator] pruned', pruned, 'detached nodes');
    }
  }

  private scanAndObserve(root: Node) {
    if (this.targetLang === 'off') return;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (parent && ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT'].includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      if (this.translatedNodes.has(textNode)) continue;

      const text = textNode.nodeValue || '';
      if (shouldTranslate(text, this.targetLang as TranslateLang)) {
        if (!this.originalTextMap.has(textNode)) {
          this.originalTextMap.set(textNode, text);
        }
        if (textNode.parentElement) {
          this.observer?.observe(textNode.parentElement);
        }
      }
    }
  }

  private handleMutations(mutations: MutationRecord[]) {
    if (this.targetLang === 'off') return;

    mutations.forEach((m) => {
      if (m.type === 'childList') {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.scanAndObserve(node);
          } else if (node.nodeType === Node.TEXT_NODE) {
            const textNode = node as Text;
            const parent = textNode.parentElement;
            if (parent && !['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(parent.tagName)) {
              const text = textNode.nodeValue || '';
              if (text.trim() && shouldTranslate(text, this.targetLang as TranslateLang)) {
                this.originalTextMap.set(textNode, text);
                this.observer?.observe(parent);
              }
            }
          }
        });
      } else if (m.type === 'characterData') {
        const textNode = m.target as Text;
        if (this.translatedNodes.has(textNode)) return;

        const text = textNode.nodeValue || '';
        if (text.trim() && shouldTranslate(text, this.targetLang as TranslateLang)) {
          this.originalTextMap.set(textNode, text);
          if (textNode.parentElement) {
            this.observer?.observe(textNode.parentElement);
          }
        }
      }
    });
  }

  private handleIntersection(entries: IntersectionObserverEntry[]) {
    let hasNew = false;
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target as HTMLElement;
        Array.from(el.childNodes).forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            const textNode = child as Text;
            if (this.originalTextMap.has(textNode) && !this.translatedNodes.has(textNode)) {
              this.pendingNodes.add(textNode);
              hasNew = true;
            }
          }
        });
        this.observer?.unobserve(el);
      }
    });

    if (hasNew) {
      this.scheduleTranslation();
    }
  }

  private scheduleTranslation() {
    if (this.translating || this.pendingNodes.size === 0) {
      if (!this.translating && this.timer === null) {
        this.timer = window.setTimeout(() => this.processPending(), 500);
      }
      return;
    }

    if (this.timer) {
      window.clearTimeout(this.timer);
    }

    const delay = this.failRounds > 0
      ? Math.min(BASE_BACKOFF_MS * Math.pow(2, this.failRounds - 1), MAX_BACKOFF_MS)
      : 500;
    this.timer = window.setTimeout(() => this.processPending(), delay);
  }

  private async processPending() {
    if (this.pendingNodes.size === 0 || this.targetLang === 'off') return;

    this.translating = true;
    this.pruneDetachedNodes();

    const batch = Array.from(this.pendingNodes).slice(0, MAX_BATCH);
    batch.forEach(n => this.pendingNodes.delete(n));

    const nodeTextList = batch.map(n => ({
      node: n,
      original: this.originalTextMap.get(n) || '',
      clean: (this.originalTextMap.get(n) || '').replace(/\n/g, ' ')
    })).filter(item => item.clean.trim().length > 0);

    if (nodeTextList.length === 0) {
      this.translating = false;
      this.scheduleTranslation();
      return;
    }

    const cacheHits: Array<{ node: Text; dst: string }> = [];
    const uncached = nodeTextList.filter(item => {
      const dst = this.translationCache.get(item.clean.trim());
      if (dst !== undefined) {
        cacheHits.push({ node: item.node, dst });
        return false;
      }
      return true;
    });

    cacheHits.forEach(({ node, dst }) => {
      if (node.isConnected) {
        this.translatedNodes.add(node);
        node.nodeValue = dst;
      }
    });

    if (uncached.length === 0) {
      this.failRounds = 0;
      this.translating = false;
      this.scheduleTranslation();
      return;
    }

    const q = uncached.map(item => item.clean).join('\n');

    try {
      const result = await translateText(q, 'auto', this.targetLang as TranslateLang);

      const dict = new Map<string, string>();
      result.trans_result.forEach(r => {
        dict.set(r.src.trim(), r.dst);
      });

      uncached.forEach(item => {
        const dst = dict.get(item.clean.trim());
        if (dst) {
          const key = item.clean.trim();
          this.translationCache.set(key, dst);
          if (item.node.isConnected) {
            this.translatedNodes.add(item.node);
            item.node.nodeValue = dst;
          }
        }
      });

      if (this.translationCache.size > 2000) {
        let i = 0;
        const keysToDrop = Math.floor(this.translationCache.size / 2);
        for (const key of this.translationCache.keys()) {
          this.translationCache.delete(key);
          if (++i >= keysToDrop) break;
        }
      }

      this.failRounds = 0;
    } catch (e) {
      console.warn('Auto translation failed:', e);

      if (this.failRounds < MAX_FAIL_ROUNDS) {
        this.failRounds++;
        batch.forEach(n => this.pendingNodes.add(n));
      } else {
        console.warn('[Translator] 放弃重试，等待新内容触发翻译');
      }
    } finally {
      this.translating = false;
      this.scheduleTranslation();
    }
  }
}

export const viewportTranslator = new ViewportTranslator();