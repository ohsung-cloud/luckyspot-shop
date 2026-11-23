/**
 * 자체 검증용 목(mock) 포털 서버.
 *
 * `--mock` 실행에서만 뜬다. 로컬 127.0.0.1 에 fixtures/mock-portal 을 올리고,
 * 로얄선즈 재고 JSON(`/api/loyal/inventory`)을 함께 제공한다.
 * 실제 사이트로 나가는 요청은 없다.
 */

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const INVENTORY = {
  code: 0,
  data: {
    slots: [
      { slot: "파우더 박스1", material: "바닐라", remainRate: 970.86 },
      { slot: "파우더 박스2", material: "우유", remainRate: 1849.29 },
      { slot: "파우더 박스3", material: "초코", remainRate: 924.0 },
      { slot: "파우더 박스4", material: "얼그레", remainRate: 972.0 },
      { slot: "연동 펌프3", material: "사과시럽", remainRate: 0 },
      { slot: "범용 재료 상자2", material: "어두", remainRate: 0 },
      { slot: "컵 슬롯1", material: "투명컵", remainRate: 53.6 },
    ],
  },
};

export async function startMockPortals({ port = 0 } = {}) {
  const escal = await readFile(path.join(here, "../fixtures/mock-portal/escal.html"), "utf8");
  const loyal = await readFile(path.join(here, "../fixtures/mock-portal/loyal.html"), "utf8");

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/escal" || url.pathname === "/escal/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(escal);
      return;
    }

    if (url.pathname === "/loyal" || url.pathname === "/loyal/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(loyal);
      return;
    }

    if (url.pathname === "/api/loyal/inventory") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(INVENTORY));
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const origin = `http://127.0.0.1:${actualPort}`;

  return {
    origin,
    baseUrls: { escalprint: `${origin}/escal/`, loyalsuns: `${origin}/loyal/` },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
