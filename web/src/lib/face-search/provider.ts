// Face search: "where else on the web does this face appear?"
//
// THE RULE THAT MAKES THIS SAFE: the only face that may ever be sent is the
// reference selfie from the account's own, still-valid live check. There is no
// way to pass in an uploaded picture or anyone else's face (see service.ts).
// PresenSee itself keeps no database of faces; the provider does the searching.

export interface FaceHit {
  /** The page where a matching face was found. */
  pageUrl: string;
  /** How sure the provider is that it is the same person, 0 to 100. */
  score: number;
  /** A small picture of the hit, if the provider sends one. */
  thumbnail?: Buffer;
}

export interface FaceSearchProvider {
  readonly name: string;
  search(selfieJpeg: Buffer): Promise<FaceHit[]>;
}
