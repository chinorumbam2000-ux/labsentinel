import { describe, expect, it } from 'vitest';
// Read as text through Vite rather than node:fs, so this type-checks under the
// app tsconfig, which has no node types.
import appShell from '../../components/layout/AppShell.tsx?raw';

/**
 * Scroll-containment regression guard.
 *
 * The bug this protects against: Tailwind's `sr-only` (used by every table
 * caption) is `position: absolute`. An absolutely positioned box whose
 * ancestors are all `position: static` resolves against the *initial
 * containing block*, so it is not clipped by #ls-main and its box extends the
 * document's scrollable area instead. On Day 1 the dashboard renders no
 * below-the-fold caption; from Day 2 the Day-over-Day table does, which turned
 * the document into a second scroll container and let the whole app shell
 * scroll away to reveal a blank page.
 *
 * The fix is that #ls-main is itself positioned, so it becomes the containing
 * block for those boxes. These assertions fail if that is ever removed.
 *
 * Scope: this suite runs in a `node` environment with no layout engine, so
 * scroll heights and computed styles cannot be measured here. This guards the
 * markup that produces the correct layout; the measured behaviour, including
 * the document lock and the shell's dvh height, is asserted against a real
 * browser in scratchpad/scroll-verify.mjs.
 */

/** The single className string applied to the #ls-main element. */
const mainClassName = (): string => {
  const match = appShell.match(/id="ls-main"\s*\n\s*className="([^"]+)"/);
  expect(match, '#ls-main className not found in AppShell').toBeTruthy();
  return match![1];
};

describe('scroll containment', () => {
  it('makes #ls-main a containing block, so absolutely positioned boxes cannot escape it', () => {
    // Without this, `sr-only` captions below the fold extend the document.
    expect(mainClassName().split(/\s+/)).toContain('relative');
  });

  it('keeps #ls-main the one page-content scroller', () => {
    const classes = mainClassName().split(/\s+/);
    expect(classes).toContain('overflow-y-auto');
    expect(classes).toContain('overflow-x-hidden');
    // A flex child will not shrink below its content without this, which would
    // push the shell past the viewport.
    expect(classes).toContain('min-h-0');
    expect(classes).toContain('flex-1');
  });

  it('contains overscroll so wheel momentum does not chain outward at the boundary', () => {
    expect(mainClassName().split(/\s+/)).toContain('overscroll-y-contain');
  });

  it('sizes the app shell from .ls-shell rather than h-screen', () => {
    expect(appShell).toContain('ls-shell');
    // h-screen is 100vh, which overshoots the visual viewport on mobile while
    // the URL bar is showing. .ls-shell resolves to 100dvh where supported.
    expect(appShell).not.toMatch(/\bh-screen\b/);
  });

  it('never lets the shell grow with its content', () => {
    const shellDiv = appShell.match(/<div className="ls-shell([^"]*)"/);
    expect(shellDiv, 'shell div not found').toBeTruthy();
    expect(shellDiv![1]).toContain('overflow-hidden');
    expect(shellDiv![1]).not.toMatch(/\bmin-h-/);
  });
});
