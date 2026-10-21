// Share links: the whole map, compressed, in the URL fragment. The fragment
// never reaches the server, so sharing needs no backend and stays private
// to whoever has the link.
import type { MapData } from '../types/map';

const FRAGMENT_PREFIX = '#map=1:';
// Some chat apps cut off or refuse links longer than this
export const LONG_LINK_CHARS = 4000;

async function pipe(bytes: Uint8Array<ArrayBuffer>, transform: CompressionStream | DecompressionStream) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** A link to this page that opens a copy of the map */
export async function createShareLink(map: MapData): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(map));
  const data = toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
  const url = new URL(window.location.href);
  url.hash = FRAGMENT_PREFIX.slice(1) + data;
  return url.toString();
}

export function isShareFragment(hash: string): boolean {
  return hash.startsWith(FRAGMENT_PREFIX);
}

/** The map JSON in a share-link fragment; throws if the link is damaged */
export async function readShareFragment(hash: string): Promise<unknown> {
  const bytes = await pipe(fromBase64Url(hash.slice(FRAGMENT_PREFIX.length)), new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Removes the map from the address bar, so reloading doesn't open it again */
export function clearShareFragment() {
  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState(window.history.state, '', url.pathname + url.search);
}
