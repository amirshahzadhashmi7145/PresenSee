// Official "report a fake or impersonating account" pages, shown when the user
// tags a result as Fake. A small static list of major platforms. Every address
// is on the platform's own domain. Checked 2026-11-11, except X (its help site
// refused automated reading, so that one was not opened).

export interface ReportLink {
  platform: string;
  url: string;
  note: string;
  domains: string[];
}

export const REPORT_LINKS: ReportLink[] = [
  { platform: "Instagram", url: "https://help.instagram.com/contact/636276399721841", note: "Web form. You do not need an Instagram account.", domains: ["instagram.com", "instagr.am", "ig.me"] },
  { platform: "Facebook", url: "https://www.facebook.com/help/contact/295309487309948", note: "Web form. You do not need a Facebook account.", domains: ["facebook.com", "fb.com", "fb.me", "messenger.com", "m.me"] },
  { platform: "Threads", url: "https://help.instagram.com/contact/636276399721841", note: "Same form as Instagram. No account needed.", domains: ["threads.net", "threads.com"] },
  { platform: "WhatsApp", url: "https://faq.whatsapp.com/1739028180144800", note: "Help article. Reporting is done inside the app.", domains: ["whatsapp.com", "wa.me"] },
  { platform: "X (Twitter)", url: "https://help.x.com/en/safety-and-security/report-x-impersonation", note: "Help article that links to the report form.", domains: ["x.com", "twitter.com"] },
  { platform: "TikTok", url: "https://www.tiktok.com/legal/report/impersonation", note: "Web form. You do not need a TikTok account.", domains: ["tiktok.com"] },
  { platform: "YouTube", url: "https://support.google.com/youtube/answer/2801947", note: "Help article that links to the form. Needs a Google account.", domains: ["youtube.com", "youtu.be"] },
  { platform: "LinkedIn", url: "https://www.linkedin.com/help/linkedin/answer/a1338436", note: "Help article. Report from the fake profile while signed in.", domains: ["linkedin.com", "lnkd.in"] },
  { platform: "Snapchat", url: "https://help.snapchat.com/hc/en-us/articles/7012399221652-How-do-I-report-abuse-illegal-content-or-other-violations-on-Snapchat", note: "Help article that links to a web form. No account needed.", domains: ["snapchat.com"] },
  { platform: "Pinterest", url: "https://help.pinterest.com/en/contact/about-you/?form_category=reporting&form_type=report_account_impersonation", note: "Web form. You do not need a Pinterest account.", domains: ["pinterest.com", "pin.it"] },
  { platform: "Discord", url: "https://discord.com/safety/360044103651-reporting-abusive-behavior-to-discord", note: "Help article. Reporting is done inside the app.", domains: ["discord.com", "discord.gg"] },
  { platform: "Twitch", url: "https://help.twitch.tv/s/article/how-to-file-a-user-report", note: "Help article. Report from the profile while signed in.", domains: ["twitch.tv"] },
  { platform: "Bluesky", url: "https://bsky.social/about/support", note: "Support page with a contact email; signed-in users can report in the app.", domains: ["bsky.app", "bsky.social"] },
  { platform: "Mastodon", url: "https://docs.joinmastodon.org/user/moderating/", note: "Each server has its own moderators. This explains how to report.", domains: ["mastodon.social"] },
  { platform: "GitHub", url: "https://docs.github.com/en/communities/maintaining-your-safety-on-github/reporting-abuse-or-spam", note: "Help article. The form needs a GitHub account.", domains: ["github.com"] },
  { platform: "Substack", url: "https://substack.com/content", note: "Content rules with a report email address.", domains: ["substack.com"] },
  { platform: "Linktree", url: "https://linktr.ee/trust/report", note: "Web form. No account needed.", domains: ["linktr.ee", "linktree.com"] },
];

/** Used when the site is not on the list. */
export const GENERIC_REPORT_LINKS: Omit<ReportLink, "domains">[] = [
  { platform: "Contact the site", url: "https://support.google.com/websearch/answer/9109", note: "Google's guide to finding who runs a website and asking them to remove something." },
  { platform: "Copyright takedown", url: "https://www.copyright.gov/512/", note: "If you took the photo yourself, you can send the site a copyright (DMCA) notice." },
  { platform: "Hide it from Google Search", url: "https://support.google.com/websearch/contact/content_removal_form", note: "Ask Google to remove a result that shows your personal content." },
];

/** The official report page for the platform that hosts this address, if we list it. */
export function reportLinkFor(pageUrl: string): ReportLink | null {
  let host: string;
  try {
    host = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  return REPORT_LINKS.find((link) => link.domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) ?? null;
}
