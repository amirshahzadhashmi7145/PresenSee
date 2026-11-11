// The FIXED list of sites for the username check.
//
// "auto" sites are requested only at the one address written here, and only
// when that site's robots.txt allows it. We read the status line (or a tiny
// JSON answer from the site's official public API), never the page content.
//
// "manual" sites forbid automatic checks in their robots.txt (or sit behind a
// login wall). They have NO check address on purpose: the app can only show a
// link for the user to open themselves.

export type CheckStatus = "FOUND" | "NOT_FOUND" | "UNKNOWN";

export interface SiteResponse {
  status: number;
  location: string | null;
  body: string;
}

export interface AutoSite {
  id: string;
  name: string;
  kind: "auto";
  /** The public profile page shown to the user. */
  profileUrl: (handle: string) => string;
  /** The single address we request. */
  checkUrl: (handle: string) => string;
  /** Read a small JSON answer (official APIs only). Otherwise only the status is read. */
  readBody?: boolean;
  /** Names this site can have. A name that cannot exist is not requested. */
  handlePattern?: RegExp;
  classify: (res: SiteResponse, handle: string) => CheckStatus;
}

export interface ManualSite {
  id: string;
  name: string;
  kind: "manual";
  profileUrl: (handle: string) => string;
  handlePattern?: RegExp;
}

export type Site = AutoSite | ManualSite;

const e = encodeURIComponent;
const byStatus = (res: SiteResponse): CheckStatus =>
  res.status === 200 ? "FOUND" : res.status === 404 ? "NOT_FOUND" : "UNKNOWN";
const isRedirect = (res: SiteResponse) => res.status >= 300 && res.status < 400;
const bluesky = (h: string) => (h.includes(".") ? h : `${h}.bsky.social`);

export const SITES: Site[] = [
  // --- Official public APIs ---
  {
    id: "github", name: "GitHub", kind: "auto",
    profileUrl: (h) => `https://github.com/${e(h)}`,
    checkUrl: (h) => `https://api.github.com/users/${e(h)}`,
    handlePattern: /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/,
    classify: byStatus,
  },
  {
    id: "bluesky", name: "Bluesky", kind: "auto",
    profileUrl: (h) => `https://bsky.app/profile/${e(bluesky(h))}`,
    checkUrl: (h) => `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${e(bluesky(h))}`,
    readBody: true,
    handlePattern: /^[a-zA-Z0-9][a-zA-Z0-9.-]{1,60}$/,
    classify: (res) =>
      res.status === 200 ? "FOUND" : res.status === 400 && res.body.includes("Profile not found") ? "NOT_FOUND" : "UNKNOWN",
  },
  {
    id: "mastodon", name: "Mastodon (mastodon.social)", kind: "auto",
    profileUrl: (h) => `https://mastodon.social/@${e(h)}`,
    checkUrl: (h) => `https://mastodon.social/.well-known/webfinger?resource=${e(`acct:${h}@mastodon.social`)}`,
    handlePattern: /^[a-zA-Z0-9_]{1,30}$/,
    classify: byStatus,
  },
  {
    id: "devto", name: "DEV (dev.to)", kind: "auto",
    profileUrl: (h) => `https://dev.to/${e(h)}`,
    checkUrl: (h) => `https://dev.to/api/users/by_username?url=${e(h)}`,
    handlePattern: /^[a-zA-Z0-9_-]{2,30}$/,
    classify: byStatus,
  },
  {
    id: "hackernews", name: "Hacker News", kind: "auto",
    profileUrl: (h) => `https://news.ycombinator.com/user?id=${e(h)}`,
    checkUrl: (h) => `https://hacker-news.firebaseio.com/v0/user/${e(h)}.json`,
    readBody: true,
    handlePattern: /^[a-zA-Z0-9_-]{2,15}$/,
    classify: (res) => {
      if (res.status !== 200) return "UNKNOWN";
      const body = res.body.trim();
      return body === "null" ? "NOT_FOUND" : body.startsWith("{") ? "FOUND" : "UNKNOWN";
    },
  },
  {
    id: "keybase", name: "Keybase", kind: "auto",
    profileUrl: (h) => `https://keybase.io/${e(h)}`,
    checkUrl: (h) => `https://keybase.io/_/api/1.0/user/lookup.json?usernames=${e(h)}&fields=basics`,
    readBody: true,
    handlePattern: /^[a-zA-Z0-9]+(?:_[a-zA-Z0-9]+)*$/,
    classify: (res) => {
      if (res.status !== 200) return "UNKNOWN";
      if (/"them"\s*:\s*\[\s*null\s*\]/.test(res.body)) return "NOT_FOUND";
      return /"them"\s*:\s*\[\s*\{/.test(res.body) ? "FOUND" : "UNKNOWN";
    },
  },
  // --- Public profile address, status only ---
  { id: "youtube", name: "YouTube", kind: "auto", profileUrl: (h) => `https://www.youtube.com/@${e(h)}`, checkUrl: (h) => `https://www.youtube.com/@${e(h)}`, handlePattern: /^[a-zA-Z0-9._-]{3,30}$/, classify: byStatus },
  { id: "snapchat", name: "Snapchat", kind: "auto", profileUrl: (h) => `https://www.snapchat.com/@${e(h)}`, checkUrl: (h) => `https://www.snapchat.com/@${e(h)}`, handlePattern: /^[a-zA-Z][a-zA-Z0-9._-]{2,14}$/, classify: byStatus },
  { id: "kick", name: "Kick", kind: "auto", profileUrl: (h) => `https://kick.com/${e(h)}`, checkUrl: (h) => `https://kick.com/${e(h)}`, classify: byStatus },
  {
    id: "gitlab", name: "GitLab", kind: "auto",
    profileUrl: (h) => `https://gitlab.com/${e(h)}`,
    checkUrl: (h) => `https://gitlab.com/${e(h)}`,
    classify: (res) =>
      res.status === 200 ? "FOUND" : isRedirect(res) && (res.location ?? "").includes("/users/sign_in") ? "NOT_FOUND" : "UNKNOWN",
  },
  {
    id: "substack", name: "Substack", kind: "auto",
    profileUrl: (h) => `https://substack.com/@${e(h)}`,
    checkUrl: (h) => `https://substack.com/@${e(h)}`,
    handlePattern: /^[a-zA-Z0-9]{4,32}$/,
    classify: (res) =>
      res.status === 200 ? "FOUND" : isRedirect(res) && (res.location ?? "").includes("/search/") ? "NOT_FOUND" : byStatus(res),
  },
  {
    id: "patreon", name: "Patreon", kind: "auto",
    profileUrl: (h) => `https://www.patreon.com/${e(h)}`,
    checkUrl: (h) => `https://www.patreon.com/${e(h)}`,
    classify: (res, h) =>
      isRedirect(res) && new RegExp(`/cw?/${h.replace(/[.]/g, "\\.")}(?:$|[/?])`, "i").test(res.location ?? "") ? "FOUND" : byStatus(res),
  },
  { id: "vimeo", name: "Vimeo", kind: "auto", profileUrl: (h) => `https://vimeo.com/${e(h)}`, checkUrl: (h) => `https://vimeo.com/${e(h)}`, classify: byStatus },
  { id: "soundcloud", name: "SoundCloud", kind: "auto", profileUrl: (h) => `https://soundcloud.com/${e(h)}`, checkUrl: (h) => `https://soundcloud.com/${e(h)}`, handlePattern: /^[a-z0-9_-]{3,25}$/i, classify: byStatus },
  {
    id: "behance", name: "Behance", kind: "auto",
    profileUrl: (h) => `https://www.behance.net/${e(h)}`,
    checkUrl: (h) => `https://www.behance.net/${e(h)}`,
    classify: (res, h) => (isRedirect(res) && (res.location ?? "").toLowerCase().includes(`/${h.toLowerCase()}/`) ? "FOUND" : byStatus(res)),
  },
  { id: "dribbble", name: "Dribbble", kind: "auto", profileUrl: (h) => `https://dribbble.com/${e(h)}`, checkUrl: (h) => `https://dribbble.com/${e(h)}`, classify: byStatus },
  { id: "gravatar", name: "Gravatar", kind: "auto", profileUrl: (h) => `https://gravatar.com/${e(h)}`, checkUrl: (h) => `https://gravatar.com/${e(h)}`, classify: byStatus },
  { id: "chesscom", name: "Chess.com", kind: "auto", profileUrl: (h) => `https://www.chess.com/member/${e(h)}`, checkUrl: (h) => `https://www.chess.com/member/${e(h)}`, handlePattern: /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,24}$/, classify: byStatus },
  { id: "venmo", name: "Venmo", kind: "auto", profileUrl: (h) => `https://account.venmo.com/u/${e(h)}`, checkUrl: (h) => `https://account.venmo.com/u/${e(h)}`, handlePattern: /^[a-zA-Z0-9_-]{5,30}$/, classify: byStatus },

  // --- Link only: robots.txt forbids automatic checks, or there is a login wall ---
  { id: "instagram", name: "Instagram", kind: "manual", profileUrl: (h) => `https://www.instagram.com/${e(h)}/`, handlePattern: /^[a-zA-Z0-9._]{1,30}$/ },
  { id: "facebook", name: "Facebook", kind: "manual", profileUrl: (h) => `https://www.facebook.com/${e(h)}`, handlePattern: /^[a-zA-Z0-9.]{5,50}$/ },
  { id: "threads", name: "Threads", kind: "manual", profileUrl: (h) => `https://www.threads.com/@${e(h)}`, handlePattern: /^[a-zA-Z0-9._]{1,30}$/ },
  { id: "x", name: "X (Twitter)", kind: "manual", profileUrl: (h) => `https://x.com/${e(h)}`, handlePattern: /^[a-zA-Z0-9_]{4,15}$/ },
  { id: "tiktok", name: "TikTok", kind: "manual", profileUrl: (h) => `https://www.tiktok.com/@${e(h)}`, handlePattern: /^[a-zA-Z0-9._]{2,24}$/ },
  { id: "linkedin", name: "LinkedIn", kind: "manual", profileUrl: (h) => `https://www.linkedin.com/in/${e(h)}`, handlePattern: /^[a-zA-Z0-9-]{3,100}$/ },
  { id: "pinterest", name: "Pinterest", kind: "manual", profileUrl: (h) => `https://www.pinterest.com/${e(h)}/`, handlePattern: /^[a-zA-Z0-9_]{3,30}$/ },
  { id: "reddit", name: "Reddit", kind: "manual", profileUrl: (h) => `https://www.reddit.com/user/${e(h)}/`, handlePattern: /^[a-zA-Z0-9_-]{3,20}$/ },
  { id: "tumblr", name: "Tumblr", kind: "manual", profileUrl: (h) => `https://www.tumblr.com/${e(h)}`, handlePattern: /^[a-zA-Z0-9-]{1,32}$/ },
  { id: "telegram", name: "Telegram", kind: "manual", profileUrl: (h) => `https://t.me/${e(h)}`, handlePattern: /^[a-zA-Z0-9_]{5,32}$/ },
  { id: "twitch", name: "Twitch", kind: "manual", profileUrl: (h) => `https://www.twitch.tv/${e(h)}`, handlePattern: /^[a-zA-Z0-9_]{4,25}$/ },
  { id: "linktree", name: "Linktree", kind: "manual", profileUrl: (h) => `https://linktr.ee/${e(h)}` },
  { id: "onlyfans", name: "OnlyFans", kind: "manual", profileUrl: (h) => `https://onlyfans.com/${e(h)}` },
  { id: "steam", name: "Steam", kind: "manual", profileUrl: (h) => `https://steamcommunity.com/id/${e(h)}`, handlePattern: /^[a-zA-Z0-9_-]{3,32}$/ },
];

export const MAX_USERNAMES = 5;

/** Words that are pages on many sites. A handle may never be one of these,
 *  so a check can never land on a signup, login or password-reset page. */
export const RESERVED_HANDLES = new Set([
  "login", "signin", "sign_in", "sign-in", "signup", "sign_up", "sign-up", "register", "join",
  "password", "passwords", "reset", "recover", "recovery", "forgot", "account", "accounts", "settings",
  "admin", "api", "auth", "oauth", "users", "user", "help", "about", "search", "explore", "home",
  "developers", "teams", "support", "privacy", "terms", "logout",
]);

/** Clean up what the user typed, or return null if it cannot be a handle. */
export function normalizeHandle(raw: string): string | null {
  const handle = raw.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]{2,40}$/.test(handle)) return null;
  if (RESERVED_HANDLES.has(handle.toLowerCase())) return null;
  return handle;
}
