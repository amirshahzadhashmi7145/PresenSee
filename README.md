# PresenSee

Check your **own** online presence. You prove some photos are of you, then PresenSee finds where those exact photos appear on the web, so you can spot fake profiles using your pictures.

It is a self-check tool. It is not a tool to look up other people.

> **Status: local MVP.** There is no sign-up yet (an anonymous account is tied to your browser), so run it on your own machine only, not on the public internet. See [Before real users](#before-real-users).

## How it works

1. **Consent.** A plain-language screen says what is collected, why, and how to delete it. Nothing else works until you agree.
2. **Live selfie check.** Your camera opens and the server asks for 3 random moves (turn left, turn right, open mouth, smile). A still photo cannot pass.
3. **Upload photos or take them with your camera** (up to 5). Each must show exactly one face, and that face must match your live selfie. A photo that fails is rejected and never saved.
4. **Search.** Each accepted photo is sent to a reverse image search provider. You get the pages where it appears: link, site, thumbnail, match strength, and date when known.
5. **Your internet presence.** The results are rolled up into the profiles (platform and name) and websites that use your photos. This is worked out from the result links only; no page is visited.
6. **Tag** each result as Mine, Fake or Ignore. For Fake you get the official report page of that platform.
7. **Delete my account** wipes every photo, result and record right away.

## Run it

You need Docker, Node 22, pnpm 12, [uv](https://docs.astral.sh/uv/) and `openssl`.

```bash
bash dev.sh
```

Then open <http://localhost:3000>. Stop with Ctrl+C.

The first run creates `.env` from `.env.example` with fresh random secrets, downloads the three face models (about 43 MB, checked against pinned checksums), installs dependencies, and creates the database tables. The database runs in Docker; the web app and the face service run directly on your machine.

Use `localhost`, not your network address: browsers only allow the camera on `localhost` or HTTPS.

### Everything in Docker

```bash
bash full.sh
```

This builds two images (about 2.7 GB together). In this mode the face service has a read-only file system and no internet access. Do not run both modes at once: they use the same ports.

### Tests

```bash
bash test.sh
```

## Settings

All settings live in `.env` (never committed). `.env.example` lists every one.

| Setting | Meaning |
|---|---|
| `IMAGE_SEARCH_PROVIDER` | `mock` (made-up results, no key) or `tineye` (real search) |
| `TINEYE_API_KEY` | Your TinEye key. TinEye's docs print a free sandbox key that returns fixed sample results. |
| `SELFIE_STORE` | `disk` keeps one encrypted reference selfie in local storage (testing only). `memory` keeps it only in the face service's memory for 15 minutes. |
| `PHOTO_ENC_KEY_K1`, `PHOTO_ENC_ACTIVE_KEY_ID` | The key that encrypts stored photos |
| `FACE_SERVICE_SECRET` | Shared secret so only the web server can call the face service |

## The parts

- `web/` — Next.js 16 (App Router, TypeScript, Tailwind 4), Prisma 7, PostgreSQL 16. Pages plus the server routes that enforce every rule.
- `face/` — Python 3.12 FastAPI service. Counts faces, runs the live check, does the 1-to-1 match. Keeps nothing on disk.
- `storage/` — encrypted photos (git-ignored).

### Face models and licences

| Model | Job | Licence |
|---|---|---|
| OpenCV YuNet | find and count faces | MIT |
| OpenCV SFace | are two faces the same person | Apache 2.0 |
| MediaPipe Face Landmarker 0.10.31 | head turn and expression for the live check | Apache 2.0 |

All three allow commercial use. One open point: OpenCV has not published which photos SFace was trained on. Newer MediaPipe versions send usage numbers to Google, which is why the older version is pinned.

## The hard rules and where each is tested

| Rule | Test file |
|---|---|
| Face match is 1-to-1 only: no face database, never against other users | `face/tests/test_health.py` (allowed routes), `face/tests/test_match_api.py`, `face/tests/test_liveness_api.py` |
| Never compare faces against search results | `web/tests/search.test.ts` |
| Face data is computed, compared and thrown away; never stored | `web/tests/config.test.ts` (schema), `web/tests/liveness.test.ts`, `face/tests/test_match_api.py` |
| Selfie frames do not linger | `face/tests/test_liveness_api.py` |
| The match runs on the server; no search without a pass | `web/tests/photos.test.ts`, `web/tests/search.test.ts` |
| Exactly one face, and it must match; failures are never saved | `web/tests/photos.test.ts`, `face/tests/test_match_api.py` |
| A still photo cannot pass the live check | `face/tests/test_challenges.py` |
| Nothing before consent | `web/tests/liveness.test.ts`, `web/tests/photos.test.ts`, `web/tests/search.test.ts` |
| No scraping: the only outside call is the search provider's official API | `web/tests/report-links.test.ts`, `web/tests/tineye.test.ts` |
| Limits: 5 photos, 20 searches a day | `web/tests/photos.test.ts`, `web/tests/search.test.ts` |
| Stored photos are encrypted | `web/tests/storage.test.ts` |
| Photos are deleted after 30 days | `web/tests/retention.test.ts` |
| No image or face data in logs | `face/tests/test_liveness_api.py`, `face/tests/test_match_api.py`, `web/tests/tineye.test.ts` |
| Secrets live in `.env` only | `web/tests/config.test.ts` |
| Delete my account wipes everything | `web/tests/retention.test.ts` |

The brief's username check was removed by the owner: presence is found by photos only, so PresenSee collects no handles and requests no outside websites.

## Before real users

This list is what stands between the MVP and a public launch.

- **Add sign-up.** Without it, clearing cookies gives a new account and resets the limits.
- **Set `SELFIE_STORE=memory`.** The saved selfie on disk is a testing convenience.
- **TinEye.** Real results need a paid bundle (the smallest was US$200 for 5,000 searches in November 2026). TinEye's general terms forbid showing its results in an app it has not approved, so get its written OK first.
- **The live check is basic.** It stops a printed photo or a still on a phone. It does not stop a fake camera feeding prepared video or a live deepfake, and it has not been lab-tested.
- **Match strictness is untuned.** It uses OpenCV's published default and was tried on only a handful of real photos.
- **Legal review.** Face data is sensitive under privacy law in many places. A lawyer should review the consent wording, retention, and the SFace training-data point.
- **HTTPS and a real file store.** Storage sits behind one interface so an S3-compatible store can replace local disk.
