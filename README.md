# Daily Hot WeChat

Every day at 08:00 Asia/Shanghai, GitHub Actions gathers popular links from
Weibo, Zhihu, Bilibili, and 36Kr, then sends a Markdown digest through ServerChan.

## Deploy

1. Create a new GitHub repository and push this directory to it.
2. In the repository, open **Settings -> Secrets and variables -> Actions**.
3. Create the secret `SERVERCHAN_SENDKEY` using the SendKey from ServerChan.
4. Open **Actions**, select `Daily hot list to WeChat`, and run it once with
   **Run workflow** to verify delivery.

The scheduled run is `00:00 UTC`, which is 08:00 in China Standard Time. Change
the cron expression in `.github/workflows/daily-hot.yml` to use another time.

## Local verification

Run `npm run digest` without a SendKey to print the generated message. To send
locally, set `SERVERCHAN_SENDKEY` in your environment first. Never commit it.

## Configuration

- `ITEMS_PER_SOURCE`: entries per source, from 1 to 10. Default: 3.
- `DAILY_HOT_API_BASE`: DailyHotApi base URL. Default: `https://api-hot.imsyy.top`.

If one source is temporarily unavailable, the digest is still sent using the
remaining sources. The run fails only when every source fails.
