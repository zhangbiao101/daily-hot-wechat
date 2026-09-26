const itemLimit = Number.parseInt(process.env.ITEMS_PER_SOURCE || "5", 10);
const sources = [
  ["IT之家热门", "https://www.ithome.com/rss/"],
  ["Hacker News 热门", "https://news.ycombinator.com/rss"],
];

if (!Number.isInteger(itemLimit) || itemLimit < 1 || itemLimit > 10) {
  throw new Error("ITEMS_PER_SOURCE must be an integer between 1 and 10.");
}

function decodeXml(value) {
  return value
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .trim();
}

function element(xml, tag) {
  return xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1];
}

async function fetchSource(name, url) {
  const response = await fetch(url, {
    headers: { "user-agent": "daily-hot-wechat/1.1" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const items = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)]
    .map((match) => {
      const item = match[0];
      return {
        title: decodeXml(element(item, "title") || ""),
        url: decodeXml(element(item, "link") || ""),
      };
    })
    .filter((item) => item.title && item.url)
    .slice(0, itemLimit);
  if (items.length === 0) {
    throw new Error("RSS feed contains no linkable items");
  }
  return { name, items };
}

function markdownLink(title, url) {
  return `[${title.replaceAll("[", "\\[").replaceAll("]", "\\]")}](${url.replaceAll(")", "%29")})`;
}

const settled = await Promise.allSettled(
  sources.map(([name, url]) => fetchSource(name, url)),
);
const successful = settled
  .filter((result) => result.status === "fulfilled")
  .map((result) => result.value);
const failures = settled
  .map((result, index) => ({ result, name: sources[index][0] }))
  .filter(({ result }) => result.status === "rejected");

for (const { name, result } of failures) {
  console.warn(`${name} unavailable: ${result.reason.message}`);
}

if (successful.length === 0) {
  throw new Error("All digest sources failed. No message was sent.");
}

const date = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date()).replaceAll("/", "-");

const sections = successful.map(({ name, items }) => {
  const lines = items.map((item, index) => `${index + 1}. ${markdownLink(item.title, item.url)}`);
  return `## ${name}\n${lines.join("\n")}`;
});

if (failures.length > 0) {
  const names = failures.map(({ name }) => name).join("、");
  sections.push(`> 本次未获取：${names}`);
}

const title = `每日热榜 ${date}`;
const desp = `${sections.join("\n\n")}\n\n---\n数据来自公开 RSS，仅供参考。`;
const sendKey = process.env.SERVERCHAN_SENDKEY;

if (!sendKey) {
  console.log(JSON.stringify({ title, desp }, null, 2));
  process.exit(0);
}

const endpoint = sendKey.startsWith("sctp")
  ? `https://${sendKey.match(/^sctp(\d+)t/)?.[1]}.push.ft07.com/send/${sendKey}.send`
  : `https://sctapi.ftqq.com/${sendKey}.send`;

if (endpoint.includes("undefined")) {
  throw new Error("SERVERCHAN_SENDKEY has an invalid SC3 format.");
}

const pushResponse = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json;charset=utf-8" },
  body: JSON.stringify({ title, desp }),
});
const pushResult = await pushResponse.json();
if (!pushResponse.ok || pushResult.code !== 0) {
  throw new Error(`ServerChan rejected the message: ${JSON.stringify(pushResult)}`);
}

console.log(`Sent ${title} with ${successful.length} source(s).`);
