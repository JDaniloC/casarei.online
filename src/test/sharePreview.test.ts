import { readFileSync } from "node:fs";
import path from "node:path";

const readRepoFile = (relativePath: string) =>
  readFileSync(path.resolve(process.cwd(), relativePath), "utf-8");

describe("preview de compartilhamento", () => {
  it("não referencia a og-image inexistente", () => {
    expect(readRepoFile("index.html")).not.toContain("og-image");
  });
});
