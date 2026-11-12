// Turns result links into "your internet presence": which profile, on which
// platform, a page belongs to. This only reads the link text. It never visits
// the page.

export interface ProfileRef {
  platform: string;
  handle: string;
  profileUrl: string;
}

type Rule = {
  platform: string;
  domains: string[];
  find: (url: URL, parts: string[]) => string | null;
  link: (handle: string) => string;
};

const HANDLE = /^[\w.\-]{1,60}$/;
const firstUnless = (reserved: string[]) => (_url: URL, parts: string[]) =>
  parts[0] && !reserved.includes(parts[0].toLowerCase()) ? parts[0] : null;
const atHandle = (_url: URL, parts: string[]) => (parts[0]?.startsWith("@") ? parts[0].slice(1) : null);
const after = (...markers: string[]) => (_url: URL, parts: string[]) =>
  markers.includes(parts[0]?.toLowerCase()) && parts[1] ? parts[1] : null;

const RULES: Rule[] = [
  {
    platform: "Instagram", domains: ["instagram.com"],
    find: (url, parts) =>
      parts[0] === "stories" ? (parts[1] ?? null) : firstUnless(["p", "reel", "reels", "tv", "explore", "accounts", "direct", "about", "legal", "developer"])(url, parts),
    link: (h) => `https://www.instagram.com/${h}/`,
  },
  {
    platform: "Facebook", domains: ["facebook.com", "fb.com"],
    find: (url, parts) => {
      if (parts[0] === "profile.php") return url.searchParams.get("id");
      if (parts[0] === "people" && parts[2]) return parts[2];
      return firstUnless(["watch", "groups", "pages", "events", "marketplace", "photo", "photo.php", "photos", "share", "sharer", "story.php", "permalink.php", "login", "help", "reel", "videos", "hashtag", "public", "media", "gaming", "stories"])(url, parts);
    },
    link: (h) => (/^\d+$/.test(h) ? `https://www.facebook.com/profile.php?id=${h}` : `https://www.facebook.com/${h}`),
  },
  { platform: "X (Twitter)", domains: ["x.com", "twitter.com"], find: firstUnless(["i", "home", "search", "hashtag", "explore", "intent", "share", "settings", "login", "tos", "privacy"]), link: (h) => `https://x.com/${h}` },
  { platform: "TikTok", domains: ["tiktok.com"], find: atHandle, link: (h) => `https://www.tiktok.com/@${h}` },
  { platform: "Threads", domains: ["threads.net", "threads.com"], find: atHandle, link: (h) => `https://www.threads.com/@${h}` },
  { platform: "LinkedIn", domains: ["linkedin.com"], find: after("in", "pub"), link: (h) => `https://www.linkedin.com/in/${h}` },
  { platform: "Pinterest", domains: ["pinterest.com", "pinterest.co.uk"], find: firstUnless(["pin", "search", "ideas", "explore", "today", "business"]), link: (h) => `https://www.pinterest.com/${h}/` },
  { platform: "Reddit", domains: ["reddit.com"], find: after("user", "u"), link: (h) => `https://www.reddit.com/user/${h}/` },
  {
    platform: "YouTube", domains: ["youtube.com"],
    find: (url, parts) => atHandle(url, parts) ?? after("c", "user", "channel")(url, parts),
    link: (h) => (h.startsWith("UC") && h.length > 20 ? `https://www.youtube.com/channel/${h}` : `https://www.youtube.com/@${h}`),
  },
  {
    platform: "Tumblr", domains: ["tumblr.com"],
    find: (url, parts) => {
      const sub = url.hostname.toLowerCase().replace(/\.tumblr\.com$/, "");
      if (sub !== url.hostname.toLowerCase() && sub !== "www") return sub;
      return firstUnless(["tagged", "explore", "search", "dashboard", "blog", "login", "register"])(url, parts);
    },
    link: (h) => `https://www.tumblr.com/${h}`,
  },
  { platform: "Snapchat", domains: ["snapchat.com"], find: (url, parts) => atHandle(url, parts) ?? after("add")(url, parts), link: (h) => `https://www.snapchat.com/@${h}` },
  { platform: "Telegram", domains: ["t.me", "telegram.me"], find: firstUnless(["s", "joinchat", "share", "addstickers", "c"]), link: (h) => `https://t.me/${h}` },
  { platform: "VK", domains: ["vk.com", "vk.ru"], find: firstUnless(["wall", "photo", "video", "feed", "search", "login", "away.php"]), link: (h) => `https://vk.com/${h}` },
  { platform: "Tinder", domains: ["tinder.com"], find: atHandle, link: (h) => `https://tinder.com/@${h}` },
  { platform: "GitHub", domains: ["github.com"], find: firstUnless(["topics", "search", "explore", "orgs", "features", "about", "login", "marketplace", "sponsors", "settings"]), link: (h) => `https://github.com/${h}` },
  { platform: "Medium", domains: ["medium.com"], find: atHandle, link: (h) => `https://medium.com/@${h}` },
];

/** The profile a page belongs to, if the link shows it. Otherwise null. */
export function profileFromUrl(pageUrl: string): ProfileRef | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const rule = RULES.find((r) => r.domains.some((d) => host === d || host.endsWith(`.${d}`)));
  if (!rule) return null;
  const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  const handle = rule.find(url, parts);
  if (!handle || !HANDLE.test(handle)) return null;
  return { platform: rule.platform, handle, profileUrl: rule.link(handle) };
}

export interface PresenceInput {
  pageUrl: string;
  siteName: string;
  tag: string;
}

export interface PresenceSummary {
  pages: number;
  sites: { site: string; pages: number }[];
  profiles: (ProfileRef & { pages: number; fake: number; mine: number })[];
  fake: number;
  mine: number;
  untagged: number;
}

/** Roll all results up into profiles and sites. */
export function summarizePresence(results: PresenceInput[]): PresenceSummary {
  const unique = new Map<string, PresenceInput>();
  for (const result of results) if (!unique.has(result.pageUrl)) unique.set(result.pageUrl, result);

  const sites = new Map<string, number>();
  const profiles = new Map<string, ProfileRef & { pages: number; fake: number; mine: number }>();
  let fake = 0;
  let mine = 0;
  let untagged = 0;
  for (const result of unique.values()) {
    const site = result.siteName.replace(/^www\./, "").toLowerCase();
    sites.set(site, (sites.get(site) ?? 0) + 1);
    if (result.tag === "FAKE") fake += 1;
    else if (result.tag === "MINE") mine += 1;
    else if (result.tag === "UNTAGGED") untagged += 1;
    const profile = profileFromUrl(result.pageUrl);
    if (!profile) continue;
    const key = `${profile.platform}:${profile.handle.toLowerCase()}`;
    const entry = profiles.get(key) ?? { ...profile, pages: 0, fake: 0, mine: 0 };
    entry.pages += 1;
    if (result.tag === "FAKE") entry.fake += 1;
    if (result.tag === "MINE") entry.mine += 1;
    profiles.set(key, entry);
  }
  return {
    pages: unique.size,
    sites: [...sites].map(([site, pages]) => ({ site, pages })).sort((a, b) => b.pages - a.pages || a.site.localeCompare(b.site)),
    profiles: [...profiles.values()].sort((a, b) => b.pages - a.pages || a.platform.localeCompare(b.platform)),
    fake,
    mine,
    untagged,
  };
}
