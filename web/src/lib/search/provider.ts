// The contract every reverse image search provider follows.
// Results come ONLY from a provider's official API. Nothing here scrapes sites,
// and result images are never downloaded by our server.

export interface SearchImage {
  bytes: Buffer;
  mimeType: string;
}

export interface ImageMatchResult {
  /** The page where the photo appears. */
  pageUrl: string;
  /** The site's name or domain. */
  siteName: string;
  /** A small picture to show, loaded by the browser straight from this link. */
  thumbnailUrl?: string;
  /** When the provider first saw it, if known. */
  foundDate?: Date;
  /** How strongly it matches the photo, 0 to 100, if the provider says. */
  score?: number;
}

export interface ReverseImageSearchProvider {
  readonly name: string;
  search(image: SearchImage): Promise<ImageMatchResult[]>;
}
