const apiBase = (process.env.DAILY_HOT_API_BASE || "https://api-hot.imsyy.top").replace(/\/$/, "");
const itemLimit = Number.parseInt(process.env.ITEMS_PER_SOURCE || "3", 10);
const sources = [
  ["微博热搜", "weibo"],
  ["知乎热榜", "zhihu"],
  ["哔哩哔哩热门", "bilibili"],
  ["36 氪热榜", "36kr"],
];

if (!Number.isInteger(itemLimit) || itemLimit < 1 || itemLimit > 10) {
  throw new Error("ITEMS_PER_SOURCE must be an integer between 1 and 10.");
}

async function fetchSource(name, path) {
  const response = await fetch(`${apiBase}/${path}?limit=${itemLimit}`, {
    headers: { "user-agent": "daily-hot-wechat/1.0" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  if (!Array.isArray(body.data)) {
    throw new Error("response does not contain a data array");
  }

  const items = body.data
    .filter((item) => typeof item?.title === "string" && typeof item?.url === "string")
    .slice(0, itemLimit);
  if (items.length === 0) {
    throw new Error("response contains no linkable items");
  }
  return { name, items };
}

function markdownLink(title, url) {
  return `[${title.replaceAll("[", "\\[").replaceAll("]", "\\]")}](${url.replaceAll(")", "%29")})`;
}

const settled = await Promise.allSettled(
  sources.map(([name, path]) => fetchSource(name, path)),
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
  throw new Error("All hot-list sources failed. No message was sent.");
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
const desp = `${sections.join("\n\n")}\n\n---\n数据来自公开热榜，仅供参考。`;
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
