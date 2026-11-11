# PresenSee — plan

PresenSee lets a person check their **own** online presence. They prove some photos are of them, then the app finds where those exact photos appear on the web, so they can spot fake profiles using their pictures. It is not a tool to look up other people.

**Status: plan approved. Building step by step.**

## Changes from the original brief

| Brief | Now |
|---|---|
| Name "SelfCheck" | **PresenSee** |
| Email sign-up with a one-time code | **Skipped for now.** Opening the app creates an anonymous account tied to the browser (a cookie). Limits and "Delete my account" work on that account. Email sign-up can be added later on top of it. Until then the app is for local testing only, not for the public internet. |
| Tests written at the end | Tests for each hard rule are written **with** the step that builds it. Step 7 is a final check that none is missing. |

## The three parts

- **web** — Next.js 16 (App Router, TypeScript, Tailwind 4), Prisma 7, PostgreSQL 16. The pages, plus the server routes that enforce every rule.
- **face** — a small Python 3.12 FastAPI service. It counts faces, runs the live check and does the 1-to-1 match. Only the web server can talk to it; the browser cannot. It has no internet access and writes nothing to disk.
- **db** — PostgreSQL. It holds records only, never photos or face data.

A photo travels like this: browser → web server → face service says pass or fail → only on a pass is the photo encrypted and saved → only saved photos can be searched.

## Choices

**Face library: OpenCV with its YuNet and SFace models.**
YuNet finds and counts faces; SFace says whether two faces are the same person. The licence files were read on 2026-11-11: OpenCV is Apache 2.0, YuNet is MIT, SFace is Apache 2.0. All three allow commercial use. It is one pip package, the two models are about 39 MB together, and it runs fast on a normal CPU.

- Rejected because their model licences forbid commercial use: InsightFace, the `face_recognition` package, EdgeFace, LVFace. DeepFace and facenet-pytorch are unclear.
- Weak spot: OpenCV has never said which photos SFace was trained on. The matcher sits behind a small switch, so it can be swapped for AuraFace (Apache 2.0, about 260 MB) if a lawyer wants that.
- Not done: a planned second-opinion check of these licences did not finish. Nothing has been installed or run yet, so speed and accuracy are the publishers' numbers.

**Live selfie check: MediaPipe Face Landmarker (Apache 2.0), pinned to version 0.10.31.**
The server picks three random moves (for example turn left, open mouth, smile) and shows them one at a time. The browser sends short bursts of camera frames and the server checks that the moves really happened, in order, by one and the same face.

- Newer MediaPipe versions send usage numbers to Google and this cannot be switched off. Version 0.10.31 has no such code, and the face service is also cut off from the internet.
- It stops: a printed photo, a still picture on a phone, a single pre-recorded video.
- It does not stop: a fake camera feeding prepared video, or a live deepfake. No browser-only check can. This is an honest MVP-level check, not a certified one.

**The selfie: saved on local disk for now (testing only).**
Uploads come after the live check and must be compared with it. For testing, the owner chose to keep one reference selfie frame in local storage (encrypted like the photos, setting `SELFIE_STORE=disk`). The challenge frames are still dropped when the check ends, and face data (embeddings) is still never stored. Before real users, switch to `SELFIE_STORE=memory`: the frame then lives only in the face service's memory for up to 15 minutes.

**Image search.**
A `ReverseImageSearchProvider` interface with a `MockProvider` first, chosen by `IMAGE_SEARCH_PROVIDER`. The server never downloads result images; the browser shows thumbnails straight from the link the provider gives.

TinEye facts from its official docs (read 2026-11-11, double-checked by a second pass):
- Base URL `https://api.tineye.com/rest/`, one `X-API-KEY` header, no request signing.
- A free public sandbox key returns fake results, so the code can be tested without paying.
- Real results need a prepaid bundle. The smallest is US$200 for 5,000 searches.
- TinEye's general terms forbid showing its results in an app it has not approved. The owner should get TinEye's written OK before real users see real results.

**Username check.**
Sites are only requested when their robots.txt allows it. Of 33 sites kept from 46 examined:
- 19 are checked automatically, through an official API or the public profile address (GitHub, YouTube, Snapchat, Bluesky and others).
- 14 are shown as an "open this link and look yourself" row, because their robots.txt forbids automatic checks: Instagram, Facebook, Threads, X, TikTok, LinkedIn, Pinterest, Reddit, Tumblr, Telegram, Twitch, Linktree, OnlyFans, Steam.

**Photo storage.**
Each file is encrypted with AES-256-GCM using a key from `.env`. Local disk now, S3-compatible later, behind one interface. A timer inside the web server deletes photos older than 30 days; the list of result links stays until the account is deleted.

**Running it on this machine.**
The system disk is almost full, so the everyday command is `bash dev.sh`: PostgreSQL runs in Docker (the image is already here) and the web and face parts run directly from the project drive, with all their heavy files kept on that drive. `docker compose --profile full up` runs everything in Docker, for a machine with free disk space. The camera works on `http://localhost:3000` without HTTPS.

## Hard rules — how each is enforced and tested

| Rule | Enforced by | Test |
|---|---|---|
| Face match is 1-to-1 only; no face database | The face service can only compare an upload with that account's own live selfie. No route takes two arbitrary faces, enrols or searches faces. | Only the allowed routes exist; one account cannot use another's live session; no face-search library or face column anywhere. |
| Never compare against search results | The server never downloads result images. | Search and results code never calls the face service. |
| Compute, compare, throw away; no stored face data | Face data lives inside one request. The face service has a read-only file system. | After a full run, the database holds no face data; in `memory` mode nothing about the selfie is on disk; the reference frame is gone after time-out and after delete. |
| Match runs on the server; no search without a pass | A photo is saved only after it passes. Search accepts only a saved photo owned by the account. | Search for a rejected, unknown or someone else's photo is refused and the provider is called zero times. |
| Exactly one face, and it must match | Checked in the face service before anything is saved. | Zero or two faces are rejected; a rejected photo leaves no file and no record. |
| No scraping; robots.txt; rate limited | One small module is the only code allowed to call outside sites: fixed address list, robots.txt check, delay per site, status only. | An address not on the list is refused; a forbidden site becomes a link-only row; delays hold. |
| No signup or password-reset probing | The address list contains public profile paths only. | No listed address contains signup, login or reset paths. |
| Limits: 5 photos, 5 usernames, 20 searches a day | Counted in the database together with the action. | The 6th photo, 6th username and 21st search are refused; the count resets the next day. |
| Encrypt photos; delete after 30 days | The storage layer has no way to save unencrypted. | The stored file is not a readable image and a changed file fails to open; a 30-day-old photo is deleted and a 29-day-old one is kept. |
| No image or face data in logs | One logger that accepts only short listed fields. | Logs captured over a full run contain no image bytes and no face data. |
| Secrets in `.env` only | Settings are read in one place; `.env` is git-ignored. | Every setting the code reads is in `.env.example`; `.env` is not in git. |
| Nothing before consent | The server refuses live-check and upload routes until consent is recorded. | Those routes refuse, and the face service receives zero calls. |
| Camera only, random challenge | No file input for the selfie; the server picks the moves and the time window. | Still frames fail; a wrong move fails; an expired or reused session fails. |
| Delete my account wipes everything | One delete routine for files, records and the live session. | Afterwards: zero records, zero files, no session, cookie cleared. |

## Build order

1. Project setup, one-command run, database schema, anonymous account, `.env.example`.
2. Consent screen and live selfie check.
3. Photo upload with the match gate, encrypted storage, 5-photo limit.
4. Search with `MockProvider`, results dashboard with Mine / Fake / Ignore tags, 20-a-day limit.
5. Username check and official report links.
6. `TinEyeProvider` (docs re-read first), auto-delete job, account deletion.
7. Final check that every hard rule has a test, plus the README.

After each step: stop, say in plain words what was built and how to test it, and wait for "continue". Every change is committed and pushed.

## Owner's decisions

1. The reference selfie may be saved in local storage for now, for testing.
2. `bash dev.sh` is the everyday command; full Docker comes later.
3. Username check: 19 sites automatic, 14 link-only.

This plan is not legal advice. Face data is sensitive under privacy law in many places; a lawyer should review the consent wording and the model-licence weak spot before real users are let in.
